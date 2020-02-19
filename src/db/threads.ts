import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Thread"

export interface IThreads extends mongoose.Document {
    user: mongoose.Types.ObjectId,
    address: mongoose.Types.ObjectId,
    subject: string,
    referenceIds: string[],
    participents: string[],
    metadata: object
}

var threadSchema = new Schema({
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
    subject: { type: String, required: true },
    referenceIds: [
        { type: String, required: true }
    ],
    participents: [
        { type: String, required: true }
    ],
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "threads",
    minimize: false
})

const indexes: ModelIndex[] = [
    { fields: { user: 1 } },
    { fields: { referenceIds: 1 } }
]

const m: ModelData = {
    schema: threadSchema,
    name: modelName,
    indexes: indexes
}

export default m