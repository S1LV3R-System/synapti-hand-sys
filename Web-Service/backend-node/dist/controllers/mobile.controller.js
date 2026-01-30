"use strict";
// ============================================================================
// MOBILE CONTROLLER - Handle uploads from Android/iOS mobile apps
// ============================================================================
// Architecture: Android → Backend API → GCS (service account)
// Security: Android NEVER sees GCS credentials. All uploads go through backend.
// Updated for Experiment-Session schema (replaces RecordingSession)
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtocols = exports.generateLabeledVideo = exports.listMobileUploads = exports.getMobileUploadStatus = exports.uploadMobileRecording = exports.getSessionStatus = exports.uploadVideo = exports.uploadKeypoints = exports.videoUploadMiddleware = exports.keypointsUploadMiddleware = exports.mobileUploadMiddleware = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const gcs_service_1 = require("../services/gcs.service");
const queue_service_1 = require("../services/queue.service");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
// Configure multer for mobile file uploads
const mobileUpload = (0, multer_1.default)({
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
            const ext = path_1.default.extname(file.originalname);
            cb(null, `mobile-${uniqueSuffix}${ext}`);
        },
    }),
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
    },
});
// Multer fields configuration for legacy unified upload
exports.mobileUploadMiddleware = mobileUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'keypoints', maxCount: 1 },
    { name: 'metadata', maxCount: 1 },
    { name: 'screenRecording', maxCount: 1 },
]);
// Multer for keypoints-only upload (priority channel)
exports.keypointsUploadMiddleware = mobileUpload.fields([
    { name: 'keypoints', maxCount: 1 },
    { name: 'metadata', maxCount: 1 },
]);
// Multer for video-only upload (background channel)
exports.videoUploadMiddleware = mobileUpload.single('video');
// ============================================================================
// PARALLEL UPLOAD ENDPOINTS
// ============================================================================
/**
 * POST /api/mobile/keypoints - Priority Channel
 * Upload keypoints CSV and metadata to start analysis immediately
 * This creates the session and queues analysis - doesn't wait for video
 *
 * Updated for Experiment-Session schema:
 * - Uses experimentSession model
 * - Stores gripStrength as Float array
 * - Uses pre-computed GCS paths
 */
