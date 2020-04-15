import fastifyPlugin from 'fastify-plugin'
const kMultipart = Symbol('multipart')
import fileUpload from 'express-fileupload'

function setMultipart(req: any, done: Function) {
    req[kMultipart] = true
    done()
}

// Handle attachment upload
function fileHandler(fastify: any, opts: any, done: Function) {
    fastify.addContentTypeParser('multipart', setMultipart)

    let options = {
        limits: { fileSize: 10 * 1024 * 1024 }, // MAX file size
        useTempFiles: true,
        tempFileDir: '/tmp/bizgaze'
    }

    fastify.use(fileUpload(options))

    fastify.addHook('preValidation', (request: any, reply: any, done: Function) => {
        if (request.raw && request.raw.body) {
            !request.body && (request.body = request.raw.body || {})
        }

        for (const key in request.raw.files) {
            request.body[key] = request.raw.files[key]
        }

        done()
    })
    done()
}

export const fileHandlerPlugin = fastifyPlugin(fileHandler)