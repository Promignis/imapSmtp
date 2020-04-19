import { PubSub } from './PubSub'
import { EventEmitter } from 'events'
import config from './config'

export const events: { [key: string]: string } = {
    new: 'msg_event_NEW'
}

interface NewMessageNotification {
    userid: string
    mailboxId: string
    uid: number
    modseq?: number
}

export class MessageNotifier extends EventEmitter {
    notifier: PubSub
    constructor() {
        super()
        let host = <string>config.get("redis.host")
        let port = <number>config.get("redis.port")
        this.notifier = new PubSub({ host, port })

        this.setupListners()
    }

    notifyNewMessage = (msg: NewMessageNotification) => {
        let message = JSON.stringify(msg)
        this.notifier.publish(events.new, message)
    }

    setupListners = async () => {
        // Subscribe to the channels
        await this.notifier.subscriber.subscribe(...Object.values(events))

        // Listen for all published messages  
        this.notifier.subscriber.on('message', (channel: string, message: string) => {
            let msg: NewMessageNotification
            try {
                msg = JSON.parse(message)
            } catch (e) {
                return
            }
            //Check if channel scope was correct
            switch (channel) {
                case events.new:
                    console.log('emiting...')
                    this.emit(events.new, msg)
                    break;
                default:
                    break;
            }
            return
        })
    }
}