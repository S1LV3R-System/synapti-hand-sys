"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSystemStats = getSystemStats;
exports.listUsers = listUsers;
exports.getUser = getUser;
exports.updateUserRole = updateUserRole;
exports.toggleUserStatus = toggleUserStatus;
exports.setAccountExpiration = setAccountExpiration;
exports.getPendingUsers = getPendingUsers;
exports.approveUser = approveUser;
exports.rejectUser = rejectUser;
exports.requestMoreInfo = requestMoreInfo;
exports.addAdminNote = addAdminNote;
exports.getUserNotes = getUserNotes;
exports.deleteUser = deleteUser;
exports.createApiKey = createApiKey;
exports.listUserApiKeys = listUserApiKeys;
exports.revokeApiKey = revokeApiKey;
exports.deleteApiKey = deleteApiKey;
exports.getAllApiKeys = getAllApiKeys;
exports.getAuditLogs = getAuditLogs;
const client_1 = require("@prisma/client");
const validation_1 = require("../utils/validation");
const audit_1 = require("../utils/audit");
const schema_compat_1 = require("../utils/schema-compat");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// System Statistics
// ============================================================================
async function getSystemStats(req, res) {
    try {
        const [totalUsers, activeUsers, totalRecordings, totalProtocols, totalAnalyses, recentRecordings, recordingsByStatus, usersByRole] = await Promise.all([
            // Total users (excluding soft-deleted)
            prisma.user.count({ where: { deletedAt: null } }),
            // Active users (approved and not soft-deleted)
            prisma.user.count({ where: { approvalStatus: true, deletedAt: null } }),
            // Total recordings
            prisma.experimentSession.count({ where: { deletedAt: null } }),
            // Total protocols
            prisma.protocol.count({ where: { deletedAt: null } }),
            // Total analyses
            prisma.clinicalAnalysis.count(),
            // Recent recordings (last 30 days)
            prisma.experimentSession.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    },
                    deletedAt: null
                }
            }),
            // Recordings by status
            prisma.experimentSession.groupBy({
                by: ['status'],
                where: { deletedAt: null },
                _count: true
            }),
            // Users by userType (excluding soft-deleted)
            prisma.user.groupBy({
                by: ['userType'],
                where: { approvalStatus: true, deletedAt: null },
                _count: true
            })
        ]);
        // Storage statistics (if GCS paths exist)
        const recordingsWithFiles = await prisma.experimentSession.count({
            where: {
                OR: [
                    { videoDataPath: { not: '' } },
                    { rawKeypointDataPath: { not: '' } }
                ],
                deletedAt: null
            }
        });
        // Processing performance metrics
        const avgProcessingTime = await prisma.signalProcessingResult.aggregate({
            _avg: {
                processingTime: true
            }
        });
        // Recent audit activity
        const recentAuditLogs = await prisma.auditLog.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' }
        });
        const stats = {
            users: {
                total: totalUsers,
                active: activeUsers,
                inactive: totalUsers - activeUsers,
                byRole: usersByRole.reduce((acc, { userType, _count }) => {
                    acc[userType] = _count;
                    return acc;
                }, {})
            },
            recordings: {
                total: totalRecordings,
                recent30Days: recentRecordings,
                withFiles: recordingsWithFiles,
                byStatus: recordingsByStatus.reduce((acc, { status, _count }) => {
                    acc[status] = _count;
                    return acc;
                }, {})
            },
            protocols: {
                total: totalProtocols
            },
            analyses: {
                total: totalAnalyses
            },
            performance: {
                avgProcessingTimeMs: avgProcessingTime._avg.processingTime || 0
            },
            recentActivity: recentAuditLogs
        };
        return res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Get system stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch system statistics',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// User Management
