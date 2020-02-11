'use strict'

/* eslint-env mocha */

const multiaddr = require('multiaddr')
const Stardust = require('../src')

const { createPeer } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe('instance', () => {
  let client
  let conn
  let libp2p

  before(async () => {
    [libp2p] = await createPeer()
  })

  it('should be creatable', () => {
    client = new Stardust({ upgrader: mockUpgrader, id: libp2p.peerInfo.id, libp2p })
    conn = client.createListener(() => {})
  })

  it('should connect to server', async () => {
    await conn.listen(SERVER_URL)
  })
})
