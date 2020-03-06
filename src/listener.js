'use strict'

const debug = require('debug')
const log = debug('libp2p:stardust:listener')
log.error = debug('libp2p:stardust:listener:error')

const { EventEmitter } = require('events')

const crypto = require('crypto')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const toConnection = require('libp2p-utils/src/stream-to-ma-conn')

const Wrap = require('it-pb-rpc')
const { int32BEDecode, int32BEEncode } = require('it-length-prefixed')
const {
  JoinInit,
  JoinChallenge,
  JoinChallengeSolution,
  JoinVerify,
  Discovery,
  DiscoveryAck,
  DialRequest,
  DialResponse,
  ErrorTranslations
} = require('./proto')

const { getStardustMultiaddr, sha5 } = require('./utils')

function translateAndThrow (eCode) {
  throw new Error(ErrorTranslations[eCode] || ('Unknown error #' + eCode + '! Please upgrade libp2p-stardust to the latest version!'))
}

/**
* Stardust Transport Listener
* @class
*/
class Listener extends EventEmitter {
  /**
   * @constructor
   * @param {Object} properties - properties for the listener
   * @param {Stardust} properties.client - Stardust client reference
   * @param {Upgrader} properties.upgrader - Connection upgrader
   * @param {function (Connection)} [properties.handler] - New connection handler
   * @param {Object} [properties.options] - options for the listener
   */
  constructor ({ client, upgrader, handler, options = {} }) {
    super()
    this.client = client
    this.handler = handler
    this.upgrader = upgrader
    this.options = options

    this.address = undefined
    this.isConnected = undefined
    this.aid = undefined
    this.serverConnection = undefined
    this.wrappedStream = undefined
  }

  /**
   * Listen on a multiaddr (from stardust server)
   * @param {Multiaddr} ma multiaddr to listen on
   * @returns {Promise<void>}
   */
  async listen (ma) {
    try {
      await this.connectServer(ma)
      this.emit('listening')
    } catch (err) {
      if (this.client.softFail) {
        // dials will fail, but that's just about it
        return
      }
      this.emit('error', err)
    }
  }

  /**
   * Get listener addresses
   * @returns {Array<Multiaddr>}
   */
  getAddrs () {
    return this.address ? [this.address] : []
  }

  /**
   * Close listener
   * @returns {Promise<void>}
   */
  async close () {
    if (!this.isConnected) return
    this.isConnected = false // will prevent new conns, but will keep current ones as interface requires it

    // close stream and connection with the server
    await this.serverConnection.close()

    // reset state
    delete this.client.listeners[this.aid]
    this._timeoutId && clearTimeout(this._timeoutId)
    this.address = undefined
    this.wrappedStream = undefined
    this.emit('close')
  }

  /**
   * Connect to a stardust server.
   * @param {Multiaddr} addr address of the stardust server
   */
  async connectServer (addr) {
    if (this.isConnected) return

    log('connecting to %s', addr)
    this.address = addr
    this.aid = addr.decapsulate('p2p-stardust')

    const conn = await this.client.libp2p.dial(this.aid.encapsulate(`/p2p/${getStardustMultiaddr(addr)}`))
    const { stream } = await conn.newStream('/p2p/stardust/0.1.0')

    const wrapped = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })

    log('performing challenge')

    const random = crypto.randomBytes(128)
    await wrapped.writePB({ random128: random, peerID: this.client.id.toJSON() }, JoinInit)

    log('sent rand')

    const { error, saltEncrypted } = await wrapped.readPB(JoinChallenge)
    if (error) {
      translateAndThrow(error)
    }

    const saltSecret = this.client.id.privKey.decrypt(saltEncrypted)
    const solution = sha5(random, saltSecret)
    await wrapped.writePB({ solution }, JoinChallengeSolution)

    const { error: error2 } = await wrapped.readPB(JoinVerify)
    if (error2) {
      translateAndThrow(error2)
    }

    log('connected')

    this.isConnected = true
    this.client.listeners[String(this.aid)] = this
    this.wrappedStream = wrapped
    this.serverConnection = conn

    this.client.libp2p.handle('/p2p/stardust/0.1.0', async ({ stream, connection }) => {
      const maConn = toConnection({
        stream,
        remoteAddr: connection.remoteAddr,
        localAddr: connection.localAddr
      })
      log('new inbound connection %s', maConn.remoteAddr)

      let conn
      try {
        conn = await this.upgrader.upgradeInbound(maConn)
      } catch (err) {
        log.error('inbound connection failed to upgrade', err)
        return maConn.close()
      }

      log('inbound connection %s upgraded', maConn.remoteAddr)
      this.handler && this.handler(conn)
      this.emit('connection', conn)
    })

    this._discoverPeers()
  }

  /**
   * Read discovery messages
   * @private
   */
  async _discoverPeers () {
    if (!this.isConnected) {
      return
    }

    const baseAddr = this.address.decapsulate('p2p-stardust')
    let message

    try {
      message = await this.wrappedStream.readPB(Discovery)

      // Proof still connected
      this.wrappedStream.writePB({}, DiscoveryAck)
    } catch (err) {
      // listener was already closed
      if (!this.isConnected) {
        return
      }

      log('failed to read discovery: %s', err.stack)
      log('assume disconnected!')

      this.isConnected = false
      this.serverConnection = null
      const wrappedStream = this.wrappedStream.unwrap()
      wrappedStream.sink([])

      log('reconnecting')

      try {
        await this.listen(this.address)
        log('reconnected!')
      } catch (e) {
        log('reconnect failed: %s', e.stack)
      }

      return
    }

    if (!this.client.discovery._isStarted) {
      log('reading discovery, but tossing data since it\'s not enabled')
      return
    }

    log('reading discovery')
    for (const id of message.ids) {
      try {
        const pi = new PeerInfo(new PeerId(id))

        if (pi.id.toB58String() !== this.client.id.toB58String()) {
          pi.multiaddrs.add(baseAddr.encapsulate('/p2p-stardust/p2p/' + pi.id.toB58String()))

          this.client.discovery.emit('peer', pi)
        }
      } catch (err) {
        log.error('invalid peer discovered', err)
      }
    }

    this._discoverPeers()
  }

  async _dial (addr) {
    if (!this.isConnected) { throw new Error('Server not online!') }

    const id = addr.getPeerId()
    const _id = PeerId.createFromB58String(id).id

    log('dialing %s', id)

    const { stream } = await this.serverConnection.newStream('/p2p/stardust/0.1.0')
    const wrapped = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })

    wrapped.writePB({ target: _id }, DialRequest)

    const { error } = await wrapped.readPB(DialResponse)

    if (error) {
      translateAndThrow(error)
    }

    return wrapped.unwrap()
  }
}

module.exports = Listener
