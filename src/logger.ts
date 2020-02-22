import * as fs from 'fs'
import { createLogger, transports, format } from 'winston'
import config from './config'
import "winston-daily-rotate-file"


let fileName = <string>config.get("logger.logFile")
let filePath = <string>config.get("logger.logDirectory")

// Winston does not create directories
if (!fs.existsSync(filePath)) {
    // Create the directory if it does not exist
    fs.mkdirSync(filePath, { recursive: true })
}

// Formats
// This will colorize the logs in console
const colorizeFormat = format.colorize({ colors: { info: 'blue', error: 'red', warn: 'yellow' } })
// This will log the stack trace
const errorsFormat = format.errors({ stack: true })


const consoleFormat = format.combine(format.timestamp(), colorizeFormat, errorsFormat, format.simple())
const fileFormtat = format.combine(format.timestamp(), errorsFormat, format.json())

// Refer https://github.com/winstonjs/winston/blob/master/docs/transports.md for more options
let loggerOptions = {
    file: {
        level: 'info',
        filename: fileName,
        dirname: filePath,
        format: fileFormtat
    },
    console: {
        level: 'silly',
        format: consoleFormat
    },
    rotateFile: {
        level: 'info',
        filename: `%DATE%_${fileName}`,
        dirname: filePath,
        format: fileFormtat,
        datePattern: <string>config.get("logger.dateFormat"),
        maxSize: <number>config.get("logger.maxLogFilesNumber"),
        frequency: <string>config.get("logger.rotationFrequency")
    }
}

const consoleTransport = new transports.Console(loggerOptions.console)
const rotatingFileTransport = new transports.DailyRotateFile(loggerOptions.rotateFile)


let logger = createLogger(
    {
        transports: [
            rotatingFileTransport,
        ]
    }
)

if (process.env.NODE_ENV !== 'production') {
    // Will add console logging only in development enviornment
    logger.add(consoleTransport)
}

// Refer: https://github.com/fastify/fastify/blob/master/docs/Logging.md
class FastifyCompliantLogger {

    logger: any
    constructor(logger: any) {
        this.logger = logger;
    }

    _fastifySerilizer(msg: any): any {
        let keys = Object.keys(msg)

        if (keys.includes('err') && keys.includes('res')) {
            let res = msg['res']
            let error = msg['err']
            let responseTime = msg['responseTime']
            return {
                message: this._serializeRes(res, responseTime),
                error: error
            }

        } else if (keys.includes('res')) {
            let res = msg['res']
            let responseTime = msg['responseTime']
            return {
                message: this._serializeRes(res, responseTime),
            }

        } else if (keys.includes('req')) {
            let req = msg['req']
            let method = req.method
            let url = req.url
            let hostname = req.hostname
            let remoteAddress = req.ip
            let remotePort = req.connection.remotePort

            let message = `${method} ${url} with host:${hostname} from:${remoteAddress}:${remotePort}`

            return {
                message: message
            }

        } else {
            // Could not match with known keys, throw error and return a generic message
            this.error(`Unknown keys found while logging: ${JSON.stringify(keys)}`)
            return {
                message: "Unknown Key error"
            }
        }
    }

    _serializeRes(res: any, responseTime: number): String {
        return `Responded with status:${res.statusCode} in ${responseTime}ms`
    }

    info(msg: string) {
        let message = msg
        if (typeof msg == 'object') {
            let serialized: any = this._fastifySerilizer(msg)
            message = serialized.message
        }
        this.logger.info(message)
    }

    error(msg: string, err: Error | undefined = undefined) {
        let message = msg
        let error: Error | undefined = err
        if (typeof msg == 'object') {
            let serialized: any = this._fastifySerilizer(msg)
            message = serialized.message
            error = serialized.error
        }
        if (!(error instanceof Error)) error = undefined
        if (error == undefined) {
            this.logger.error(message)
        } else {
            this.logger.error(message, error)
        }
    }

    debug(msg: string) {
        this.logger.debug(msg)
    }

    fatal(msg: string) {
        this.logger.error(msg)
    }

    warn(msg: string) {
        this.logger.warn(msg)
    }

    trace(msg: string) {
        this.logger.verbose(msg)
    }

    child() {
        return new FastifyCompliantLogger(this.logger)
    }
}

export default new FastifyCompliantLogger(logger)
