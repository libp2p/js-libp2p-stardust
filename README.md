# js-libp2p-stardust

[![](https://img.shields.io/badge/made%20by-mkg20001-blue.svg?style=flat-square)](https://mkg20001.io)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
<!-- TODO: review if enabling old CIs really make sense [![Travis](https://travis-ci.org/libp2p/js-libp2p-stardust.svg?style=flat-square)](https://travis-ci.org/libp2p/js-libp2p-stardust)
[![Circle](https://circleci.com/gh/libp2p/js-libp2p-stardust.svg?style=svg)](https://circleci.com/gh/libp2p/js-libp2p-stardust) -->
[![Coverage](https://coveralls.io/repos/github/libp2p/js-libp2p-stardust/badge.svg?branch=master)](https://coveralls.io/github/libp2p/js-libp2p-stardust?branch=master)
[![david-dm](https://david-dm.org/libp2p/js-libp2p-stardust.svg?style=flat-square)](https://david-dm.org/libp2p/js-libp2p-stardust)

[![](https://raw.githubusercontent.com/libp2p/interface-transport/master/img/badge.png)](https://github.com/libp2p/interface-transport)
[![](https://raw.githubusercontent.com/libp2p/interface-connection/master/img/badge.png)](https://github.com/libp2p/interface-connection)
[![](https://github.com/libp2p/interface-peer-discovery/raw/master/img/badge.png)](https://github.com/libp2p/interface-peer-discovery)

> A better ws-star implementation

> ### WIP

## Why?

ws-star is still a mess, rendezvous is still a work in progress and I just figured that it would be a good idea to do something about that

# Protocol

## [ » .proto definition file ](/src/rpc/proto.js?raw=true)

## Registration flow

```
Client                                                                                  Server

The client connects
Both the server and the client negotiate a muxer to use using multistream-select

The client sends a random 128-byte long string and it's peerID to the server
--[ JoinInit{random128: rand(128), peerID: $self.peerID.toJSON()} ]-------------------->

The server responds with either an error or an encrypted 128-byte salt (that was encrypted using the public key of the id)
<-[ JoinChallenge{ error?, saltEncrypted: encrypt(rand(128), id.pub ]-------------------

The client now decrypts the salt and builds a sha512 hash out of the random string and the salt
(This is so the server cannot make the client decrypt arbitrary data for him)
--[ JoinChallengeSolution{ solution: sha512(random128, decrypt(saltEncrypted, id.priv)->

The server also computes this hash and compares it to the client's solution
If both match, the server adds the client to the network, otherwise it responds with an error
<-[ JoinVerify{ error? } ]--------------------------------------------------------------

The server periodically sends the list of peerIDs that are currently online back to the client
By default every 10s or whenever a client joins
This is also used as a ping by the client
<-[ Discovery{ ids: [<bytes>, ...] } ]--------------------------------------------------
The client sends back an ACK to indicate to the server that it's still connected
--[ DiscoveryAck{  } ]----------------------------------------------------------------->
```

## Dialing flow

```
Client A                                Server                                  Client B

The client opens a muxed connection and sends the peerID of the target over that connection
--[ *opens connection* ]-------------->
--[ DialRequest{ target: <bytes> } ]-->

The server verifies if the client is online and responds with either an error or opens a connection to the other and forwards that over the existing connection
                                        --[ *opens connection* ]--------------->
<-[ DialRequest{ error? } ]------------
---------------------------------------->-[ *forwarded connection* ]----------->

After that the normal libp2p dialing flow is happening between A and B
```

# Choices and explanations

## Why not use libp2p's built-in switch instead of microswitch?

- Complexity: Dynamic injection isn't a thing yet, and any other solution would be a complete mess
- Performance: As stardust will mainly be used over wss:// there is no need to add another layer of SECIO on top of that (connections between peers are verified and protected by SECIO anyways)

## Crypto challenge

- Using a signature challenge would make the client sign anything the server gives it
- Using a decryption challenge would make the client decrypt anything the server gives it
- Using a hash-based decryption challenge solves those problems as the decrypted data is hashed together with random data so that even if the client were to be tricked into decrypting secrets, those would come back as an useless hash to the attacker

## Not using PoW for registrations like rendezvous

That's why it takes forever to be developed ;)

## Lead Maintainer

[Maciej Krüger](https://github.com/mkg20001)

## Description

`libp2p-stardust` is one of the multiple transports available for libp2p. `libp2p-stardust` incorporates both a transport and a discovery service that is facilitated by the stardust server, also available in this repo and module.

## Todo

 - [ ] Integrate as libp2p transport (WIP)
 - [x] Add discovery
 - [ ] Split server into it's own repo

## Usage

### Example

```js
'use strict'

const Libp2p = require('libp2p')
const Id = require('peer-id')
const Info = require('peer-info')
const multiaddr = require('multiaddr')
const pull = require('pull-stream')

const Stardust = require('libp2p-stardust')

Id.create((err, id) => { // generate a random id for testing
  if (err) { throw err } // re-throw any error that might have occured

  const peerInfo = new Info(id)
  peerInfo.multiaddrs.add(multiaddr('/dns4/<TODO>/tcp/443/wss/p2p-stardust/'))

  const stardust = new Stardust({ id }) // the id is required to prove the client's identity to the server

  const modules = {
    transport: [
      stardust
    ],
    discovery: [
      stardust.discovery
    ]
  }

  const node = new Libp2p(modules, peerInfo) // create a libp2p node with the stardust transport

  node.handle('/test/1.0.0', (protocol, conn) => {
    pull(
      pull.values(['hello']),
      conn,
      pull.map((s) => s.toString()),
      pull.log()
    )
  })

  node.start((err) => {
    if (err) {
      throw err
    }

    node.dial(peerInfo, '/test/1.0.0', (err, conn) => {
      if (err) {
        throw err
      }

      pull(
        pull.values(['hello from the other side']),
        conn,
        pull.map((s) => s.toString()),
        pull.log()
      )
    })
  })
})
```

Outputs:
```
hello
hello from the other side
```

### Install

```bash
> npm install libp2p-stardust
```

### API

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
