# Parallel Upload Architecture Memory

## Design Overview
- Split single upload into two channels: keypoints (priority) + video (background)
- CSV uploaded first (2-3 seconds) triggers immediate analysis
- Video uploads in background (60-120 seconds) without blocking
- 75% faster perceived wait time for users

## New Backend Endpoints
1. `POST /api/mobile/keypoints` - Priority channel, creates session, queues analysis
2. `POST /api/mobile/video` - Background channel, updates existing session
3. `GET /api/mobile/session/:sessionId` - Enhanced status with dual upload tracking

## Key Files to Modify
- Backend: `mobile.controller.ts`, `mobile.routes.ts`, `schema.prisma`
- Android: Add `ParallelUploadManager.kt`, `KeypointsUploadWorker.kt`, `VideoUploadWorker.kt`
- Android: Update `RecordingViewModel.kt`, `RecordingService.kt`, `UploadState`

## Database Schema Changes
- Add `mobileSessionId` (unique)
- Add `keypointsUploadedAt`, `videoUploadedAt`
- Add `analysisStartedAt`, `analysisCompletedAt`, `analysisError`
- Status enum: created | keypoints_uploaded | analyzing | video_uploaded | completed | error

## Full Design Document
See: `backend-node/claudedocs/PARALLEL_UPLOAD_ARCHITECTURE.md`
