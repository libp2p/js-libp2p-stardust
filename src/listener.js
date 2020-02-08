'use strict'

const debug = require('debug')
const log = debug('libp2p:stardust:listener')
log.error = debug('libp2p:stardust:listener:error')

const EventEmitter = require('events')

const crypto = require('crypto')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')

const Wrap = require('it-pb-rpc')
const lp = require('it-length-prefixed')
const { int32BEDecode, int32BEEncode } = require('it-length-prefixed')
const { JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, Discovery, DiscoveryAck, DialRequest, DialResponse, ErrorTranslations } = require('./proto')

const sha5 = (data) => crypto.createHash('sha512').update(data).digest()

/**
* Stardust Transport Listener
* @class
*/
class Listener extends EventEmitter {
  /**
   * @constructor
   * @param {Object} properties - properties for the listener
   * @param {function (Connection)} properties.handler - New connection handler
   * @param {Upgrader} properties.upgrader - Connection upgrader
   * @param {Upgrader} properties.client - Stardust client reference
   * @param {Object} properties.options - options for the listener
   */
  constructor ({ handler, upgrader, client, options }) {
    super()
    this.client = client
    this.handler = handler
    this.upgrader = upgrader
    this.options = options

    this.address = undefined
    this.isConnected = undefined
    this.aid = undefined
  }

  /**
   * Read discovery messages
   * @private
   * @param {Wrap} wrappedStream
   */
  async _getDiscovery (wrappedStream) {
    if (!this.isConnected) {
      return
    }

    const baseAddr = this.address.decapsulate('p2p-stardust')
    let message

    try {
      message = await wrappedStream.readPB(Discovery)

      // Proof still connected
      wrappedStream.writePB({}, DiscoveryAck)
    } catch (err) {
      // TODO
      console.log('discovery catch err')
    }

    if (!this.client.discovery._isStarted) {
      log('reading discovery, but tossing data since it\'s not enabled')
      return
    }

    log('reading discovery')
    message.ids
      .map(id => {
        const pi = new PeerInfo(new PeerId(id))
        if (pi.id.toB58String() === this.client.id.toB58String()) return
        pi.multiaddrs.add(baseAddr.encapsulate('/p2p-stardust/p2p/' + pi.id.toB58String()))

        return pi
      })
      .filter(Boolean)
      .forEach(pi => this.client.discovery.emit('peer', pi))

    setTimeout(() => this._getDiscovery(wrappedStream), 100) // cooldown
  }

  /**
   * Connect to a stardust server.
   * @param {multiaddr} addr address of the stardust server
   */
  async connectServer (addr) {
    if (this.isConnected) return

    log('connecting to %s', addr)
    this.address = addr
    this.aid = addr.decapsulate('p2p-stardust')

    const conn = await this.client.libp2p.dial(this.aid)
    const { stream } = await conn.newStream('/p2p/stardust/0.1.0')
    const wrapped = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })

    log('performing challenge')

    const random = crypto.randomBytes(128)
    await wrapped.writePB({ random128: random, peerID: this.client.id.toJSON() }, JoinInit)

    log('sent rand')

    const { error, saltEncrypted } = await wrapped.readPB(JoinChallenge)
    if (error) {
      console.log('error')
    }

    const saltSecret = this.client.id.privKey.decrypt(saltEncrypted)
    const solution = sha5(random, saltSecret)
    await wrapped.writePB({ solution }, JoinChallengeSolution)

    const { error: error2 } = await wrapped.readPB(JoinVerify)
    if (error2) {
      console.log('error 2')
    }

    log('connected')

    this.isConnected = true
    this.client.connections[String(this.aid)] = this

    // -- TODO handler + conn
    this._getDiscovery(wrapped)
  }

  /**
   * Listen on a multiaddr (from stardust server)
   * @param {multiaddr} ma multiaddr to listen on
   * @returns {Promise<void>}
   */
  async listen (ma) {
    try {
      await this.connectServer(ma)
      this.emit('listening')
    } catch (err) {
      if (this.client.softFail) {
        // dials will fail, but that's just about it
        this.emit('listening')
        return
      }
      this.emit('error', err)
    }
  }

  /**
   * Get listener addresses
   * @returns {Array<multiaddr>}
   */
  getAddrs () {
    return this.address ? [this.address] : []
  }

  /**
   * Close listener
   */
  close () {
    if (!this.isConnected) return
    this.isConnected = false // will prevent new conns, but will keep current ones as interface requires it
    delete this.client.connections[this.aid]
    this.emit('close')
  }

  async _dial (addr, options = {}) {
    if (!this.isConnected) { throw new Error('Server not online!') }

    const id = addr.getPeerId()
    const _id = PeerId.createFromB58String(id)._id

    log('dialing %s', id)

    // pipe(
    //   DialRequest,
    //   stream,
    //   // ...
    // )
  }
}

module.exports = Listener