const uploadKeypoints = async (req, res) => {
    const tempFiles = [];
    try {
        const files = req.files;
        const sessionId = req.body.session_id;
        const patientId = req.body.patient_id;
        // Validate required fields
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'session_id is required',
            });
        }
        const keypointsFile = files?.keypoints?.[0];
        const metadataFile = files?.metadata?.[0];
        if (!keypointsFile) {
            return res.status(400).json({
                success: false,
                error: 'keypoints file is required',
            });
        }
        // Track temp files for cleanup
        if (keypointsFile)
            tempFiles.push(keypointsFile.path);
        if (metadataFile)
            tempFiles.push(metadataFile.path);
        // Check if session already exists (prevent duplicate uploads)
        const existingSession = await prisma.experimentSession.findUnique({
            where: { mobileSessionId: sessionId },
        });
        if (existingSession) {
            cleanupTempFiles(tempFiles);
            return res.status(409).json({
                success: false,
                error: 'Session already exists',
                sessionId: existingSession.id,
                status: existingSession.status,
            });
        }
        // Parse metadata if provided
        let metadata = {};
        if (metadataFile) {
            try {
                const metadataContent = fs_1.default.readFileSync(metadataFile.path, 'utf-8');
                metadata = JSON.parse(metadataContent);
            }
            catch (e) {
                console.warn('Failed to parse metadata file:', e);
            }
        }
        // Validate patient exists and get clinician info
        const patientInfo = await getPatientAndClinician(patientId);
        if (!patientInfo) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                error: 'Patient not found or invalid',
                errorCode: 'PATIENT_NOT_FOUND',
            });
        }
        // Extract protocol ID from metadata if provided
        const protocolId = metadata.protocolId || null;
        if (protocolId) {
            console.log(`[PARALLEL] Protocol ID from metadata: ${protocolId}`);
        }
        // Validate protocol exists if provided
        if (protocolId) {
            const protocol = await prisma.protocol.findUnique({
                where: { id: protocolId },
            });
            if (!protocol || protocol.deletedAt) {
                cleanupTempFiles(tempFiles);
                return res.status(400).json({
                    success: false,
                    error: 'Protocol not found or deleted',
                    errorCode: 'PROTOCOL_NOT_FOUND',
                });
            }
        }
        // Pre-compute GCS paths for strict NOT NULL schema
        const videoDataPath = `Uploads-mp4/${sessionId}/video.mp4`;
        const rawKeypointDataPath = `Uploads-CSV/${sessionId}/keypoints.csv`;
        const analyzedXlsxPath = `Result-Output/${sessionId}/analysis.xlsx`;
        const reportPdfPath = `Result-Output/${sessionId}/report.pdf`;
        // Parse grip strength from metadata (Float array)
        const gripStrength = metadata.gripStrength || [];
        // Create experiment session with new schema
        const experimentSession = await prisma.experimentSession.create({
            data: {
                mobileSessionId: sessionId,
                clinicianId: patientInfo.clinicianId,
                patientId: patientId,
                protocolId: protocolId || await getDefaultProtocolId(),
                gripStrength: gripStrength,
                videoDataPath: videoDataPath, // Pre-computed path (pending upload)
                rawKeypointDataPath: rawKeypointDataPath,
                analyzedXlsxPath: analyzedXlsxPath,
                reportPdfPath: reportPdfPath,
                deviceInfo: JSON.stringify({
                    source: 'mobile_app',
                    sessionId: sessionId,
                    patientId: patientId,
                    uploadMode: 'parallel',
                    ...metadata.deviceInfo,
                }),
                clinicalNotes: metadata.notes || null,
                status: 'keypoints_uploaded',
                fps: metadata.fps || 30,
                analysisProgress: 0,
            },
        });
        const recordingId = experimentSession.id;
        // Upload keypoints to GCS: Uploads-CSV/{sessionId}/keypoints.csv
        const keypointsGcsPath = await gcs_service_1.gcsService.uploadFile(keypointsFile.path, rawKeypointDataPath);
        // Upload metadata to GCS if provided: Uploads-CSV/{sessionId}/metadata.json
        let metadataGcsPath = null;
        if (metadataFile) {
            const metaPath = `Uploads-CSV/${sessionId}/metadata.json`;
            metadataGcsPath = await gcs_service_1.gcsService.uploadFile(metadataFile.path, metaPath);
        }
        // Update session status to analyzing
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: {
                status: 'analyzing',
                analysisProgress: 5,
            },
        });
        // Queue analysis job immediately - don't wait for video!
        try {
            await queue_service_1.queueService.addAnalysisJob({
                recordingId: recordingId,
                patientUserId: patientInfo.clinicianId,
                keypointsGcsPath: keypointsGcsPath,
                protocolId: protocolId,
                configuration: {
                    analysisTypes: ['tremor', 'rom', 'smoothness'],
                    priority: 'high',
                },
            });
            console.log(`[PARALLEL] Queued analysis for session ${sessionId} (protocol: ${protocolId || 'default'}) - not waiting for video`);
        }
        catch (queueError) {
            console.warn('Failed to queue analysis job:', queueError);
            await prisma.experimentSession.update({
                where: { id: recordingId },
                data: {
                    status: 'keypoints_uploaded',
                    analysisError: 'Failed to queue analysis job',
                },
            });
        }
        // Clean up temp files
        cleanupTempFiles(tempFiles);
        console.log(`[PARALLEL] Keypoints uploaded for session ${sessionId}, analysis queued`);
        return res.status(201).json({
            success: true,
            recordingId: recordingId,
            sessionId: sessionId,
            status: 'analyzing',
            message: 'Keypoints uploaded, analysis started. Upload video separately.',
            uploadedAt: new Date().toISOString(),
            files: {
                keypoints: true,
                metadata: !!metadataGcsPath,
                video: false,
            },
        });
    }
    catch (error) {
        console.error('Error uploading keypoints:', error);
        cleanupTempFiles(tempFiles);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Keypoints upload failed',
        });
    }
};
exports.uploadKeypoints = uploadKeypoints;
/**
 * POST /api/mobile/video - Background Channel
 * Upload video file for an existing session
 * Can be called after keypoints upload - doesn't block analysis
 */
