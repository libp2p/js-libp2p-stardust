/* eslint-env mocha */
/* eslint max-nested-callbacks: 0 */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const multiaddr = require('multiaddr')
const Stardust = require('../src')
const pipe = require('it-pipe')
const pDefer = require('p-defer')
const pWaitFor = require('p-wait-for')

const { createPeer, SERVER_URL } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('discovery', () => {
  let clients = []

  describe('two nodes', () => {
    beforeEach(async () => {
      const peers = await createPeer({
        number: 2
      })

      clients = peers.map((libp2p) => new Stardust({ upgrader: mockUpgrader, libp2p }))
      // start discovery
      clients.forEach((client) => client.discovery.start())
    })

    it('listen on the second, discover the first', async () => {
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

    it('closing the listener should close the underlying connection to the stardust server with open discovery streams', async () => {
      const deferred = pDefer()
      const listeners = clients.map(client => client.createListener({
        discoveryInterval: 1000
      }, conn => pipe(conn, conn)))
      await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

      const maListener = multiaddr(SERVER_URL.decapsulate('/p2p/').toString() + '/p2p/' + clients[1].id.toB58String())

      clients[0].discovery.once('peer', async (peerInfo) => {
        expect(peerInfo.multiaddrs.has(maListener)).to.equal(true)
        await Promise.all(listeners.map(listener => listener.close()))
        deferred.resolve()
      })

      await deferred.promise

      listeners.forEach((listener) => {
        expect(listener.wrappedStream).to.not.exist()
        expect(listener.serverConnection).to.exist()
        expect(listener.serverConnection.stat.status).to.eql('closed')
      })
    })

    it('should close connection with server on closing listener', async () => {
      const listeners = clients.map(client => client.createListener(conn => pipe(conn, conn)))
      await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

      listeners.forEach((listener) => {
        expect(listener.wrappedStream).to.exist()
        expect(listener.serverConnection).to.exist()
        expect(listener.serverConnection.stat.status).to.eql('open')
      })

      await Promise.all(listeners.map(listener => listener.close()))

      listeners.forEach((listener) => {
        expect(listener.wrappedStream).to.not.exist()
        expect(listener.serverConnection).to.exist()
        expect(listener.serverConnection.stat.status).to.eql('closed')
      })
    })
  })

  describe('several nodes', () => {
    beforeEach(async () => {
      const peers = await createPeer({
        number: 4
      })

      clients = peers.map((libp2p) => new Stardust({ upgrader: mockUpgrader, libp2p }))
      // start discovery
      clients.forEach((client) => client.discovery.start())
    })

    it('discovers all the nodes registered in the server', async function () {
      const discovered = {}
      clients[2].discovery.on('peer', (peer) => {
        discovered[peer.id.toB58String()] = peer
      })

      const listeners = clients.map(client => client.createListener({
        discoveryInterval: 1000
      }, conn => pipe(conn, conn)))
      await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))

      await pWaitFor(() => Object.keys(discovered).length === 3)

      // Validate discovered Peers
      expect(discovered[clients[0].id.toB58String()]).to.exist()
      expect(discovered[clients[1].id.toB58String()]).to.exist()
      expect(discovered[clients[3].id.toB58String()]).to.exist()

      await Promise.all(listeners.map(listener => listener.close()))
    })
  })
})
