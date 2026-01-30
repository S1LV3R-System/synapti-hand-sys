"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canDeletePatient = exports.canDeleteProject = exports.canDeleteRecording = exports.canCreateProtocol = exports.requireClinicianOrResearcher = exports.requireResearcher = exports.requireClinician = exports.requireAdmin = exports.canAccessProtocol = exports.canModifyRecording = exports.canAccessRecording = exports.requireRole = void 0;
const api_types_1 = require("../types/api.types");
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// Role-Based Access Control Middleware
// ============================================================================
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                error: {
                    code: 'FORBIDDEN',
                    details: `Required roles: ${allowedRoles.join(', ')}`
                }
            });
        }
        next();
    };
};
exports.requireRole = requireRole;
// ============================================================================
// Resource Access Control
// ============================================================================
/**
 * Check if user can access patient's recordings
 * - Patients can only access their own recordings
 * - Clinicians can access recordings they're assigned to
 * - Admins can access all recordings
 * - Researchers can access approved recordings
 */
const canAccessRecording = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                patientUserId: true,
                clinicianId: true,
                reviewStatus: true
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Clinician can access recordings they're assigned to
        if (userRole === api_types_1.UserRole.CLINICIAN && recording.clinicianId === userId) {
            return next();
        }
        // Patient can access their own recordings
        if (userRole === api_types_1.UserRole.PATIENT && recording.patientUserId === userId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to this recording',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to access this recording'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking access permissions'
        });
    }
};
exports.canAccessRecording = canAccessRecording;
/**
 * Check if user can modify patient's recordings
 * - Patients cannot modify their own recordings once submitted
 * - Clinicians can modify recordings they're assigned to
 * - Admins can modify all recordings
 */
const canModifyRecording = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                clinicianId: true,
                status: true
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Clinician can modify recordings they're assigned to
        if (userRole === api_types_1.UserRole.CLINICIAN && recording.clinicianId === userId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to modify this recording',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to modify this recording'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking modification permissions'
        });
    }
};
exports.canModifyRecording = canModifyRecording;
/**
 * Check if user can access protocol
 * - Admin-created public protocols are visible to everyone
 * - Researcher-created protocols are only visible to the researcher and admins
 * - Clinicians can only VIEW protocols (public or admin-created)
 */
const canAccessProtocol = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const protocol = await prisma.protocol.findUnique({
            where: { id },
            select: {
                isPublic: true,
                createdById: true,
                createdBy: {
                    select: {
                        role: true
                    }
                }
            }
        });
        if (!protocol) {
            return res.status(404).json({
                success: false,
                message: 'Protocol not found'
            });
        }
        // Creator can always access their own protocols
        if (protocol.createdById === userId) {
            return next();
        }
        // Public protocols created by admin are accessible to all
        if (protocol.isPublic && protocol.createdBy?.role === api_types_1.UserRole.ADMIN) {
            return next();
        }
        // Researchers can access public protocols from admins
        if (userRole === api_types_1.UserRole.RESEARCHER && protocol.isPublic && protocol.createdBy?.role === api_types_1.UserRole.ADMIN) {
            return next();
        }
        // Clinicians can only see public protocols created by admins
        if (userRole === api_types_1.UserRole.CLINICIAN && protocol.isPublic && protocol.createdBy?.role === api_types_1.UserRole.ADMIN) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to this protocol',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to access this protocol'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking access permissions'
        });
    }
};
exports.canAccessProtocol = canAccessProtocol;
// ============================================================================
// Convenience Middleware Exports
// ============================================================================
exports.requireAdmin = (0, exports.requireRole)([api_types_1.UserRole.ADMIN]);
exports.requireClinician = (0, exports.requireRole)([api_types_1.UserRole.CLINICIAN, api_types_1.UserRole.ADMIN]);
exports.requireResearcher = (0, exports.requireRole)([api_types_1.UserRole.RESEARCHER, api_types_1.UserRole.ADMIN]);
exports.requireClinicianOrResearcher = (0, exports.requireRole)([api_types_1.UserRole.CLINICIAN, api_types_1.UserRole.RESEARCHER, api_types_1.UserRole.ADMIN]);
/**
 * Check if user can create protocols
 * - Admins can create protocols (visible to everyone when public)
 * - Researchers can create custom protocols (for their own use)
 * - Clinicians can only VIEW protocols, not create
 */
exports.canCreateProtocol = (0, exports.requireRole)([api_types_1.UserRole.RESEARCHER, api_types_1.UserRole.ADMIN]);
// ============================================================================
// User-Level Deletion Permissions
// ============================================================================
/**
 * Check if user can delete a recording
 * - Admins can delete any recording
 * - Clinicians can delete recordings they are assigned to (as clinician)
 * - Any user can delete recordings where they are the patient
 */
const canDeleteRecording = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                clinicianId: true,
                patientUserId: true,
                status: true
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Clinician can delete recordings they're assigned to
        if (userRole === api_types_1.UserRole.CLINICIAN && recording.clinicianId === userId) {
            return next();
        }
        // User can delete recordings where they are the patient
        if (recording.patientUserId === userId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to delete this recording',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to delete this recording'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking deletion permissions'
        });
    }
};
exports.canDeleteRecording = canDeleteRecording;
/**
 * Check if user can delete a project
 * - Admins can delete any project
 * - Users can delete projects they own
 */
const canDeleteProject = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const project = await prisma.project.findUnique({
            where: { id },
            select: {
                ownerId: true
            }
        });
        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }
        // User can delete their own projects
        if (project.ownerId === userId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to delete this project',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to delete this project'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking deletion permissions'
        });
    }
};
exports.canDeleteProject = canDeleteProject;
/**
 * Check if user can delete a patient
 * - Admins can delete any patient
 * - Project owner can delete patients in their projects
 * - User who created the patient can delete it
 */
const canDeletePatient = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Admin has full access
        if (userRole === api_types_1.UserRole.ADMIN) {
            return next();
        }
        const patient = await prisma.patient.findUnique({
            where: { id },
            select: {
                createdById: true,
                project: {
                    select: {
                        ownerId: true
                    }
                }
            }
        });
        if (!patient) {
            return res.status(404).json({
                success: false,
                message: 'Patient not found'
            });
        }
        // Project owner can delete patients
        if (patient.project.ownerId === userId) {
            return next();
        }
        // User who created the patient can delete it
        if (patient.createdById === userId) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: 'Access denied to delete this patient',
            error: {
                code: 'FORBIDDEN',
                details: 'You do not have permission to delete this patient'
            }
        });
    }
    catch (error) {
        console.error('Access control error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking deletion permissions'
        });
    }
};
exports.canDeletePatient = canDeletePatient;
