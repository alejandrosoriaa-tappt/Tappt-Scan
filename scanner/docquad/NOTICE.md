# DocQuad attribution

TapptScan's DocQuad preprocessing/postprocessing implementation is an independent JavaScript reimplementation informed by the Apache-2.0 licensed MakeACopy project and its DocQuadNet-256 integration.

Upstream project: `egdels/makeacopy`
Upstream commit pinned for this integration: `f4aaf8fc3a9a96422446600a139f117240d3843b`
Relevant upstream files:

- `app/src/main/java/de/schliweb/makeacopy/ml/corners/DocQuadDetector.java`
- `app/src/main/java/de/schliweb/makeacopy/ml/docquad/DocQuadLetterbox.java`
- `app/src/main/java/de/schliweb/makeacopy/ml/docquad/DocQuadPostprocessor.java`
- `app/src/main/java/de/schliweb/makeacopy/ml/docquad/DocQuadOrtRunner.java`
- `app/src/main/assets/docquad/docquadnet256_trained_opset17.ort`

MakeACopy copyright notice in the referenced DocQuad sources: Copyright 2025 Christian Kierdorf.
MakeACopy is licensed under the Apache License, Version 2.0.

The pinned DocQuad model is downloaded at runtime from the upstream repository and verified against its exact Git blob SHA-1 before use. It is not silently replaced by newer upstream bytes.

ONNX Runtime is a Microsoft project licensed under the MIT License. TapptScan currently uses `onnxruntime-web` as the Node/WASM execution adapter for the DocQuad spike and early deployment; the adapter is intentionally replaceable by `onnxruntime-node` later without changing scanner logic.

This notice supplements, and does not replace, the upstream license/notice requirements that apply to redistributed upstream material.
