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
  bytes saltEncrypted = 2;
}

message JoinChallengeSolution {
  bytes solution = 1; // sha5(random128, decrypt(saltEncrypted, id.priv))
}

message JoinVerify {
  Error error = 1;
}

message Discovery {
  repeated bytes ids = 1;
}

message DiscoveryAck {
  bytes ack = 1;
}

message DialRequest {
  bytes target = 1;
}

message DialResponse {
  Error error = 1;
}

`)

const E = module.exports.Error

module.exports.ErrorTranslations = {
  [E.OK]: 'OK',
  [E.E_RAND_LENGTH]: 'random128 field should be exactly 128 bytes long!',
  [E.E_INCORRECT_SOLUTION]: 'The challenge solution provided by the client was incorrect',
  [E.E_GENERIC]: 'Internal Server Error'
}
