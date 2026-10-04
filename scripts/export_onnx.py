"""Export yolo11n.pt to ONNX for the in-browser detector (web/).

Not committed to the repo (it's a ~10 MB binary, regenerable from this
script), same reasoning as the sample video in core/. Run once:

    pip install ultralytics onnx onnxslim
    python scripts/export_onnx.py

Produces yolo11n.onnx in the current directory. Copy it to web/models/
(see web/README.md) to use it with the browser detector.

Verified output: input "images" [1, 3, 640, 640] float32, 0-1 normalized,
RGB, CHW. Output "output0" [1, 84, 8400]: 4 box channels (cx, cy, w, h in
640-space pixels) + 80 COCO class scores (already sigmoid-applied), across
8400 anchor points. web/src/postprocess.js decodes this exact shape; if a
future export changes it (different imgsz, a different YOLO version), that
module needs updating too.
"""
from __future__ import annotations

from ultralytics import YOLO


def main() -> None:
    model = YOLO("yolo11n.pt")
    if model.task != "detect":
        raise ValueError("Use a pretrained COCO object-detection model.")
    path = model.export(format="onnx", imgsz=640, simplify=True)
    print(f"Exported to: {path}")


if __name__ == "__main__":
    main()
