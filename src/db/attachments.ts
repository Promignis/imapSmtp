import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Attachments"

var attachmentsSchema = new Schema({
    length: { type: Number },
    chunkSize: { type: Number },
    uploadDate: { type: Date },
    md5: { type: String },
    filename: { type: String },
    contentType: { type: String },
    aliases: { type: [String] },
    metadata: { 
        bucket: {
            type: Schema.Types.ObjectId
        }
    },
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
})

const indexes: ModelIndex[] = []

const m: ModelData = {
    schema: attachmentsSchema,
    name: modelName,
    indexes: indexes
}

export default m