import { EventEmitter } from 'events'
import { IMAPServer } from './imapServer'
import { TLSSocket } from 'tls'
import { State, MAX_MESSAGE_SIZE } from './constants'
import { StreamHandler } from './streamHandler'
import { imapCommandCompiler } from './imapCommandCompiler'
import { IMAPStatusResponse, IMAPDataResponse, IMAPCommandContResponse, IMAPSession } from './types'

const SOCKET_TIMEOUT = 60 * 1000 * 30 // 30 minutes

export class IMAPConnection extends EventEmitter {
    _socket: TLSSocket
    _imapServer: IMAPServer
    // to manage multi part command
    _currentCommand: boolean
    _closed: boolean
    // socket.end method goes through tcp termination process ref: https://www.geeksforgeeks.org/tcp-connection-termination/
    // so it can take some time. 
    // socket.destroy will forcibly close the socket without caring about any acknowledgement from the other end
    // _closing flag represents that end method has called and closing is in progress. If this process takes too much time
    // then we destroy the socket
    _closing: boolean
    _closingTimeout: any
    id: string
    remoteAddress: string
    state: State
    // Selected Mailbox metadata
    selected: boolean;
    selectedMailboxData: any //TODO: Type it
    // current session metadata , for eg. logged in user etc
    session: IMAPSession | null
    // Resolved hostname for remote IP address
    clientHostName: string
    // This will read the incoming tcp strem and extract commands
    streamHandler: StreamHandler

    constructor(soc: TLSSocket, server: IMAPServer, id: string) {
        super()
        this.id = id
        this._socket = soc
        this._imapServer = server
        this._currentCommand = false
        this.remoteAddress = this._socket.remoteAddress || ''
        // All connections start in a Not Authenticated state
        this.state = State.NOTAUTH
        this.session = null
        this.selected = false
        this.selectedMailboxData = {}
        this.clientHostName = ""
        this._closed = false
        this._closing = false
        this._closingTimeout = null
        // Setup stream handler
        this.streamHandler = new StreamHandler(this)
        this._socket.pipe(this.streamHandler)
    }

    init() {
        // Setup event listners
        this._socket.on('error', this._onError);
        this._socket.on('close', this._onClose);
        this._socket.on('end', this._onEnd);

        // there is a time out of 30 minutes as per rfc
        this._socket.setTimeout(SOCKET_TIMEOUT, this._onTimeout);

        this._imapServer.logger.info(`${this.id}: Sending greeting!`)

        // Send OK greeting
        // TODO: Bye greeting will be sent if too many connections
        this.send(`* OK ${process.env.DOMAIN} ready for requests from ${this.remoteAddress}`)
    }

    setSelectedMailbox() {

    }

    setSession(ses: IMAPSession) {
        if (this.session == null) {
            this.session = ses
        }
    }

    setState(state: State) {
        this.state = state
    }

    _startSession() {

    }

    // Called when socket's error event is fired
    _onError = (err: Error) => {
        this._imapServer.logger.error(`${this.id}: Socket error ${err.message || ''}`, err!)
        this.close(false)
        this.emit(err.message)
    }

    // Fired when socket timeouts. It closes the connection
    _onTimeout = () => {
        // In future when IDLE capablity is added , we need to check if the connection is idling beofre timing out
        this._imapServer.logger.info(`${this.id}: Idle connection timed out`)
        this.send('* BYE Idle timeout, closing connection');
        setImmediate(() => this.close(false));
    }

    // Called when the connection is closed
    _onClose = () => {
        clearTimeout(this._closingTimeout)

        if (this._closed) {
            return
        }

        // Remove this connection from server connection list
        this._imapServer.connections.delete(this.id)

        this._closed = true;
        this._closing = false;

        this._imapServer.logger.info(`${this.id}: Closed connection`)
    }

    // Emitted when the other end of the socket sends a FIN packet
    _onEnd = () => {
        this._onClose()
    }

