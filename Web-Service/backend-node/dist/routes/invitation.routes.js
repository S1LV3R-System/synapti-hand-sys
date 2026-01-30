"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const invitation_controller_1 = require("../controllers/invitation.controller");
const zod_1 = require("zod");
const validation_1 = require("../utils/validation");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_middleware_1.authMiddleware);
// Validation schemas
const sendInvitationSchema = zod_1.z.object({
    params: zod_1.z.object({
        projectId: zod_1.z.string().uuid('Invalid project ID')
    }),
    body: zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
        role: zod_1.z.enum(['member', 'viewer']).optional().default('member')
    })
});
const invitationIdSchema = zod_1.z.object({
    params: zod_1.z.object({
        invitationId: zod_1.z.string().uuid('Invalid invitation ID')
    })
});
const projectIdSchema = zod_1.z.object({
    params: zod_1.z.object({
        projectId: zod_1.z.string().uuid('Invalid project ID')
    })
});
/**
 * @route   GET /api/invitations/me
 * @desc    Get pending invitations for current user
 * @access  Authenticated
 */
router.get('/me', invitation_controller_1.getMyInvitations);
/**
 * @route   POST /api/invitations/project/:projectId
 * @desc    Send an invitation to join a project
 * @access  Project owner or admin
 */
router.post('/project/:projectId', (0, validation_1.validate)(sendInvitationSchema), invitation_controller_1.sendInvitation);
/**
 * @route   GET /api/invitations/project/:projectId
 * @desc    Get all invitations for a project
 * @access  Project owner or admin
 */
router.get('/project/:projectId', (0, validation_1.validate)(projectIdSchema), invitation_controller_1.getProjectInvitations);
/**
 * @route   POST /api/invitations/:invitationId/accept
 * @desc    Accept a project invitation
 * @access  Invited user
 */
router.post('/:invitationId/accept', (0, validation_1.validate)(invitationIdSchema), invitation_controller_1.acceptInvitation);
/**
 * @route   POST /api/invitations/:invitationId/reject
 * @desc    Reject a project invitation
 * @access  Invited user
 */
router.post('/:invitationId/reject', (0, validation_1.validate)(invitationIdSchema), invitation_controller_1.rejectInvitation);
/**
 * @route   DELETE /api/invitations/:invitationId
 * @desc    Cancel a pending invitation
 * @access  Project owner or original inviter
 */
router.delete('/:invitationId', (0, validation_1.validate)(invitationIdSchema), invitation_controller_1.cancelInvitation);
exports.default = router;
