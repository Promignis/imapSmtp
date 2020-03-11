import * as fastify from 'fastify'
import { ServerError, HTTP_STATUS } from '../errors'
import { UserCreateOpts, UserProfile } from '../types/types'
import { to, bcryptVerify } from '../utils'
import { IUser } from '../db/users'
import { httpLogger as logger } from '../logger'


// In all handlers `this` is the fastify instance
// The fastify instance used for the handler registration

export function login(fastify: any): any {
  return async (req: any, reply: any) => {
    let f: any = fastify
    if (req.validationError) {
      throw new ServerError(
        HTTP_STATUS.BAD_REQUEST,
        req.validationError.validation,
        'ValidationError'
      )
    }


    let err, user: any
    // check password bcrypt hash
    [err, user] = await to(fastify.services.userService.login(null, req.body.username, req.body.password))
    if (err != null) {
      throw new ServerError(
        HTTP_STATUS.UNAUTHORIZED,
        "Invalid details",
        'InternalError'
      )
    }

    const token = fastify.jwt.sign({ username: user.username, role: user.role })
    reply
      .code(HTTP_STATUS.OK)
      .send({ token })
  }
}
