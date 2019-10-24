'use strict'

/* eslint-env mocha */

const Client = require('..')
const ID = require('peer-id')
const IDJSON = require('./id.json')
const multiaddr = require('multiaddr')
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')
const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

describe('connect', () => {
  let client
  let conn
  let id

  before(async () => {
    id = await prom(cb => ID.createFromJSON(IDJSON, cb))
  })

  it('should be creatable', () => {
    client = new Client({ id })
    conn = client.createListener(() => {})
  })

  it('should connect to server', async () => {
    await conn._listen(SERVER_URL)
  })
})
