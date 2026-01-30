# SynaptiHand Complete Data Flow

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE DATA FLOW                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ANDROID APP]                                                               │
│    Camera (60fps) → MediaPipe → 21 landmarks × 3D (60fps)                    │
│         │                            │                                       │
│         │                            ├─→ HandLandmarkOverlay (30fps display) │
│         │                            │                                       │
│         │                            └─→ ExcelKeypointRecorder (60fps)       │
│         │                                        │                           │
│         │                                        ↓                           │
│    VideoCapture                            keypoints.xlsx                    │
│    (720p @ 30fps)                              │                             │
│         │                                      │                             │
│         ↓                                      ↓                             │
│    video.mp4 ──────────────────────────→ Upload to GCS                       │
│         │                                      │                             │
│         ↓                                      │                             │
│   [Composite overlay]                          │                             │
│   video_labeled.mp4 ────────────────────→ Upload to GCS                      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  [BACKEND NODE.JS]                                                           │
│                                                                              │
│    POST /api/mobile/keypoints ──→ RecordingSession created                   │
│                                         │                                    │
│                                         ↓                                    │
│                              Bull Queue: analysisQueue.add()                 │
│                              (Max 5 concurrent processing jobs)              │
│                                         │                                    │
│                                         ↓                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  [PROCESSING WORKER]                                                         │
│                                                                              │
│    Download keypoints.xlsx from GCS                                          │
│                │                                                             │
│                ↓                                                             │
│    Python processing.service (Convert xlsx → csv if needed)                  │
│                │                                                             │
│                ↓                                                             │
│    [LSTM SERVICE]                                                            │
│    backend_integration.py                                                    │
│         │                                                                    │
│         ├─→ LSTM event detection                                             │
│         │       │                                                            │
│         │       ↓                                                            │
│         │   LSTMEventDetection records (stored in DB)                        │
│         │                                                                    │
│         ├─→ SignalProcessingResult (filtered landmarks, quality metrics)     │
│         │                                                                    │
│         └─→ ClinicalAnalysis v1.0 (tremor, ROM, smoothness, coordination)    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  [PROTOCOL ANALYZER] (Triggered if protocolId present)                       │
│                                                                              │
│    movementAnalysisOrchestrator.ts                                           │
│         │                                                                    │
│         ├─→ wristRotationAnalyzer                                            │
│         ├─→ fingerTappingAnalyzer                                            │
│         ├─→ fingersBendingAnalyzer                                           │
│         ├─→ apertureClosureAnalyzer                                          │
│         ├─→ objectHoldAnalyzer                                               │
│         └─→ freestyleAnalyzer                                                │
│                │                                                             │
│                ↓                                                             │
│    ClinicalAnalysis v2.0 update (movement-specific metrics)                  │
│                │                                                             │
│                ↓                                                             │
│    Excel/PDF reports → GCS: Result-Output/{recordingId}/                     │
│         ├─→ LSTM_Analysis_Report.xlsx                                        │
│         ├─→ LSTM_Analysis_Report.pdf                                         │
│         ├─→ LSTM_Plots.png                                                   │
│         ├─→ Raw_data.xlsx                                                    │
│         └─→ video_labeled.mp4 (if video processing enabled)                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Frame Rate Summary

| Component | FPS | Notes |
|-----------|-----|-------|
| Camera Sensor | 60 fps | CameraX with Camera2Interop |
| MediaPipe Detection | 60 fps | GPU-accelerated, direct callback |
| Keypoint Recording | 60 fps | Full rate to Excel |
| Overlay Display | 30 fps | Throttled for UI performance |
| Video Recording | 30 fps | H.264 hardware encoding |

## GCS Path Structure

```
gs://handpose-system/
├── Uploads-CSV/{sessionId}/
│   ├── keypoints.xlsx
│   └── metadata.json
├── Uploads-mp4/{sessionId}/
│   ├── video.mp4
│   └── video_labeled.mp4 (optional)
└── Result-Output/{recordingId}/
    ├── LSTM_Analysis_Report.xlsx
    ├── LSTM_Analysis_Report.pdf
    ├── LSTM_Plots.png
    ├── Raw_data.xlsx
    └── Comprehensive_Hand_Kinematic_Dashboard.png
```

## Critical Integration Points

1. **Android → Backend**: POST /api/mobile/keypoints (no auth required)
2. **Backend → GCS**: Service account credentials (never exposed to Android)
3. **Backend → Python**: backend_integration.py via child_process.exec
4. **Protocol Linking**: protocolId stored in RecordingSession, passed to analyzer

## Known Issues & Fixes Required

1. ~~CSV/XLSX format mismatch~~ - Need conversion in worker
2. ~~protocolId not passed to queue~~ - Need to add to job data
3. ~~Protocol analyzer not triggered~~ - Need to call after LSTM
