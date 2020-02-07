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

module.exports = async (addresses) => {
  const peerAddr = addresses || [multiaddr('/ip6/::/tcp/5892/ws')]
  const network = {}
  let networkArray = []
  let _cachedDiscovery = Buffer.from('01', 'hex')

  const libp2p = await Libp2p.create({
    modules: {
      transport: [Transport],
      streamMuxer: [Muxer],
      connEncryption: [Crypto]
    }
  })

  peerAddr.forEach((addr) => {
    libp2p.peerInfo.multiaddrs.add(addr)
  })

  await libp2p.start()

  const broadcastDiscovery = () => {
    console.log('broadcast')
    log('broadcasting discovery to %o client(s)', networkArray.length)
    networkArray.forEach(client => {
      client.wrappedStream.writePB(_cachedDiscovery, Discovery)
    })
  }

  const update = () => {
    log('updating cached data')
    networkArray = Object.keys(network).map(b58 => network[b58])
    _cachedDiscovery = networkArray.length ? { ids: networkArray.map(client => client.id._id) } : { ids: [] }
  }

  const removeFromNetwork = (client) => {
    log('removing %s from network', client.id.toB58String())

    delete network[client.id.toB58String()]

    update()
    broadcastDiscovery()
  }

  const addToNetwork = (wrappedStream, id) => {
    log('adding %s to network', id.toB58String())

    // TODO

    const client = network[id.toB58String()] = {
      id,
      wrappedStream
    }
    checkAckLoop(wrappedStream, () => removeFromNetwork(client))

    update()
    broadcastDiscovery()
  }

  const handler = async ({ stream, connection }) => {
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

      addToNetwork(wrapped, id)
    } catch (error) {
      wrapped.writePB({ error: Error.E_GENERIC }, JoinVerify) // if anything fails, respond with generic error

      // close the stream, no need to wait
      stream.sink([])
    }
  }

  libp2p.handle('/p2p/stardust/0.1.0', handler)

  // const discoveryInterval = setInterval(() => broadcastDiscovery, 1000) // setInterval(broadcastDiscovery, 10 * 1000)
  // clearInterval(this.discoveryInterval)
  // TODO: make class instead

  return libp2p
}
