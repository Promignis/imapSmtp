import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Attachment"

var attachmentsSchema = new Schema({
    length: { type: Number },
    chunkSize: { type: Number },
    uploadDate: { type: Date },
    md5: { type: String },
    filename: { type: String },
    contentType: { type: String },
    aliases: { type: [String] },
    metadata: {
        count: {
            type: Number
        }
    },
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "attachments.files"
})

const indexes: ModelIndex[] = []

const m: ModelData = {
    schema: attachmentsSchema,
    name: modelName,
    indexes: indexes
}

export default m