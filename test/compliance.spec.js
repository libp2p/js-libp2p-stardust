/* eslint-env mocha */
'use strict'

const testsTransport = require('libp2p-interfaces/src/transport/tests')
const testsDiscovery = require('libp2p-interfaces/src/peer-discovery/tests')
const multiaddr = require('multiaddr')

const Stardust = require('../src')
const { createPeer } = require('./utils')

// Skipped due to https://github.com/libp2p/js-libp2p-stardust/issues/21
describe.skip('interface-transport compliance', () => {
  testsTransport({
    async setup ({ upgrader }) {
      const [libp2p] = await createPeer()
      const stardust = new Stardust({ upgrader, id: libp2p.peerInfo.id, libp2p })

      const base = (id) => {
        return `/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust/p2p/${id}`
      }

      const addrs = [
        multiaddr(base('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSooo2a')),
        multiaddr(base('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSooo2b')),
        multiaddr(base('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSooo2c'))
      ]

      // Used by the dial tests to simulate a delayed connect
      const connector = {
        delay () { },
        restore () { }
      }

      return { transport: stardust, addrs, connector }
    }
  })
})

describe('interface-discovery compliance', () => {
  testsDiscovery({
    async setup () {
      const mockUpgrader = {
        upgradeInbound: maConn => maConn,
        upgradeOutbound: maConn => maConn
      }
      const [libp2p] = await createPeer()
      const stardust = new Stardust({ upgrader: mockUpgrader, id: libp2p.peerInfo.id, libp2p })

      return stardust.discovery
    }
  })
})
