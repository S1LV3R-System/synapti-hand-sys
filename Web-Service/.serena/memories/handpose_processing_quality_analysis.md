# Handpose Processing Quality Analysis

## Overview
This document summarizes the quality patterns and output structure from the reference handpose processing implementation at `/home/shivam/Desktop/GitHub prep/Handpose/processing/`.

## Architecture

### Processing Pipeline
1. **Video Reading** → Frame extraction with configurable skip intervals
2. **Hand Detection** → MediaPipe detector for 21 landmarks × 2 hands
3. **Signal Filtering** → Per-coordinate filtering (21 landmarks × 3 coords × 2 hands = 126 trajectories)
4. **Clinical Test Detection** → Automatic detection of Test 1/2/3
5. **Excel Export** → Raw_data.xlsx with Right-Hand, Left-Hand, Summary sheets
6. **Video Export** → Annotated output_video.mp4

### Clinical Tests Supported
1. **Test 1 - Wrist Rotation** (`WristRotationTest`)
   - Detects pronation/supination/neutral states
   - Tracks supination↔pronation switch counts
   - Uses palm-to-camera angle for state classification
   - Configurable thresholds: `supination_limit`, `pronation_limit`
   
2. **Test 2 - Finger Tapping** (`FingerTappingTest`)
   - Tracks thumb-to-index finger distance
   - Detects tap cycles (open → close → open)
   - Measures tapping frequency (Hz)
   - Uses hysteresis for robust detection (close_threshold=0.05, open_threshold=0.12)
   
3. **Test 3 - Hand Aperture** (`HandApertureTest`)
   - 3-stage analysis
   - Tracks hand spread (palm to fingertip distance)
   - Detects aperture-closure cycles
   - Per-stage metrics with duration tracking

## Quality Metrics (from `metrics.py`)

### Symmetry Index
```python
|L - R| / ((L + R) / 2)
```
- 0 = perfect symmetry
- Higher values = more asymmetry

### Range of Motion
- min, max, range, mean, std for position/angle measurements

### Coefficient of Variation (CV)
```python
CV = std / mean * 100
```
- Lower CV = more consistent movements

### Regularity Score
```python
regularity = max(0.0, 1.0 - CV / 100)
```
- 0-1 scale, 1 = perfectly regular intervals

### Trajectory Smoothness
- Jerk-based smoothness metric
- Smoother movements = lower jerk magnitude
```python
smoothness = 1.0 / (1.0 + roughness * 100)
```
- 0-1 scale, 1 = very smooth

### Normative Comparison
- Z-score calculation against population norms
- Percentile ranking
- Normal/abnormal deviation classification (|z| < 2 = normal)

## Test Detection Metrics

### TestMetrics Utility Class
- `calculate_distance()` - Euclidean distance between points
- `calculate_angle()` - Angle between vectors (degrees)
- `calculate_palm_angle_to_camera()` - Palm normal vs camera axis
- `calculate_hand_spread()` - Average fingertip-to-palm distance
- `calculate_finger_curl()` - Per-finger curl value (0=straight, 1=curled)

### Detection Confidence
Each test provides detection confidence based on:
- Minimum switch/tap/cycle counts
- Recent history window analysis
- Expected vs actual event counts

## Output Quality Indicators

### Frame-Level Outputs
- `frame_number` - Sequential frame ID
- `timestamp` - Time in seconds
- `left_hand` / `right_hand` - HandLandmarks objects or None
- `test_type` - Detected test (test1/test2/test3/None)
- `test_stage` - Stage for Test 3

### Summary Statistics
- Total frames processed
- Duration in seconds
- Per-test switch/tap/cycle counts
- Per-hand frequency (Hz)
- Symmetry scores
- State distributions

### Excel Output Structure
1. **Right-Hand sheet** - Frame, Timestamp, 21 landmarks × 3 coords
2. **Left-Hand sheet** - Same structure
3. **Summary sheet** - Key-value metric pairs

## Comparison with Current Analysis-Service

### Current analysis-service strengths:
- More advanced biomarkers (SPARC, LDLJ-V, bradykinesia)
- LSTM-based event detection
- Multiple filter types (40+ algorithms)
- Comprehensive visualization (3D trajectories, phase plots)
- Clinical severity scoring

### Reference implementation strengths:
- Cleaner test detection architecture (confidence-based selection)
- Per-stage analysis for Test 3
- Bilateral symmetry focus
- Simpler, more focused clinical metrics

### Recommendations for analysis-service:
1. Add `regularity` metric to event analysis
2. Implement `symmetry_index` for L/R comparisons
3. Add `coefficient_of_variation` to variability metrics
4. Include test detection confidence scores
5. Consider stage-based analysis for complex movements

## Data Quality Flags

The reference implementation checks:
- Hand detection rate (frames with detected hands / total frames)
- Both hands detection rate
- Test distribution (percentage of frames per test type)
- Minimum duration requirements per test

These could be added to analysis-service quality assessment.
