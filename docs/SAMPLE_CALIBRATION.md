# Sample perspective calibration and estimated mph

`python run_sample.py` uses planar perspective correction across the outlined road in both directions. Speeds are displayed and exported in **miles per hour (mph)**. Results are written to `output-perspective-mph/`.

## Calibration source

The geometry comes from Piotr Skalski's [Roboflow tutorial](https://blog.roboflow.com/estimate-speed-computer-vision/) and its [published sample coordinates](https://github.com/roboflow/supervision/blob/develop/examples/speed_estimation/ultralytics_example.py). The author reports an approximately 25-meter-wide, 250-meter-long road patch. This is published approximate geometry, not an independently surveyed calibration or a ground-truth speed reference.

The configuration lives in `sample_perspective.json`:

| Corner | Original 3840 × 2160 image | Supplied 960 × 540 video |
| --- | --- | --- |
| Far-left | (1252, 787) | (313, 196.75) |
| Far-right | (2298, 803) | (574.5, 200.75) |
| Near-right | (5039, 2159) | (1259.75, 539.75) |
| Near-left | (-550, 2159) | (-137.5, 539.75) |

The two near corners intentionally lie outside the image's horizontal limits; they describe the extension of the road's edges. They must not be clamped to the frame before computing the transform. Coordinates are scaled uniformly by one quarter for the supplied video.

![Perspective calibration road outline](perspective-reference.png)

The metric destination corners are `(0,0)`, `(25,0)`, `(25,250)`, and `(0,250)`. Physical lengths use the full 25 and 250 meters; they are not array sizes with a last index one less than the size. This differs slightly from the tutorial's pixel-grid destination convention.

## Computation

Each vehicle's center-bottom image point is projected into road coordinates using OpenCV's homography. Estimated speed uses Euclidean displacement in that meter coordinate system divided by actual elapsed frame time, converted with `3600 / 1609.344` to mph. This includes both longitudinal and lateral displacement. CSV `x_px` and `y_px` remain image coordinates.

The sample uses a 25-frame displacement window at 25 FPS and the median of the last five estimates. The modeled road outline sets the area where this geometry is applied. Very distant vehicles above the outline still have unavailable speeds. Speed is also withheld for clipped boxes and insufficient track history.

## Run

From an activated Python environment with the dependencies installed:

```bash
python run_sample.py
```

Equivalent application command:

```bash
python app.py \
  --video input/traffic.mp4 \
  --perspective-calibration sample_perspective.json \
  --speed-window 25 \
  --output-dir output-perspective-mph
```

Use `--model /path/to/yolo11n.pt` with either command if needed. Calibration dimensions stay in meters; output speeds are mph.

## Input protection and limitations

Source footage: [Roboflow vehicles.mp4](https://media.roboflow.com/supervision/video-examples/vehicles.mp4). The supplied input contains its first 200 frames, resized to 960 × 540 at the original 25 FPS.

The launcher verifies its SHA-256 before applying the sample geometry:

```text
f676d584cbf98e5d62636539941179465778b2eb7b9b094ca5021032a06343dc
```

The generic `app.py` supports calibration coordinates from a different resolution of the same uncropped view, but does not identify the camera. A different camera, crop, padding, or view needs different calibration, even if the aspect ratio matches. Do not reuse these coordinates for arbitrary footage.

The transform assumes a planar road. Road slope, approximate reference dimensions, imperfect boxes, occlusion, tracking errors, timing errors, and lens distortion remain sources of error. The software has synthetic geometry tests and a real video smoke run; physical speed accuracy has not been independently measured. See `VALIDATION.md` for results.


The saved presentation video, CSV, and histogram are in [demo/](demo/README.md). Fresh runs write to `output-perspective-mph/`.
