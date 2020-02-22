import mongodb from 'mongodb'
import mongoose from 'mongoose'

// TODO: Move types to different folder and have an index exporting all
// as this file can get quiet big

export interface ServiceContext {
    // When using mongodb transaction, all the calls made to the db
    // inside the transaction should be passed the transaction session
    // So when the services are called inside a transactions they will be passed
    // the session using this property of the context.
    session?: mongodb.ClientSession
}

export interface NewUserDetails {
    address: string
    tempPass: string
}

export interface UserProfile {
    firstName: string,
    lastName: string
}

export interface UserCreateOpts {
    profile?: UserProfile,
    tempPassword?: string // Initial password for the user. If not passed it will be randomly generated
    role?: string // If not passed the default "user" role will be chosen
}

export interface UserQuotas {
    storageQuota: number,
    maxInbound: number,
    maxOutbound: number
}

export interface AttachmentInfo {
    filename: string,
    count: number,
    contentType: string
}

export interface UpdateQuery {
    filter: object, // To find the document to update
    document: object, // Values to update
}

export interface FindQuery {
    filter: object,
    projection?: string //eg. 'name friends'
}

export interface PaginationOpts {
    query: FindQuery,
    limit: number,
    previous?: string,
    next?: string,
    ascending?: boolean
}

export interface PaginatedResponse {
    result: any,
    hasNext: boolean,
    next: string,
    previous?: string
}
