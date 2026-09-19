// Change these IPs to your two Raspberry Pis
const droneIPs = {
  scan: "http://100.78.63.89:5000", // Drone 1 RPi scan //arsc2//"http://100.110.74.112:5000" jetson ip -http://100.78.63.89:5000
  del:  "http://100.80.4.28:5000"  // Drone 2 RPi del //arsc1 //"http://100.80.4.28:5001" //
};
const telemetryCache = {
    scan: { lat: null, lon: null, alt: null },
    del: { lat: null, lon: null, alt: null}
};

let scanMap = L.map('scan_map').setView([18.52, 73.85], 8);
let delMap  = L.map('del_map').setView([18.52, 73.85], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(scanMap);

let waypoints = [];
let seq = 0;
let tempMarker = null;

scanMap.on("click", function(e) {

    if (tempMarker) scanMap.removeLayer(tempMarker);

    tempMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(scanMap);

    document.getElementById("wpLat").value = e.latlng.lat.toFixed(7);
    document.getElementById("wpLng").value = e.latlng.lng.toFixed(7);

    document.getElementById("wpCurrent").checked = (seq === 0);
    document.getElementById("wpBar").style.display = "flex";

    document.getElementById("saveWpBtn").onclick = function () {

        let command = parseInt(document.getElementById("wpCommand").value);
        let height = parseFloat(document.getElementById("wpHeight").value);
        let delay = parseFloat(document.getElementById("wpDelay").value);
        let auto = document.getElementById("wpAuto").checked ? 1 : 0;
        let current = document.getElementById("wpCurrent").checked ? 1 : 0;

        let lat = parseFloat(document.getElementById("wpLat").value);
        let lng = parseFloat(document.getElementById("wpLng").value);

        let wp = {
            seq: seq,
            frame: 3,
            command: command,
            current: current,
            param1: delay,
            param2: 0,
            param3: 0,
            param4: 0,
            x: lat,
            y: lng,
            z: height,
            autocontinue: auto,
        };

        waypoints.push(wp);
        seq++;

        console.log("Added waypoint:", wp);
        console.log("All:", waypoints);

        document.getElementById("wpBar").style.display = "none";
    };

});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(delMap);

delMap.on('click', function(e) {
    const m = L.marker([e.latlng.lat, e.latlng.lng]).addTo(delMap);

    // remove marker on right click
    m.on('contextmenu', function() {
        delMap.removeLayer(m);
    });

    m.bindPopup("Delivery Location:<br>" + e.latlng.lat + ", " + e.latlng.lng).openPopup();
});

let markers = { scan: null, del: null };

async function updateDronePosition(drone) {
  try {
    const t = telemetryCache[drone];
    if (!t || t.lat == null || t.lon == null) return;

    const pos = [t.lat, t.lon];
    const map = drone === 'scan' ? scanMap : delMap;

    if (!markers[drone]) {
      markers[drone] = L.marker(pos).addTo(map).bindPopup(`${drone} Drone`);
      map.setView(pos, 16);
    } else {
      markers[drone].setLatLng(pos);
    }
  } catch (err) {
    console.error(`${drone} telemetry error:`, err);
  }
   
}

 async function tryconnect(drone) {
      try {
        // call your Flask backend API
        const res = await fetch(`${droneIPs[drone]}/tryconnect`);
        const data = await res.json();
        console.log('Response from Flask:', data);
      } catch (err) {
        console.error('Connection failed:', err);
      }
    }


// --- Commands ---
// --- Drone IP Configuration ---

// --- Utility Function for Status Updates ---
function updateStatus(drone, message) {
    document.getElementById(`${drone}_status`).innerText = message;
}

// --- Load Mission File ---
async function uploadMission(drone) {
    const fileInput = document.getElementById(`${drone}_fileInput`);
    console.log(`${drone}_fileInput`)
    const file = fileInput.files[0];
    if (!file) {
        console.log("file daalo ji")
        return alert(`Please select a mission file first ${drone}_fileInput`);  
    }

    const formData = new FormData();
    formData.append("mission_file", file);

    try {
        let res = await fetch(`${droneIPs[drone]}/upload_file`, { method: "POST", body: formData });
        let data = await res.json();
        updateStatus(drone, data.message);
    } catch (err) {
        console.error(err);
        updateStatus(drone, "Mission upload failed!");
    }
}

// --- Send Throttle ---
async function sendThrottle(drone, kill = false) {
    let bodyData;

    if (kill) {
        // Full motor stop
        bodyData = { channels: [1100, 1100, 1100, 1100, 1100, 1100, 1100, 1100] };
    } else {
        const value = document.getElementById(`${drone}_throttleInput`).value;
        if (!value) return alert("Enter throttle value first!");
        bodyData = { pwm: parseInt(value) };
    }

    try {
        const res = await fetch(`${droneIPs[drone]}/set_throttle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyData)
        });
        const data = await res.json();
        updateStatus(drone, data.message);
    } catch (err) {
        console.error(err);
        updateStatus(drone, "Throttle command failed!");
    }
}

// --- Send Mode or Arm/Disarm Command ---
async function sendCommand(drone, cmd) {
    try {
        const res = await fetch(`${droneIPs[drone]}/command/${cmd}`, { method: "POST" });
        const data = await res.json();
        updateStatus(drone, data.message);
    } catch (err) {
        console.error(err);
        updateStatus(drone, "Command failed!");
    }
}

// --- Takeoff Command ---
async function sendTakeoff(drone) {
    const alt = document.getElementById(`${drone}_takeoff_height`).value || 10;

    try {
        const res = await fetch(`${droneIPs[drone]}/takeoff`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ altitude: parseFloat(alt) })
        });
        const data = await res.json();
        updateStatus(drone, data.message);
    } catch (err) {
        console.error(err);
        updateStatus(drone, "Takeoff failed!");
    }
}

// --- Start Mission ---
async function startMission(drone) {
    try {
        const res = await fetch(`${droneIPs[drone]}/start_mission`, { method: "POST" });
        const data = await res.json();
        updateStatus(drone, data.message);
    } catch (err) {
        console.error(err);
        updateStatus(drone, "Mission start failed!");
    }
}

// --- Telemetry Fetch Loop ---
async function getTelemetry(drone) {
    try {
        const res = await fetch(`${droneIPs[drone]}/telemetry`);
        const data = await res.json();
        telemetryCache[drone] = {
            lat: data.lat,
            lon: data.lon,
            alt: data.alt
        };
        const section = document.querySelector(`#${drone}_map`).parentElement;
        //section.querySelector(".speed").innerText = data.speed ;
        section.querySelector(".lat").innerText = data.lat;
        section.querySelector(".lon").innerText = data.lon;
        section.querySelector(".altitude").innerText = data.alt;
        section.querySelector(".status").innerText = data.status;
        section.querySelector(".mode").innerText = data.mode;
        section.querySelector(".groundspeed").innerText = data.groundspeed;
        section.querySelector(".lidar").innerText = data.lidar_reading;

    } catch (err) {
        console.error(`Telemetry fetch failed for ${drone}`);
    }
}

// --- Periodic Telemetry Update ---
setInterval(() => {
    updateDronePosition("scan")
    updateDronePosition("del")
    getTelemetry("scan");
    getTelemetry("del");
}, 2000);
//-------------------------------------------------------testing--------------------
function waypoint_adder()
{
    console.log("hi i was clicked");
    const newTodo = document.getElementById('new-todo').value;
    if (newTodo.trim() === '') return;
    const li = document.createElement('li');
    li.textContent = newTodo;
    document.getElementById('todo-list').appendChild(li);
    document.getElementById('new-todo').value = '';
}

function exportWP() {

    if (waypoints.length === 0) {
        alert("No waypoints to export.");
        return;
    }

    let text = "";

    text += "QGC WPL 110\n";

    for (let i = 0; i < waypoints.length; i++) {
        let wp = waypoints[i];

        text += `${wp.seq}\t${wp.current}\t${wp.frame}\t${wp.command}\t${wp.param1}\t${wp.param2}\t${wp.param3}\t${wp.param4}\t${wp.x}\t${wp.y}\t${wp.z}\t${wp.autocontinue}\n`;
    }

    // Convert text → downloadable file
    let blob = new Blob([text], { type: "text/plain" });
    let url = URL.createObjectURL(blob);

    let a = document.createElement("a");
    a.href = url;
    a.download = "mission.waypoints";
    a.click();

    URL.revokeObjectURL(url);
};
//-----------------------------------------apangire------------------------------------------------
async function generateMissionFromKML(drone) {

        const missionRes = await fetch(`${droneIPs[drone]}/gen_kml_mission`, {
            method: "POST",
        });


        //Get the mission file as a Blob
        const blob = await missionRes.blob();

        //Create a temporary download link and trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mission.waypoints";
        document.body.appendChild(a);
        a.click();

        //Cleanup
        a.remove();
        window.URL.revokeObjectURL(url);

        console.log("Mission downloaded successfully.");
}
async function lawnmower(drone) {
    const fileInput = document.getElementById(`${drone}kml_fileInput`);
    if (!fileInput.files.length) {
        alert("Select a KML file");
        return;
    }
   
    const formData = new FormData();
    formData.append("kml", fileInput.files[0]);

    fetch(`${droneIPs[drone]}/gen_lawnmower`, {
        method: "POST",
        body: formData
    })
    .then(res => {
        if (!res.ok) throw new Error("Generation failed");
        return res.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lawnmower.waypoints";
        document.body.appendChild(a);
        a.click();
        a.remove();
    })
    .catch(err => alert(err.message));
}
const GCS_BASE_URL = "http://100.84.202.49:5500";
// Simplified - no status check needed
function createFakeEvent(label = '') {
    return {
        target: {
            disabled: false,
            textContent: label
        }
    };
}

async function exportDetections(drone, event) {
    const button = event.target;
    button.disabled = true;
    button.textContent = '⏳ Exporting...';

    try {
        // 1️⃣ Ask drone for metadata
        const metaRes = await fetch(
            `${droneIPs[drone]}/export_detections/meta`
        );

        if (!metaRes.ok) {
            throw new Error("Failed to fetch export metadata");
        }

        const meta = await metaRes.json();

        if (meta.new_people === 0) {
            alert('No new detections since last export');
            button.disabled = false;
            button.textContent = '📤 Export to GCS';
            return;
        }

        // 2️⃣ Download CSV from drone
        const csvRes = await fetch(
            `${droneIPs[drone]}/export_detections/file`
        );

        if (!csvRes.ok) {
            throw new Error("Failed to download CSV");
        }

        const csvBlob = await csvRes.blob();

        // 3️⃣ Upload CSV to GCS
        const formData = new FormData();
        formData.append('file', csvBlob, 'detections.csv');

        const gcsRes = await fetch(`${GCS_BASE_URL}/upload_csv`, {
            method: 'POST',
            body: formData
        });

        if (!gcsRes.ok) {
            throw new Error("Failed to upload to GCS");
        }

        const gcsData = await gcsRes.json();

        alert(`Exported ${gcsData.new_people} new people to GCS`);
        button.textContent = '✅ Sent!';

        setTimeout(() => {
            button.disabled = false;
            button.textContent = '📤 Export to GCS';
        }, 2000);

    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
        button.disabled = false;
        button.textContent = '📤 Export to GCS';
    }
}

async function uploadAndStartMissionFromBlob(drone, blob, filename = "optimized_mission.waypoints") {
    const formData = new FormData();
    formData.append(
        "mission_file",
        new File([blob], filename, { type: "text/plain" })
    );

    // 1️⃣ Upload mission
    const uploadRes = await fetch(`${droneIPs[drone]}/upload_file`, {
        method: "POST",
        body: formData
    });

    if (!uploadRes.ok) {
        throw new Error("Mission upload failed");
    }

    const uploadData = await uploadRes.json();
    updateStatus(drone, uploadData.message);

    // 2️⃣ Start mission
    const startRes = await fetch(`${droneIPs[drone]}/start_mission`, {
        method: "POST"
    });

    if (!startRes.ok) {
        throw new Error("Mission start failed");
    }

    const startData = await startRes.json();
    updateStatus(drone, startData.message);
}

async function generateOptimizedMission(event) {
    const button = event.target;
    button.disabled = true;
    button.textContent = '⏳ Optimizing...';

    try {
        const home = telemetryCache.del;

        if (!home.lat || !home.lon) {
            throw new Error("Drone 2 telemetry not available yet");
        }

        const altitude = home.alt ?? 14;   // fallback
        const holdTime = 5;                // seconds (fixed or configurable)

        const response = await fetch(`${GCS_BASE_URL}/optimize_mission`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                home_lat: home.lat,
                home_lon: home.lon,
                altitude: altitude,
                hold_time: holdTime
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Optimization failed");
        }

        // Optional download (debugging / manual upload)
        const blob = await response.blob();
        const filename = `optimized_mission_${Date.now()}.waypoints`;

        // 📥 DOWNLOAD
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 🚀 UPLOAD + START
        await uploadAndStartMissionFromBlob("del", blob, filename);

        button.textContent = '🚀 Mission Started';

    } catch (error) {
        console.error(error);
        alert(error.message);
        button.textContent = '❌ Failed';

    } finally {
        setTimeout(() => {
            button.disabled = false;
            button.textContent = '🎯 Generate Mission';
        }, 2000);
    }
}
async function autoExportAndOptimize() {
    try {
        // Fake events (no real button)
        const exportEvent = createFakeEvent('📤 Auto Export');
        const optimizeEvent = createFakeEvent('🎯 Auto Optimize');

        // 1️⃣ Export detections
        await exportDetections("scan", exportEvent);

        // 2️⃣ Generate optimized mission
        await generateOptimizedMission(optimizeEvent);

    } catch (err) {
        console.error("Auto pipeline failed:", err);
    }
}
const AUTO_PIPELINE_INTERVAL_MS = 6 * 60 * 1000;

const AUTO_PIPELINE_INTERVAL_MS2 = 8 * 60 * 1000;

setInterval(() => {
    autoExportAndOptimize();
}, AUTO_PIPELINE_INTERVAL_MS);

setInterval(() => {
    autoExportAndOptimize();
}, AUTO_PIPELINE_INTERVAL_MS2);

async function sendCommand(drone, action) {
    const channel = document.getElementById("channel").value;

    fetch(`${droneIPs[drone]}/control`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            channel: channel,
            action: action
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            document.getElementById("krishiv").innerText = data.error;
        } else {
            document.getElementById("krishiv").innerText =
                `Channel ${data.channel} set to ${data.duty_cycle}`;
        }
    });
}




