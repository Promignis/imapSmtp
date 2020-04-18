function formatHeaders(headers) {
    headers = headers || []
    if (!Array.isArray(headers)) {
        headers = [].concat(headers || [])
    }
    return headers
}

module.exports = {
    formatHeaders
}