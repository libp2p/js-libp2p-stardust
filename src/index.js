'use strict'

const MicroSwitch = require('./micro-switch')
const StardustConnection = require('./connection')
const mafmt = require('mafmt')
const withIs = require('class-is')
const includes = require('lodash.includes')
const isFunction = require('lodash.isfunction')
const Connection = require('interface-connection').Connection
const once = require('once')
const debug = require('debug')
const log = debug('libp2p:stardust')
const EE = require('events').EventEmitter

function noop () {}

function getServerForAddress (addr) {
  return String(addr.decapsulate('p2p-websocket-star'))
}

/**
  * Stardust Transport
  * @class
  * @param {Object} options - Options for the listener
  * @param {PeerId} options.id - Id for the crypto challenge
  * @param {Transport[]} options.transports - Transport(s) for microswitch
  * @param {Muxer[]} options.muxers - Muxer(s) for microswitch
  */
class Stardust {
  constructor ({ transports, muxers, id }) {
    this.switch = new MicroSwitch({ transports, addresses: [], muxers })
    this.id = id

    this.discovery = new EE()
    this.discovery.tag = 'stardust'
    this.discovery.start = (callback) => {
      setImmediate(callback)
    }
    this.discovery.stop = (callback) => {
      setImmediate(callback)
    }

    this.connections = {}
  }

  dial (ma, options, callback) {
    if (isFunction(options)) {
      callback = options
      options = {}
    }

    callback = once(callback || noop)

    const server = this.connections[getServerForAddress(ma)]
    const conn = new Connection()

    server.dial(ma).then(_conn => {
      conn.resolve(_conn)
      callback()
    }, callback)

    conn.getObservedAddrs = (callback) => {
      return callback(null, [ma])
    }

    return conn
  }

  createListener (options, handler) {
    if (isFunction(options)) {
      handler = options
      options = {}
    }

    handler = handler || noop

    return new StardustConnection(this, handler)
  }

  filter (multiaddrs) {
    if (!Array.isArray(multiaddrs)) {
      multiaddrs = [multiaddrs]
    }

    return multiaddrs.filter((ma) => {
      if (includes(ma.protoNames(), 'p2p-circuit')) {
        return false
      }

      return mafmt.WebSocketStar.matches(ma)
    })
  }
}

module.exports = withIs(Stardust, { className: 'stardust', symbolName: '@libp2p/js-libp2p-stardust/stardust' })
