import mongoose from 'mongoose'
import config from '../config'
import logger from '../logger'
import { ModelData } from './types'
import userModel from './users'
import attachmentModel from './attachments'
import bucketsModel from './buckets'
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

const appUsername = <string>config.get("db.username")
const appPassword = <string>config.get("db.password")
const appHost = <string>config.get("db.host")
const appDBName = <string>config.get("db.name")
let attachmentDBEnabled = false

// Mongoose by default only supports one connection. This is used to have multiple mongo connections 
interface connectionParams {
    name: string,
    uri: string,
    settings: any,
    schemas: ModelData[]
}
interface connections {
    [key: string]: {
        "connection": mongoose.Connection,
        "models": { [name: string]: mongoose.Model<any> }
    }
}

function createMongoConnectionUrl(host: string, username: string, password: string, dbName: string): string {
    return `mongodb://${username}:${password}@${host}/${dbName}?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin&retryWrites=true`
}

if (<boolean>config.get("db.attachmentdb.enabled")) {
    attachmentDBEnabled = true
}

let mainConnectionParams: connectionParams = {
    name: appDBName,
    uri: createMongoConnectionUrl(appHost, appUsername, appPassword, appDBName),
    settings: connectionSettings,
    schemas: [userModel, bucketsModel]
}

let connectionParams: connectionParams[] = []

connectionParams.push(mainConnectionParams)

if (attachmentDBEnabled) {
    let name: string = <string>config.get("db.attachmentdb.name") != "" ? <string>config.get("db.attachmentdb.name") : "gridfs"
    let host: string = <string>config.get("db.attachmentdb.host")
    let username: string = <string>config.get("db.attachmentdb.username")
    let password: string = <string>config.get("db.attachmentdb.password")
    connectionParams.push({
        name: name,
        uri: createMongoConnectionUrl(host, username, password, name),
        settings: connectionSettings,
        schemas: [attachmentModel]
    })
}

async function createConnection(connParams: connectionParams[]): Promise<connections | null> {

    if (connParams.length == 0) {
        return null
    }

    let connections: connections = {} as connections

    for (let i = 0; i < connParams.length; i++) {
        let name = connParams[i].name
        let uri = connParams[i].uri
        let settings = connParams[i].settings

        let dbCon = await mongoose.createConnection(uri, settings)

        logger.info(`Connected with DB ${name}.`)

        dbCon.on('reconnected', function () {
            logger.info(`DB ${name} reconnected`);
        });

        let models = createModels(dbCon, connParams[i].schemas)

        connections[name] = {
            "connection": dbCon,
            "models": models
        }
    }

    return connections
}

function createModels(conn: mongoose.Connection, modelData: ModelData[]): { [name: string]: mongoose.Model<any> } {
    let r: { [name: string]: mongoose.Model<any> } = {}

    if (modelData.length == 0) {
        return r
    }

    // Add indexes
    modelData.forEach(m => {
        console.log(m.name, " :- adding index for")
        m.indexes.forEach(index => {
            m.schema.index(index.fields, index.options)
        });
    })

    // Create Models
    modelData.forEach(m => {
        let model = conn.model(m.name, m.schema)
        r[m.name] = model
    })

    return r
}

let decorator: any = {}

async function setupMongoDBPlugin(fastify: any, { }) {

    let dbConnections: connections | null = {} as connections

    try {
        dbConnections = await createConnection(connectionParams)
    } catch (e) {
        // Log and propogate error through the fastify plugin chain
        logger.error("Could not establish a connection with mongoDB: ", e.reason)
        throw e
    }

    let decorator: any = {}

    // Decorate
    if (dbConnections != null && Object.keys(dbConnections).length != 0) {
        decorator = dbConnections
    }

    // Will be used like: fastify.db.app.User.save({}) or fastify.db.attachments
    fastify.decorate("db", decorator);

    // Close connection when app is closing
    fastify.addHook("onClose", (fastify: any, done: Function) => {
        fastify.mongoose.instance.connection.on("close", function () {
            done();
        });
        fastify.mongoose.instance.connection.close();
    });
}

export const mongoosePlugin = fastifyPlugin(setupMongoDBPlugin)
export const db = decorator

