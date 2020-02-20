import mongoose from "mongoose"
import { to } from '../utils'
import { HTTP_STATUS, MONGO_CODES, ServerError, INT_ERRORS } from '../errors'
import { IBucket } from '../db/buckets'
import { ServiceContext } from '../types/types'


class BucketService {

    Bucket: mongoose.Model<IBucket>

    constructor(model: mongoose.Model<any>) {
        this.Bucket = model
    }

    attachmentBucketName: string = "attachment"

    async createBucket(ctx: ServiceContext, user: mongoose.Types.ObjectId, address: mongoose.Types.ObjectId, name: string, options?: Object): Promise<IBucket> {

        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let doc = {
            user: user,
            address: address,
            name: name,
            size: 0,
            files: [],
            metadata: {}
        }

        let bucket = new this.Bucket(doc)

        let err: any
        let result: any

        [err, result] = await to(bucket.save(dbCallOptions))

        if (err != null) {
            // Note: Methods that can trigger duplicate 11000 save(), insertMany(), update(), fineOneAndUpdate(), reate()
            /**
             * Other properties inside err object when error type is MongoError Duplicate key
             * keyPattern
             * keyValue
             * errmsg
             */
            if (err.name == 'MongoError' && err.code == MONGO_CODES.DUPLICATE_KEY) {
                throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Bucket with name ${name} already exists`, err.name)
            } else {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
            }
        }

        return result
    }

    async createAttachmentBucket(ctx: ServiceContext, user: mongoose.Types.ObjectId, address: mongoose.Types.ObjectId, options?: Object): Promise<IBucket | undefined> {
        return this.createBucket(ctx, user, address, this.attachmentBucketName)
    }
}
export default BucketService