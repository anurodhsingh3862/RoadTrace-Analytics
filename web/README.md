# web/ — on-device detection

A static, no-server web app: vehicle detection, tracking, and speed
estimation all run in the browser tab, on the viewer's own device. Nothing
is uploaded anywhere. This is the free-at-any-scale version described in
`docs/roadmap.md`, distinct from `dashboard/` (the Streamlit app), which
runs the model on whatever machine hosts it.

## Setup

```bash
cd web
npm install

# Generate the model (not committed, ~10 MB binary; see scripts/export_onnx.py)
pip install ultralytics onnx onnxslim
python ../scripts/export_onnx.py
mkdir -p models && mv yolo11n.onnx models/

# Serve it (any static server works; the camera API and module imports
# need http(s), not file://)
python -m http.server 8000
# open http://localhost:8000
```

## Tests

```bash
npm test
```

Runs `postprocess.test.js`, `tracker.test.js`, and `speed.test.js` with
Node's built-in test runner — no browser, no model file, no dependency
beyond Node itself. These cover the pure logic: YOLO output decoding, NMS,
the IoU tracker, and speed calculation.

`detector.js` and `app.js` (the onnxruntime-web wiring and DOM/camera glue)
are **not** covered by these tests — they need a real browser, a real
model file, and a camera or video, none of which exist in this environment.
Before relying on this, open `index.html` in an actual browser on an actual
phone and confirm: the model loads, the camera permission prompt appears
and works, boxes track real vehicles correctly, and speed estimates look
sane for a video you've calibrated by hand.

## What's different from `core/` and `dashboard/`

- **Tracker**: a simple greedy IoU tracker, not ByteTrack (ByteTrack's
  Python implementation doesn't run in a browser). Expect more ID switches
  in crowded or fast traffic than the Python pipeline.
- **Speed calibration**: two-point only. Perspective (four-corner road)
  calibration, which `core/` supports, isn't ported yet.
- **Preprocessing**: frames are resized (not letterboxed) to 640x640,
  which can distort detection accuracy on wide, non-square video compared
  to `core/`'s letterboxed preprocessing.
- **Confidence threshold default** (0.3) is higher than `core/`'s (0.1),
  because `core/` relies on ByteTrack's low-score recovery to clean up
  noisy low-confidence boxes; this simpler tracker doesn't have that, so a
  lower threshold would surface more false positives here.

None of this changes what counts as a vehicle: both pipelines use the same
COCO class IDs (car, motorcycle, bus, truck) and the same exported model
weights.
