import * as fastify from "fastify"
import { to } from '../utils'
import { ServerResponse } from "http"
import { ROLES } from '../services/roleService'
import { PRIVILEGES } from '../services/privilegeService'
import { IUser } from '../db/users'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'


export function authenticationHook(fastify: any) {
  return async (request: fastify.FastifyRequest, reply: fastify.FastifyReply<ServerResponse>) => {
    let err: any, jwt: any
    [err, jwt] = await to(request.jwtVerify())

    if(err != null) {
      throw new ServerError(
        HTTP_STATUS.UNAUTHORIZED,
        "Error with jwt header",
        'Unauthorized'
      )
    }

    let user: any
    [err, user] = await to(fastify.services.userService.User.findOne({ username: jwt.username }))

    if(err != null) {
      throw new ServerError(
        HTTP_STATUS.UNAUTHORIZED,
        "Invalid details",
        'Unauthorized'
      )
    }
    // TODO: do in better way
    request.user = user
  }
}


// Always have authorization hook after authenticationHook
export function authorizationHook(fastify: any) {
  // TODO: get this from config and use same for routes
  const USER_CREATE: string = "/api/v1/user/create/"

  // so far resource are
  // implicit based on api
  const permissionMap: any = {
  }

  // permissions needed for user role to
  // create a user
  permissionMap[USER_CREATE] = {}
  permissionMap[USER_CREATE][ROLES.USER] = [PRIVILEGES.CREATE]
  return async (request: fastify.FastifyRequest, reply: fastify.FastifyReply<ServerResponse>) => {

    // TODO: do this more securely
    const user:IUser = (request.user as IUser)

    // url not sent
    if (request.raw.url === "" || request.raw.url == null) {
      throw new Error("Internal error")
    }

    if (permissionMap[request.raw.url] != null) {
      const requiredPermissions = permissionMap[request.raw.url][user.role]
      // TODO: do checks after user model is updated with access

    } else {
      // no permission map but expect some permission
      throw new Error("Invalid url")
    }
    // permissions needed for particular api
  }
}
