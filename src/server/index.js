'use strict'

const debug = require('debug')
const log = debug('libp2p:stardust:server')

const Libp2p = require('libp2p')
const Transport = require('libp2p-websockets')
const Muxer = require('libp2p-mplex')
const Secio = require('libp2p-secio')

const crypto = require('crypto')
const delay = require('delay')

const Wrap = require('it-pb-rpc')
const pipe = require('it-pipe')
const { int32BEDecode, int32BEEncode } = require('it-length-prefixed')
const { sha5 } = require('../utils')
const {
  JoinInit,
  JoinChallenge,
  JoinChallengeSolution,
  JoinVerify,
  Discovery,
  DiscoveryAck,
  DialRequest,
  DialResponse,
  Error
} = require('../proto')

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')

const client = require('prom-client')

const fake = {
  gauge: {
    set: () => { }
  },
  counter: {
    inc: () => { }
  }
}

const checkAckLoop = async (wrappedStream, onEnd) => {
  try {
    while (true) {
      await wrappedStream.readPB(DiscoveryAck)
      await delay(100)
    }
  } catch (err) { // we'll get here after a disconnect
    onEnd()
  }
}

const protocol = '/p2p/stardust/0.1.0'

/**
* Stardust Transport Server
* @class
*/
class Server {
  /**
   * @constructor
   * @param {Object} options - Options for the listener
   * @param {Array<multiaddr>} [options.addresses]
   * @param {Array<Transport>} [options.transports]
   * @param {Array<Multiplexer>} [options.muxers]
   * @param {Array<Encryption>} [options.encryption]
   * @param {number} [options.discoveryInterval]
   * @param {PeerInfo} [options.peerInfo]
   * @param {bool} [options.hasMetrics]
   */
  constructor ({
    addresses = [multiaddr('/ip6/::/tcp/5892/ws')],
    transports = [Transport],
    muxers = [Muxer],
    encryption = [Secio],
    discoveryInterval = 10 * 1000,
    peerInfo,
    hasMetrics = false
  } = {}) {
    this.peerAddr = addresses
    this.network = {}
    this.networkArray = []
    this._cachedDiscovery = {}

    this.libp2p = undefined
    this._transports = transports
    this._muxers = muxers
    this._encryption = encryption
    this._peerInfo = peerInfo
    this.discoveryIntervalTimeout = discoveryInterval

    this.metrics = {
      peerMetric: hasMetrics ? new client.Gauge({ name: 'stardust_peers', help: 'peers online now' }) : fake.gauge,
      dialsSuccessTotal: hasMetrics ? new client.Counter({ name: 'stardust_dials_total_success', help: 'sucessfully completed dials since server started' }) : fake.counter,
      dialsFailureTotal: hasMetrics ? new client.Counter({ name: 'stardust_dials_total_failure', help: 'failed dials since server started' }) : fake.counter,
      dialsTotal: hasMetrics ? new client.Counter({ name: 'stardust_dials_total', help: 'all dials since server started' }) : fake.counter,
      joinsSuccessTotal: hasMetrics ? new client.Counter({ name: 'stardust_joins_total_success', help: 'sucessfully completed joins since server started' }) : fake.counter,
      joinsFailureTotal: hasMetrics ? new client.Counter({ name: 'stardust_joins_total_failure', help: 'failed joins since server started' }) : fake.counter,
      joinsTotal: hasMetrics ? new client.Counter({ name: 'stardust_joins_total', help: 'all joins since server started' }) : fake.counter
    }
  }

  removeFromNetwork (client) {
    log('removing %s from network', client.id.toB58String())

    delete this.network[client.id.toB58String()]
    this.update()
    this.broadcastDiscovery()
  }

  addToNetwork (connection, wrappedStream, id) {
    log('adding %s to network', id.toB58String())

    const client = this.network[id.toB58String()] = {
      id,
      connection,
      wrappedStream
    }

    checkAckLoop(wrappedStream, () => this.removeFromNetwork(client))

    this.update()
    this.broadcastDiscovery()
  }

  /**
   * Update discovery data
   */
  update () {
    log('updating cached data')
    this.networkArray = Object.values(this.network)
    this._cachedDiscovery = this.networkArray.length ? { ids: this.networkArray.map(client => client.id._id) } : { ids: [] }
    // Refresh metrics
    this.metrics.peerMetric.set(this.networkArray.length)
  }

