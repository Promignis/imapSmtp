import { getPaginatedMessagesSchema } from './routeSchemas'
import { getPaginatedMessages } from '../handlers/messageHandlers'

export default async function (fastify: any, options: object) {
    fastify.route({
        method: 'POST',
        url: '/get/',
        schema: getPaginatedMessagesSchema,
        // This will attach request validation errors to Fastify req object so that it can be handeled properly
        attachValidation: true,
        handler: getPaginatedMessages(fastify)
    })
}