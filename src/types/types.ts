import mongoose from 'mongoose'
import mongodb from 'mongodb'

// TODO: Move types to different folder and have an index exporting all 
// as this file can get quiet big

export interface ServiceContext {
    // When using mongodb transaction, all the calls made to the db
    // inside the transaction should be passed the transaction session
    // So when the services are called inside a transactions they will be passed
    // the session using this property of the context. 
    session? : mongodb.ClientSession
}
