'use strict'

const Client = require('../src/client')
const ID = require('peer-id')
const IDJSON = require('./id.json')
const multiaddr = require('multiaddr')
const SERVER_URL = multiaddr('/ip4/127.0.0.1/tcp/5892/ws')

describe('connectivity', () => {
  let client
  let conn
  let id

  before((done) => {
    ID.createFromJSON(IDJSON, (err, _id) => {
      if (err) { return done(err) }
      id = _id

      done()
    })
  })

  it('should be creatable', () => {
    client = new Client({id})
    conn = client.createConnection(() => {})
  })

  it('should connect to server', async () => conn.connect(SERVER_URL))
})
