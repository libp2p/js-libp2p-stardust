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
const ACK = Buffer.from('01', 'hex')

module.exports = ({ handler, upgrader }, client, options = {}) => {
  let address, isConnected, aid
  const listener = new EventEmitter()

  const getDiscovery = async (wrapped) => {
    if (!isConnected) {
      return
    }

    const baseAddr = address.decapsulate('p2p-stardust')
    let message

    try {
      message = await wrapped.readPB(Discovery)

      // Proof still connected
      wrapped.writePB({}, DiscoveryAck)
    } catch (err) {
      // TODO
      console.log('discovery catch err')
    }

    if (!client.discovery._isStarted) {
      log('reading discovery, but tossing data since it\'s not enabled')
      console.log('return')
      return
    }

    log('reading discovery')
    message.ids
      .map(id => {
        const pi = new PeerInfo(new PeerId(id))
        if (pi.id.toB58String() === client.id.toB58String()) return
        pi.multiaddrs.add(baseAddr.encapsulate('/p2p-stardust/p2p/' + pi.id.toB58String()))

        console.log('pi', pi)
        return pi
      })
      .filter(Boolean)
      .forEach(pi => client.discovery.emit('peer', pi))

    setTimeout(() => getDiscovery(wrapped), 100) // cooldown
  }

  const connectServer = async (addr) => {
    if (isConnected) return

    log('connecting to %s', addr)
    address = addr
    aid = addr.decapsulate('p2p-stardust')

    const { stream } = await client.libp2p.dialProtocol(aid, '/p2p/stardust/0.1.0')
    const wrapped = Wrap(stream, { lengthDecoder: int32BEDecode, lengthEncoder: int32BEEncode })

    log('performing challenge')
    const random = crypto.randomBytes(128)

    await wrapped.writePB({ random128: random, peerID: client.id.toJSON() }, JoinInit)

    const { error, saltEncrypted } = await wrapped.readPB(JoinChallenge)
    if (error) {
      console.log('error')
    }

    const saltSecret = client.id.privKey.decrypt(saltEncrypted)
    const solution = sha5(random, saltSecret)
    await wrapped.writePB({ solution }, JoinChallengeSolution)

    const { error: error2 } = await wrapped.readPB(JoinVerify)
    if (error2) {
      console.log('error 2')
    }

    log('connected')
    console.log('connected')
    isConnected = true

    // -- TODO handler + conn
    getDiscovery(wrapped)
  }

  listener.listen = async (ma) => {
    try {
      await connectServer(ma)
      listener.emit('listening')
    } catch (err) {
      if (client.softFail) {
        // dials will fail, but that's just about it
        listener.emit('listening')
        return
      }
      listener.emit('error', err)
    }
  }

  listener.getAddrs = () => {
    return address ? [address] : []
  }

  listener.close = () => {
    isConnected = false
    delete client.connections[String(aid)]
    listener.emit('close')
  }

  return listener
}