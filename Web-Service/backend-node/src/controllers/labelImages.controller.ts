import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { ApiResponse, UserRole } from '../types/api.types';
import { buildPaginationQuery, buildPaginationMeta } from '../utils/validation';
import { logAction, AuditActions } from '../utils/audit';


// ============================================================================
// Label Image Types
// ============================================================================

interface CreateLabelImageInput {
  imageSource: 'android_screenshot' | 'backend_generated' | 'clinician_upload';
  imageType: 'labeled_frame' | 'screenshot' | 'annotation_image' | 'overlay';
  frameNumber?: number;
  timestamp?: number;
  imagePath: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  landmarksData?: string;
  annotationId?: string;
  title?: string;
  description?: string;
  tags?: string;
  deviceInfo?: string;
  isPublic?: boolean;
}

interface UpdateLabelImageInput {
  title?: string;
  description?: string;
  tags?: string;
  annotationId?: string;
  isPublic?: boolean;
}

interface ListLabelImagesInput {
  page?: number;
  limit?: number;
  imageSource?: string;
  imageType?: string;
  isPublic?: boolean | string; // Can be boolean or string from query params
  annotationId?: string;
}

// ============================================================================
// Create Label Image
// ============================================================================

export async function createLabelImage(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const userId = req.user!.userId;
    const data: CreateLabelImageInput = req.body;

    // Verify recording exists and user has access
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        patientId: true,
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
    const userRole = req.user!.role;
    const hasAccess =
      userRole === UserRole.ADMIN ||
      recording.clinicianId === userId ||
      recording.patientId === userId;

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
            patientId: true,
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

    await logAction(req, AuditActions.CLINICAL_ANNOTATION_CREATE, 'label_image', labelImage.id);

    return res.status(201).json({
      success: true,
      message: 'Label image created successfully',
      data: labelImage
    });
  } catch (error) {
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

export async function listLabelImages(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const query: ListLabelImagesInput = req.query;

    // Verify recording exists and user has access
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        patientId: true,
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
    const hasAccess =
      userRole === UserRole.ADMIN ||
      recording.clinicianId === userId ||
      recording.patientId === userId;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this recording'
      });
    }

    // Build filters
    const where: any = {
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
    const paginationQuery = buildPaginationQuery(query.page || 1, query.limit || 50);

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

    const pagination = buildPaginationMeta(
      totalCount,
      query.page ?? 1,
      query.limit ?? 20
    );

    return res.json({
      success: true,
      data: labelImages,
      pagination
    });
  } catch (error) {
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

export async function getLabelImage(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId, imageId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Verify recording exists and user has access
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        patientId: true,
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
    const hasAccess =
      userRole === UserRole.ADMIN ||
      recording.clinicianId === userId ||
      recording.patientId === userId;

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
            patientId: true,
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
  } catch (error) {
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

export async function updateLabelImage(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId, imageId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const data: UpdateLabelImageInput = req.body;

    // Verify recording exists and user has access
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        patientId: true,
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
    const canModify =
      userRole === UserRole.ADMIN ||
      userRole === UserRole.CLINICIAN;

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

    await logAction(req, AuditActions.CLINICAL_ANNOTATION_UPDATE, 'label_image', labelImage.id);

    return res.json({
      success: true,
      message: 'Label image updated successfully',
      data: labelImage
    });
  } catch (error) {
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

export async function deleteLabelImage(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
  try {
    const { recordingId, imageId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Verify recording exists and user has access
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        patientId: true,
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
    const canDelete =
      userRole === UserRole.ADMIN ||
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

    await logAction(req, AuditActions.CLINICAL_ANNOTATION_DELETE, 'label_image', imageId);

    return res.json({
      success: true,
      message: 'Label image deleted successfully'
    });
  } catch (error) {
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

export async function markImageProcessed(
  req: AuthRequest,
  res: Response
): Promise<Response<ApiResponse>> {
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
  } catch (error) {
    console.error('Error marking image as processed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark image as processed'
    });
  }
}
