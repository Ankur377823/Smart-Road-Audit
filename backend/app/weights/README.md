# YOLO Model Weights Directory

`best.pt` is the trained YOLO26n-seg segmentation model (single class: `pothole`, trained at 640 px).
Current model (9 Nov 2026): the final epoch of a 100-epoch run on the merged dataset (original pothole set
plus Indian road images from RDD2022, CC BY-SA 4.0). On 275 held-out Indian road images it scores box mAP50
0.52 (the previous model: 0.00). Through the scanner's own pipeline at its default 55% confidence it finds 53 of
the 202 potholes there at 85% precision; the previous model found none.

`archive/best_2026-09-16_original-dataset.pt` is the previous model (50 epochs, original pothole set only);
copy it back as `best.pt` to restore it.

## Browser model (used in production)

The scanner runs an ONNX export of this model in the browser:
`frontend/public/models/pothole-seg.onnx`

After retraining, re-export it (dynamic shapes are required for the scanner's rectangular letterbox):

```bash
pip install -r requirements-ml.txt onnx onnxslim
yolo export model=app/weights/best.pt format=onnx imgsz=640 opset=17 simplify=True dynamic=True
cp app/weights/best.onnx ../frontend/public/models/pothole-seg.onnx
# INT8 copy for phones without WebGPU (CPU path)
python -c "from onnxruntime.quantization import quantize_dynamic, QuantType; from onnxruntime.quantization.shape_inference import quant_pre_process; quant_pre_process('app/weights/best.onnx', 'pre.onnx', skip_symbolic_shape=True); quantize_dynamic('pre.onnx', '../frontend/public/models/pothole-seg-int8.onnx', weight_type=QuantType.QUInt8)"
```

The WebGPU path uses `pothole-seg.onnx`; the CPU (WebAssembly) path uses `pothole-seg-int8.onnx`.

Then bump `MODEL_CACHE` in `frontend/src/ml/pothole/potholeWorker.js` so browsers drop the cached copy.

## Server inference (optional)

With `requirements-ml.txt` installed, `POST /potholes/detect` loads `best.pt` with `ultralytics.YOLO`.
It is the scanner's fallback when on-device inference can't start. Without ultralytics, the endpoint
returns clearly labelled simulation results that the scanner never records.
