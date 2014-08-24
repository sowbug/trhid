trhid
=====

Proof of concept Chrome App that speaks to a Trezor.

To build:

  1. (just once) sudo npm install -g vulcanize
  1. vulcanize -o window-build.html window.html --csp

To generate the protobuf JS file:

  * ./bin/proto2js trezor-common/protob/messages.proto -class > messages_proto.js
