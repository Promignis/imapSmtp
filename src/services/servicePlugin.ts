import MailboxService from '../services/mailboxeService'
import AddressService from '../services/addressService'
import BucketService from '../services/bucketService'
import UserService from '../services/userService'
import { DB } from '../db/types'
import fastifyPlugin from 'fastify-plugin'

async function setupServicesPlugin(fastify: any, { }, done: Function) {

    let db: DB = fastify.db

    // Setup all the services
    let mailboxService = new MailboxService(db.main.models.Mailbox)
    let addressService = new AddressService(db.main.models.Address, <string>process.env.DOMAIN)
    let bucketService = new BucketService(db.main.models.Bucket)
    let userService = new UserService(db.main.models.User)

    // Decorate fastify with the services
    let decorator: any = {
        mailboxService,
        addressService,
        bucketService,
        userService
    }

    fastify.decorate('services', decorator)

    done()
}

export const servicesPlugin = fastifyPlugin(setupServicesPlugin)
