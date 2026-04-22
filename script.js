var port, textEncoder, writableStreamClosed, writer, historyIndex = -1;
const lineHistory = [];
async function connectSerial() {
    try {
        // Prompt user to select any serial port.
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: document.getElementById("baud").value });
        let settings = {};

        if (localStorage.dtrOn == "true") settings.dataTerminalReady = true;
        if (localStorage.rtsOn == "true") settings.requestToSend = true;
        if (Object.keys(settings).length > 0) await port.setSignals(settings);

        
        textEncoder = new TextEncoderStream();
        writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        writer = textEncoder.writable.getWriter();
        await listenToPort();
        startPolling();
    } catch (e){
        alert("Serial Connection Failed" + e);
    }
}
async function sendCharacterNumber() {
    document.getElementById("lineToSend").value = String.fromCharCode(document.getElementById("lineToSend").value);
}
async function sendSerialLine() {
    dataToSend = document.getElementById("lineToSend").value;
    lineHistory.unshift(dataToSend);
    historyIndex = -1; // No history entry selected
    if (document.getElementById("carriageReturn").checked == true) dataToSend = dataToSend + "\r";
    if (document.getElementById("addLine").checked == true) dataToSend = dataToSend + "\n";
    if (document.getElementById("echoOn").checked == true) appendToTerminal("> " + dataToSend);
    await writer.write(dataToSend);
    if (dataToSend.trim().startsWith('\x03')) echo(false);
    document.getElementById("lineToSend").value = "";
    document.getElementById("lineToSend").value = "";
}
async function listenToPort() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    // Listen to data coming from the serial device.
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            // Allow the serial port to be closed later.
            console.log('[readLoop] DONE', done);
            reader.releaseLock();
            break;
        }
        // value is a string.
        appendToTerminal(value);
    }
}
const serialResultsDiv = document.getElementById("serialResults");
async function appendToTerminal(newStuff) {
    serialResultsDiv.innerHTML += newStuff;
    if (serialResultsDiv.innerHTML.length > 3000) serialResultsDiv.innerHTML = serialResultsDiv.innerHTML.slice(serialResultsDiv.innerHTML.length - 3000);

    //scroll down to bottom of div
    serialResultsDiv.scrollTop = serialResultsDiv.scrollHeight;
}
function scrollHistory(direction) {
    // Clamp the value between -1 and history length
    historyIndex = Math.max(Math.min(historyIndex + direction, lineHistory.length - 1), -1);
    if (historyIndex >= 0) {
        document.getElementById("lineToSend").value = lineHistory[historyIndex];
    } else {
        document.getElementById("lineToSend").value = "";
    }
}
document.getElementById("lineToSend").addEventListener("keyup", async function (event) {
    if (event.keyCode === 13) {
        sendSerialLine();
    } else if (event.keyCode === 38) { // Key up
        scrollHistory(1);
    } else if (event.keyCode === 40) { // Key down
        scrollHistory(-1);
    }
})
document.getElementById("baud").value = (localStorage.baud == undefined ? 9600 : localStorage.baud);
document.getElementById("addLine").checked = (localStorage.addLine == "false" ? false : true);
document.getElementById("carriageReturn").checked = (localStorage.carriageReturn == "false" ? false : true);
document.getElementById("echoOn").checked = (localStorage.echoOn == "false" ? false : true);


async function sendCommand(cmd) {
    if (!writer) return;

    // Always send with newline (PSUs usually expect it)
    await writer.write(cmd + "\n");
}

function startPolling() {
    setInterval(async () => {
        if (!writer) return;

        await sendCommand("V1O?");
        await sendCommand("I1O?");
        await sendCommand("V2O?");
        await sendCommand("I2O?");
    }, 1000); // every 1 second
}

async function appendToTerminal(newStuff) {
    serialResultsDiv.innerHTML += newStuff;

    // Keep terminal trimmed
    if (serialResultsDiv.innerHTML.length > 3000) {
        serialResultsDiv.innerHTML =
            serialResultsDiv.innerHTML.slice(serialResultsDiv.innerHTML.length - 3000);
    }

    serialResultsDiv.scrollTop = serialResultsDiv.scrollHeight;

    parsePSUData(newStuff); // 👈 ADD THIS
}

let lastCommand = "";

async function sendCommand(cmd) {
    if (!writer) return;
    lastCommand = cmd;
    await writer.write(cmd + "\n");
}

function parsePSUData(data) {
    let value = data.trim();

    if (!value) return;

    if (lastCommand === "V1O?") {
        document.getElementById("ch1_voltage").textContent = value + " V";
    }
    else if (lastCommand === "I1O?") {
        document.getElementById("ch1_current").textContent = value + " A";
    }
    else if (lastCommand === "V2O?") {
        document.getElementById("ch2_voltage").textContent = value + " V";
    }
    else if (lastCommand === "I2O?") {
        document.getElementById("ch2_current").textContent = value + " A";
    }
}

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
        sendCommand(`V${ch} ${num.toFixed(3)}`);
    }
}

function toggleOutput(ch, state) {
    sendCommand(`OP${ch} ${state ? 1 : 0}`);
}