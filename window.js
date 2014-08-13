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

function send(reportId, dataArray) {
  return new Promise(function(resolve, reject) {
    var data = padByteArray(dataArray, 63);
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

var sendDataInit = [0x23, 0x23, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

var sendDataAddress = [0x23, 0x23, 0x00, 0x1d, 0x00, 0x00, 0x00, 0x21,
                       0x08, 0xac, 0x80, 0x80, 0x80, 0x08, 0x08, 0x80,
                       0x80, 0x80, 0x80, 0x08, 0x08, 0x80, 0x80, 0x80,
                       0x80, 0x08, 0x08, 0x00, 0x08, 0x00, 0x12, 0x07,
                       0x42, 0x69, 0x74, 0x63, 0x6f, 0x69, 0x6e, 0x18,
                       0x00];

window.onload = function() {
  document.querySelector('#greeting').innerText =
    'Hello, World! It is ' + new Date();
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
      return send(63, sendDataInit);
    }).then(function() {
      return receive();
    }).then(function(report) {
      console.log("Received:", report.id, ab2str(report.data));
      return send(63, sendDataAddress);
    }).then(function() {
      return receive();
    }).then(function(report) {
      console.log("Received:", report.id, ab2str(report.data));
      return disconnect();
    }).catch(function(reason) {
      console.error(reason);
    });
};
