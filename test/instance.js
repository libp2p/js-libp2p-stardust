'use strict'

/* eslint-env mocha */

const Client = require('..')
const PeerId = require('peer-id')
const multiaddr = require('multiaddr')

const IDJSON = require('./id.json')
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('instance', () => {
  let client
  let conn
  let id

  before(async () => {
    id = await PeerId.createFromJSON(IDJSON)
  })

  it('should be creatable', () => {
    client = new Client({ upgrader: mockUpgrader, id })
    conn = client.createListener(() => {})
  })

  it('should connect to server', async () => {
    await conn._listen(SERVER_URL)
  })
})
