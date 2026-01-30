import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/rbac.middleware';
import {
  getSystemStats,
  listUsers,
  getUser,
  updateUserRole,
  toggleUserStatus,
  setAccountExpiration,
  deleteUser,
  getPendingUsers,
  approveUser,
  rejectUser,
  requestMoreInfo,
  addAdminNote,
  getUserNotes,
  getAuditLogs,
  createApiKey,
  listUserApiKeys,
  revokeApiKey,
  deleteApiKey,
  getAllApiKeys
} from '../controllers/admin.controller';
import { z } from 'zod';
import { validate } from '../utils/validation';
import { paginationSchema, userRoleSchema } from '../schemas/common.schema';

const router = Router();

// ============================================================================
// System Statistics Routes
// ============================================================================

/**
 * @route   GET /api/admin/stats
 * @desc    Get system statistics
 * @access  Admin only
 */
router.get(
  '/stats',
  authMiddleware,
  requireAdmin,
  getSystemStats
);

// ============================================================================
// User Management Routes
// ============================================================================

const listUsersSchema = z.object({
  query: paginationSchema.extend({
    role: userRoleSchema.optional(),
    isActive: z.coerce.boolean().optional(),
    search: z.string().optional()
  })
});

const getUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  })
});

const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    role: userRoleSchema
  })
});

const toggleUserStatusSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  })
});

const setAccountExpirationSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    accountExpiresAt: z.string().datetime().nullable().optional()
  })
});

/**
 * @route   GET /api/admin/users
 * @desc    List all users with pagination
 * @access  Admin only
 */
router.get(
  '/users',
  authMiddleware,
  requireAdmin,
  validate(listUsersSchema),
  listUsers
);

// Note: /users/pending must come BEFORE /users/:userId to avoid route matching issues
const getPendingUsersSchema = z.object({
  query: paginationSchema
});

/**
 * @route   GET /api/admin/users/pending
 * @desc    Get list of pending users awaiting approval
 * @access  Admin only
 */
router.get(
  '/users/pending',
  authMiddleware,
  requireAdmin,
  validate(getPendingUsersSchema),
  getPendingUsers
);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get user details
 * @access  Admin only
 */
router.get(
  '/users/:userId',
  authMiddleware,
  requireAdmin,
  validate(getUserSchema),
  getUser
);

/**
 * @route   PATCH /api/admin/users/:userId/role
 * @desc    Update user role
 * @access  Admin only
 */
router.patch(
  '/users/:userId/role',
  authMiddleware,
  requireAdmin,
  validate(updateUserRoleSchema),
  updateUserRole
);

/**
 * @route   PATCH /api/admin/users/:userId/status
 * @desc    Toggle user active status
 * @access  Admin only
 */
router.patch(
  '/users/:userId/status',
  authMiddleware,
  requireAdmin,
  validate(toggleUserStatusSchema),
  toggleUserStatus
);

/**
 * @route   PATCH /api/admin/users/:userId/expiration
 * @desc    Set account expiration date
 * @access  Admin only
 */
router.patch(
  '/users/:userId/expiration',
  authMiddleware,
  requireAdmin,
  validate(setAccountExpirationSchema),
  setAccountExpiration
);

const deleteUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  query: z.object({
    permanent: z.coerce.boolean().optional()
  })
});

/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user (soft delete by default, permanent with ?permanent=true)
 * @access  Admin only
 */
router.delete(
  '/users/:userId',
  authMiddleware,
  requireAdmin,
  validate(deleteUserSchema),
  deleteUser
);

// ============================================================================
// User Approval Workflow Routes
// ============================================================================

const approveUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    notes: z.string().optional()
  })
});

const rejectUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
    notes: z.string().optional()
  })
});

const requestMoreInfoSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    message: z.string().min(10, 'Message must be at least 10 characters'),
    fields: z.array(z.string()).optional()
  })
});

const addAdminNoteSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  body: z.object({
    content: z.string().min(5, 'Note content must be at least 5 characters'),
    isInternal: z.boolean().optional()
  })
});

const getUserNotesSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  }),
  query: z.object({
    includeInternal: z.coerce.boolean().optional()
  })
});

