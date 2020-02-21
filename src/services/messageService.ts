import mongoose from "mongoose"
import { to } from '../utils'
import { HTTP_STATUS, ServerError, INT_ERRORS } from '../errors'
import { IMessage, IMessageDoc } from '../db/messages'
import { ServiceContext, PaginationOpts, PaginatedResponse } from '../types/types'


class MessageService {

    Message: mongoose.Model<IMessageDoc>

    constructor(model: mongoose.Model<IMessageDoc>) {
        this.Message = model
    }

    async createMessage(ctx: ServiceContext, message: IMessage, options?: Object): Promise<IMessageDoc> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let messageDoc = new this.Message(message)

        let err: any
        let newMessage: any

        [err, newMessage] = await to(messageDoc.save(dbCallOptions))

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        return newMessage
    }

    async getPaginatedMessages(ctx: ServiceContext, opts: PaginationOpts): Promise<PaginatedResponse> {

        const maxLimit = 100

        let q = opts.query.filter

        let projectedFields: any = {
            messageId: 1,
            from: 1,
            to: 1,
            cc: 1,
            bcc: 1,
            parsedHeaders: 1,
            attachments: 1,
            hasAttachments: 1,
            flags: 1,
            body: 1
        }

        let paginationParams: any = {
            paginatedField: 'idate',
            query: q,
            fields: projectedFields
        }

        if (opts.next && opts.previous) {
            // Both should not be present. If it does then priorotize next
            paginationParams['next'] = opts.next
        } else if (opts.next) {
            paginationParams['next'] = opts.next
        } else if (opts.previous) {
            paginationParams['previous'] = opts.previous
        }

        if (opts.limit > maxLimit) {
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Page size limit of ${maxLimit} exceeded`, INT_ERRORS.SERVER_ERR)
        } else {
            paginationParams['limit'] = opts.limit
        }

        let err: any
        let paginatedRes: any
        //@ts-ignore
        [err, paginatedRes] = await to(this.Message.paginate(paginationParams))

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        return paginatedRes
    }
}

export default MessageService