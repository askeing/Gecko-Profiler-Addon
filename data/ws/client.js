/**
 * Created by Askeing on 2017/2/22.
 */

var ws;
var retryCounter = 12;

function init_ws() {
    if (typeof ws !== 'undefined' && ws.readyState <= 1) {
        /*
         * readyStat
         * 0 CONNECTING
         * 1 OPEN
         * 2 CLOSING
         * 3 CLOSED
         * */
        // Already has WebSocket object.
        return true;
    }

    ws = new WebSocket("ws://localhost:8888/addon");

    ws.onopen = function (evt) {
        on_open(evt);
    };

    ws.onclose = function (evt) {
        on_close(evt);
    };

    ws.onerror = function (evt) {
        on_error(evt);
    };

    ws.onmessage = function (evt) {
        on_message(evt);
    };
    return true;
}


function on_open(evt) {
    // Connected.
    console.log("Web Socket Connected!");
}

function on_close(evt) {
    // Disconnected.
    console.log("Web Socket Disconnected!");
}

function on_error(evt) {
    if (retryCounter < 0) {
        console.log("Web Socket Retry Stop!");
        ws.close();
        return;
    }
    console.log("Web Socket Error! retry ... " + retryCounter);
    setTimeout(function () {
        retryCounter = retryCounter - 1;
        ws.close();
        init_ws();
    }, 5000);
}

function on_message(evt) {
    // pass the message (from WebSocket server) to Add-on index.js
    self.postMessage(evt.data);
}

self.port.on("reply", function (message) {
    // reply the message to Web Socket server.
    console.log("Web Socket Reply: " + message);
    ret_object = new Object();
    ret_object.command = "reply";
    ret_object.data = message;
    ws.send(JSON.stringify(ret_object));
});

init_ws();
