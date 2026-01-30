# CSV Data Format & FPS Recording

## CSV File Structure

### Header (per keypoints.csv):
```
timestamp,frame_number,hand_index,handedness,lm0_x,lm0_y,lm0_z,lm1_x,lm1_y,lm1_z,...lm20_z
```

### Data Row Example:
```
1673452890120,1,0,Right,0.125430,0.234567,0.012340,0.126543,...0.987654
```

### What Each Column Means:
- **timestamp**: Milliseconds when frame was captured
- **frame_number**: Incremental counter (1, 2, 3, 4...)
- **hand_index**: Which hand (0 = first hand, 1 = second hand)
- **handedness**: "Right" or "Left" hand
- **lm0_x to lm20_z**: 21 landmarks × 3 coordinates (x, y, z) = 63 values
  - Landmarks: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
  - Each coordinate normalized 0.0 to 1.0

## FPS Recording Details

### CSV FPS is FULL 30fps
The CSV records **every single camera frame** at the full frame rate:

```kotlin
// In MainActivity.kt - CameraScreen
LaunchedEffect(handPoseResultRaw, recordingUiState.isRecording) {
    if (recordingUiState.isRecording && handPoseResultRaw != null) {
        recordingViewModel.recordFrame(handPoseResultRaw!!)  // ← Uses RAW, unthrottled frames
    }
}
```

### Important Distinction:
- **Overlay Rendering**: 15fps (throttled for GPU performance)
- **CSV Recording**: 30fps (full rate, unaffected by throttling)
- **Video Recording**: 30fps (always captures at full rate)

### FPS Calculated in Metadata JSON:
The metadata.json file includes calculated average FPS:

```json
{
    "sessionId": "session_20260112_151559_217a8580",
    "totalFrames": 450,
    "durationMs": 15000,
    "avgFps": 30.00,
    "timestamp": 1673452890120,
    ...
}
```

Calculated as: `totalFrames * 1000 / durationMs`
- Example: 450 frames × 1000 / 15000ms = 30.00 fps

## Data Density

### Per Second of Recording:
- **Frame Rate**: 30 frames/second
- **Rows per Frame**: 1-2 rows (1 for single hand, 2 for dual hand)
- **CSV Rows/second**: 30-60 rows
- **Data Points/second**: 1,890-3,780 coordinates captured
- **File Size**: ~2-3 KB/second of recording

### Example 10-Second Recording:
- Frames: 300
- CSV Rows: 300-600 (depending on hands detected)
- File Size: ~20-30 KB CSV file
- Metadata: ~400 bytes JSON file

## Key Points:
✅ **CSV FPS is NOT affected by overlay throttling**
✅ **Records at native camera frame rate (~30fps)**
✅ **No data loss from performance optimization**
✅ **Full hand tracking data preserved (21 landmarks × 3 coords)**
✅ **Metadata includes calculated FPS for analysis**

## How to Check FPS in Uploaded Data:
1. Download metadata.json from uploaded session
2. Check `avgFps` field
3. Check `totalFrames` and `durationMs` to verify
4. CSV rows should match or exceed totalFrames (if multiple hands)
