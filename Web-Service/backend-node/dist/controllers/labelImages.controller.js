"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLabelImage = createLabelImage;
exports.listLabelImages = listLabelImages;
exports.getLabelImage = getLabelImage;
exports.updateLabelImage = updateLabelImage;
exports.deleteLabelImage = deleteLabelImage;
exports.markImageProcessed = markImageProcessed;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const api_types_1 = require("../types/api.types");
const validation_1 = require("../utils/validation");
const audit_1 = require("../utils/audit");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// ============================================================================
// Create Label Image
// ============================================================================
async function createLabelImage(req, res) {
    try {
        const { recordingId } = req.params;
        const userId = req.user.userId;
        const data = req.body;
        // Verify recording exists and user has access
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            select: {
                id: true,
                patientUserId: true,
                clinicianId: true,
                deletedAt: true
            }
        });
        if (!recording || recording.deletedAt) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check access permissions
        const userRole = req.user.role;
        const hasAccess = userRole === api_types_1.UserRole.ADMIN ||
            recording.clinicianId === userId ||
            recording.patientUserId === userId;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this recording'
            });
        }
        // If annotationId is provided, verify it exists and belongs to this recording
        if (data.annotationId) {
            const annotation = await prisma.clinicalAnnotation.findUnique({
                where: { id: data.annotationId },
                select: { recordingSessionId: true }
            });
            if (!annotation || annotation.recordingSessionId !== recordingId) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid annotation ID for this recording'
                });
            }
        }
        // Create label image
        const labelImage = await prisma.labelImage.create({
            data: {
                recordingSessionId: recordingId,
                imageSource: data.imageSource,
                imageType: data.imageType,
                frameNumber: data.frameNumber,
                timestamp: data.timestamp,
                imagePath: data.imagePath,
                thumbnailPath: data.thumbnailPath,
                width: data.width,
                height: data.height,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                landmarksData: data.landmarksData,
                annotationId: data.annotationId,
                title: data.title,
                description: data.description,
                tags: data.tags,
                uploadedBy: userId,
                deviceInfo: data.deviceInfo,
                isPublic: data.isPublic ?? false,
                isProcessed: data.imageSource === 'backend_generated' // Backend images are pre-processed
            },
            include: {
                recordingSession: {
                    select: {
                        id: true,
                        patientUserId: true,
                        recordingDate: true
                    }
                },
                annotation: {
                    select: {
                        id: true,
                        annotationType: true,
                        content: true
                    }
                }
            }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.CLINICAL_ANNOTATION_CREATE, 'label_image', labelImage.id);
        return res.status(201).json({
            success: true,
            message: 'Label image created successfully',
            data: labelImage
        });
    }
    catch (error) {
        console.error('Error creating label image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create label image'
        });
    }
}
// ============================================================================
// List Label Images
// ============================================================================
async function listLabelImages(req, res) {
    try {
        const { recordingId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        const query = req.query;
        // Verify recording exists and user has access
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            select: {
                id: true,
                patientUserId: true,
                clinicianId: true,
                deletedAt: true
            }
        });
        if (!recording || recording.deletedAt) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check access permissions
        const hasAccess = userRole === api_types_1.UserRole.ADMIN ||
            recording.clinicianId === userId ||
            recording.patientUserId === userId;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this recording'
            });
        }
        // Build filters
        const where = {
            recordingSessionId: recordingId,
            deletedAt: null
        };
        if (query.imageSource) {
            where.imageSource = query.imageSource;
        }
        if (query.imageType) {
            where.imageType = query.imageType;
        }
        if (query.annotationId) {
            where.annotationId = query.annotationId;
        }
        if (query.isPublic !== undefined) {
            where.isPublic = query.isPublic === 'true' || query.isPublic === true;
        }
        // Pagination
        const paginationQuery = (0, validation_1.buildPaginationQuery)(query.page || 1, query.limit || 50);
        // Fetch label images
        const [labelImages, totalCount] = await Promise.all([
            prisma.labelImage.findMany({
                where,
                ...paginationQuery,
                orderBy: [
                    { frameNumber: 'asc' },
                    { createdAt: 'desc' }
                ],
                include: {
                    annotation: {
                        select: {
                            id: true,
                            annotationType: true,
                            content: true
                        }
                    }
                }
            }),
            prisma.labelImage.count({ where })
        ]);
        const pagination = (0, validation_1.buildPaginationMeta)(totalCount, query.page ?? 1, query.limit ?? 20);
        return res.json({
            success: true,
            data: labelImages,
            pagination
        });
    }
    catch (error) {
        console.error('Error listing label images:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to list label images'
        });
    }
}
// ============================================================================
// Get Label Image by ID
// ============================================================================
async function getLabelImage(req, res) {
    try {
        const { recordingId, imageId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Verify recording exists and user has access
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            select: {
                id: true,
                patientUserId: true,
                clinicianId: true,
                deletedAt: true
            }
        });
        if (!recording || recording.deletedAt) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check access permissions
        const hasAccess = userRole === api_types_1.UserRole.ADMIN ||
            recording.clinicianId === userId ||
            recording.patientUserId === userId;
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this recording'
            });
        }
        // Fetch label image
        const labelImage = await prisma.labelImage.findUnique({
            where: { id: imageId },
            include: {
                recordingSession: {
                    select: {
                        id: true,
                        patientUserId: true,
                        recordingDate: true
                    }
                },
                annotation: {
                    select: {
                        id: true,
                        annotationType: true,
                        content: true,
                        timestampStart: true,
                        timestampEnd: true
                    }
                }
            }
        });
        if (!labelImage || labelImage.deletedAt || labelImage.recordingSessionId !== recordingId) {
            return res.status(404).json({
                success: false,
                message: 'Label image not found'
            });
        }
        return res.json({
            success: true,
            data: labelImage
        });
    }
    catch (error) {
        console.error('Error fetching label image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch label image'
        });
    }
}
// ============================================================================
// Update Label Image
// ============================================================================
async function updateLabelImage(req, res) {
    try {
        const { recordingId, imageId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        const data = req.body;
        // Verify recording exists and user has access
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            select: {
                id: true,
                patientUserId: true,
                clinicianId: true,
                deletedAt: true
            }
        });
        if (!recording || recording.deletedAt) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check modify permissions (clinician or admin only)
        const canModify = userRole === api_types_1.UserRole.ADMIN ||
            userRole === api_types_1.UserRole.CLINICIAN;
        if (!canModify) {
            return res.status(403).json({
                success: false,
                message: 'Only clinicians and admins can update label images'
            });
        }
        // Verify label image exists
        const existingImage = await prisma.labelImage.findUnique({
            where: { id: imageId },
            select: { recordingSessionId: true, deletedAt: true }
        });
        if (!existingImage || existingImage.deletedAt || existingImage.recordingSessionId !== recordingId) {
            return res.status(404).json({
                success: false,
                message: 'Label image not found'
            });
        }
        // If annotationId is provided, verify it exists
        if (data.annotationId) {
            const annotation = await prisma.clinicalAnnotation.findUnique({
                where: { id: data.annotationId },
                select: { recordingSessionId: true }
            });
            if (!annotation || annotation.recordingSessionId !== recordingId) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid annotation ID for this recording'
                });
            }
        }
        // Update label image
        const labelImage = await prisma.labelImage.update({
            where: { id: imageId },
            data: {
                title: data.title,
                description: data.description,
                tags: data.tags,
                annotationId: data.annotationId,
                isPublic: data.isPublic
            },
            include: {
                annotation: {
                    select: {
                        id: true,
                        annotationType: true,
                        content: true
                    }
                }
            }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.CLINICAL_ANNOTATION_UPDATE, 'label_image', labelImage.id);
        return res.json({
            success: true,
            message: 'Label image updated successfully',
            data: labelImage
        });
    }
    catch (error) {
        console.error('Error updating label image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update label image'
        });
    }
}
// ============================================================================
// Delete Label Image
// ============================================================================
async function deleteLabelImage(req, res) {
    try {
        const { recordingId, imageId } = req.params;
        const userId = req.user.userId;
        const userRole = req.user.role;
        // Verify recording exists and user has access
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            select: {
                id: true,
                patientUserId: true,
                clinicianId: true,
                deletedAt: true
            }
        });
        if (!recording || recording.deletedAt) {
            return res.status(404).json({
                success: false,
                message: 'Recording not found'
            });
        }
        // Check delete permissions (admin or assigned clinician)
        const canDelete = userRole === api_types_1.UserRole.ADMIN ||
            recording.clinicianId === userId;
        if (!canDelete) {
            return res.status(403).json({
                success: false,
                message: 'Only admins or assigned clinicians can delete label images'
            });
        }
        // Verify label image exists
        const existingImage = await prisma.labelImage.findUnique({
            where: { id: imageId },
            select: { recordingSessionId: true, deletedAt: true }
        });
        if (!existingImage || existingImage.deletedAt || existingImage.recordingSessionId !== recordingId) {
            return res.status(404).json({
                success: false,
                message: 'Label image not found'
            });
        }
        // Soft delete
        await prisma.labelImage.update({
            where: { id: imageId },
            data: { deletedAt: new Date() }
        });
        await (0, audit_1.logAction)(req, audit_1.AuditActions.CLINICAL_ANNOTATION_DELETE, 'label_image', imageId);
        return res.json({
            success: true,
            message: 'Label image deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting label image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete label image'
        });
    }
}
// ============================================================================
// Mark Label Image as Processed
// ============================================================================
async function markImageProcessed(req, res) {
    try {
        const { recordingId, imageId } = req.params;
        const { overlaysApplied } = req.body;
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
        // Verify label image exists
        const existingImage = await prisma.labelImage.findUnique({
            where: { id: imageId },
            select: { recordingSessionId: true, deletedAt: true }
        });
        if (!existingImage || existingImage.deletedAt || existingImage.recordingSessionId !== recordingId) {
            return res.status(404).json({
                success: false,
                message: 'Label image not found'
            });
        }
        // Update processing status
        const labelImage = await prisma.labelImage.update({
            where: { id: imageId },
            data: {
                isProcessed: true,
                overlaysApplied: overlaysApplied ? JSON.stringify(overlaysApplied) : null
            }
        });
        return res.json({
            success: true,
            message: 'Label image marked as processed',
            data: labelImage
        });
    }
    catch (error) {
        console.error('Error marking image as processed:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark image as processed'
        });
    }
}
