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

const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

const IDJSON = [require('./id.json'), require('./id2.json')]
const mockUpgrader = {
  upgradeInbound: maConn => maConn,
  upgradeOutbound: maConn => maConn
}
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe('dial', () => {
  let clients = []
  let listeners = []

  before(async () => {
    const ids = await Promise.all(IDJSON.map(id => PeerId.createFromJSON(id)))

    clients = ids.map(id => new Stardust({ upgrader: mockUpgrader, id }))
    listeners = clients.map(client => client.createListener(conn => pull(conn, conn)))
    await Promise.all(listeners.map(listener => listener.listen(SERVER_URL)))
    clients.forEach(c => (c.addr = multiaddr('/p2p/' + c.id.toB58String())))
  })

  it('dial on IPv4, check promise', async function () {
    this.timeout(20 * 1000)

    const ma = multiaddr(listeners[1].address.toString() + clients[1].addr.toString())
    const conn = await clients[0].dial(ma)
    const data = Buffer.from('some data')

    const values = await prom(cb =>
      pull(
        pull.values([data]),
        conn,
        pull.collect(cb)
      )
    )
    expect(values).to.eql([data])

    // const values = await pipe(
    //   [data],
    //   conn,
    //   collect
    // )
  })

  it('dial offline / non-exist()ent node on IPv4, check promise rejected', async function () {
    this.timeout(20 * 1000)
    const maOffline = multiaddr('/ip4/127.0.0.1/tcp/15555/ws/p2p-stardust/p2p/QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSooo2f')

    try {
      await clients[0].dial(maOffline)
    } catch (err) {
      expect(err).to.exist()
      return
    }

    throw new Error('dial did not fail')
  })
})
