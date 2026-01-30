import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { UserRole } from '../types/api.types';
import prisma from '../lib/prisma';


// ============================================================================
// Role-Based Access Control Middleware
// ============================================================================

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
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
export const canAccessRecording = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    const recording = await prisma.experimentSession.findUnique({
      where: { id },
      select: {
        patientId: true,
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

    // Clinician can access recordings they're assigned to
    if (userRole === UserRole.CLINICIAN && recording.clinicianId === userId) {
      return next();
    }

    // Patient can access their own recordings (via patientId)
    if (userRole === UserRole.PATIENT && recording.patientId === userId) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking access permissions'
    });
  }
};

/**
 * Check if user can modify patient's recordings
 * - Patients cannot modify their own recordings once submitted
 * - Clinicians can modify recordings they're assigned to
 * - Admins can modify all recordings
 */
export const canModifyRecording = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
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
    if (userRole === UserRole.CLINICIAN && recording.clinicianId === userId) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking modification permissions'
    });
  }
};

/**
 * Check if user can access protocol
 * - Admin-created public protocols are visible to everyone
 * - Researcher-created protocols are only visible to the researcher and admins
 * - Clinicians can only VIEW protocols (public or admin-created)
 */
export const canAccessProtocol = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    const protocol = await prisma.protocol.findUnique({
      where: { id },
      select: {
        private: true,
        creatorId: true,
        creator: {
          select: {
            userType: true
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
    if (protocol.creatorId === userId) {
      return next();
    }

    // Public protocols (private=false) created by admin are accessible to all
    if (!protocol.private && protocol.creator?.userType === UserRole.ADMIN) {
      return next();
    }

    // Researchers can access public protocols from admins
    if (userRole === UserRole.RESEARCHER && !protocol.private && protocol.creator?.userType === UserRole.ADMIN) {
      return next();
    }

    // Clinicians can only see public protocols created by admins
    if (userRole === UserRole.CLINICIAN && !protocol.private && protocol.creator?.userType === UserRole.ADMIN) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking access permissions'
    });
  }
};

// ============================================================================
// Convenience Middleware Exports
// ============================================================================

export const requireAdmin = requireRole([UserRole.ADMIN]);
export const requireClinician = requireRole([UserRole.CLINICIAN, UserRole.ADMIN]);
export const requireResearcher = requireRole([UserRole.RESEARCHER, UserRole.ADMIN]);
export const requireClinicianOrResearcher = requireRole([UserRole.CLINICIAN, UserRole.RESEARCHER, UserRole.ADMIN]);

/**
 * Check if user can create protocols
 * - Admins can create protocols (visible to everyone when public)
 * - Researchers can create custom protocols (for their own use)
 * - Clinicians can only VIEW protocols, not create
 */
export const canCreateProtocol = requireRole([UserRole.RESEARCHER, UserRole.ADMIN]);

/**
 * Middleware to check if user can create recordings
 * Allowed roles: Admin, Clinician, Researcher
 */
export const canCreateRecording = requireRole([UserRole.ADMIN, UserRole.CLINICIAN, UserRole.RESEARCHER]);

/**
 * Middleware to check if user can create patients
 * Allowed roles: Admin, Clinician, Researcher
 */
export const canCreatePatient = requireRole([UserRole.ADMIN, UserRole.CLINICIAN, UserRole.RESEARCHER]);

// ============================================================================
// User-Level Deletion Permissions
// ============================================================================

/**
 * Check if user can delete a recording
 * - Admins can delete any recording
 * - Clinicians can delete recordings they are assigned to (as clinician)
 * - Any user can delete recordings where they are the patient
 */
export const canDeleteRecording = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    const recording = await prisma.experimentSession.findUnique({
      where: { id },
      select: {
        clinicianId: true,
        patientId: true,
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
    if (userRole === UserRole.CLINICIAN && recording.clinicianId === userId) {
      return next();
    }

    // User can delete recordings where they are the patient
    if (recording.patientId === userId) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking deletion permissions'
    });
  }
};

/**
 * Check if user can delete a project
 * - Admins can delete any project
 * - Users can delete projects they own
 */
export const canDeleteProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        projectCreatorId: true
      }
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // User can delete their own projects
    if (project.projectCreatorId === userId) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking deletion permissions'
    });
  }
};

/**
 * Check if user can delete a patient
 * - Admins can delete any patient
 * - Project owner can delete patients in their projects
 * - User who created the patient can delete it
 */
export const canDeletePatient = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Admin has full access
    if (userRole === UserRole.ADMIN) {
      return next();
    }

    const patient = await prisma.patient.findUnique({
      where: { id },
      select: {
        creatorId: true,
        project: {
          select: {
            projectCreatorId: true
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
    if (patient.project?.projectCreatorId === userId) {
      return next();
    }

    // User who created the patient can delete it
    if (patient.creatorId === userId) {
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
  } catch (error) {
    console.error('Access control error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking deletion permissions'
    });
  }
};
