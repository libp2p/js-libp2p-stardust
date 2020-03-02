/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const multiaddr = require('multiaddr')
const Stardust = require('..')

const { createPeer } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('filter', () => {
  let stardust

  beforeEach(async () => {
    const [libp2p] = await createPeer()
    stardust = new Stardust({ upgrader: mockUpgrader, libp2p })
  })

  it('filters non valid stardust multiaddrs', () => {
    const maArr = [
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust'),
      multiaddr('/dnsaddr/libp2p.io/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1'),
      multiaddr('/dnsaddr/signal.libp2p.io/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1'),
      multiaddr('/dnsaddr/signal.libp2p.io/wss/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo2'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo3'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo4'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo4'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo4'),
      multiaddr('/ip4/127.0.0.1/tcp/9090/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo4' +
        '/p2p-circuit/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1')
    ]

    const filtered = stardust.filter(maArr)
    expect(filtered.length).to.equal(9)
  })

  it('filter a single addr for this transport', () => {
    const ma = multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSoooo1')

    const filtered = stardust.filter(ma)
    expect(filtered.length).to.equal(1)
  })
})
