'use strict'

const debug = require('debug')
const log = debug('libp2p:stardust:server')

const Libp2p = require('libp2p')
const Transport = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const Crypto = require('libp2p-secio')

const crypto = require('crypto')
const delay = require('delay')

const Wrap = require('it-pb-rpc')
const { int32BEDecode, int32BEEncode } = require('it-length-prefixed')
const { JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, Discovery, DiscoveryAck, DialRequest, DialResponse, ErrorTranslations } = require('../proto')

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')

const sha5 = (data) => crypto.createHash('sha512').update(data).digest()

const checkAckLoop = async (wrappedStream, onEnd) => {
  try {
    while (true) {
      console.log('read PB ACK 1')
      await wrappedStream.readPB(DiscoveryAck)
      console.log('read PB ACK 2')
      await delay(100)
    }
  } catch (err) { // we'll get here after a disconnect
    console.log('onEND', err)
    onEnd()
  }
}

/**
* Stardust Transport Server
* @class
*/
class Server {
  /**
   * @constructor
   * @param {Object} options - Options for the listener
   * @param {Array<multiaddr>} options.addresses
   */
  constructor (opts = {}) {
    this.peerAddr = opts.addresses || [multiaddr('/ip6/::/tcp/5892/ws')]
    this.network = {}
    this.networkArray = []
    this._cachedDiscovery = Buffer.from('01', 'hex')

    this.libp2p = undefined
  }

  removeFromNetwork (client) {
    log('removing %s from network', client.id.toB58String())

    delete this.network[client.id.toB58String()]

    this.update()
    this.broadcastDiscovery()
  }

  addToNetwork (wrappedStream, id) {
    log('adding %s to network', id.toB58String())

    // TODO

    const client = this.network[id.toB58String()] = {
      id,
      wrappedStream
    }
    checkAckLoop(wrappedStream, () => this.removeFromNetwork(client))

    this.update()
    this.broadcastDiscovery()
  }

  /**
   * Update discovery data
   */
  update() {
    log('updating cached data')
    this.networkArray = Object.keys(this.network).map(b58 => this.network[b58])
    this._cachedDiscovery = this.networkArray.length ? { ids: this.networkArray.map(client => client.id._id) } : { ids: [] }
  }

  /**
   * Broadcast discovery data
   */
  broadcastDiscovery() {
    console.log('broadcast')
    log('broadcasting discovery to %o client(s)', this.networkArray.length)
    this.networkArray.forEach(client => {
      client.wrappedStream.writePB(this._cachedDiscovery, Discovery)
    })
  }

  /**
   * Start stardust server, libp2p and discovery.
   * Add a libp2p handler for stardust protocol.
   */
  async start () {
    this.libp2p = await Libp2p.create({
      modules: {
        transport: [Transport],
        streamMuxer: [Muxer],
        connEncryption: [Crypto]
      }
    })

    this.peerAddr.forEach((addr) => {
      this.libp2p.peerInfo.multiaddrs.add(addr)
    })

    await this.libp2p.start()

    const handler = async ({ stream }) => {
      const wrapped = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })

      try {
        log('performing challenge')

        const { random128: random, peerID } = await wrapped.readPB(JoinInit)
        const id = await PeerId.createFromJSON(peerID)

        if (!Buffer.isBuffer(random) || random.length !== 128) {
          wrapped.writePP({ error: Error.E_RAND_LENGTH }, JoinVerify)

          // close the stream, no need to wait
          stream.sink([])
          return
        }

        log('got id, challenge for %s', id.toB58String())

        const saltSecret = crypto.randomBytes(128)
        const saltEncrypted = await id.pubKey.encrypt(saltSecret)

        await wrapped.writePB({ saltEncrypted }, JoinChallenge)

        const solution = sha5(random, saltSecret)
        const { solution: solutionClient } = await wrapped.readPB(JoinChallengeSolution)

        if (solution.toString('hex') !== solutionClient.toString('hex')) {
          wrapped.writePP({ error: Error.E_INCORRECT_SOLUTION }, JoinVerify)

          // close the stream, no need to wait
          stream.sink([])
          return
        }

        await wrapped.writePB({}, JoinVerify)

        this.addToNetwork(wrapped, id)
      } catch (error) {
        log(error)
        wrapped.writePB({ error: Error.E_GENERIC }, JoinVerify) // if anything fails, respond with generic error

        // close the stream, no need to wait
        stream.sink([])
      }
    }

    this.libp2p.handle('/p2p/stardust/0.1.0', handler)
    // this.discoveryInterval = setInterval(this.broadcastDiscovery.bind(this), 10 * 1000)
  }

  /**
   * Stop libp2p node and discovery.
   */
  async stop () {
    // clearInterval(this.discoveryInterval)
    if (this.libp2p) {
      await this.libp2p.stop()
    }
  }
}

module.exports = Server
