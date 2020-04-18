const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')
const fs = require('fs')
const ps = require('promisify-call')
const pcli = require('grpc-promise')
var libmime = require('libmime');
const uuidv4 = require('uuid/v4')
var mime = require('mime-types')
var addrparser = require('address-rfc2822')
var rfcHelpers = require('../../rfc822')
const parse = rfcHelpers.parseMIME
const getMaidData = rfcHelpers.extractMailData
const createBodyStructure = rfcHelpers.createIMAPBodyStructure
const createEnvelope = rfcHelpers.createIMAPEnvelop


exports.setupProtoClient = function (server, next) {
    const plugin = this;
    const proto = protoLoader.loadSync(path.join(process.cwd(), "../", "src/proto/mail.proto"))
    const definition = grpc.loadPackageDefinition(proto);
    const mailService = definition.MailService
    // TODO: move the connection host and port data to config and remove hardcoding
    let cred = grpc.credentials.createSsl(
        fs.readFileSync(path.join(process.cwd(), "../", "grpc_root_cert", "bizgaze.root.crt")),
        fs.readFileSync(path.join(process.cwd(), "../", "grpc_root_cert", "client.key")),
        fs.readFileSync(path.join(process.cwd(), "../", "grpc_root_cert", "client.crt")),
    )
    plugin.grpcClient = new mailService("localhost:50051", cred)
    next()
}

exports.register = function () {
    const plugin = this;
    plugin.logdebug('Initializing Bizgaze Plugin.', plugin);
    plugin.register_hook('init_master', 'init_bizgaze_shared');
    plugin.register_hook('init_child', 'init_bizgaze_shared');
};

exports.init_bizgaze_shared = function (next, server) {
    const plugin = this;
    plugin.setupProtoClient(server, next);
};


// Register Plugins

exports.hook_mail = function (next, connection, params) {
    const tnx = connection.transaction;
    // tnx.notes.id = new ObjectID();
    tnx.notes.targets = {
        addresses: new Set()
    };
    next();
}

exports.hook_data = function (next, connection) {
    let plugin = this
    if (connection.relaying) {
        next()
    } else {
        connection.transaction.parse_body = true;

        connection.transaction.notes.attachment = {
            todo_count: 0,
            attachments: []
        }

        connection.transaction.attachment_hooks(
            function (ct, fn, body, stream) {
                start_att(connection, ct, fn, body, stream, plugin.grpcClient)
            }
        );
        next();
    }

}

exports.hook_data_post = function (next, connection) {
    if (connection.relaying) {
        next()
    } else {
        if (connection.transaction.notes.attachment.todo_count > 0) {
            // still have attachment hooks running, so wait for it to complete
            connection.transaction.notes.attachment.next = next;
        }
        else {
            next();
        }
    }
}

exports.hook_rcpt = function (next, connection, params) {
    // Outbound
    if (connection.relaying) {
        next(OK)
    } else {
        let rcpt = params[0];
        const tnx = connection.transaction;

        let { addresses } = tnx.notes.targets

        // Using * is not allowed in addresses
        if (/\*/.test(rcpt.user)) {
            next(DENYSOFT, "No such User");
        }

        // Check if address is valid
        let address = `${rcpt.user}@${rcpt.host}`
        // TODO: Add logging
        ps(this.grpcClient, this.grpcClient.checkValidity, { address: address })
            .then(resp => {
                if (resp.valid) {
                    addresses.add(address)
                    next(OK, "Rcpt successful")
                } else {
                    next(DENY, "No Such User")
                }
            })
            .catch(e => {
                connection.logerror(`Error validating address: ${e.toString()}`)
                next(DENY, `Error processing the email with address ${address}`)
            })
    }
}

exports.hook_rcpt_ok = function (next, connection, params) {
    next()
}

