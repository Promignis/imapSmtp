import mongoose from 'mongoose'

export interface ModelData {
    schema: mongoose.Schema;
    name: string;
    indexes: ModelIndex[]
}

export interface ModelIndex {
    fields: object,
    options?: mongoose.SchemaTypeOpts.IndexOpts
}