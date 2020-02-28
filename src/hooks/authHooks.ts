import * as fastify from "fastify"
import { to } from '../utils'
import { ServerResponse } from "http"
import { ROLES } from '../services/roleService'
import { PRIVILEGES } from '../services/privilegeService'
import { RESOURCES } from '../services/resourceService'
import { IUser } from '../db/users'
import { ServerError, HTTP_STATUS, INT_ERRORS } from '../errors'
import { IAccess } from '../db/access'


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
// TODO: handle any resource per url
export function authorizationHook(fastify: any) {
  // TODO: get this from config and use same for routes
  const USER_CREATE: string = "/api/v1/user/create/"
  const OUTBOUND: string = "/api/v1/message/outbound"

  // so far resource are
  // implicit based on api
  const permissionMap: any = {
  }
  const resourceMap: any = {
  }

  // TODO: make helper functions/better ux to do this
  //
  // permissions needed for user role to
  // create a user

  permissionMap[OUTBOUND] = {}
  permissionMap[OUTBOUND][ROLES.USER] = []
  permissionMap[OUTBOUND][ROLES.ADMIN] = []

  permissionMap[USER_CREATE] = {}
  permissionMap[USER_CREATE][ROLES.USER] = [PRIVILEGES.CREATE]
  permissionMap[USER_CREATE][ROLES.ADMIN] = [PRIVILEGES.CREATE]
  permissionMap[USER_CREATE][ROLES.SUPER_ADMIN] = [PRIVILEGES.CREATE]

  // resources needed for that url
  resourceMap[OUTBOUND] = {}
  resourceMap[OUTBOUND][ROLES.USER] = []
  resourceMap[OUTBOUND][ROLES.ADMIN] = []
  resourceMap[OUTBOUND][ROLES.SUPER_ADMIN] = []

  resourceMap[USER_CREATE] = {}
  resourceMap[USER_CREATE][ROLES.USER] = [RESOURCES.USER]
  resourceMap[USER_CREATE][ROLES.ADMIN] = [RESOURCES.USER]
  resourceMap[USER_CREATE][ROLES.SUPER_ADMIN] = [RESOURCES.USER]

  return async (request: fastify.FastifyRequest, reply: fastify.FastifyReply<ServerResponse>) => {
    const url: string | undefined = request.raw.url
    // url not sent
    if (url === "" || url == null) {
      throw new Error("Internal error")
    }

    const accesses = fastify.initDb.accesses

    // TODO: do this more securely
    const user:IUser = (request.user as IUser)

    const accessName = `access_${user.role}`

    // fetch from cached value
    const userAccess = accesses.find((access: IAccess) => access.name === accessName)

    // TODO: handle case of fetching new access for user
    if(!userAccess) {
          throw new ServerError(
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
            "Internal error",
            INT_ERRORS.SERVER_ERR
          )
    }

    if (permissionMap[url] != null && resourceMap[url] != null) {
      const requiredPermissions = permissionMap[url][user.role]
      const requiredResources = resourceMap[url][user.role]
      if(requiredPermissions && requiredPermissions.length === 0 ||
          requiredResources && requiredResources.length === 0){
          throw new ServerError(
            HTTP_STATUS.FORBIDDEN,
            "Internal error",
            INT_ERRORS.SERVER_ERR
          )
      }
      let hasAccess:boolean = false
      let permissionsUserHas:string[] = []
      // TODO: do checks after user model is updated with access
      for(const resource of requiredResources) {
        permissionsUserHas = userAccess.access[resource]
        // user must atleast have all the required permissions
        hasAccess = requiredPermissions.every((permission:string) => permissionsUserHas.includes(permission))
        // if does not have access for that particular
        // permission when accessing this resource
        if(!hasAccess) {
          throw new ServerError(
            HTTP_STATUS.FORBIDDEN,
            "User does not have access",
            'Unauthorized'
          )
        }
      }
    } else {
      // not in permissionMap
      throw new ServerError(
        HTTP_STATUS.FORBIDDEN,
        "Invalid url",
        'Unauthorized'
      )
    }
    // permissions needed for particular api
  }
}
