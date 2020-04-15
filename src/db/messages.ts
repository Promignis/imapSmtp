import mongoose from 'mongoose'
import { ModelData, ModelIndex } from './types'
import { mongoosePaginatePlugin } from './paginate'

const Schema = mongoose.Schema;
const modelName = "Message"

export interface IAttachment {
    fileId: mongoose.Types.ObjectId,
    filename: string,
    contentDisposition: string,
    contentType: string,
    transferEncoding: string,
    contentId: string,
    related: boolean,
    size: number
}

export interface IRcpt {
    original: string,
    originalHost: string,
    host: string,
    user: string
}

export interface IMessage {
    rootId: mongoose.Types.ObjectId | null,
    exp: boolean,
    retentionDate: Date,
    userRemoved: boolean,
    idate: Date,
    size: number,
    parsedHeaders: object,
    messageId: string,
    draft: boolean,
    copied: boolean,
    attachments: IAttachment[],
    hasAttachments: boolean,
    flags: {
        seen: boolean,
        starred: boolean,
        important: boolean
    },
    body: object,
    imapBodyStructure: object,
    imapEnvelope: object,
    text: string,
    html: Array<string>,
    from: Array<string>,
    to: Array<string>,
    cc: Array<string>,
    bcc: Array<string>,
    rcpt: IRcpt[],
    mailbox: mongoose.Types.ObjectId,
    user: mongoose.Types.ObjectId,
    address: mongoose.Types.ObjectId,
    uid: number,
    modseq: number,
    thread: mongoose.Types.ObjectId,
    metadata: object,
}

export interface IMessageDoc extends IMessage, mongoose.Document {
    paginate: Function // from the plugin
}

var messageSchema = new Schema({
    rootId: { type: Schema.Types.ObjectId },
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
            fileId: {
                type: Schema.Types.ObjectId,
                ref: 'Attachment',
                required: true
            },
            filename: { type: String, required: true },
            contentDisposition: { type: String },
            contentType: { type: String, required: true },
            transferEncoding: { type: String },
            contentId: { type: String },
            related: { type: String, required: true },
            size: { type: Number, required: true } //// Number of bytes
        }
    ],
    hasAttachments: { type: Boolean, required: true }, // Will make it easier to filter emails
    flags: {
        seen: { type: Boolean, required: true },
        starred: { type: Boolean, required: true },
        important: { type: Boolean, required: true },
    },
    body: { type: Object, required: true },
    imapBodyStructure: { type: Object, required: true },
    imapEnvelope: { type: Object, required: true },
    text: { type: String, required: true },
    html: { type: Array },
    from: { type: Array, required: true },
    to: { type: Array, required: true },
    cc: { type: Array, required: true },
    bcc: { type: Array, required: true },
    rcpt: [
        {
            original: { type: String, required: true },
            originalHost: { type: String, required: true },
            host: { type: String, required: true },
            user: { type: String, required: true }
        }
    ],
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
    collection: "messages",
    minimize: false
})

messageSchema.plugin(mongoosePaginatePlugin) // This will add 'paginate' method to message model

const indexes: ModelIndex[] = [
    {
        fields: { messageId: 1 },
        options: {
            unique: false
        }
    },
    { fields: { hasAttachments: 1 } },
    { fields: { from: 1 } }, // Multi-Key index. Will make filtering faster
    { fields: { draft: 1 } },
    { fields: { address: 1 } },
    { fields: { user: 1 } },
    { fields: { thread: 1 } },
    { fields: { flags: 1 } },
    { fields: { idate: 1 } }, // This will speed up get mail list
    { fields: { idate: -1 } }, // To support 
]

const m: ModelData = {
    schema: messageSchema,
    name: modelName,
    indexes: indexes
}

export default m