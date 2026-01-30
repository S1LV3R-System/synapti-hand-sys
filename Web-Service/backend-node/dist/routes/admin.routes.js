"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const admin_controller_1 = require("../controllers/admin.controller");
const zod_1 = require("zod");
const validation_1 = require("../utils/validation");
const common_schema_1 = require("../schemas/common.schema");
const router = (0, express_1.Router)();
// ============================================================================
// System Statistics Routes
// ============================================================================
/**
 * @route   GET /api/admin/stats
 * @desc    Get system statistics
 * @access  Admin only
 */
router.get('/stats', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, admin_controller_1.getSystemStats);
// ============================================================================
// User Management Routes
// ============================================================================
const listUsersSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema.extend({
        role: common_schema_1.userRoleSchema.optional(),
        isActive: zod_1.z.coerce.boolean().optional(),
        search: zod_1.z.string().optional()
    })
});
const getUserSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    })
});
const updateUserRoleSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        role: common_schema_1.userRoleSchema
    })
});
const toggleUserStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    })
});
const setAccountExpirationSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        accountExpiresAt: zod_1.z.string().datetime().nullable().optional()
    })
});
/**
 * @route   GET /api/admin/users
 * @desc    List all users with pagination
 * @access  Admin only
 */
router.get('/users', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(listUsersSchema), admin_controller_1.listUsers);
// Note: /users/pending must come BEFORE /users/:userId to avoid route matching issues
const getPendingUsersSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema
});
/**
 * @route   GET /api/admin/users/pending
 * @desc    Get list of pending users awaiting approval
 * @access  Admin only
 */
router.get('/users/pending', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(getPendingUsersSchema), admin_controller_1.getPendingUsers);
/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get user details
 * @access  Admin only
 */
router.get('/users/:userId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(getUserSchema), admin_controller_1.getUser);
/**
 * @route   PATCH /api/admin/users/:userId/role
 * @desc    Update user role
 * @access  Admin only
 */
router.patch('/users/:userId/role', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(updateUserRoleSchema), admin_controller_1.updateUserRole);
/**
 * @route   PATCH /api/admin/users/:userId/status
 * @desc    Toggle user active status
 * @access  Admin only
 */
router.patch('/users/:userId/status', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(toggleUserStatusSchema), admin_controller_1.toggleUserStatus);
/**
 * @route   PATCH /api/admin/users/:userId/expiration
 * @desc    Set account expiration date
 * @access  Admin only
 */
router.patch('/users/:userId/expiration', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(setAccountExpirationSchema), admin_controller_1.setAccountExpiration);
const deleteUserSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    query: zod_1.z.object({
        permanent: zod_1.z.coerce.boolean().optional()
    })
});
/**
 * @route   DELETE /api/admin/users/:userId
 * @desc    Delete a user (soft delete by default, permanent with ?permanent=true)
 * @access  Admin only
 */
router.delete('/users/:userId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(deleteUserSchema), admin_controller_1.deleteUser);
// ============================================================================
// User Approval Workflow Routes
// ============================================================================
const approveUserSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        notes: zod_1.z.string().optional()
    })
});
const rejectUserSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        reason: zod_1.z.string().min(10, 'Rejection reason must be at least 10 characters'),
        notes: zod_1.z.string().optional()
    })
});
const requestMoreInfoSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        message: zod_1.z.string().min(10, 'Message must be at least 10 characters'),
        fields: zod_1.z.array(zod_1.z.string()).optional()
    })
});
const addAdminNoteSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    body: zod_1.z.object({
        content: zod_1.z.string().min(5, 'Note content must be at least 5 characters'),
        isInternal: zod_1.z.boolean().optional()
    })
});
const getUserNotesSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    }),
    query: zod_1.z.object({
        includeInternal: zod_1.z.coerce.boolean().optional()
    })
});
/**
 * @route   POST /api/admin/users/:userId/approve
 * @desc    Approve a pending user
 * @access  Admin only
 */
