import mongoose from "mongoose"
import mongodb from 'mongodb'
import { db } from '../db/connection'
import { to, generateRandomString, bcryptHash } from '../utils'
import { HTTP_STATUS, ServerError } from '../errors'
import { ROLES } from './roles'
import { IUser } from '../db/users'
import { createNewUserTX } from '../transactions/createNewUser'
import {
    NewUserDetails,
    UserProfile,
    UserCreateOpts,
    UserQuotas,
    NewUserTXOpts,
    ServiceContext
} from '../types/types'

class UserService {

    User: mongoose.Model<any>

    constructor(model: mongoose.Model<any>) {
        this.User = model
    }

    // TODO: Update default quotas and settings based on requirements. 
    // TODO: Pick these up from config in the future
    defaultQuotas: UserQuotas = {
        storageQuota: Number.MAX_VALUE,
        maxInbound: Number.MAX_VALUE,
        maxOutbound: Number.MAX_VALUE
    }

    defaultSettings = {}

    async newUser(ctx: ServiceContext, host: string, options?: UserCreateOpts): Promise<NewUserDetails> {

        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        // Check if a user exists with this name
        let err: any
        let existingUser: IUser | null

        [err, existingUser] = await to(this.User.findOne({ 'username': host }, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.Name || "")
        }

        if (existingUser) {
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, `User with username ${host} alllredy exists.`, err.Name || "")
        }

        // If no existing user with this host then start new creation process

        let passwordString: string = options && options.tempPassword ? options.tempPassword : generateRandomString(10)
        let profile: UserProfile = options && options.profile ? options && options.profile : {
            firstName: "",
            lastName: ""
        }
        let role = options && options.role ? options.role : ROLES.USER

        // Hash password
        let hashedPassword: any
        [err, hashedPassword] = await to(bcryptHash(passwordString))

        if(err != null){    
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, `ServerError`)
        }
        
        let seed = ""
        // Create user doc
        let opts: NewUserTXOpts = {
            username: host,
            role,
            profile,
            hashedPassword,
            seed,
            disabled: false,
            settings: {},
            quotas: this.defaultQuotas,
            metadata: {}
        }

        let txRes: any

        [err, txRes] = await to(createNewUserTX(this.User, opts))

        if (err != null) {
            if (err instanceof ServerError) {
                throw err
            } else {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
            }
        }

        // User creation successfull

        let userDetails: NewUserDetails = {
            address: txRes,
            tempPass: passwordString,
        }

        return userDetails
    }

    async makeSuperUser(ctx: ServiceContext, username: string, password: string): Promise<void> {
        const role = <string>ROLES.ADMIN

        let options: UserCreateOpts = {
            tempPassword: password,
            role: role
        }

        let err: any
        let res: any

        [err, res] = await to(this.newUser(ctx, username, options))

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name)
        }

    }
}

export default new UserService(db.main.User)