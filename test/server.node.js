/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const sinon = require('sinon')
const pWaitFor = require('p-wait-for')

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const multiaddr = require('multiaddr')

const pipe = require('it-pipe')

const IDJSON = require('./fixtures/peer-server.json')
const Server = require('../src/server')
const Stardust = require('../src')

const { createPeer } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5893/ws/p2p-stardust/p2p/QmY7t45zkBxzw5rtWQp3oAjzoJGTjh49f7LNz4YPBtTpqy')

describe('server', () => {
  let server

  beforeEach(async () => {
    const peerId = await PeerId.createFromJSON(IDJSON)
    const peerInfo = await PeerInfo.create(peerId)
    const addresses = [multiaddr('/ip6/::/tcp/5893/ws')]

    server = new Server({ addresses, peerInfo })
    await server.start()
  })

  afterEach(async () => {
    sinon.reset()
    server && await server.stop()
  })

  it('server should untrack the peer if no ack received', async () => {
    const [libp2p] = await createPeer()
    const client = new Stardust({ upgrader: mockUpgrader, libp2p })
    const listener = client.createListener(stream => pipe(stream, stream))

    // start discovery
    client.discovery.start()

    const spyRegister = sinon.spy(server, '_register')
    const spyAddToNetwork = sinon.spy(server, 'addToNetwork')
    const spyRemoveFromNetwork = sinon.spy(server, 'removeFromNetwork')

    expect(Object.keys(server.network).length).to.eql(0)
    await listener.listen(SERVER_URL)

    // client and server are connected
    expect(listener.wrappedStream).to.exist()
    expect(listener.serverConnection).to.exist()
    expect(listener.serverConnection.stat.status).to.eql('open')
    expect(Object.keys(server.network).length).to.eql(1)

    // Register messages received
    expect(spyRegister.called).to.eql(true)
    expect(spyAddToNetwork.called).to.eql(true)
    expect(spyRemoveFromNetwork.called).to.eql(false)

    // Trigger a disconnect from the client
    await listener.close()

    // Wait for removal from network
    await pWaitFor(() => spyRemoveFromNetwork.called)
    expect(Object.keys(server.network).length).to.eql(0)
  })
})
