import MailboxService from '../services/mailboxeService'
import AddressService from '../services/addressService'
import BucketService from '../services/bucketService'
import UserService from '../services/userService'
import AttachmentService from '../services/attachmentService'
import MessageService from '../services/messageService'
import ThreadService from '../services/threadService'
import { DB, GridFSOpts } from '../db/types'
import GridFS from '../db/gridFS'
import RoleService from '../services/roleService'
import PrivilegeService from '../services/privilegeService'
import ResourceService from '../services/resourceService'
import AccessService from '../services/accessService'
import fastifyPlugin from 'fastify-plugin'

async function setupServicesPlugin(fastify: any, { }, done: Function) {

    let db: DB = fastify.db

    // Setup all the services
    let mailboxService = new MailboxService(db.main.models.Mailbox)
    let addressService = new AddressService(db.main.models.Address, <string>process.env.DOMAIN)
    let bucketService = new BucketService(db.main.models.Bucket)
    let userService = new UserService(db.main.models.User)
    let threadService = new ThreadService(db.main.models.Thread)
    let messageService = new MessageService(db.main.models.Message)

    // Setup Attachment services
    let opts: GridFSOpts = {
        bucketName: "attachment",
        db: db.attachment.connection.db
    }
    let gridFS = new GridFS(opts)
    let attachmentService = new AttachmentService(gridFS)
    let roleService = new RoleService(db.main.models.Role)
    let privilegeService = new PrivilegeService(db.main.models.Privilege)
    let resourceService = new ResourceService(db.main.models.Resource)
    let accessService = new AccessService(db.main.models.Access)

    // Decorate fastify with the services
    let decorator: any = {
        mailboxService,
        addressService,
        bucketService,
        userService,
        attachmentService,
        threadService,
        messageService,
        roleService,
        privilegeService,
        resourceService,
        accessService
    }

    fastify.decorate('services', decorator)

    done()
}

export const servicesPlugin = fastifyPlugin(setupServicesPlugin)