const uploadVideo = async (req, res) => {
    let tempFile = null;
    try {
        const sessionId = req.body.session_id;
        const videoFile = req.file;
        // Validate required fields
        if (!sessionId) {
            if (videoFile)
                fs_1.default.unlinkSync(videoFile.path);
            return res.status(400).json({
                success: false,
                error: 'session_id is required',
            });
        }
        if (!videoFile) {
            return res.status(400).json({
                success: false,
                error: 'video file is required',
            });
        }
        tempFile = videoFile.path;
        // Find existing session by mobileSessionId
        const existingSession = await prisma.experimentSession.findUnique({
            where: { mobileSessionId: sessionId },
        });
        if (!existingSession) {
            cleanupTempFiles([tempFile]);
            return res.status(404).json({
                success: false,
                error: 'Session not found. Upload keypoints first.',
            });
        }
        // Check if video already uploaded (path contains actual file, not just template)
        const videoAlreadyUploaded = existingSession.videoDataPath &&
            !existingSession.videoDataPath.includes('pending');
        if (videoAlreadyUploaded && existingSession.status === 'completed') {
            cleanupTempFiles([tempFile]);
            return res.status(409).json({
                success: false,
                error: 'Video already uploaded for this session',
                videoPath: existingSession.videoDataPath,
            });
        }
        // Upload video to GCS using the pre-computed path
        const videoGcsPath = await gcs_service_1.gcsService.uploadFile(videoFile.path, existingSession.videoDataPath);
        // Determine new status based on analysis progress
        let newStatus = existingSession.status;
        if (existingSession.analysisProgress === 100) {
            newStatus = 'completed';
        }
        else if (existingSession.status === 'analyzing' || existingSession.status === 'keypoints_uploaded') {
            newStatus = 'video_uploaded';
        }
        // Update session with video upload confirmation
        await prisma.experimentSession.update({
            where: { id: existingSession.id },
            data: {
                status: newStatus,
            },
        });
        // Clean up temp file
        cleanupTempFiles([tempFile]);
        console.log(`[PARALLEL] Video uploaded for session ${sessionId}, status: ${newStatus}`);
        return res.status(200).json({
            success: true,
            sessionId: sessionId,
            recordingId: existingSession.id,
            videoPath: videoGcsPath,
            uploadedAt: new Date().toISOString(),
            status: newStatus,
            message: existingSession.analysisProgress === 100
                ? 'Video uploaded, session complete'
                : 'Video uploaded, analysis in progress',
        });
    }
    catch (error) {
        console.error('Error uploading video:', error);
        if (tempFile)
            cleanupTempFiles([tempFile]);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Video upload failed',
        });
    }
};
exports.uploadVideo = uploadVideo;
/**
 * GET /api/mobile/session/:sessionId - Enhanced Session Status
 * Returns detailed status of both upload channels and analysis progress
 */
