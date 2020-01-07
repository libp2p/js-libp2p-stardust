/* eslint-env mocha */
'use strict'

const testsTransport = require('libp2p-interfaces/src/transport/tests')
const testsDiscovery = require('libp2p-interfaces/src/peer-discovery/tests')
const multiaddr = require('multiaddr')
const PeerId = require('peer-id')

const Stardust = require('../src')

describe.skip('interface-transport compliance', () => {
  testsTransport({
    async setup ({ upgrader }) {
      const id = await PeerId.createFromJSON(require('./id.json'))
      const stardust = new Stardust({ upgrader, id })

      const base = (id) => {
        return `/ip4/127.0.0.1/tcp/15555/ws/p2p-stardust/p2p/${id}`
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
      const id = await PeerId.createFromJSON(require('./id.json'))

      const stardust = new Stardust({ upgrader: mockUpgrader, id })

      return stardust.discovery
    }
  })
})
