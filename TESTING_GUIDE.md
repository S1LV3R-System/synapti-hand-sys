# HandPose - Testing Guide

**Date:** 2026-01-29
**Status:** Docker Rebuilt ✅ | APK Built ✅ | Testing Pending ⏳

---

## 📊 Build Summary

### ✅ Docker Container Rebuild - COMPLETED

**Container:** `handpose-single`
**Image:** `handpose-single:production`
**Status:** Healthy and running
**Uptime:** 2+ minutes
**Memory Usage:** 107MB RSS

**Services Running:**
- Node.js Backend (Express) - Port 5000
- Frontend (React 19) - Served from /app/public
- Redis Cache - Port 6379 (internal)
- Supabase PostgreSQL - External (aws-1-ap-south-1.pooler.supabase.com)

**Health Endpoints:**
```bash
curl http://localhost:5000/api/health
# Response: {"status":"ok","version":"1.0.0","environment":"production"}
```

---

### ✅ Android APK Build - COMPLETED

**APK Location:** `/home/shivam/Desktop/HandPose/android/app/build/outputs/apk/debug/app-debug.apk`
**APK Size:** 84 MB
**Build Time:** 21 seconds
**Build Type:** Debug

**Compilation Issues Fixed:**
1. ✅ Missing PatientService interface (restored in Patients.kt)
2. ✅ Missing ProjectService interface (restored in Projects.kt)
3. ✅ AuthState.isLoading extension property imports (fixed in 4 files)
4. ✅ Coroutine context errors in Projects.kt (lines 192, 218)
5. ✅ Type mismatch in Projects.kt loadListData() method

**Code Quality:**
- 19 warnings (deprecation notices - non-critical)
- 0 errors
- All consolidated Kotlin files compile successfully

---

## 🧪 Next Steps - Emulator Testing

### Prerequisites

You'll need Android SDK Platform Tools for ADB (Android Debug Bridge):

**Option 1: Install via Android Studio** (Recommended)
```bash
# If Android Studio is installed:
# Open Android Studio → SDK Manager → SDK Tools → Android SDK Platform-Tools
```

**Option 2: Install standalone platform-tools**
```bash
# Download platform-tools
cd ~/Downloads
wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
unzip platform-tools-latest-linux.zip
sudo mv platform-tools /opt/
echo 'export PATH=$PATH:/opt/platform-tools' >> ~/.bashrc
source ~/.bashrc
```

---

### Step 1: Launch Android Emulator

**Via Android Studio:**
1. Open Android Studio
2. Tools → Device Manager
3. Create/Start an emulator (recommended: Pixel 5 API 33+)
4. Wait for emulator to boot completely

**Via Command Line (if AVD is already created):**
```bash
~/Android/Sdk/emulator/emulator -avd <your_avd_name> &
```

---

### Step 2: Verify Device Connection

```bash
adb devices
# Expected output:
# List of devices attached
# emulator-5554    device
```

---

### Step 3: Install APK on Emulator

```bash
cd /home/shivam/Desktop/HandPose/android

# Uninstall old version (if exists)
adb uninstall com.handpose.app

# Install new APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Expected output:
# Performing Streamed Install
# Success
```

---

### Step 4: Launch and Test the App

#### A. Launch the App
```bash
# Launch via ADB
adb shell am start -n com.handpose.app/.MainActivity

# Or manually tap the app icon on emulator
```

#### B. Functional Testing Checklist

**1. Authentication Flow** (First Launch)
- [ ] App starts and shows login screen
- [ ] Can enter email and password
- [ ] Login button works
- [ ] Successful login shows projects screen
- [ ] Session persists after app restart

**2. Patient Management**
- [ ] Can view patient list
- [ ] Can create new patient
- [ ] Can edit patient details
- [ ] Can delete patient
- [ ] Patient data saves correctly

**3. Project Management**
- [ ] Can view project list
- [ ] Can create new project
- [ ] Can assign patients to projects
- [ ] Can edit project details
- [ ] Can delete project

**4. Recording Flow** (CRITICAL - Core Feature)
- [ ] Camera permission requested on first use
- [ ] Camera preview shows correctly
- [ ] MediaPipe hand tracking displays landmarks
- [ ] Recording button starts/stops recording
- [ ] CSV data is generated during recording
- [ ] Excel export works
- [ ] Recording saves to local storage

**5. Data Upload**
- [ ] Can select recording for upload
- [ ] Upload progress shows correctly
- [ ] Upload completes successfully
- [ ] Can view upload status
- [ ] Backend receives data correctly

#### C. Error Cases to Test
- [ ] No internet connection (should show offline mode)
- [ ] Invalid credentials (should show error)
- [ ] Camera unavailable (should show error message)
- [ ] Upload failure (should retry or show error)

---

### Step 5: Check Logs for Errors

```bash
# View app logs in real-time
adb logcat | grep "HandPose\|MainActivity\|FATAL"

# Save logs to file
adb logcat > /home/shivam/Desktop/HandPose/android/test-logs.txt

# Check for crashes
adb logcat | grep "AndroidRuntime: FATAL"
```

---

## 🔗 End-to-End Integration Testing

### Prerequisites
1. ✅ Docker container running (port 5000)
2. ✅ APK installed on emulator
3. ⏳ Network connectivity configured

### E2E Test Flow

