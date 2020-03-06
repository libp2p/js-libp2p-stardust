/* eslint-env mocha */

'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const pDefer = require('p-defer')

const Stardust = require('../src')

const { createPeer, getStardustMultiaddr } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('listen', () => {
  let stardust

  beforeEach(async () => {
    const [libp2p] = await createPeer()
    stardust = new Stardust({ upgrader: mockUpgrader, libp2p })
  })

  it('should be able to listen on a valid server', async () => {
    const listener = stardust.createListener(() => { })
    await listener.listen(getStardustMultiaddr(listener.client.id.toB58String()))
    await listener.close()
  })

  it('listen, check for listening event', async () => {
    const defer = pDefer()
    const listener = stardust.createListener(() => { })

    listener.on('listening', async () => {
      await listener.close()
      defer.resolve()
    })

    await listener.listen(getStardustMultiaddr(listener.client.id.toB58String()))
    await defer.promise
  })

  it('listen, check for the close event', async () => {
    const defer = pDefer()
    const listener = stardust.createListener(() => { })

    listener.on('listening', () => {
      listener.on('close', defer.resolve)
      listener.close()
    })

    await listener.listen(getStardustMultiaddr(listener.client.id.toB58String()))
    await defer.promise
  })

  it('getAddrs', async () => {
    const listener = stardust.createListener(() => { })
    const listAddr = getStardustMultiaddr(listener.client.id.toB58String())

    await await listener.listen(listAddr)

    const addrs = listener.getAddrs()
    expect(addrs[0]).to.deep.equal(listAddr)

    await listener.close()
  })
})
