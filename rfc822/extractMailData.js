const crypto = require('crypto')
var libqp = require('libqp')

// ? why the fuck are we even doing this shit????
const MAX_HTML_PARSE_LENGTH = 2 * 1024 * 1024; // do not parse HTML messages larger than 2MB to plaintext

function leftPad(val, chr, len) {
    return chr.repeat(len - val.toString().length) + val;
}

function expectedB64Size(b64size) {
    b64size = Number(b64size) || 0
    if (!b64size || b64size <= 0) {
        return 0
    }

    let newlines = Math.floor(b64size / 78)
    return Math.ceil(((b64size - newlines * 2) / 4) * 3)
}

// This takes the parsed MimeTree and removes all the attachment node bodies from it (Reduced-MimeTree)
// extracts mail text/html and creates a flattened representation of the attachment nodes of the MimeTree
/**
 * Response structure
 * MailData{
 *      nodes: [
 *          { 
 *              attachmentId: string
                contentType: string
                transferEncoding: string
                lineCount: number
                body: buffer
            }
 *      ],
 *      attachments: [
 *          {
 *              id: stirng,
                filename: string
                contentType: string
                disposition: string
                transferEncoding: string
                related: bool
                contentId: string
                sizeKb: number
 *          }
 *      ],
 *      text: string
 *      html: string
 * }
 *  
 */
const getMaildata = function (mimeTree) {
    let maildata = {
        nodes: [],
        attachments: [],
        text: '',
        html: []
    }

    let idcount = 0
    let htmlContent = []
    let textContent = []

    let walk = (node, alternative, related) => {
        let flowed = false
        let delSp = false

        let parsedContentType = node.parsedHeader['content-type']
        let parsedDisposition = node.parsedHeader['content-disposition']
        let transferEncoding = (node.parsedHeader['content-transfer-encoding'] || '7bit').toLowerCase().trim()
        let contentId = (node.parsedHeader['content-id'] || '')
            .toString()
            .replace(/<|>/g, '')
            .trim()

        let contentType = ((parsedContentType && parsedContentType.value) || (node.rootNode ? 'text/plain' : 'application/octet-stream'))
            .toLowerCase()
            .trim()

        alternative = alternative || contentType === 'multipart/alternative'
        related = related || contentType === 'multipart/related'

        // for  parameter format=flowed
        // refer rfc2646
        // A value of flowed indicates that the definition of flowed text to represent paragraphs
        if (parsedContentType && parsedContentType.params.format && parsedContentType.params.format.toLowerCase().trim() === 'flowed') {
            flowed = true
            // refer rfc3676
            // In the presence of this parameters, trailing whitespace is used to indicate flowed lines and
            // a canonical quote indicator is used to indicate quoted lines.
            if (parsedContentType.params.delsp && parsedContentType.params.delsp.toLowerCase().trim() === 'yes') {
                delSp = true
            }
        }

        let disposition = ((parsedDisposition && parsedDisposition.value) || '').toLowerCase().trim() || false
        let isInlineText = false
        let isMultipart = contentType.split('/')[0] === 'multipart'


        // If the current node is HTML or Plaintext then allow larger content included in the mime tree
        if (
            ['text/plain', 'text/html', 'text/rfc822-headers', 'message/delivery-status'].includes(contentType) &&
            (!disposition || disposition === 'inline')
        ) {
            isInlineText = true
            if (node.body && node.body.length) {
                let charset = parsedContentType.params.charset || 'windows-1257'
                let content = node.body

                //  if the text is encoded, then decode it to ascii
                if (transferEncoding === 'base64') {
                    content = libbase64.decode(content.toString())
                } else if (transferEncoding === 'quoted-printable') {
                    //Quoted-Printable, or QP encoding, is a binary-to-text encoding system 
                    // using printable ASCII characters (alphanumeric and the equals sign =) to transmit 8-bit data
                    // over a 7-bit data path
                    content = libqp.decode(content.toString())
                }

                if (
                    !['ascii', 'usascii', 'utf8'].includes(
                        charset
                            .replace(/[^a-z0-9]+/g, '')
                            .trim()
                            .toLowerCase()
                    )
                ) {
                    try {
                        content = iconv.decode(content, charset)
                    } catch (E) {
                        // Some unknown charset
                        // do not decode
                    }
                }

                if (flowed) {
                    content = libmime.decodeFlowed(content.toString(), delSp)
                } else {
                    content = content.toString()
                }

                if (contentType === 'text/html') {
                    htmlContent.push(content.trim())
                    if (!alternative) {
                        try {
                            if (content && content.length < MAX_HTML_PARSE_LENGTH) {
                                let text = htmlToText.fromString(content)
                                textContent.push(text.trim())
                            }
                        } catch (E) {
                            // ignore
                        }
                    }
                } else {
                    textContent.push(content.trim())
                    if (!alternative) {
                        htmlContent.push(textToHtml(content))
                    }
                }
            }
        }

        // remove attachments from the mime tree 
        // as attachment's will be stored in separately
        if (!isMultipart && node.body && node.body.length && !isInlineText) {
            let attachmentId = `ATT${leftPad(++idcount, '0', 5)}`

            let filename =
                (node.parsedHeader['content-disposition'] &&
                    node.parsedHeader['content-disposition'].params &&
                    node.parsedHeader['content-disposition'].params.filename) ||
                (node.parsedHeader['content-type'] && node.parsedHeader['content-type'].params && node.parsedHeader['content-type'].params.name) ||
                false

            if (filename) {
                try {
                    filename = libmime.decodeWords(filename).trim()
                } catch (E) {
                    // failed to parse filename, keep as is (most probably an unknown charset is used)
                }
            } else {
                filename = crypto.randomBytes(4).toString('hex') + '.' + libmime.detectExtension(contentType)
            }

            // push to queue
            maildata.nodes.push({
                attachmentId,
                contentType,
                transferEncoding,
                lineCount: node.lineCount,
                body: node.body
            })

            // do not include text content and multipart elements in the attachment list
            if (!isInlineText && !/^(multipart)\//i.test(contentType)) {
                // list in the attachments array
                maildata.attachments.push({
                    id: attachmentId,
                    filename,
                    contentType,
                    disposition,
                    transferEncoding,
                    related,
                    contentId,
                    // approximite size in kilobytes
                    sizeKb: Math.ceil((transferEncoding === 'base64' ? expectedB64Size(node.size) : node.size) / 1024)
                })
            }

            node.body = false
            node.attachmentId = attachmentId // To reference the extracted attachment
        }

        // content-type message/rfc822
        if (node.message) {
            node = node.message
        }

        // Do this recursively for all child nodes too
        if (Array.isArray(node.childNodes)) {
            node.childNodes.forEach(childNode => {
                walk(childNode, alternative, related)
            })
        }
    }

    walk(mimeTree, false, false)

    return maildata
}

module.exports = getMaildata