const getSessionStatus = async (req, res) => {
    try {
        const { sessionId } = req.params;
        // Find session by mobile session ID
        const session = await prisma.experimentSession.findUnique({
            where: { mobileSessionId: sessionId },
            include: {
                protocol: {
                    select: {
                        id: true,
                        protocolName: true,
                    },
                },
                patient: {
                    select: {
                        id: true,
                        patientId: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
            });
        }
        // Determine analysis status
        let analysisStatus = 'pending';
        if (session.analysisError) {
            analysisStatus = 'failed';
        }
        else if (session.analysisProgress === 100) {
            analysisStatus = 'completed';
        }
        else if (session.analysisProgress > 0) {
            analysisStatus = 'processing';
        }
        // Check if files are uploaded (not just pre-computed paths)
        const hasKeypoints = session.rawKeypointDataPath &&
            await gcs_service_1.gcsService.fileExists(session.rawKeypointDataPath);
        const hasVideo = session.videoDataPath &&
            await gcs_service_1.gcsService.fileExists(session.videoDataPath);
        return res.json({
            success: true,
            session: {
                recordingId: session.id,
                sessionId: sessionId,
                status: session.status,
                createdAt: session.createdAt,
                uploads: {
                    keypoints: {
                        uploaded: hasKeypoints,
                        gcsPath: session.rawKeypointDataPath,
                    },
                    video: {
                        uploaded: hasVideo,
                        gcsPath: session.videoDataPath,
                    },
                },
                analysis: {
                    status: analysisStatus,
                    progress: session.analysisProgress || 0,
                    error: session.analysisError,
                },
                patient: session.patient ? {
                    id: session.patient.id,
                    patientId: session.patient.patientId,
                    name: `${session.patient.firstName} ${session.patient.lastName}`,
                } : null,
                protocol: session.protocol ? {
                    id: session.protocol.id,
                    name: session.protocol.protocolName,
                } : null,
            },
        });
    }
    catch (error) {
        console.error('Error getting session status:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get session status',
        });
    }
};
exports.getSessionStatus = getSessionStatus;
// ============================================================================
// LEGACY UNIFIED UPLOAD ENDPOINT (Backward Compatibility)
// ============================================================================
/**
 * POST /api/mobile/upload - Legacy unified upload
 * Accepts: video (mp4), keypoints (csv), metadata (json), session_id
 * @deprecated Use /api/mobile/keypoints and /api/mobile/video for parallel upload
 */
const uploadMobileRecording = async (req, res) => {
    const tempFiles = [];
    try {
        const files = req.files;
        const sessionId = req.body.session_id;
        const patientId = req.body.patient_id;
        console.log(`\n📱 ANDROID UPLOAD REQUEST`);
        console.log(`   Session ID: ${sessionId}`);
        console.log(`   Patient ID: ${patientId}`);
        console.log(`   Files: ${Object.keys(files || {}).join(', ')}`);
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'session_id is required',
            });
        }
        // Get uploaded files
        const videoFile = files?.video?.[0];
        const keypointsFile = files?.keypoints?.[0];
        const metadataFile = files?.metadata?.[0];
        const screenRecordingFile = files?.screenRecording?.[0];
        // Track temp files for cleanup
        if (videoFile)
            tempFiles.push(videoFile.path);
        if (keypointsFile)
            tempFiles.push(keypointsFile.path);
        if (metadataFile)
            tempFiles.push(metadataFile.path);
        if (screenRecordingFile)
            tempFiles.push(screenRecordingFile.path);
        // At least video or keypoints must be provided
        if (!videoFile && !keypointsFile) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                error: 'At least video or keypoints file is required',
            });
        }
        // Parse metadata if provided
        let metadata = {};
        if (metadataFile) {
            try {
                const metadataContent = fs_1.default.readFileSync(metadataFile.path, 'utf-8');
                metadata = JSON.parse(metadataContent);
            }
            catch (e) {
                console.warn('Failed to parse metadata file:', e);
            }
        }
        // Validate patient and get clinician info
        const patientInfo = await getPatientAndClinician(patientId);
        if (!patientInfo) {
            cleanupTempFiles(tempFiles);
            return res.status(400).json({
                success: false,
                error: 'Patient not found or invalid',
                errorCode: 'PATIENT_NOT_FOUND',
            });
        }
        // Get protocol ID (from metadata or default)
        const protocolId = metadata.protocolId || await getDefaultProtocolId();
        // Pre-compute GCS paths
        const videoDataPath = `Uploads-mp4/${sessionId}/video.mp4`;
        const rawKeypointDataPath = `Uploads-CSV/${sessionId}/keypoints.csv`;
        const analyzedXlsxPath = `Result-Output/${sessionId}/analysis.xlsx`;
        const reportPdfPath = `Result-Output/${sessionId}/report.pdf`;
        // Parse grip strength from metadata (Float array)
        const gripStrength = metadata.gripStrength || [];
        // Create experiment session
        const experimentSession = await prisma.experimentSession.create({
            data: {
                mobileSessionId: sessionId,
                clinicianId: patientInfo.clinicianId,
                patientId: patientId,
                protocolId: protocolId,
                gripStrength: gripStrength,
                videoDataPath: videoDataPath,
                rawKeypointDataPath: rawKeypointDataPath,
                analyzedXlsxPath: analyzedXlsxPath,
                reportPdfPath: reportPdfPath,
                deviceInfo: JSON.stringify({
                    source: 'mobile_app',
                    sessionId: sessionId,
                    patientId: patientId,
                    uploadMode: 'unified',
                    ...metadata.deviceInfo,
                }),
                clinicalNotes: metadata.notes || null,
                status: 'uploaded',
                fps: metadata.fps || 30,
                duration: metadata.duration || null,
                analysisProgress: 0,
            },
        });
        const recordingId = experimentSession.id;
        // Upload video to GCS if provided
        let videoGcsPath = null;
        if (videoFile) {
            console.log(`📹 Uploading video: ${videoFile.originalname} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`);
            videoGcsPath = await gcs_service_1.gcsService.uploadFile(videoFile.path, videoDataPath);
            console.log(`✅ Video uploaded to: ${videoGcsPath}`);
        }
        // Upload keypoints to GCS if provided
        let keypointsGcsPath = null;
        if (keypointsFile) {
            console.log(`📊 Uploading keypoints: ${keypointsFile.originalname} (${(keypointsFile.size / 1024).toFixed(2)}KB)`);
            keypointsGcsPath = await gcs_service_1.gcsService.uploadFile(keypointsFile.path, rawKeypointDataPath);
            console.log(`✅ Keypoints uploaded to: ${keypointsGcsPath}`);
        }
        // Upload metadata to GCS if provided
        let metadataGcsPath = null;
        if (metadataFile) {
            console.log(`📋 Uploading metadata: ${metadataFile.originalname}`);
            const metaPath = `Uploads-CSV/${sessionId}/metadata.json`;
            metadataGcsPath = await gcs_service_1.gcsService.uploadFile(metadataFile.path, metaPath);
            console.log(`✅ Metadata uploaded to: ${metadataGcsPath}`);
        }
        // Upload screen recording to GCS if provided
        let screenRecordingGcsPath = null;
        if (screenRecordingFile) {
            const screenRecPath = `Uploads-mp4/${sessionId}/screenRecording.mp4`;
            screenRecordingGcsPath = await gcs_service_1.gcsService.uploadFile(screenRecordingFile.path, screenRecPath);
        }
        // Update session status
        const newStatus = videoGcsPath ? 'processing' : 'completed';
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: {
                status: newStatus,
                analysisProgress: keypointsGcsPath ? 5 : 0,
            },
        });
        // Queue video processing if video was uploaded
        if (videoGcsPath) {
            try {
                console.log('📤 Attempting to queue video processing job...');
                await queue_service_1.queueService.addVideoProcessingJob({
                    recordingId: recordingId,
                    patientUserId: patientInfo.clinicianId,
                    videoGcsPath: videoGcsPath,
                    configuration: {
                        handDetection: { confidence: 0.5, maxHands: 2 },
                        filters: ['butterworth', 'kalman'],
                        analysisTypes: ['tremor', 'rom'],
                        outputFormats: ['video', 'excel'],
                    },
                });
            }
            catch (queueError) {
                console.warn('Failed to queue video processing:', queueError);
            }
        }
        // Clean up temp files
        cleanupTempFiles(tempFiles);
        // Get patient name for response
        const patientName = `${patientInfo.firstName} ${patientInfo.lastName}`;
        console.log(`\n✨ UPLOAD SUCCESSFUL`);
        console.log(`   Recording ID: ${recordingId}`);
        console.log(`   Patient: ${patientName} (${patientId})`);
        console.log(`   Session: ${sessionId}`);
        console.log(`   Status: ${newStatus}`);
        console.log(`   Files: video=${!!videoGcsPath}, keypoints=${!!keypointsGcsPath}, metadata=${!!metadataGcsPath}\n`);
        return res.status(201).json({
            success: true,
            recordingId: recordingId,
            sessionId: sessionId,
            uploadedAt: new Date().toISOString(),
            status: newStatus,
            userInfo: {
                patientId: patientId,
                patientName: patientName,
            },
            files: {
                video: !!videoGcsPath,
                keypoints: !!keypointsGcsPath,
                metadata: !!metadataGcsPath,
                screenRecording: !!screenRecordingGcsPath,
            },
        });
    }
    catch (error) {
        console.error('❌ Error uploading mobile recording:', error);
        cleanupTempFiles(tempFiles);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
        });
    }
};
exports.uploadMobileRecording = uploadMobileRecording;
/**
 * GET /api/mobile/status/:sessionId - Legacy status endpoint
 * @deprecated Use /api/mobile/session/:sessionId for enhanced status
 */
