import { userCreateSchema } from './routeSchemas'
import { create } from '../handlers/userHandlers'
import { authenticationHook, authorizationHook } from '../hooks/authHooks'


export default async function (fastify: any, options: object) {
    fastify.route({
        method: 'POST',
        url: '/create/',
        schema: userCreateSchema,
        // This will attach request validation errors to Fastify req object so that it can be handeled properly
        attachValidation: true,
        preValidation: authenticationHook(fastify),
        preHandler: authorizationHook(fastify),
        handler: create(fastify)
    })
}
