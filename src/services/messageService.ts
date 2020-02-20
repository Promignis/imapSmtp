import mongoose from "mongoose"
import { to } from '../utils'
import { HTTP_STATUS, ServerError, INT_ERRORS } from '../errors'
import { IMessage, IMessageDoc } from '../db/messages'
import { ServiceContext } from '../types/types'


class MessageService {

    Message: mongoose.Model<IMessageDoc>

    constructor(model: mongoose.Model<any>) {
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
}

export default MessageService