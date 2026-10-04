# RoadTrace usage guide

Install and run the included sample using the [README](../README.md). This guide covers other videos, calibration choices, and the output format. All commands run from the repository root.

## Analyze another video

Detection and tracking without calibration:

```bash
python app.py --video input/your_video.mp4
```

Speeds remain unavailable until calibration is supplied. There are two calibration options; do not combine them.

### Perspective correction

Provide four image points corresponding to the corners of an approximately rectangular, planar road patch whose real dimensions you know. Order them around the perimeter: far-left, far-right, near-right, near-left. Save a JSON file with the same fields as `sample_perspective.json`, using measurements from **your own camera view**.

```bash
python app.py \
  --video input/your_video.mp4 \
  --perspective-calibration your_calibration.json \
  --speed-window 25 \
  --output-dir output
```

`image_width` and `image_height` describe the image used to select the points. The application scales those coordinates when the video has been uniformly resized. It rejects a changed aspect ratio. Cropping, padding, camera movement, or a different view require new calibration even when the aspect ratio happens to match. Reference corners may lie outside the frame if they are supported by known road geometry.

`road_width_m` and `road_length_m` are physical dimensions **in meters**. OpenCV computes a homography mapping the four image points to `(0,0)`, `(width,0)`, `(width,length)`, and `(0,length)` in meters. Vehicle displacement is measured in that road coordinate system and converted to mph. The video is not visually warped; boxes and CSV trajectories retain their original pixel coordinates.

The yellow outline shows the modeled road area. The program does not extrapolate speeds beyond it. Homography corrects perspective under a flat-road assumption; it does not solve road slope, lens distortion, or inaccurate reference measurements.

### Simple two-point scale

For an approximately uniform local road-plane scale, specify two points and their measured distance:

```bash
python app.py \
  --video input/your_video.mp4 \
  --calibration-distance 20 \
  --point1 300 500 \
  --point2 700 500
```

**These coordinates and 20 meters are examples.** Replace them with real measurements from your video. Coordinates use the original frame's top-left as `(0,0)`. Both points must be inside the image. The scale is `known_distance_meters / pixel_distance`. Optional `--speed-region X_MIN Y_MIN X_MAX Y_MAX` limits speed calculations to a nearby rectangle. There is no interactive calibration GUI.

A single scale varies in accuracy with image depth and direction; use perspective correction for a larger road area when reliable geometry is available.

## Speed timing, units, and unavailable labels

All new video labels, CSV speeds, summaries, and histogram axes use **mph**. Calibration distances still use meters:

```text
elapsed_seconds = (current_frame - earlier_frame) / fps
estimated_speed_mph = displacement_meters / elapsed_seconds * 3600 / 1609.344
```

The representative road position is the bounding box's center-bottom: `((x1+x2)/2, y2)`. Displacement spans several frames instead of one; the most recent five estimates are median-smoothed. The general default window is eight frames. The supplied sample uses 25 frame intervals at 25 FPS, or one second, to reduce noise from perspective-amplified pixel jitter.

- **Warming up:** insufficient history inside the calibrated area.
- **Beyond calibration:** the point is outside the modeled road or optional speed rectangle.
- **Partial view:** the box touches an image edge, so its center-bottom can be misleading.
- **Unavailable:** no calibration was supplied.

Leaving the calibrated area, a clipped box, or an observation gap longer than the speed window resets speed history. Short gaps use actual frame separation. CSV speed cells are blank when unavailable; zero means a calculated stationary estimate. All confirmed observations still contribute trajectories and vehicle counts.

The sample writes to **`output-perspective-mph/`** and uses the **`estimated_speed_mph`** CSV column. The checked-in files under `demo/` are a saved run and are not overwritten.

## Options and outputs