const SERVER_URL = "http://100.78.63.89:8080";
const SERVER_IP = "100.78.63.89";

async function testConnection() {
    console.log("[Test] Checking server...");
    try {
        const res = await fetch(`${SERVER_URL}/health`);
        const data = await res.json();
        console.log("[Test] Server status:", data);
        if (data.tailscale_ip) {
            console.log(`✓ Server has Tailscale IP: ${data.tailscale_ip}`);
        }
        return true;
    } catch (err) {
        console.error("[Test] Cannot reach server:", err);
        return false;
    }
}

// Use STUN + TURN to ensure connectivity
const pc = new RTCPeerConnection({
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ],
    iceTransportPolicy: 'all'
});

const candidateStats = {
    host: 0,
    srflx: 0,
    relay: 0,
    total: 0
};

pc.onicecandidate = (e) => {
    if (e.candidate) {
        candidateStats.total++;
        const cand = e.candidate.candidate;
        console.log(`[ICE] Candidate #${candidateStats.total}:`, cand);
       
        if (cand.includes("typ host")) {
            candidateStats.host++;
            if (cand.includes("100.")) {
                console.log("  ✓✓ TAILSCALE HOST CANDIDATE!");
            }
        } else if (cand.includes("typ srflx")) {
            candidateStats.srflx++;
        } else if (cand.includes("typ relay")) {
            candidateStats.relay++;
            console.log("  → RELAY candidate (will use TURN server)");
        }
    } else {
        console.log(`[ICE] Gathering complete. Stats:`, candidateStats);
        if (candidateStats.host === 0) {
            console.warn("⚠ No host candidates! This might fail.");
        }
        if (candidateStats.relay > 0) {
            console.log("✓ Have relay candidates - connection will work via TURN");
        }
    }
};

