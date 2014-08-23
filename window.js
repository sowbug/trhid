var connectionId;

function getDevice() {
  return new Promise(function(resolve, reject) {
    chrome.hid.getDevices(
      {vendorId: 0x534c, productId: 0x0001},
      function(devices) {
        if (!devices || devices.length == 0) {
          reject("No device found.");
        } else {
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

function parseHeaders(first_msg) {
  var msg = dcodeIO.ByteBuffer.concat([first_msg]);
  var sharp1 = msg.readByte();
  var sharp2 = msg.readByte();
  if (sharp1 != 0x23 || sharp2 != 0x23) {
    return null;
  }
  var msg_type = msg.readUint16();
  var msg_length = msg.readUint32();
  return [msg_type, msg_length, msg.slice()];
}

function sendFeatureReport(reportId, value) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray([value], 1);
    chrome.hid.sendFeatureReport(connectionId, reportId,
      data.buffer, function() {
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

function disconnect() {
  return new Promise(function(resolve, reject) {
    chrome.hid.disconnect(connectionId, function() {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        console.log("closed");
        resolve();
      }
    });
  });
}

// http://stackoverflow.com/a/11058858
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function str2ab(str) {
  var buf = new ArrayBuffer(str.length);
  var bufView = new Uint8Array(buf);
  for (var i=0, strLen=str.length; i<strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

window.onload = function() {
  document.querySelector('#greeting').innerText =
    'Hello, World! It is ' + new Date();

  var ProtoBuf = dcodeIO.ProtoBuf;
  var builder = ProtoBuf.newBuilder();
  var bytes_to_read;
  var seen;

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
      return receive();
    }).then(function(report) {
      var result = parseHeaders(report.data);
      if (result == null) {
        reject("Failed to parse headers.");
      }
      bytes_to_read = result[1];
      seen = dcodeIO.ByteBuffer.concat([result[2]]);
    }).then(function() {
      return receive();
    }).then(function(report) {
      seen = dcodeIO.ByteBuffer.concat([seen, report.data]);
    }).then(function() {
      return receive();
    }).then(function(report) {
      seen = dcodeIO.ByteBuffer.concat([seen, report.data]);
    }).then(function() {
      return receive();
    }).then(function(report) {
      seen = dcodeIO.ByteBuffer.concat([seen, report.data]);
      seen = seen.slice(0, bytes_to_read);
      console.log("Received:", _root.Features.decode(seen));
      return send(
        63,
        serializeMessageForTransport(new _root.GetAddress(
          [0x80000000 | 44, 0x80000000, 0x80000000, 0, 0]), 29));
    }).then(function() {
      return receive();
    }).then(function(report) {
      var result = parseHeaders(report.data);
      if (result == null) {
        reject("Failed to parse headers.");
      }
      bytes_to_read = result[1];
      seen = dcodeIO.ByteBuffer.concat([result[2]]);
      seen = seen.slice(0, bytes_to_read);
      console.log("Received:", _root.Address.decode(seen));
      return disconnect();
    }).catch(function(reason) {
      console.error(reason);
    });
};
