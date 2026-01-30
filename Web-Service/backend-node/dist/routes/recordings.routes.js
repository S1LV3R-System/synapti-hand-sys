"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const recordings_controller_1 = require("../controllers/recordings.controller");
const validation_1 = require("../utils/validation");
const recordings_schema_1 = require("../schemas/recordings.schema");
const router = (0, express_1.Router)();
// ============================================================================
// Recording Session Routes
// ============================================================================
/**
 * @route   POST /api/recordings
 * @desc    Create new recording session
 * @access  Authenticated
 */
router.post('/', auth_middleware_1.authMiddleware, (0, validation_1.validate)(recordings_schema_1.createRecordingSchema), recordings_controller_1.createRecording);
/**
 * @route   GET /api/recordings
 * @desc    List recording sessions with filtering
 * @access  Authenticated (role-based filtering)
 */
router.get('/', auth_middleware_1.authMiddleware, (0, validation_1.validate)(recordings_schema_1.listRecordingsSchema), recordings_controller_1.listRecordings);
/**
 * @route   GET /api/recordings/:id
 * @desc    Get recording session by ID
 * @access  Authenticated (with access check)
 */
router.get('/:id', auth_middleware_1.authMiddleware, (0, validation_1.validate)(recordings_schema_1.getRecordingSchema), rbac_middleware_1.canAccessRecording, recordings_controller_1.getRecording);
/**
 * @route   GET /api/recordings/:id/files
 * @desc    Get downloadable files for a recording with signed URLs
 * @access  Authenticated (with access check)
 */
router.get('/:id/files', auth_middleware_1.authMiddleware, (0, validation_1.validate)(recordings_schema_1.getRecordingSchema), rbac_middleware_1.canAccessRecording, recordings_controller_1.getRecordingFiles);
/**
 * @route   PUT /api/recordings/:id
 * @desc    Update recording session metadata
 * @access  Clinician assigned to recording or Admin
 */
router.put('/:id', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, rbac_middleware_1.canModifyRecording, (0, validation_1.validate)(recordings_schema_1.updateRecordingSchema), recordings_controller_1.updateRecording);
/**
 * @route   PATCH /api/recordings/:id/status
 * @desc    Update recording processing status
 * @access  Clinician assigned to recording or Admin
 */
router.patch('/:id/status', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, rbac_middleware_1.canModifyRecording, (0, validation_1.validate)(recordings_schema_1.updateRecordingStatusSchema), recordings_controller_1.updateRecordingStatus);
/**
 * @route   PATCH /api/recordings/:id/review
 * @desc    Update recording review status
 * @access  Clinician or Admin
 */
router.patch('/:id/review', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, (0, validation_1.validate)(recordings_schema_1.updateReviewStatusSchema), recordings_controller_1.updateReviewStatus);
/**
 * @route   DELETE /api/recordings/:id
 * @desc    Delete recording session (soft delete, permanently deleted after 30 days)
 * @access  Admin, assigned clinician, or patient who owns the recording
 */
router.delete('/:id', auth_middleware_1.authMiddleware, rbac_middleware_1.canDeleteRecording, (0, validation_1.validate)(recordings_schema_1.deleteRecordingSchema), recordings_controller_1.deleteRecording);
exports.default = router;
