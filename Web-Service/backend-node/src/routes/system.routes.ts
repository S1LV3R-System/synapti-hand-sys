import { Router } from 'express';
import {
  // New cleanup endpoints
  previewCleanupController,
  runCleanupController,
  getSoftDeletedStats,
  getSystemHealth,
  // Admin hard delete endpoints
  hardDeleteProtocol,
  hardDeletePatient,
  hardDeleteUser,
  hardDeleteProject,
  hardDeleteRecording
} from '../controllers/system.controller';
import { getSystemStats, getAuditLogs } from '../controllers/admin.controller';
import { authMiddleware, adminMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Public health endpoint (no auth)
router.get('/health', getSystemHealth);

// All other routes require auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Legacy endpoints (imported from admin.controller for compatibility)
router.get('/stats', getSystemStats);
router.get('/audit-logs', getAuditLogs);

// Cleanup management
router.get('/cleanup/preview', previewCleanupController);
router.post('/cleanup/run', runCleanupController);
router.get('/soft-deleted/stats', getSoftDeletedStats);

// Admin hard delete (bypass business rules)
router.delete('/protocols/:id/hard-delete', hardDeleteProtocol);
router.delete('/patients/:id/hard-delete', hardDeletePatient);
router.delete('/users/:id/hard-delete', hardDeleteUser);
router.delete('/projects/:id/hard-delete', hardDeleteProject);
router.delete('/recordings/:id/hard-delete', hardDeleteRecording);

export default router;
