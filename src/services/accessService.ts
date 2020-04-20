import { IAccess, Access, AccessMap } from '../db/access'
import { IRole, Role } from '../db/roles'
import mongoose from "mongoose"
import { to } from '../utils'
import { RESOURCES } from './resourceService'
import { ROLES } from './roleService'
import { R, U, CRU, RU, CUD, CRUD, PRIVILEGES } from './privilegeService'
import {
  ServiceContext
} from '../types/types'


/**
 * Access contains a role and the map {resource: []privileges}
 */

// allows compile time type check for keys
// default access for these roles

// TODO: type more strictly as
// [key:ResourceProp]: PrivilegeProp[]
const defaultAccessMap = (): AccessMap => ({
  user: [],
  user_profile_name: [],
  user_role: [],
  user_password: [],
  address: [],
  storage: [],
  settings: [],
  user_profile: [],
  user_profile_last_login: []
})

interface AllowedAccesses {
  user: AccessMap,
  admin: AccessMap,
  super_admin: AccessMap
}

class AccessService {

  Access: mongoose.Model<IAccess>
  ACCESSES: AllowedAccesses

  constructor(access: mongoose.Model<IAccess>) {
    this.Access = access
    this.ACCESSES = { 'user': defaultAccessMap(), 'admin': defaultAccessMap(), 'super_admin': defaultAccessMap() }

    // admin access
    this.ACCESSES.admin[RESOURCES.USER] = CRU
    this.ACCESSES.admin[RESOURCES.USER_PROFILE_NAME] = CRUD
    this.ACCESSES.admin[RESOURCES.USER_ROLE] = RU
    this.ACCESSES.admin[RESOURCES.USER_PASSWORD] = U
    this.ACCESSES.admin[RESOURCES.ADDRESS] = CRUD
    this.ACCESSES.admin[RESOURCES.STORAGE] = CRU
    this.ACCESSES.admin[RESOURCES.SETTINGS] = RU
    this.ACCESSES.admin[RESOURCES.USER_PROFILE] = RU
    this.ACCESSES.admin[RESOURCES.USER_PROFILE_LAST_LOGIN] = R

    this.ACCESSES.super_admin[RESOURCES.USER] = CRUD
    this.ACCESSES.super_admin[RESOURCES.USER_PROFILE_NAME] = CRUD
    this.ACCESSES.super_admin[RESOURCES.USER_ROLE] = RU
    this.ACCESSES.super_admin[RESOURCES.USER_PASSWORD] = CUD
    this.ACCESSES.super_admin[RESOURCES.ADDRESS] = CRUD
    this.ACCESSES.super_admin[RESOURCES.STORAGE] = CRUD
    this.ACCESSES.super_admin[RESOURCES.SETTINGS] = RU
    this.ACCESSES.super_admin[RESOURCES.USER_PROFILE] = RU
    this.ACCESSES.super_admin[RESOURCES.USER_PROFILE_LAST_LOGIN] = R
  }

  // create the default accesses
  // don't create if already exists
  async create(ctx: ServiceContext, roles: IRole[]): Promise<IAccess[]> {
    let dbCallOptions: mongoose.SaveOptions = {}
    if (ctx && ctx.session) {
      dbCallOptions.session = ctx.session
    }

    // check if the roles exist
    let filter = {}
    let err, access: any
    [err, access] = await to(this.Access.find(filter).exec())
    if (err != null) {
      throw err
    }
    if (access.length === 0) {
      return this.initDb(ctx, roles)
    }
    return access
  }

  // initDb called for when no documents are present in that collection
  async initDb(ctx: ServiceContext, roles: IRole[]): Promise<IAccess[]> {
    let dbCallOptions: any = {}
    if (ctx && ctx.session) {
      dbCallOptions.session = ctx.session
    }

    let access: string
    let accessDoc: Access
    let accessDocs: IAccess[] = []


    // TODO: transaction ?
    for (const role of roles) {
      accessDoc = {
        role: role._id,
        name: `access_${role.role}`, // TODO: check if this is fine
        access: (this.ACCESSES as any)[role.role], // TODO: type this better
        metadata: {}
      }
      let doc = new this.Access(accessDoc)
      let err, result: any
      [err, result] = await to(doc.save())

      if (err != null) {
        throw err
      }
      accessDocs.push(result)
    }
    return accessDocs
  }
}

export default AccessService
