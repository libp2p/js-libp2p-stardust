'use strict'

/* eslint-env mocha */

const Client = require('..')
const ID = require('peer-id')
const IDJSON = require('./id.json')
const multiaddr = require('multiaddr')
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws/p2p-stardust')

describe('connect', () => {
  let client
  let conn
  let id

  before(async () => {
    id = await ID.createFromJSON(IDJSON)
  })

  it('should be creatable', () => {
    client = new Client({ id })
    conn = client.createListener(() => {})
  })

  it('should connect to server', async () => conn._listen(SERVER_URL))
})
