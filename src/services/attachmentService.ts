import GridFS from '../db/gridFS'
import mongodb from 'mongodb'
import { AttachmentInfo } from '../types/types'
import { GridFSWriteOpts } from '../db/types'
import { IAttachmentDoc } from '../db/attachments'
import { to } from '../imapv4/utils'

class AttachmentService {
    gridFS: GridFS

    constructor(gridFS: GridFS) {
        this.gridFS = gridFS
    }

    async saveAttachment(ctx: any, attStream: NodeJS.ReadableStream, info: AttachmentInfo): Promise<IAttachmentDoc> {
        let metadata: any = {
            count: info.count
        }

        let opts: GridFSWriteOpts = {
            filename: info.filename,
            metadata: metadata,
            contentType: info.contentType
        }

        return new Promise((res, rej) => {

            let writeStream: any = this.gridFS.write(opts, attStream)

            writeStream
                .on("error", (error: Error) => {
                    rej(error)
                })
                .on('finish', (file: any) => {
                    res(file)
                })
        })
    }

    async deleteAttachment(ctx: any, id: mongodb.ObjectID): Promise<void> {
        let [err, _] = await to(this.gridFS.delete(id))
        if (err != null) {
            throw err
        }
    }

    downloadAttachment() {

    }

    async getAttachment(filter: any): Promise<IAttachmentDoc | null> {

        let [err, res] = await to(this.gridFS.getFile(filter))

        if (err != null) {
            throw err
        }

        if (!res) {
            return null
        }

        return <IAttachmentDoc>res!
    }

    getDownloadStream(id: mongodb.ObjectID, opts?: { start: number, end: number }): NodeJS.ReadableStream {
        return this.gridFS.read(id, opts)
    }
}

export default AttachmentService