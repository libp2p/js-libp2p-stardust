'use strict'

/* eslint-env mocha */

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const Stardust = require('../src')

const { createPeer, getStardustMultiaddr } = require('./utils')
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}

describe('instance', () => {
  let libp2p

  before(async () => {
    [libp2p] = await createPeer()
  })

  it('should be creatable and able to connect', async () => {
    const client = new Stardust({ upgrader: mockUpgrader, libp2p })
    const conn = client.createListener(() => {})
    await conn.listen(getStardustMultiaddr(conn.client.id.toB58String()))
  })

  it('throws creating without upgrader', () => {
    expect(() => new Stardust().to.throw())
  })

  it('throws creating without libp2p', () => {
    expect(() => new Stardust({ upgrader: mockUpgrader }).to.throw())
  })
})
