'use strict'

const crypto = require('crypto')

const { CODE_P2P } = require('./constants')

module.exports.getStardustMultiaddr = (ma) => {
  const tuples = ma.stringTuples().filter((tuple) => {
    if (tuple[0] === CODE_P2P) {
      return true
    }
  })

  // Get first id
  return tuples[0][1]
}

module.exports.sha5 = (data) => crypto.createHash('sha512').update(data).digest()
