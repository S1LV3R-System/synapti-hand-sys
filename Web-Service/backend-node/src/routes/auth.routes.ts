import { Router } from 'express';
import {
  register,
  login,
  logout,
  getCurrentUser,
  updateProfile,
  changePassword,
  getPendingUsers,
  approveUser,
  verifyEmail,
  resendVerificationEmail,
  requestPasswordReset
} from '../controllers/auth.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Public routes with rate limiting
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);

// Email verification routes (public) with rate limiting
router.post('/verify-email', authRateLimiter, verifyEmail);
router.post('/resend-verification', authRateLimiter, resendVerificationEmail);
router.post('/forgot-password', authRateLimiter, requestPasswordReset);

// Authenticated routes
router.post('/logout', authMiddleware, logout);
router.get('/me', authMiddleware, getCurrentUser);
router.put('/profile', authMiddleware, updateProfile);
router.put('/change-password', authMiddleware, changePassword);

// Admin routes
router.get('/pending-users', authMiddleware, adminMiddleware, getPendingUsers);
router.post('/users/:userId/approve', authMiddleware, adminMiddleware, approveUser);

export default router;
