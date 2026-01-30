"use strict";
// ============================================================================
// UPLOAD ROUTES
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_controller_1 = require("../controllers/upload.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All upload routes require authentication
router.use(auth_middleware_1.authMiddleware);
/**
 * POST /api/upload
 * Upload video file with metadata
 *
 * Body (multipart/form-data):
 * - video: File (required)
 * - patientId: string (required)
 * - clinicianId: string (optional)
 * - protocolId: string (optional)
 * - deviceInfo: JSON string (optional)
 * - clinicalNotes: string (optional)
 *
 * Response:
 * {
 *   success: boolean,
 *   recordingId: string,
 *   uploadedAt: Date,
 *   status: string,
 *   gcsPath: string
 * }
 */
router.post('/', upload_controller_1.uploadMiddleware, upload_controller_1.uploadVideo);
/**
 * GET /api/upload/:id/status
 * Get upload and processing status
 *
 * Response:
 * {
 *   success: boolean,
 *   recording: {
 *     id: string,
 *     status: string,
 *     videoPath: string,
 *     processingMetadata: object,
 *     createdAt: Date,
 *     updatedAt: Date
 *   },
 *   jobs: JobStatus[]
 * }
 */
router.get('/:id/status', upload_controller_1.getUploadStatus);
/**
 * POST /api/upload/:id/cancel
 * Cancel upload/processing
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 */
router.post('/:id/cancel', upload_controller_1.cancelUpload);
exports.default = router;
