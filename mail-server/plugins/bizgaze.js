const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')
const ps = require('promisify-call')


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
    plugin.register_hook('init_master', 'init_bizgaze_shared');
    plugin.register_hook('init_child', 'init_bizgaze_shared');
};

exports.init_bizgaze_shared = function (next, server) {
    const plugin = this;
    plugin.setupProtoClient(server, next);
};


// Register Plugins

exports.hook_mail = function (next, connection, params) {
    next();
}

exports.hook_data = function (next, connection) {
    connection.transaction.parse_body = true;
    connection.transaction.attachment_hooks(
        function (ct, fn, body, stream) {
            start_att(connection, ct, fn, body, stream)
        }
    );
    next();
}

exports.hook_rcpt = function (next, connection, params) {
    // Outbound
    if (connection.relaying) {
        return next()
    }

    let rcpt = params[0];

    // Using * is not allowed in addresses
    if (/\*/.test(rcpt.user)) {
        tnx.notes.rejectCode = 'NO_SUCH_USER';
        next(DENYSOFT, DSN.no_such_user());
    }

    // Check if address is valid
    let address = `${rcpt.user}@${rcpt.host}`
    ps(this.grpcClient, this.grpcClient.checkValidity, { address: address })
        .then(resp => {
            if (resp.valid) {
                next(OK, "Rcpt successful")
            } else {
                next(DENYSOFT, `Address ${address} was not found on our platform`)
            }
        })
        .catch(e => {
            connection.logerror(`Error validating address: ${e.toString()}`)
            next(DENY, `Error processing the email with address ${address}`)
        })
}

exports.hook_rcpt_ok = function (next, connection, params) {
    next()
}

exports.hook_queue = function (next, connection, params) {
    // const transaction = connection.transaction
    // const body = transaction.body
    // const header = transaction.header
    next()
}

/**
 * Plugin Helper methods
 */

function start_att(connection, ct, fn, body, stream) {
    connection.loginfo("Got attachment: ")
    connection.loginfo("fn:", fn)
}