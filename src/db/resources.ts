import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Resource"

export interface Resource {
  resource: string,
  metadata: object
}

export interface IResource extends mongoose.Document, Resource{ }

var resourceSchema = new Schema({
    resource: { type: String, required: true },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "resource" // TODO: get this from config.Collection
})

const indexes: ModelIndex[] = [
    {
        fields: { resource : 1 },
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: resourceSchema,
    name: modelName,
    indexes: indexes
}

export default m
