# YOLO Model Weights Directory

Place your trained YOLO segmentation model file here:
`best.pt`

Expected path:
`backend/app/weights/best.pt`

When `best.pt` is placed here, the system automatically loads your model with `ultralytics.YOLO` and runs real-time segmentation.
If `best.pt` is not found, the service runs in smart demo mode so you can test the camera, GPS, and audit integration without interruption.