const getMobileUploadStatus = async (req, res) => {
    try {
        const { sessionId } = req.params;
        // Find session by mobile session ID
        let session = await prisma.experimentSession.findUnique({
            where: { mobileSessionId: sessionId },
        });
        // Fallback to device info search for legacy sessions
        if (!session) {
            const sessions = await prisma.experimentSession.findMany({
                where: {
                    deviceInfo: { contains: sessionId },
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
            });
            session = sessions[0] || null;
        }
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Recording not found',
            });
        }
        return res.json({
            success: true,
            recording: {
                id: session.id,
                status: session.status,
                createdAt: session.createdAt,
                analysisProgress: session.analysisProgress,
                analysisError: session.analysisError,
            },
        });
    }
    catch (error) {
        console.error('Error getting mobile upload status:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get status',
        });
    }
};
exports.getMobileUploadStatus = getMobileUploadStatus;
/**
 * GET /api/mobile/uploads - List mobile uploads
 */
const listMobileUploads = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        // Find sessions from mobile app
        const sessions = await prisma.experimentSession.findMany({
            where: {
                OR: [
                    { mobileSessionId: { not: null } },
                    { deviceInfo: { contains: 'mobile_app' } },
                ],
                deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                mobileSessionId: true,
                status: true,
                videoDataPath: true,
                rawKeypointDataPath: true,
                analysisProgress: true,
                createdAt: true,
                patient: {
                    select: {
                        id: true,
                        patientId: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });
        const count = await prisma.experimentSession.count({
            where: {
                OR: [
                    { mobileSessionId: { not: null } },
                    { deviceInfo: { contains: 'mobile_app' } },
                ],
                deletedAt: null,
            },
        });
        return res.json({
            success: true,
            recordings: sessions.map((s) => ({
                id: s.id,
                sessionId: s.mobileSessionId,
                status: s.status,
                hasVideo: !!s.videoDataPath,
                hasKeypoints: !!s.rawKeypointDataPath,
                analysisProgress: s.analysisProgress,
                createdAt: s.createdAt,
                patient: s.patient ? {
                    id: s.patient.id,
                    patientId: s.patient.patientId,
                    name: `${s.patient.firstName} ${s.patient.lastName}`,
                } : null,
            })),
            pagination: {
                total: count,
                limit,
                offset,
            },
        });
    }
    catch (error) {
        console.error('Error listing mobile uploads:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list uploads',
        });
    }
};
exports.listMobileUploads = listMobileUploads;
// ============================================================================
// GENERATE LABELED VIDEO (POST-PROCESS)
// ============================================================================
/**
 * POST /api/mobile/generate-labeled/:sessionId
 * Generate labeled video with hand landmarks overlay
 */
