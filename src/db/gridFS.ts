import mongoose from 'mongoose'
import mongodb from 'mongodb'
import { GridFSOpts, GridFSWriteOpts } from './types'

const GridFSBucket = mongoose.mongo.GridFSBucket

// refer: mongodb.github.io/node-mongodb-native/3.6/api/GridFSBucket.html
class GridFS {

    bucketName: string
    db: mongodb.Db
    chunkSizeBytes: number
    bucket: mongodb.GridFSBucket

    constructor(options: GridFSOpts) {
        // .files and .chunks prefixes will be added internally by GridFSBucket so make sure that they are not included here
        this.bucketName = options.bucketName || "fs",
            // This is DB that the collection belongs to
            // Can get it from Mongoose Collection object's db() method
            this.db = options.db,
            this.chunkSizeBytes = options.chunkSizeBytes || 255 * 1024
        this.bucket = new GridFSBucket(this.db, {
            bucketName: this.bucketName,
            chunkSizeBytes: this.chunkSizeBytes,
            writeConcern: { w: options.writeConcern || 'majority' }
        });
    }

    write(options: GridFSWriteOpts, readstream: NodeJS.ReadableStream, done?: { (error: Error | null, file?: any | null): void }): mongodb.GridFSBucketWriteStream | void {
        let filename = options.filename
        let metadata = options.metadata || {}
        let id = options.id || new mongoose.Types.ObjectId()

        let opts: any = {
            metadata
        }

        if (options.contentType) opts['contentType'] = options.contentType

        const writeStream = this.bucket.openUploadStreamWithId(id, filename, opts);

        readstream.pipe(writeStream);

        if (done) {
            writeStream.on('error', function onWriteFileError(error) {
                return done(error, null);
            });

            writeStream.on('finish', function onWriteFileFinish(file: any) {
                return done(null, file);

                /**
                 * Example of the returned file type
                 * {
                    _id: 5e3d6474c6fcfc12096b61ea,
                    length: 12,
                    chunkSize: 261120,
                    uploadDate: 2020-02-07T13:22:01.931Z,
                    filename: 'sample.txt',
                    md5: '9ed372fcc11acd1502916ec1b00c16ab',
                    contentType: 'text/plain',
                    aliases: [],
                    metadata: { count: 1 }
                    }
                */
            });
        } else {
            return writeStream
        }
    }

    async getFile(filter: any): Promise<object | null> {
        let file = await this.bucket.find(filter, { limit: 1 }).toArray()

        if (!file) {
            return null
        }
        return file
    }

    async getFiles(filter: any, options: {
        batchSize?: number // The number of documents to return per batch. Gridfs defaults at 1000
        limit?: number // Optional limit for cursor
    }): Promise<object[]> {

        let file = await this.bucket.find(filter, options).toArray()

        if (!file) {
            file = []
        }

        return file
    }

    read(id: mongodb.ObjectID, opts?: { start: number, end: number }): NodeJS.ReadableStream {

        let stream = this.bucket.openDownloadStream(id, opts)
        // The consumer can decide what to do with the stream
        return stream
    }

    async delete(id: mongodb.ObjectID): Promise<void> {
        return new Promise((res, rej) => {
            this.bucket.delete(id, function afterDelete(error) {
                if (error) {
                    return rej(error)
                } else {
                    return res()
                }
            });
        })
    }
}

export default GridFS
