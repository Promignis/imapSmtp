const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
const ps = require('promisify-call')
const path = require('path')

exports.setupProtoClient = function (server, next) {
    const plugin = this;
    const proto = protoLoader.loadSync(path.join(process.cwd(), "../", "src/proto/mail.proto"))
    const definition = grpc.loadPackageDefinition(proto);
    const mailService = definition.MailService
    // TODO: move the connection host and port data to config and remove hardcoding
    plugin.grpcClient = new mailService("0.0.0.0:50051", grpc.credentials.createInsecure())
    next()
}

exports.register = function () {
    const plugin = this;
    plugin.logdebug('Initializing Bizgaze Plugin.', plugin);
    plugin.load_lmtp_ini();
    plugin.register_hook('init_master', 'init_bizgaze_shared');
    plugin.register_hook('init_child', 'init_bizgaze_shared');
};

exports.init_bizgaze_shared = function (next, server) {
    const plugin = this;
    plugin.setupProtoClient(server, next);
};

exports.load_lmtp_ini = function () {
    const plugin = this;
    plugin.cfg = plugin.config.get('lmtp.ini', () => {
        plugin.load_lmtp_ini();
    })
}

// Register Plugins

exports.hook_queue_outbound = function (next, connection) {
    let txn = connection.transaction
    connection.loginfo('inside hook_queue_outbound ====================1')

    let sender = txn.header.headers['sender'][0].trim()
    let messageId = txn.header.headers['message-id'][0].trim()
    txn.notes['messageId'] = messageId
    txn.notes['sender'] = sender
    ps(this.grpcClient, this.grpcClient.checkValidity, { address: sender })
        .then(resp => {
            if (resp.valid) {
                next(CONT)
            } else {
                next(DENY, "No Such User")
            }
        })
        .catch(e => {
            connection.logerror(`Error validating address: ${e.toString()}`)
            next(DENY, `Error sending the email from address ${address}`)
        })
}

exports.hook_send_email = function (next, hmail) {
    next()
}

exports.hook_deferred = function (next, hmail, info) {
    this.loginfo('inside hook_deferred ====================3')

    let rcpt = hmail.todo.rcpt_to
    /**
     * Has the following shape in case errors happen
     * original : ""
     * original_host : "bizgaze.co"
     * host : "bizgaze.co"
     * user : "abc"
     * reason : "450 Error ----- Error"
     * dsn_action : "delayed"
     * dsn_smtp_code : "450"
     * dsn_smtp_response : "Error ----- Error"
     * dsn_remote_mta : "127.0.0.1"
     */

    let message = ""

    rcpt.forEach(function (r) {
        message = message + `Failed for ${r.host || ""}. Reason:  ${r.reason || "Unknown"}, `
    })

    let messageId = hmail.todo.notes.messageId
    // Max retries
    if (hmail.num_failures == 1) {
        ps(this.grpcClient, this.grpcClient.updateSavedMessage, {
            messageId: messageId,
            stage: 'deferred',
            message: message
        })
            .then(resp => {
                next(OK) // this will stop anymore retries
            })
            .catch(e => {
                this.logerror(`Error Updating message with messageid ${messageId}: ${e.toString()}`)
                // Even if some error happened updating the message, for now ignore
                next(OK) // this will stop anymore retries
            })
    } else {
        next()
    }
}

exports.hook_bounce = function (next, hmail, error) {
    let messageId = hmail.todo.notes.messageId
    ps(this.grpcClient, this.grpcClient.updateSavedMessage, {
        messageId: messageId,
        stage: 'bounced',
        message: `Message was bounced: ${JSON.stringify(error)}`
    })
        .then(resp => {
            next(OK) // Stop it from sending a bounce messages. Bounce is not supported in this version
        })
        .catch(e => {
            this.logerror(`Error Updating message with messageid ${messageId}: ${e.toString()}`)
            // Even if some error happened updating the message, for now ignore
            next(OK)
        })
}

exports.hook_delivered = function (next, hmail, params) {
    let messageId = hmail.todo.notes.messageId
    ps(this.grpcClient, this.grpcClient.updateSavedMessage, {
        messageId: messageId,
        stage: 'delivered',
        message: 'Delivered Successfully'
    })
        .then(resp => {
            next(OK)
        })
        .catch(e => {
            this.logerror(`Error Updating message with messageid ${messageId}: ${e.toString()}`)
            // Even if some error happened updating the message, for now ignore
            next(OK)
        })
}

// Only for use in development
// exports.hook_get_mx = function (next, hmail, domain) {

//     //TODO: Its not clear how notes.using_lmtp is being set, So hardcoding true for now
//     hmail.todo.notes.using_lmtp = true

//     const mx = { using_lmtp: true, priority: 0 };

//     // This points to lmtplocal server
//     Object.assign(mx, {
//         exchange: '127.0.0.1',
//         port: 2423,
//         bind_helo: '127.0.0.1' // if me file added this is not needed
//     });

//     return next(OK, mx);
// }