exports.hook_queue = function (next, connection, params) {

    const txn = connection.transaction
    const body = txn.body
    const header = txn.header
    let attachments = txn.notes.attachment.attachments

    // get_data calls the callback once the complete raw mail has been buffered in memory
    txn.message_stream.get_data(async (buffer) => {
        try {
            let parsedMime
            // Parse it
            try {
                parsedMime = parse(buffer)
            } catch (e) {
                // If error parsing it, then deny the request
                connection.logerror(`Error Parsing email: ${e.toString()}`)
                next(DENY, `Error processing the email.`)
            }
            // Extract attachment data out
            let md = getMaidData(parsedMime, true)

            let attachmentMap = {}

            for (let i = 0; i < md.nodes.length; i++) {
                attachmentMap[md.nodes[i].attachmentId] = attachments[i].id
            }

            for (let i = 0; i < md.attachments; i++) {
                attachments[i]['related'] = md.attachments[i].related
            }


            // Add reference to stored attachments in the parsed mime tree
            // to rebuild the orignal email later
            parsedMime['attachmentMap'] = attachmentMap

            let text = md.text
            let html = md.html

            const rcptTo = txn.rcpt_to.map((r) => {
                let add = {}
                // will convert "<a@a.com>" to  "a@a.com"
                add['original'] = addrparser.parse(r.original)[0].address
                add['originalHost'] = r.original_host
                add['host'] = r.host
                add['user'] = r.user
                return add
            })

            const headerTuples = Object.keys(header.headers_decoded).reduce((acc, key) => {
                let value = header.headers_decoded[key]
                if (value.length > 1) {
                    value = value.join("\n")
                } else {
                    value = value[0]
                }
                acc[key] = value
                return acc
            }, {})

            let info = {}
            Object.keys(headerTuples).map(key => {

                // takes the value: 'name <address@a.com>, name2 <address2@a.com>'
                // and converts it to
                // [{name: name, address: address@a.com},{name: name2, address: address2@a.com}]
                // Note: Bcc header is mostly never present.
                if (['from', 'to', 'cc', 'bcc'].includes(key)) {
                    info[key] = addrparser.parse(headerTuples[key]).map(adr => {
                        return adr.address
                    })
                }
            })

            let addresses = txn.notes.targets.addresses

            // Build payload
            let mailData = {
                uniquercpt: Array.from(addresses),
                size: txn.data_bytes, // Total size of the email,
                parsedHeaders: headerTuples,
                attachments: attachments,
                from: info.from,
                to: info.to,
                cc: info.cc || [],
                bcc: info.bcc || [],
                rcptTo: rcptTo,
                meta: {},
                text,
                html,
                stringifiedMimeTree: JSON.stringify(parsedMime)
            }

            // Call grpc
            ps(this.grpcClient, this.grpcClient.saveInbound, mailData)
                .then(resp => {
                    // Response is empty in case of successfull saving
                    next(OK)
                })
                .catch(e => {
                    connection.logerror(`Error Saving email: ${e.toString()}`)
                    next(DENY, `Error processing the email.`)
                })
        } catch (e) {
            connection.logerror(`Error : ${e.toString()}`)
            next(DENY, `Error processing the email.`)
        }
    })
}

/**
 * Plugin Helper methods
 */

const extBody = (body) => {
    // If any one of the parent nodes is of type 'multipart/related' and the content-id header is present
    // then that attachment should be marked as related
    let hasRelatedNode = false

    const headersToExtract = [
        {
            headerName: 'content-type',
            proto: 'contentType'
        },
        {
            headerName: 'content-description',
            proto: 'contentDescription'
        },
        {
            headerName: 'content-disposition',
            proto: 'contentDisposition'
        },
        {
            headerName: 'content-transfer-encoding',
            proto: 'contentTransferEncoding'
        },
        {
            headerName: 'content-id',
            proto: 'contentId'
        },
    ]

    function extract(body, extractHeaders = false) {
        let headers = {}
        if (extractHeaders) {
            headersToExtract.forEach(header => {
                if (body.header.headers_decoded[header.headerName] && body.header.headers_decoded[header.headerName][0]) {
                    if (header.headerName == 'content-type' || header.headerName == 'content-description' || header.headerName == 'content-disposition') {
                        headers[header.proto] = libmime.parseHeaderValue(body.header.headers_decoded[header.headerName][0])
                    } else if (header.headerName == 'content-transfer-encoding') {
                        headers[header.proto] = body.header.headers_decoded[header.headerName][0]
                    } else {
                        headers[header.proto] = body.header.headers_decoded[header.headerName][0].trim()
                            .replace(/^<|>$/g, '')
                            .trim()
                    }
                }
            })
        } else {
            headers['root'] = true
        }

        let isHTML = body.is_html

        let contentType = libmime.parseHeaderValue(body.ct)

        if (contentType.value == 'multipart/related') {
            hasRelatedNode = true
        }

        let bodyEncoding = body.body_encoding

        let bodyContent = body.bodytext

        let children = body.children.map((body) => extract(body, true))

        return {
            headers,
            isHTML,
            contentType,
            bodyEncoding,
            bodyContent,
            children
        }
    }

    // For the root node don't extract headers
    let parsedBody = extract(body, false)

    return {
        hasRelatedNode,
        parsedBody
    }
}

