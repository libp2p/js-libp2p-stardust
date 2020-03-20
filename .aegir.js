'use strict'

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')

const IDJSON = require('./test/fixtures/peer-server.json')

const Server = require('./src/server')
let server
let firstRun = true

async function pre () {
  const peerId = await PeerId.createFromJSON(IDJSON)
  const peerInfo = await PeerInfo.create(peerId)

  server = new Server({
    discoveryInterval: 2e3,
    peerInfo,
    hasMetrics: firstRun
  })
  if (firstRun) { firstRun = false }

  await server.start()
}

function post () {
  return server.stop()
}

module.exports = {
  hooks: {
    pre,
    post
  }
}
