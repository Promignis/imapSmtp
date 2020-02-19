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


    info(msg: string) {
        this.logger.info(msg)
    }

    error(msg: string, err: Error | undefined = undefined) {
        if (!(err instanceof Error)) err = undefined
        if (err == undefined) {
            this.logger.error(msg)
        } else {
            this.logger.error(msg, err)
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