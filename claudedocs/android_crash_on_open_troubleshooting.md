# Android APK Crash on Open - Troubleshooting Guide

**Date**: 2026-01-21
**Issue**: APK crashes immediately on app open after implementing authentication fix

---

## Changes Made to Fix Potential Issues

### 1. Fixed Logout Navigation Bug
**File**: `MainActivity.kt:182-184`

**Problem**: Logout callback was trying to navigate to "login" route which no longer exists.

**Fix**:
```kotlin
onLogout = {
    // Just call logout - state change will automatically show LoginScreen
    authViewModel.logout()
}
```

### 2. Added Fallback for Unexpected States
**File**: `MainActivity.kt:259-263`

**Problem**: No else clause in when block could cause undefined behavior.

**Fix**:
```kotlin
// Fallback for unexpected states
else -> {
    Log.e("MainActivity", "Unexpected auth state: $authState")
    LoadingScreen(message = "Initializing...")
}
```

### 3. Added Initialization Logging
**File**: `AuthViewModel.kt:42`

**Addition**:
```kotlin
init {
    Log.d(TAG, "AuthViewModel initialized, starting session validation")
    validateExistingSession()
}
```

### 4. Removed Unused Variable
**File**: `MainActivity.kt:167`

Removed unused `user` variable extraction.

---

## How to Get Crash Logs

### Using Logcat (Recommended)

1. **Connect device via USB**
2. **Enable USB debugging** on the device
3. **Run logcat** to capture crash logs:

```bash
# Clear existing logs
adb logcat -c

# Start capturing logs
adb logcat > crash_log.txt

# Or filter for important tags
adb logcat -v time | grep -E "AndroidRuntime|MainActivity|AuthViewModel|Supabase|HandPose"
```

4. **Open the app** - it will crash
5. **Stop logcat** (Ctrl+C)
6. **Review crash_log.txt** for the stack trace

### Key Log Tags to Look For

```
E/AndroidRuntime: FATAL EXCEPTION: main
E/MainActivity: ...
E/AuthViewModel: ...
E/SupabaseAuthRepository: ...
E/HandPoseApplication: Uncaught exception in thread main
```

### Specific Issues to Check

1. **Supabase Initialization Errors**:
   ```
   grep -i "supabase" crash_log.txt
   grep -i "network\|connection" crash_log.txt
   ```

2. **Hilt Dependency Injection Errors**:
   ```
   grep -i "hilt\|inject\|dagger" crash_log.txt
   ```

3. **Null Pointer Exceptions**:
   ```
   grep -i "nullpointer\|npe" crash_log.txt
   ```

---

## Possible Root Causes

### 1. Supabase Network Initialization Issue

**Symptoms**:
- App crashes before any UI is shown
- Logs show network/connection errors
- Supabase client fails to initialize

**Diagnosis**:
Check if device has internet connectivity and can reach Supabase:
```bash
# From device shell
adb shell ping mtodevikkgraisalolkq.supabase.co
```

**Fix**:
- Ensure device has internet connection
- Check if Supabase URL is correct in `SupabaseConfig.kt`
- Verify INTERNET permission in AndroidManifest.xml (already present)

### 2. Hilt Dependency Injection Failure

**Symptoms**:
- Crash in HandPoseApplication or MainActivity onCreate
- Logs show "No injector factory bound for Class"
- Missing @HiltAndroidApp or @AndroidEntryPoint annotation

**Diagnosis**:
Check logcat for Hilt-related errors.

**Fix**:
- Verify `@HiltAndroidApp` on HandPoseApplication (✓ present)
- Verify `@AndroidEntryPoint` on MainActivity (✓ present)
- Rebuild project: `./gradlew clean assembleDebug`

### 3. Conflicting AuthState Flows

**Symptoms**:
- Crash during AuthViewModel initialization
- State-related exceptions in logs

**Diagnosis**:
Both `SupabaseAuthRepository` and `AuthViewModel` have separate `_authState` flows. They're independent and could get out of sync.

**Current Architecture**:
```
SupabaseAuthRepository
├─ _authState (internal state)
└─ Manages Supabase auth operations

AuthViewModel
├─ _authState (exposed to UI)
└─ Calls SupabaseAuthRepository methods
```

**Potential Issue**: The two state flows don't sync automatically.

