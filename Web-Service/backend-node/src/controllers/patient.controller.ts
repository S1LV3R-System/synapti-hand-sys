import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';


/**
 * Get all patients (across all projects user has access to)
 * Updated for new schema: split names, birthDate, sessions
 */
export const getAllPatients = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get all projects user has access to (via projectMembers array or as creator)
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { projectCreatorId: userId },
          { projectMembers: { has: userId } }
        ],
        deletedAt: null
      },
      select: {
        id: true,
      },
    });

    const projectIds = projects.map(p => p.id);

    // Get all patients from those projects
    const patients = await prisma.patient.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            projectName: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            sessions: {
              where: { deletedAt: null }
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform to include computed fullName for backward compatibility
    const transformedPatients = patients.map(p => ({
      ...p,
      patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
      dateOfBirth: p.birthDate,
      recordingsCount: p._count.sessions,
    }));

    return res.json({
      success: true,
      data: transformedPatients,
    });
  } catch (error) {
    console.error('Get all patients error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get patients',
    });
  }
};

/**
 * Get all patients in a project
 * Verifies project access via creator or members array
 */
export const getPatientsByProject = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.userId;

    // Check if user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { projectCreatorId: userId },
          { projectMembers: { has: userId } }
        ],
        deletedAt: null
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or access denied',
      });
    }

    const patients = await prisma.patient.findMany({
      where: {
        projectId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            sessions: {
              where: { deletedAt: null }
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform to include computed fullName
    const transformedPatients = patients.map(p => ({
      ...p,
      patientName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
      dateOfBirth: p.birthDate,
      recordingsCount: p._count.sessions,
    }));

    res.json({
      success: true,
      data: transformedPatients,
    });
  } catch (error) {
    console.error('Get patients by project error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patients',
    });
  }
};

/**
 * Get a single patient by ID
 */
export const getPatientById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const patient = await prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        sessions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            protocol: {
              select: {
                id: true,
                protocolName: true,
              }
            }
          }
        },
        _count: {
          select: {
            sessions: {
              where: { deletedAt: null }
            },
          },
        },
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Check if user has access to the patient's project
    const hasAccess = patient.project.projectCreatorId === userId ||
      patient.project.projectMembers.includes(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Transform for backward compatibility
    const transformedPatient = {
      ...patient,
      patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
      dateOfBirth: patient.birthDate,
      recordings: patient.sessions,
      recordingsCount: patient._count.sessions,
    };

    res.json({
      success: true,
      data: transformedPatient,
    });
  } catch (error) {
    console.error('Get patient by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient',
    });
  }
};

/**
 * Create a new patient in a project
 * New schema: split name fields (firstName, middleName, lastName)
 */
export const createPatient = async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      patientId,
      firstName,
      middleName,
      lastName,
      // Legacy field - if patientName is sent, split it
      patientName,
      gender,
      birthDate,
      dateOfBirth, // Legacy alias
      height,
      weight,
      diagnosis
    } = req.body;
    const userId = req.user!.userId;

    // Handle legacy patientName field
    let finalFirstName = firstName;
    let finalMiddleName = middleName;
    let finalLastName = lastName;

    if (!firstName && patientName) {
      const nameParts = patientName.trim().split(' ');
      finalFirstName = nameParts[0] || '';
      finalLastName = nameParts.slice(1).join(' ') || '';
    }

    // Use birthDate or fallback to legacy dateOfBirth
    const finalBirthDate = birthDate || dateOfBirth;

    if (!patientId || !finalFirstName || !finalLastName) {
      return res.status(400).json({
        success: false,
        message: 'Patient ID, first name, and last name are required',
      });
    }

    if (!finalBirthDate) {
      return res.status(400).json({
        success: false,
        message: 'Birth date is required',
      });
    }

    if (!height || !weight) {
      return res.status(400).json({
        success: false,
        message: 'Height and weight are required',
      });
    }

    // Check if user has access to the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { projectCreatorId: userId },
          { projectMembers: { has: userId } }
        ],
        deletedAt: null,
      },
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or access denied',
      });
    }

    // Check if patient ID already exists (globally unique)
    const existingPatient = await prisma.patient.findFirst({
      where: {
        patientId,
        deletedAt: null,
      },
    });

    if (existingPatient) {
      return res.status(409).json({
        success: false,
        message: 'Patient ID already exists',
      });
    }

    const patient = await prisma.patient.create({
      data: {
        patientId,
        firstName: finalFirstName,
        middleName: finalMiddleName || null,
        lastName: finalLastName,
        birthDate: new Date(finalBirthDate),
        height: parseFloat(height),
        weight: parseFloat(weight),
        diagnosis: diagnosis || 'Healthy',
        projectId,
        creatorId: userId,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'patient.create',
        resource: 'patients',
        resourceId: patient.id,
        details: JSON.stringify({ patientId, firstName: finalFirstName, lastName: finalLastName, projectId }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Transform for response
    const transformedPatient = {
      ...patient,
      patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
      dateOfBirth: patient.birthDate,
    };

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: transformedPatient,
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create patient',
    });
  }
};

