'use strict'

const debug = require('debug')
const log = debug('libp2p:stardust')
log.error = debug('libp2p:stardust:error')

const withIs = require('class-is')
const { EventEmitter } = require('events')
const { AbortError } = require('abortable-iterator')
const errCode = require('err-code')

const Listener = require('./listener')
const toConnection = require('libp2p-utils/src/stream-to-ma-conn')
const { CODE_CIRCUIT } = require('./constants')
const { messages, codes } = require('./errors')

function getServerForAddress (addr) {
  return String(addr.decapsulate('p2p-stardust'))
}

/**
* Stardust Transport
* @class
*/
class Stardust {
  /**
   * @constructor
   * @param {Object} options - Options for the listener
   * @param {Upgrader} options.upgrader
   * @param {Libp2p} options.libp2p - Libp2p instance.
   * @param {boolean} options.softFail - Whether to softly fail on listen errors
   */
  constructor ({ upgrader, libp2p, softFail = false }) {
    if (!upgrader) {
      throw new Error('An upgrader must be provided. See https://github.com/libp2p/interface-transport#upgrader.')
    } else if (!libp2p) {
      // TODO: this should not be a requirement in the future
      throw new Error('A libp2p instance must be provided')
    }

    this._upgrader = upgrader

    this.libp2p = libp2p
    this.id = libp2p.peerInfo.id
    this.softFail = softFail

    this.listeners = {}

    // Discovery
    this.discovery = new EventEmitter()
    this.discovery.tag = 'stardust'
    this.discovery._isStarted = false
    this.discovery.start = () => {
      this.discovery._isStarted = true
    }
    this.discovery.stop = () => {
      this.discovery._isStarted = false
    }
  }

  /**
   * @async
   * @param {Multiaddr} ma
   * @param {object} options
   * @param {AbortSignal} options.signal Used to abort dial requests
   * @returns {Connection} An upgraded Connection
   */
  async dial (ma, options = {}) {
    const stream = await this._connect(ma, options)
    const maConn = toConnection({
      stream,
      remoteAddr: ma
    }, options)
    log('new outbound connection %s', maConn.remoteAddr)
    const conn = await this._upgrader.upgradeOutbound(maConn)
    log('outbound connection %s upgraded', maConn.remoteAddr)
    return conn
  }

  /**
   * @private
   * @param {Multiaddr} ma
   * @param {object} options
   * @param {AbortSignal} options.signal Used to abort dial requests
   * @returns {Promise<DuplexIterableStream>} Resolves a duplex iterable stream with the target peer
   */
  _connect (ma, options = {}) {
    if (options.signal && options.signal.aborted) {
      throw new AbortError()
    }

    const server = this.listeners[getServerForAddress(ma)]

    if (!server) {
      throw errCode(new Error(messages.NO_LISTENING_SERVER), codes.NO_LISTENING_SERVER)
    }

    return server._dial(ma, options)
  }

  /**
   * Creates a stardust listener. The provided `handler` function will be called
   * anytime a new incoming Connection has been successfully upgraded via
   * `upgrader.upgradeInbound`.
   * @param {object} [options]
   * @param {number} [options.discoveryInterval]
   * @param {function (Connection)} handler
   * @returns {Listener} A stardust listener
   */
  createListener (options, handler) {
    if (typeof options === 'function') {
      handler = options
      options = {}
    }

    return new Listener({
      handler,
      upgrader: this._upgrader,
      client: this,
      options
    })
  }

  /**
   * Takes a list of `Multiaddr`s and returns only valid Stardust addresses
   * @param {Multiaddr[]} multiaddrs
   * @returns {Multiaddr[]} Valid Stardust multiaddrs
   */
  filter (multiaddrs) {
    multiaddrs = Array.isArray(multiaddrs) ? multiaddrs : [multiaddrs]

    return multiaddrs.filter((ma) => {
      if (ma.protoCodes().includes(CODE_CIRCUIT)) {
        return false
      }

      if (ma.protoNames().includes('p2p-stardust')) {
        return true
      }

      return false
    })
  }
}

module.exports = withIs(Stardust, { className: 'stardust', symbolName: '@libp2p/js-libp2p-stardust/stardust' })
