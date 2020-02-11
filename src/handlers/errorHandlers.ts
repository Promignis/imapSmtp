import { HTTP_STATUS, ServerError } from '../errors'

interface ErrorMessage {
    status: number,
    error: string,
    message: string
}

// TODO: Add logger 
export function globalErrorHandler(error: any, request: any, reply: any) {
    let msg: ErrorMessage
    console.log(error, "------------------")
    if (error instanceof ServerError) {
        switch (error.status) {
            case HTTP_STATUS.BAD_REQUEST:
                msg = {
                    status: HTTP_STATUS.BAD_REQUEST,
                    error: 'Bad Request',
                    message: error.message,
                }
                reply
                    .code(HTTP_STATUS.BAD_REQUEST)
                    .send(msg)

            case HTTP_STATUS.INTERNAL_SERVER_ERROR:
                msg = {
                    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    error: 'Internal Server Error',
                    message: "Something went wrong",
                }
                reply
                    .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
                    .send(msg)
        }
    }
    else {
        // Genereic Error Message
        msg = {
            status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            error: 'Internal Server Error',
            message: "Something went wrong",
        }
        reply
            .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
            .send(msg)
    }
}