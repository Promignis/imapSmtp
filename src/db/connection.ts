import mongoose from 'mongoose'
import config from '../config'
import logger from '../logger'
import {ModelData} from './types'
import userModel from './users'
import fastifyPlugin from 'fastify-plugin'

const connectionSettings = {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
    autoIndex: <boolean>config.get("db.connection.autoIndex"),
    poolSize: <number>config.get("db.connection.connectionPoolSize"),
    // When useUnifiedTopology is set to true we have to use serverSelectionTimeoutMS instead of connectTimeoutMS
    serverSelectionTimeoutMS: <number>config.get("db.connection.initialConnectionTimeOut"),
    // If this is 0, then OS default timeouts are used.
    // The number of milliseconds a socket stays inactive after the driver has successfully connected before closing
    socketTimeoutMS: <number>config.get("db.connection.socketTimeOut")
}

const username = <string>config.get("db.username")
const password = <string>config.get("db.password")
const host = <string>config.get("db.host")
const dbName = <string>config.get("db.name")

const uri = `mongodb://${username}:${password}@${host}/${dbName}?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin&retryWrites=true`

async function connector(uri: string, settings: any) {

    await mongoose.connect(uri, settings)

}

const modelData: ModelData[] = [
    userModel
]

function createModels(modelData: ModelData[]) : {[name:string]: mongoose.Model<any>}{

    let r: {[name:string]: mongoose.Model<any>} = {}

    if (modelData.length == 0){
        return r
    }
    
    // Add indexes
    modelData.forEach(m => {
        m.indexes.forEach(index => {
            m.schema.index(index)
        });
    })

    // Create Models
    modelData.forEach(m => {
        let model = mongoose.model(m.name, m.schema)
        r[m.name] = model
    })
    
    return r
}

let decorator: any = {}

async function setupMongoDBPlugin(fastify :any , {}) {
    logger.info("Connection with Mongo...")

    try {
        await connector(uri, connectionSettings)
    } catch (e) {
        // Log and propogate error through the fastify plugin chain
        logger.error("Could not establish a connection with mongoDB: ", e.reason)
        throw e
    }

    decorator["instance"] = mongoose

    let models = createModels(modelData)

    // Decorate

    if(Object.keys(models).length != 0){
        Object.keys(models).forEach(m => {
            decorator[m] = models[m]
        })
    }

    fastify.decorate("mongoose", decorator);

    // Close connection when app is closing
    fastify.addHook("onClose", (fastify :any, done: Function) => {
        fastify.mongoose.instance.connection.on("close", function() {
            done();
        });
        fastify.mongoose.instance.connection.close();
    });
}

export const mongoosePlugin = fastifyPlugin(setupMongoDBPlugin)
export const db = decorator

