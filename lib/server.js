const http = require('http')
const express = require('express')
const cors = require('cors')
const expressBodyParser = require('body-parser')
const prettyMs = require('pretty-ms')
const onFinished = require('on-finished')

const rootRouter = require('../route/root')
const personaRouter = require('../route/persona')
const cuotaRouter = require('../route/cuota')
const facturaDetalleRouter = require('../route/facturaDetalle')
const facturaRouter = require('../route/factura')
const pagoRouter = require('../route/pago')

class Server {
  constructor (config, logger, database) {
    this.config = config
    this.logger = logger
    this.database = database

    this.logger.verbose('Creating express app and HTTP server instance')
    this.expressApp = express()
    this._httpServer = http.createServer(this.expressApp)
    this.logger.verbose('Express app and HTTP server instance created')

    this._setupExpressMiddleware()
    this._setupExpressRoutes()
    this._setupErrorHandler()
  }

  listen (cb) {
    this.logger.verbose(`Attempting to bind HTTP server to ${this.config.server.port}`)
    this._httpServer.listen(this.config.server.port, (err) => {
      if (err) { return cb(err) }

      this.logger.verbose('HTTP server bound')
      cb(null)
    })
  }

  close (cb) {
    this._httpServer.close(cb)
  }

  _setupExpressMiddleware () {
    this.expressApp.request.config = this.config
    this.expressApp.request.model = (...args) => this.database.model(...args)

    const createReqLogger = (req, res, next) => {
      req._startTime = Date.now()
      req.logger = this.logger

      // TODO: Log headers without token
      req.logger.info('Incoming request', {
        httpVersion: req.httpVersion,
        method: req.method,
        url: req.url,
        trailers: req.trailers
      })

      onFinished(res, () => {
        req.logger.info('Outgoing response', {
          httpVersion: req.httpVersion,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: prettyMs(Date.now() - req._startTime)
        })
      })

      next(null)
    }

    this.logger.verbose('Attaching middleware to express app')

    this.expressApp.use(createReqLogger)
    this.expressApp.use(cors())
    this.expressApp.use(expressBodyParser.raw())
    this.expressApp.use(expressBodyParser.json())

    this.logger.verbose('Middleware attached')
  }

  _setupExpressRoutes () {
    this.logger.verbose('Attaching resource routers to express app')

    this.expressApp.use('/', rootRouter)
    this.expressApp.use('/personas', personaRouter)
    this.expressApp.use('/cuotas', cuotaRouter)
    this.expressApp.use('/facturadetalle', facturaDetalleRouter)
    this.expressApp.use('/factura', facturaRouter)
    this.expressApp.use('/pago', pagoRouter)

    this.logger.verbose('Resource routers attached')
  }

  _setupErrorHandler () {
    this.logger.verbose('Attaching error handler')

    this.expressApp.use((err, req, res, next) => {
      if (err && (err === 'UnauthorizedError' || err.name === 'UnauthorizedError')) {
        return res.status(401).send(err.message)
      }

      err.statusCode || (err.statusCode = Server.statusCodeByErrorName[err.name] || 500)

      req.logger[err.logLevel || 'error'](err.toString(), err)
      req.logger.verbose('Responding to client', err.toString())
      res.status(err.statusCode).send(err.uiMessage)
    })

    this.logger.verbose('Error handler attached')
  }
}

Server.statusCodeByErrorName = {
  ValidationError: 400,
  CastError: 400
}

module.exports = Server
