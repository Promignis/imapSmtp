import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Bucket"

export interface IBucket extends mongoose.Document {
    user: mongoose.Types.ObjectId,
    address: mongoose.Types.ObjectId,
    name: string,
    size: number,
    metadata: object
} 

var bucketSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true
    },
    name: { type: String, required: true },
    size: {type: Number},
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt'},
    collection: "buckets"
})

const indexes: ModelIndex[] = [
    {
        fields: { user: 1 },
    },
    {
        fields: {address: 1, user: 1, name: 1},
        options: {
            unique: true
        }
    }
]

const m: ModelData = {
    schema: bucketSchema,
    name: modelName,
    indexes: indexes
}

export default m