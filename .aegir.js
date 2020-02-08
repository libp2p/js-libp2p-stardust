'use strict'

const Server = require('./src/server')
let server

async function pre () {
  server = new Server()
  await server.start()
}

function post () {
  return server.stop()
}

module.exports = {
  hooks: {
    pre,
    post
  }
}
