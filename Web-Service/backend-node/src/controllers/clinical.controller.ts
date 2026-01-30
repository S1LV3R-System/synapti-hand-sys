import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  CreateAnalysisInput,
  UpdateAnalysisInput,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  ListAnnotationsInput,
  CreateComparisonInput,
  ListComparisonsInput
} from '../schemas/clinical.schema';
import { ApiResponse, UserRole } from '../types/api.types';
import { buildPaginationQuery, buildPaginationMeta } from '../utils/validation';
import { logAction, AuditActions } from '../utils/audit';
import {
  analyzeRecordingWithProtocol,
  getMovementAnalysis
} from '../services/analyzers/movementAnalysisOrchestrator';


// ============================================================================
// Clinical Analysis
// ============================================================================

export async function createAnalysis(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const data = req.body;

    // Verify recording exists
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: { id: true, status: true, deletedAt: true }
    });

    if (!recording || recording.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Check if analysis already exists
    const existingAnalysis = await prisma.clinicalAnalysis.findFirst({
      where: {
        recordingSessionId: recordingId,
        analysisType: data.analysisType
      }
    });

    if (existingAnalysis) {
      // Update existing analysis
      const analysis = await prisma.clinicalAnalysis.update({
        where: { id: existingAnalysis.id },
        data,
        include: {
          recordingSession: {
            select: {
              id: true,
              patientId: true,
              recordingDate: true
            }
          }
        }
      });

      await logAction(req, AuditActions.ANALYSIS_UPDATE, 'analysis', analysis.id);

      return res.json({
        success: true,
        message: 'Analysis updated successfully',
        data: analysis
      });
    }

    // Create new analysis
    const analysis = await prisma.clinicalAnalysis.create({
      data: {
        ...data,
        recordingSessionId: recordingId
      },
      include: {
        recordingSession: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    // Update recording status if needed
    if (recording.status === 'processed') {
      await prisma.experimentSession.update({
        where: { id: recordingId },
        data: { status: 'analyzed' }
      });
    }

    await logAction(req, AuditActions.ANALYSIS_CREATE, 'analysis', analysis.id, {
      recordingId,
      analysisType: analysis.analysisType
    });

    return res.status(201).json({
      success: true,
      message: 'Analysis created successfully',
      data: analysis
    });
  } catch (error) {
    console.error('Create analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create analysis',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function getAnalysis(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;

    const analyses = await prisma.clinicalAnalysis.findMany({
      where: { recordingSessionId: recordingId },
      orderBy: { createdAt: 'desc' },
      include: {
        recordingSession: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    await logAction(req, AuditActions.ANALYSIS_VIEW, 'recording', recordingId);

    return res.json({
      success: true,
      data: analyses
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch analysis',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function updateAnalysis(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { analysisId } = req.params;
    const updates = req.body;

    const analysis = await prisma.clinicalAnalysis.update({
      where: { id: analysisId },
      data: updates,
      include: {
        recordingSession: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true
          }
        }
      }
    });

    await logAction(req, AuditActions.ANALYSIS_UPDATE, 'analysis', analysis.id, updates);

    return res.json({
      success: true,
      message: 'Analysis updated successfully',
      data: analysis
    });
  } catch (error) {
    console.error('Update analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update analysis',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// ============================================================================
// Clinical Annotations
// ============================================================================

export async function createAnnotation(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const userId = req.user!.userId;
    const data = req.body;

    // Verify recording exists
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: { id: true, deletedAt: true }
    });

    if (!recording || recording.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    const annotation = await prisma.clinicalAnnotation.create({
      data: {
        ...data,
        recordingSessionId: recordingId,
        clinicianId: userId
      },
      include: {
        clinician: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            organization: true
          }
        },
        recordingSession: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true
          }
        }
      }
    });

    await logAction(req, AuditActions.ANNOTATION_CREATE, 'annotation', annotation.id, {
      recordingId,
      type: annotation.annotationType,
      severity: annotation.severity
    });

    return res.status(201).json({
      success: true,
      message: 'Annotation created successfully',
      data: annotation
    });
  } catch (error) {
    console.error('Create annotation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create annotation',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function listAnnotations(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      annotationType,
      severity,
      isResolved
    } = req.query as any;

    const where: any = {
      recordingSessionId: recordingId,
      ...(annotationType && { annotationType }),
      ...(severity && { severity }),
      ...(isResolved !== undefined && { isResolved })
    };

    const total = await prisma.clinicalAnnotation.count({ where });

    const annotations = await prisma.clinicalAnnotation.findMany({
      where,
      ...buildPaginationQuery(page, limit),
      orderBy: { [sortBy]: sortOrder },
      include: {
        clinician: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    return res.json({
      success: true,
      data: annotations,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    console.error('List annotations error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch annotations',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function updateAnnotation(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { annotationId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const updates = req.body;

    // Check if annotation exists
    const existing = await prisma.clinicalAnnotation.findUnique({
      where: { id: annotationId },
      select: { clinicianId: true }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Only creator or admin can update
    if (userRole !== UserRole.ADMIN && existing.clinicianId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this annotation'
      });
    }

    const annotation = await prisma.clinicalAnnotation.update({
      where: { id: annotationId },
      data: {
        ...updates,
        ...(updates.isResolved && {
          resolvedAt: new Date(),
          resolvedBy: userId
        })
      },
      include: {
        clinician: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    await logAction(req, AuditActions.ANNOTATION_UPDATE, 'annotation', annotation.id, updates);

    return res.json({
      success: true,
      message: 'Annotation updated successfully',
      data: annotation
    });
  } catch (error) {
    console.error('Update annotation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update annotation',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function deleteAnnotation(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { annotationId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Check if annotation exists
    const existing = await prisma.clinicalAnnotation.findUnique({
      where: { id: annotationId },
      select: { clinicianId: true, recordingSessionId: true }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Annotation not found'
      });
    }

    // Only creator or admin can delete
    if (userRole !== UserRole.ADMIN && existing.clinicianId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this annotation'
      });
    }

    await prisma.clinicalAnnotation.delete({
      where: { id: annotationId }
    });

    await logAction(req, AuditActions.ANNOTATION_DELETE, 'annotation', annotationId, {
      recordingId: existing.recordingSessionId
    });

    return res.json({
      success: true,
      message: 'Annotation deleted successfully'
    });
  } catch (error) {
    console.error('Delete annotation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete annotation',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

// ============================================================================
// Recording Comparisons
// ============================================================================

export async function createComparison(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const data: CreateComparisonInput = req.body;

    // Verify both recordings exist
    const [baseline, compared] = await Promise.all([
      prisma.experimentSession.findUnique({
        where: { id: data.baselineRecordingId },
        select: { id: true, patientId: true, deletedAt: true }
      }),
      prisma.experimentSession.findUnique({
        where: { id: data.comparedRecordingId },
        select: { id: true, patientId: true, deletedAt: true }
      })
    ]);

    if (!baseline || baseline.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Baseline recording not found'
      });
    }

    if (!compared || compared.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Compared recording not found'
      });
    }

    // Ensure recordings are from same patient for certain comparison types
    if (
      data.comparisonType === 'longitudinal' &&
      baseline.patientId !== compared.patientId
    ) {
      return res.status(400).json({
        success: false,
        message: 'Longitudinal comparisons must be from the same patient'
      });
    }

    const comparison = await prisma.recordingComparison.create({
      data,
      include: {
        baselineRecording: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        comparedRecording: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    await logAction(req, AuditActions.COMPARISON_CREATE, 'comparison', comparison.id, {
      baselineId: data.baselineRecordingId,
      comparedId: data.comparedRecordingId,
      type: data.comparisonType
    });

    return res.status(201).json({
      success: true,
      message: 'Comparison created successfully',
      data: comparison
    });
  } catch (error) {
    console.error('Create comparison error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create comparison',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function getComparison(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { comparisonId } = req.params;

    const comparison = await prisma.recordingComparison.findUnique({
      where: { id: comparisonId },
      include: {
        baselineRecording: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            duration: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        comparedRecording: {
          select: {
            id: true,
            patientId: true,
            recordingDate: true,
            duration: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!comparison) {
      return res.status(404).json({
        success: false,
        message: 'Comparison not found'
      });
    }

    await logAction(req, AuditActions.COMPARISON_VIEW, 'comparison', comparison.id);

    return res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Get comparison error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch comparison',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

export async function listComparisons(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      recordingId,
      comparisonType
    } = req.query as any;

    const where: any = {
      ...(comparisonType && { comparisonType })
    };

    if (recordingId) {
      where.OR = [
        { baselineRecordingId: recordingId },
        { comparedRecordingId: recordingId }
      ];
    }

    const total = await prisma.recordingComparison.count({ where });

    const comparisons = await prisma.recordingComparison.findMany({
      where,
      ...buildPaginationQuery(page, limit),
      orderBy: { [sortBy]: sortOrder },
      include: {
        baselineRecording: {
          select: {
            id: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        comparedRecording: {
          select: {
            id: true,
            recordingDate: true,
            patientUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    return res.json({
      success: true,
      data: comparisons,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    console.error('List comparisons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch comparisons',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}


// ============================================================================
// Protocol-Based Movement Analysis
// ============================================================================

/**
 * Trigger protocol-based movement analysis for a recording
 * @route POST /api/clinical/recordings/:recordingId/analyze-protocol
 */
export async function analyzeWithProtocol(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const { protocolId } = req.body;

    // Verify recording exists
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: { 
        id: true, 
        status: true, 
        deletedAt: true,
        protocolId: true 
      }
    });

    if (!recording || recording.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Recording not found'
      });
    }

    // Use provided protocolId or recording's assigned protocol
    const targetProtocolId = protocolId || recording.protocolId;
    
    if (!targetProtocolId) {
      return res.status(400).json({
        success: false,
        message: 'No protocol specified. Provide protocolId or assign a protocol to the recording.'
      });
    }

    // Verify protocol exists
    const protocol = await prisma.protocol.findUnique({
      where: { id: targetProtocolId },
      select: { id: true, name: true, deletedAt: true }
    });

    if (!protocol || protocol.deletedAt) {
      return res.status(404).json({
        success: false,
        message: 'Protocol not found'
      });
    }

    // Check for signal processing result
    const signalResult = await prisma.signalProcessingResult.findFirst({
      where: { recordingSessionId: recordingId },
      select: { id: true }
    });

    if (!signalResult) {
      return res.status(400).json({
        success: false,
        message: 'Recording has not been processed yet. Please process the recording first.'
      });
    }

    // Run protocol-based analysis
    const result = await analyzeRecordingWithProtocol({
      recordingSessionId: recordingId,
      protocolId: targetProtocolId
    });

    // Update recording status
    await prisma.experimentSession.update({
      where: { id: recordingId },
      data: { status: 'analyzed' }
    });

    // Audit log
    await logAction(req, AuditActions.ANALYSIS_CREATE, 'clinical_analysis', result.clinicalAnalysisId, {
      recordingId,
      protocolId: targetProtocolId,
      protocolName: protocol.name
    });

    return res.status(200).json({
      success: true,
      message: 'Protocol-based analysis completed successfully',
      data: {
        clinicalAnalysisId: result.clinicalAnalysisId,
        movementAnalysis: result.movementAnalysis,
        overallMetrics: result.overallMetrics,
        timestamp: result.timestamp
      }
    });
  } catch (error) {
    console.error('Protocol analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze recording with protocol',
      error: {
        code: 'ANALYSIS_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Get movement-specific analysis results for a recording
 * @route GET /api/clinical/recordings/:recordingId/movement-analysis
 */
export async function getMovementAnalysisResults(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;

    // Get movement analysis
    const movementAnalysis = await getMovementAnalysis(recordingId);

    if (!movementAnalysis) {
      return res.status(404).json({
        success: false,
        message: 'No movement analysis found for this recording. Run protocol-based analysis first.'
      });
    }

    // Audit log
    await logAction(req, AuditActions.ANALYSIS_VIEW, 'movement_analysis', recordingId);

    return res.json({
      success: true,
      data: movementAnalysis
    });
  } catch (error) {
    console.error('Get movement analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch movement analysis',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Get LSTM event detection results for a recording
 * @route GET /api/clinical/recordings/:recordingId/lstm-events
 */
export async function getLSTMEvents(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;

    // Get LSTM events for this recording
    const lstmEvents = await prisma.lSTMEventDetection.findMany({
      where: { recordingSessionId: recordingId },
      orderBy: { startFrame: 'asc' }
    });

    // Get event summary by category
    const eventSummary: Record<string, { count: number; totalDuration: number }> = {};
    for (const event of lstmEvents) {
      if (!eventSummary[event.category]) {
        eventSummary[event.category] = { count: 0, totalDuration: 0 };
      }
      eventSummary[event.category].count++;
      eventSummary[event.category].totalDuration += event.durationSeconds || 0;
    }

    // Audit log
    await logAction(req, AuditActions.ANALYSIS_VIEW, 'lstm_events', recordingId);

    return res.json({
      success: true,
      data: {
        events: lstmEvents,
        summary: eventSummary,
        totalEvents: lstmEvents.length
      }
    });
  } catch (error) {
    console.error('Get LSTM events error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch LSTM events',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}

/**
 * Get comprehensive analysis results for a recording (combines all analysis data)
 * @route GET /api/clinical/recordings/:recordingId/comprehensive-analysis
 */
export async function getComprehensiveAnalysis(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;

    // Get all analyses in parallel
    const [clinicalAnalyses, movementAnalysis, lstmEvents, signalResult] = await Promise.all([
      prisma.clinicalAnalysis.findMany({
        where: { recordingSessionId: recordingId },
        orderBy: { createdAt: 'desc' }
      }),
      getMovementAnalysis(recordingId),
      prisma.lSTMEventDetection.findMany({
        where: { recordingSessionId: recordingId },
        orderBy: { startFrame: 'asc' }
      }),
      prisma.signalProcessingResult.findFirst({
        where: { recordingSessionId: recordingId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          processingVersion: true,
          filtersApplied: true,
          qualityMetrics: true,
          processingTime: true,
          createdAt: true
        }
      })
    ]);

    // Get LSTM event summary
    const lstmEventSummary: Record<string, { count: number; totalDuration: number }> = {};
    for (const event of lstmEvents) {
      if (!lstmEventSummary[event.category]) {
        lstmEventSummary[event.category] = { count: 0, totalDuration: 0 };
      }
      lstmEventSummary[event.category].count++;
      lstmEventSummary[event.category].totalDuration += event.durationSeconds || 0;
    }

    // Audit log
    await logAction(req, AuditActions.ANALYSIS_VIEW, 'comprehensive_analysis', recordingId);

    return res.json({
      success: true,
      data: {
        clinicalAnalyses,
        movementAnalysis,
        lstmEvents: {
          events: lstmEvents,
          summary: lstmEventSummary,
          totalEvents: lstmEvents.length
        },
        signalProcessing: signalResult,
        hasAnalysis: clinicalAnalyses.length > 0 || !!movementAnalysis || lstmEvents.length > 0
      }
    });
  } catch (error) {
    console.error('Get comprehensive analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive analysis',
      error: {
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
}
