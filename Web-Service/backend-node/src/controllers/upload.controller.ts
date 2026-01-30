// ============================================================================
// UPLOAD CONTROLLER - Handle file uploads and initiate processing
// ============================================================================

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { gcsService } from '../services/gcs.service';
import { queueService } from '../services/queue.service';
import { UploadMetadata, UploadResponse, ProcessingConfiguration } from '../types/processing.types';
import { AuthRequest } from '../middleware/auth.middleware';


// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = process.env.TEMP_UPLOAD_DIR || '/tmp/synaptihand-uploads';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `upload-${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_VIDEO_TYPES || 'mp4,avi,mov').split(',');
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`));
    }
  },
});

/**
 * Upload video file and queue for processing
 */
export const uploadVideo = async (req: AuthRequest, res: Response) => {
  let tempFilePath: string | null = null;

  try {
    // Validate file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    tempFilePath = req.file.path;

    // Parse metadata
    const metadata: UploadMetadata = {
      patientId: req.body.patientId,
      clinicianId: req.body.clinicianId || req.user?.userId,
      protocolId: req.body.protocolId,
      deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : undefined,
      clinicalNotes: req.body.clinicalNotes,
    };

    // Validate required fields
    if (!metadata.patientId) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(400).json({
        success: false,
        error: 'patientId is required',
      });
    }

    // Get patient info to verify existence
    const patient = await prisma.patient.findUnique({
      where: { id: metadata.patientId },
      select: { id: true, patientId: true },
    });

    if (!patient) {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      return res.status(404).json({
        success: false,
        error: 'Patient not found',
      });
    }

    // Create recording session in database
    const recordingSession = await prisma.experimentSession.create({
      data: {
        patientId: metadata.patientId,
        clinicianId: metadata.clinicianId,
        protocolId: metadata.protocolId,
        deviceInfo: metadata.deviceInfo ? JSON.stringify(metadata.deviceInfo) : null,
        clinicalNotes: metadata.clinicalNotes,
        status: 'uploaded',
      },
    });

    // Generate GCS path
    const gcsPath = gcsService.generateRecordingPath({
      organization: 'default',
      patientId: metadata.patientId,
      recordingId: recordingSession.id,
      fileType: 'input',
      fileName: `video_original${path.extname(req.file.originalname)}`,
    });

    // Upload to GCS
    const gcsFullPath = await gcsService.uploadFile(tempFilePath, gcsPath);

    // Update recording session with video path
    await prisma.experimentSession.update({
      where: { id: recordingSession.id },
      data: {
        videoDataPath: gcsFullPath,
        status: 'processing',
      },
    });

    // Queue processing job
    const defaultConfig: ProcessingConfiguration = {
      handDetection: {
        confidence: 0.5,
        maxHands: 2,
      },
      filters: ['butterworth', 'kalman', 'savitzky_golay'],
      analysisTypes: ['tremor', 'rom', 'coordination', 'smoothness'],
      outputFormats: ['video', 'excel', 'dashboards'],
    };

    await queueService.addVideoProcessingJob({
      recordingId: recordingSession.id,
      patientId: metadata.patientId,
      videoGcsPath: gcsFullPath,
      configuration: defaultConfig,
    });

    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Return response
    const response: UploadResponse = {
      success: true,
      recordingId: recordingSession.id,
      uploadedAt: new Date(),
      status: 'processing',
      gcsPath: gcsFullPath,
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error('Error uploading video:', error);

    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
};

/**
 * Get upload/processing status
 */
export const getUploadStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get recording session
    const recording = await prisma.experimentSession.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        videoDataPath: true,
        createdAt: true,
      },
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Get job status from queue
    const jobs = await queueService.getRecordingJobs(id);

    return res.json({
      success: true,
      recording: {
        id: recording.id,
        status: recording.status,
        videoDataPath: recording.videoDataPath,
        createdAt: recording.createdAt,
      },
      jobs,
    });
  } catch (error) {
    console.error('Error getting upload status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    });
  }
};

/**
 * Cancel upload/processing
 */
export const cancelUpload = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get recording session
    const recording = await prisma.experimentSession.findUnique({
      where: { id },
    });

    if (!recording) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Cancel queue jobs
    const { JobType } = require('../services/queue.service');
    const videoJobId = `video-${id}`;
    await queueService.cancelJob(videoJobId, JobType.VIDEO_PROCESSING);

    // Update status
    await prisma.experimentSession.update({
      where: { id },
      data: {
        status: 'failed',
      },
    });

    return res.json({
      success: true,
      message: 'Upload cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling upload:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel upload',
    });
  }
};

// Export multer middleware
export const uploadMiddleware = upload.single('video');
