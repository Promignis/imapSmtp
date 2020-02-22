import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { UserCreateOpts, UserProfile } from '../types/types'
import { to } from '../utils'


// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function create(fastify: any): any {
    return async (req: any, reply: any) => {
        let f: any = fastify

        if (req.validationError) {
            // [{},{}]
            throw new ServerError(
                HTTP_STATUS.BAD_REQUEST,
                req.validationError.validation,
                INT_ERRORS.API_VALIDATION_ERR
            )
        }
        const { username, tempPassword, firstname, lastname, role } = req.body

        let options: UserCreateOpts = {}
        let profile: UserProfile = {
            firstName: firstname,
            lastName: lastname
        }
        options.profile = profile
        if (role != "") options.role = role;
        if (tempPassword != "") options.tempPassword = tempPassword

        let err: any
        let resp: any

        [err, resp] = await to(f.tx.userTx.createNewUser(username, options))

        if (err != null) {
            throw err
        }

        reply
            .code(HTTP_STATUS.OK)
            .send(resp)
    }
}
