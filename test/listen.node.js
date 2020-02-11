/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const multiaddr = require('multiaddr')
const Stardust = require('../src')

const { createPeer } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe('listen', () => {
  let stardust

  beforeEach(async () => {
    const [libp2p] = await createPeer()
    stardust = new Stardust({ upgrader: mockUpgrader, id: libp2p.peerInfo.id, libp2p })
  })

  it('listen, check for promise', async () => {
    const listener = stardust.createListener((conn) => { })
    await listener.listen(SERVER_URL)
    await listener.close()
  })

  it('listen, check for listening event', (done) => {
    const listener = stardust.createListener((conn) => { })

    listener.on('listening', async () => {
      await listener.close()
      done()
    })

    listener.listen(SERVER_URL)
  })

  it('listen, check for the close event', (done) => {
    const listener = stardust.createListener((conn) => { })

    listener.on('listening', () => {
      listener.on('close', done)
      listener.close()
    })

    listener.listen(SERVER_URL)
  })

  it('getAddrs', async () => {
    const listener = stardust.createListener(() => { })

    await listener.listen(SERVER_URL)

    const addrs = listener.getAddrs()
    expect(addrs[0]).to.deep.equal(SERVER_URL)

    await listener.close()
  })
})
