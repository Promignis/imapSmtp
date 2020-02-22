import { loginSchema } from './routeSchemas'
import { login } from '../handlers/authHandlers'

export default async function (fastify: any, options: object) {
    fastify.route({
        method: 'POST',
        url: '/login',
        schema: loginSchema,
        attachValidation: true,
        handler: login(fastify)
    })
}
