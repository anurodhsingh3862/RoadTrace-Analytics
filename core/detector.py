from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from ultralytics import YOLO


# COCO class IDs used by pretrained Ultralytics models.
VEHICLE_CLASS_IDS = [2, 3, 5, 7]  # car, motorcycle, bus, truck


@dataclass
class TrackedDetection:
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def road_point(self) -> tuple[float, float]:
        """Bottom-center of the bounding box; a simple road-contact proxy."""
        return ((self.x1 + self.x2) / 2.0, self.y2)

    def is_clipped(self, width: int, height: int) -> bool:
        """A box touching the image edge has an unreliable road-contact proxy."""
        return self.x1 <= 1 or self.y1 <= 1 or self.x2 >= width - 1 or self.y2 >= height - 1


class VehicleDetector:
    """Load a pretrained COCO detector and convert its vehicle results."""

    def __init__(
        self,
        model_path: str = "yolo11n.pt",
        confidence: float = 0.1,
    ) -> None:
        self.model = YOLO(model_path)
        if self.model.task != "detect":
            raise ValueError("Use a pretrained COCO object-detection model.")
        expected = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
        if any(self.model.names.get(k) != v for k, v in expected.items()):
            raise ValueError("Model must use COCO vehicle class IDs and names.")
        self.confidence = confidence

    @staticmethod
    def parse_tracked_result(result) -> list[TrackedDetection]:
        """Return only finite, confirmed vehicle observations with track IDs."""
        boxes = result.boxes
        if boxes is None or boxes.id is None or len(boxes) == 0:
            return []

        xyxy = boxes.xyxy.cpu().numpy()
        ids = boxes.id.int().cpu().tolist()
        classes = boxes.cls.int().cpu().tolist()
        confidences = boxes.conf.cpu().tolist()

        detections: list[TrackedDetection] = []
        for coords, track_id, class_id, conf in zip(xyxy, ids, classes, confidences):
            x1, y1, x2, y2 = map(float, coords)
            if (class_id not in VEHICLE_CLASS_IDS
                    or not np.isfinite([x1, y1, x2, y2, conf]).all()
                    or x2 <= x1 or y2 <= y1):
                continue
            class_name = str(result.names[int(class_id)])
            detections.append(
                TrackedDetection(
                    track_id=int(track_id),
                    class_id=int(class_id),
                    class_name=class_name,
                    confidence=float(conf),
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                )
            )
        return detections
