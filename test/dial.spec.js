/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const pipe = require('it-pipe')
const { collect } = require('streaming-iterables')

const multiaddr = require('multiaddr')
const Stardust = require('../src')

const { createPeer, getStardustMultiaddr } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('dial', () => {
  let clients = []
  let listeners = []

  before(async () => {
    const peers = await createPeer({
      number: 2
    })

    clients = peers.map((libp2p) => new Stardust({ upgrader: mockUpgrader, libp2p }))
    listeners = clients.map(client => client.createListener(stream => pipe(stream, stream)))

    // start discovery
    clients.forEach((client) => client.discovery.start())
    await Promise.all(listeners.map(listener => listener.listen(getStardustMultiaddr(listener.client.id.toB58String()))))
  })

  it('dial on IPv4 should return a valid connection', async function () {
    this.timeout(20 * 1000)

    const ma = multiaddr(listeners[1].address.toString())

    const conn = await clients[0].dial(ma)
    const data = 'hey'
    const values = await pipe(
      [data],
      conn,
      collect
    )

    expect(values[0].slice()).to.eql(Buffer.from(data))
  })

  it('dialing a nonexistent peer should fail (IPv4)', async function () {
    this.timeout(20 * 1000)
    const maOffline = multiaddr('/ip4/127.0.0.1/tcp/15555/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSooo2f')

    try {
      await clients[0].dial(maOffline)
    } catch (err) {
      expect(err).to.exist()
      return
    }

    throw new Error('dial did not fail')
  })
})