/**
 * Update a patient
 */
export const updatePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      middleName,
      lastName,
      patientName, // Legacy
      gender,
      birthDate,
      dateOfBirth, // Legacy
      height,
      weight,
      diagnosis
    } = req.body;
    const userId = req.user!.userId;

    // Check if patient exists and user has access
    const existingPatient = await prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
      },
    });

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Check if user has access to the patient's project
    const hasAccess = existingPatient.project.projectCreatorId === userId ||
      existingPatient.project.projectMembers.includes(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this patient',
      });
    }

    // Handle legacy patientName field
    let updateFirstName = firstName;
    let updateLastName = lastName;
    if (!firstName && patientName) {
      const nameParts = patientName.trim().split(' ');
      updateFirstName = nameParts[0];
      updateLastName = nameParts.slice(1).join(' ');
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: {
        ...(updateFirstName && { firstName: updateFirstName }),
        ...(middleName !== undefined && { middleName }),
        ...(updateLastName && { lastName: updateLastName }),
        ...((birthDate || dateOfBirth) && { birthDate: new Date(birthDate || dateOfBirth) }),
        ...(height !== undefined && { height: parseFloat(height) }),
        ...(weight !== undefined && { weight: parseFloat(weight) }),
        ...(diagnosis !== undefined && { diagnosis }),
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'patient.update',
        resource: 'patients',
        resourceId: patient.id,
        details: JSON.stringify({ firstName: updateFirstName, lastName: updateLastName, height, weight }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Transform for response
    const transformedPatient = {
      ...patient,
      patientName: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
      dateOfBirth: patient.birthDate,
    };

    res.json({
      success: true,
      message: 'Patient updated successfully',
      data: transformedPatient,
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update patient',
    });
  }
};

/**
 * Get all sessions (recordings) for a patient
 */
export const getPatientRecordings = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Find the patient and check access
    const patient = await prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
      },
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Check if user has access to the patient's project
    const hasAccess = patient.project.projectCreatorId === userId ||
      patient.project.projectMembers.includes(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Get sessions (recordings) for this patient
    const sessions = await prisma.experimentSession.findMany({
      where: {
        patientId: id,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        duration: true,
        fps: true,
        videoDataPath: true,
        rawKeypointDataPath: true,
        analyzedXlsxPath: true,
        reportPdfPath: true,
        status: true,
        clinicalNotes: true,
        gripStrength: true,
        protocol: {
          select: {
            id: true,
            protocolName: true,
          },
        },
      },
    });

    // Transform for backward compatibility
    const transformedSessions = sessions.map(s => ({
      ...s,
      recordingDate: s.createdAt,
      videoDataPath: s.videoDataPath,
      rawKeypointDataPath: s.rawKeypointDataPath,
    }));

    res.json({
      success: true,
      data: transformedSessions,
    });
  } catch (error) {
    console.error('Get patient recordings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recordings',
    });
  }
};

/**
 * Delete a patient (soft delete)
 * The patient will be permanently deleted after 15 days by the cleanup job.
 */
export const deletePatient = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Check if patient exists
    const existingPatient = await prisma.patient.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        project: true,
      },
    });

    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found',
      });
    }

    // Check if user has access to the patient's project
    const hasAccess = existingPatient.project.projectCreatorId === userId ||
      existingPatient.project.projectMembers.includes(userId);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this patient',
      });
    }

    // Soft delete the patient
    const deletedPatient = await prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'patient.delete',
        resource: 'patients',
        resourceId: id,
        details: JSON.stringify({
          patientId: existingPatient.patientId,
          patientName: [existingPatient.firstName, existingPatient.middleName, existingPatient.lastName].filter(Boolean).join(' '),
          softDelete: true,
          permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      message: 'Patient deleted successfully. It will be permanently removed after 15 days.',
      data: {
        id: deletedPatient.id,
        deletedAt: deletedPatient.deletedAt,
        permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete patient',
    });
  }
};
