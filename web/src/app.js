// Wires the camera/file source, detector, tracker, and speed estimator
// together, and draws results on the overlay canvas. This file is UI glue,
// deliberately kept thin so the logic it calls (postprocess.js, tracker.js,
// speed.js) is the part that's unit-tested.
//
// Calibration UX: the default path is "tap two spots on the video, then pick
// how far apart they really are" rather than typing pixel coordinates — see
// the project discussion that asked for a 5th-grade-friendly flow. The old
// precise numeric form still exists behind the <details> "Advanced" toggle,
// since it's occasionally useful for exact repeatable setups (e.g. a fixed
// demo camera) and costs nothing to keep.
import { VehicleDetector } from "./detector.js";
import { IouTracker } from "./tracker.js";
import { Calibration, SpeedEstimator } from "./speed.js";
import { MODEL_INPUT_SIZE } from "./postprocess.js";

const MPH_TO_KMH = 1.609344;

const video = document.getElementById("source");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");
const fileButton = document.getElementById("file-button");
const cameraButton = document.getElementById("camera-button");
const calibrationForm = document.getElementById("calibration-form");
const calibrateButton = document.getElementById("calibrate-button");
const skipCalibrateButton = document.getElementById("skip-calibrate-button");
const calibHint = document.getElementById("calib-hint");
const distancePicker = document.getElementById("distance-picker");
const customDistanceInput = document.getElementById("custom-distance");
const customDistanceSetButton = document.getElementById("custom-distance-set");

const scratch = document.createElement("canvas");
scratch.width = MODEL_INPUT_SIZE;
scratch.height = MODEL_INPUT_SIZE;
const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });

const detector = new VehicleDetector();
const tracker = new IouTracker();
let speedEstimator = new SpeedEstimator(null);
let startTime = null;
let running = false;

function setStatus(text) {
  statusEl.textContent = text;
}

// --- Tap-to-calibrate -------------------------------------------------

let picking = false; // true while waiting for the user's two taps
let pickedPoints = []; // video-pixel [x, y] pairs collected so far

function videoPointFromClick(event) {
  const rect = overlay.getBoundingClientRect();
  const touch = event.touches ? event.touches[0] : event;
  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;
  const x = (touch.clientX - rect.left) * scaleX;
  const y = (touch.clientY - rect.top) * scaleY;
  return [x, y];
}

function startPicking() {
  if (!video.videoWidth) {
    calibHint.textContent = "Start the camera or a video first, then tap two spots on it.";
    return;
  }
  picking = true;
  pickedPoints = [];
  distancePicker.style.display = "none";
  overlay.classList.add("pickable");
  calibHint.textContent = "Tap the first spot on the video.";
}

function handleOverlayClick(event) {
  if (!picking) return;
  event.preventDefault();
  const point = videoPointFromClick(event);
  pickedPoints.push(point);
  if (pickedPoints.length === 1) {
    calibHint.textContent = "Good. Now tap the second spot.";
  } else {
    picking = false;
    overlay.classList.remove("pickable");
    calibHint.textContent = "Spots marked. Now tell us the real distance between them.";
    distancePicker.style.display = "block";
  }
}

function finishCalibration(distanceMeters) {
  try {
    const calibration = new Calibration(pickedPoints[0], pickedPoints[1], distanceMeters);
    speedEstimator = new SpeedEstimator(calibration);
    calibHint.textContent = "All set! Speeds will show up once a vehicle drives through.";
    distancePicker.style.display = "none";
  } catch (err) {
    calibHint.textContent = "Those two spots were too close together. Try tapping again, further apart.";
  }
}

calibrateButton.addEventListener("click", startPicking);

skipCalibrateButton.addEventListener("click", () => {
  picking = false;
  pickedPoints = [];
  overlay.classList.remove("pickable");
  distancePicker.style.display = "none";
  speedEstimator = new SpeedEstimator(null);
  calibHint.textContent = "Okay — you'll see boxes around vehicles, without a speed number.";
});

