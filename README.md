# js-libp2p-stardust

[![](https://img.shields.io/badge/made%20by-mkg20001-blue.svg?style=flat-square)](https://mkg20001.io)
[![](https://img.shields.io/badge/project-libp2p-yellow.svg?style=flat-square)](http://libp2p.io/)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![Discourse posts](https://img.shields.io/discourse/https/discuss.libp2p.io/posts.svg)](https://discuss.libp2p.io)
[![Coverage Status](https://coveralls.io/repos/github/libp2p/js-libp2p-stardust/badge.svg?branch=master)](https://coveralls.io/github/libp2p/js-libp2p-stardust?branch=master)
[![Travis CI](https://travis-ci.com/libp2p/js-libp2p-stardust.svg?branch=master)](https://travis-ci.com/libp2p/js-libp2p-stardust)
[![Dependency Status](https://david-dm.org/libp2p/js-libp2p-stardust.svg?style=flat-square)](https://david-dm.org/libp2p/js-libp2p-stardust)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)

> `libp2p-stardust` is one of the multiple transports available for libp2p. `libp2p-stardust` incorporates both a transport and a discovery service that is facilitated by the stardust server, also available in this repo.

## Lead Maintainer

[Maciej Krüger](https://github.com/mkg20001)

## Protocol

You can read the protocol specification on [PROTOCOL.md](./PROTOCOL.md).

## Usage

### Install

```bash
> npm install libp2p-stardust
```

### Example

```js
const Stardust = require('libp2p-stardust')
const multiaddr = require('multiaddr')
const pipe = require('it-pipe')
const { collect } = require('streaming-iterables')

const addr = multiaddr('/ip4/188.166.203.82/tcp/5892/ws/p2p-stardust')

const stardust = new Stardust({ upgrader })

const listener = stardust.createListener((socket) => {
  console.log('new connection opened')
  pipe(
    ['hello'],
    socket
  )
})

await listener.listen(addr)
console.log('listening')

const socket = await stardust.dial(addr)
const values = await pipe(
  socket,
  collect
)

console.log(`Value: ${values.toString()}`)

// Close connection after reading
await listener.close()
```

## API

### Transport

[![](https://raw.githubusercontent.com/libp2p/interface-transport/master/img/badge.png)](https://github.com/libp2p/interface-transport)

### Connection

[![](https://raw.githubusercontent.com/libp2p/interface-connection/master/img/badge.png)](https://github.com/libp2p/interface-connection)

### Peer Discovery - `ws.discovery`

[![](https://github.com/libp2p/interface-peer-discovery/raw/master/img/badge.png)](https://github.com/libp2p/interface-peer-discovery)

## Stardust Server

Setting up your own stardust server is really easy

First install stardust globally.

```bash
> npm install --global libp2p-stardust
```

Now you can use the cli command `stardust-server` to spawn a stardust server.

It only accepts one argument: The address to listen on.

There isn't much to configure via the CLI currently.

By default it listens on `/ip6/::/tcp/5892/ws`

For further customization (e.g. swapping the muxer, using other transports) it is recommended to create a server via the API.

## Hosted Stardust server

We host a stardust server at `/dns4/stardust.mkg20001.io` that can be used for practical demos and experimentation, it **should not be used for apps in production**.

A libp2p-stardust address, using the server we provide, looks like:

`/dns4/stardust.mkg20001.io/tcp/443/wss/p2p-stardust/ipfs/<your-peer-id>`

Note: The address above indicates WebSockets Secure, which can be accessed from both http and https.

LICENSE MPL-2.0
