import { DB } from '../db/types'
import fastifyPlugin from 'fastify-plugin'
import { to } from '../utils'
import { IPrivilege } from '../db/privileges'
import { IRole } from '../db/roles'
import { IResource } from '../db/resources'
import { IAccess } from '../db/access'
import { IUser } from '../db/users'


export interface InitDb {
  roles: IRole[],
  privileges: IPrivilege[],
  resources: IResource[],
  accesses: IAccess[],
	superAdmin: IUser
}

// Initialize and cache any pre-created documents
async function initDbDocs(fastify: any, { }, done: Function) {

    let db: DB = fastify.db

    let err, roles: any
    // create if not found
    [err, roles] = await to(fastify.services.roleService.create())
    if(err != null) {
      throw err
    }
    let privileges:any
    [err, privileges] = await to(fastify.services.privilegeService.create())

    if(err != null) {
      throw err
    }

    let resources:any
    [err, resources] = await to(fastify.services.resourceService.create())
    if(err != null) {
      throw err
    }

    let accesses: any
    [err, accesses] = await to(fastify.services.accessService.create({}, roles))
    if(err != null) {
      throw err
    }

    // create the super user if no user with role super user created
		// TODO: add to config, make compulsory
		let username = process.env["SUPERADMIN_USERNAME"] || "super_admin"
		let password = process.env["SUPERADMIN_PASSWORD"] || "caef6db9da0aac1df0d8e247ccd3469ad77f90379e50c9574d215b7970118d1a"
    let superAdmin:any
    [err, superAdmin] = await to(fastify.services.userService.createSuperAdminIfNotExist({}, username, password, fastify))
		if(err != null) {
			throw err
		}

    // Decorate fastify with the initDb
    let decorator: InitDb = {
      roles,
      privileges,
      resources,
      accesses,
			superAdmin
    }

    fastify.decorate('initDb', decorator)

    done()
}

export const initDbDocsPlugin = fastifyPlugin(initDbDocs)
