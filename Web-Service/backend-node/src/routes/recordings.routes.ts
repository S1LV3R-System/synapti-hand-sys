import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  requireClinician,
  canAccessRecording,
  canModifyRecording,
  canDeleteRecording,
  canCreateRecording
} from '../middleware/rbac.middleware';
import {
  createRecording,
  listRecordings,
  getRecording,
  getRecordingFiles,
  updateRecording,
  updateRecordingStatus,
  updateReviewStatus,
  deleteRecording
} from '../controllers/recordings.controller';
import { validate } from '../utils/validation';
import {
  createRecordingSchema,
  updateRecordingSchema,
  updateRecordingStatusSchema,
  updateReviewStatusSchema,
  listRecordingsSchema,
  getRecordingSchema,
  deleteRecordingSchema
} from '../schemas/recordings.schema';

const router = Router();

// ============================================================================
// Recording Session Routes
// ============================================================================

/**
 * @route   POST /api/recordings
 * @desc    Create new recording session
 * @access  Admin, Clinician, or Researcher
 */
router.post(
  '/',
  authMiddleware,
  canCreateRecording,
  validate(createRecordingSchema),
  createRecording
);

/**
 * @route   GET /api/recordings
 * @desc    List recording sessions with filtering
 * @access  Authenticated (role-based filtering)
 */
router.get(
  '/',
  authMiddleware,
  validate(listRecordingsSchema),
  listRecordings
);

/**
 * @route   GET /api/recordings/:id
 * @desc    Get recording session by ID
 * @access  Authenticated (with access check)
 */
router.get(
  '/:id',
  authMiddleware,
  validate(getRecordingSchema),
  canAccessRecording,
  getRecording
);

/**
 * @route   GET /api/recordings/:id/files
 * @desc    Get downloadable files for a recording with signed URLs
 * @access  Authenticated (with access check)
 */
router.get(
  '/:id/files',
  authMiddleware,
  validate(getRecordingSchema),
  canAccessRecording,
  getRecordingFiles
);

/**
 * @route   PUT /api/recordings/:id
 * @desc    Update recording session metadata
 * @access  Clinician assigned to recording or Admin
 */
router.put(
  '/:id',
  authMiddleware,
  requireClinician,
  canModifyRecording,
  validate(updateRecordingSchema),
  updateRecording
);

/**
 * @route   PATCH /api/recordings/:id/status
 * @desc    Update recording processing status
 * @access  Clinician assigned to recording or Admin
 */
router.patch(
  '/:id/status',
  authMiddleware,
  requireClinician,
  canModifyRecording,
  validate(updateRecordingStatusSchema),
  updateRecordingStatus
);

/**
 * @route   PATCH /api/recordings/:id/review
 * @desc    Update recording review status
 * @access  Clinician or Admin
 */
router.patch(
  '/:id/review',
  authMiddleware,
  requireClinician,
  validate(updateReviewStatusSchema),
  updateReviewStatus
);

/**
 * @route   DELETE /api/recordings/:id
 * @desc    Delete recording session (soft delete, permanently deleted after 30 days)
 * @access  Admin, assigned clinician, or patient who owns the recording
 */
router.delete(
  '/:id',
  authMiddleware,
  canDeleteRecording,
  validate(deleteRecordingSchema),
  deleteRecording
);

export default router;
