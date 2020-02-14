import logger from './logger'
import startHTTP, { startGrpcServer } from './server'

export default async function start() {
    logger.info(`Starting the services... (ProcessId: ${process.pid})`)
    logger.info(`Starting HttpServer...`)
    // Always load this first. This starts the Fastify plugin loading process which eventually sets up everything else
    await startHTTP()
    logger.info(`Starting GrpcServer...`)
    await startGrpcServer()
}