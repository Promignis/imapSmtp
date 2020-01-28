import logger from './logger'
import startHTTP from './server'

export default async function start(){
    logger.info(`Starting the services... (ProcessId: ${process.pid})`)

    await startHTTP()
}