function start_att(connection, ct, fn, body, stream, grpcClient) {
    // Parse the header values
    let attachmentHeaders = body.header.headers_decoded
    /**
     * Coverts 'text/plain; charset="US-ASCII"; name="something.txt"' to
     * {
     *      value: 'text/plain',
     *      params: {
     *          charset:"US-ASCII"
     *          name="something.txt"
     *      }
     * }
     */

    // If content type header does not exist then smtp server will implicltly ignore the attachment
    // If content type header exists but is maybe empty then default value is used
    let contentType = libmime.parseHeaderValue(attachmentHeaders['content-type'][0] || 'application/octet-stream') // If content type is not found then default to application/octet-stream

    let contentDisposition
    // If content disposition is not present then default it to 'attachment'
    // refer: https://tools.ietf.org/html/rfc6266
    if (attachmentHeaders['content-disposition']) {
        contentDisposition = libmime.parseHeaderValue(attachmentHeaders['content-disposition'][0] || 'attachment')
    } else {
        contentDisposition = libmime.parseHeaderValue('attachment')
    }

    let contentTransferEncoding
    if (attachmentHeaders['content-transfer-encoding']) {
        // Can't default, if not present the transfer encoding was unknown
        contentTransferEncoding = attachmentHeaders['content-transfer-encoding'][0] || ''
    } else {
        contentTransferEncoding = ''
    }

    // eg. content-id: [ '<ii_k6kzsw380>' ]. Remove < and >
    let contentId
    if (attachmentHeaders['content-id']) {
        contentId = attachmentHeaders['content-id'][0] ?
            attachmentHeaders['content-id'][0].trim()
                .replace(/^<|>$/g, '')
                .trim()
            : "" // Should not default. If not present means its unknown
    } else {
        contentId = ""
    }

    let fileName
    if (fn && fn !== "") {
        fileName = fn
    } else if (contentType.params && contentType.params.name) {
        // If for some reason file name not given by haraka parser then try to get name from the content type header
        fileName = contentType.params.name
    } else if (contentDisposition.params && contentDisposition.params.name) {
        // try to get name from the content disposition header
        fileName = contentDisposition.params.name
    } else {
        // Create a new name
        let name = uuidv4()
        // Guess the extension by content type or defaults to bin
        let extension = mime.extension(contentType.value)
        fileName = `${name}.${extension}`
    }

    let attachment = {
        fileName,
        contentType,
        contentDisposition,
        contentTransferEncoding,
        contentId
    }

    const txn = connection.transaction;

    let addresses = txn.notes.targets.addresses

    let count = addresses.size

    function next() {
        if (attachments_still_processing(txn)) return;
        txn.notes.attachment.next();
    }

    txn.notes.attachment.todo_count++;

    stream.connection = connection
    stream.pause()

    // Promisify and call grpc client
    let meta = new grpc.Metadata();
    meta.add('filename', attachment.fileName);
    meta.add('contenttype', attachment.contentType.value);
    meta.add('count', String(count)); // Protobuf metadata can only be of type string or buffer

    pcli.promisify(grpcClient, 'uploadAttachment', { metadata: meta })

    stream.resume()

    let call = grpcClient.uploadAttachment()
    let size = 0

    stream.on('data', function (d) {
        size += d.length
        call.sendMessage({ chunk: d })
    })

    stream.on('end', function () {
        call.end()
            .then(res => {
                let id = res.id
                attachment['id'] = id
                attachment['size'] = size
                txn.notes.attachment.attachments.push(attachment)
                txn.notes.attachment.todo_count--;
                next();
            })
            .catch(err => {
                txn.notes.attachment.todo_count--;
                connection.logerror(err.message)
                next(DENY, 'Error processing the email');
            })
    })
}

function attachments_still_processing(txn) {
    if (txn.notes.attachment.todo_count > 0) return true;
    if (!txn.notes.attachment.next) return true;
    return false;
}
