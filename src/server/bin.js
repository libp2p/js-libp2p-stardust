'use strict'

// Usage: $0 [<address> <address 2>...]

/* eslint-disable no-console */

const Server = require('.')

async function run () {
  let addresses = process.argv.slice(2)
  if (!addresses.length) { addresses = undefined } // use default if none provided

  const server = new Server({ addresses })

  await server.start()

  const stop = async () => {
    console.log('Stopping...')
    await server.stop()
    process.exit(0)
  }

  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

run()
