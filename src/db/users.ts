import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'
import { UserQuotas } from '../types/types'

const Schema = mongoose.Schema;
const modelName = "User"

export interface IUser extends mongoose.Document {
    username: string,
    role: string,
    profile: {
        firstName: string,
        lastName: string
    },
    password: string,
    seed: string,
    primeAddress: mongoose.Types.ObjectId,
    disabled: boolean,
    lastLogin: {
        time: Date,
        event: mongoose.Types.ObjectId
    } | null,
    settings: object,
    quotas: UserQuotas,
    metadata: object
}

// TODO: Add schema level validations for value.
// Schema level validation errors should always throw 5xx error
// User inputs should be validated at api level, not db level

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
        },
    },
    settings: { type: Object }, // TODO: Need to set defaults once req are given
    quotas: {
        storageQuota: { type: Number, required: true },
        maxInbound: { type: Number, required: true },
        maxOutbound: { type: Number, required: true }
    },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "users",
    minimize: false
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