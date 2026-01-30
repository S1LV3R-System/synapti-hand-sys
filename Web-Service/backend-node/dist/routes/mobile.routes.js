"use strict";
// ============================================================================
// MOBILE ROUTES - Endpoints for Android/iOS mobile app uploads
// ============================================================================
// Architecture: Android → Backend API → GCS (service account)
// Security: Android authenticates with JWT, backend uses service account for GCS
// No GCS credentials exposed to mobile clients
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mobile_controller_1 = require("../controllers/mobile.controller");
const router = (0, express_1.Router)();
// ============================================================================
// PROTOCOL SYNC ENDPOINT
// ============================================================================
/**
 * GET /api/mobile/protocols - Get available protocols for mobile app
 * Returns public, active protocols for use in recording sessions
 *
 * Query params:
 * - includeInactive: boolean (default: false) - Include inactive protocols
 *
 * Response:
 * {
 *   success: boolean,
 *   protocols: Array<{
 *     id: string,
 *     name: string,
 *     description: string,
 *     version: string,
 *     indicatedFor: string,
 *     instructions: string,
 *     isSystem: boolean
 *   }>,
 *   syncedAt: string (ISO timestamp)
 * }
 */
router.get('/protocols', mobile_controller_1.getProtocols);
// ============================================================================
// PARALLEL UPLOAD ENDPOINTS (New - Recommended)
// ============================================================================
/**
 * POST /api/mobile/keypoints - Priority Channel
 * Upload keypoints CSV and metadata to start analysis immediately
 * This is the FAST path - triggers analysis without waiting for video
 *
 * Body (multipart/form-data):
 * - session_id: string (required) - Unique session identifier from mobile app
 * - patient_id: string (optional) - Patient UUID or "unknown"
 * - keypoints: File (required) - CSV file with hand landmark keypoints (60 FPS)
 * - metadata: File (optional) - JSON file with session metadata
 *
 * Response:
 * {
 *   success: boolean,
 *   recordingId: string,
 *   sessionId: string,
 *   status: "analyzing",
 *   message: string,
 *   uploadedAt: string,
 *   files: { keypoints: true, metadata: boolean, video: false }
 * }
 */
router.post('/keypoints', mobile_controller_1.keypointsUploadMiddleware, mobile_controller_1.uploadKeypoints);
/**
 * POST /api/mobile/video - Background Channel
 * Upload video file for an existing session
 * This is the SLOW path - can run in background while analysis proceeds
 *
 * Body (multipart/form-data):
 * - session_id: string (required) - Must match existing session from /keypoints
 * - video: File (required) - MP4 video file (30 FPS)
 *
 * Response:
 * {
 *   success: boolean,
 *   sessionId: string,
 *   recordingId: string,
 *   videoPath: string,
 *   uploadedAt: string,
 *   status: string,
 *   message: string
 * }
 *
 * Errors:
 * - 404: Session not found (upload keypoints first)
 * - 409: Video already uploaded for this session
 */
router.post('/video', mobile_controller_1.videoUploadMiddleware, mobile_controller_1.uploadVideo);
/**
 * GET /api/mobile/session/:sessionId - Enhanced Session Status
 * Get detailed status of both upload channels and analysis progress
 *
 * Response:
 * {
 *   success: boolean,
 *   session: {
 *     recordingId: string,
 *     sessionId: string,
 *     status: string,
 *     createdAt: Date,
 *     updatedAt: Date,
 *     uploads: {
 *       keypoints: { uploaded: boolean, uploadedAt: string, gcsPath: string },
 *       video: { uploaded: boolean, uploadedAt: string, gcsPath: string },
 *       metadata: { uploaded: boolean }
 *     },
 *     analysis: {
 *       status: "pending" | "processing" | "completed" | "failed",
 *       startedAt: string,
 *       completedAt: string,
 *       progress: number,
 *       error: string,
 *       results: object
 *     }
 *   }
 * }
 */
router.get('/session/:sessionId', mobile_controller_1.getSessionStatus);
// ============================================================================
// LEGACY UNIFIED UPLOAD (Backward Compatibility)
// ============================================================================
/**
 * POST /api/mobile/upload
 * Upload recording from mobile app (unified upload - all files at once)
 * @deprecated Use /api/mobile/keypoints and /api/mobile/video for parallel upload
 *
 * Body (multipart/form-data):
 * - session_id: string (required) - Unique session identifier from mobile app
 * - patient_id: string (optional) - Patient UUID or "unknown"
 * - video: File (optional) - MP4 video file
 * - keypoints: File (optional) - CSV file with hand landmark keypoints
 * - metadata: File (optional) - JSON file with session metadata
 *
 * At least video or keypoints must be provided.
 *
 * Response:
 * {
 *   success: boolean,
 *   recordingId: string,
 *   sessionId: string,
 *   uploadedAt: string,
 *   status: string,
 *   files: { video: boolean, keypoints: boolean, metadata: boolean }
 * }
 */
router.post('/upload', mobile_controller_1.mobileUploadMiddleware, mobile_controller_1.uploadMobileRecording);
/**
 * GET /api/mobile/status/:sessionId
 * Get upload status by mobile session ID
 * @deprecated Use /api/mobile/session/:sessionId for enhanced status
 *
 * Response:
 * {
 *   success: boolean,
 *   recording: {
 *     id: string,
 *     status: string,
 *     createdAt: Date,
 *     updatedAt: Date,
 *     metadata: object
 *   }
 * }
 */
router.get('/status/:sessionId', mobile_controller_1.getMobileUploadStatus);
/**
 * GET /api/mobile/uploads
 * List all mobile uploads
 *
 * Query params:
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 *
 * Response:
 * {
 *   success: boolean,
 *   recordings: Array<{
 *     id: string,
 *     sessionId: string,
 *     status: string,
 *     hasVideo: boolean,
 *     hasKeypoints: boolean,
 *     keypointsUploadedAt: Date,
 *     videoUploadedAt: Date,
 *     analysisStartedAt: Date,
 *     analysisCompletedAt: Date,
 *     createdAt: Date,
 *     updatedAt: Date,
 *     metadata: object
 *   }>,
 *   pagination: { total, limit, offset }
 * }
 */
router.get('/uploads', mobile_controller_1.listMobileUploads);
/**
 * POST /api/mobile/generate-labeled/:sessionId
 * Generate labeled video with hand landmarks overlay (post-processing)
 * Uses existing keypoints.csv and video.mp4 from GCS
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   sessionId: string,
 *   recordingId: string,
 *   status: "processing"
 * }
 */
router.post('/generate-labeled/:sessionId', mobile_controller_1.generateLabeledVideo);
exports.default = router;
