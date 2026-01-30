// ============================================================================
// UPLOAD ROUTES
// ============================================================================

import { Router } from 'express';
import {
  uploadVideo,
  getUploadStatus,
  cancelUpload,
  uploadMiddleware,
} from '../controllers/upload.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All upload routes require authentication
router.use(authMiddleware);

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
router.post('/', uploadMiddleware, uploadVideo);

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
router.get('/:id/status', getUploadStatus);

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
router.post('/:id/cancel', cancelUpload);

export default router;
