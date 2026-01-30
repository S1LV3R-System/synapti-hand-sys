import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';


// ============================================================================
// Create Protocol
// Updated for Protocol-Table schema:
// - protocolName, protocolDescription, protocolInformation (JSON array)
// - creatorId instead of createdById
// - private boolean instead of isPublic
// - linkedProjectId for project association
// ============================================================================

export async function createProtocol(
  req: AuthRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const {
      name,
      protocolName,
      description,
      protocolDescription,
      protocolInformation,
      isPublic,
      private: isPrivate,
      linkedProjectId,
      configuration, // Legacy field - contains full config with analysisOutputs
      // New explicit fields
      version,
      indicatedFor,
      contraindications,
      isActive,
      instructions,
      patientInstructions,
      clinicalGuidelines,
      overallRepetitions,
      analysisOutputs,
    } = req.body;

    // Handle both old and new field names
    const finalName = protocolName || name;
    const finalDescription = protocolDescription || description;

    if (!finalName) {
      return res.status(400).json({
        success: false,
        message: 'Protocol name is required',
      });
    }

    // Parse configuration to extract all fields
    let parsedConfig: any = {};
    if (configuration) {
      try {
        parsedConfig = typeof configuration === 'string'
          ? JSON.parse(configuration)
          : configuration;
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid protocol configuration JSON',
        });
      }
    }

    // Build final protocol information (movements array)
    // Priority: explicit protocolInformation > config.movements > legacy config
    let finalProtocolInfo: any[] = protocolInformation || [];
    if (finalProtocolInfo.length === 0 && parsedConfig.movements) {
      finalProtocolInfo = parsedConfig.movements;
    }
    if (finalProtocolInfo.length === 0 && !parsedConfig.movements && configuration) {
      // Legacy: entire config was stored as single item
      finalProtocolInfo = [parsedConfig];
    }

    // Extract analysis outputs - priority: explicit > from configuration
    const finalAnalysisOutputs = analysisOutputs || parsedConfig.analysisOutputs || null;

    // Extract clinical metadata - priority: explicit fields > from configuration
    const finalVersion = version || parsedConfig.version || '1.0';
    const finalIndicatedFor = indicatedFor || parsedConfig.indicatedFor || null;
    const finalContraindications = contraindications || parsedConfig.contraindications || null;
    const finalIsActive = isActive !== undefined ? isActive : (parsedConfig.isActive !== undefined ? parsedConfig.isActive : true);
    const finalInstructions = patientInstructions || instructions || parsedConfig.instructions || null;
    const finalClinicalGuidelines = clinicalGuidelines || parsedConfig.clinicalGuidelines || null;
    const finalOverallRepetitions = overallRepetitions || parsedConfig.overallRepetitions || 1;

    // Determine privacy setting (new schema uses 'private', old used 'isPublic')
    const finalPrivate = isPrivate !== undefined ? isPrivate : (isPublic !== undefined ? !isPublic : true);

    const protocol = await prisma.protocol.create({
      data: {
        protocolName: finalName,
        protocolDescription: finalDescription || null,
        protocolInformation: finalProtocolInfo,
        creatorId: userId,
        linkedProjectId: linkedProjectId || null,
        private: finalPrivate,
        // Extended fields
        version: finalVersion,
        indicatedFor: finalIndicatedFor,
        contraindications: finalContraindications,
        isActive: finalIsActive,
        patientInstructions: finalInstructions,
        clinicalGuidelines: finalClinicalGuidelines,
        overallRepetitions: finalOverallRepetitions,
        analysisOutputs: finalAnalysisOutputs,
      },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            userType: true,
          },
        },
        linkedProject: {
          select: {
            id: true,
            projectName: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'protocol.create',
        resource: 'protocols',
        resourceId: protocol.id,
        details: JSON.stringify({
          name: protocol.protocolName,
          private: protocol.private,
          version: protocol.version,
          hasAnalysisOutputs: !!protocol.analysisOutputs,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Transform for backward compatibility
    const transformedProtocol = transformProtocolResponse(protocol);

    return res.status(201).json({
      success: true,
      message: 'Protocol created successfully',
      data: transformedProtocol,
    });
  } catch (error) {
    console.error('Create protocol error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create protocol',
    });
  }
}

// Helper function to transform protocol for response with backward compatibility
function transformProtocolResponse(protocol: any) {
  // Build legacy configuration object for backward compatibility
  const legacyConfig = {
    movements: protocol.protocolInformation || [],
    instructions: protocol.patientInstructions || '',
    clinicalGuidelines: protocol.clinicalGuidelines || '',
    overallRepetitions: protocol.overallRepetitions || 1,
    requiredMetrics: [],
    analysisOutputs: protocol.analysisOutputs || null,
  };

  return {
    ...protocol,
    // Legacy field aliases
    name: protocol.protocolName,
    description: protocol.protocolDescription,
    isPublic: !protocol.private,
    createdBy: protocol.creator,
    createdById: protocol.creatorId,
    configuration: legacyConfig,
    // Ensure new fields are included
    version: protocol.version,
    indicatedFor: protocol.indicatedFor,
    contraindications: protocol.contraindications,
    isActive: protocol.isActive,
    instructions: protocol.patientInstructions,
    patientInstructions: protocol.patientInstructions,
    clinicalGuidelines: protocol.clinicalGuidelines,
    overallRepetitions: protocol.overallRepetitions,
    analysisOutputs: protocol.analysisOutputs,
  };
}

// ============================================================================
// List Protocols
// ============================================================================

export async function listProtocols(
  req: AuthRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const userType = req.user!.role;

    const {
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isPublic,
      isActive,
      createdById,
      search,
      includeDeleted = 'false',
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};

    // Soft delete filter
    if (includeDeleted !== 'true') {
      where.deletedAt = null;
    }

    // Creator filter
    if (createdById) {
      where.creatorId = createdById;
    }

    // Role-based visibility:
    // - Admin: can see all protocols
    // - Others: can see public protocols + own protocols
    if (userType === 'admin' || userType === 'Admin') {
      // Admin can filter by public/private if specified
      if (isPublic !== undefined) {
        where.private = isPublic === 'true' ? false : true;
      }
    } else {
      // Non-admins can see: public protocols OR their own protocols
      where.OR = [
        { private: false },
        { creatorId: userId },
      ];
    }

    // Search filter
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { protocolName: { contains: search, mode: 'insensitive' } },
            { protocolDescription: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    // Count total
    const total = await prisma.protocol.count({ where });

    // Fetch protocols
    const protocols = await prisma.protocol.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sortBy]: sortOrder as 'asc' | 'desc' },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            userType: true,
          },
        },
        linkedProject: {
          select: {
            id: true,
            projectName: true,
          },
        },
        _count: {
          select: {
            sessions: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    // Transform for backward compatibility
    const transformedProtocols = protocols.map(p => ({
      ...transformProtocolResponse(p),
      recordingsCount: p._count.sessions,
    }));

    return res.json({
      success: true,
      data: transformedProtocols,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List protocols error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch protocols',
    });
  }
}

