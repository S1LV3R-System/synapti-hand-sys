# HandPose Android App - Project Overview

## Purpose
Hand pose detection and recording application for mobile devices. Allows users to:
- Record hand movements via camera
- Detect hand landmarks using MediaPipe
- Store recordings (video + keypoint CSV data)
- Upload to backend server
- Manage patients and projects (authentication required)

## Tech Stack
- **Language**: Kotlin 1.9.22
- **Android API**: Min SDK 26, Target SDK 34, Compile SDK 34
- **UI Framework**: Jetpack Compose with Material3
- **Camera**: CameraX 1.3.1
- **ML Model**: MediaPipe Tasks Vision 0.10.9 (hand landmark detection)
- **Networking**: Retrofit 2.9.0 + OkHttp 4.12.0
- **DI**: Hilt 2.50
- **State Management**: ViewModel + StateFlow
- **Navigation**: Jetpack Navigation Compose 2.7.7
- **Storage**: Room Database 2.6.1
- **Security**: Encrypted SharedPreferences (androidx.security:security-crypto)
- **Async**: Kotlin Coroutines 1.7.3
- **Build System**: Gradle with Kotlin DSL

## Package Structure
```
com.handpose.app/
├── auth/               # Authentication (login, token management)
├── projects/          # Project management and list
├── patients/          # Patient management and detail
├── recording/         # Recording session management
├── camera/            # Camera and hand detection
├── ml/                # ML model integration (MediaPipe)
├── ui/                # Compose UI components
├── network/           # API services and networking
├── data/              # Data models and repositories
├── di/                # Dependency injection setup
└── MainActivity.kt    # App entry point
```

## Code Style & Conventions
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **File Organization**: One public class per file
- **Kotlin**: Modern Kotlin idioms (data classes, sealed classes, extension functions)
- **Compose**: Composable functions for UI, state flow for reactive updates
- **Coroutines**: suspend functions for async operations
- **Error Handling**: Try-catch with proper logging (Log.e/d)
- **Comments**: Docstring comments for public APIs

## Build & Verification
- **Build**: `./gradlew build`
- **Debug APK**: `./gradlew assembleDebug`
- **Run Tests**: `./gradlew test`
- **Lint Check**: Built into Gradle build process
- **Exclude**: x86_64 architecture (MediaPipe doesn't support)

## Important Configuration Files
- `build.gradle` (root) - Plugin versions
- `app/build.gradle` - Dependencies and build configuration
- `local.properties` - SDK path and local configuration
- `gradle.properties` - Gradle properties

## Recent Changes (Session Work)
1. Added patient_id parameter to mobile upload flow (RecordingService.kt)
2. Modified RecordingViewModel.submitRecording() to extract and send patientId
3. Updated backend mobile.controller.ts to link recordings to correct patient
4. Added UploadStatusPanel UI component (RecordingControls.kt)
5. Fixed Lint error in MainActivity.kt with @OptIn annotation
6. Successfully built APK (v1.0, 67MB)

## Current Status
- ✅ Authentication implemented
- ✅ Project/Patient management implemented
- ✅ Recording and upload working
- ✅ Patient-linked recordings now functional
- ✅ Upload status UI feedback implemented
