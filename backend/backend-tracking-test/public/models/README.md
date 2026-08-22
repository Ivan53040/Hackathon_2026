# Pen object model

Place the generated model here as `pen-keypoints.onnx`. Mode 5 checks this exact path:

```text
public/models/pen-keypoints.onnx
```

The expected model is an Ultralytics pose ONNX export with `nms=True`, one `pen` class, and three keypoints in this order: `tip` (A), `shoulderLeft` (B), `shoulderRight` (C). B/C are the two sides of the tip/body junction; runtime geometry treats them as an unordered pair.