router.post('/users/:userId/approve', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(approveUserSchema), admin_controller_1.approveUser);
/**
 * @route   POST /api/admin/users/:userId/reject
 * @desc    Reject a pending user with reason
 * @access  Admin only
 */
router.post('/users/:userId/reject', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(rejectUserSchema), admin_controller_1.rejectUser);
/**
 * @route   POST /api/admin/users/:userId/request-info
 * @desc    Request more information from pending user
 * @access  Admin only
 */
router.post('/users/:userId/request-info', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(requestMoreInfoSchema), admin_controller_1.requestMoreInfo);
/**
 * @route   POST /api/admin/users/:userId/notes
 * @desc    Add admin note to user
 * @access  Admin only
 */
router.post('/users/:userId/notes', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(addAdminNoteSchema), admin_controller_1.addAdminNote);
/**
 * @route   GET /api/admin/users/:userId/notes
 * @desc    Get all notes for a user
 * @access  Admin only
 */
router.get('/users/:userId/notes', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(getUserNotesSchema), admin_controller_1.getUserNotes);
// ============================================================================
// Audit Log Routes
// ============================================================================
const getAuditLogsSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema.extend({
        userId: zod_1.z.string().uuid().optional(),
        action: zod_1.z.string().optional(),
        resource: zod_1.z.string().optional(),
        startDate: zod_1.z.string().datetime().optional(),
        endDate: zod_1.z.string().datetime().optional()
    })
});
/**
 * @route   GET /api/admin/audit-logs
 * @desc    Get audit logs with filtering
 * @access  Admin only
 */
router.get('/audit-logs', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(getAuditLogsSchema), admin_controller_1.getAuditLogs);
// ============================================================================
// API Key Management Routes
// ============================================================================
const createApiKeySchema = zod_1.z.object({
    body: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID'),
        name: zod_1.z.string().min(1, 'API key name is required').max(100),
        permissions: zod_1.z.enum(['read', 'write', 'admin']).optional(),
        expiresAt: zod_1.z.string().datetime().nullable().optional()
    })
});
const listUserApiKeysSchema = zod_1.z.object({
    params: zod_1.z.object({
        userId: zod_1.z.string().uuid('Invalid user ID')
    })
});
const revokeApiKeySchema = zod_1.z.object({
    params: zod_1.z.object({
        keyId: zod_1.z.string().uuid('Invalid API key ID')
    })
});
const deleteApiKeySchema = zod_1.z.object({
    params: zod_1.z.object({
        keyId: zod_1.z.string().uuid('Invalid API key ID')
    })
});
const getAllApiKeysSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema.extend({
        userId: zod_1.z.string().uuid().optional(),
        isActive: zod_1.z.coerce.boolean().optional()
    })
});
/**
 * @route   GET /api/admin/api-keys
 * @desc    Get all API keys with filtering
 * @access  Admin only
 */
router.get('/api-keys', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(getAllApiKeysSchema), admin_controller_1.getAllApiKeys);
/**
 * @route   POST /api/admin/api-keys
 * @desc    Create a new API key for a user
 * @access  Admin only
 */
router.post('/api-keys', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(createApiKeySchema), admin_controller_1.createApiKey);
/**
 * @route   GET /api/admin/users/:userId/api-keys
 * @desc    List all API keys for a specific user
 * @access  Admin only
 */
router.get('/users/:userId/api-keys', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(listUserApiKeysSchema), admin_controller_1.listUserApiKeys);
/**
 * @route   PATCH /api/admin/api-keys/:keyId/revoke
 * @desc    Revoke an API key
 * @access  Admin only
 */
router.patch('/api-keys/:keyId/revoke', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(revokeApiKeySchema), admin_controller_1.revokeApiKey);
/**
 * @route   DELETE /api/admin/api-keys/:keyId
 * @desc    Permanently delete an API key
 * @access  Admin only
 */
router.delete('/api-keys/:keyId', auth_middleware_1.authMiddleware, rbac_middleware_1.requireAdmin, (0, validation_1.validate)(deleteApiKeySchema), admin_controller_1.deleteApiKey);
exports.default = router;
