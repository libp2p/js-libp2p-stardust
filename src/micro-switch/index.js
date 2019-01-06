'use strict'

const multiaddr = require('multiaddr')
const multistream = require('multistream-select')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')

const debug = require('debug')
const log = debug('libp2p:stardust:microswitch')

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

    log('creating microswitch with %o transport(s), %o muxer(s) and %o address(es)', this.transports.length, this.muxers.length, this.addresses.length)

    this.msListener = new multistream.Listener()
    this.muxers.forEach(muxer => {
      this.msListener.addHandler(muxer.multicodec, (protocol, conn) => {
        log('adding handler for %s', muxer.multicodec)
        const muxed = muxer.listener(conn)
        conn.info.info.msCallback(muxed)
      })
    })
  }

  /*
   * Wraps a connection in a muxer
   * @returns MuxedConn
   */
  wrapInMuxer (conn, isServer) {
    log('muxer wrap (isServer=%o)', isServer)
    return new Promise((resolve, reject) => {
      if (isServer) {
        conn.msCallback = resolve
        this.msListener.handle(conn, (err) => {
          if (err) { return reject(err) }
        })
      } else {
        const msDialer = new multistream.Dialer()
        msDialer.handle(conn, (err) => {
          if (err) { return reject(err) }

          const firstMuxer = this.muxers[0] // TODO: iterate or do ls first
          msDialer.select(firstMuxer.multicodec, (err, conn) => {
            if (err) { return reject(err) }
            const muxed = firstMuxer.dialer(conn)
            return resolve(muxed)
          })
        })
      }
    })
  }

  async dial (addr) {
    log('dialing %s', String(addr))
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
            log('listening on %s', String(address))
            const listener = transport.createListener(this.handler.bind(this))
            listener.listen(address, (err) => {
              if (err) {
                reject(err)
              } else {
                resolve(listener)
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
