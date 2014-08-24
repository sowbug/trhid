trhid
=====

Proof-of-concept Chrome App for Trezor. Not affiliated with Trezor
manufacturer.

Development requirements
===

  * Chrome 38 or later. If you're on dev channel you should be fine.
  * Some sort of POSIXy system that has make and zip installed.
  * Node.js's [npm](https://www.npmjs.org/). On my OSX machine I
    satisfied this requirement with `brew install node`.
  * `sudo npm install -g vulcanize`

Build with `make`. Yes, it sucks that even web development these days
needs a build step.

To generate the protobuf JS file:

  * ./bin/proto2js trezor-common/protob/messages.proto -class > messages_proto.js
  * TODO: make this part of the build
