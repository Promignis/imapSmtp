import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createServer, Server, Socket, AddressInfo } from 'net'
import {
    IMAPServerOpts,
    IMAPServerLogger,
    logMessage,
    IMAPHandlerServices
} from './types'
import {
    TLSSocket,
    SecureContext,
    createSecureContext,
    TLSSocketOptions
} from 'tls'
import { v4 as uuidv4 } from 'uuid'
import { ImapServerError, IMAP_INT_ERRORS, IMAP_STATUS } from './imapErrors'
import { IMAPConnection } from './imapConnection'
import { onLoginResp } from './types'

/**
 * Only supports tls connections on port 993
 * Doesn't support 'STARTTLS' flow
 * refer: http://tools.ietf.org/html/rfc8314
 * 
 * As of now does not check for client certificate
 * and so does not support PREAUTH greeting flow. 
 * Clint needs to send LOGIN or AUTHENTICATE commands
 * refer: https://tools.ietf.org/html/rfc8314#section-3.2
 */
export class IMAPServer extends EventEmitter {

    connections: Map<string, IMAPConnection>
    logger: IMAPServerLogger
    maxConnections: number
    server: Server
    secureContexts: Map<string, SecureContext>
    handlerServices: IMAPHandlerServices
    constructor(options: IMAPServerOpts) {
        super();
        this.connections = new Map<string, IMAPConnection>()
        // Default to 1 , can't have 0 maxConnections
        this.maxConnections = (!options.maxConnections || options.maxConnections == 0) ? 1 : options.maxConnections
        this.logger = options.logger || console
        this.secureContexts = new Map()
        // Load all the certs needed
        this._updateCtx()
        this.server = this._createServer()
        // All services are initialized with null 
        // services can then be added while setting up the server
        // This is done so that core IMAP server is decoupled from the services layer
        this.handlerServices = {
            onLogin: null,
            onFetch: null,
            onList: null,
            onLsub: null,
            onSubscribe: null,
            onUnsubscribe: null,
            onCreate: null,
            onRename: null,
            onDelete: null,
            onOpen: null,
            onStatus: null,
            onAppend: null,
            onStore: null,
            onExpunge: null,
            onCopy: null,
            onSearch: null,
        }
        // Setup event listners for server
        this._setListeners()
    }

    listen(port: number, host: string) {
        this.server.listen(port, host);
    }

    /**
     * Can have different secureContext object for different domains
     * "*" represents a wildcard
     */
    _updateCtx(opts?: any) {
        // Certs for wildcard
        // TODO: Move cert paths to config 
        let cert = fs.readFileSync(path.join(process.cwd(), "src/imapv4/imapCerts", "imapv4.server.crt"))
        let key = fs.readFileSync(path.join(process.cwd(), "src/imapv4/imapCerts", "imapv4.server.key"))

        let sessionIdContext = crypto
            .createHash('sha1')
            .update(process.argv.join(' '))
            .digest('hex')
            .slice(0, 32)

        let secureContext = createSecureContext({
            cert,
            key,
            honorCipherOrder: true,
            sessionIdContext
        })

        this.secureContexts.set("*", secureContext)
    }


    _createServer(): Server {
        return createServer((socket: Socket) => {
            this._upgrade(socket, (err, tlssocket) => {
                if (!err) {
                    this._connectSecure(tlssocket!)
                } else {
                    this.logger.error({
                        tag: "",
                        sessionId: "",
                        message: err.message
                    }, err)
                }
            })
        })
    }

    // upgrades socket with tls
    _upgrade(socket: Socket, cb: (err: Error | null, tlsSocket: TLSSocket | null) => void): void {

        let secureCtx = this.secureContexts.get("*")

        if (!secureCtx) {
            cb(new Error('Could not find secureContext for *'), null)
        }

        let tslSocketOptions: TLSSocketOptions = {
            secureContext: secureCtx,
            isServer: true,
            server: this.server,
            requestOCSP: false,
            SNICallback: (servername: string, cb: (err: Error | null, ctx: SecureContext) => void): void => {
                cb(null, secureCtx!)
            }
        }

        let remoteAddress = socket.remoteAddress
        let returned = false;
        let onError = (err: Error) => {
            if (returned) {
                return;
            }
            returned = true;

            err = new ImapServerError(
                IMAP_STATUS.BAD,
                err.message || 'Socket closed while initiating TLS',
                IMAP_INT_ERRORS.CONNECTION_ERROR,
                {
                    protocol: 'imap',
                    stage: 'connect',
                    remoteAddress
                }
            )

            cb(err, null);
        }

        socket.once('error', onError)

        // Upgrade the socket with TLS
        let tlsSocket = new TLSSocket(socket, tslSocketOptions)

        tlsSocket.once('error', onError)
        tlsSocket.once('tlsClientError', onError)

        /**
         * As per Node docs (here: https://nodejs.org/docs/latest-v12.x/api/tls.html#tls_event_secureconnect)
         * event 'secureConnect' is supposed to be triggered. But it only happens when using `new TLSSocket()`.
         * Undocumented event 'secure' (refer: https://github.com/nodejs/node/issues/10555)
         * is triggered when `new TLSSocket is used`
         */
        tlsSocket.on('secure', () => {
            socket.removeListener('error', onError)
            if (returned) {
                try {
                    tlsSocket.end();
                } catch (E) {
                    //
                }
                return;
            }
            returned = true;
            return cb(null, tlsSocket);
        })
    }

    _onError(err: Error) {
        this.emit('error', err);
    }


    _onClose() {
        this.logger.info(<logMessage>{
            tag: "NA",
            sessionId: "NA",
            message: "IMAP Server Closed"
        });
        this.emit('close');
    }

    _onListening() {
        let address = this.server.address();
        let message: string = ""
        if (address == null) {
            message = `Secure IMAP server started`
        } else {
            address = address!
            if (typeof address == 'string') {
                message = `Secure IMAP server listening on ${address}`
            } else {
                let family = <AddressInfo><unknown>address.family
                let add = <AddressInfo><unknown>address.address
                let port = <AddressInfo><unknown>address.port

                message = `Secure IMAP server listening on ${family} - ${add}:${port}`
            }
        }

        this.logger.info({
            tag: "NA",
            sessionId: "NA",
            message: message
        });
    }

    _setListeners() {
        this.server.on('listening', this._onListening.bind(this));
        this.server.on('close', this._onClose.bind(this));
        this.server.on('error', this._onError.bind(this));
    }

    _connectSecure(socket: TLSSocket, ): void {
        // Create new connection id
        let id = this._newConnectionId()
        let newConnection = new IMAPConnection(socket, this, id)
        this.connections.set(id, newConnection)
        // For all logs inside a connection prefix them by connection id and command tag(if present) for easier tracking
        // "<id>:tag:Actual message" 
        this.logger.info(`New connection added from remote address: ${newConnection.remoteAddress} with id: ${id}`)
        newConnection.on('error', this._onError.bind(this))
        newConnection.init()
    }

    _newConnectionId() {
        return `${uuidv4()}_${Date.now()}`
    }
}

let imapServer = new IMAPServer({})

// Attach services
// Mocking it for now
imapServer.handlerServices.onLogin = async function (username: string, password: string): Promise<onLoginResp> {
    return {
        success: true,
        session: {
            userUUID: 'uuid',
            sessionProps: {
                accessKey: "somekey"
            }
        }
    }
}

imapServer.on('error', function (err: Error) {
    //@ts-ignore
    this.logger.error(
        {
            tag: "NA",
            sessionId: "NA",
            message: err.message || `Error event on server`
        },
        err
    )
})

imapServer.listen(4001, '0.0.0.0')