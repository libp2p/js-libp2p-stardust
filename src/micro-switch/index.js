'use strict'

const multiaddr = require('multiaddr')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')

class MicroSwitch {
  constructor ({ muxers, transports, addresses, handler }) {
    this.transports = transports || [new WS()]
    this.muxers = muxers || [MPLEX]
    this.addresses = addresses || [multiaddr('/ip6/::/tcp/5892')]
    this.handler = handler || console.log
  }

  /*
   * Wraps a connection in a muxer
   * @returns MuxedConn
   */
  async wrapInMuxer (conn, isServer) {

  }

  async dial (addr) {
    this.transports // TODO: get first that succeeds or throw if none do
      .filter(transport => Boolean(transport.filter([addr]).length))
      .map(transport => new Promise((resolve, reject) => {
        const conn = transport.dial(addr, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(conn)
          }
        })
      }))
  }

  async startListen () {
    this.listeners = this.transports
      .map(transport => [transport, transport.filter(this.addresses)])
      .filter(res => Boolean(res[1].length))
      .map(res => {
        const [transport, addresses] = res
        return addresses.map(address => new Promise((resolve, reject) => {
          const listener = transport.createListener(this.handler.bind(this))
          listener.listen(address, (err) => {
            if (err) {
              reject(err)
            } else {
              resolve(address)
            }
          })
        }))
      })
      .reduce((a, b) => a.concat(b), [])
    await Promise.all(this.listeners)
  }

  async stopListen () {
    await Promise.all(this.listeners.map(listener => new Promise((resolve, reject) => listener.close(err => err ? reject(err) : resolve()))))
  }
}

module.exports = MicroSwitch
