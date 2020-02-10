import mongodb from 'mongodb'
import mongoose from 'mongoose'
import mailboxService from '../services/mailboxeService'
import addressService from '../services/addressService'
import bucketService from '../services/bucketService'
import { db } from '../db/connection'
import { MongooseTransaction } from './transact'
import { to } from '../utils'
import { IUser } from '../db/users'
import { NewUserTXOpts } from '../types/types'


// Creates A new user and returns a Promise that resolves into the address of the user
export const createNewUserTX = async (userModel: mongoose.Model<IUser>, options: NewUserTXOpts): Promise<string> => {

    let userId = mongoose.Types.ObjectId();

    let conn: mongoose.Connection = db.main.Connection

    let tx = new MongooseTransaction(conn)

    let transactionErr: any
    let transactionResult: any

    [transactionErr, transactionResult] = await to(tx.transact(async (session: mongodb.ClientSession): Promise<string> => {
        let err: any

        let newAddress: any
        [err, newAddress] = await to(addressService.create({session}, userId, options.username))

        if (err != null) {
            throw err
        }

        let newMailboxes: any
        [err, newMailboxes] = await to(mailboxService.createSystemMailboxes({session}, userId, newAddress._id))

        if (err != null) {
            throw err
        }

        let newBucket: any
        [err, newBucket] = await to(bucketService.createAttachmentBucket({session}, userId, newAddress._id))

        if (err != null) {
            throw err
        }

        // Update the user document
        let newUser: IUser = new userModel({
            username: options.username,
            role: options.role,
            profile: options.profile,
            password: options.hashedPassword,
            seed: options.seed,
            primeAddress: newAddress._id,
            disabled: options.disabled,
            lastLogin: null,
            settings: options.settings,
            quotas: options.quotas,
            metadata: options.metadata
        })

        // Mongoose creates a default user id. So replace that
        newUser._id = userId

        // Create the new user
        let createdUser: any
        [err, createdUser] = await to(newUser.save({session}))

        if (err != null) {
            throw err
        }

        return newAddress.address
    }))

    if(transactionErr != null){
        throw transactionErr
    }

    let address: string = transactionResult

    return address
}