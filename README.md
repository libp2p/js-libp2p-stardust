# libp2p-stardust

A better ws-star implementation

# Protocol

```proto
enum Error {
  OK                   = 0;
  E_RAND_LENGTH        = 100; // random128 has mismatching length
  E_INCORRECT_SOLUTION = 101;
  E_GENERIC            = 999; // something(TM) went wrong
}

message PeerID {
  bytes id = 1;
  bytes pubKey = 2;
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
```
