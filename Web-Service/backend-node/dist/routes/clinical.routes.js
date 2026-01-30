"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const clinical_controller_1 = require("../controllers/clinical.controller");
const validation_1 = require("../utils/validation");
const clinical_schema_1 = require("../schemas/clinical.schema");
const router = (0, express_1.Router)();
// ============================================================================
// Clinical Analysis Routes
// ============================================================================
/**
 * @route   GET /api/clinical/recordings/:recordingId/analysis
 * @desc    Get clinical analysis for recording
 * @access  Authenticated (with access check)
 */
router.get('/recordings/:recordingId/analysis', auth_middleware_1.authMiddleware, (0, validation_1.validate)(clinical_schema_1.getAnalysisSchema), rbac_middleware_1.canAccessRecording, clinical_controller_1.getAnalysis);
/**
 * @route   POST /api/clinical/recordings/:recordingId/analysis
 * @desc    Create or update clinical analysis
 * @access  Clinician or Admin
 */
router.post('/recordings/:recordingId/analysis', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, (0, validation_1.validate)(clinical_schema_1.createAnalysisSchema), clinical_controller_1.createAnalysis);
/**
 * @route   PUT /api/clinical/analysis/:analysisId
 * @desc    Update clinical analysis
 * @access  Clinician or Admin
 */
router.put('/analysis/:analysisId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, (0, validation_1.validate)(clinical_schema_1.updateAnalysisSchema), clinical_controller_1.updateAnalysis);
// ============================================================================
// Protocol-Based Movement Analysis Routes
// ============================================================================
/**
 * @route   POST /api/clinical/recordings/:recordingId/analyze-protocol
 * @desc    Trigger protocol-based movement analysis for a recording
 * @access  Clinician or Admin
 */
router.post('/recordings/:recordingId/analyze-protocol', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, rbac_middleware_1.canAccessRecording, clinical_controller_1.analyzeWithProtocol);
/**
 * @route   GET /api/clinical/recordings/:recordingId/movement-analysis
 * @desc    Get movement-specific analysis results for a recording
 * @access  Authenticated (with access check)
 */
router.get('/recordings/:recordingId/movement-analysis', auth_middleware_1.authMiddleware, rbac_middleware_1.canAccessRecording, clinical_controller_1.getMovementAnalysisResults);
// ============================================================================
// Clinical Annotation Routes
// ============================================================================
/**
 * @route   GET /api/clinical/recordings/:recordingId/annotations
 * @desc    Get annotations for recording
 * @access  Authenticated (with access check)
 */
router.get('/recordings/:recordingId/annotations', auth_middleware_1.authMiddleware, (0, validation_1.validate)(clinical_schema_1.listAnnotationsSchema), rbac_middleware_1.canAccessRecording, clinical_controller_1.listAnnotations);
/**
 * @route   POST /api/clinical/recordings/:recordingId/annotations
 * @desc    Add annotation to recording
 * @access  Clinician or Admin
 */
router.post('/recordings/:recordingId/annotations', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, (0, validation_1.validate)(clinical_schema_1.createAnnotationSchema), clinical_controller_1.createAnnotation);
/**
 * @route   PUT /api/clinical/annotations/:annotationId
 * @desc    Update annotation
 * @access  Creator or Admin
 */
router.put('/annotations/:annotationId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, (0, validation_1.validate)(clinical_schema_1.updateAnnotationSchema), clinical_controller_1.updateAnnotation);
/**
 * @route   DELETE /api/clinical/annotations/:annotationId
 * @desc    Delete annotation
 * @access  Creator or Admin
 */
router.delete('/annotations/:annotationId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireClinician, clinical_controller_1.deleteAnnotation);
// ============================================================================
// Recording Comparison Routes
// Note: ONLY Researchers (and Admins) have access to comparisons table
// Clinicians do NOT have access to comparisons
// ============================================================================
/**
 * @route   POST /api/clinical/comparisons
 * @desc    Create recording comparison
 * @access  Researcher or Admin only (Clinicians cannot access comparisons)
 */
router.post('/comparisons', auth_middleware_1.authMiddleware, rbac_middleware_1.requireResearcher, (0, validation_1.validate)(clinical_schema_1.createComparisonSchema), clinical_controller_1.createComparison);
/**
 * @route   GET /api/clinical/comparisons/:comparisonId
 * @desc    Get comparison results
 * @access  Researcher or Admin only (Clinicians cannot access comparisons)
 */
router.get('/comparisons/:comparisonId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireResearcher, (0, validation_1.validate)(clinical_schema_1.getComparisonSchema), clinical_controller_1.getComparison);
/**
 * @route   GET /api/clinical/comparisons
 * @desc    List comparisons with filtering
 * @access  Researcher or Admin only (Clinicians cannot access comparisons)
 */
router.get('/comparisons', auth_middleware_1.authMiddleware, rbac_middleware_1.requireResearcher, (0, validation_1.validate)(clinical_schema_1.listComparisonsSchema), clinical_controller_1.listComparisons);
exports.default = router;
