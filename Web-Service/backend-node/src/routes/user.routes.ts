import { Router } from 'express';
import { searchUsersByEmail, getUserById } from '../controllers/user.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../utils/validation';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const searchUsersSchema = z.object({
  query: z.object({
    email: z.string().min(1, 'Email parameter is required'),
  }),
});

const getUserByIdSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
});

/**
 * @route   GET /api/users/search
 * @desc    Search users by email (for adding to projects)
 * @access  Authenticated users
 */
router.get('/search', validate(searchUsersSchema), searchUsersByEmail);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Authenticated users
 */
router.get('/:id', validate(getUserByIdSchema), getUserById);

export default router;
