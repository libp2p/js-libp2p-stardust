'use strict'

const createServer = require('./src/server')
let server

async function pre () {
  server = await createServer()
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
