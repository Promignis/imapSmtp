import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Quota"

var quotaSchema = new Schema({
    storageUsed: { type: String, required: true },
    storageQuota: { type: String, required: true },
    maxInbound: { type: String, required: true },
    maxOutbound: { type: String, required: true },
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt'},
    collection: "quotas"
})

const indexes: ModelIndex[] = []

const m: ModelData = {
    schema: quotaSchema,
    name: modelName,
    indexes: indexes
}

export default m