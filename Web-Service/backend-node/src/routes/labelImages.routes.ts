import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireClinician } from '../middleware/rbac.middleware';
import {
  createLabelImage,
  listLabelImages,
  getLabelImage,
  updateLabelImage,
  deleteLabelImage,
  markImageProcessed
} from '../controllers/labelImages.controller';

const router = Router();

// ============================================================================
// Label Image Routes
// ============================================================================

/**
 * @route   POST /api/recordings/:recordingId/label-images
 * @desc    Create a new label image for a recording
 * @access  Authenticated (clinician, patient, or admin)
 */
router.post(
  '/:recordingId/label-images',
  authMiddleware,
  createLabelImage
);

/**
 * @route   GET /api/recordings/:recordingId/label-images
 * @desc    List all label images for a recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/:recordingId/label-images',
  authMiddleware,
  listLabelImages
);

/**
 * @route   GET /api/recordings/:recordingId/label-images/:imageId
 * @desc    Get a specific label image by ID
 * @access  Authenticated (with access check)
 */
router.get(
  '/:recordingId/label-images/:imageId',
  authMiddleware,
  getLabelImage
);

/**
 * @route   PUT /api/recordings/:recordingId/label-images/:imageId
 * @desc    Update label image metadata (title, description, tags, etc.)
 * @access  Clinician or Admin
 */
router.put(
  '/:recordingId/label-images/:imageId',
  authMiddleware,
  requireClinician,
  updateLabelImage
);

/**
 * @route   DELETE /api/recordings/:recordingId/label-images/:imageId
 * @desc    Delete a label image (soft delete)
 * @access  Admin or assigned clinician
 */
router.delete(
  '/:recordingId/label-images/:imageId',
  authMiddleware,
  requireClinician,
  deleteLabelImage
);

/**
 * @route   PATCH /api/recordings/:recordingId/label-images/:imageId/processed
 * @desc    Mark image as processed with overlays applied
 * @access  System/Internal (typically called by processing worker)
 */
router.patch(
  '/:recordingId/label-images/:imageId/processed',
  authMiddleware,
  requireClinician,
  markImageProcessed
);

export default router;
