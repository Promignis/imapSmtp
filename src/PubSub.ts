import redis from 'ioredis'

export class PubSub {
    clientOptions: redis.RedisOptions
    scope: string // Only pubsub objects with same scope can talk to eachother, '' is a global scope
    publisher: redis.Redis
    subscriber: redis.Redis
    constructor(opts: redis.RedisOptions, scope?: string) {
        this.clientOptions = opts
        this.scope = scope || ''
        // initialize the pub and sub objects
        this.publisher = new redis(this.clientOptions)
        this.subscriber = new redis(this.clientOptions)
    }

    publish(channel: string, message: string) {
        let ch = `${this.scope}${channel}`
        this.publisher.publish(ch, message)
    }
}