const config = require('config')
const logger = require('./logger')
const Api = require('./lib/api')

const api = new Api(config, logger)

module.exports = api
