import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Access"

export type AccessMap = {
  [key:string]:string[]
}

// model type
export interface Access {
  name: string, // name for particular access
  access: AccessMap,
  role: mongoose.Types.ObjectId,
  metadata: object
}

export interface IAccess extends mongoose.Document, Access {}

var accessSchema = new Schema({
    name: { type: String, required: true },
    access: { type: Object, required: true },
    role: {
            type: Schema.Types.ObjectId,
            ref: 'Access',
            required: true
        },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "access" // TODO: get this from config.Collection
})

const indexes: ModelIndex[] = [
    {
        fields: { name : 1 },
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: accessSchema,
    name: modelName,
    indexes: indexes
}

export default m
