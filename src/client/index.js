'use strict'

const MicroSwitch = require('../micro-switch')
const LP = require('../rpc/lp')
const pull = require('pull-stream/pull')
const handshake = require('pull-handshake')
const {JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, DialRequest, DialResponse, Error: E, ErrorTranslations} = require('../rpc/proto')

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
const log = debug('libp2p:stardust:client')

function translateAndThrow (eCode) {
  throw new Error(ErrorTranslations[eCode])
}

class Client {
  constructor ({ transports, muxers, id }) {
    this.switch = new MicroSwitch({ transports, addresses: [], muxers })
    this.id = id

    this.servers = {}
  }

  createConnection (handler) {
    return new Connection(this, handler)
  }
}

class Connection {
  constructor (client, handler) {
    this.client = client
    this.handler = handler
  }

  async connect (address) {
    if (this.connected) { return }
    this.address = address

    log('connecting to %s', address)

    let conn = await this.client.switch.dial(address)
    const muxed = await this.client.switch.wrapInMuxer(conn, false)

    conn = await prom(cb => muxed.once('stream', s => cb(null, s)))
    const rpc = LP(conn)

    log('performing challenge')

    const random = crypto.randomBytes(128)
    rpc.writeProto(JoinInit, {random128: random, peerID: this.client.id.toJSON()})

    log('sent rand')

    const {error, xorEncrypted} = await rpc.readProto(JoinChallenge)
    if (error) { translateAndThrow(error) }
    const xorSecret = await prom(cb => this.client.id.privKey.decrypt(xorEncrypted, cb))

    const solution = xor(random, xorSecret)
    rpc.writeProto(JoinChallengeSolution, {solution})

    const {error: error2} = await rpc.readProto(JoinVerify)
    if (error2) { translateAndThrow(error2) }

    log('connected')

    this.connected = true // TODO: handle dynamic disconnects
    this.muxed = muxed
    this.rpc = rpc
  }

  async dial (addr) {
    /*
     - TODO: get peer id, open new conn via muxed, do handshake, do dial, forward
     */
  }
}

module.exports = Client
