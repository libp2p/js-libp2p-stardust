'use strict'

const Server = require('./src/server')
let server

function pre (done) {
  server = new Server({})
  server.start.then(done, done)
}

function post (done) {
  server.stop(done, done)
}

module.exports = {
  hooks: {
    pre,
    post
  }
}
