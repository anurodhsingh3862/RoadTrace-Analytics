"""Run the supplied roadway sample with perspective correction and estimated mph."""
from __future__ import annotations

import argparse
from hashlib import sha256
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parent
SAMPLE_SHA256 = "f676d584cbf98e5d62636539941179465778b2eb7b9b094ca5021032a06343dc"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    local_weights = ROOT.parent.parent / "work" / "yolo11n.pt"
    parser.add_argument("--model", default=str(local_weights) if local_weights.is_file() else "yolo11n.pt")
    parser.add_argument("--output-dir", default=str(ROOT / "output-perspective-mph"))
    args = parser.parse_args()
    video = ROOT / "input" / "traffic.mp4"
    if not video.is_file() or sha256(video.read_bytes()).hexdigest() != SAMPLE_SHA256:
        parser.error("The supplied 960 x 540 sample is missing or has changed. "
                     "Use app.py with your own measured calibration for another video.")
    print("Sample calibration: perspective correction using the source author's approximate road geometry.", flush=True)
    print("Estimated speeds in miles per hour (mph), across both directions inside the road outline.", flush=True)
    print("Calibration details: " + str(ROOT.parent / "docs" / "SAMPLE_CALIBRATION.md"), flush=True)
    return subprocess.call([
        sys.executable, str(ROOT / "app.py"),
        "--video", str(video), "--model", args.model, "--output-dir", args.output_dir,
        "--perspective-calibration", str(ROOT / "sample_perspective.json"),
        "--speed-window", "25",
    ])


if __name__ == "__main__":
    raise SystemExit(main())
