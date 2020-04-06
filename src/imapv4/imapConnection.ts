import { EventEmitter } from 'events'
import os from 'os'
import { IMAPServer } from './imapServer'
import { TLSSocket } from 'tls'
import { State } from './types'
import { StreamHandler } from './streamHandler'

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
    sessionMetadata: any //TODO: Type it
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
        this.sessionMetadata = {}
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

        // Send greeting
        this.send(`* OK ${process.env.DOMAIN} ready for requests from ${this.remoteAddress}`)
    }

    setSelectedMailbox() {

    }

    setSessionMetadata() {

    }

    _startSession() {

    }

    // Called when socket's error event is fired
    _onError = (err: Error) => {
        this._imapServer.logger.error(`${this.id}: Socket error ${err.message || ''}`, err!)
        this.close(false)
        return
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

    // Send response 
    // Takes an optional callback that will be called after the payload was written successfully
    // TODO: Add a response object type , with Tag, status Message and results
    // Refer: #rfc3501_line2687 
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