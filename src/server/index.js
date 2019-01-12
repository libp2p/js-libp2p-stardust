'use strict'

const MicroSwitch = require('../micro-switch')
const LP = require('../rpc/lp')
const pull = require('pull-stream/pull')
const handshake = require('pull-handshake')
const {JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, Discovery, DiscoveryAck, DialRequest, DialResponse, Error} = require('../rpc/proto')

const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

const sha5 = (data) => crypto.createHash('sha512').update(data).digest()

const crypto = require('crypto')
const ID = require('peer-id')

const debug = require('debug')
const log = debug('libp2p:stardust:server')

const handleDial = async (conn, id, server) => {
  const stream = handshake()
  pull(
    conn,
    stream,
    conn
  )

  log('incomming dial')

  const shake = stream.handshake
  const rpc = LP.wrap(shake, LP.writeWrap(shake.write))

  const {target} = await rpc.readProto(DialRequest)
  const targetB58 = new ID(target).toB58String()

  log('dial from %s to %s', id.toB58String(), targetB58)

  const targetPeer = server.network[targetB58]

  if (!targetPeer) {
    return rpc.writeProto(DialResponse, {error: Error.E_TARGET_UNREACHABLE})
  }

  try {
    const conn = await newMuxConn(targetPeer.muxed)
    rpc.writeProto(DialResponse, {})

    pull(conn, shake.rest(), conn)
  } catch (e) {
    return rpc.writeProto(DialResponse, {error: Error.E_GENERIC})
  }
}

const newMuxConn = (muxed) => prom(cb => muxed.newStream(cb))
const sleep = (i) => new Promise((resolve, reject) => setTimeout(resolve, i))

const checkAckLoop = async (rpc, onEnd) => {
  try {
    while (true) {
      await rpc.readProto(DiscoveryAck)
      await sleep(100)
    }
  } catch (err) { // we'll get here after a disconnect
    onEnd()
  }
}

class Server {
  constructor ({ transports, addresses, muxers }) {
    this.switch = new MicroSwitch({ transports, addresses, muxers, handler: this.handler.bind(this) })

    this.network = {}
    this.networkArray = []
    this._emptyCachedDiscovery = this._cachedDiscovery = Buffer.from('01', 'hex')
  }

  async handler (conn) {
    log('new connection')

    try {
      const muxed = await this.switch.wrapInMuxer(conn, true) // add muxer ontop of raw socket
      conn = await newMuxConn(muxed) // get a muxed connection

      const rpc = LP(conn) // turn into length-prefixed rpc interface

      try {
        log('performing challenge')

        const {random128: random, peerID} = await rpc.readProto(JoinInit)
        const id = await prom(cb => ID.createFromJSON(peerID, cb))

        if (!Buffer.isBuffer(random) || random.length !== 128) {
          rpc.writeProto(JoinVerify, {error: Error.E_RAND_LENGTH})
          return muxed.end()
        }

        log('got id, challenge for %s', id.toB58String())

        const saltSecret = crypto.randomBytes(128)
        const saltEncrypted = await prom(cb => id.pubKey.encrypt(saltSecret, cb))

        rpc.writeProto(JoinChallenge, {saltEncrypted})

        const solution = sha5(random, saltSecret)
        const {solution: solutionClient} = await rpc.readProto(JoinChallengeSolution)

        if (solution.toString('hex') !== solutionClient.toString('hex')) {
          rpc.writeProto(JoinVerify, {error: Error.E_INCORRECT_SOLUTION})
          return muxed.end()
        }

        rpc.writeProto(JoinVerify, {})

        this.addToNetwork(muxed, rpc, id)
      } catch (err) {
        log(err)
        rpc.writeProto(JoinVerify, {error: Error.E_GENERIC}) // if anything fails, respond with generic error
        return muxed.end()
      }
    } catch (err) {
      log(err)
    }
  }

  addToNetwork (muxed, rpc, id) {
    log('adding %s to network', id.toB58String())

    muxed.on('stream', (conn) => handleDial(conn, id, this))

    checkAckLoop(rpc, () => this.removeFromNetwork(client))

    const client = this.network[id.toB58String()] = {
      id,
      muxed,
      rpc
    }

    this.update()
    this.broadcastDiscovery()
  }

  removeFromNetwork (client) {
    log('removing %s from network', client.id.toB58String())

    delete this.network[client.id.toB58String()]

    this.update()
    this.broadcastDiscovery()
  }

  update () {
    log('updating cached data')
    this.networkArray = Object.keys(this.network).map(b58 => this.network[b58])
    this._cachedDiscovery = this.networkArray.length ? Discovery.encode({ids: this.networkArray.map(client => client.id._id)}) : this._emptyCachedDiscovery
  }

  broadcastDiscovery () {
    log('broadcasting discovery to %o client(s)', this.networkArray.length)
    this.networkArray.forEach(client => {
      client.rpc.write(this._cachedDiscovery)
    })
  }

  async start () {
    this.discoveryInterval = setInterval(this.broadcastDiscovery.bind(this), 10 * 1000)
    await this.switch.startListen()
  }

  async stop () {
    clearInterval(this.discoveryInterval)
    await this.switch.stopListen()
  }
}

module.exports = Server
