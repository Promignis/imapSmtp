const parseMIME = require('./rfcparser')
const extractMailData = require('./extractMailData')
const getLength = require('./getLength')
const createIMAPEnvelop = require('./getEnvelope')
const rebuildOriginal = require('./rebuild')
const createIMAPBodyStructure = require('./extractBodyStructure')

module.exports = {
    parseMIME,
    extractMailData,
    getLength,
    rebuildOriginal,
    createIMAPBodyStructure,
    createIMAPEnvelop
}