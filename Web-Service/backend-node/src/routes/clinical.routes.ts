import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  requireClinician,
  requireResearcher,
  canAccessRecording
} from '../middleware/rbac.middleware';
import {
  createAnalysis,
  getAnalysis,
  updateAnalysis,
  createAnnotation,
  listAnnotations,
  updateAnnotation,
  deleteAnnotation,
  createComparison,
  getComparison,
  listComparisons,
  analyzeWithProtocol,
  getMovementAnalysisResults,
  getLSTMEvents,
  getComprehensiveAnalysis
} from '../controllers/clinical.controller';
import { validate } from '../utils/validation';
import {
  createAnalysisSchema,
  updateAnalysisSchema,
  getAnalysisSchema,
  createAnnotationSchema,
  updateAnnotationSchema,
  listAnnotationsSchema,
  createComparisonSchema,
  getComparisonSchema,
  listComparisonsSchema
} from '../schemas/clinical.schema';

const router = Router();

// ============================================================================
// Clinical Analysis Routes
// ============================================================================

/**
 * @route   GET /api/clinical/recordings/:recordingId/analysis
 * @desc    Get clinical analysis for recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/recordings/:recordingId/analysis',
  authMiddleware,
  validate(getAnalysisSchema),
  canAccessRecording,
  getAnalysis
);

/**
 * @route   POST /api/clinical/recordings/:recordingId/analysis
 * @desc    Create or update clinical analysis
 * @access  Clinician or Admin
 */
router.post(
  '/recordings/:recordingId/analysis',
  authMiddleware,
  requireClinician,
  validate(createAnalysisSchema),
  createAnalysis
);

/**
 * @route   PUT /api/clinical/analysis/:analysisId
 * @desc    Update clinical analysis
 * @access  Clinician or Admin
 */
router.put(
  '/analysis/:analysisId',
  authMiddleware,
  requireClinician,
  validate(updateAnalysisSchema),
  updateAnalysis
);

// ============================================================================
// Protocol-Based Movement Analysis Routes
// ============================================================================

/**
 * @route   POST /api/clinical/recordings/:recordingId/analyze-protocol
 * @desc    Trigger protocol-based movement analysis for a recording
 * @access  Clinician or Admin
 */
router.post(
  '/recordings/:recordingId/analyze-protocol',
  authMiddleware,
  requireClinician,
  canAccessRecording,
  analyzeWithProtocol
);

/**
 * @route   GET /api/clinical/recordings/:recordingId/movement-analysis
 * @desc    Get movement-specific analysis results for a recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/recordings/:recordingId/movement-analysis',
  authMiddleware,
  canAccessRecording,
  getMovementAnalysisResults
);

/**
 * @route   GET /api/clinical/recordings/:recordingId/lstm-events
 * @desc    Get LSTM event detection results for a recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/recordings/:recordingId/lstm-events',
  authMiddleware,
  canAccessRecording,
  getLSTMEvents
);

/**
 * @route   GET /api/clinical/recordings/:recordingId/comprehensive-analysis
 * @desc    Get all analysis data combined for a recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/recordings/:recordingId/comprehensive-analysis',
  authMiddleware,
  canAccessRecording,
  getComprehensiveAnalysis
);

// ============================================================================
// Clinical Annotation Routes
// ============================================================================

/**
 * @route   GET /api/clinical/recordings/:recordingId/annotations
 * @desc    Get annotations for recording
 * @access  Authenticated (with access check)
 */
router.get(
  '/recordings/:recordingId/annotations',
  authMiddleware,
  validate(listAnnotationsSchema),
  canAccessRecording,
  listAnnotations
);

/**
 * @route   POST /api/clinical/recordings/:recordingId/annotations
 * @desc    Add annotation to recording
 * @access  Clinician or Admin
 */
router.post(
  '/recordings/:recordingId/annotations',
  authMiddleware,
  requireClinician,
  validate(createAnnotationSchema),
  createAnnotation
);

/**
 * @route   PUT /api/clinical/annotations/:annotationId
 * @desc    Update annotation
 * @access  Creator or Admin
 */
router.put(
  '/annotations/:annotationId',
  authMiddleware,
  requireClinician,
  validate(updateAnnotationSchema),
  updateAnnotation
);

/**
 * @route   DELETE /api/clinical/annotations/:annotationId
 * @desc    Delete annotation
 * @access  Creator or Admin
 */
router.delete(
  '/annotations/:annotationId',
  authMiddleware,
  requireClinician,
  deleteAnnotation
);

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
router.post(
  '/comparisons',
  authMiddleware,
  requireResearcher,
  validate(createComparisonSchema),
  createComparison
);

/**
 * @route   GET /api/clinical/comparisons/:comparisonId
 * @desc    Get comparison results
 * @access  Researcher or Admin only (Clinicians cannot access comparisons)
 */
router.get(
  '/comparisons/:comparisonId',
  authMiddleware,
  requireResearcher,
  validate(getComparisonSchema),
  getComparison
);

/**
 * @route   GET /api/clinical/comparisons
 * @desc    List comparisons with filtering
 * @access  Researcher or Admin only (Clinicians cannot access comparisons)
 */
router.get(
  '/comparisons',
  authMiddleware,
  requireResearcher,
  validate(listComparisonsSchema),
  listComparisons
);

export default router;
