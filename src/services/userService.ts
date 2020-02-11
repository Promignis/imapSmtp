import mongoose from "mongoose"
import { to } from '../utils'
import { HTTP_STATUS, ServerError, MONGO_CODES } from '../errors'
import { IUser } from '../db/users'
import {
    ServiceContext
} from '../types/types'

class UserService {

    User: mongoose.Model<IUser>

    constructor(model: mongoose.Model<any>) {
        this.User = model
    }

    defaultSettings = {}

    async create(ctx: ServiceContext, user: any, options?: any): Promise<IUser> {

        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let newUser = new this.User(user.properties)
        // If id is passed then replace the default created id with it
        if (user.id) newUser._id = user.id;

        let err: any
        let res: any

        [err, res] = await to(newUser.save(dbCallOptions))

        if (err != null) {
            if (err.name == 'MongoError' && err.code == MONGO_CODES.DUPLICATE_KEY) {
                throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Bucket with name ${name} already exists`, err.name)
            } else {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
            }
        }

        return newUser
    }

    async checkAvailibility(ctx: ServiceContext, username: string): Promise<boolean> {

        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let err: any
        let existingUser: any

        [err, existingUser] = await to(this.User.findOne({ 'username': username }, {}, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.Name || "")
        }

        if (!existingUser) {
            return true
        }

        return false
    }
}

export default UserService