    // Close the socket
    // If force is true then socket.destroy will be called immediately.
    close(forced: false) {
        if (this._closing || this._closed) {
            return
        }

        this._imapServer.logger.info(`${this.id}: Closing connection`)

        if (forced) {
            if (!this._socket.destroyed) {
                this._socket.destroy()
            }

            // destroy does not emit 'close' event so need to call the handler explicitly
            setImmediate(() => this._onClose());

        } else {
            if (!this._socket.destroyed) {
                this._socket.end()
            }

            // If socket termination takes more than 1500ms destroy
            this._closingTimeout = setTimeout(() => {
                if (this._closed) return

                try {
                    this._socket.destroy()
                } catch (err) {

                }

                setImmediate(() => this._onClose());
            }, 1500)

            this._closing = true
        }

    }

    // Returns the list of capablities supported by the server in different states
    _getCapabilities(): string[] {
        let capabilities: string[] = ['IMAP4rev1']
        if (this.state == State.NOTAUTH) {
            capabilities.push('ID') //rfc2971, For server and client to exchange ids
        } else {
            capabilities.push('ID')
            capabilities.push('UNSELECT')
            capabilities.push('CONDSTORE') // rfc4551
            capabilities.push('ENABLE')
            capabilities.push(`APPENDLIMIT=${MAX_MESSAGE_SIZE}`)
            capabilities.push('SPECIAL-USE') // refer rfc6154
            // Capabilities that can be added in future easily
            // capabilities.push('UIDPLUS') // rfc4315 , adds UID EXPUNGE command
            // capabilities.push('UTF8=ACCEPT') // rfc6855
            /** 
             *  We are partially supporting LIST-EXTENDED by the supporting SPECIAL-USE
             *  In future complete support can be added. If the backend does not support
             *  some features then the command handler can ignore some arguments that rfc5258
             *  define. For now not including it
             * */
            // capabilities.push('LIST-EXTENDED') // refer rfc5258
        }

        return capabilities
    }


    // Send response back to client

    // of form TAG STATUS [CODE ARGS]? INFO?
    sendStatusResponse(resp: IMAPStatusResponse, cb?: () => void) {

        let args = resp.args ? `${resp.args.length != 0 ? resp.args.join(' ') : ''}` : ''
        let code = resp.code ? ` [${resp.code} ${args}]` : ''
        let info = resp.info ? ` ${resp.info}` : ''
        let tag = resp.tag || '*'
        let payload = `${tag} ${resp.type}${code}${info}`

        this._imapServer.logger.info(`${this.id}: TAG: ${tag} Status response sent ${JSON.stringify(resp)}`)

        this.send(payload, cb)
    }

    sendDataResponse(resp: IMAPDataResponse, cb?: () => void) {
        if (!resp.tag) {
            resp.tag = '*'
        }
        let payload = imapCommandCompiler(resp)

        this._imapServer.logger.info(`${this.id}: TAG: ${resp.tag} Data response sent for ${resp.command} with payload : ${payload}`)
        this.send(payload, cb)
    }

    sendCommandContResponse(resp: IMAPCommandContResponse, cb?: () => void) {
        this.send(`+ ${resp.info || ''}`)
    }

    sendCapablity() {
        let cap = this._getCapabilities().join(' ')
        let payload = `*  CAPABILITY ${cap}`
        this.send(payload)
    }

    // Send response 
    // Takes an optional callback that will be called after the payload was written successfully
    // Refer: #rfc3501 section 7
    send(payload: string, writeDone?: () => void) {
        if (this._socket && this._socket.writable) {
            try {
                this._socket.write(`${payload}\r\n`, 'binary', (err) => {
                    // write callback may or may not be called with the error as its first argument , so need to check
                    if (err) {
                        this._imapServer.logger.error(`${this.id}: Send error: ${err.message || ''}`, err!)
                        this.close(false)
                        return
                    }

                    // If callback was passed then call it
                    if (typeof writeDone === 'function') {
                        return writeDone();
                    }
                })
            } catch (sendError) {
                this._imapServer.logger.error(`${this.id}: Send error: ${sendError.message || ''}`, sendError!)
                return this.close(false);
            }
        } else {
            this.close(false)
        }
    }
}