// ============================================================================
// Get Protocol
// ============================================================================

export async function getProtocol(
  req: AuthRequest,
  res: Response
) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userType = req.user!.role;

    const protocol = await prisma.protocol.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            userType: true,
            institute: true,
            department: true,
          },
        },
        linkedProject: {
          select: {
            id: true,
            projectName: true,
            projectDescription: true,
          },
        },
        _count: {
          select: {
            sessions: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!protocol) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found',
      });
    }

    // Check soft delete for non-admins
    if (protocol.deletedAt && userType !== 'admin' && userType !== 'Admin') {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found',
      });
    }

    // Check access for private protocols
    if (protocol.private && protocol.creatorId !== userId && userType !== 'admin' && userType !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this protocol',
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'protocol.view',
        resource: 'protocols',
        resourceId: protocol.id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Transform for backward compatibility
    const transformedProtocol = {
      ...transformProtocolResponse(protocol),
      recordingsCount: protocol._count.sessions,
    };

    return res.json({
      success: true,
      data: transformedProtocol,
    });
  } catch (error) {
    console.error('Get protocol error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch protocol',
    });
  }
}

// ============================================================================
// Update Protocol
// ============================================================================

export async function updateProtocol(
  req: AuthRequest,
  res: Response
) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userType = req.user!.role;
    const {
      name,
      protocolName,
      description,
      protocolDescription,
      protocolInformation,
      isPublic,
      private: isPrivate,
      linkedProjectId,
      configuration,
      // New explicit fields
      version,
      indicatedFor,
      contraindications,
      isActive,
      instructions,
      patientInstructions,
      clinicalGuidelines,
      overallRepetitions,
      analysisOutputs,
    } = req.body;

    // Check if protocol exists
    const existing = await prisma.protocol.findUnique({
      where: { id },
      select: { creatorId: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found',
      });
    }

    // Check permissions (only creator or admin can update)
    if (userType !== 'admin' && userType !== 'Admin' && existing.creatorId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this protocol',
      });
    }

    // Parse configuration to extract all fields
    let parsedConfig: any = {};
    if (configuration) {
      try {
        parsedConfig = typeof configuration === 'string'
          ? JSON.parse(configuration)
          : configuration;
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid protocol configuration JSON',
        });
      }
    }

    // Build update data
    const updateData: any = {};

    if (protocolName || name) {
      updateData.protocolName = protocolName || name;
    }

    if (protocolDescription !== undefined || description !== undefined) {
      updateData.protocolDescription = protocolDescription !== undefined ? protocolDescription : description;
    }

    // Handle protocol information (movements)
    if (protocolInformation !== undefined) {
      updateData.protocolInformation = protocolInformation;
    } else if (parsedConfig.movements) {
      updateData.protocolInformation = parsedConfig.movements;
    }

    // Handle privacy setting
    if (isPrivate !== undefined) {
      updateData.private = isPrivate;
    } else if (isPublic !== undefined) {
      updateData.private = !isPublic;
    }

    if (linkedProjectId !== undefined) {
      updateData.linkedProjectId = linkedProjectId;
    }

    // Handle extended fields - priority: explicit > from configuration
    if (version !== undefined || parsedConfig.version) {
      updateData.version = version || parsedConfig.version;
    }

    if (indicatedFor !== undefined || parsedConfig.indicatedFor !== undefined) {
      updateData.indicatedFor = indicatedFor !== undefined ? indicatedFor : parsedConfig.indicatedFor;
    }

    if (contraindications !== undefined || parsedConfig.contraindications !== undefined) {
      updateData.contraindications = contraindications !== undefined ? contraindications : parsedConfig.contraindications;
    }

    if (isActive !== undefined || parsedConfig.isActive !== undefined) {
      updateData.isActive = isActive !== undefined ? isActive : parsedConfig.isActive;
    }

    // Handle clinical metadata
    const finalInstructions = patientInstructions !== undefined ? patientInstructions :
                             (instructions !== undefined ? instructions : parsedConfig.instructions);
    if (finalInstructions !== undefined) {
      updateData.patientInstructions = finalInstructions;
    }

    if (clinicalGuidelines !== undefined || parsedConfig.clinicalGuidelines !== undefined) {
      updateData.clinicalGuidelines = clinicalGuidelines !== undefined ? clinicalGuidelines : parsedConfig.clinicalGuidelines;
    }

    if (overallRepetitions !== undefined || parsedConfig.overallRepetitions !== undefined) {
      updateData.overallRepetitions = overallRepetitions !== undefined ? overallRepetitions : parsedConfig.overallRepetitions;
    }

    // Handle analysis outputs - critical for backend analysis
    if (analysisOutputs !== undefined || parsedConfig.analysisOutputs !== undefined) {
      updateData.analysisOutputs = analysisOutputs !== undefined ? analysisOutputs : parsedConfig.analysisOutputs;
    }

    const protocol = await prisma.protocol.update({
      where: { id },
      data: updateData,
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            firstName: true,
            middleName: true,
            lastName: true,
            userType: true,
          },
        },
        linkedProject: {
          select: {
            id: true,
            projectName: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'protocol.update',
        resource: 'protocols',
        resourceId: protocol.id,
        details: JSON.stringify({
          ...updateData,
          hasAnalysisOutputs: !!protocol.analysisOutputs,
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Transform for backward compatibility
    const transformedProtocol = transformProtocolResponse(protocol);

    return res.json({
      success: true,
      message: 'Protocol updated successfully',
      data: transformedProtocol,
    });
  } catch (error) {
    console.error('Update protocol error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update protocol',
    });
  }
}

// ============================================================================
// Delete Protocol
// ============================================================================

export async function deleteProtocol(
  req: AuthRequest,
  res: Response
) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userType = req.user!.role;
    const hard = req.body?.hard === true;

    // Check if protocol exists
    const existing = await prisma.protocol.findUnique({
      where: { id },
      select: {
        creatorId: true,
        deletedAt: true,
        protocolName: true,
        _count: {
          select: {
            sessions: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!existing || existing.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found',
      });
    }

    // Check permissions (only creator or admin can delete)
    if (userType !== 'admin' && userType !== 'Admin' && existing.creatorId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this protocol',
      });
    }

    // Prevent hard delete if protocol has sessions
    if (hard && existing._count.sessions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot permanently delete protocol with existing sessions. Use soft delete instead.',
        error: {
          code: 'HAS_DEPENDENCIES',
          details: `Protocol has ${existing._count.sessions} session(s)`,
        },
      });
    }

    if (hard) {
      // Hard delete
      await prisma.protocol.delete({ where: { id } });
    } else {
      // Soft delete
      await prisma.protocol.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'protocol.delete',
        resource: 'protocols',
        resourceId: id,
        details: JSON.stringify({
          name: existing.protocolName,
          hard,
          sessionCount: existing._count.sessions,
          softDelete: !hard,
          permanentDeletionDate: hard ? null : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    return res.json({
      success: true,
      message: hard
        ? 'Protocol permanently deleted'
        : 'Protocol deleted successfully. It will be permanently removed after 15 days.',
    });
  } catch (error) {
    console.error('Delete protocol error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete protocol',
    });
  }
}

// ============================================================================
// Get Protocol Sessions (Recordings)
// ============================================================================

export async function getProtocolSessions(
  req: AuthRequest,
  res: Response
) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userType = req.user!.role;

    // Check if protocol exists and user has access
    const protocol = await prisma.protocol.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        private: true,
        deletedAt: true,
      },
    });

    if (!protocol || protocol.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found',
      });
    }

    // Check access for private protocols
    if (protocol.private && protocol.creatorId !== userId && userType !== 'admin' && userType !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Get sessions for this protocol
    const sessions = await prisma.experimentSession.findMany({
      where: {
        protocolId: id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: {
            id: true,
            patientId: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
        clinician: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Transform sessions for response
    const transformedSessions = sessions.map(s => ({
      ...s,
      patientName: s.patient
        ? [s.patient.firstName, s.patient.middleName, s.patient.lastName].filter(Boolean).join(' ')
        : null,
      // Backward compatibility aliases
      videoDataPath: s.videoDataPath,
      keypointsPath: s.rawKeypointDataPath,
    }));

    return res.json({
      success: true,
      data: transformedSessions,
    });
  } catch (error) {
    console.error('Get protocol sessions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch protocol sessions',
    });
  }
}