**Full User Journey:**
```
Android App (Emulator)
    ↓
1. User logs in via Supabase Auth
    ↓
2. User creates patient and project
    ↓
3. User starts recording with hand tracking
    ↓
4. CSV data saved locally (hand landmarks + timestamps)
    ↓
5. User uploads recording to backend
    ↓
Backend API (localhost:5000)
    ↓
6. Backend receives CSV + metadata
    ↓
7. Backend queues analysis job
    ↓
Analysis Service (Python)
    ↓
8. LSTM model analyzes hand movements
    ↓
9. Results stored in Supabase database
    ↓
10. User views results in app
```

### E2E Test Commands

```bash
# 1. Verify backend is accessible from emulator
adb shell "curl http://10.0.2.2:5000/api/health"
# Note: 10.0.2.2 is the special IP for localhost from Android emulator

# 2. Monitor backend logs during testing
cd /home/shivam/Desktop/HandPose/Web-Service
docker logs -f handpose-single

# 3. Monitor app logs during upload
adb logcat | grep "Upload\|NetworkModule\|SupabaseDataRepository"

# 4. Check backend received data
# In backend logs, look for:
# - "POST /api/recordings" - Upload endpoint hit
# - "Job queued" - Analysis job created
# - "Analysis complete" - Processing finished
```

### E2E Success Criteria

- [ ] Authentication works end-to-end
- [ ] Patient/Project CRUD operations sync to backend
- [ ] Recording generates valid CSV with hand landmarks
- [ ] CSV uploads successfully to backend
- [ ] Backend queues analysis job
- [ ] Analysis service processes data
- [ ] Results are stored in database
- [ ] User can view results in app

---

## 🐛 Known Issues & Workarounds

### Issue 1: Network Connectivity (Emulator → Backend)
**Problem:** Emulator can't reach localhost:5000
**Solution:** Use `10.0.2.2` instead of `localhost` in app network config

**Fix Location:** `/android/app/src/main/java/com/handpose/app/network/Network.kt`
```kotlin
// Change BASE_URL for emulator testing:
private const val BASE_URL = "http://10.0.2.2:5000/api/"
```

### Issue 2: MediaPipe Model File
**Problem:** hand_landmarker.task file too large (7.8 MB)
**Status:** File is already in `/home/shivam/Desktop/HandPose/android/hand_landmarker.task`
**Verification:** Check it's included in APK assets during build

### Issue 3: Permissions
**Problem:** Camera/Storage permissions not granted
**Solution:** Ensure runtime permissions are requested in MainActivity
**Status:** Already implemented in consolidated code

---

## 📝 Test Results Template

Use this template to document your testing:

```markdown
## Test Run - 2026-01-29

### Environment
- Emulator: [Device name, API level]
- Backend: handpose-single container (port 5000)
- APK Version: app-debug.apk (84 MB)

### Authentication
- Login: [PASS/FAIL] [Notes]
- Session persistence: [PASS/FAIL]

### Patient Management
- Create: [PASS/FAIL]
- Read: [PASS/FAIL]
- Update: [PASS/FAIL]
- Delete: [PASS/FAIL]

### Recording
- Camera initialization: [PASS/FAIL]
- Hand tracking: [PASS/FAIL]
- Data capture: [PASS/FAIL]
- CSV generation: [PASS/FAIL]

### Upload & Analysis
- Upload: [PASS/FAIL]
- Backend processing: [PASS/FAIL]
- Results retrieval: [PASS/FAIL]

### Errors Encountered
[List any errors or crashes with logcat excerpts]

### Performance Notes
[App responsiveness, recording accuracy, upload speed]
```

---

## 🚀 Quick Start Command Reference

```bash
# Setup (one-time)
adb devices  # Check if emulator is connected

# Install APK
cd /home/shivam/Desktop/HandPose/android
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.handpose.app/.MainActivity

# Monitor logs
adb logcat | grep "HandPose"

# Monitor backend
docker logs -f handpose-single

# Capture screenshot
adb exec-out screencap -p > screenshot.png

# Pull app data for inspection
adb pull /sdcard/Android/data/com.handpose.app/files/ ./app-data/
```

---

## 🎯 Success Criteria Summary

### Must Pass ✅
- [ ] App installs without errors
- [ ] Login flow works
- [ ] Camera permission granted
- [ ] Hand tracking displays correctly
- [ ] Recording generates CSV file
- [ ] Upload to backend succeeds
- [ ] Backend processes data
- [ ] No app crashes during normal use

### Should Pass ⚠️
- [ ] All patient CRUD operations work
- [ ] All project CRUD operations work
- [ ] Excel export works
- [ ] Offline mode handles gracefully
- [ ] Upload retry works on failure

### Nice to Have 🎁
- [ ] Performance is smooth (60fps camera)
- [ ] Battery usage is acceptable
- [ ] Upload progress is accurate
- [ ] Error messages are user-friendly

---

## 📞 Next Actions

1. **Install Android SDK Platform Tools** (if not already installed)
2. **Launch Android Emulator** (via Android Studio or command line)
3. **Install APK** using commands above
4. **Run functional tests** following checklist
5. **Perform E2E test** following integration flow
6. **Document results** using template above
7. **Report issues** in test-results.md

---

## 📌 Important Notes

- The APK is a **debug build** - not optimized for production
- MediaPipe 0.10.9 is locked - do not upgrade without testing
- Backend uses Supabase hosted PostgreSQL - ensure network access
- Camera preview requires device orientation to be portrait
- CSV files can be large (1MB+ for long recordings)

---

**Build Status:** ✅ READY FOR TESTING
**Next Step:** Install and test APK on emulator
**Estimated Testing Time:** 30-45 minutes for full E2E test
