/**
 * System Controller
 * 
 * Handles system-level operations including:
 * - Automated cleanup management
 * - Admin hard-delete operations
 * - System health and status
 */

import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logAction, AuditActions } from '../utils/audit';
import { previewCleanup, runCleanupNow } from '../workers/cleanup.worker';


interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    details?: string;
  };
}

// ============================================================================
// AUTOMATED CLEANUP MANAGEMENT
// ============================================================================

/**
 * Preview what would be deleted in next cleanup
 * GET /api/system/cleanup/preview
 * @access Admin only
 */
export async function previewCleanupController(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const preview = await previewCleanup();

    return res.json({
      success: true,
      data: {
        ...preview,
        message: `${preview.total} records will be permanently deleted in the next cleanup`,
        cutoffDate: preview.cutoffDate.toISOString(),
        daysUntilDeletion: 15
      }
    });
  } catch (error) {
    console.error('Preview cleanup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview cleanup',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Manually trigger cleanup now
 * POST /api/system/cleanup/run
 * @access Admin only
 */
export async function runCleanupController(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const userId = req.user!.userId;

    const stats = await runCleanupNow();

    // Log manual cleanup trigger
    await logAction(req, AuditActions.SYSTEM_CLEANUP, 'system', undefined, {
      stats,
      triggeredBy: 'manual',
      userId
    });

    return res.json({
      success: true,
      message: `Cleanup completed successfully. Deleted ${stats.total} records.`,
      data: stats
    });
  } catch (error) {
    console.error('Run cleanup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to run cleanup',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// ============================================================================
// ADMIN HARD DELETE OPERATIONS
// ============================================================================

/**
 * Admin hard-delete protocol (bypass recordings check)
 * DELETE /api/system/protocols/:id/hard-delete
 * @access Admin only
 */
export async function hardDeleteProtocol(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Check if protocol exists
    const protocol = await prisma.protocol.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true }
        }
      }
    });

    if (!protocol) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found'
      });
    }

    // Delete the protocol (CASCADE will handle sessions)
    await prisma.protocol.delete({ where: { id } });

    // Audit log
    await logAction(req, AuditActions.PROTOCOL_DELETE, 'protocol', id, {
      hard: true,
      sessionCount: protocol._count.sessions,
      deletedBy: 'admin',
      protocolName: protocol.protocolName
    });

    return res.json({
      success: true,
      message: `Protocol "${protocol.protocolName}" permanently deleted`,
      data: {
        deletedSessions: protocol._count.sessions
      }
    });
  } catch (error) {
    console.error('Hard delete protocol error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to hard delete protocol',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Admin hard-delete patient
 * DELETE /api/system/patients/:id/hard-delete
 * @access Admin only
 */
export async function hardDeletePatient(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true }
        }
      }
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    await prisma.patient.delete({ where: { id } });

    const patientName = `${patient.firstName} ${patient.lastName}`;
    await logAction(req, AuditActions.PATIENT_DELETE, 'patient', id, {
      hard: true,
      patientName,
      sessionCount: patient._count.sessions
    });

    return res.json({
      success: true,
      message: `Patient "${patientName}" permanently deleted`,
      data: {
        deletedSessions: patient._count.sessions
      }
    });
  } catch (error) {
    console.error('Hard delete patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to hard delete patient',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Admin hard-delete user
 * DELETE /api/system/users/:id/hard-delete
 * @access Admin only
 */
export async function hardDeleteUser(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.userId;

    // Prevent self-deletion
    if (id === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        email: true,
        userType: true,
        _count: {
          select: {
            ownedProjects: true,
            createdPatients: true,
            createdProtocols: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    await prisma.user.delete({ where: { id } });

    await logAction(req, AuditActions.HARD_DELETE_USER, 'user', id, {
      hard: true,
      userEmail: user.email,
      userRole: user.userType,
      ownedProjects: user._count.ownedProjects,
      createdPatients: user._count.createdPatients,
      createdProtocols: user._count.createdProtocols
    });

    return res.json({
      success: true,
      message: `User "${user.email}" permanently deleted`,
      data: {
        deletedProjects: user._count.ownedProjects,
        deletedPatients: user._count.createdPatients,
        deletedProtocols: user._count.createdProtocols
      }
    });
  } catch (error) {
    console.error('Hard delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to hard delete user',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Admin hard-delete project
 * DELETE /api/system/projects/:id/hard-delete
 * @access Admin only
 */
export async function hardDeleteProject(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            patients: true,
            protocols: true
          }
        }
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    await prisma.project.delete({ where: { id } });

    await logAction(req, AuditActions.HARD_DELETE_PROJECT, 'project', id, {
      hard: true,
      projectName: project.projectName,
      patients: project._count.patients,
      protocols: project._count.protocols,
      members: project.projectMembers.length
    });

    return res.json({
      success: true,
      message: `Project "${project.projectName}" permanently deleted`,
      data: {
        deletedPatients: project._count.patients,
        deletedProtocols: project._count.protocols,
        removedMembers: project.projectMembers.length
      }
    });
  } catch (error) {
    console.error('Hard delete project error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to hard delete project',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Admin hard-delete recording
 * DELETE /api/system/recordings/:id/hard-delete
 * @access Admin only
 */
export async function hardDeleteRecording(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { id } = req.params;

    const recording = await prisma.experimentSession.findUnique({
      where: { id },
      select: {
        id: true,
        videoDataPath: true,
        rawKeypointDataPath: true
      }
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    await prisma.experimentSession.delete({ where: { id } });

    await logAction(req, AuditActions.HARD_DELETE_RECORDING, 'recording', id, {
      hard: true,
      videoDataPath: recording.videoDataPath,
      rawKeypointDataPath: recording.rawKeypointDataPath
    });

    return res.json({
      success: true,
      message: 'Recording permanently deleted'
    });
  } catch (error) {
    console.error('Hard delete recording error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to hard delete recording',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// ============================================================================
// SYSTEM HEALTH & STATUS
// ============================================================================

/**
 * Get system health status
 * GET /api/system/health
 */
export async function getSystemHealth(
  req: Request,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const dbStatus = await prisma.$queryRaw`SELECT 1 as result`;
    
    return res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: Array.isArray(dbStatus) && dbStatus.length > 0 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      }
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'System unhealthy',
      data: {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Get soft-deleted records statistics
 * GET /api/system/soft-deleted/stats
 * @access Admin only
 */
export async function getSoftDeletedStats(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const [protocols, patients, users, projects, recordings] = await Promise.all([
      prisma.protocol.count({ where: { deletedAt: { not: null } } }),
      prisma.patient.count({ where: { deletedAt: { not: null } } }),
      prisma.user.count({ where: { deletedAt: { not: null } } }),
      prisma.project.count({ where: { deletedAt: { not: null } } }),
      prisma.experimentSession.count({ where: { deletedAt: { not: null } } })
    ]);

    const total = protocols + patients + users + projects + recordings;

    return res.json({
      success: true,
      data: {
        protocols,
        patients,
        users,
        projects,
        recordings,
        total
      }
    });
  } catch (error) {
    console.error('Get soft-deleted stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}
