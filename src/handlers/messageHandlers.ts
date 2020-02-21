import mongoose from 'mongoose'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { PaginationOpts, FindQuery } from '../types/types'
import { to } from '../utils'


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
            .code(HTTP_STATUS.OK)
            .send(resp)
    }
}