import { getAllMailboxSchema } from './routeSchemas'
import { getAllForUser } from '../handlers/mailboxhandlers'
import { authenticationHook, authorizationHook } from '../hooks/authHooks'

export default async function (fastify: any, options: object) {
    // Fastify does not support handeling request body when the request type is GET
    // https://github.com/fastify/fastify/issues/1737
    // So keeping this POST for now
    fastify.route({
        method: 'POST',
        url: '/all/',
        schema: getAllMailboxSchema,
        // This will attach request validation errors to Fastify req object so that it can be handeled properly
        attachValidation: true,
        preValidation: authenticationHook(fastify),
        // preHandler: authorizationHook(fastify),
        handler: getAllForUser(fastify)
    })
}
