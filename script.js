// ================== GLOBALS ==================
var port, textEncoder, writer;
var historyIndex = -1;
const lineHistory = [];
const serialResultsDiv = document.getElementById("serialResults");

let buffer = ""; // for parsing incoming serial

// ================== CONNECT ==================
async function connectSerial() {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: document.getElementById("baud").value });

        let settings = {};
        if (localStorage.dtrOn == "true") settings.dataTerminalReady = true;
        if (localStorage.rtsOn == "true") settings.requestToSend = true;
        if (Object.keys(settings).length > 0) await port.setSignals(settings);

        textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();

        console.log("Connected!");

        listenToPort();     // 🔥 DO NOT await
        startPollingCH1();  // start live updates

    } catch (e) {
        alert("Serial Connection Failed: " + e);
    }
}

// ================== SEND ==================
async function sendCommand(cmd) {
    if (!writer) return;
    await writer.write(cmd + "\n");
}

async function sendSerialLine() {
    let dataToSend = document.getElementById("lineToSend").value;

    lineHistory.unshift(dataToSend);
    historyIndex = -1;

    if (document.getElementById("carriageReturn").checked) dataToSend += "\r";
    if (document.getElementById("addLine").checked) dataToSend += "\n";

    if (document.getElementById("echoOn").checked) {
        appendToTerminal("> " + dataToSend);
    }

    await writer.write(dataToSend);

    document.getElementById("lineToSend").value = "";
}

// ================== SERIAL READ ==================
async function listenToPort() {
    const textDecoder = new TextDecoderStream();
    port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            reader.releaseLock();
            break;
        }

        appendToTerminal(value);
    }
}

// ================== TERMINAL + PARSER ==================
function appendToTerminal(newStuff) {
    // Only update terminal if it exists
    if (serialResultsDiv) {
        serialResultsDiv.innerHTML += newStuff;

        if (serialResultsDiv.innerHTML.length > 3000) {
            serialResultsDiv.innerHTML =
                serialResultsDiv.innerHTML.slice(serialResultsDiv.innerHTML.length - 3000);
        }
        serialResultsDiv.scrollTop = serialResultsDiv.scrollHeight;
    }
    // ALWAYS parse data
    handleResponse(newStuff);
}

function handleResponse(data) {
    buffer += data;

    let lines = buffer.split(/\r?\n/);
    buffer = lines.pop();

    lines.forEach(line => {
        line = line.trim();

        if (line.endsWith("V")) {
            let val = parseFloat(line.replace("V", ""));

            // clamp near-zero or negative
            if (val < 0.02) val = 0;

            document.getElementById("ch1_voltage").textContent =
                val.toFixed(3) + " V";
        } 
        else if (line.endsWith("A")) {
            let val = parseFloat(line.replace("A", ""));

            // clamp near-zero or negative
            if (val < 0.01) val = 0;

            document.getElementById("ch1_current").textContent =
                val.toFixed(3) + " A";
        }
    });
}

/*
function handleResponse(data) {
    buffer += data;

    let lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // keep incomplete line

    lines.forEach(line => {
        line = line.trim();

        if (line.endsWith("V")) {
            document.getElementById("ch1_voltage").textContent = line;
        } 
        else if (line.endsWith("A")) {
            document.getElementById("ch1_current").textContent = line;
        }
    });
}
*/

// ================== POLLING ==================
function startPollingCH1() {
    setInterval(async () => {
        if (!writer) return;

        await sendCommand("V1O?");
        await new Promise(r => setTimeout(r, 100));
        await sendCommand("I1O?");
    }, 1000);
}

// ================== CONTROLS ==================
function setVoltage(ch) {
    let value = prompt(`Set voltage for CH${ch}:`);
    let num = parseFloat(value);

    if (!isNaN(num)) {
        sendCommand(`V${ch} ${num.toFixed(3)}`);
    }
}

function setCurrent(ch) {
    let value = prompt(`Set current for CH${ch}:`);
    let num = parseFloat(value);

    if (!isNaN(num)) {
        sendCommand(`I${ch} ${num.toFixed(3)}`);
    }
}

function toggleOutput(ch, state) {
    sendCommand(`OP${ch} ${state ? 1 : 0}`);

    const buttons = document.querySelectorAll(`.channel:nth-child(${ch}) .power`);
    buttons.forEach(btn => btn.style.opacity = "0.5");

    const target = document.querySelector(
        `.channel:nth-child(${ch}) .power.${state ? "on" : "off"}`
    );
    if (target) target.style.opacity = "1";
}

// ================== HISTORY ==================
function scrollHistory(direction) {
    historyIndex = Math.max(
        Math.min(historyIndex + direction, lineHistory.length - 1),
        -1
    );

    if (historyIndex >= 0) {
        document.getElementById("lineToSend").value = lineHistory[historyIndex];
    } else {
        document.getElementById("lineToSend").value = "";
    }
}

// ================== EVENTS ==================
document.getElementById("lineToSend").addEventListener("keyup", function (event) {
    if (event.keyCode === 13) {
        sendSerialLine();
    } else if (event.keyCode === 38) {
        scrollHistory(1);
    } else if (event.keyCode === 40) {
        scrollHistory(-1);
    }
});

// ================== SETTINGS LOAD ==================
document.getElementById("baud").value =
    (localStorage.baud == undefined ? 9600 : localStorage.baud);

document.getElementById("addLine").checked =
    (localStorage.addLine == "false" ? false : true);

document.getElementById("carriageReturn").checked =
    (localStorage.carriageReturn == "false" ? false : true);

document.getElementById("echoOn").checked =
    (localStorage.echoOn == "false" ? false : true);
