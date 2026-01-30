"use strict";
/**
 * System Controller
 *
 * Handles system-level operations including:
 * - Automated cleanup management
 * - Admin hard-delete operations
 * - System health and status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewCleanupController = previewCleanupController;
exports.runCleanupController = runCleanupController;
exports.hardDeleteProtocol = hardDeleteProtocol;
exports.hardDeletePatient = hardDeletePatient;
exports.hardDeleteUser = hardDeleteUser;
exports.hardDeleteProject = hardDeleteProject;
exports.hardDeleteRecording = hardDeleteRecording;
exports.getSystemHealth = getSystemHealth;
exports.getSoftDeletedStats = getSoftDeletedStats;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const audit_1 = require("../utils/audit");
const cleanup_worker_1 = require("../workers/cleanup.worker");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// AUTOMATED CLEANUP MANAGEMENT
// ============================================================================
/**
 * Preview what would be deleted in next cleanup
 * GET /api/system/cleanup/preview
 * @access Admin only
 */
async function previewCleanupController(req, res) {
    try {
        const preview = await (0, cleanup_worker_1.previewCleanup)();
        return res.json({
            success: true,
            data: {
                ...preview,
                message: `${preview.total} records will be permanently deleted in the next cleanup`,
                cutoffDate: preview.cutoffDate.toISOString(),
                daysUntilDeletion: 15
            }
        });
    }
    catch (error) {
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
async function runCleanupController(req, res) {
    try {
        const userId = req.user.userId;
        const stats = await (0, cleanup_worker_1.runCleanupNow)();
        // Log manual cleanup trigger
        await (0, audit_1.logAction)(req, audit_1.AuditActions.SYSTEM_CLEANUP, 'system', undefined, {
            stats,
            triggeredBy: 'manual',
            userId
        });
        return res.json({
            success: true,
            message: `Cleanup completed successfully. Deleted ${stats.total} records.`,
            data: stats
        });
    }
    catch (error) {
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
async function hardDeleteProtocol(req, res) {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        // Check if protocol exists
        const protocol = await prisma.protocol.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { recordings: true }
                }
            }
        });
        if (!protocol) {
            return res.status(404).json({
                success: false,
                message: 'Protocol not found'
            });
        }
        // Delete the protocol (CASCADE will handle recordings)
        await prisma.protocol.delete({ where: { id } });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.PROTOCOL_DELETE, 'protocol', id, {
            hard: true,
            recordingCount: protocol._count.recordings,
            deletedBy: 'admin',
            protocolName: protocol.name
        });
        return res.json({
            success: true,
            message: `Protocol "${protocol.name}" permanently deleted`,
            data: {
                deletedRecordings: protocol._count.recordings
            }
        });
    }
    catch (error) {
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
async function hardDeletePatient(req, res) {
    try {
        const { id } = req.params;
        const patient = await prisma.patient.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { recordings: true }
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.PATIENT_DELETE, 'patient', id, {
            hard: true,
            patientName: patient.patientName,
            recordingCount: patient._count.recordings
        });
        return res.json({
            success: true,
            message: `Patient "${patient.patientName}" permanently deleted`,
            data: {
                deletedRecordings: patient._count.recordings
            }
        });
    }
    catch (error) {
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
async function hardDeleteUser(req, res) {
    try {
        const { id } = req.params;
        const currentUserId = req.user.userId;
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
                role: true,
                _count: {
                    select: {
                        ownedProjects: true,
                        createdPatients: true,
                        protocols: true
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.HARD_DELETE_USER, 'user', id, {
            hard: true,
            userEmail: user.email,
            userRole: user.role,
            ownedProjects: user._count.ownedProjects,
            createdPatients: user._count.createdPatients,
            protocols: user._count.protocols
        });
        return res.json({
            success: true,
            message: `User "${user.email}" permanently deleted`,
            data: {
                deletedProjects: user._count.ownedProjects,
                deletedPatients: user._count.createdPatients,
                deletedProtocols: user._count.protocols
            }
        });
    }
    catch (error) {
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
async function hardDeleteProject(req, res) {
    try {
        const { id } = req.params;
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        patients: true,
                        recordings: true,
                        members: true
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.HARD_DELETE_PROJECT, 'project', id, {
            hard: true,
            projectName: project.name,
            patients: project._count.patients,
            recordings: project._count.recordings,
            members: project._count.members
        });
        return res.json({
            success: true,
            message: `Project "${project.name}" permanently deleted`,
            data: {
                deletedPatients: project._count.patients,
                deletedRecordings: project._count.recordings,
                removedMembers: project._count.members
            }
        });
    }
    catch (error) {
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
async function hardDeleteRecording(req, res) {
    try {
        const { id } = req.params;
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                id: true,
                videoPath: true,
                csvPath: true,
                keypointsPath: true
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        await prisma.experimentSession.delete({ where: { id } });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.HARD_DELETE_RECORDING, 'recording', id, {
            hard: true,
            videoPath: recording.videoPath,
            csvPath: recording.csvPath
        });
        return res.json({
            success: true,
            message: 'Recording permanently deleted'
        });
    }
    catch (error) {
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
async function getSystemHealth(req, res) {
    try {
        const dbStatus = await prisma.$queryRaw `SELECT 1 as result`;
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
    }
    catch (error) {
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
async function getSoftDeletedStats(req, res) {
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
    }
    catch (error) {
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
