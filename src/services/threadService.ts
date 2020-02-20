import mongoose from "mongoose"
import { to } from '../utils'
import { HTTP_STATUS, ServerError, INT_ERRORS } from '../errors'
import { IThread, IThreadDoc } from '../db/threads'
import { ServiceContext, UpdateQuery, FindQuery } from '../types/types'


class ThreadService {

    Thread: mongoose.Model<IThreadDoc>

    constructor(model: mongoose.Model<any>) {
        this.Thread = model
    }

    async createThread(ctx: ServiceContext, thread: IThread, options?: Object): Promise<IThreadDoc> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let threadDoc = new this.Thread(thread)

        let err: any
        let newThread: any

        [err, newThread] = await to(threadDoc.save(dbCallOptions))

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        return newThread
    }



    async updateThread(ctx: ServiceContext, queryInfo: UpdateQuery, options?: Object): Promise<Number> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let res: any
        let err: any

        [err, res] = await to(this.Thread.updateMany(queryInfo.filter, queryInfo.document, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        // res.n gives Number of documents matched
        let modifiedCount = res.nModified

        return modifiedCount
    }

    async findThread(ctx: ServiceContext, query: FindQuery, options?: object): Promise<any> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let projection: string | null = query.projection ? query.projection : null

        let err: any
        let res: any

        [err, res] = await to(this.Thread.find(query.filter, projection, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }

        return res
    }
}

export default ThreadService