"use strict";
// ============================================================================
// UPLOAD CONTROLLER - Handle file uploads and initiate processing
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadMiddleware = exports.cancelUpload = exports.getUploadStatus = exports.uploadVideo = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const gcs_service_1 = require("../services/gcs.service");
const queue_service_1 = require("../services/queue.service");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = process.env.TEMP_UPLOAD_DIR || '/tmp/synaptihand-uploads';
            if (!fs_1.default.existsSync(uploadDir)) {
                fs_1.default.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, `upload-${uniqueSuffix}${path_1.default.extname(file.originalname)}`);
        },
    }),
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_VIDEO_TYPES || 'mp4,avi,mov').split(',');
        const ext = path_1.default.extname(file.originalname).toLowerCase().replace('.', '');
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`));
        }
    },
});
/**
 * Upload video file and queue for processing
 */
const uploadVideo = async (req, res) => {
    let tempFilePath = null;
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
        const metadata = {
            patientUserId: req.body.patientUserId,
            clinicianId: req.body.clinicianId || req.user?.userId,
            protocolId: req.body.protocolId,
            deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : undefined,
            clinicalNotes: req.body.clinicalNotes,
        };
        // Validate required fields
        if (!metadata.patientUserId) {
            if (tempFilePath && fs_1.default.existsSync(tempFilePath)) {
                fs_1.default.unlinkSync(tempFilePath);
            }
            return res.status(400).json({
                success: false,
                error: 'patientId is required',
            });
        }
        // Get patient info to determine organization
        const patient = await prisma.user.findUnique({
            where: { id: metadata.patientUserId },
            select: { organization: true },
        });
        if (!patient) {
            if (tempFilePath && fs_1.default.existsSync(tempFilePath)) {
                fs_1.default.unlinkSync(tempFilePath);
            }
            return res.status(404).json({
                success: false,
                error: 'Patient not found',
            });
        }
        // Create recording session in database
        const recordingSession = await prisma.experimentSession.create({
            data: {
                patientUserId: metadata.patientUserId,
                clinicianId: metadata.clinicianId,
                protocolId: metadata.protocolId,
                deviceInfo: metadata.deviceInfo ? JSON.stringify(metadata.deviceInfo) : null,
                clinicalNotes: metadata.clinicalNotes,
                status: 'uploaded',
                processingMetadata: JSON.stringify({
                    uploadedAt: new Date().toISOString(),
                    originalFilename: req.file.originalname,
                    fileSize: req.file.size,
                }),
            },
        });
        // Generate GCS path
        const organization = patient.organization || 'default';
        const gcsPath = gcs_service_1.gcsService.generateRecordingPath({
            organization,
            patientUserId: metadata.patientUserId,
            recordingId: recordingSession.id,
            fileType: 'input',
            fileName: `video_original${path_1.default.extname(req.file.originalname)}`,
        });
        // Upload to GCS
        const gcsFullPath = await gcs_service_1.gcsService.uploadFile(tempFilePath, gcsPath);
        // Update recording session with video path
        await prisma.experimentSession.update({
            where: { id: recordingSession.id },
            data: {
                videoPath: gcsFullPath,
                status: 'processing',
            },
        });
        // Queue processing job
        const defaultConfig = {
            handDetection: {
                confidence: 0.5,
                maxHands: 2,
            },
            filters: ['butterworth', 'kalman', 'savitzky_golay'],
            analysisTypes: ['tremor', 'rom', 'coordination', 'smoothness'],
            outputFormats: ['video', 'excel', 'dashboards'],
        };
        await queue_service_1.queueService.addVideoProcessingJob({
            recordingId: recordingSession.id,
            patientUserId: metadata.patientUserId,
            videoGcsPath: gcsFullPath,
            configuration: defaultConfig,
        });
        // Clean up temp file
        if (tempFilePath && fs_1.default.existsSync(tempFilePath)) {
            fs_1.default.unlinkSync(tempFilePath);
        }
        // Return response
        const response = {
            success: true,
            recordingId: recordingSession.id,
            uploadedAt: new Date(),
            status: 'processing',
            gcsPath: gcsFullPath,
        };
        return res.status(201).json(response);
    }
    catch (error) {
        console.error('Error uploading video:', error);
        // Clean up temp file on error
        if (tempFilePath && fs_1.default.existsSync(tempFilePath)) {
            fs_1.default.unlinkSync(tempFilePath);
        }
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        });
    }
};
exports.uploadVideo = uploadVideo;
/**
 * Get upload/processing status
 */
const getUploadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        // Get recording session
        const recording = await prisma.experimentSession.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                videoPath: true,
                processingMetadata: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!recording) {
            return res.status(404).json({
                success: false,
                error: 'Recording not found',
            });
        }
        // Get job status from queue
        const jobs = await queue_service_1.queueService.getRecordingJobs(id);
        return res.json({
            success: true,
            recording: {
                id: recording.id,
                status: recording.status,
                videoPath: recording.videoPath,
                processingMetadata: recording.processingMetadata
                    ? JSON.parse(recording.processingMetadata)
                    : null,
                createdAt: recording.createdAt,
                updatedAt: recording.updatedAt,
            },
            jobs,
        });
    }
    catch (error) {
        console.error('Error getting upload status:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get status',
        });
    }
};
exports.getUploadStatus = getUploadStatus;
/**
 * Cancel upload/processing
 */
const cancelUpload = async (req, res) => {
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
        await queue_service_1.queueService.cancelJob(videoJobId, JobType.VIDEO_PROCESSING);
        // Update status
        await prisma.experimentSession.update({
            where: { id },
            data: {
                status: 'failed',
                processingMetadata: JSON.stringify({
                    ...JSON.parse(recording.processingMetadata || '{}'),
                    cancelledAt: new Date().toISOString(),
                    cancelledBy: req.user?.userId,
                }),
            },
        });
        return res.json({
            success: true,
            message: 'Upload cancelled successfully',
        });
    }
    catch (error) {
        console.error('Error cancelling upload:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel upload',
        });
    }
};
exports.cancelUpload = cancelUpload;
// Export multer middleware
exports.uploadMiddleware = upload.single('video');
