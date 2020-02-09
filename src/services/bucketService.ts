import mongoose from "mongoose"
import { db } from '../db/connection'
import { to } from '../utils'
import { HTTP_STATUS, MONGO_CODES, ServerError } from '../errors'
import mongodb from 'mongodb'
import { IBucket } from '../db/buckets'

class BucketService {

    Bucket: mongoose.Model<any>

    constructor(model: mongoose.Model<any>) {
        this.Bucket = model
    }

    attachmentBucketName: string = "attachment"

    async createBucket(user: mongoose.Types.ObjectId, address: mongoose.Types.ObjectId, name: string, options?: Object): Promise<IBucket | undefined> {

        let doc = {
            user: user,
            address: address,
            name: name,
            size: 0,
            metadata: {}
        }

        let bucket = new this.Bucket(doc)

        let err: any
        let result: IBucket | undefined

        [err, result] = await to(bucket.save())

        if (err != null) {
            // Note: Methods that can trigger duplicate 11000 save(), insertMany(), update(), fineOneAndUpdate(), reate()
            /**
             * Other properties inside err object when error type is MongoError Duplicate key
             * keyPattern
             * keyValue
             * errmsg
             */
            if (err.name == 'MongoError' && err.code == MONGO_CODES.DUPLICATE_KEY) {
                throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Bucket with name ${name} already exists!`, err.name)
            } else {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
            }
        }

        return result
    }

    async createAttachmentBucket(user: mongoose.Types.ObjectId, address: mongoose.Types.ObjectId, options?: Object): Promise<IBucket | undefined> {
        return this.createBucket(user, address, this.attachmentBucketName)
    }
}

export default new BucketService(db.main.Bucket)