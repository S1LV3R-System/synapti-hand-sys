"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecording = createRecording;
exports.listRecordings = listRecordings;
exports.getRecording = getRecording;
exports.updateRecording = updateRecording;
exports.updateRecordingStatus = updateRecordingStatus;
exports.updateReviewStatus = updateReviewStatus;
exports.getRecordingFiles = getRecordingFiles;
exports.deleteRecording = deleteRecording;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const api_types_1 = require("../types/api.types");
const validation_1 = require("../utils/validation");
const audit_1 = require("../utils/audit");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// Create Recording Session
// ============================================================================
async function createRecording(req, res) {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        const data = req.body;
        // Validate patient exists
        const patient = await prisma.user.findUnique({
            where: { id: data.patientUserId },
            select: { role: true, isActive: true }
        });
        if (!patient || !patient.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or inactive patient'
            });
        }
        // Clinicians can create recordings for any patient
        // Admins have full access
        // (No patient self-recording restriction since PATIENT role removed)
        // Validate clinician if provided
        if (data.clinicianId) {
            const clinician = await prisma.user.findUnique({
                where: { id: data.clinicianId },
                select: { role: true, isActive: true }
            });
            if (!clinician || !clinician.isActive ||
                (clinician.role !== api_types_1.UserRole.CLINICIAN && clinician.role !== api_types_1.UserRole.ADMIN)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid clinician'
                });
            }
        }
        // Validate protocol if provided
        if (data.protocolId) {
            const protocol = await prisma.protocol.findUnique({
                where: { id: data.protocolId },
                select: { isActive: true, deletedAt: true }
            });
            if (!protocol || !protocol.isActive || protocol.deletedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or inactive protocol'
                });
            }
        }
        const recording = await prisma.experimentSession.create({
            data,
            include: {
                patientUser: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                },
                clinician: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true
                    }
                },
                protocol: {
                    select: {
                        id: true,
                        name: true,
                        version: true
                    }
                }
            }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_CREATE, 'recording', recording.id, {
            patientId: recording.patientUserId,
            protocolId: recording.protocolId,
            status: recording.status
        });
        return res.status(201).json({
            success: true,
            message: 'Recording session created successfully',
            data: recording
        });
    }
    catch (error) {
        console.error('Create recording error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create recording session',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// List Recording Sessions
// ============================================================================
async function listRecordings(req, res) {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;
        const filters = req.query;
        const { page = 1, limit = 20, sortBy = 'recordingDate', sortOrder = 'desc', patientUserId, clinicianId, protocolId, status, reviewStatus, startDate, endDate, search, includeDeleted = false } = filters;
        // Build where clause
        const where = {
            ...(0, validation_1.buildSoftDeleteFilter)(includeDeleted),
            ...(status && { status }),
            ...(reviewStatus && { reviewStatus }),
            ...(protocolId && { protocolId }),
            ...(0, validation_1.buildDateRangeFilter)('recordingDate', startDate, endDate)
        };
        // Apply role-based filtering
        if (userRole === api_types_1.UserRole.CLINICIAN) {
            // Clinicians can see recordings they're assigned to
            if (patientUserId) {
                where.patientUserId = patientUserId;
                where.clinicianId = userId;
            }
            else {
                where.clinicianId = clinicianId || userId;
            }
        }
        else if (userRole === api_types_1.UserRole.ADMIN) {
            // Admins can see all recordings including mobile uploads
            if (patientUserId)
                where.patientUserId = patientUserId;
            if (clinicianId)
                where.clinicianId = clinicianId;
            // Note: No filtering by clinicianId for admins - they see ALL recordings
            // including mobile uploads which have no clinician assigned
        }
        else {
            // CRITICAL: All other user roles (researcher, patient, etc.) should NOT see any recordings
            // unless they are the patient or owner of the recording
            // Default to empty result set - only accessible via specific ID with access check middleware
            where.AND = [{ id: 'INVALID_UUID_PATTERN' }]; // This will return no results
        }
        // Add search filter
        if (search) {
            const searchFilter = (0, validation_1.buildSearchFilter)(search, ['clinicalNotes']);
            Object.assign(where, searchFilter);
        }
        // Count total
        const total = await prisma.experimentSession.count({ where });
        // Fetch recordings
        const recordings = await prisma.experimentSession.findMany({
            where,
            ...(0, validation_1.buildPaginationQuery)(page, limit),
            orderBy: { [sortBy]: sortOrder },
            include: {
                patientUser: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                patientModel: {
                    select: {
                        id: true,
                        patientId: true,
                        patientName: true
                    }
                },
                clinician: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                protocol: {
                    select: {
                        id: true,
                        name: true,
                        version: true
                    }
                },
                _count: {
                    select: {
                        clinicalAnalyses: true,
                        annotations: true
                    }
                }
            }
        });
        // Transform recordings to match frontend expected structure
        const transformedRecordings = recordings.map((recording) => {
            // Determine patient info - prefer Patient model, fallback to User (mobile uploads)
            let patient = null;
            if (recording.patientModel) {
                // Use Patient model (has patientName)
                const nameParts = recording.patientModel.patientName?.split(' ') || ['Unknown'];
                patient = {
                    id: recording.patientModel.id,
                    firstName: nameParts[0] || 'Unknown',
                    lastName: nameParts.slice(1).join(' ') || '',
                    mrn: recording.patientModel.patientId || null
                };
            }
            else if (recording.patientUser) {
                // Use User model (mobile uploads use this)
                patient = {
                    id: recording.patientUser.id,
                    firstName: recording.patientUser.firstName || 'Mobile',
                    lastName: recording.patientUser.lastName || 'Upload',
                    mrn: null
                };
            }
            return {
                ...recording,
                // Map to frontend expected field names
                patientId: recording.patientModelId || recording.patientUserId,
                patient: patient,
                // Keep original fields for backward compatibility
                patientUser: recording.patientUser,
                patientModel: recording.patientModel
            };
        });
        return res.json({
            success: true,
            data: transformedRecordings,
            pagination: (0, validation_1.buildPaginationMeta)(page, limit, total)
        });
    }
    catch (error) {
        console.error('List recordings error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch recordings',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Get Recording Session
// ============================================================================
async function getRecording(req, res) {
    try {
        const { id } = req.params;
        const queryParams = req.query;
        const includeAnalysis = queryParams.includeAnalysis === 'true' || queryParams.includeAnalysis === true;
        const includeAnnotations = queryParams.includeAnnotations === 'true' || queryParams.includeAnnotations === true;
        const includeProcessing = queryParams.includeProcessing === 'true' || queryParams.includeProcessing === true;
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            include: {
                patientUser: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                clinician: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        organization: true
                    }
                },
                protocol: true,
                reviewer: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                ...(includeAnalysis && {
                    clinicalAnalyses: {
                        orderBy: { createdAt: 'desc' }
                    }
                }),
                ...(includeAnnotations && {
                    annotations: {
                        include: {
                            clinician: {
                                select: {
                                    id: true,
                                    email: true,
                                    firstName: true,
                                    lastName: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }),
                ...(includeProcessing && {
                    signalProcessingResults: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                })
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check soft delete
        if (recording.deletedAt && req.user?.role !== api_types_1.UserRole.ADMIN) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_VIEW, 'recording', recording.id);
        return res.json({
            success: true,
            data: recording
        });
    }
    catch (error) {
        console.error('Get recording error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch recording',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Update Recording Session
// ============================================================================
async function updateRecording(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Validate protocol if provided
        if (updates.protocolId) {
            const protocol = await prisma.protocol.findUnique({
                where: { id: updates.protocolId },
                select: { isActive: true, deletedAt: true }
            });
            if (!protocol || !protocol.isActive || protocol.deletedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or inactive protocol'
                });
            }
        }
        const recording = await prisma.experimentSession.update({
            where: { id },
            data: updates,
            include: {
                patientUser: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                clinician: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                protocol: {
                    select: {
                        id: true,
                        name: true,
                        version: true
                    }
                }
            }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_UPDATE, 'recording', recording.id, updates);
        return res.json({
            success: true,
            message: 'Recording updated successfully',
            data: recording
        });
    }
    catch (error) {
        console.error('Update recording error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update recording',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Update Recording Status
// ============================================================================
async function updateRecordingStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, processingMetadata } = req.body;
        const recording = await prisma.experimentSession.update({
            where: { id },
            data: {
                status,
                ...(processingMetadata && { processingMetadata })
            }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_STATUS_CHANGE, 'recording', recording.id, {
            oldStatus: recording.status,
            newStatus: status
        });
        return res.json({
            success: true,
            message: 'Recording status updated successfully',
            data: recording
        });
    }
    catch (error) {
        console.error('Update recording status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update recording status',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Update Review Status
// ============================================================================
async function updateReviewStatus(req, res) {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        const { reviewStatus, reviewNotes } = req.body;
        const recording = await prisma.experimentSession.update({
            where: { id },
            data: {
                reviewStatus,
                reviewedById: userId,
                reviewedAt: new Date(),
                ...(reviewNotes && {
                    clinicalNotes: reviewNotes
                })
            },
            include: {
                patientUser: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                },
                reviewer: {
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_REVIEW, 'recording', recording.id, {
            reviewStatus,
            reviewedBy: userId
        });
        return res.json({
            success: true,
            message: 'Review status updated successfully',
            data: recording
        });
    }
    catch (error) {
        console.error('Update review status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update review status',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Get Recording Files (Signed URLs for Downloads)
// ============================================================================
/**
 * Get downloadable files for a recording session with signed URLs.
 * Returns URLs for video, labeled video, keypoints CSV, analysis XLSX, and PDF reports.
 */
async function getRecordingFiles(req, res) {
    try {
        const { id } = req.params;
        // Get recording with all file paths
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                id: true,
                videoPath: true,
                csvPath: true,
                keypointsPath: true,
                metadataPath: true,
                status: true,
                deletedAt: true,
                patientModel: {
                    select: {
                        patientName: true
                    }
                }
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check soft delete
        if (recording.deletedAt && req.user?.role !== api_types_1.UserRole.ADMIN) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Import GCS service
        const { gcsService } = require('../services/gcs.service');
        // Build list of available files with signed URLs
        const files = [];
        // Original video
        if (recording.videoPath) {
            try {
                const url = await gcsService.generateSignedUrl(recording.videoPath, 120); // 2 hour expiry for video
                files.push({
                    type: 'video',
                    name: 'Original Video (MP4)',
                    url,
                    available: true
                });
            }
            catch (err) {
                files.push({
                    type: 'video',
                    name: 'Original Video (MP4)',
                    url: null,
                    available: false
                });
            }
        }
        // Keypoints CSV
        if (recording.keypointsPath) {
            try {
                const url = await gcsService.generateSignedUrl(recording.keypointsPath, 60);
                files.push({
                    type: 'keypoints',
                    name: 'Keypoints Data (CSV)',
                    url,
                    available: true
                });
            }
            catch (err) {
                files.push({
                    type: 'keypoints',
                    name: 'Keypoints Data (CSV)',
                    url: null,
                    available: false
                });
            }
        }
        // Check for analysis outputs in Result-Output folder
        const resultPrefix = `Result-Output/${id}`;
        try {
            const resultFiles = await gcsService.listFiles(resultPrefix);
            for (const gcsPath of resultFiles) {
                const fileName = gcsPath.split('/').pop() || '';
                // XLSX analysis file
                if (fileName.endsWith('.xlsx')) {
                    const url = await gcsService.generateSignedUrl(gcsPath, 60);
                    files.push({
                        type: 'analysis_xlsx',
                        name: `Analysis Report (${fileName})`,
                        url,
                        available: true
                    });
                }
                // PDF report
                if (fileName.endsWith('.pdf')) {
                    const url = await gcsService.generateSignedUrl(gcsPath, 60);
                    files.push({
                        type: 'report_pdf',
                        name: `Clinical Report (${fileName})`,
                        url,
                        available: true
                    });
                }
                // PNG dashboard/charts
                if (fileName.endsWith('.png') && !fileName.includes('thumbnail')) {
                    const url = await gcsService.generateSignedUrl(gcsPath, 60);
                    files.push({
                        type: 'chart_image',
                        name: `Analysis Chart (${fileName})`,
                        url,
                        available: true
                    });
                }
                // Labeled video (generated by processing service)
                if (fileName.endsWith('.mp4') && (fileName.includes('labeled') || fileName.includes('labelled'))) {
                    const url = await gcsService.generateSignedUrl(gcsPath, 120);
                    files.push({
                        type: 'labelled_video',
                        name: 'Labeled Video (MP4)',
                        url,
                        available: true
                    });
                }
            }
        }
        catch (err) {
            console.warn(`Could not list result files for recording ${id}:`, err);
        }
        // Audit log
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_VIEW, 'recording', recording.id, {
            action: 'download_files_requested',
            fileCount: files.filter(f => f.available).length
        });
        return res.json({
            success: true,
            data: {
                recordingId: recording.id,
                status: recording.status,
                patientName: recording.patientModel?.patientName || 'Unknown',
                files: files,
                totalAvailable: files.filter(f => f.available).length
            }
        });
    }
    catch (error) {
        console.error('Get recording files error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get recording files',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
// ============================================================================
// Delete Recording Session
// ============================================================================
/**
 * Soft delete a recording session and clean up associated GCS files.
 * The recording will be permanently deleted after 15 days by the cleanup job.
 */
async function deleteRecording(req, res) {
    try {
        const { id } = req.params;
        const userId = req.user.userId;
        // Get recording details before deletion
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            include: {
                clinicalAnalyses: { select: { id: true } },
                annotations: { select: { id: true } }
            }
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Import queue service to cancel jobs
        const { queueService } = require('../services/queue.service');
        const { JobType } = require('../services/queue.service');
        // Cancel all linked processing jobs
        const jobsToCancel = [
            { jobId: `video-${id}`, type: JobType.VIDEO_PROCESSING },
            { jobId: `analysis-${id}`, type: JobType.ANALYSIS_GENERATION },
            { jobId: `report-${id}`, type: JobType.REPORT_GENERATION }
        ];
        const cancelledJobs = [];
        for (const job of jobsToCancel) {
            try {
                const cancelled = await queueService.cancelJob(job.jobId, job.type);
                if (cancelled) {
                    cancelledJobs.push(job.jobId);
                }
            }
            catch (err) {
                console.warn(`Failed to cancel job ${job.jobId}:`, err);
            }
        }
        // NOTE: GCS files are NOT deleted on soft-delete!
        // Files will be deleted by the cleanup worker after 15 days when the record is permanently deleted.
        // This allows recovery of recordings within the retention period.
        // Track GCS paths that will be deleted later (for audit logging)
        const gcsPathsForLaterDeletion = [];
        if (recording.videoPath)
            gcsPathsForLaterDeletion.push(recording.videoPath);
        if (recording.csvPath)
            gcsPathsForLaterDeletion.push(recording.csvPath);
        if (recording.keypointsPath)
            gcsPathsForLaterDeletion.push(recording.keypointsPath);
        if (recording.metadataPath)
            gcsPathsForLaterDeletion.push(recording.metadataPath);
        // Delete clinical analyses linked to this recording (hard delete since they have no soft delete support)
        const deletedAnalyses = await prisma.clinicalAnalysis.deleteMany({
            where: { recordingSessionId: id }
        });
        // Delete clinical annotations linked to this recording
        const deletedAnnotations = await prisma.clinicalAnnotation.deleteMany({
            where: { recordingSessionId: id }
        });
        // Delete signal processing results linked to this recording
        const deletedProcessingResults = await prisma.signalProcessingResult.deleteMany({
            where: { recordingSessionId: id }
        });
        // Delete label images linked to this recording
        const deletedLabelImages = await prisma.labelImage.deleteMany({
            where: { recordingSessionId: id }
        });
        // Soft delete the recording itself
        const deletedRecording = await prisma.experimentSession.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                status: 'cancelled', // Mark status as cancelled
                reviewStatus: 'cancelled'
            }
        });
        // Audit log with soft-delete details (GCS files preserved for recovery)
        await (0, audit_1.logAction)(req, audit_1.AuditActions.RECORDING_DELETE, 'recording', id, {
            softDelete: true,
            cancelledJobs,
            gcsFilesPreserved: gcsPathsForLaterDeletion,
            deletedAnalyses: deletedAnalyses.count,
            deletedAnnotations: deletedAnnotations.count,
            deletedProcessingResults: deletedProcessingResults.count,
            deletedLabelImages: deletedLabelImages.count,
            permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
        });
        console.log(`Recording ${id} soft-deleted by user ${userId}. Cancelled ${cancelledJobs.length} jobs. GCS files preserved for 15-day recovery period. Deleted ${deletedAnalyses.count} analyses, ${deletedAnnotations.count} annotations, ${deletedProcessingResults.count} processing results, and ${deletedLabelImages.count} label images.`);
        return res.json({
            success: true,
            message: 'Recording soft-deleted. GCS files preserved for 15-day recovery period.',
            data: {
                id: deletedRecording.id,
                deletedAt: deletedRecording.deletedAt,
                cancelledJobs,
                gcsFilesPreserved: gcsPathsForLaterDeletion.length,
                deletedAnalyses: deletedAnalyses.count,
                deletedAnnotations: deletedAnnotations.count,
                deletedProcessingResults: deletedProcessingResults.count,
                deletedLabelImages: deletedLabelImages.count,
                permanentDeletionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
            }
        });
    }
    catch (error) {
        console.error('Delete recording error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete recording',
            error: {
                code: 'INTERNAL_ERROR',
                details: error instanceof Error ? error.message : 'Unknown error'
            }
        });
    }
}
