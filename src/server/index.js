'use strict'

const MicroSwitch = require('../micro-switch')
const LP = require('../rpc/lp')
const pull = require('pull-stream/pull')
const handshake = require('pull-handshake')
const {JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, DialRequest, DialResponse, Error} = require('../rpc/proto')

const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

const xor = (a, b) => {
  const r = Buffer.allocUnsafe(a.length)

  for (var i = 0; i < a.length; i++) {
    r[i] = a[i] ^ b[i]
  }

  return r
}

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

    const shake = stream.handshake
    const rpc = LP.wrap(shake, {push: shake.write})

    const {target} = await rpc.readProto(DialRequest)
    const targetB58 = new ID(target).toB58String()

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
  }

  handler (conn) {
    const muxed = this.switch.wrapInMuxer(conn, true)
    muxed.newStream(async (err, conn) => {
      if (err) {
        return log(err)
      }

      const rpc = LP(conn)

      try {
        const {random, peerID} = await rpc.readProto(JoinInit)
        const id = await prom(cb => ID.createFromJSON(peerID))

        const xorSecret = crypto.randomBytes(128)
        const xorEncrypted = prom(cb => id.encrypt(xorSecret, cb))

        rpc.writeProto(JoinChallenge, {xor: xorEncrypted})

        const solution = xor(random, xorSecret)

        const {solution: solutionClient} = await rpc.readProto(JoinChallengeSolution)

        if (!Buffer.compare(solution, solutionClient)) {
          return rpc.writeProto(JoinVerify, {error: Error.E_INCORRECT_SOLUTION}) // TODO: connection close
        }

        rpc.writeProto(JoinVerify, {})

        this.addToNetwork(new Client({muxed, rpc, id, server: this}))
      } catch (e) {
        log(e)
        rpc.writeProto(JoinVerify, {error: Error.E_GENERIC}) // if anything fails, respond
      }
    })
  }

  addToNetwork (client) {
    this.network[client.id.toB58String()] = client
  }

  async start () {
    await this.switch.startListen()
  }
}

module.exports = Server
