"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const stats_controller_1 = require("../controllers/stats.controller");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authMiddleware);
/**
 * @route   GET /api/stats
 * @desc    Get user dashboard statistics
 * @access  Authenticated
 */
router.get('/', stats_controller_1.getUserStats);
/**
 * @route   GET /api/stats/comparison
 * @desc    Get diagnosis-based comparison data
 * @access  Authenticated (role-based filtering)
 * @query   diagnosis - Filter by specific diagnosis or 'all'
 */
router.get('/comparison', stats_controller_1.getDiagnosisComparison);
exports.default = router;
