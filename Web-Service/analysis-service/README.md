# Hand Motion Analysis Service

Comprehensive data analysis backend for hand motion analysis using LSTM event detection, advanced signal processing, and protocol-driven analysis.

## Architecture

```
Input (Normalized XLSX) → Data Pipeline → Event Detection → Protocol Analysis → Report Generation
                              ↓               ↓                    ↓                  ↓
                          Filtering      LSTM Model         11 Analysis         XLSX/PNG/PDF
                          Normalization  Event Types         Outputs
```

## Features

### Data Processing Pipeline
- **Normalization**: Wrist-centered, scale-normalized landmark data
- **Adaptive Filtering**: 15+ filter types (Butterworth, Kalman, Wavelet, etc.)
- **Robust Statistics**: MAD, IQR, outlier detection and handling

### Event Detection (LSTM-based)
- **4-Head LSTM Architecture**: Detects 18+ event types
  - **WRIST**: Rotation-In, Rotation-Out
  - **FINGER**: Tap/Lift for each finger (10 events)
  - **POSTURE**: Pronation, Supination, Neutral
  - **STATE**: Aperture, Closure

### Advanced Thresholding (20+ Techniques)
- MAD (Median Absolute Deviation)
- IQR (Interquartile Range)
- Z-score, Quantile-based
- Otsu's method, Triangle method
- CUSUM (Cumulative Sum)
- Hysteresis thresholding
- Peak detection (adaptive, CWT, prominence-based)

### Protocol-Driven Analysis (11 Outputs)
1. **Hand Aperture**: Maximum distance (thumb-index/thumb-middle)
2. **3D Cyclogram**: Velocity-position phase plot
3. **3D Trajectory**: Fingertip path visualization
4. **ROM Plot**: Violin/Radar plots with finger selection
5. **Tremor Spectrogram**: Wavelet-based frequency analysis
6. **Opening-Closing Velocity**: Vertical bar + MAD error bars
7. **Cycle Frequency**: Movement frequency analysis
8. **Cycle Variability**: Significance X/Y scatter
9. **Inter-finger Coordination**: Sine wave, cross-correlation
10. **Cycle Symmetry**: Left vs right hand comparison
11. **Geometric Curvature**: Radar plot, trajectory curvature

### Report Generation
- **Analysis_report.xlsx**: 3 sheets (Summary, Events, Metrics)
- **Plots.png**: Combined visualization of all enabled outputs
- **Report.pdf**: Professional clinical report with tables and plots
- **events.json**: Structured event data
- **metrics.json**: Analysis metrics summary

## Installation

### Using Python Virtual Environment

```bash
cd /home/shivam/Desktop/HandPose/Web-Service/analysis-service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Using Docker

```bash
cd /home/shivam/Desktop/HandPose/Web-Service/analysis-service

# Build image
docker build -t analysis-service .

# Run analysis
docker run -v $(pwd)/outputs:/app/outputs \
  -v /path/to/data:/app/data \
  analysis-service \
  python main.py --input /app/data/input.xlsx --output /app/outputs
```

## Usage

### Command Line Interface

```bash
# Basic usage with default protocol
python main.py --input data.xlsx --output ./results

# With custom protocol configuration
python main.py --input data.xlsx --output ./results --protocol protocol.json

# With recording metadata
python main.py --input data.xlsx --output ./results --metadata metadata.json

# Specify FPS
python main.py --input data.xlsx --output ./results --fps 60

