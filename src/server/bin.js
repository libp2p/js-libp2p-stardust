'use strict'

// Usage: $0 [<address> <address 2>...]

/* eslint-disable no-console */

const Server = require('.')

let addresses = process.argv.slice(2)
if (!addresses.length) { addresses = null } // use default if none provided

const server = new Server({ addresses })
server.start().then(() => {
  server.switch.addresses.map(String).forEach(addr => console.log('Listening on %s', addr))
}, err)

function stop () {
  console.log('Stopping...')
  server.stop().then(() => process.exit(0), err)
}

function err (err) {
  console.error(err.stack)
  process.exit(2)
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
