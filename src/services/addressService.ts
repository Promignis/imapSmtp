import mongoose from "mongoose"
import { db } from '../db/connection'
import { to } from '../utils'
import { HTTP_STATUS, ServerError } from '../errors'
import { IAddress } from '../db/addresses'
import { ServiceContext, FindQuery } from '../types/types'

class AddressService {

    Address: mongoose.Model<IAddress>
    Domain: string

    constructor(model: mongoose.Model<any>, domain: string) {
        this.Address = model
        this.Domain = domain
    }

    async checkAvailibility(ctx: ServiceContext, address: string): Promise<IAddress | null> {

        // This options has to be passed into every db call
        // If different db calls need different options like readPreference, batchSize etc
        // then make sure that ctx.session, if present is attached to each one of them
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let err: any

        let result: any

        [err, result] = await to(this.Address.findOne({ "address": address }, null, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
        }

        // Null is returned if no documents were found
        if (!result) {
            return null
        }

        return result
    }

    async create(ctx: ServiceContext, user: mongoose.Types.ObjectId, host: string): Promise<IAddress> {

        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let newAddress: string = `${host}@${this.Domain}`

        let err: ServerError | null
        let availbale: any
        [err, availbale] = await to(this.checkAvailibility(ctx, newAddress))
        if (err != null) {
            throw err
        }

        if (availbale != null) {
            throw new ServerError(HTTP_STATUS.BAD_REQUEST, `Duplicate host name ${host} for domain ${this.Domain}`, `ServerError`)
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
        let result: any
        [queryErr, result] = await to(doc.save(dbCallOptions))

        if (queryErr != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, queryErr.message, queryErr.name || "")
        }

        return <IAddress>result
    }

    async findAddresses(ctx: ServiceContext, query: FindQuery, options?: object): Promise<any> {
        let dbCallOptions: any = {}
        if (ctx.session) {
            dbCallOptions.session = ctx.session
        }

        let projection: string | null = query.projection ? query.projection : null

        let err: any
        let res: any

        [err, res] = await to(this.Address.find(query.filter, projection, dbCallOptions).exec())

        if (err != null) {
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
        }

        return res
    }
}

export default AddressService