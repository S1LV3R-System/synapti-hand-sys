"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalysis = createAnalysis;
exports.getAnalysis = getAnalysis;
exports.updateAnalysis = updateAnalysis;
exports.createAnnotation = createAnnotation;
exports.listAnnotations = listAnnotations;
exports.updateAnnotation = updateAnnotation;
exports.deleteAnnotation = deleteAnnotation;
exports.createComparison = createComparison;
exports.getComparison = getComparison;
exports.listComparisons = listComparisons;
exports.analyzeWithProtocol = analyzeWithProtocol;
exports.getMovementAnalysisResults = getMovementAnalysisResults;
const client_1 = require("@prisma/client");
const api_types_1 = require("../types/api.types");
const validation_1 = require("../utils/validation");
const audit_1 = require("../utils/audit");
const movementAnalysisOrchestrator_1 = require("../services/analyzers/movementAnalysisOrchestrator");
const schema_compat_1 = require("../utils/schema-compat");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// Clinical Analysis
// ============================================================================
async function createAnalysis(req, res) {
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
                            patientUserId: true,
                            recordingDate: true
                        }
                    }
                }
            });
            await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_UPDATE, 'analysis', analysis.id);
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
                        patientUserId: true,
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_CREATE, 'analysis', analysis.id, {
            recordingId,
            analysisType: analysis.analysisType
        });
        return res.status(201).json({
            success: true,
            message: 'Analysis created successfully',
            data: analysis
        });
    }
    catch (error) {
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
async function getAnalysis(req, res) {
    try {
        const { recordingId } = req.params;
        const analyses = await prisma.clinicalAnalysis.findMany({
            where: { recordingSessionId: recordingId },
            orderBy: { createdAt: 'desc' },
            include: {
                recordingSession: {
                    select: {
                        id: true,
                        patientUserId: true,
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_VIEW, 'recording', recordingId);
        return res.json({
            success: true,
            data: analyses
        });
    }
    catch (error) {
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
async function updateAnalysis(req, res) {
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
                        patientUserId: true,
                        recordingDate: true
                    }
                }
            }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_UPDATE, 'analysis', analysis.id, updates);
        return res.json({
            success: true,
            message: 'Analysis updated successfully',
            data: analysis
        });
    }
    catch (error) {
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
async function createAnnotation(req, res) {
    try {
        const { recordingId } = req.params;
        const userId = req.user.userId;
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
                        patientUserId: true,
                        recordingDate: true
                    }
                }
            }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANNOTATION_CREATE, 'annotation', annotation.id, {
            recordingId,
            type: annotation.annotationType,
            severity: annotation.severity
        });
        return res.status(201).json({
            success: true,
            message: 'Annotation created successfully',
            data: annotation
        });
    }
    catch (error) {
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
async function listAnnotations(req, res) {
    try {
        const { recordingId } = req.params;
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', annotationType, severity, isResolved } = req.query;
        const where = {
            recordingSessionId: recordingId,
            ...(annotationType && { annotationType }),
            ...(severity && { severity }),
            ...(isResolved !== undefined && { isResolved })
        };
        const total = await prisma.clinicalAnnotation.count({ where });
        const annotations = await prisma.clinicalAnnotation.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
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
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
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
async function updateAnnotation(req, res) {
    try {
        const { annotationId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
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
        if (userRole !== api_types_1.UserRole.ADMIN && existing.clinicianId !== userId) {
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANNOTATION_UPDATE, 'annotation', annotation.id, updates);
        return res.json({
            success: true,
            message: 'Annotation updated successfully',
            data: annotation
        });
    }
    catch (error) {
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
async function deleteAnnotation(req, res) {
    try {
        const { annotationId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
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
        if (userRole !== api_types_1.UserRole.ADMIN && existing.clinicianId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this annotation'
            });
        }
        await prisma.clinicalAnnotation.delete({
            where: { id: annotationId }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANNOTATION_DELETE, 'annotation', annotationId, {
            recordingId: existing.recordingSessionId
        });
        return res.json({
            success: true,
            message: 'Annotation deleted successfully'
        });
    }
    catch (error) {
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
async function createComparison(req, res) {
    try {
        const data = req.body;
        // Verify both recordings exist
        const [baseline, compared] = await Promise.all([
            prisma.experimentSession.findUnique({
                where: { id: data.baselineRecordingId },
                select: { id: true, patientUserId: true, deletedAt: true }
            }),
            prisma.experimentSession.findUnique({
                where: { id: data.comparedRecordingId },
                select: { id: true, patientUserId: true, deletedAt: true }
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
        if (data.comparisonType === 'longitudinal' &&
            baseline.patientUserId !== compared.patientUserId) {
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
                        patientUserId: true,
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
                        patientUserId: true,
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.COMPARISON_CREATE, 'comparison', comparison.id, {
            baselineId: data.baselineRecordingId,
            comparedId: data.comparedRecordingId,
            type: data.comparisonType
        });
        return res.status(201).json({
            success: true,
            message: 'Comparison created successfully',
            data: comparison
        });
    }
    catch (error) {
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
async function getComparison(req, res) {
    try {
        const { comparisonId } = req.params;
        const comparison = await prisma.recordingComparison.findUnique({
            where: { id: comparisonId },
            include: {
                baselineRecording: {
                    select: {
                        id: true,
                        patientUserId: true,
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
                        patientUserId: true,
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
        await (0, audit_1.logAction)(req, audit_1.AuditActions.COMPARISON_VIEW, 'comparison', comparison.id);
        return res.json({
            success: true,
            data: comparison
        });
    }
    catch (error) {
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
async function listComparisons(req, res) {
    try {
        const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', recordingId, comparisonType } = req.query;
        const where = {
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
            ...(0, validation_1.buildPaginationQuery)(page, limit),
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
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
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
async function analyzeWithProtocol(req, res) {
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
        const result = await (0, movementAnalysisOrchestrator_1.analyzeRecordingWithProtocol)({
            recordingSessionId: recordingId,
            protocolId: targetProtocolId
        });
        // Update recording status
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: { status: 'analyzed' }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_CREATE, 'clinical_analysis', result.clinicalAnalysisId, {
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
    }
    catch (error) {
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
async function getMovementAnalysisResults(req, res) {
    try {
        const { recordingId } = req.params;
        // Get movement analysis
        const movementAnalysis = await (0, movementAnalysisOrchestrator_1.getMovementAnalysis)(recordingId);
        if (!movementAnalysis) {
            return res.status(404).json({
                success: false,
                message: 'No movement analysis found for this recording. Run protocol-based analysis first.'
            });
        }
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.ANALYSIS_VIEW, 'movement_analysis', recordingId);
        return res.json({
            success: true,
            data: movementAnalysis
        });
    }
    catch (error) {
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
