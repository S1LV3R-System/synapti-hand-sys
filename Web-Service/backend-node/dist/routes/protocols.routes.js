"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const protocols_controller_1 = require("../controllers/protocols.controller");
const validation_1 = require("../utils/validation");
const protocols_schema_1 = require("../schemas/protocols.schema");
const router = (0, express_1.Router)();
// ============================================================================
// Protocol Routes
// ============================================================================
/**
 * @route   POST /api/protocols
 * @desc    Create new protocol
 * @access  Researcher (custom protocols) or Admin (public protocols visible to all)
 *          Note: Clinicians can only VIEW protocols, not create them
 */
router.post('/', auth_middleware_1.authMiddleware, rbac_middleware_1.canCreateProtocol, (0, validation_1.validate)(protocols_schema_1.createProtocolSchema), protocols_controller_1.createProtocol);
/**
 * @route   GET /api/protocols
 * @desc    List protocols with filtering
 * @access  Authenticated
 */
router.get('/', auth_middleware_1.authMiddleware, (0, validation_1.validate)(protocols_schema_1.listProtocolsSchema), protocols_controller_1.listProtocols);
/**
 * @route   GET /api/protocols/:id
 * @desc    Get protocol by ID
 * @access  Authenticated (with access check)
 */
router.get('/:id', auth_middleware_1.authMiddleware, (0, validation_1.validate)(protocols_schema_1.getProtocolSchema), rbac_middleware_1.canAccessProtocol, protocols_controller_1.getProtocol);
/**
 * @route   PUT /api/protocols/:id
 * @desc    Update protocol
 * @access  Creator (Researcher for own protocols) or Admin
 */
router.put('/:id', auth_middleware_1.authMiddleware, rbac_middleware_1.canCreateProtocol, rbac_middleware_1.canAccessProtocol, (0, validation_1.validate)(protocols_schema_1.updateProtocolSchema), protocols_controller_1.updateProtocol);
/**
 * @route   DELETE /api/protocols/:id
 * @desc    Delete protocol (soft delete by default)
 * @access  Creator (Researcher for own protocols) or Admin
 */
router.delete('/:id', auth_middleware_1.authMiddleware, rbac_middleware_1.canCreateProtocol, rbac_middleware_1.canAccessProtocol, (0, validation_1.validate)(protocols_schema_1.deleteProtocolSchema), protocols_controller_1.deleteProtocol);
exports.default = router;
