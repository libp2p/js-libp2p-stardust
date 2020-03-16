#!/usr/bin/env node

'use strict'

// Usage: $0 [-p <port>] [--disableMetrics]

/* eslint-disable no-console */

const http = require('http')
const menoetius = require('menoetius')

const multiaddr = require('multiaddr')
const Server = require('.')

const argv = require('minimist')(process.argv.slice(2))

async function run () {
  const metrics = !(argv.disableMetrics || process.env.DISABLE_METRICS)
  const port = argv.port || argv.p || process.env.PORT || 5892
  const addresses = [multiaddr(`/ip6/::/tcp/${port}/ws`)]

  let metricsServer

  const server = new Server({ addresses, hasMetrics: metrics })
  await server.start()

  console.log('server peerID: ', server.libp2p.peerInfo.id.toB58String())

  server.peerAddr.forEach((ma) => console.log('listening on %s', ma.toString()))

  if (metrics) {
    console.log('enabling metrics')
    metricsServer = http.createServer((req, res) => {
      if (req.url !== '/metrics') {
        res.statusCode = 200
        res.end()
      }
    })

    menoetius.instrument(metricsServer)

    metricsServer.listen(8003, '127.0.0.1', () => {
      console.log('metrics server listening on 8003')
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