# Disable adaptive techniques
python main.py --input data.xlsx --output ./results --no-adaptive
```

### Protocol Configuration Format

```json
{
  "name": "Tremor Assessment Protocol",
  "analysisOutputs": {
    "handAperture": {
      "enabled": true,
      "parameters": {
        "fingerPair": "thumb_index",
        "hand": "right"
      }
    },
    "cyclogram3D": {
      "enabled": true,
      "parameters": {
        "fingertip": "index_tip",
        "hand": "right"
      }
    },
    "trajectory3D": {
      "enabled": true,
      "parameters": {
        "fingertip": "index_tip",
        "hand": "right"
      }
    },
    "romPlot": {
      "enabled": true,
      "parameters": {
        "plotType": "violin",
        "measurement": "flexion",
        "fingers": {
          "thumb": false,
          "index": true,
          "middle": false,
          "ring": false,
          "pinky": false
        },
        "hand": "right"
      }
    },
    "tremorSpectrogram": {
      "enabled": true,
      "parameters": {
        "hand": "both"
      }
    },
    "openingClosingVelocity": {
      "enabled": true,
      "parameters": {
        "hand": "right"
      }
    },
    "cycleFrequency": {
      "enabled": true,
      "parameters": {
        "hand": "right"
      }
    },
    "cycleVariability": {
      "enabled": true,
      "parameters": {
        "hand": "right"
      }
    },
    "interFingerCoordination": {
      "enabled": true,
      "parameters": {
        "finger1": "thumb",
        "finger2": "index",
        "hand": "right"
      }
    },
    "cycleSymmetry": {
      "enabled": false
    },
    "geometricCurvature": {
      "enabled": true,
      "parameters": {
        "hand": "right"
      }
    }
  }
}
```

### Recording Metadata Format

```json
{
  "id": "rec_123456",
  "patientId": "patient_789",
  "recordedAt": "2026-01-16T10:30:00Z",
  "diagnosis": "Parkinson's Disease",
  "handedness": "right"
}
```

## Module Overview

### `config.py`
Configuration constants, paths, and data structures.

### `normalizer.py`
- `DataNormalizer`: Basic normalization (wrist-centering, scale normalization)
- `AdaptiveNormalizer`: Advanced with outlier handling, robust statistics

### `filters.py`
15+ signal filtering implementations:
- Frequency domain: Butterworth, Chebyshev, Bessel, Elliptic, Notch, Bandpass
- Time domain: Moving Average, Exponential Smoothing, Median, Savitzky-Golay, Gaussian
- Adaptive: Kalman, LMS, RLS
- Wavelet: Wavelet Denoise, Wavelet Packet
- Morphological: Opening, Closing, Tophat, Blackhat

### `thresholds.py`
20+ adaptive thresholding techniques:
- Statistical: MAD, IQR, Z-score, Quantile
- Image processing: Otsu, Triangle, Moment-preserving
- Signal processing: CUSUM, Hysteresis
- Peak detection: Adaptive, CWT, Prominence-based
- Event boundary: Onset/offset, zero crossings, slope changes

### `event_detector.py`
- `EventDetector`: LSTM-based event detection
- `AdaptiveEventDetector`: Self-calibrating event detection

### `protocol_analyzer.py`
Protocol-driven analysis executor coordinating all 11 analysis outputs.

### `report_generator.py`
Generates Excel, PNG plots, and PDF reports.

### `main.py`
Main orchestrator with CLI interface.

## Data Flow

```
1. Input: Training-Data-Normalized.xlsx
   ↓ (66 features: 63 landmarks + 3 metadata)

2. DataNormalizer
   ↓ (wrist-centered, scale-normalized)

3. FilterChain
   ↓ (Median → Butterworth → Kalman)

4. EventDetector (LSTM)
   ↓ (30-frame sequences → 4-head predictions)

5. ProtocolAnalyzer
   ↓ (11 analysis outputs based on protocol)

6. ReportGenerator
   ↓
   Output: Analysis_report.xlsx, Plots.png, Report.pdf
```

## LSTM Model

### Architecture
```
Input (30 frames × 66 features)
  ↓
LSTM Layer 1 (64 units, return_sequences=True)
  ↓
Dropout (0.3)
  ↓
LSTM Layer 2 (64 units)
  ↓
Dropout (0.3)
  ↓
┌────────────┬────────────┬────────────┬────────────┐
↓            ↓            ↓            ↓            ↓
Wrist Head   Finger Head  Posture Head  State Head
(3 classes)  (11 classes) (4 classes)   (3 classes)
```

### Model Files
- `multihead_lstm_final.h5`: Trained model weights
- `label_encoders.pkl`: Label encoders for 4 heads
- `training_config.pkl`: Training configuration

## Performance Considerations

### Memory Usage
- LSTM model: ~4MB
- Per-frame processing: ~100KB
- Typical recording (1000 frames): ~100MB peak memory

### Processing Speed
- Normalization: ~1000 frames/sec
- Event detection: ~500 frames/sec (CPU), ~2000 frames/sec (GPU)
- Analysis outputs: ~200 frames/sec
- Report generation: ~5 seconds for all outputs

### Optimization Tips
1. Use GPU for LSTM inference (4x faster)
2. Enable adaptive mode only when needed
3. Disable unused analysis outputs in protocol
4. Use lower FPS for real-time processing

## Testing

```bash
# Test on training data
python main.py \
  --input /home/shivam/Desktop/HandPose/LSTM-model/Training-Data-Normalized.xlsx \
  --output ./test_output \
  --fps 30

# Check outputs
ls -lh test_output/
# Should contain:
#   Analysis_report.xlsx
#   Plots.png
#   Report.pdf
#   events.json
#   metrics.json
```

## Troubleshooting

### TensorFlow Not Available
If LSTM model fails to load:
- Fallback heuristic detection will be used
- Install TensorFlow: `pip install tensorflow`

### Missing Dependencies
```bash
pip install --upgrade -r requirements.txt
```

### LSTM Model Not Found
Ensure model files exist:
```bash
ls -lh /home/shivam/Desktop/HandPose/LSTM-model/multihead_trained/
# Should see:
#   multihead_lstm_final.h5
#   label_encoders.pkl
#   training_config.pkl
```

### Memory Issues
For large recordings (>10k frames):
- Process in chunks
- Reduce sequence stride
- Disable unused outputs

## Integration with Web Service

### API Endpoint (Future)
```python
POST /api/analysis/process
{
  "recordingId": "rec_123",
  "protocolId": "protocol_456",
  "dataPath": "/path/to/normalized_data.xlsx"
}

Response:
{
  "analysisId": "analysis_789",
  "status": "processing",
  "results": {
    "events": {...},
    "metrics": {...},
    "reportUrls": {
      "xlsx": "...",
      "pdf": "...",
      "plots": "..."
    }
  }
}
```

## License

Part of SynaptiHand medical platform.

## Authors

Data Analysis Backend - 2026
