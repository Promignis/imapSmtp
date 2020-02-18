import MailboxService from '../services/mailboxeService'
import AddressService from '../services/addressService'
import BucketService from '../services/bucketService'
import UserService from '../services/userService'
import AttachmentService from '../services/attachmentService'
import { DB, GridFSOpts } from '../db/types'
import GridFS from '../db/gridFS'
import fastifyPlugin from 'fastify-plugin'

async function setupServicesPlugin(fastify: any, { }, done: Function) {

    let db: DB = fastify.db

    // Setup all the services
    let mailboxService = new MailboxService(db.main.models.Mailbox)
    let addressService = new AddressService(db.main.models.Address, <string>process.env.DOMAIN)
    let bucketService = new BucketService(db.main.models.Bucket)
    let userService = new UserService(db.main.models.User)

    // Setup Attachment services
    let opts: GridFSOpts = {
        bucketName: "attachment",
        db: db.attachment.connection.db
    }
    let gridFS = new GridFS(opts)
    let attachmentService = new AttachmentService(gridFS)

    // Decorate fastify with the services
    let decorator: any = {
        mailboxService,
        addressService,
        bucketService,
        userService,
        attachmentService
    }

    fastify.decorate('services', decorator)

    done()
}

export const servicesPlugin = fastifyPlugin(setupServicesPlugin)