| Argument | Default | Purpose |
| --- | --- | --- |
| `--model` | `yolo11n.pt` | Pretrained COCO detection weights |
| `--confidence` | `0.1` | Retain weak detections for ByteTrack recovery |
| `--speed-window` | `8` | Minimum frame separation for displacement |
| `--trail-length` | `30` | Trajectory points drawn per ID |
| `--fps` | Video metadata | Override only with known source FPS |
| `--output-dir` | `output` | Destination, created automatically |
| `--perspective-calibration` | None | Road calibration JSON |
| `--speed-region` | None | Optional additional speed rectangle |

Run `python app.py --help` for all arguments. `app.py` resolves paths from the current directory; `run_sample.py` locates its input/config beside the script. Missing/invalid FPS produces an error, never a guessed time base. A video with no target vehicles still creates the video, a CSV with headers, and an unavailable-state plot. An undecodable video fails clearly. Outputs are staged until processing/export succeeds, and video resources are released on errors. Use separate output folders to retain runs. MP4 output preserves frame dimensions, decoded frame count, and selected FPS; audio is not copied.

CSV columns:

```text
vehicle_id,class,frame,timestamp_s,x_px,y_px,estimated_speed_mph
```

Frames are zero-based and `timestamp_s = frame / fps`. Sort by `vehicle_id` and `frame` to reconstruct trajectories. Missing detections are not interpolated. Class labels in the CSV remain frame-level predictions.

## Traffic metrics

Unique vehicle count is the number of observed IDs. Vehicles/minute is unique IDs divided by decoded duration in minutes, including vehicles already present at the start. It is a clip-level track rate, not flow measured at a crossing line. Counts by class use one majority class per ID, with alphabetical tie-breaking.

Speed statistics first take the median valid speed within each ID, then calculate mean/median across those vehicle medians. The histogram uses the same values. This avoids weighting a vehicle more heavily merely because it stays visible longer. Tracks with no usable speed are excluded. These are descriptive track statistics, not validated space-mean or time-mean traffic speed measures.

## Pipeline and files

```text
Road Video -> YOLO Detection -> ByteTrack IDs -> Vehicle Trajectories
           -> Calibrated Road Displacement -> Estimated mph
           -> Traffic Metrics + CSV + Annotated Video + Histogram
```

- `detector.py`: loads YOLO, defines vehicle classes, and converts tracked detections.
- `tracker.py`: invokes Ultralytics ByteTrack with persistent state and keeps short trails.
- `speed_estimator.py`: two-point/perspective calibration, displacement, smoothing, and mph conversion.
- `analytics.py`: observation records, Pandas/CSV export, per-vehicle statistics, and Matplotlib plot.
- `app.py`: CLI, video I/O, pipeline, and overlays.
- `run_sample.py` and `sample_perspective.json`: reproducible sample-specific run.
- `test_pipeline.py`: deterministic geometry, speed, and video-I/O tests.

## Limitations and validation

Perspective calibration remains dependent on accurate road geometry and a nearly planar surface. Camera angle, curved/non-planar roads, slope, lens distortion, inaccurate FPS, video compression, imperfect boxes, occlusion, missing detections, class confusion, and tracking-ID switches can all affect results. Small distant objects are particularly sensitive to pixel error. An unclipped box may still be partly occluded. IDs are local to a run and are not guaranteed physical identities. Counts can overcount fragmented tracks or miss vehicles entirely.

Use stationary cameras and constant-frame-rate recordings at their original speed. An FPS override cannot repair irregular timing or a time-lapse with unknown capture intervals. The program holds observations in memory, so use short research clips. Review annotated video and CSV before drawing conclusions.

Run the deterministic checks without downloading weights:

```bash
python -m unittest -v test_pipeline.py
```

These tests include known motion under nonuniform perspective, resolution scaling, mph conversion, invalid calibration, gaps, partial views, per-vehicle aggregation, and real video-file I/O with controlled detections. They do not establish YOLO or real-world speed accuracy. Actual sample execution and its limitations are recorded in [VALIDATION.md](../VALIDATION.md).

