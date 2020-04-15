import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Thread"

export interface IThread {
    user: mongoose.Types.ObjectId,
    address: mongoose.Types.ObjectId,
    subject: string | null,
    references: string[],
    metadata: object
}

export interface IThreadDoc extends mongoose.Document, IThread { }

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
    subject: { type: String },
    references: [
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