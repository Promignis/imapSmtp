function promisifyClientStreamRequest(client, methods, options) {
    let promisifiedObj = null
    Object.keys(Object.getPrototypeOf(client)).forEach(function (functionName) {
        if (methods.indexOf(functionName) !== -1) {
            const originalFunction = client[functionName]
            if (originalFunction.requestStream === undefined) {
                return
            }
            promisifiedObj = new ClientStreamRequest(client, originalFunction, options)
        }
    })

    return promisifiedObj
}

class ClientStreamRequest {

    constructor(client, original_function, options = {}) {
        console.log('in new constructor', options.metadata._internal_repr.filename)
        if (options == null) options = {};
        this.options = options
        this.promise = new Promise((resolve, reject) => {
            // Deadline is advisable to be set
            // It should be a timestamp value in milliseconds
            let deadline = undefined;
            if (options.timeout !== undefined) {
                deadline = Date.now() + options.timeout;
            }
            this.stream = original_function.call(client, options.metadata, { deadline: deadline },
                function (error, response) {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    sendMessage(content = {}) {
        console.log(this.options, "called...", this.options.metadata._internal_repr.filename)
        this.stream.write(content);
        return this;
    }

    end() {
        this.stream.end();
        return this.promise;
    }

}

module.exports = promisifyClientStreamRequest