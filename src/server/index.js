'use strict'

const MicroSwitch = require('../micro-switch')
const LP = require('../rpc/lp')
const pull = require('pull-stream/pull')
const handshake = require('pull-handshake')
const {JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, Discovery, DialRequest, DialResponse, Error} = require('../rpc/proto')

const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

const sha5 = (data) => crypto.createHash('sha512').update(data).digest()

const crypto = require('crypto')
const ID = require('peer-id')

const debug = require('debug')
const log = debug('libp2p:stardust:server')

class Client {
  constructor ({muxed, rpc, id, server}) {
    this.muxed = muxed
    this.rpc = rpc
    this.id = id
    this.server = server

    muxed.on('stream', this.handler.bind(this))
  }

  async handler (conn) {
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

    log('dial from %s to %s', this.id.toB58String(), targetB58)

    const targetPeer = this.server.network[targetB58]

    if (!targetPeer) {
      return rpc.writeProto(DialResponse, {error: Error.E_TARGET_UNREACHABLE})
    }

    try {
      const conn = await targetPeer.openConn()
      rpc.writeProto(DialResponse, {})

      pull(conn, shake.rest(), conn)
    } catch (e) {
      return rpc.writeProto(DialResponse, {error: Error.E_GENERIC})
    }
  }

  async openConn () {
    return prom(cb => this.muxed.newStream(cb))
  }
}

class Server {
  constructor ({ transports, addresses, muxers }) {
    this.switch = new MicroSwitch({ transports, addresses, muxers, handler: this.handler.bind(this) })

    this.network = {}
    this.networkArray = []
    this._cachedDiscovery = Buffer.from('')
  }

  async handler (conn) {
    log('new connection')

    const muxed = await this.switch.wrapInMuxer(conn, true)
    muxed.newStream(async (err, conn) => {
      if (err) {
        return log(err)
      }

      const rpc = LP(conn)

      try {
        log('performing challenge')

        const {random128: random, peerID} = await rpc.readProto(JoinInit)
        const id = await prom(cb => ID.createFromJSON(peerID, cb))

        log('got rand')

        const saltSecret = crypto.randomBytes(128)
        const saltEncrypted = await prom(cb => id.pubKey.encrypt(saltSecret, cb))

        rpc.writeProto(JoinChallenge, {saltEncrypted})

        const solution = sha5(random, saltSecret)

        const {solution: solutionClient} = await rpc.readProto(JoinChallengeSolution)

        if (solution.toString('hex') !== solutionClient.toString('hex')) {
          return rpc.writeProto(JoinVerify, {error: Error.E_INCORRECT_SOLUTION}) // TODO: connection close
        }

        rpc.writeProto(JoinVerify, {})

        log('adding to network')

        this.addToNetwork(new Client({muxed, rpc, id, server: this}))
      } catch (e) {
        log(e)
        rpc.writeProto(JoinVerify, {error: Error.E_GENERIC}) // if anything fails, respond
      }
    })
  }

  addToNetwork (client) {
    this.network[client.id.toB58String()] = client
    this.update()
    this.broadcastDiscovery()
  }

  update () {
    this.networkArray = Object.keys(this.network).map(b58 => this.network[b58])
    this._cachedDiscovery = Discovery.encode({ids: this.networkArray.map(client => client.id._id)})
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
