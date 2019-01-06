'use strict'

const MicroSwitch = require('../micro-switch')
const Connection = require('./connection')

class Client { // Standalone client for testing
  constructor ({ transports, muxers, id }) {
    this.switch = new MicroSwitch({ transports, addresses: [], muxers })
    this.id = id

    this.servers = {}
  }

  createConnection (handler) {
    return new Connection(this, handler)
  }
}

module.exports = Client
