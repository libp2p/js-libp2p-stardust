/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const pipe = require('it-pipe')
const delay = require('delay')
const { collect } = require('streaming-iterables')

const multiaddr = require('multiaddr')
const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const Stardust = require('../src')

const IDJSON = [require('./id.json'), require('./id2.json')]
const { createPeer } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe.only('dial', () => {
  let clients = []
  let listeners = []
  let peers = []

  before(async () => {
    const peers = await createPeer({
      number: 2
    })

    clients = peers.map((libp2p) => new Stardust({ upgrader: mockUpgrader, id: libp2p.peerInfo.id, libp2p }))
    listeners = clients.map(client => client.createListener(stream => pipe(stream, stream)))

    // start discovery
    clients.forEach((client) => client.discovery.start())

    await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

    // const ids = await Promise.all(IDJSON.map(id => PeerId.createFromJSON(id)))

    // clients = ids.map(id => new Stardust({ upgrader: mockUpgrader, id }))
    // listeners = clients.map(client => client.createListener(stream => pipe(stream, stream)))
    // await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))
    // clients.forEach(c => (c.addr = multiaddr('/p2p/' + c.id.toB58String())))
  })

  it('dial on IPv4, check promise', async function () {
    this.timeout(20 * 1000)

    await delay(4000)

    console.log('done')
    // const ma = multiaddr(listeners[1].address.toString() + clients[1].addr.toString())
    // const conn = await clients[0].dial(ma)
    // const data = Buffer.from('some data')

    // const values = await pipe(
    //   [data],
    //   conn,
    //   collect
    // )

    // expect(values).to.eql([data])
  })
})
