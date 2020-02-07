import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Event"

var eventsSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: { type: String, required: true },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "events"
})

const indexes: ModelIndex[] = [
    { fields: { action: 1 } },
    { fields: { user: 1 } }
]

const m: ModelData = {
    schema: eventsSchema,
    name: modelName,
    indexes: indexes
}

export default m