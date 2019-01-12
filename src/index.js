'use strict'

const MicroSwitch = require('./micro-switch')
const Listener = require('./listener')
const mafmt = require('mafmt')
const withIs = require('class-is')
const includes = require('lodash/includes')
const isFunction = require('lodash/isFunction')
const Connection = require('interface-connection').Connection
const once = require('once')
const debug = require('debug')
const log = debug('libp2p:stardust')
const EE = require('events').EventEmitter

function noop () {}

function getServerForAddress (addr) {
  return String(addr.decapsulate('p2p-stardust'))
}

/**
  * Stardust Transport
  * @class
  * @param {Object} options - Options for the listener
  * @param {PeerId} options.id - Id for the crypto challenge
  * @param {Transport[]} options.transports - Transport(s) for microswitch
  * @param {Muxer[]} options.muxers - Muxer(s) for microswitch
  * @param {boolean} options.softFail - Whether to softly fail on listen errors
  */
class Stardust {
  constructor ({ transports, muxers, id, softFail }) {
    this.switch = new MicroSwitch({ transports, addresses: [], muxers })
    this.id = id
    this.softFail = softFail

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

    server._dial(ma).then(_conn => {
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

    return new Listener(this, handler)
  }

  filter (multiaddrs) {
    if (!Array.isArray(multiaddrs)) {
      multiaddrs = [multiaddrs]
    }

    return multiaddrs.filter((ma) => {
      if (includes(ma.protoNames(), 'p2p-circuit')) {
        return false
      }

      return mafmt.Stardust.matches(ma)
    })
  }
}

module.exports = withIs(Stardust, { className: 'stardust', symbolName: '@libp2p/js-libp2p-stardust/stardust' })
