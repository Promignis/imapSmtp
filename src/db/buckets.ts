import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Bucket"

var bucketSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: { type: String, required: true },
    size: {type: Number},
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt'}
})

const indexes: ModelIndex[] = [
    {
        fields: { user: 1 },
        options: {
            unique: false
        }
    }
]

const m: ModelData = {
    schema: bucketSchema,
    name: modelName,
    indexes: indexes
}

export default m