# HandPose Processing Service

Python FastAPI microservice for video processing and hand pose analysis.

## Overview

This service wraps the MediaPipe hand tracking pipeline and provides a REST API for:
- Video processing with hand landmark detection
- Clinical analysis (tremor, ROM, coordination)
- Background job processing with progress tracking
- Output generation (labeled videos, Excel data, dashboards)

## API Endpoints

### Health Check
```
GET /health
```

### Start Processing
```
POST /process
Body: {
  "videoPath": "/path/to/video.mp4",
  "outputDir": "/path/to/output",
  "configuration": {
    "handDetection": {
      "confidence": 0.5,
      "maxHands": 2
    },
    "filters": ["butterworth", "kalman", "savitzky_golay"],
    "analysisTypes": ["tremor", "rom", "coordination", "smoothness"],
    "outputFormats": ["video", "excel", "dashboards"]
  }
}

Response: {
  "jobId": "uuid",
  "status": "queued",
  "message": "Processing job queued successfully"
}
```

### Check Status
```
GET /status/{jobId}

Response: {
  "jobId": "uuid",
  "status": "processing",
  "progress": 45,
  "message": null,
  "error": null
}
```

### Get Results
```
GET /results/{jobId}

Response: {
  "jobId": "uuid",
  "recordingId": "uuid",
  "outputs": {
    "videoLabeledPath": "/path/to/output/video_labeled.mp4",
    "rawDataPath": "/path/to/output/Raw_data.xlsx",
    "dashboardPath": "/path/to/output/dashboard.png",
    "apertureDashboardPath": "/path/to/output/aperture.png"
  },
  "landmarks": [...],
  "analysis": {
    "tremor": {...},
    "rom": {...},
    "coordination": {...},
    "smoothness": {...},
    "quality": {...}
  },
  "metrics": {
    "processingTime": 45000,
    "frameCount": 900,
    "fps": 30,
    "duration": 30
  }
}
```

### Cancel Job
```
POST /cancel/{jobId}
```

### Statistics
```
GET /stats
```

## Local Development

### Install Dependencies
```bash
cd processing-service
pip install -r requirements.txt
```

### Run Service
```bash
python main.py
# or
uvicorn main:app --reload --port 8000
```

### Test Endpoint
```bash
curl http://localhost:8000/health
```

## Docker Deployment

### Build Image
```bash
docker build -t handpose-processing .
```

### Run Container
```bash
docker run -p 8000:8000 \
  -v /tmp/handpose-processing:/tmp/handpose-processing \
  handpose-processing
```

## Configuration

Environment variables:
- `PORT`: Service port (default: 8000)
- `PYTHONUNBUFFERED`: Enable unbuffered output (default: 1)

## Integration with Node.js Backend

The Node.js backend communicates with this service via HTTP:

1. Node receives video upload
2. Node uploads video to GCS
3. Node calls `/process` with video path
4. Service processes video in background
5. Node polls `/status/{jobId}` for completion
6. Node calls `/results/{jobId}` to get analysis data
7. Node stores results in database

## Processing Pipeline

1. **Video Input**: Load video from path
2. **Hand Detection**: MediaPipe hand tracking
3. **Landmark Extraction**: 21 hand landmarks per frame
4. **Signal Processing**: Apply filters (Butterworth, Kalman, etc.)
5. **Clinical Analysis**: Compute tremor, ROM, coordination metrics
6. **Output Generation**: Create labeled video, Excel, dashboards
7. **Results Storage**: Return structured JSON with all data

## Error Handling

- Invalid video path: 400 Bad Request
- Processing failure: Job status = "failed" with error message
- Timeout: Configurable in Node.js service
- Retries: Handled by Bull Queue in Node.js

## Performance

- Processing time: ~1-2x video duration
- Memory usage: ~500MB per job
- Concurrent jobs: Limited by CPU cores
- Output size: ~10-50MB per recording

## Troubleshooting

### Service not starting
- Check Python version (3.11+)
- Verify all dependencies installed
- Check port 8000 is available

### Processing failures
- Verify video file exists and is readable
- Check output directory permissions
- Review error logs in job status

### Slow processing
- Reduce video resolution
- Adjust confidence threshold
- Limit number of filters

## Future Enhancements

- [ ] GPU acceleration for faster processing
- [ ] Redis-based job queue for persistence
- [ ] Streaming progress updates via WebSockets
- [ ] Multi-threaded parallel processing
- [ ] Configurable output formats
- [ ] Advanced tremor analysis algorithms
