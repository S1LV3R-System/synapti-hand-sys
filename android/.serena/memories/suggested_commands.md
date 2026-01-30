# HandPose Android Development Commands

## Build Commands
```bash
# Debug build
./gradlew assembleDebug

# Release build (currently minifyEnabled false)
./gradlew assembleRelease

# Full build with tests
./gradlew build

# Clean and rebuild
./gradlew clean assembleDebug
```

## Testing Commands
```bash
# Unit tests
./gradlew test

# Instrumented tests (requires device/emulator)
./gradlew connectedAndroidTest

# Lint check
./gradlew lint
```

## Code Quality
```bash
# Build with detailed output
./gradlew build --info

# Check for compatibility issues
./gradlew lint --stacktrace
```

## Project Verification
```bash
# Check Gradle dependencies
./gradlew dependencies

# Validate project structure
ls -la app/src/main/java/com/handpose/app/
```

## Common Gradle Tasks
```bash
# Install debug APK to device
./gradlew installDebug

# Run on emulator
./gradlew installDebug
adb shell am start -n com.handpose.app/.MainActivity

# View Gradle tasks
./gradlew tasks

# View all available tasks
./gradlew tasks --all
```

## APK Output
- Location: `app/build/outputs/apk/debug/app-debug.apk`
- File size: ~67MB (with all dependencies)
- Architecture support: arm64-v8a, armeabi-v7a, x86 (excluding x86_64)

## Important Environment Notes
- Requires Android SDK 34
- Kotlin 1.9.22
- Java 1.8 compatibility
- Linux build environment (host OS)
