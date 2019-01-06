'use strict'

const protons = require('protons')

module.exports = protons(`

enum Error {
  OK                   = 0;
  E_RAND_LENGTH        = 100; // random128 has mismatching length
  E_INCORRECT_SOLUTION = 101;
  E_GENERIC            = 999; // something(TM) went wrong
}

message PeerID {
  string id = 1;
  string pubKey = 2;
}

message JoinInit {
  bytes random128 = 1; // must be exactly 128 bytes
  PeerID peerID = 2;
}

message JoinChallenge {
  Error error = 1;
  bytes xorEncrypted = 2;
}

message JoinChallengeSolution {
  bytes solution = 1; // xor(random128, decrypt(xorEncrypted, id.priv))
}

message JoinVerify {
  Error error = 1;
}

message DialRequest {
  bytes id = 1;
}

message DialResponse {
  Error error = 1;
}

`)
