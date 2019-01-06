'use strict'

const multiaddr = require('multiaddr')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')

function firstSuccess (errMsg, proms) {
  return new Promise((resolve, reject) => {
    let triggered = false
    let promisesLeft = proms.length

    proms.forEach(prom => prom.then(res => {
      if (!triggered) {
        triggered = true
        resolve(res)
      }
    }, () => {
      promisesLeft--
      if (!triggered && !promisesLeft) {
        triggered = true
        reject(new Error(errMsg))
      }
    }))
  })
}

class MicroSwitch {
  constructor ({ muxers, transports, addresses, handler }) {
    this.transports = transports || [new WS()]
    this.muxers = muxers || [MPLEX]
    this.addresses = addresses || [multiaddr('/ip6/::/tcp/5892/ws')]
    this.handler = handler || console.log
  }

  /*
   * Wraps a connection in a muxer
   * @returns MuxedConn
   */
  async wrapInMuxer (conn, isServer) {

  }

  async dial (addr) {
    return firstSuccess('All transports failed to dial', this.transports
      .filter(transport => Boolean(transport.filter([addr]).length))
      .map(transport => new Promise((resolve, reject) => {
        const conn = transport.dial(addr, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve(conn)
          }
        })
      })))
  }

  async startListen () {
    this.listeners = await Promise.all(
      this.transports
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
    )
  }

  async stopListen () {
    await Promise.all(this.listeners.map(listener => new Promise((resolve, reject) => listener.close(err => err ? reject(err) : resolve()))))
  }
}

module.exports = MicroSwitch
