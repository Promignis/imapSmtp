import * as HttpStatus from 'http-status-codes' // Ref: https://github.com/prettymuchbryce/http-status-codes/blob/master/index.js

export const MONGO_CODES = {
    "DUPLICATE_KEY": 11000
}

export const HTTP_STATUS = HttpStatus

export const INT_ERRORS = {
    API_VALIDATION_ERR: "ApiValidationError", // Thrown by fastify, added to the request object, always 4xx,
    SERVER_ERR: "ServerError", // Custom errors the server throws, could be 4xx or 5xx errors,
    MONGO_ERR: "MongoError", // Any error mongodb driver throws has this name. it will always be 5xx,
    MONGO_VALIDATION_ERR: "ValidationError" // Thrown by mongoose during saving or updating if the input fields are wrong. Could be 4xx or 5xx 
}

export class ServerError extends Error {
    status: number
    message: string
    name: string
    constructor(status: number, message: string, name: string) {
        super(message)
        this.status = status,
            this.message = message,
            this.name = name
    }
}
