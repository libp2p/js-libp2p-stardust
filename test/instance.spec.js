'use strict'

/* eslint-env mocha */

const Stardust = require('../src')

const { createPeer, SERVER_URL } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('instance', () => {
  let client
  let conn
  let libp2p

  before(async () => {
    [libp2p] = await createPeer()
  })

  it('should be creatable', () => {
    client = new Stardust({ upgrader: mockUpgrader, libp2p })
    conn = client.createListener(() => {})
  })

  it('should connect to server', async () => {
    await conn.listen(SERVER_URL)
  })
})
