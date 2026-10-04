# Validation record — perspective correction and mph

Executed on 2026-10-01 with Python 3.11.3 on macOS (Apple Silicon). This record separates software checks from physical speed accuracy, which has not been independently established.

## Environment

The environment passed `python -m pip check` with no broken dependencies. Package versions are recorded below so the run can be reproduced.

| Package | Tested version |
| --- | --- |
| ultralytics | 8.3.253 |
| opencv-python | 4.14.0.94 |
| numpy | 2.4.6 |
| pandas | 2.3.3 |
| matplotlib | 3.11.2 |
| lap | 0.5.13 |
| torch | 2.14.1 |
| torchvision | 0.29.1 |

Model: pretrained `yolo11n.pt` from [Ultralytics model assets](https://github.com/ultralytics/assets/releases/tag/v8.3.0). No custom training.

Model SHA-256: `0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1`.

## Executed checks

- Python compilation of the project and application `--help`: passed.
- `python -m unittest -v test_pipeline.py`: **24 tests passed**.
- `python run_sample.py`: real YOLO11n + ByteTrack + perspective calibration run completed with video, CSV, and populated mph histogram.
- Decoded all 200 frames of the final annotated MP4 at 960 × 540 and 25 FPS.
- Checked exact CSV schema with `estimated_speed_mph` and no obsolete km/h column; no duplicate ID/frame pairs; valid finite nonnegative speeds; timestamps equal frame/25; all numeric-speed points inside the calibrated polygon.
- Visually inspected representative final video frames and the populated mph histogram. A clipped truck previously appeared to slow down artificially; the final code resets speed history for boxes touching the frame edge and withholds numeric speed until usable history resumes.
- The sample launcher's checksum protection was tested by replacing the fixture with different bytes in a temporary folder; it rejected the file before invoking the model.

The deterministic tests exercise:

- Two-point calibrated 5 m/s motion → approximately 11.184681 mph, with initial warmup.
- Nonuniform perspective: 20 m/s world motion → approximately 44.738726 mph at both near and far image depths.
- Correct physical rectangle corners, including using lengths rather than pixel-array indices.
- Automatic reference-coordinate scaling and rejection of aspect-ratio mismatch.
- Invalid/degenerate/nonfinite quadrilaterals, missing calibration fields, and invalid road dimensions.
- The sample's intentionally offscreen near corners.
- Short missed detections, long gaps, region exits/re-entry, and clipped-box history resets.
- CLI perspective calibration through video/CSV export, preservation of image-space trajectories, and mutually exclusive calibration modes.
- Empty/no-calibration outputs, per-vehicle aggregation, input/output collision protection, preservation of prior outputs on failure, and capture release after model-loading failure.

Video-I/O tests use controlled detector/tracker results on a generated clip. The separate roadway run uses the actual pretrained model and ByteTrack. Synthetic tests establish mathematical and pipeline behavior, not detector accuracy.

## Final real-video results

Source: [Roboflow Supervision assets](https://supervision.roboflow.com/develop/assets/), using the first eight seconds of `vehicles.mp4`, uniformly resized from 3840 × 2160 to 960 × 540 at 25 FPS. Calibration details and the source attribution are in [SAMPLE_CALIBRATION.md](SAMPLE_CALIBRATION.md).

| Output | Result |
| --- | --- |
| Duration / output frames | 8.0 seconds / 200 |
| Trajectory observations | 803 |
| Distinct tracked IDs | 14 |
| Numeric estimated-speed observations | 461 |
| Tracks contributing speed statistics | 6 |
| Mean of per-track median estimated speeds | 70.5 mph |
| Median of per-track median estimated speeds | 74.0 mph |
| Predicted majority classes | 9 car, 2 truck, 3 bus, 0 motorcycle |
| Clip-level unique-track rate | 105 IDs/minute |

These are model outputs, not verified vehicle counts, classifications, or speeds. Partial views, occlusion, class confusion, and short-lived IDs remain visible in the sample. The 25-frame window requires one second of usable history; some tracks are too short or outside the modeled road. A track ID persisting does not prove physical identity continuity. Six tracks from eight seconds are not a representative traffic-speed survey.

The source author's road dimensions are approximate and were not independently surveyed. The transform assumes a planar road and does not calibrate lens distortion or elevation changes. No radar or reference-trajectory comparison was performed. No speed caps or arbitrary rescaling were used to make results look plausible.


## Saved demo

The files in [demo/](demo/README.md) preserve the October 1, 2026 sample run. The annotated video is re-encoded as H.264 for common browsers and video players, keeping the original 200 frames and 25 FPS. The GIF is a smaller preview; it is not used for measurement. The CSV and histogram are copied directly from the run.

Fresh results go to `output-perspective-mph/`. The project uses existing OpenCV/NumPy functionality for perspective calibration. Windows and Linux have not been tested.
