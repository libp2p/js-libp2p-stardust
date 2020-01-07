/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')
const Stardust = require('..')
const pull = require('pull-stream/pull')
const pDefer = require('p-defer')

const IDJSON = [require('./id.json'), require('./id2.json')]
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe('discovery', () => {
  let clients = []

  beforeEach(async () => {
    const ids = await Promise.all(IDJSON.map(id => PeerId.createFromJSON(id)))

    clients = ids.map(id => new Stardust({ upgrader: mockUpgrader, id }))
  })

  it('listen on the second, discover the first', async function () {
    this.timeout(15000)

    const deferred = pDefer()
    const listeners = clients.map(client => client.createListener(conn => pull(conn, conn)))
    await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

    const maListener = multiaddr(SERVER_URL.toString() + '/p2p/' + clients[1].id.toB58String())

    clients[0].discovery.start()
    clients[1].discovery.start()
    clients[0].discovery.once('peer', async (peerInfo) => {
      expect(peerInfo.multiaddrs.has(maListener)).to.equal(true)
      await Promise.all(listeners.map(listener => listener.close()))
      deferred.resolve()
    })

    await deferred.promise
  })
})
