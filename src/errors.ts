import * as HttpStatus from 'http-status-codes' // Ref: https://github.com/prettymuchbryce/http-status-codes/blob/master/index.js

export const MONGO_CODES = {
    "DUPLICATE_KEY": 11000
}

export const HTTP_STATUS = HttpStatus

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

