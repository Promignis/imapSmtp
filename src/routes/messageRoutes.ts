import {
    getPaginatedMessagesSchema,
    getThreadedMessagesSchema,
    outboundSchema
} from './routeSchemas'
import {
    getPaginatedMessages,
    getThreadedMessages,
    outboundMessage
} from '../handlers/messageHandlers'
import { authenticationHook, authorizationHook } from '../hooks/authHooks'


export default async function (fastify: any, options: object) {
    fastify.route({
        method: 'POST',
        url: '/get/all/',
        schema: getPaginatedMessagesSchema,
        // This will attach request validation errors to Fastify req object so that it can be handeled properly
        attachValidation: true,
        preValidation: authenticationHook(fastify),
        // preHandler: authorizationHook(fastify),
        handler: getPaginatedMessages(fastify)
    })

    fastify.route({
        method: 'POST',
        url: '/get/thread/',
        schema: getThreadedMessagesSchema,
        attachValidation: true,
        preValidation: authenticationHook(fastify),
        // preHandler: authorizationHook(fastify),
        handler: getThreadedMessages(fastify)
    })

    fastify.route({
        method: 'POST',
        url: '/outbound/',
        schema: outboundSchema,
        attachValidation: true,
        preValidation: authenticationHook(fastify),
        // preHandler: authorizationHook(fastify),
        handler: outboundMessage(fastify)
    })

}
