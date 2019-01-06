'use strict'

const Server = require('.')

const server = new Server({})
server.start().then(() => {
  console.log('Started!')
})
