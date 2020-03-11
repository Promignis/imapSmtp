import { EventEmitter } from 'events'
import { IMAPServer } from './imapServer'
import { TLSSocket } from 'tls'

export class IMAPConnection extends EventEmitter {
    socket: TLSSocket
    imapServer: IMAPServer
    constructor(soc: TLSSocket, server: IMAPServer) {
        super()
        this.socket = soc
        this.imapServer = server
    }

    init() {

    }
}