import { IResource, Resource } from '../db/resources'
import mongoose from "mongoose"
import { to } from '../utils'
import {
    ServiceContext
} from '../types/types'


/**
 * resources are entities that are protected by the ACL
 */

// allows compile time type check for keys
type AllowedResources = {'USER': string, 'USER_PROFILE_NAME': string, 'USER_ROLE': string, 'USER_PASSWORD': string, 'ADDRESS': string, 'STORAGE': string, 'SETTINGS': string, 'USER_PROFILE': string, 'USER_PROFILE_LAST_LOGIN': string}

// TODO: create ADMIN resource

export const RESOURCES:AllowedResources = {
  USER: 'user',
  USER_PROFILE_NAME: 'user_profile_name',
  USER_ROLE: 'user_role',
  USER_PASSWORD: 'user_password',
  ADDRESS: 'address',
  STORAGE: 'storage',
  SETTINGS: 'settings',
  USER_PROFILE: 'user_profile',
  USER_PROFILE_LAST_LOGIN: 'user_profile_last_login'
}

class ResourceService {

  Resource: mongoose.Model<IResource>
  RESOURCES: AllowedResources

  constructor(resource:mongoose.Model<IResource>) {
    this.Resource = resource
    this.RESOURCES = {
      USER: 'user',
      USER_PROFILE_NAME: 'user_profile_name',
      USER_ROLE: 'user_role',
      USER_PASSWORD: 'user_password',
      ADDRESS: 'address',
      STORAGE: 'storage',
      SETTINGS: 'settings',
      USER_PROFILE: 'user_profile',
      USER_PROFILE_LAST_LOGIN: 'user_profile_last_login'
    }
  }

  // create the default roles
  // don't create if already exists
  async create(ctx: ServiceContext): Promise<IResource[]> {
    let dbCallOptions: mongoose.SaveOptions = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    // check if the roles exist
    let filter = {}
    let err, resource: any
    [err, resource] = await to(this.Resource.find(filter).exec())

    if(err != null) {
      throw err
    }
    if(resource.length === 0) {
      return this.initDb(ctx)
    } else {
      return resource
    }
  }

  async initDb(ctx: ServiceContext): Promise<IResource[]> {
    let dbCallOptions: any = {}
    if (ctx && ctx.session) {
        dbCallOptions.session = ctx.session
    }

    let resource:string
    let resourceDoc:Resource
    let resources:IResource[] = []
    for(resource of Object.values(this.RESOURCES)){
      resourceDoc = {
        resource,
        metadata: {}
      }
      let doc = new this.Resource(resourceDoc)
      let err, result:any
      [err, result] = await to(doc.save())

      if(err != null) {
        throw err
      }
      resources.push(result)
    }
    return resources
  }
}

export default ResourceService
