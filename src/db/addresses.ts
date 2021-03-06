import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Address"

export interface IAddress extends mongoose.Document {
    user: mongoose.Types.ObjectId,
    host: string,
    domain: string,
    address: string,
    storageUsed: number,
    metadata: object
}

var addressAcema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    host: { type: String, required: true },
    domain: { type: String, required: true },
    address: { type: String, required: true, unique: true },
    storageUsed: { type: Number, required: true },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "addresses",
    minimize: false
})

const indexes: ModelIndex[] = [
    {
        fields: { user: 1 },
    },
    {
        fields: { address: 1 },
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: addressAcema,
    name: modelName,
    indexes: indexes
}

export default m
