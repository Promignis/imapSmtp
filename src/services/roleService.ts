import { IRole, Role } from '../db/roles'
import mongoose from "mongoose"
import { to } from '../utils'
import {
    ServiceContext
} from '../types/types'


// Role info:
/**
 * TODO: Should not have hardcoded roles like this. Roles will be put in the db
 * so that the admin can create new roles with more granular access. Version 1.0 will
 * not have the feature to create new roles but will be setup in a way that this can be easily
 * added in future verions.
 *
 * Even in that case there should always be 2 roles, "admin" and "user".
 * These roles and its privilages are hardcoded and can NOT be modified.
 * For now user has a string property called role. It will be replaced by a ref to a role
 * document.
 *
 * The two harcoded roles mentioned above will be created when the server instance
 * during first setup
 *
 * Note: Maybe These hardcoded role documents can be decorated in the main fastify instance so
 * that they can be easily accessed without making any db calls.
 *
 * TODO: add super admin role
 */

type AllowedRoles = {'ADMIN': string, 'USER': string }

export const ROLES:AllowedRoles = {
    ADMIN: 'admin',
    USER: 'user'
}

class RoleService {

  Role: mongoose.Model<IRole>
  ROLES: AllowedRoles

  constructor(role:mongoose.Model<IRole>) {
    this.Role = role
    this.ROLES = {
      ADMIN: 'admin',
      USER: 'user'
    }
  }

  // create the default roles
  // don't create if already exists
  async create(ctx: ServiceContext): Promise<IRole[]> {
    let dbCallOptions: mongoose.SaveOptions = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    // check if the roles exist
    let err, roles: any
    [err, roles] = await to(this.Role.find({}).exec())
    if(err != null) {
      throw err
    }
    if(roles.length === 0) {
      return this.initDb(ctx)
    } else {

      [err, roles] = await to(this.Role.find({role: {$in: Object.values(this.ROLES)}}).exec())
      if(err != null) {
        throw err
      }
      return roles
    }

    // fetch current roles
    // filter = {role}
    // return roles
    return []
  }

  async initDb(ctx: ServiceContext): Promise<IRole[]> {
    let dbCallOptions: any = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    let role:string
    let roleDoc:Role
    let roleDocs:IRole[] = []
    for(role of Object.values(this.ROLES)) {
      roleDoc = {
        role,
        metadata: {}
      }
      let doc = new this.Role(roleDoc)
      let err, result:any
      [err, result] = await to(doc.save())
      if(err != null) {
        throw err
      }
      roleDocs.push(result)
    }
    return roleDocs
  }
}

export default RoleService
