import mongoose from 'mongoose'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { UserCreateOpts, UserProfile } from '../types/types'
import { to } from '../utils'
import { mongoosePlugin } from '../db/connection'




// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function getAllForUser(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify
        // IMPORTANT! This is temp. Remove once auth is intigrated
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
        let mailboxes: any

        [err, mailboxes] = await to(fastify.services.mailboxService.findMailboxes({}, query))
        if (err != null) {
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }
        if (mailboxes.length == 0) {
            replyCode = HTTP_STATUS.NOT_FOUND
        }
        // Build the payload 
        mailboxes.forEach((mb: any) => {
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