const parseMIME = require('./rfc822parser')
const extractMailData = require('./extractMailData')
const getLength = require('./getLength')
const createIMAPEnvelop = require('./getEnvelope')
const rebuildOriginal = require('./rebuild')
const extractBodyStructure = require('./extractBodyStructure')
const resolveNode = require('./resolveNode')
const formatHeaders = require('./utils').formatHeaders

module.exports = {
    parseMIME,
    extractMailData,
    getLength,
    rebuildOriginal,
    createIMAPBodyStructure: extractBodyStructure.getBodyStructure,
    createIMAPEnvelop,
    resolveNode,
    formatHeaders,
    createIMAPBody: extractBodyStructure.getBody
}