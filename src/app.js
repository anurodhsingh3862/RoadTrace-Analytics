// Wires the camera/file source, detector, tracker, and speed estimator
// together, and draws results on the overlay canvas. This file is UI glue,
// deliberately kept thin so the logic it calls (postprocess.js, tracker.js,
// speed.js) is the part that's unit-tested.
import { VehicleDetector } from "./detector.js";
import { IouTracker } from "./tracker.js";
import { Calibration, SpeedEstimator } from "./speed.js";
import { MODEL_INPUT_SIZE } from "./postprocess.js";

const video = document.getElementById("source");
const overlay = document.getElementById("overlay");
const overlayCtx = overlay.getContext("2d");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("file-input");
const cameraButton = document.getElementById("camera-button");
const calibrationForm = document.getElementById("calibration-form");

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

calibrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(calibrationForm);
  const p1 = [Number(formData.get("p1x")), Number(formData.get("p1y"))];
  const p2 = [Number(formData.get("p2x")), Number(formData.get("p2y"))];
  const distance = Number(formData.get("distance"));
  try {
    const calibration = new Calibration(p1, p2, distance);
    speedEstimator = new SpeedEstimator(calibration);
    setStatus("Calibration set. Speed estimates will appear once vehicles are tracked.");
  } catch (err) {
    setStatus(`Calibration error: ${err.message}`);
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  video.srcObject = null;
  video.src = URL.createObjectURL(file);
  video.play();
});

cameraButton.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.src = "";
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    setStatus(`Camera access failed: ${err.message}`);
  }
});

function drawDetections(detections) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  for (const det of detections) {
    overlayCtx.strokeStyle = "#00d2ff";
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(det.x1, det.y1, det.x2 - det.x1, det.y2 - det.y1);
    const speedText = det.speedMph != null ? `${Math.round(det.speedMph)} mph` : "speed unavailable";
    const label = `#${det.trackId} ${det.className} ${speedText}`;
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
  setStatus("Loading model...");
  await detector.load("models/yolo11n.onnx");
  setStatus("Model loaded. Choose a video file or start the camera.");
  running = true;
  requestAnimationFrame(frameLoop);
}

main().catch((err) => setStatus(`Failed to start: ${err.message}`));
