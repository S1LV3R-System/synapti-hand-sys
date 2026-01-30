# Backend Processing Pipeline

## Overview

The backend processing pipeline handles keypoint data from Android, runs LSTM analysis, and triggers protocol-specific analysis.

## Queue Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bull Queue Configuration                      │
├─────────────────────────────────────────────────────────────────┤
│  Queue Name: analysisQueue                                       │
│  Max Concurrent: 5 jobs                                          │
│  Worker: processing.worker.ts                                    │
│                                                                  │
│  Job Data Structure:                                             │
│  {                                                               │
│    recordingId: string,                                          │
│    patientUserId: string,                                        │
│    keypointsGcsPath: string,                                     │
│    videoGcsPath?: string,                                        │
│    protocolId?: string,  // CRITICAL: Must be passed!            │
│    configuration: {                                              │
│      analysisTypes: ['tremor', 'rom', 'smoothness'],             │
│      priority: 'high'                                            │
│    }                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

## Processing Flow

### 1. Upload Phase (mobile.controller.ts)
- Receives keypoints.xlsx from Android
- Creates RecordingSession with protocolId
- Uploads to GCS: `Uploads-CSV/{sessionId}/keypoints.xlsx`
- Queues analysis job with protocolId

### 2. Worker Phase (processing.worker.ts)
- Downloads keypoints from GCS
- Converts xlsx to csv if needed
- Runs Python LSTM analysis
- Stores LSTMEventDetection records
- Stores SignalProcessingResult
- Stores ClinicalAnalysis v1.0
- **Triggers Protocol Analyzer if protocolId present**

### 3. Protocol Analysis Phase (movementAnalysisOrchestrator.ts)
- Parses protocol configuration
- Routes to movement-specific analyzers
- Updates ClinicalAnalysis to v2.0
- Generates Excel/PDF reports

## Key Files

| File | Purpose |
|------|---------|
| `src/controllers/mobile.controller.ts` | Upload endpoints |
| `src/services/queue.service.ts` | Job queue management |
| `src/workers/processing.worker.ts` | Background processing |
| `src/services/lstm-analysis.service.ts` | Python integration |
| `src/services/analyzers/movementAnalysisOrchestrator.ts` | Protocol routing |

## Critical Fixes Applied

1. **protocolId in queue job**: Added to `addAnalysisJob()` call
2. **Protocol analyzer trigger**: Called after LSTM in worker
3. **XLSX conversion**: Added xlsx library for format conversion

## GCS Output Paths

```
Result-Output/{recordingId}/
├── LSTM_Analysis_Report.xlsx
├── LSTM_Analysis_Report.pdf
├── LSTM_Plots.png
├── LSTM_*.png (separate plots)
├── Raw_data.xlsx
├── video_labeled.mp4
└── Comprehensive_Hand_Kinematic_Dashboard.png
```
