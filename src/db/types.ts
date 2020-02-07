import mongoose from 'mongoose'
import mongodb from 'mongodb'

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
    db:  mongodb.Db
    chunkSizeBytes?: number
    bucket: mongodb.GridFSBucket
    writeConcern?: string
}

export interface GridFSWriteOpts {
    id?: string
    filename: string
    metadata?: object
    contentType?: string
}