/**
 * @route   POST /api/admin/users/:userId/approve
 * @desc    Approve a pending user
 * @access  Admin only
 */
router.post(
  '/users/:userId/approve',
  authMiddleware,
  requireAdmin,
  validate(approveUserSchema),
  approveUser
);

/**
 * @route   POST /api/admin/users/:userId/reject
 * @desc    Reject a pending user with reason
 * @access  Admin only
 */
router.post(
  '/users/:userId/reject',
  authMiddleware,
  requireAdmin,
  validate(rejectUserSchema),
  rejectUser
);

/**
 * @route   POST /api/admin/users/:userId/request-info
 * @desc    Request more information from pending user
 * @access  Admin only
 */
router.post(
  '/users/:userId/request-info',
  authMiddleware,
  requireAdmin,
  validate(requestMoreInfoSchema),
  requestMoreInfo
);

/**
 * @route   POST /api/admin/users/:userId/notes
 * @desc    Add admin note to user
 * @access  Admin only
 */
router.post(
  '/users/:userId/notes',
  authMiddleware,
  requireAdmin,
  validate(addAdminNoteSchema),
  addAdminNote
);

/**
 * @route   GET /api/admin/users/:userId/notes
 * @desc    Get all notes for a user
 * @access  Admin only
 */
router.get(
  '/users/:userId/notes',
  authMiddleware,
  requireAdmin,
  validate(getUserNotesSchema),
  getUserNotes
);

// ============================================================================
// Audit Log Routes
// ============================================================================

const getAuditLogsSchema = z.object({
  query: paginationSchema.extend({
    userId: z.string().uuid().optional(),
    action: z.string().optional(),
    resource: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
});

/**
 * @route   GET /api/admin/audit-logs
 * @desc    Get audit logs with filtering
 * @access  Admin only
 */
router.get(
  '/audit-logs',
  authMiddleware,
  requireAdmin,
  validate(getAuditLogsSchema),
  getAuditLogs
);

// ============================================================================
// API Key Management Routes
// ============================================================================

const createApiKeySchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID'),
    name: z.string().min(1, 'API key name is required').max(100),
    permissions: z.enum(['read', 'write', 'admin']).optional(),
    expiresAt: z.string().datetime().nullable().optional()
  })
});

const listUserApiKeysSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID')
  })
});

const revokeApiKeySchema = z.object({
  params: z.object({
    keyId: z.string().uuid('Invalid API key ID')
  })
});

const deleteApiKeySchema = z.object({
  params: z.object({
    keyId: z.string().uuid('Invalid API key ID')
  })
});

const getAllApiKeysSchema = z.object({
  query: paginationSchema.extend({
    userId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional()
  })
});

/**
 * @route   GET /api/admin/api-keys
 * @desc    Get all API keys with filtering
 * @access  Admin only
 */
router.get(
  '/api-keys',
  authMiddleware,
  requireAdmin,
  validate(getAllApiKeysSchema),
  getAllApiKeys
);

/**
 * @route   POST /api/admin/api-keys
 * @desc    Create a new API key for a user
 * @access  Admin only
 */
router.post(
  '/api-keys',
  authMiddleware,
  requireAdmin,
  validate(createApiKeySchema),
  createApiKey
);

/**
 * @route   GET /api/admin/users/:userId/api-keys
 * @desc    List all API keys for a specific user
 * @access  Admin only
 */
router.get(
  '/users/:userId/api-keys',
  authMiddleware,
  requireAdmin,
  validate(listUserApiKeysSchema),
  listUserApiKeys
);

/**
 * @route   PATCH /api/admin/api-keys/:keyId/revoke
 * @desc    Revoke an API key
 * @access  Admin only
 */
router.patch(
  '/api-keys/:keyId/revoke',
  authMiddleware,
  requireAdmin,
  validate(revokeApiKeySchema),
  revokeApiKey
);

/**
 * @route   DELETE /api/admin/api-keys/:keyId
 * @desc    Permanently delete an API key
 * @access  Admin only
 */
router.delete(
  '/api-keys/:keyId',
  authMiddleware,
  requireAdmin,
  validate(deleteApiKeySchema),
  deleteApiKey
);

export default router;
