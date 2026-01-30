"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const system_controller_1 = require("../controllers/system.controller");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public health endpoint (no auth)
router.get('/health', system_controller_1.getSystemHealth);
// All other routes require auth + admin
router.use(auth_middleware_1.authMiddleware);
router.use(auth_middleware_1.adminMiddleware);
// Legacy endpoints (imported from admin.controller for compatibility)
router.get('/stats', admin_controller_1.getSystemStats);
router.get('/audit-logs', admin_controller_1.getAuditLogs);
// Cleanup management
router.get('/cleanup/preview', system_controller_1.previewCleanupController);
router.post('/cleanup/run', system_controller_1.runCleanupController);
router.get('/soft-deleted/stats', system_controller_1.getSoftDeletedStats);
// Admin hard delete (bypass business rules)
router.delete('/protocols/:id/hard-delete', system_controller_1.hardDeleteProtocol);
router.delete('/patients/:id/hard-delete', system_controller_1.hardDeletePatient);
router.delete('/users/:id/hard-delete', system_controller_1.hardDeleteUser);
router.delete('/projects/:id/hard-delete', system_controller_1.hardDeleteProject);
router.delete('/recordings/:id/hard-delete', system_controller_1.hardDeleteRecording);
exports.default = router;
