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
/*
async function sendCommand(cmd) {
    if (!writer) return;
    await writer.write(cmd + "\n");
}
*/
async function sendCommand(command) {
    if (writer && port.writable) {
        // Most PSUs require a Carriage Return (\r) or Newline (\n) to execute a command
        const terminator = "\r\n"; 
        await writer.write(command + terminator);
        
        // Optional: Echo to your terminal div so you see what was sent
        appendToTerminal("> " + command + "\n");
    } else {
        alert("Serial port not connected! Please click Connect first.");
    }
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
                val.toFixed(4) + " A";
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

// ====================== SET VOLTAGE AND CURRENT =========
/*
function applyVoltage(ch) {
    const input = document.getElementById(`ch${ch}_set_voltage`);
    let val = parseFloat(input.value);

    if (isNaN(val)) {
        alert("Enter a valid voltage");
        return;
    }

    if (val < 0 || val > 30) {
        alert("Voltage must be 0–30V");
        return;
    }

    sendCommand(`V${ch} ${val.toFixed(3)}`);
    //input.value = ""; // clear after send
}

function applyCurrent(ch) {
    const input = document.getElementById(`ch${ch}_set_current`);
    let val = parseFloat(input.value);

    if (isNaN(val)) {
        alert("Enter a valid current");
        return;
    }

    if (val < 0 || val > 3) {
        alert("Current must be 0–3A");
        return;
    }

    sendCommand(`I${ch} ${val.toFixed(3)}`);
    //input.value = "";
}
*/
// ====================== SET VOLTAGE AND CURRENT V2 =========
function applyVoltage(ch) {
    const input = document.getElementById(`ch${ch}_set_voltage`);
    let val = parseFloat(input.value);

    if (isNaN(val)) {
        alert("Enter a numeric voltage");
        return;
    }

    // Standard safety check
    if (val < 0 || val > 30) {
        alert("Voltage out of range");
        return;
    }

    // Sends command: V1 12.500
    sendCommand(`V${ch} ${val.toFixed(3)}`);
}

function applyCurrent(ch) {
    const input = document.getElementById(`ch${ch}_set_current`);
    let val = parseFloat(input.value);

    if (isNaN(val)) {
        alert("Enter a numeric current");
        return;
    }

    if (val < 0 || val > 3) {
        alert("Current out of range");
        return;
    }

    // Sends command: I1 0.500
    sendCommand(`I${ch} ${val.toFixed(4)}`);
}

// Listen for the "Enter" key globally
document.addEventListener("keydown", function (event) {
    // Check if the pressed key is "Enter"
    if (event.key === "Enter") {
        const activeEl = document.activeElement;

        // If the cursor is in a Voltage input (e.g., ch1_set_voltage)
        if (activeEl.id.includes("_set_voltage")) {
            // Extract the channel number from the ID (e.g., "1" from "ch1_set_voltage")
            const ch = activeEl.id.match(/\d+/)[0];
            applyVoltage(ch);
        } 
        
        // If the cursor is in a Current input (e.g., ch1_set_current)
        else if (activeEl.id.includes("_set_current")) {
            const ch = activeEl.id.match(/\d+/)[0];
            applyCurrent(ch);
        }
    }
});

/*
document.getElementById("ch1_set_voltage").addEventListener("keydown", e => {
    if (e.key === "Enter") applyVoltage(1);
});

document.getElementById("ch1_set_current").addEventListener("keydown", e => {
    if (e.key === "Enter") applyCurrent(1);
});
*/