const generateLabeledVideo = async (req, res) => {
    try {
        const { sessionId } = req.params;
        // Find session by mobile session ID
        const session = await prisma.experimentSession.findUnique({
            where: { mobileSessionId: sessionId },
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found',
            });
        }
        // Check if we have both keypoints and video
        if (!session.rawKeypointDataPath) {
            return res.status(400).json({
                success: false,
                error: 'Keypoints CSV not found for this session',
            });
        }
        if (!session.videoDataPath) {
            return res.status(400).json({
                success: false,
                error: 'Video not found for this session',
            });
        }
        // Update status to processing
        await prisma.experimentSession.update({
            where: { id: session.id },
            data: { status: 'processing' },
        });
        res.json({
            success: true,
            message: 'Labeled video generation started',
            sessionId: sessionId,
            recordingId: session.id,
            status: 'processing',
        });
    }
    catch (error) {
        console.error('Error generating labeled video:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate labeled video',
        });
    }
};
exports.generateLabeledVideo = generateLabeledVideo;
// ============================================================================
// PROTOCOL ENDPOINTS
// ============================================================================
/**
 * GET /api/mobile/protocols - Get available protocols for mobile app
 * Returns public protocols for the mobile app
 * Updated for Protocol-Table schema
 */
const getProtocols = async (req, res) => {
    try {
        // Fetch public protocols
        const protocols = await prisma.protocol.findMany({
            where: {
                private: false,
                deletedAt: null,
            },
            select: {
                id: true,
                protocolName: true,
                protocolDescription: true,
                protocolInformation: true,
                createdAt: true,
            },
            orderBy: [
                { protocolName: 'asc' },
            ],
        });
        // Format protocols for mobile app
        const formattedProtocols = protocols.map((protocol) => {
            // Extract instructions from protocolInformation if available
            let instructions = null;
            if (protocol.protocolInformation && Array.isArray(protocol.protocolInformation)) {
                const infoItem = protocol.protocolInformation.find((item) => item.instructions);
                if (infoItem && typeof infoItem === 'object') {
                    instructions = infoItem.instructions || null;
                }
            }
            return {
                id: protocol.id,
                name: protocol.protocolName,
                description: protocol.protocolDescription,
                instructions: instructions,
                isSystem: false,
            };
        });
        return res.json({
            success: true,
            protocols: formattedProtocols,
            syncedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error fetching protocols:', error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch protocols',
        });
    }
};
exports.getProtocols = getProtocols;
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get patient info and associated clinician (creator)
 * Returns patient info with clinician ID for session creation
 */
