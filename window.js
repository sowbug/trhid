var connectionId;
var HARDEN = 0x80000000;

function processPubkey(pubkey) {
  if (pubkey.xpub != null) {
    // As of August 10 firmwares and onward
    return pubkey.xpub;
  }
  // Otherwise we have to do a lot of work.
  var node = pubkey.node;
  var buf = new Buffer.Buffer(78 - 33 - 32);
  buf.writeUInt32BE(0x0488B21E, 0);
  buf.writeUInt8(node.depth, 4);
  buf.writeUInt32BE(node.fingerprint, 5);
  buf.writeUInt32BE(node.child_num, 9);
  buf = Buffer.Buffer.concat(
    [buf,
     new Buffer.Buffer(new Uint8Array(node.chain_code.toBuffer())),
     new Buffer.Buffer(new Uint8Array(node.public_key.toBuffer()))],
    78);
  hdnode = Bitcoin.HDNode.fromBuffer(buf);
  return hdnode.toBase58();
}

function getDevice() {
  return new Promise(function(resolve, reject) {
    chrome.hid.getDevices(
      {vendorId: 0x534c, productId: 0x0001},
      function(devices) {
        if (!devices || devices.length == 0) {
          reject("No device found.");
        } else {
          // TODO: handle multiple devices
          resolve(devices[0].deviceId);
        }
      });
  });
}

function connect(deviceId) {
  return new Promise(function(resolve, reject) {
    chrome.hid.connect(deviceId, function(connection) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(connection.connectionId);
      }
    });
  });
}

function padByteArray(sequence, size) {
  var newArray = new Uint8Array(size);
  newArray.set(sequence);
  return newArray;
}

// Format is (big-endian)...
//  - ASCII ##
//  - unsigned short, message type (protocol buffer index)
//  - unsigned long, message length
//  - the message (if any)
function serializeMessageForTransport(msg, msg_type) {
  var msg_ab = new Uint8Array(msg.encodeAB());
  var header_size = 1 + 1 + 4 + 2;
  var full_size = header_size + msg_ab.length;
  var msg_full = new dcodeIO.ByteBuffer(header_size + full_size);
  msg_full.writeByte(0x23);
  msg_full.writeByte(0x23);
  msg_full.writeUint16(msg_type);
  msg_full.writeUint32(msg_ab.length);
  msg_full.append(msg_ab);
  return new Uint8Array(msg_full.buffer);
}

function sendFeatureReport(reportId, value) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray([value], 1);
    chrome.hid.sendFeatureReport(
      connectionId,
      reportId,
      data.buffer,
      function() {
        // Ignore failure because the device is bad at HID.
        resolve();
      });
  });
}

function send(reportId, arrayBuffer) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray(arrayBuffer, 63);
    chrome.hid.send(connectionId, reportId,
                    data.buffer, function() {
                      if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError.message);
                      } else {
                        resolve();
                      }
                    });
  });
}

function receive() {
  return new Promise(function(resolve, reject) {
    chrome.hid.receive(connectionId, function(reportId, data) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve({id: reportId, data: data});
      }
    });
  });
}

function receiveMoreOfMessageBody(messageBuffer, messageSize) {
  return new Promise(function(resolve, reject) {
    if (messageBuffer.offset >= messageSize) {
      resolve(messageBuffer);
    } else {
      receive().then(function(report) {
        if (report == null || report.data == null) {
          reject("received no data from device");
        } else {
          messageBuffer.append(report.data);
          receiveMoreOfMessageBody(messageBuffer,
                                   messageSize).then(function(message) {
                                     resolve(message);
                                   });
        }
      });
    }
  });
}

function parseHeadersAndCreateByteBuffer(first_msg) {
  var msg = dcodeIO.ByteBuffer.concat([first_msg]);
  var original_length = msg.limit;

  var sharp1 = msg.readByte();
  var sharp2 = msg.readByte();
  if (sharp1 != 0x23 || sharp2 != 0x23) {
    console.error("Didn't receive expected header signature.");
    return null;
  }
  var messageType = msg.readUint16();
  var messageLength = msg.readUint32();
  var messageBuffer = new dcodeIO.ByteBuffer(messageLength);
  messageBuffer.append(msg);

  return [messageType, messageLength, messageBuffer];
}

function receiveMessage() {
  return new Promise(function(resolve, reject) {
    receive().then(function(report) {
      var headers = parseHeadersAndCreateByteBuffer(report.data);
      if (headers == null) {
        reject("Failed to parse headers.");
      } else {
        receiveMoreOfMessageBody(headers[2], headers[1])
          .then(function(byteBuffer) {
            byteBuffer.reset();
            resolve(byteBuffer.toArrayBuffer());
          });
      }
    });
  });
}

function disconnect() {
  return new Promise(function(resolve, reject) {
    if (connectionId == null) {
      resolve();
      return;
    }
    chrome.hid.disconnect(connectionId, function() {
      connectionId = null;
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        console.log("closed");
        resolve();
      }
    });
  });
}

function clearFields() {
  document.querySelector("#label").innerHTML = "[Device disconnected]";
  document.querySelector("#device_id").value = "";
  document.querySelector("#address").value = "";
}

function queryFirstConnectedDevice() {
  var ProtoBuf = dcodeIO.ProtoBuf;
  var builder = ProtoBuf.newBuilder();

clearFields();

  getDevice()
    .then(function(deviceId) {
      return connect(deviceId);
    }).then(function(id) {
      console.log("Have connection ID", id);
      connectionId = id;
      return sendFeatureReport(0x41, 0x01);
    }).then(function() {
      return sendFeatureReport(0x43, 0x03);
    }).then(function() {
      return send(
        63,
        serializeMessageForTransport(new _root.Initialize(), 0));
    }).then(function() {
      return receiveMessage();
    }).then(function(message) {
      var features = _root.Features.decode(message);
      document.querySelector("#label").innerHTML = features.label;
      document.querySelector("#device_id").value = features.device_id;
      return send(
        63,
        serializeMessageForTransport(new _root.GetAddress(
          [HARDEN | 44, HARDEN | 0, HARDEN | 0, 0, 0]), 29));
    }).then(function() {
      return receiveMessage();
    }).then(function(message) {
      var address = _root.Address.decode(message);
      document.querySelector("#address").value = address.address;
      return send(
        63,
        serializeMessageForTransport(new _root.GetPublicKey(
          [HARDEN | 44, HARDEN | 0, HARDEN | 0]), 11));
    }).then(function() {
      return receiveMessage();
    }).then(function(message) {
      var pubkey = _root.PublicKey.decode(message);
      var xpub = processPubkey(pubkey);
      document.querySelector("#xpub").value = xpub;
      return disconnect();
    }).catch(function(reason) {
      console.error(reason);
      disconnect();
    });
}

window.onload = function() {
  document.querySelector("#query-button").addEventListener(
    "click",
    queryFirstConnectedDevice);

  queryFirstConnectedDevice();
};
