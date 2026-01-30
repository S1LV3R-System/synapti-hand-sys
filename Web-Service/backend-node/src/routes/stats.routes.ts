import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getUserStats, getDiagnosisComparison } from '../controllers/stats.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/stats
 * @desc    Get user dashboard statistics
 * @access  Authenticated
 */
router.get('/', getUserStats);

/**
 * @route   GET /api/stats/comparison
 * @desc    Get diagnosis-based comparison data
 * @access  Authenticated (role-based filtering)
 * @query   diagnosis - Filter by specific diagnosis or 'all'
 */
router.get('/comparison', getDiagnosisComparison);

export default router;
