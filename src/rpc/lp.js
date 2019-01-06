'use strict'

const lp = require('pull-length-prefixed')
const pushable = require('pull-pushable')
const reader = require('pull-reader')
const pull = require('pull-stream/pull')

module.exports = (conn, time) => {
  const read = reader(time || 30000) // 30sec, because connections can sometimes be really slow
  const write = pushable()

  pull(
    write,
    lp.encode(),
    conn,
    read
  )

  return module.exports.wrap(read, write)
}

module.exports.wrap = (read, write) => {
  const S = {
    write: (msg) => write.push(msg),
    read: () => new Promise((resolve, reject) => {
      lp.decodeFromReader(read, (err, msg) => err ? reject(err) : resolve(msg))
    }),
    readProto: async (proto) => {
      const msg = await S.read()
      return proto.decode(msg)
    },
    writeProto: (proto, msg) => S.write(proto.encode(msg))
  }

  return S
}