overlay.addEventListener("click", handleOverlayClick);

for (const chip of distancePicker.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => finishCalibration(Number(chip.dataset.meters)));
}

customDistanceSetButton.addEventListener("click", () => {
  const meters = Number(customDistanceInput.value);
  if (!(meters > 0)) {
    calibHint.textContent = "Enter a distance greater than zero.";
    return;
  }
  finishCalibration(meters);
});

// --- Advanced (precise pixel-coordinate) calibration, unchanged ------

calibrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(calibrationForm);
  const p1 = [Number(formData.get("p1x")), Number(formData.get("p1y"))];
  const p2 = [Number(formData.get("p2x")), Number(formData.get("p2y"))];
  const distance = Number(formData.get("distance"));
  try {
    const calibration = new Calibration(p1, p2, distance);
    speedEstimator = new SpeedEstimator(calibration);
    calibHint.textContent = "Calibration set from exact coordinates.";
  } catch (err) {
    calibHint.textContent = `Calibration error: ${err.message}`;
  }
});

// --- Video source: camera or uploaded file ----------------------------

fileButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.play();
  setStatus("Playing your video. Vehicles will get a box once they're spotted.");
});

cameraButton.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.src = "";
    video.srcObject = stream;
    await video.play();
    setStatus("Camera on. Vehicles will get a box once they're spotted.");
  } catch (err) {
    setStatus("Couldn't open the camera — check that you allowed camera access for this page.");
  }
});

// --- Drawing and the detect/track/speed loop ---------------------------

function drawDetections(detections) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  for (const [x, y] of pickedPoints) {
    overlayCtx.fillStyle = "#ffd27a";
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 6, 0, Math.PI * 2);
    overlayCtx.fill();
  }

  for (const det of detections) {
    overlayCtx.strokeStyle = "#00d2ff";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(det.x1, det.y1, det.x2 - det.x1, det.y2 - det.y1);
    const speedText = det.speedMph != null ? `${Math.round(det.speedMph * MPH_TO_KMH)} km/h` : "no speed yet";
    const label = `${det.className} · ${speedText}`;
    overlayCtx.font = "14px sans-serif";
    const textWidth = overlayCtx.measureText(label).width;
    overlayCtx.fillStyle = "#00142099";
    overlayCtx.fillRect(det.x1, det.y1 - 18, textWidth + 8, 18);
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.fillText(label, det.x1 + 4, det.y1 - 4);
  }
}

async function frameLoop() {
  if (!running || video.paused || video.ended) {
    requestAnimationFrame(frameLoop);
    return;
  }
  if (startTime === null) startTime = performance.now();
  const timestampS = (performance.now() - startTime) / 1000;

  const raw = await detector.detect(video, scratchCtx, video.videoWidth, video.videoHeight, {
    confThreshold: 0.3,
  });
  const tracked = tracker.update(raw);
  for (const det of tracked) {
    const roadX = (det.x1 + det.x2) / 2;
    const roadY = det.y2;
    det.speedMph = speedEstimator.update(det.trackId, roadX, roadY, timestampS);
  }
  drawDetections(tracked);
  requestAnimationFrame(frameLoop);
}

async function main() {
  setStatus("Getting the vehicle-spotting brain ready...");
  await detector.load("models/yolo11n.onnx");
  setStatus("Ready! Use your camera or upload a video to start.");
  running = true;
  requestAnimationFrame(frameLoop);
}

main().catch(() => setStatus("Something went wrong loading the model. Try reloading the page."));

// PWA: lets the page be installed (Add to Home Screen) and reused offline
// after the first successful load. Registration failing (e.g. serviceWorker
// unsupported, or the page loaded over plain http) is not fatal — the app
// still works online, it just won't be installable/offline-capable there.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Intentionally silent: offline/installable support is a bonus,
      // not a requirement for the page to function.
    });
  });
}
