import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Privilege"

export interface Privilege {
  privilege: string,
  metadata: object
}

export interface IPrivilege extends mongoose.Document, Privilege { }

var privilegeSchema = new Schema({
    privilege: { type: String, required: true },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "privilege" // TODO: get this from config.Collection
})

const indexes: ModelIndex[] = [
    {
        fields: { privilege : 1 },
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: privilegeSchema,
    name: modelName,
    indexes: indexes
}

export default m
