import fastifyPlugin from 'fastify-plugin'
import imapServer from './imapv4'
import { onLoginResp, IMAPSession, IMAPServerLogger } from './imapv4/index.d'
import { IUser } from './db/users'
import { to } from './utils'
import { imapLogger } from './logger'

async function setupIMAPServer(fastify: any, { }, done: Function) {

    // TODO: Add logger
    let server = new imapServer({ logger: imapLogger })

    // attach services
    server.handlerServices.onLogin = login(fastify)

    fastify.decorate('imapServer', server)

    done()
}

function login(fastify: any) {
    return async function (username: string, password: string): Promise<onLoginResp> {
        let resp: onLoginResp

        let err: Error | null | undefined
        let userObj: IUser | undefined

        [err, userObj] = await to(fastify.services.userService.login({}, username, password))

        if (err != null) {
            // Right now login method throws error of incorrect credentials 
            // So check if the error was because of wrong credential or some other error
            // TODO: Fix this flow. Should return some value (maybe null?) instead of throwing an error
            if (err.message == 'Incorrect password') {
                resp = {
                    success: false,
                    // Session value will be ignored if login failed so we can keep this empty
                    session: <IMAPSession>{}
                }

                return resp
            }

            throw err
        }

        // Login was successful
        resp = {
            success: true,
            session: {
                userUUID: userObj!.id,
                sessionProps: {
                    username: userObj!.username
                }
            }
        }

        return resp
    }
}

export const setupIMAPPlugin = fastifyPlugin(setupIMAPServer)