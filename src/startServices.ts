import { httpLogger, imapLogger } from './logger'
import startHTTP, { startGrpcServer } from './server'

export default async function start() {
    httpLogger.info(`Starting the services... (ProcessId: ${process.pid})`)
    httpLogger.info(`Starting HttpServer...`)
    // Always load this first. This starts the Fastify plugin loading process which eventually sets up everything else
    await startHTTP()
    httpLogger.info(`Starting GrpcServer...`)
    await startGrpcServer()
    httpLogger.info(`Starting IMAP server...`)
}