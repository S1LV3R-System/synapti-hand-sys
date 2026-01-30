"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public routes
router.post('/register', auth_controller_1.register);
router.post('/login', auth_controller_1.login);
// Email verification routes (public)
router.post('/verify-email', auth_controller_1.verifyEmail);
router.post('/resend-verification', auth_controller_1.resendVerificationEmail);
router.post('/forgot-password', auth_controller_1.requestPasswordReset);
// Authenticated routes
router.post('/logout', auth_middleware_1.authMiddleware, auth_controller_1.logout);
router.get('/me', auth_middleware_1.authMiddleware, auth_controller_1.getCurrentUser);
router.put('/profile', auth_middleware_1.authMiddleware, auth_controller_1.updateProfile);
router.put('/change-password', auth_middleware_1.authMiddleware, auth_controller_1.changePassword);
// Admin routes
router.get('/pending-users', auth_middleware_1.authMiddleware, auth_middleware_1.adminMiddleware, auth_controller_1.getPendingUsers);
router.post('/users/:userId/approve', auth_middleware_1.authMiddleware, auth_middleware_1.adminMiddleware, auth_controller_1.approveUser);
exports.default = router;