**Fix** (if this is the issue):
Option A: AuthViewModel should observe SupabaseAuthRepository's authState
Option B: Remove authState from SupabaseAuthRepository entirely (it's not used by UI)

### 4. Missing Model Asset

**Symptoms**:
- Crash when trying to load hand_landmarker.task
- Logs show "Model file missing!"

**Diagnosis**:
```kotlin
// MainActivity onCreate already checks this:
try {
    assets.open("hand_landmarker.task").use {
        Log.d("MainActivity", "Model file found, size: ${it.available()}")
    }
} catch (e: Exception) {
    Log.e("MainActivity", "Model file missing!", e)
}
```

**Fix**:
Ensure `hand_landmarker.task` is in `app/src/main/assets/`

---

---

## ✅ ISSUE RESOLVED - Jetpack Compose Version Incompatibility

**Root Cause**: Compose BOM version `2023.08.00` from August 2023 was too old, causing binary incompatibility between Material 3 components and the Compose Animation Core library.

**Specific Error**:
```
java.lang.NoSuchMethodError: No virtual method at(Ljava/lang/Object;I)Landroidx/compose/animation/core/KeyframesSpec$KeyframeEntity;
in class Landroidx/compose/animation/core/KeyframesSpec$KeyframesSpecConfig
```

**The Fix Applied**:

Updated `app/build.gradle` Compose BOM from `2023.08.00` to `2024.02.00`:

```gradle
// Before (OLD - BROKEN)
implementation platform('androidx.compose:compose-bom:2023.08.00')

// After (NEW - FIXED)
implementation platform('androidx.compose:compose-bom:2024.02.00')
```

This single change updates all Compose libraries to compatible versions:
- `androidx.compose.ui:ui`
- `androidx.compose.material3:material3`
- `androidx.compose.animation:animation-core`
- All other Compose dependencies

**Why This Fixed It**:
- The old BOM had Material 3 components using newer animation APIs
- But the animation-core library version was too old and missing those APIs
- The updated BOM ensures ALL Compose libraries are from compatible versions
- The `at()` method in keyframe animations now exists in the newer animation-core

**Build Result**: ✅ `BUILD SUCCESSFUL in 2m 6s`

**APK Location**: `app/build/outputs/apk/debug/app-debug.apk`

---

## Debugging Steps

### Step 1: Capture Full Crash Log

```bash
adb logcat -c
adb logcat -v time > full_crash.log &
# Open app (it will crash)
# Wait 10 seconds
pkill -f "adb logcat"
```

### Step 2: Extract Stack Trace

```bash
grep -A 50 "FATAL EXCEPTION" full_crash.log
```

### Step 3: Identify Crash Location

Look for the first line in the stack trace that references your code:
- `com.handpose.app.MainActivity`
- `com.handpose.app.auth.AuthViewModel`
- `com.handpose.app.auth.SupabaseAuthRepository`
- `com.handpose.app.HandPoseApplication`

### Step 4: Check Initialization Order

The initialization happens in this order:
```
1. HandPoseApplication.onCreate()
2. SupabaseModule.provideSupabaseClient() (Hilt singleton)
3. MainActivity.onCreate()
4. setContent { HandPoseApp(...) }
5. hiltViewModel<AuthViewModel>() creates AuthViewModel
6. AuthViewModel.init{} → validateExistingSession()
7. State-driven UI renders based on authState
```

Crash could occur at any of these steps.

---

## Quick Fixes to Try

### Fix #1: Add Try-Catch Around Supabase Initialization

**File**: `di/SupabaseModule.kt`

```kotlin
@Provides
@Singleton
fun provideSupabaseClient(): SupabaseClient {
    return try {
        createSupabaseClient(
            supabaseUrl = SupabaseConfig.SUPABASE_URL,
            supabaseKey = SupabaseConfig.SUPABASE_ANON_KEY
        ) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
        }
    } catch (e: Exception) {
        Log.e("SupabaseModule", "Failed to create Supabase client", e)
        throw IllegalStateException("Supabase initialization failed", e)
    }
}
```

### Fix #2: Simplify AuthViewModel Initialization

**File**: `AuthViewModel.kt`

Change validateExistingSession() to be synchronous for initial check:

```kotlin
init {
    Log.d(TAG, "AuthViewModel initialized")

    // Set initial state synchronously
    _authState.value = if (authRepository.isLoggedIn()) {
        AuthState.Unknown  // Will validate async
    } else {
        AuthState.NotAuthenticated()
    }

    // Then validate asynchronously
    if (authRepository.isLoggedIn()) {
        validateExistingSession()
    }
}
```

### Fix #3: Remove Duplicate AuthState Flow

Remove `_authState` from `SupabaseAuthRepository` since it's not used:

**File**: `SupabaseAuthRepository.kt`

Remove lines:
```kotlin
private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)
val authState: StateFlow<AuthState> = _authState.asStateFlow()
```

And remove all `_authState.value = ...` assignments.

---

## Testing After Fix

1. **Rebuild APK**:
   ```bash
   ./gradlew clean assembleDebug
   ```

2. **Install**:
   ```bash
   ./gradlew installDebug
   ```

3. **Run with Logcat**:
   ```bash
   adb logcat -v time | grep -E "AndroidRuntime|HandPose|Auth"
   ```

4. **Open app and check logs**

---

## Expected Behavior (When Fixed)

1. App opens
2. LoadingScreen shows "Initializing..." or "Checking session..."
3. After 300ms delay:
   - If no session → LoginScreen
   - If valid session → ProjectsScreen
4. No crashes, smooth state transitions

---

## Contact Information

If you get crash logs, look for:
1. The exception type (e.g., NullPointerException, IllegalStateException)
2. The exact line number in your code
3. The full stack trace
4. Any logs from AuthViewModel or SupabaseAuthRepository

Share these details for further debugging.
