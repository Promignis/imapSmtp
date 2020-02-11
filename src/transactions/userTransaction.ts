import mongodb from 'mongodb'
import mongoose from 'mongoose'
import { MongooseTransaction } from './transact'
import { to, generateRandomString, bcryptHash } from '../utils'
import { IUser } from '../db/users'
import {
    NewUserDetails,
    UserCreateOpts,
    UserProfile,
} from '../types/types'
import { ROLES } from '../services/roles'
import { ServerError, HTTP_STATUS } from '../errors'

export class UserTX {

    conn: mongoose.Connection
    services: any

    constructor(conn: mongoose.Connection, services: any) {
        this.conn = conn
        this.services = services
    }

    async createNewUser(host: string, options?: UserCreateOpts): Promise<NewUserDetails> {

        let err: any
        let available: any

        [err, available] = await to(this.services.userService.checkAvailibility({}, host))

        if (!available) {
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, `User exists with username ${host}`, 'ServerError')
        }

        let userId = mongoose.Types.ObjectId();

        let passwordString: string = options && options.tempPassword ? options.tempPassword : generateRandomString(10)

        let conn: mongoose.Connection = this.conn

        let tx = new MongooseTransaction(conn)

        let transactionErr: any
        let transactionResult: any

        [transactionErr, transactionResult] = await to(tx.transact(async (session: mongodb.ClientSession): Promise<string> => {
            let err: any

            let newAddress: any
            [err, newAddress] = await to(this.services.addressService.create({ session }, userId, host))

            if (err != null) {
                throw err
            }

            let newMailboxes: any
            [err, newMailboxes] = await to(this.services.mailboxService.createSystemMailboxes({ session }, userId, newAddress._id))

            if (err != null) {
                throw err
            }

            let newBucket: any
            [err, newBucket] = await to(this.services.bucketService.createAttachmentBucket({ session }, userId, newAddress._id))

            if (err != null) {
                throw err
            }

            // Create the user document
            let profile: UserProfile = options && options.profile ? options && options.profile : {
                firstName: "",
                lastName: ""
            }
            let role = options && options.role ? options.role : ROLES.USER

            // Hash password
            let hashedPassword: any
            [err, hashedPassword] = await to(bcryptHash(passwordString))

            if (err != null) {
                throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, `ServerError`)
            }

            let newUser: any = {
                properties: {
                    username: host,
                    role: role,
                    profile: profile,
                    password: hashedPassword,
                    seed: "",
                    primeAddress: newAddress._id,
                    disabled: false,
                    lastLogin: null,
                    settings: {},
                    quotas: {
                        storageQuota: Number.MAX_VALUE,
                        maxInbound: Number.MAX_VALUE,
                        maxOutbound: Number.MAX_VALUE
                    },
                    metadata: {}
                },
                id: userId
            }

            // Create the new user
            let createdUser: any
            [err, createdUser] = await to(this.services.userService.create({ session }, newUser))

            if (err != null) {
                throw err
            }

            return newAddress.address
        }))

        if (transactionErr != null) {
            throw transactionErr
        }

        let address: string = transactionResult

        // User creation successfull

        let userDetails: NewUserDetails = {
            address: address,
            tempPass: passwordString,
        }

        return userDetails
    }
}