async function getPatientAndClinician(patientId) {
    if (!patientId || patientId === 'unknown' || patientId.trim() === '') {
        console.error('❌ [SECURITY] Patient ID is required');
        return null;
    }
    // Find patient in Patient table
    const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: {
            id: true,
            creatorId: true,
            firstName: true,
            lastName: true,
            deletedAt: true,
        },
    });
    if (!patient) {
        console.error(`❌ [SECURITY] Patient ${patientId} not found`);
        return null;
    }
    if (patient.deletedAt !== null) {
        console.error(`❌ [SECURITY] Patient ${patientId} is deleted`);
        return null;
    }
    console.log(`✅ Patient validation passed: ${patientId} (${patient.firstName} ${patient.lastName})`);
    return {
        patientId: patient.id,
        clinicianId: patient.creatorId,
        firstName: patient.firstName,
        lastName: patient.lastName,
    };
}
/**
 * Get default protocol ID for sessions without specified protocol
 */
async function getDefaultProtocolId() {
    // Try to find a default/general protocol
    const defaultProtocol = await prisma.protocol.findFirst({
        where: {
            private: false,
            deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
    });
    if (defaultProtocol) {
        return defaultProtocol.id;
    }
    // If no protocol exists, throw error (protocol is required in new schema)
    throw new Error('No default protocol available. Please create a protocol first.');
}
/**
 * Clean up temporary files
 */
function cleanupTempFiles(files) {
    for (const file of files) {
        try {
            if (fs_1.default.existsSync(file)) {
                fs_1.default.unlinkSync(file);
            }
        }
        catch (e) {
            console.warn(`Failed to cleanup temp file: ${file}`, e);
        }
    }
}
