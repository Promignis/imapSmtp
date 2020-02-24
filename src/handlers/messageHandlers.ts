import mongoose from 'mongoose'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { PaginationOpts, FindQuery } from '../types/types'
import { to, validEmail } from '../utils'
import fs from 'fs'
import util from 'util'
const unlinkAsync = util.promisify(fs.unlink)
// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function getPaginatedMessages(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify

        let user: any = req.userObj

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        let addressId: mongoose.Types.ObjectId = user.primeAddress
        let mailboxId: mongoose.Types.ObjectId = mongoose.Types.ObjectId(req.body.id)

        if (req.body.addressId) {
            addressId = mongoose.Types.ObjectId(req.body.addressId)
        }

        let resp: any = {}

        let replyCode = HTTP_STATUS.OK

        let q: FindQuery = {
            filter: {
                user: user._id,
                address: addressId,
                mailbox: mailboxId
            }
        }

        let opts: PaginationOpts = {
            limit: req.body.limit || 20,
            query: q,
            previous: req.body.previous,
            next: req.body.next,
            ascending: req.body.ascending
        }

        let err: any
        let res: any

        [err, res] = await to(fastify.services.messageService.getPaginatedMessages({}, opts))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        // Maybe flatten the output structure
        resp = res

        reply
            .code(replyCode)
            .send(resp)
    }
}

export function getThreadedMessages(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify

        let user: any = req.userObj

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        let addressId: mongoose.Types.ObjectId = user.primeAddress
        let threadId: mongoose.Types.ObjectId = mongoose.Types.ObjectId(req.body.id)

        if (req.body.addressId) {
            addressId = mongoose.Types.ObjectId(req.body.addressId)
        }

        let resp: any = {}

        let replyCode = HTTP_STATUS.OK

        let messageQuery: FindQuery = {
            filter: {
                user: user._id,
                address: addressId,
                thread: threadId
            },
            projection: 'messageId from to cc bcc parsedHeaders attachments hasAttachments flags body thread'
        }


        let err: any
        let res: any

        // TODO: Maybe some message threads are really big, with over 100 messages. In that case we should have
        // count get the thread , count the references array and figure out the size first. If too big, say >100 
        // then paginate instead of find

        [err, res] = await to(fastify.services.messageService.findMessages({}, messageQuery))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        // Maybe flatten the output message structure
        resp = { messages: res }

        reply
            .code(replyCode)
            .send(resp)
    }
}

export function outboundMessage(fastify: any): any {
    return async (req: any, res: any) => {
        let f: any = fastify

        let cleanupTemp = async (fileNames: string[]) => {

            for (let i = 0; i < fileNames.length; i++) {
                try {
                    await unlinkAsync(fileNames[i])
                } catch (err) {
                    throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.messages, err.name || INT_ERRORS.SERVER_ERR)
                }
            }

        }

        let tempFilePaths: string[] = []
        let truncatedFileNames: string[] = []

        // Check if any files were larger than the allowed size
        if (req.body.files) {
            /**
             * File Object is of shape
             * 
             * name: 'test1mb.txt',
             * data: <Buffer >,
             * size: 1242880,
             * encoding: '7bit',
             * tempFilePath: '/tmp/bizgaze/tmp-1-1582566950268',
             * truncated: false,
             * mimetype: 'text/plain',
             * md5: '526314450985ff1b016eec41be663239',
             */
            let files: any[] = []

            if (Array.isArray(req.body.files)) {
                files = req.body.files
            } else {
                files.push(req.body.files)
            }

            for (let i = 0; i < files.length; i++) {
                tempFilePaths.push(files[i].tempFilePath)
                if (files[i].truncated) {
                    truncatedFileNames.push(files[i].name)
                }
            }
        }

        let user: any = req.userObj
        let validations: any = []

        if (req.validationError) {
            validations = req.validationError.validation
        }

        // Validations
        // If option is reply or forward then parentId is needed
        if (req.body.action == 'reply' || req.body.action == 'forward') {
            if (!req.body.parentId) {
                validations.push({
                    dataPath: `parentId`,
                    message: 'is not available'
                })
            }
        }

        // to, cc , bcc should have proper emails
        const fields: string[] = ['cc', 'to', 'bcc']
        fields.forEach(function (field: string) {
            if (req.body[field]) {
                if (Array.isArray(req.body[field])) {
                    req.body[field].forEach(function (mail: string) {
                        if (!validEmail(mail)) {
                            validations.push({
                                dataPath: `${field}:${mail}`,
                                message: 'Invalid email address'
                            })
                        }
                    })
                } else {
                    if (!validEmail(req.body[field])) {
                        validations.push({
                            dataPath: `${field}:${req.body[field]}`,
                            message: 'Invalid email address'
                        })
                    }
                }
            }
        })


        //If file sizes crossed limit add them to validations
        truncatedFileNames.forEach(function (fn: string) {
            validations.push({
                dataPath: `files: ${fn}`,
                message: 'crossed size limit'
            })
        })

        if (validations.length != 0) {
            await cleanupTemp(tempFilePaths)
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                validations,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        // upload file
        // thread and save message to sent
        // add to queue
        // await cleanupTemp(tempFilePaths)

        res.send({})
    }
}