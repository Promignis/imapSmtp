import mongoose from 'mongoose'
import mongodb from 'mongodb'
import { IUser } from './users'
import { IAddress } from './addresses'
import { IBucket } from './buckets'
import { IEvents } from './eventlogs'
import { IMailboxDoc } from './mailboxes'
import { IThreadDoc } from './threads'
import { IMessageDoc } from './messages'
import { IMailbox } from './mailboxes'
import { IRole } from './roles'
import { IPrivilege } from './privileges'
import { IResource } from './resources'
import { IAccess } from './access'

export interface ModelData {
    schema: mongoose.Schema;
    name: string;
    indexes: ModelIndex[]
}

export interface ModelIndex {
    fields: object,
    options?: mongoose.SchemaTypeOpts.IndexOpts
}

export interface GridFSOpts {
    bucketName?: string
    db: mongodb.Db
    chunkSizeBytes?: number
    writeConcern?: string
}

export interface GridFSWriteOpts {
    id?: mongoose.Types.ObjectId
    filename: string
    metadata?: object
    contentType?: string
}

// the object that has all the database connections and models
// When new models are added this type will have to be updated
export interface DB {
    main: {
        connection: mongoose.Connection,
        models: MainModels
    },
    attachment: {
        connection: mongoose.Connection,
        models: AttachmentModels
    }
}

// When new models are added this type will have to be updated
export interface MainModels {
    User: mongoose.Model<IUser>,
    Address: mongoose.Model<IAddress>,
    Mailbox: mongoose.Model<IMailboxDoc>,
    Bucket: mongoose.Model<IBucket>,
    Event: mongoose.Model<IEvents>,
    Thread: mongoose.Model<IThreadDoc>,
    Message: mongoose.Model<IMessageDoc>
    Role: mongoose.Model<IRole>,
    Privilege: mongoose.Model<IPrivilege>,
    Resource: mongoose.Model<IResource>,
    Access: mongoose.Model<IAccess>
}

// When new models are added this type will have to be updated
export interface AttachmentModels {
    Attachment: mongoose.Model<any>
}
