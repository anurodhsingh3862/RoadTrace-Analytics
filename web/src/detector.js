// Wraps onnxruntime-web: loads the exported model, preprocesses a video
// frame, runs inference, and returns vehicle detections in frame space.
// Not unit-testable here (needs a real ONNX runtime + model file), so this
// stays a thin wrapper around the tested, pure postprocess.js logic. Verify
// this module by actually running it in a browser; that's outside what
// this environment can check.
import * as ort from "onnxruntime-web";
import { postprocess, MODEL_INPUT_SIZE } from "./postprocess.js";

export class VehicleDetector {
  constructor() {
    this.session = null;
  }

  async load(modelUrl) {
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
    });
  }

  /**
   * @param {HTMLVideoElement|HTMLCanvasElement} source - current frame to detect on.
   * @param {CanvasRenderingContext2D} scratchCtx - an offscreen 640x640 canvas context, reused across calls.
   * @param {number} frameWidth - the source's natural display width.
   * @param {number} frameHeight - the source's natural display height.
   * @param {object} options - confThreshold, iouThreshold, passed to postprocess().
   */
  async detect(source, scratchCtx, frameWidth, frameHeight, options = {}) {
    if (!this.session) throw new Error("Model not loaded; call load() first.");

    // Resize (not letterboxed, see postprocess.js) into the 640x640 scratch
    // canvas, then read back as RGB, normalize 0-1, and lay out as CHW -
    // the shape and layout the exported model expects (see
    // scripts/export_onnx.py for how that was verified).
    scratchCtx.drawImage(source, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const { data: rgba } = scratchCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

    const size = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const chw = new Float32Array(3 * size);
    for (let i = 0; i < size; i++) {
      chw[i] = rgba[i * 4] / 255; // R
      chw[size + i] = rgba[i * 4 + 1] / 255; // G
      chw[2 * size + i] = rgba[i * 4 + 2] / 255; // B
    }

    const inputName = this.session.inputNames[0];
    const tensor = new ort.Tensor("float32", chw, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    const outputs = await this.session.run({ [inputName]: tensor });
    const outputName = this.session.outputNames[0];
    const output = outputs[outputName];
    const numAnchors = output.dims[2];

    return postprocess(output.data, numAnchors, frameWidth, frameHeight, options);
  }
}
