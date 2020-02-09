import mongoose from 'mongoose'
import mongodb from 'mongodb'
import { to } from '../utils'

class MongooseTransaction {

    mongoConnection: mongoose.Connection

    constructor(connection: mongoose.Connection) {

        this.mongoConnection = connection
    }

    // TODO: Locks?
    async  transact<T>(cb: mongodb.WithTransactionCallback<T>): Promise<T> {
        let sessionErr: Error | null
        let session: any

        // Mongoose startSession returns the session object in a promise , unlike mongodb startsession
        // here we are using a mongoose connection object so we need to await for the session
        [sessionErr, session] = await to(this.mongoConnection.startSession())

        if (sessionErr != null) {
            // If an error then stop the process here
            throw sessionErr
        }

        session.startTransaction();

        let transctionErr: any
        let transactionResult: any

        [transctionErr, transactionResult] = await to(cb(session))

        if (transctionErr != null) {
            // Error happened, abort transaction
            await session.abortTransaction();
            session.endSession()
            throw transctionErr
        }

        // Transaction succeeded
        await session.commitTransaction()

        session.endSession();

        return transactionResult
    }

}