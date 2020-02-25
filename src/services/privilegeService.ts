import { IPrivilege, Privilege } from '../db/privileges'
import mongoose from "mongoose"
import { to } from '../utils'
import {
    ServiceContext
} from '../types/types'


/**
 * Privileges are allowed actions/ side effects over resources
 */

// allows compile time type check for keys
type AllowedPrivileges = {'CREATE': string, 'READ': string, 'UPDATE': string, 'DELETE': string }

export const PRIVILEGES:AllowedPrivileges = {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete'
}

// utility for creating access for resource
export const CRUD:string[] = [PRIVILEGES.CREATE, PRIVILEGES.READ, PRIVILEGES.UPDATE, PRIVILEGES.DELETE]
export const CRU:string[] = [PRIVILEGES.CREATE, PRIVILEGES.READ, PRIVILEGES.UPDATE]
export const RU:string[] = [PRIVILEGES.READ, PRIVILEGES.UPDATE]
export const R:string[] = [PRIVILEGES.READ]
export const U:string[] = [PRIVILEGES.UPDATE]
export const CUD:string[] = [PRIVILEGES.CREATE, PRIVILEGES.UPDATE, PRIVILEGES.DELETE]

class PrivilegeService {

  Privilege: mongoose.Model<IPrivilege>
  PRIVILEGES: AllowedPrivileges

  constructor(privilege:mongoose.Model<IPrivilege>) {
    this.Privilege = privilege
    this.PRIVILEGES = {
      CREATE: 'create',
      READ: 'read',
      UPDATE: 'update',
      DELETE: 'delete'
    }
  }

  // create the default roles
  // don't create if already exists
  async create(ctx: ServiceContext): Promise<IPrivilege[]> {
    let dbCallOptions: mongoose.SaveOptions = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    // check if the privileges exist
    let err,privilege: any
    [err, privilege] = await to(this.Privilege.find({}).exec())

    if(err != null) {
      throw err
    }

    if(privilege.length === 0) {
      return this.initDb(ctx)
    } else {
      return privilege
    }
  }

  async initDb(ctx: ServiceContext): Promise<IPrivilege[]> {
    let dbCallOptions: any = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    let privilege:string
    let privilegeDoc:Privilege
    let privileges:IPrivilege[] = []
    for(privilege of Object.values(this.PRIVILEGES)){
      privilegeDoc = {
        privilege,
        metadata: {}
      }
      let doc = new this.Privilege(privilegeDoc)
      let err, result:any
      [err, result] = await to(doc.save())

      if(err != null) {
        throw err
      }
      privileges.push(result)
    }
    return privileges
  }
}

export default PrivilegeService
