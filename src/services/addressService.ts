import mongoose from "mongoose"
import { db } from '../db/connection'
import { to } from '../utils'
import { HTTP_STATUS, ServerError } from '../errors'
import { IAddress } from '../db/addresses'
import { ServiceContext } from '../types/types'

class AddressService {

    Address: mongoose.Model<any>
    Domain: string

    constructor(model: mongoose.Model<any>, domain: string) {
        this.Address = model
        this.Domain = domain
    }

    async checkAvailibility(ctx: ServiceContext, host: string): Promise<boolean> {

        // This options has to be passed into every db call
        // If different db calls need different options like readPreference, batchSize etc
        // then make sure that ctx.session, if present is attached to each one of them
        let dbCallOptions: any = {}
        if (ctx.session){
            dbCallOptions.session = ctx.session
        }
        
        let err: any

        let result: IAddress | null

        [err, result] = await to(this.Address.findOne({"name": name}, dbCallOptions).exec())

        if(err != null){
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
        }

        // Null is returned if no documents were found
        if(!result){
            return true
        }

        return false
    }

    async create(ctx: ServiceContext, user: mongoose.Types.ObjectId, host: string): Promise<IAddress | undefined> {

        let dbCallOptions: any = {}
        if (ctx.session){
            dbCallOptions.session = ctx.session
        }

        let err: ServerError | null
        let availbale: boolean | undefined
        [err, availbale] = await to(this.checkAvailibility(ctx, host))
        if(err != null){
            throw err
        }

        if(!availbale){
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Duplicate host name ${host}`, `ServerError`)
        }

        let doc = new this.Address({
            user: user,
            host: host,
            domain: this.Domain,
            address: `${host}@${this.Domain}`,
            storageUsed: 0,
            metadata: {}
        })

        let queryErr: any
        let result: IAddress | undefined
        [queryErr, availbale] = await to(doc.save(dbCallOptions).exec())

        if(queryErr != null){
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, queryErr.message, queryErr.name || "")
        }

        return result
    }
}

export default new AddressService(db.main.Address, <string>process.env.DOMAIN)