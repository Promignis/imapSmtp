import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Role"

// model type
export interface Role {
  role: string,
  metadata: object
}

export interface IRole extends mongoose.Document, Role {}

var roleSchema = new Schema({
    role: { type: String, required: true },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "roles" // TODO: get this from config.Collection
})

const indexes: ModelIndex[] = [
    {
        fields: { role : 1 },
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: roleSchema,
    name: modelName,
    indexes: indexes
}

export default m