  /**
   * Broadcast discovery data
   */
  broadcastDiscovery () {
    log('broadcasting discovery to %o client(s)', this.networkArray.length)
    this.networkArray.forEach(client => {
      client.wrappedStream.writePB(this._cachedDiscovery, Discovery)
    })
  }

  async _register (random, id, wrappedStream, stream) {
    log('performing challenge')

    if (!Buffer.isBuffer(random) || random.length !== 128) {
      wrappedStream.writePB({ error: Error.E_RAND_LENGTH }, JoinVerify)

      // close the stream, no need to wait
      stream.sink([])
      return
    }

    log('got id, challenge for %s', id.toB58String())

    const saltSecret = crypto.randomBytes(128)
    const saltEncrypted = await id.pubKey.encrypt(saltSecret)

    await wrappedStream.writePB({ saltEncrypted }, JoinChallenge)

    const solution = sha5(random, saltSecret)
    const { solution: solutionClient } = await wrappedStream.readPB(JoinChallengeSolution)

    if (solution.compare(solutionClient)) { // if not equal will return non-zero value
      wrappedStream.writePB({ error: Error.E_INCORRECT_SOLUTION }, JoinVerify)

      // close the stream, no need to wait
      stream.sink([])
      return
    }

    await wrappedStream.writePB({}, JoinVerify)
  }

  async _dial (targetB58, wrappedStream, stream) {
    const targetPeer = this.network[targetB58]
    if (!targetPeer) {
      wrappedStream.writePB({ error: Error.E_TARGET_UNREACHABLE }, DialResponse)

      // close the stream, no need to wait
      stream.sink([])
      return
    }

    // Open stream to target peer
    const { stream: targetStream } = await targetPeer.connection.newStream('/p2p/stardust/0.1.0')

    wrappedStream.writePB({}, DialResponse)

    // Pipe streams of both peers
    await pipe(
      targetStream,
      wrappedStream.unwrap(),
      targetStream
    )
  }

  /**
   * Start stardust server, libp2p and discovery.
   * Add a libp2p handler for stardust protocol.
   */
  async start () {
    this.metrics.peerMetric.set(this.networkArray.length)

    this.libp2p = await Libp2p.create({
      peerInfo: this._peerInfo,
      modules: {
        transport: [Transport],
        streamMuxer: [Muxer],
        connEncryption: [Secio]
      }
    })

    this.peerAddr.forEach((addr) => {
      this.libp2p.peerInfo.multiaddrs.add(addr)
    })

    await this.libp2p.start()

    const handler = async ({ connection, stream }) => {
      const wrappedStream = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })
      const message = await wrappedStream.readLP()

      // Try register
      try {
        const { random128: random, peerID } = JoinInit.decode(message.slice())

        if (random && peerID) {
          this.metrics.joinsTotal.inc()

          const id = await PeerId.createFromJSON(peerID)

          await this._register(random, id, wrappedStream, stream)
          this.addToNetwork(connection, wrappedStream, id)
          this.metrics.joinsSuccessTotal.inc()

          return
        }
      } catch (error) {
        log(error)
        wrappedStream.writePB({ error: Error.E_GENERIC }, JoinVerify) // if anything fails, respond with generic error

        // close the stream, no need to wait
        stream.sink([])
        this.metrics.joinsFailureTotal.inc()
      }

      // Try dial
      try {
        this.metrics.dialsTotal.inc()

        const { target } = DialRequest.decode(message.slice())
        const targetB58 = new PeerId(target).toB58String()

        log('dial from %s to %s', connection.localPeer.toB58String(), targetB58)
        await this._dial(targetB58, wrappedStream, stream)
        this.metrics.dialsSuccessTotal.inc()
      } catch (error) {
        log(error)
        wrappedStream.writePB({ error: Error.E_GENERIC }, DialResponse) // if anything fails, respond with generic error

        // close the stream, no need to wait
        stream.sink([])
        this.metrics.dialsFailureTotal.inc()
      }
    }

    this.libp2p.handle(protocol, handler)
    this.discoveryInterval = setInterval(this.broadcastDiscovery.bind(this), this.discoveryIntervalTimeout)
  }

  /**
   * Stop libp2p node and discovery.
   */
  async stop () {
    clearInterval(this.discoveryInterval)
    this.libp2p.unhandle(protocol)
    if (this.libp2p) {
      await this.libp2p.stop()
    }
  }
}

module.exports = Server
