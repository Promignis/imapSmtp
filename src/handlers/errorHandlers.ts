import { HTTP_STATUS, ServerError, INT_ERRORS } from '../errors'
import logger from '../logger'

interface ErrorMessage {
    status: number,
    error: string,
    message: string[]
}

// TODO: Add logger
export function globalErrorHandler(error: any, request: any, reply: any) {
    let msg: ErrorMessage
    let message: string[] = []
    if (error instanceof ServerError) {

        // TODO: add better log message
        logger.error(`Server error name: ${error.name} status: ${error.status}, message: ${error.message}`)
        switch (error.status) {
            case HTTP_STATUS.BAD_REQUEST:
                if (error.name == INT_ERRORS.API_VALIDATION_ERR) {
                    /**
                     * In this case error.message property is an object that has an array of validation errrors
                     * For example:
                     * [
                     *  {
                     *      keyword: 'type',
                     *      dataPath: '.tempPassword',
                     *      schemaPath: '#/properties/tempPassword/type',
                     *      params: { type: 'string' },message: 'should be string'}
                     * ]
                     */
                    if (Array.isArray(error.message)) {
                        error.message.forEach(v => {
                            message.push(`${v.dataPath} ${v.message}`)
                        })
                    } else {
                        message.push(error.message)
                    }
                } else {
                    message.push(error.message)
                }
                msg = {
                    status: HTTP_STATUS.BAD_REQUEST,
                    error: 'Bad Request',
                    message: message,
                }
                reply
                    .code(HTTP_STATUS.BAD_REQUEST)
                    .send(msg)

            case HTTP_STATUS.INTERNAL_SERVER_ERROR:
                message.push("Something went wrong")
                msg = {
                    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    error: 'Internal Server Error',
                    message,
                }
                reply
                    .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
                    .send(msg)
            default:
              msg = {
                  status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                  error: 'Internal Server Error',
                  message,
              }
              reply
                .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
                .send(msg)
        }
    }
    else {
        message.push("Something went wrong")
        // Genereic Error Message
        msg = {
            status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            error: 'Internal Server Error',
            message
        }
        reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send(msg)
    }
}
