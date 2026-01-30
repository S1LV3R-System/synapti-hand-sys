import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { canAccessProtocol, canCreateProtocol } from '../middleware/rbac.middleware';
import {
  createProtocol,
  listProtocols,
  getProtocol,
  updateProtocol,
  deleteProtocol
} from '../controllers/protocols.controller';
import { validate } from '../utils/validation';
import {
  createProtocolSchema,
  updateProtocolSchema,
  listProtocolsSchema,
  getProtocolSchema,
  deleteProtocolSchema
} from '../schemas/protocols.schema';

const router = Router();

// ============================================================================
// Protocol Routes
// ============================================================================

/**
 * @route   POST /api/protocols
 * @desc    Create new protocol
 * @access  Researcher (custom protocols) or Admin (public protocols visible to all)
 *          Note: Clinicians can only VIEW protocols, not create them
 */
router.post(
  '/',
  authMiddleware,
  canCreateProtocol,
  validate(createProtocolSchema),
  createProtocol
);

/**
 * @route   GET /api/protocols
 * @desc    List protocols with filtering
 * @access  Authenticated
 */
router.get(
  '/',
  authMiddleware,
  validate(listProtocolsSchema),
  listProtocols
);

/**
 * @route   GET /api/protocols/:id
 * @desc    Get protocol by ID
 * @access  Authenticated (with access check)
 */
router.get(
  '/:id',
  authMiddleware,
  validate(getProtocolSchema),
  canAccessProtocol,
  getProtocol
);

/**
 * @route   PUT /api/protocols/:id
 * @desc    Update protocol
 * @access  Creator (Researcher for own protocols) or Admin
 */
router.put(
  '/:id',
  authMiddleware,
  canCreateProtocol,
  canAccessProtocol,
  validate(updateProtocolSchema),
  updateProtocol
);

/**
 * @route   DELETE /api/protocols/:id
 * @desc    Delete protocol (soft delete by default)
 * @access  Creator (Researcher for own protocols) or Admin
 */
router.delete(
  '/:id',
  authMiddleware,
  canCreateProtocol,
  canAccessProtocol,
  validate(deleteProtocolSchema),
  deleteProtocol
);

export default router;
