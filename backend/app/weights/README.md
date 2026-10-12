# YOLO Model Weights Directory

`best.pt` is the trained YOLOv8 segmentation model (single class: `pothole`).

## Browser model (used in production)

The scanner runs an ONNX export of this model in the browser:
`frontend/public/models/pothole-seg.onnx`

After retraining, re-export it (dynamic shapes are required for the scanner's rectangular letterbox):

```bash
pip install -r requirements-ml.txt onnx onnxslim
yolo export model=app/weights/best.pt format=onnx imgsz=480 opset=17 simplify=True dynamic=True
cp app/weights/best.onnx ../frontend/public/models/pothole-seg.onnx
```

Then bump `MODEL_CACHE` in `frontend/src/ml/pothole/potholeWorker.js` so browsers drop the cached copy.

## Server inference (optional)

With `requirements-ml.txt` installed, `POST /potholes/detect` loads `best.pt` with `ultralytics.YOLO`.
It is the scanner's fallback when on-device inference can't start. Without ultralytics, the endpoint
returns clearly labelled simulation results that the scanner never records.