pc.ontrack = (e) => {
    console.log("✓✓✓ [Video] Track received!");
    const video = document.getElementById("v");
    if (video) {
        video.srcObject = e.streams[0];
        video.onloadedmetadata = () => {
            console.log(`✓ Video: ${video.videoWidth}x${video.videoHeight}`);
        };
        video.play().catch(err => console.error("[Video] Play failed:", err));
    } else {
        console.error("[Video] Video element not found!");
    }
};

pc.oniceconnectionstatechange = () => {
    console.log(`[ICE] Connection state: ${pc.iceConnectionState}`);
   
    if (pc.iceConnectionState === "checking") {
        console.log("[ICE] Testing connection paths...");
    } else if (pc.iceConnectionState === "connected") {
        console.log("✓✓✓ ICE CONNECTED!");
       
        // Log which candidate pair was used
        pc.getStats().then(stats => {
            stats.forEach(stat => {
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                    console.log("✓ Active candidate pair:", stat);
                }
            });
        });
    } else if (pc.iceConnectionState === "completed") {
        console.log("✓✓✓ ICE COMPLETED!");
    } else if (pc.iceConnectionState === "failed") {
        console.error("✗✗✗ ICE FAILED");
        diagnoseFailure();
    }
};

pc.onconnectionstatechange = () => {
    console.log(`[Peer] Connection state: ${pc.connectionState}`);
   
    if (pc.connectionState === "connected") {
        console.log("✓✓✓ PEER CONNECTED! Video should be streaming now.");
    } else if (pc.connectionState === "failed") {
        console.error("✗✗✗ PEER FAILED");
    }
};

