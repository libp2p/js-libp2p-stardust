'use strict'

const multiaddr = require('multiaddr')
const multistream = require('multistream-select')

const WS = require('libp2p-websockets')
const MPLEX = require('libp2p-mplex')

const debug = require('debug')
const log = debug('libp2p:stardust:microswitch')

function noop () { }

function firstSuccess (errMsg, proms) {
  return new Promise((resolve, reject) => {
    let triggered = false
    let promisesLeft = proms.length

    if (!promisesLeft) {
      triggered = true
      reject(new Error(errMsg)) // no promises, instant failure
    }

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
    this.handler = handler || noop

    log('creating microswitch with %o transport(s), %o muxer(s) and %o address(es)', this.transports.length, this.muxers.length, this.addresses.length)

    this.msListener = new multistream.Listener()
    this.muxers.forEach(muxer => {
      this.msListener.addHandler(muxer.multicodec, (protocol, conn) => {
        log('adding handler for %s', muxer.multicodec)
        const muxed = muxer.listener(conn)
        conn.info.info.msCallback(muxed)
      })
    })

    this.protos = new multistream.Listener()
  }

  /**
    * Wraps a connection in a muxer
    * @param {Connection} conn - Connection to wrap
    * @param {boolean} isServer - Set whether this is the server or client side
    * @returns {MuxedConn}
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

  /**
    * Negotiate the protocol to use
    * @param {Connection} conn - Connection to wrap
    * @param {string} requestedProtocol - The requested protocol. If null, server-side is assumed
    * @return {Connection?} Wrapped connection, can be null if server-side
    */
  negotiateProtocol (conn, requestedProtocol) {
    log('negotiate protocol (isServer=%o, proto=%o)', !requestedProtocol, requestedProtocol)
    return new Promise((resolve, reject) => {
      if (!requestedProtocol) {
        this.protos.handle(conn, (err) => {
          if (err) { return reject(err) }
        })
      } else {
        const msDialer = new multistream.Dialer()
        msDialer.handle(conn, (err) => {
          if (err) { return reject(err) }

          msDialer.select(requestedProtocol, (err, conn) => {
            if (err) { return reject(err) }
            return resolve(conn)
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
