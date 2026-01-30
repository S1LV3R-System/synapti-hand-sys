"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const labelImages_controller_1 = require("../controllers/labelImages.controller");
const router = (0, express_1.Router)();
// ============================================================================
// Label Image Routes
// ============================================================================
/**
 * @route   POST /api/recordings/:recordingId/label-images
 * @desc    Create a new label image for a recording
 * @access  Authenticated (clinician, patient, or admin)
 */
router.post('/:recordingId/label-images', auth_middleware_1.authMiddleware, labelImages_controller_1.createLabelImage);
/**
 * @route   GET /api/recordings/:recordingId/label-images
 * @desc    List all label images for a recording
 * @access  Authenticated (with access check)
 */
router.get('/:recordingId/label-images', auth_middleware_1.authMiddleware, labelImages_controller_1.listLabelImages);
/**
 * @route   GET /api/recordings/:recordingId/label-images/:imageId
 * @desc    Get a specific label image by ID
 * @access  Authenticated (with access check)
 */
router.get('/:recordingId/label-images/:imageId', auth_middleware_1.authMiddleware, labelImages_controller_1.getLabelImage);
/**
 * @route   PUT /api/recordings/:recordingId/label-images/:imageId
 * @desc    Update label image metadata (title, description, tags, etc.)
 * @access  Clinician or Admin
 */
router.put('/:recordingId/label-images/:imageId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, labelImages_controller_1.updateLabelImage);
/**
 * @route   DELETE /api/recordings/:recordingId/label-images/:imageId
 * @desc    Delete a label image (soft delete)
 * @access  Admin or assigned clinician
 */
router.delete('/:recordingId/label-images/:imageId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, labelImages_controller_1.deleteLabelImage);
/**
 * @route   PATCH /api/recordings/:recordingId/label-images/:imageId/processed
 * @desc    Mark image as processed with overlays applied
 * @access  System/Internal (typically called by processing worker)
 */
router.patch('/:recordingId/label-images/:imageId/processed', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, labelImages_controller_1.markImageProcessed);
exports.default = router;
