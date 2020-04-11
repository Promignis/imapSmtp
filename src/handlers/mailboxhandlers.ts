import mongoose from 'mongoose'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { to } from '../utils'
import { IMailboxDoc } from '../db/mailboxes'

// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function getAllForUser(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify
        // IMPORTANT! This is temp. Remove once auth is intigrated
        let user: any = req.user

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }

        let addressId: mongoose.Types.ObjectId = user.primeAddress

        if (req.body && req.body.id) {
            addressId = mongoose.Types.ObjectId(req.body.id)
        }

        let resp: any = {
            mailboxes: []
        }
        let replyCode = HTTP_STATUS.OK

        let query = {
            filter: {
                user: user._id,
                address: addressId
            },
            projection: '_id name stats.total stats.unseen stats.size'
        }

        let err: any
        let mailboxes: IMailboxDoc[] | undefined

        [err, mailboxes] = await to(fastify.services.mailboxService.findMailboxes({}, query))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }
        if (mailboxes!.length == 0) {
            replyCode = HTTP_STATUS.NOT_FOUND
        }
        // Build the payload 
        mailboxes!.forEach((mb: any) => {
            resp.mailboxes.push({
                id: mb._id.toString(),
                name: mb.name,
                total: mb.stats.total,
                unseen: mb.stats.unseen,
                size: mb.stats.size
            })
        })

        reply
            .code(replyCode)
            .send(resp)
    }
}