// ============================================================================
async function listUsers(req, res) {
    try {
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', role, search } = req.query;
        const where = {
            ...(0, validation_1.buildSoftDeleteFilter)(false),
            ...(role && { userType: role }) // Map role param to userType column
        };
        // Add search filter - use actual schema fields
        if (search) {
            const searchFilter = (0, validation_1.buildSearchFilter)(search, [
                'email',
                'firstName',
                'lastName',
                'institute'
            ]);
            Object.assign(where, searchFilter);
        }
        const total = await prisma.user.count({ where });
        const users = await prisma.user.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
            orderBy: { [sortBy]: sortOrder },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                middleName: true,
                phoneNumber: true,
                userType: true, // Was: role
                institute: true, // Was: hospital
                department: true,
                birthDate: true,
                verificationStatus: true, // Was: emailVerified
                verifiedAt: true, // Was: emailVerifiedAt
                approvalStatus: true, // Was: isApproved
                approvedAt: true,
                rejectedAt: true,
                createdAt: true,
                deletedAt: true,
                _count: {
                    select: {
                        ownedProjects: true,
                        createdPatients: true,
                        clinicianSessions: true,
                        createdProtocols: true
                    }
                }
            }
        });
        // Transform to expected format for frontend compatibility
        // Approval status logic:
        //   - approvalStatus=true -> Approved
        //   - approvalStatus=false AND rejectedAt!=null -> Rejected
        //   - approvalStatus=false AND rejectedAt=null -> Pending
        const transformedUsers = users.map(user => {
            let approvalStatusText;
            let isApprovedValue;
            if (user.approvalStatus === true) {
                approvalStatusText = 'Approved';
                isApprovedValue = true;
            }
            else if (user.rejectedAt !== null) {
                approvalStatusText = 'Rejected';
                isApprovedValue = false;
            }
            else {
                approvalStatusText = 'Pending';
                isApprovedValue = null;
            }
            return {
                ...user,
                role: user.userType,
                fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
                hospital: user.institute,
                isApproved: isApprovedValue,
                approvalStatusText,
                emailVerified: user.verificationStatus,
                emailVerifiedAt: user.verifiedAt,
                isActive: !user.deletedAt && user.approvalStatus
            };
        });
        return res.json({
            success: true,
            data: transformedUsers,
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
        console.error('List users error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function getUser(req, res) {
    try {
        const { userId } = req.params;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                middleName: true,
                lastName: true,
                phoneNumber: true,
                userType: true,
                institute: true,
                department: true,
                birthDate: true,
                verificationStatus: true,
                verifiedAt: true,
                approvalStatus: true,
                approvedAt: true,
                rejectedAt: true,
                createdAt: true,
                deletedAt: true,
                _count: {
                    select: {
                        ownedProjects: true,
                        createdPatients: true,
                        clinicianSessions: true,
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
        // Get recent activity
        const recentActivity = await prisma.auditLog.findMany({
            where: { userId },
            take: 20,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                action: true,
                resource: true,
                resourceId: true,
                createdAt: true
            }
        });
        // Compute approval status text
        let approvalStatusText;
        let isApprovedValue;
        if (user.approvalStatus === true) {
            approvalStatusText = 'Approved';
            isApprovedValue = true;
        }
        else if (user.rejectedAt !== null) {
            approvalStatusText = 'Rejected';
            isApprovedValue = false;
        }
        else {
            approvalStatusText = 'Pending';
            isApprovedValue = null;
        }
        // Transform for frontend compatibility
        return res.json({
            success: true,
            data: {
                ...user,
                role: user.userType,
                fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
                hospital: user.institute,
                isApproved: isApprovedValue,
                approvalStatusText,
                emailVerified: user.verificationStatus,
                emailVerifiedAt: user.verifiedAt,
                isActive: !user.deletedAt && user.approvalStatus,
                recentActivity
            }
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function updateUserRole(req, res) {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        const adminId = req.user.userId;
        // Validate role (userType in new schema)
        const validRoles = ['Admin', 'Clinician', 'Researcher', 'Patient'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role',
                error: {
                    code: 'INVALID_ROLE',
                    details: `Role must be one of: ${validRoles.join(', ')}`
                }
            });
        }
        // Prevent self role change
        if (userId === adminId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot change your own role'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, userType: true, email: true }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Update user role (userType field)
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { userType: role },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
                approvalStatus: true,
                deletedAt: true
            }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.USER_ROLE_CHANGE, 'user', userId, {
            oldRole: user.userType,
            newRole: role,
            changedBy: adminId
        });
        return res.json({
            success: true,
            message: 'User role updated successfully',
            data: {
                ...updatedUser,
                role: updatedUser.userType,
                isActive: !updatedUser.deletedAt && updatedUser.approvalStatus
            }
        });
    }
    catch (error) {
        console.error('Update user role error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update user role',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function toggleUserStatus(req, res) {
    try {
        const { userId } = req.params;
        const adminId = req.user.userId;
        // Prevent self deactivation
        if (userId === adminId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot deactivate your own account'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, deletedAt: true, email: true, approvalStatus: true }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Toggle status: if deletedAt is set, reactivate by clearing it
        // if deletedAt is null, soft-delete by setting it
        const isCurrentlyActive = user.deletedAt === null;
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                deletedAt: isCurrentlyActive ? new Date() : null
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
                approvalStatus: true,
                deletedAt: true
            }
        });
        const isNowActive = updatedUser.deletedAt === null && updatedUser.approvalStatus;
        // Audit log
        await (0, audit_1.logAction)(req, isNowActive ? audit_1.AuditActions.USER_ACTIVATE : audit_1.AuditActions.USER_DEACTIVATE, 'user', userId, { changedBy: adminId });
        return res.json({
            success: true,
            message: `User ${isNowActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                ...updatedUser,
                role: updatedUser.userType,
                isActive: isNowActive
            }
        });
    }
    catch (error) {
        console.error('Toggle user status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update user status',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function setAccountExpiration(req, res) {
    // Account expiration feature is not available in the current schema
    return res.status(501).json({
        success: false,
        message: 'Account expiration feature is not currently supported',
        error: {
            code: 'NOT_IMPLEMENTED',
            details: 'This feature is not available in the current system configuration'
        }
    });
}
// ============================================================================
// User Approval Workflow
// ============================================================================
async function getPendingUsers(req, res) {
    try {
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        // Pending users: approvalStatus = false AND rejectedAt = null
        // (Rejected users have rejectedAt set)
        const where = {
            ...(0, validation_1.buildSoftDeleteFilter)(false),
            approvalStatus: false,
            rejectedAt: null // Only truly pending, not rejected
        };
        const total = await prisma.user.count({ where });
        const pendingUsers = await prisma.user.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
            orderBy: { [sortBy]: sortOrder },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                middleName: true,
                userType: true,
                institute: true,
                department: true,
                birthDate: true,
                phoneNumber: true,
                verificationStatus: true,
                verifiedAt: true,
                createdAt: true
            }
        });
        // Transform to expected format for frontend compatibility
        const transformedUsers = pendingUsers.map(user => ({
            ...user,
            role: user.userType,
            fullName: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
            hospital: user.institute,
            emailVerified: user.verificationStatus,
            emailVerifiedAt: user.verifiedAt,
            isApproved: null, // null = pending, true = approved, false (with rejectedAt) = rejected
            adminNotes: []
        }));
        return res.json({
            success: true,
            data: transformedUsers,
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
        console.error('Get pending users error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch pending users',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function approveUser(req, res) {
    try {
        const { userId } = req.params;
        const { notes } = req.body;
        const adminId = req.user.userId;
        // Check if user exists and is pending
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                approvalStatus: true,
                rejectedAt: true,
                verificationStatus: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Check if already approved
        if (user.approvalStatus === true) {
            return res.status(400).json({
                success: false,
                message: 'User is already approved',
                error: {
                    code: 'ALREADY_APPROVED',
                    details: 'This user has already been approved'
                }
            });
        }
        // Check if already rejected (rejectedAt is set)
        if (user.rejectedAt !== null) {
            return res.status(400).json({
                success: false,
                message: 'User has already been rejected',
                error: {
                    code: 'ALREADY_REJECTED',
                    details: 'This user was previously rejected. To approve, first clear the rejection.'
                }
            });
        }
        // Approve user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                approvalStatus: true,
                approvedAt: new Date(),
                rejectedAt: null // Clear any rejection timestamp
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
                approvalStatus: true,
                approvedAt: true
            }
        });
        // Audit log with notes
        await (0, audit_1.logAction)(req, audit_1.AuditActions.USER_APPROVE, 'user', userId, {
            approvedBy: adminId,
            email: user.email,
            notes: notes || null
        });
        // TODO: Send approval email to user
        // Transform response for frontend compatibility
        return res.json({
            success: true,
            message: 'User approved successfully',
            data: {
                ...updatedUser,
                fullName: [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' '),
                role: updatedUser.userType,
                isApproved: updatedUser.approvalStatus
            }
        });
    }
    catch (error) {
        console.error('Approve user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to approve user',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function rejectUser(req, res) {
    try {
        const { userId } = req.params;
        const { reason, notes } = req.body;
        const adminId = req.user.userId;
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                approvalStatus: true,
                rejectedAt: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Check if already approved
        if (user.approvalStatus === true) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reject an already approved user'
            });
        }
        // Check if already rejected
        if (user.rejectedAt !== null) {
            return res.status(400).json({
                success: false,
                message: 'User has already been rejected'
            });
        }
        // Reject user - keep approvalStatus as false, set rejectedAt
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                approvalStatus: false,
                rejectedAt: new Date(),
                approvedAt: null // Clear any approval timestamp
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
                approvalStatus: true,
                rejectedAt: true
            }
        });
        // Audit log with rejection reason
        await (0, audit_1.logAction)(req, audit_1.AuditActions.USER_REJECT, 'user', userId, {
            rejectedBy: adminId,
            email: user.email,
            reason,
            notes: notes || null
        });
        // TODO: Send rejection email to user with reason
        // Transform response for frontend compatibility
        return res.json({
            success: true,
            message: 'User rejected',
            data: {
                ...updatedUser,
                fullName: [updatedUser.firstName, updatedUser.lastName].filter(Boolean).join(' '),
                role: updatedUser.userType,
                isApproved: false,
                rejectionReason: reason
            }
        });
    }
    catch (error) {
        console.error('Reject user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to reject user',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function requestMoreInfo(req, res) {
    try {
        const { userId } = req.params;
        const { message, fields } = req.body;
        const adminId = req.user.userId;
        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                approvalStatus: true,
                rejectedAt: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Can only request info for pending users
        if (user.approvalStatus === true || user.rejectedAt !== null) {
            return res.status(400).json({
                success: false,
                message: 'Cannot request info for processed user'
            });
        }
        // Log info request using AuditLog
        const auditLog = await prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.info_request',
                resource: 'user',
                resourceId: userId,
                details: JSON.stringify({
                    targetUser: user.email,
                    message,
                    fields: fields || []
                }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });
        // TODO: Send email to user requesting more info
        return res.json({
            success: true,
            message: 'Information request logged',
            data: {
                id: auditLog.id,
                message,
                fields: fields || [],
                createdAt: auditLog.createdAt
            }
        });
    }
    catch (error) {
        console.error('Request more info error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to request more information',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function addAdminNote(req, res) {
    try {
        const { userId } = req.params;
        const { content, isInternal = true } = req.body;
        const adminId = req.user.userId;
        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Note content is required'
            });
        }
        // Check if user exists
        const userExists = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true }
        });
        if (!userExists) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Create admin note using AuditLog
        const note = await prisma.auditLog.create({
            data: {
                userId: adminId,
                action: 'admin.note',
                resource: 'user',
                resourceId: userId,
                details: JSON.stringify({
                    targetUser: userExists.email,
                    content,
                    noteType: 'general',
                    isInternal
                }),
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });
        return res.json({
            success: true,
            message: 'Admin note added successfully',
            data: {
                id: note.id,
                content,
                noteType: 'general',
                isInternal,
                createdAt: note.createdAt
            }
        });
    }
    catch (error) {
        console.error('Add admin note error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add admin note',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function getUserNotes(req, res) {
    try {
        const { userId } = req.params;
        const { includeInternal = true } = req.query;
        // Get admin notes from AuditLog
        const auditLogs = await prisma.auditLog.findMany({
            where: {
                resourceId: userId,
                resource: 'user',
                action: {
                    in: ['admin.note', 'admin.info_request', audit_1.AuditActions.USER_APPROVE, audit_1.AuditActions.USER_REJECT]
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Parse notes from audit log details
        const notes = auditLogs.map(log => {
            let parsed = {};
            try {
                parsed = JSON.parse(log.details || '{}');
            }
            catch { }
            // Filter internal notes if requested
            if (!includeInternal && parsed.isInternal) {
                return null;
            }
            return {
                id: log.id,
                content: parsed.content || parsed.notes || parsed.reason || parsed.message || '',
                noteType: log.action === 'admin.note' ? 'general' :
                    log.action === 'admin.info_request' ? 'info_request' :
                        log.action === audit_1.AuditActions.USER_APPROVE ? 'approval' :
                            log.action === audit_1.AuditActions.USER_REJECT ? 'rejection' : 'other',
                isInternal: parsed.isInternal || false,
                createdAt: log.createdAt,
                adminId: log.userId
            };
        }).filter(Boolean);
        return res.json({
            success: true,
            data: notes
        });
    }
    catch (error) {
        console.error('Get user notes error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch user notes',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Delete User
// ============================================================================
async function deleteUser(req, res) {
    try {
        const { userId } = req.params;
        const { permanent = false } = req.body;
        const adminId = req.user.userId;
        // Prevent self deletion
        if (userId === adminId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own account'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                userType: true,
                deletedAt: true,
                _count: {
                    select: {
                        ownedProjects: true,
                        createdPatients: true,
                        clinicianSessions: true,
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
        // Prevent deletion of admin users
        if (user.userType.toLowerCase() === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete admin users. Demote them first.'
            });
        }
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        if (permanent) {
            // Permanent deletion - soft delete all owned projects first
            await prisma.project.updateMany({
                where: { projectCreatorId: userId },
                data: { deletedAt: new Date() }
            });
            // Soft delete all created patients
            await prisma.patient.updateMany({
                where: { creatorId: userId },
                data: { deletedAt: new Date() }
            });
            // Soft delete all created protocols
            await prisma.protocol.updateMany({
                where: { creatorId: userId },
                data: { deletedAt: new Date() }
            });
            // Now permanently delete the user - cascade will handle remaining relations
            await prisma.user.delete({
                where: { id: userId }
            });
            await (0, audit_1.logAction)(req, 'user.delete_permanent', 'user', userId, {
                deletedBy: adminId,
                email: user.email,
                fullName,
                projectsDeleted: user._count.ownedProjects
            });
            return res.json({
                success: true,
                message: 'User permanently deleted',
                data: { userId, email: user.email }
            });
        }
        else {
            // Soft delete the user
            const deletedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    deletedAt: new Date()
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    deletedAt: true
                }
            });
            // Soft delete all owned projects (to prevent orphaned data)
            await prisma.project.updateMany({
                where: {
                    projectCreatorId: userId,
                    deletedAt: null
                },
                data: { deletedAt: new Date() }
            });
            await (0, audit_1.logAction)(req, 'user.delete', 'user', userId, {
                deletedBy: adminId,
                email: user.email,
                fullName,
                projectsSoftDeleted: user._count.ownedProjects
            });
            return res.json({
                success: true,
                message: 'User deleted successfully',
                data: {
                    ...deletedUser,
                    fullName: [deletedUser.firstName, deletedUser.lastName].filter(Boolean).join(' ')
                }
            });
        }
    }
    catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// API Key Management
// ============================================================================
const crypto_1 = __importDefault(require("crypto"));
function generateApiKey() {
    const key = `hp_${crypto_1.default.randomBytes(32).toString('hex')}`;
    const hash = crypto_1.default.createHash('sha256').update(key).digest('hex');
    const prefix = key.substring(0, 11); // hp_ + first 8 chars
    return { key, hash, prefix };
}
async function createApiKey(req, res) {
    try {
        const { userId, name, permissions = 'read', expiresAt } = req.body;
        const adminId = req.user.userId;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }
        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'API key name is required'
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, role: true }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        // Generate the API key
        const { key, hash, prefix } = generateApiKey();
        // Create API key record
        const apiKey = await prisma.apiKey.create({
            data: {
                userId,
                name,
                keyHash: hash,
                keyPrefix: prefix,
                permissions,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                permissions: true,
                expiresAt: true,
                createdAt: true
            }
        });
        await (0, audit_1.logAction)(req, 'apikey.create', 'api_key', apiKey.id, {
            createdBy: adminId,
            userId,
            name,
            permissions
        });
        // Return the full key ONLY on creation (it cannot be retrieved later)
        return res.status(201).json({
            success: true,
            message: 'API key created successfully. Save this key - it cannot be retrieved later.',
            data: {
                ...apiKey,
                key // Full key only shown once
            }
        });
    }
    catch (error) {
        console.error('Create API key error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create API key',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function listUserApiKeys(req, res) {
    try {
        const { userId } = req.params;
        const apiKeys = await prisma.apiKey.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                permissions: true,
                lastUsedAt: true,
                usageCount: true,
                isActive: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true
            }
        });
        return res.json({
            success: true,
            data: apiKeys
        });
    }
    catch (error) {
        console.error('List API keys error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to list API keys',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function revokeApiKey(req, res) {
    try {
        const { keyId } = req.params;
        const adminId = req.user.userId;
        // Check if API key exists
        const apiKey = await prisma.apiKey.findUnique({
            where: { id: keyId },
            select: {
                id: true,
                userId: true,
                name: true,
                isActive: true,
                user: { select: { email: true } }
            }
        });
        if (!apiKey) {
            return res.status(404).json({
                success: false,
                message: 'API key not found'
            });
        }
        if (!apiKey.isActive) {
            return res.status(400).json({
                success: false,
                message: 'API key is already revoked'
            });
        }
        // Revoke the key
        const revokedKey = await prisma.apiKey.update({
            where: { id: keyId },
            data: {
                isActive: false,
                revokedAt: new Date(),
                revokedBy: adminId
            },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                revokedAt: true
            }
        });
        await (0, audit_1.logAction)(req, 'apikey.revoke', 'api_key', keyId, {
            revokedBy: adminId,
            userId: apiKey.userId,
            keyName: apiKey.name
        });
        return res.json({
            success: true,
            message: 'API key revoked successfully',
            data: revokedKey
        });
    }
    catch (error) {
        console.error('Revoke API key error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to revoke API key',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function deleteApiKey(req, res) {
    try {
        const { keyId } = req.params;
        const adminId = req.user.userId;
        // Check if API key exists
        const apiKey = await prisma.apiKey.findUnique({
            where: { id: keyId },
            select: { id: true, userId: true, name: true }
        });
        if (!apiKey) {
            return res.status(404).json({
                success: false,
                message: 'API key not found'
            });
        }
        // Delete the key
        await prisma.apiKey.delete({
            where: { id: keyId }
        });
        await (0, audit_1.logAction)(req, 'apikey.delete', 'api_key', keyId, {
            deletedBy: adminId,
            userId: apiKey.userId,
            keyName: apiKey.name
        });
        return res.json({
            success: true,
            message: 'API key deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete API key error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete API key',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
async function getAllApiKeys(req, res) {
    try {
        const { page = 1, limit = 50, isActive } = req.query;
        const where = {};
        if (isActive !== undefined) {
            where.isActive = isActive === 'true';
        }
        const total = await prisma.apiKey.count({ where });
        const apiKeys = await prisma.apiKey.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                keyPrefix: true,
                permissions: true,
                lastUsedAt: true,
                usageCount: true,
                isActive: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        fullName: true,
                        role: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: apiKeys,
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
        console.error('Get all API keys error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch API keys',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Audit Logs
// ============================================================================
async function getAuditLogs(req, res) {
    try {
        const { page: pageStr = '1', limit: limitStr = '50', sortBy = 'createdAt', sortOrder = 'desc', userId, action, resource, startDate, endDate } = req.query;
        const page = parseInt(pageStr, 10);
        const limit = parseInt(limitStr, 10);
        const where = {
            ...(userId && { userId }),
            ...(action && { action }),
            ...(resource && { resource })
        };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const total = await prisma.auditLog.count({ where });
        const logs = await prisma.auditLog.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
            orderBy: { [sortBy]: sortOrder },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: logs,
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
        console.error('Get audit logs error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch audit logs',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
