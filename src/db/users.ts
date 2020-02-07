import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "User"

var userSchema = new Schema({
    username: { type: String, required: true, unique: true, },
    role: { type: String, required: true },
    profile: {
        firstName: { type: String },
        lastName: { type: String }
    },
    password: { type: String, required: true },
    seed: { type: String },
    primeAddress: {
        type: Schema.Types.ObjectId,
        ref: 'Address',
        required: true,
        unique: true,
    },
    disabled: { type: Boolean, required: true, default: false },
    lastLogin: {
        time: { type: Date },
        event: {
            type: Schema.Types.ObjectId,
            ref: 'Events'
        }
    },
    settings: { type: Object }, // TODO: Need to set defaults once req are given
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt'},
    collection: "users"
})

const indexes: ModelIndex[] = [
    {
        fields: { username: 1 },
        options: {
            unique: true
        }
    },
    {
        fields: { role: 1 }
    },
]

const m: ModelData = {
    schema: userSchema,
    name: modelName,
    indexes: indexes
}

export default m