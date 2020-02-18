import GridFS from '../db/gridFS'
import { AttachmentInfo } from '../types/types'
import { GridFSWriteOpts } from '../db/types'
import { IAttachment } from '../db/attachments'

class AttachmentService {
    gridFS: GridFS

    constructor(gridFS: GridFS) {
        this.gridFS = gridFS
    }

    async saveAttachment(ctx: any, attStream: NodeJS.ReadableStream, info: AttachmentInfo): Promise<IAttachment> {
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

    deleteAttachment() {

    }

    downloadAttachment() {

    }
}

export default AttachmentService