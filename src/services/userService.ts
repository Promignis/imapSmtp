import mongoose from "mongoose"
import { HTTP_STATUS, ServerError, MONGO_CODES, INT_ERRORS } from '../errors'
import { to, bcryptVerify } from '../utils'
import { IUser } from '../db/users'
import { UserCreateOpts, UserProfile } from '../types/types'
import { ROLES } from './roleService'
import {
    ServiceContext,
    FindQuery
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
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
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

        [err, existingUser] = await to(this.User.findOne({ 'username': username }, null, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.Name || INT_ERRORS.SERVER_ERR)
        }

        if (!existingUser) {
            return true
        }

        return false
    }

    async createSuperAdminIfNotExist(ctx: ServiceContext, username: string, password: string, fastify: any): Promise<IUser> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let err: any, existingUser: any
        [err, existingUser] = await to(this.User.findOne({ 'username': username }, null, dbCallOptions).exec())
        if(err != null) {
          throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.Name || INT_ERRORS.SERVER_ERR)
        }
        if(!existingUser) {
          let options: UserCreateOpts = {}
          let profile: UserProfile = {
              firstName: "super_admin",
              lastName: ""
          }
          options.profile = profile
          options.role = ROLES.SUPER_ADMIN;
          options.tempPassword = password

          let err: any
          let resp: any

          [err, resp] = await to(fastify.tx.userTx.createNewUser(username, options))
					return resp
        }
        return existingUser
    }

    async findUsers(ctx: ServiceContext, query: FindQuery, options?: object): Promise<any> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let projection: string | null = query.projection ? query.projection : null

        let err: any
        let res: any

        [err, res] = await to(this.User.find(query.filter, projection, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || INT_ERRORS.SERVER_ERR)
        }
        return res
      }

    async login(ctx: ServiceContext, username: string, password: string): Promise<IUser> {
        let dbCallOptions: any = {}
        if (ctx && ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let err, user:any
        [err, user] = await to(this.User.findOne({ 'username': username }, {}, dbCallOptions).exec())
        let passwordHash:string = (user && user.password) || "";
        if(err != null) {
          throw err
        }

        // TODO: type this better
        let isUser: any
        [err, isUser] = await to(bcryptVerify(password, passwordHash))
        if(err != null) {
          throw err
        }
        if(isUser) {
          return user
        } else {
          // password was incorrect
          // TODO: throw valid error
          throw new Error("Incorrect password")
        }
    }
}

export default UserService
