const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')
const ps = require('promisify-call')
const pcli = require('grpc-promise')
var libmime = require('libmime');
const uuidv4 = require('uuid/v4');
var mime = require('mime-types')

exports.setupProtoClient = function (server, next) {
    const plugin = this;
    const proto = protoLoader.loadSync(path.join(process.cwd(), "../", "src/proto/mail.proto"))
    const definition = grpc.loadPackageDefinition(proto);
    const mailService = definition.MailService
    // TODO: move the connection host and port data to config and remove hardcoding
    plugin.grpcClient = new mailService("0.0.0.0:50051", grpc.credentials.createInsecure())
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
        addresses: []
    };
    next();
}

exports.hook_data = function (next, connection) {
    let plugin = this
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

exports.hook_data_post = function (next, connection) {
    if (connection.transaction.notes.attachment.todo_count > 0) {
        // still have attachment hooks running, so wait for it to complete
        connection.transaction.notes.attachment.next = next;
    }
    else {
        next();
    }
}

exports.hook_rcpt = function (next, connection, params) {
    // Outbound
    if (connection.relaying) {
        next()
    }

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
                addresses.push(address)
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

exports.hook_rcpt_ok = function (next, connection, params) {
    next()
}

exports.hook_queue = function (next, connection, params) {
    let plugin = this
    const transaction = connection.transaction
    connection.loginfo("inside queue")
    next()
}

/**
 * Plugin Helper methods
 */

const extractBody = (body, headers = false) => {
    return {
        headers: headers ? body.header : "",
        is_html: body.is_html,
        content_type: processContentType(body.ct),
        body_encoding: body.body_encoding,
        body_text: body.bodytext,
        children: body.children.map((body) => extractBody(body, true))
    }
}

function processContentType(headerValue) {
    let data = {
        value: '',
        type: '',
        subtype: '',
        params: {}
    };
    let match;
    let processEncodedWords = {};

    (headerValue || '').split(';').forEach((part, i) => {
        let key, value;
        if (!i) {
            data.value = part.trim();
            data.subtype = data.value.split('/');
            data.type = (data.subtype.shift() || '').toLowerCase();
            data.subtype = data.subtype.join('/');
            return;
        }
        value = part.split('=');
        key = (value.shift() || '').trim().toLowerCase();
        value = value.join('=').replace(/^['"\s]*|['"\s]*$/g, '');

        // Do not touch headers that have strange looking keys
        if (/[^a-zA-Z0-9\-*]/.test(key) || key.length >= 100) {
            return;
        }

        // This regex allows for an optional trailing asterisk, for headers
        // which are encoded with lang/charset info as well as a continuation.
        // See https://tools.ietf.org/html/rfc2231 section 4
        // TODO: This does not take into accont the case when Character set and language
        // information may be combined with the parameter continuation mechanism (4.1)
        // Add that if its needed. Wild duck does not do it.
        if ((match = key.match(/^([^*]+)\*(\d)?\*?$/))) {
            if (!processEncodedWords[match[1]]) {
                processEncodedWords[match[1]] = [];
            }
            processEncodedWords[match[1]][Number(match[2]) || 0] = value;
        } else {
            data.params[key] = value;
        }
        data.hasParams = true;
    });

    // convert extended mime word into a regular one
    Object.keys(processEncodedWords).forEach(key => {
        let charset = '';
        let value = '';
        processEncodedWords[key].forEach(val => {
            let parts = val.split("'"); // eslint-disable-line quotes
            charset = charset || parts.shift();
            value += (parts.pop() || '').replace(/%/g, '=');
        });
        data.params[key] = '=?' + (charset || 'ISO-8859-1').toUpperCase() + '?Q?' + value + '?=';
    });

    return data;
}

function start_att(connection, ct, fn, body, stream, grpcClient) {
    connection.loginfo("fn:", fn)
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
    let contentType = libmime.parseHeaderValue(attachmentHeaders['content-type'][0] || 'application/octet-stream') // If content type is not found then default to application/octet-stream
    let contentDsiposition
    // If content disposition is not present then default it to 'attachment'
    // refer: https://tools.ietf.org/html/rfc6266
    if (attachmentHeaders['content-disposition']) {
        contentDsiposition = libmime.parseHeaderValue(attachmentHeaders['content-disposition'][0] || 'attachment')
    } else {
        contentDsiposition = libmime.parseHeaderValue('attachment')
    }
    let contentTransferEncoding = attachmentHeaders['content-transfer-encoding'][0] || '' // Can't default, if not present the transfer encoding was unknown
    // eg. [ '<ii_k6kzsw380>' ]. Remove < and >
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
    } else if (contentDsiposition.params && contentDsiposition.params.name) {
        // try to get name from the content disposition header
        fileName = contentDsiposition.params.name
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
        contentDsiposition,
        contentTransferEncoding,
    }

    const txn = connection.transaction;

    let addresses = txn.notes.targets.addresses

    let unique = new Set()

    addresses.forEach(a => {
        unique.add(a)
    })

    let count = unique.size

    connection.loginfo(addresses, " : ", unique)

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

    stream.on('data', function (d) {
        call.sendMessage({ chunk: d })
    })

    stream.on('end', function () {
        call.end()
            .then(res => {
                let id = res.id
                attachment['id'] = id
                txn.notes.attachment.attachments.push(attachment)
                txn.notes.attachment.todo_count--;
                connection.loginfo('attach data: ', attachment)
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
