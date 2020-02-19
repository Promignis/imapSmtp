import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Mailbox"

export interface IMailbox extends mongoose.Document {
    user: mongoose.Types.ObjectId,
    address: mongoose.Types.ObjectId,
    name: string,
    imapName: string,
    specialUse: string,
    delimiter: string,
    uidValidity: number,
    uidNext: number
    modifyIndex: number
    subscribed: number
    retention: boolean,
    retentionTime: Date,
    metadata: object
}

var mailboxesSchema = new Schema({
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
    imapName: { type: String, required: true },
    specialUse: { type: String },
    delimiter: { type: String },
    uidValidity: { type: Number, required: true },
    uidNext: { type: Number, required: true },
    modifyIndex: { type: Number, required: true },
    subscribed: { type: Boolean },
    retention: { type: Boolean },
    retentionTime: { type: Date },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "mailboxes",
    minimize: false
})

const indexes: ModelIndex[] = [
    { fields: { user: 1 } },
    {
        // A combination of address user and mailbox name should be unique
        fields: { address: 1, user: 1, name: 1 },
        options: { unique: true }
    }
]

const m: ModelData = {
    schema: mailboxesSchema,
    name: modelName,
    indexes: indexes
}

export default m