pc.onicegatheringstatechange = () => {
    console.log(`[ICE] Gathering state: ${pc.iceGatheringState}`);
};

function diagnoseFailure() {
    console.log("\n========== FAILURE DIAGNOSIS ==========");
    console.log("1. Candidates gathered:", candidateStats);
    console.log("\n2. Possible issues:");
   
    if (candidateStats.relay === 0) {
        console.log("   ✗ No TURN relay candidates - TURN server might be down");
    }
   
    if (candidateStats.host === 0) {
        console.log("   ✗ No local host candidates - network issue");
    }
   
    console.log("\n3. Next steps:");
    console.log("   → Open chrome://webrtc-internals");
    console.log("   → Check 'Stats graphs' for active candidate pair");
    console.log("   → Try: sudo ufw allow 49152:65535/udp (on Jetson)");
    console.log("   → Check Jetson server logs for errors");
    console.log("========================================\n");
}

async function start() {
    const serverOk = await testConnection();
    if (!serverOk) {
        console.error("[Start] Server unreachable!");
        return;
    }

    try {
        console.log("\n========== STARTING WEBRTC ==========");
        console.log("[Start] Creating offer");
       
        const offer = await pc.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false
        });
       
        await pc.setLocalDescription(offer);
        console.log("[Start] Local description set");
        console.log("[Start] Waiting for ICE gathering...");
       
        // Wait for ICE gathering with timeout
        await new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                console.log("[Start] ICE gathering already complete");
                resolve();
            } else {
                let timeout;
                const check = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        pc.removeEventListener('icegatheringstatechange', check);
                        console.log("[Start] ICE gathering finished");
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', check);
               
                timeout = setTimeout(() => {
                    pc.removeEventListener('icegatheringstatechange', check);
                    console.log("[Start] ICE gathering timeout (proceeding anyway)");
                    resolve();
                }, 5000);
            }
        });
       
        console.log(`[Start] Sending offer to server (${pc.localDescription.sdp.length} bytes)`);
       
        const res = await fetch(`${SERVER_URL}/offer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sdp: pc.localDescription.sdp,
                type: pc.localDescription.type
            })
        });

        console.log("[Start] Server responded with status:", res.status);

        if (!res.ok) {
            const errorText = await res.text();
            console.error("[Start] Server error:", errorText);
            throw new Error(`Server returned ${res.status}`);
        }

        const answer = await res.json();
        console.log("[Start] Received answer from server");
       
        // Check answer SDP for candidates
        const hasTailscale = answer.sdp.includes("100.");
        const hasRelay = answer.sdp.includes("typ relay");
        console.log("[Start] Answer has Tailscale IP:", hasTailscale);
        console.log("[Start] Answer has relay candidates:", hasRelay);
       
        await pc.setRemoteDescription(new RTCSessionDescription({
            sdp: answer.sdp,
            type: answer.type
        }));
       
        console.log("[Start] Remote description set");
        console.log("[Start] ICE connectivity check starting...");
        console.log("[Start] This may take 10-30 seconds...");
        console.log("========================================\n");
       
    } catch (err) {
        console.error("[Start] Setup failed:", err);
        console.error("Stack:", err.stack);
    }
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
    if (e.key === 'r' && e.ctrlKey) {
        console.log("\n[Manual] Reloading...\n");
        location.reload();
    }
});

window.startWebRTC = start;

console.log("=== WebRTC with STUN/TURN ===");
console.log("Press Ctrl+R to retry");
console.log("Starting in 2 seconds...\n");
setTimeout(start, 2000);
