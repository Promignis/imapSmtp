import logger from './logger'

export default function start(){
    logger.info(`Starting the services... (ProcessId: ${process.pid})`)
}