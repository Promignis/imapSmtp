import mongoose from "mongoose"
import { db } from '../db/connection'
import { to } from '../utils'
import { HTTP_STATUS, MONGO_CODES, ServerError } from '../errors'
import mongodb from 'mongodb'
import { IAddress } from '../db/addresses'

class AddressService {

    Address: mongoose.Model<any>
    Domain: string

    constructor(model: mongoose.Model<any>, domain: string) {
        this.Address = model
        this.Domain = domain
    }

    async checkAvailibility(host: string): Promise<boolean> {

        let err: any

        let result: IAddress | null

        [err, result] = await to(this.Address.findOne({"name": name}).exec())

        if(err != null){
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, err.message, err.name || "")
        }

        // Null is returned if no documents were found
        if(!result){
            return true
        }

        return false
    }

    async create(user: mongoose.Types.ObjectId, host: string): Promise<IAddress | undefined> {

        let err: ServerError | null
        let availbale: boolean | undefined
        [err, availbale] = await to(this.checkAvailibility(host))
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
        [queryErr, availbale] = await to(doc.save().exec())

        if(queryErr != null){
            throw new ServerError(HTTP_STATUS.INTERNAL_SERVER_ERROR, queryErr.message, queryErr.name || "")
        }

        return result
    }
}

export default new AddressService(db.main.Address, <string>process.env.DOMAIN)