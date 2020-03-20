#!/usr/bin/env node

'use strict'

// Usage: $0 [--libp2pMultiaddr <ma> ... <ma>] [--metricsMultiaddr <ma>] [--disableMetrics]

/* eslint-disable no-console */

const debug = require('debug')
const log = debug('libp2p:stardust:server:bin')

const http = require('http')
const menoetius = require('menoetius')

const multiaddr = require('multiaddr')
const Server = require('.')

const argv = require('minimist')(process.argv.slice(2))

async function run () {
  const metrics = !(argv.disableMetrics || process.env.DISABLE_METRICS)
  const metricsMa = multiaddr(argv.metricsMultiaddr || argv.ma || process.env.METRICSMA || '/ip4/127.0.0.1/tcp/8003')
  const metricsAddr = metricsMa.nodeAddress()

  const libp2pMa = argv.libp2pMultiaddr || argv.lm || process.env.LIBP2PMA || '/ip6/::/tcp/5892/ws'
  const addresses = [multiaddr(libp2pMa)]

  // Add remaining addresses
  if (argv.libp2pMultiaddr || argv.lm) {
    argv._.forEach((addr) => {
      addresses.push(multiaddr(addr))
    })
  }

  let metricsServer

  const server = new Server({ addresses, hasMetrics: metrics })
  await server.start()

  console.log('server peerID: ', server.libp2p.peerInfo.id.toB58String())

  server.peerAddr.forEach((ma) => console.log('listening on %s', ma.toString()))

  if (metrics) {
    log('enabling metrics')
    metricsServer = http.createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.statusCode = 200
        res.end()
      }
    })

    menoetius.instrument(metricsServer)

    metricsServer.listen(metricsAddr.port, metricsAddr.address, () => {
      console.log(`metrics server listening on ${metricsAddr.port}`)
    })
  }

  const stop = async () => {
    console.log('Stopping...')
    await server.stop()
    metricsServer && await metricsServer.close()
    process.exit(0)
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

run()
