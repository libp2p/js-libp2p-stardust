/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const multiaddr = require('multiaddr')
const Stardust = require('../src')
const pipe = require('it-pipe')
const pDefer = require('p-defer')

const { createPeer, SERVER_URL } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('discovery', () => {
  let clients = []

  beforeEach(async () => {
    const peers = await createPeer({
      number: 2
    })

    clients = peers.map((libp2p) => new Stardust({ upgrader: mockUpgrader, id: libp2p.peerInfo.id, libp2p }))
    // start discovery
    clients.forEach((client) => client.discovery.start())
  })

  it('listen on the second, discover the first', async function () {
    this.timeout(15000)

    const deferred = pDefer()
    const listeners = clients.map(client => client.createListener(conn => pipe(conn, conn)))
    await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

    const maListener = multiaddr(SERVER_URL.decapsulate('/p2p/').toString() + '/p2p/' + clients[1].id.toB58String())

    clients[0].discovery.once('peer', async (peerInfo) => {
      expect(peerInfo.multiaddrs.has(maListener)).to.equal(true)
      await Promise.all(listeners.map(listener => listener.close()))
      deferred.resolve()
    })

    await deferred.promise
  })
})
