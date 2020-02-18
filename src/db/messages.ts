import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'

const Schema = mongoose.Schema;
const modelName = "Message"

var messageSchema = new Schema({
    exp: { type: Boolean },
    retentionDate: { type: Date },
    userRemoved: { type: Boolean },
    idate: { type: Date },
    size: { type: Number, required: true },
    parsedHeaders: { type: Object, required: true },
    subject: { type: String },
    messageId: { type: String, required: true },
    draft: { type: Boolean },
    copied: { type: Boolean },
    attachments: [
        {
            fileId: { type: String, required: true },
            filename: { type: String, required: true },
            contentDisposition: { type: String },
            contentType: { type: String, required: true },
            transferEncoding: { type: String, required: true },
            contentId: { type: String, required: true },
            related: { type: String, required: true }
        }
    ],
    flags: {
        seen: { type: Boolean, required: true },
        starred: { type: Boolean, required: true },
        important: { type: Boolean, required: true },
    },
    body: {
        isHTML: { type: Boolean, required: true },
        contentType: {
            value: { type: String, required: true },
            params: { type: Object },
        },
        bodyEncoding: { type: String, required: true },
        bodyContent: { type: String, required: true },
        children: { type: Array, required: true }
    },
    from: { type: Array, required: true },
    to: { type: Array, required: true },
    cc: { type: Array, required: true },
    bcc: { type: Array, required: true },
    mailbox: {
        type: Schema.Types.ObjectId,
        ref: 'Mailbox',
        required: true
    },
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
    uid: { type: Number, required: true },
    modseq: { type: Number, required: true },
    thread: {
        type: Schema.Types.ObjectId,
        ref: 'Thread',
        required: true
    },
    metadata: { type: Object }
}, {
    // Assigns createdAt and updatedAt fields to the schema,
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    collection: "messages"
})

const indexes: ModelIndex[] = [
    {
        fields: { messageId: 1 },
        options: {
            unique: false
        }
    },
    { fields: { draft: 1 } },
    { fields: { address: 1 } },
    { fields: { user: 1 } },
    { fields: { thread: 1 } },
    { fields: { flags: 1 } }
]

const m: ModelData = {
    schema: messageSchema,
    name: modelName,
    indexes: indexes
}

export default m