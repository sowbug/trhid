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
  var msg_full = new Uint8Array(header_size + full_size);
  msg_full.set(msg_ab, header_size);

  msg_full[0] = 0x23;
  msg_full[1] = 0x23;
  msg_full[3] = msg_type;  // TODO: this should be big-endian short
  msg_full[7] = msg_ab.length;  // TODO: this should be big-endian long
  return msg_full;
}

function sendFeatureReport(reportId, value) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray([value], 1);
    console.log("sending feature report", reportId, value, data, data.length);
    chrome.hid.sendFeatureReport(connectionId, reportId,
      data.buffer, function() {
        console.log("sent feature report", reportId);
        // Ignore failure because the device is bad at HID.
        resolve();
      });
  });
}

function send(reportId, arrayBuffer) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray(arrayBuffer, 63);
    console.log("sending data", reportId, data, data.length);
    chrome.hid.send(connectionId, reportId,
      data.buffer, function() {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError.message);
        } else {
          console.log("sent data", reportId, data);
          resolve();
        }
      });
  });
}

function receive() {
  return new Promise(function(resolve, reject) {
    console.log("and now going to receive", connectionId);
    chrome.hid.receive(connectionId, function(reportId, data) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        console.log("received:", reportId, new Uint8Array(data));
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
      console.log("Received:", report.id, ab2str(report.data));
      return send(
        63,
        serializeMessageForTransport(new _root.GetAddress(0), 29));
    }).then(function() {
      // TODO: we'll receive the same format back: message M, length N, and we
      // need to read consecutive reports until we get N unwrapped bytes.
      // Then we'll instantiate PB #M and ask it to decode the bytes.
      return receive();
    }).then(function(report) {
      console.log("Received:", report.id, ab2str(report.data));
      return disconnect();
    }).catch(function(reason) {
      console.error(reason);
    });
};
