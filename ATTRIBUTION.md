# Attribution

The code in `core/` is a direct port of [GauravKudeshia/RoadTrace](https://github.com/GauravKudeshia/RoadTrace),
moved into a package layout (`core/`) so this project can build a dashboard,
localization, and data-integration layers on top of it. The detection,
tracking, and speed-estimation logic itself is unchanged from the original;
only import paths were adjusted to work inside a package. All 24 of the
original project's automated tests pass unmodified against this port.

**Note on licensing:** the original RoadTrace repository does not carry a
LICENSE file, so its code is all-rights-reserved to Gaurav Kudeshia by
default. This port and everything built on top of it should stay private or
portfolio-only until Gaurav confirms a license (MIT is the natural choice,
matching the dependencies it builds on) for the original repository. Don't
treat this as resolved — it needs his explicit sign-off before any public
release.

RoadTrace's own README credits these upstream sources, which carry through
to this port:

- Detection: [Ultralytics YOLO](https://docs.ultralytics.com/modes/track/) (YOLO11n)
- Tracking: [ByteTrack](https://arxiv.org/abs/2110.06864), via Ultralytics' built-in implementation
- Sample footage: [Roboflow's traffic video](https://media.roboflow.com/supervision/video-examples/vehicles.mp4)
- Road geometry / perspective transform approach: Piotr Skalski's
  [speed estimation tutorial](https://blog.roboflow.com/estimate-speed-computer-vision/)

The sample video and demo assets (GIF, MP4, speed histogram) from the
original repo are not duplicated here, to keep this repo small. See the
original repo's `demo/` folder for those, or `docs/SAMPLE_CALIBRATION.md`
for the calibration this project inherited.
