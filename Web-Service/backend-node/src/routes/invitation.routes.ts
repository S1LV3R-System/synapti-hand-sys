import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  sendInvitation,
  getMyInvitations,
  acceptInvitation,
  rejectInvitation,
  getProjectInvitations,
  cancelInvitation
} from '../controllers/invitation.controller';
import { z } from 'zod';
import { validate } from '../utils/validation';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Validation schemas
const sendInvitationSchema = z.object({
  params: z.object({
    projectId: z.string().uuid('Invalid project ID')
  }),
  body: z.object({
    email: z.string().email('Invalid email address'),
    role: z.enum(['member', 'viewer']).optional().default('member')
  })
});

const invitationIdSchema = z.object({
  params: z.object({
    invitationId: z.string().uuid('Invalid invitation ID')
  })
});

const projectIdSchema = z.object({
  params: z.object({
    projectId: z.string().uuid('Invalid project ID')
  })
});

/**
 * @route   GET /api/invitations/me
 * @desc    Get pending invitations for current user
 * @access  Authenticated
 */
router.get('/me', getMyInvitations);

/**
 * @route   POST /api/invitations/project/:projectId
 * @desc    Send an invitation to join a project
 * @access  Project owner or admin
 */
router.post(
  '/project/:projectId',
  validate(sendInvitationSchema),
  sendInvitation
);

/**
 * @route   GET /api/invitations/project/:projectId
 * @desc    Get all invitations for a project
 * @access  Project owner or admin
 */
router.get(
  '/project/:projectId',
  validate(projectIdSchema),
  getProjectInvitations
);

/**
 * @route   POST /api/invitations/:invitationId/accept
 * @desc    Accept a project invitation
 * @access  Invited user
 */
router.post(
  '/:invitationId/accept',
  validate(invitationIdSchema),
  acceptInvitation
);

/**
 * @route   POST /api/invitations/:invitationId/reject
 * @desc    Reject a project invitation
 * @access  Invited user
 */
router.post(
  '/:invitationId/reject',
  validate(invitationIdSchema),
  rejectInvitation
);

/**
 * @route   DELETE /api/invitations/:invitationId
 * @desc    Cancel a pending invitation
 * @access  Project owner or original inviter
 */
router.delete(
  '/:invitationId',
  validate(invitationIdSchema),
  cancelInvitation
);

export default router;
