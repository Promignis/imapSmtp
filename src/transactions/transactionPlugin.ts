import { UserTX } from './userTransaction'
import { MessageTX } from './messageTransactions'
import fastifyPlugin from 'fastify-plugin'

async function setupTransactions(fastify: any, { }, done: Function) {

    // Setup transactions
    let userTx = new UserTX(fastify.db.main.connection, fastify.services)
    let messageTx = new MessageTX(fastify.db.main.connection, fastify.services)
    // Decorate fastify with the services

    let decorator: any = {
        userTx,
        messageTx
    }

    fastify.decorate('tx', decorator)

    done()
}

export const transactionPlugin = fastifyPlugin(setupTransactions)
