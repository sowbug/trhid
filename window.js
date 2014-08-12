var connectionId;

function logIfError() {
  if (chrome.runtime.lastError)
    console.error("ERROR:", chrome.runtime.lastError.message);
  else
    console.log("NO ERROR");
}

function connect(deviceId) {
  return new Promise(function(resolve, reject) {
    chrome.hid.connect(deviceId, function(connection) {
      connectionId = connection.connectionId;
      console.log("Have connection ID", connectionId);
      logIfError();
      resolve();
    });
  });
}

function padArrayBuffer(arrayBuffer, size) {
  var newBuf = new Uint8Array(size);
  for (i = 0; i < arrayBuffer.length; ++i) {
    newBuf[i] = arrayBuffer[i];
  }
  return newBuf;
}

function sendFeatureReport(reportId, value) {
  return new Promise(function(resolve, reject) {
    var data = new Uint8Array([value]);
    data = padArrayBuffer(data, 1);
    console.log("sending feature report", reportId, value, data, data.length);
    chrome.hid.sendFeatureReport(connectionId, reportId,
      data.buffer, function() {
        console.log("sent feature report", reportId);
        logIfError();
        resolve();
      });
  });
}

function receiveFeatureReport(reportId) {
  return new Promise(function(resolve, reject) {
    console.log("and now going to receive FR", connectionId, reportId);
    chrome.hid.receiveFeatureReport(connectionId, reportId, function(data) {
      console.log("received featureReport", data);
      logIfError();
      resolve();
    });
  });
}


function send(reportId, dataArray) {
  return new Promise(function(resolve, reject) {
    var data = new Uint8Array(dataArray);
    data = padArrayBuffer(data, reportId);  // same as 63?
    console.log("sending data", reportId, data, data.length);
    chrome.hid.send(connectionId, reportId,
      data.buffer, function() {
        console.log("sent data", reportId);
        logIfError();
        resolve();
      });
  });
}

function receive() {
  return new Promise(function(resolve, reject) {
    console.log("and now going to receive", connectionId);
    chrome.hid.receive(connectionId, function(reportId, data) {
      console.log("received:", reportId, data);
      logIfError();
      resolve();
    });
  });
}

function disconnect() {
  return new Promise(function(resolve, reject) {
    chrome.hid.disconnect(connectionId, function() {
      console.log("closed");
      logIfError();
      resolve();
    });
  });
}

function delay(seconds) {
  return new Promise(function(resolve, reject) {
    window.setTimeout(resolve, seconds * 1000);
  });
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
  chrome.hid.getDevices(
    {vendorId: 0x534c, productId: 0x0001},
    function(devices) {
      console.log(devices);
      var deviceId = devices[0].deviceId;
      console.log("connecting to device ID", deviceId);
      connect(deviceId)
        .then(function(response) {
          return sendFeatureReport(0x41, 0x01);
        }).then(function(response) {
          return receiveFeatureReport(0x41);
        }).then(function(response) {
          return sendFeatureReport(0x43, 0x03);
        }).then(function(response) {
          return receiveFeatureReport(0x41);
        }).then(function(response) {
          return send(63, sendDataInit);
        }).then(function(response) {
          return delay(1);
        }).then(function(response) {
          return receive();
        }).then(function(response) {
          return send(63, sendDataAddress);
        }).then(function(response) {
          return delay(5);
        }).then(function(response) {
          return receive();
        }).then(function(response) {
          return disconnect();
        });
    });
};
