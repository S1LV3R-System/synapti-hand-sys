// ============================================================================
// MOBILE CONTROLLER - Handle uploads from Android/iOS mobile apps
// ============================================================================
// Architecture: Android → Backend API → GCS (service account)
// Security: Android NEVER sees GCS credentials. All uploads go through backend.
// Updated for Experiment-Session schema (replaces RecordingSession)
// ============================================================================

import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { gcsService } from '../services/gcs.service';
import { queueService } from '../services/queue.service';


// Configure multer for mobile file uploads
const mobileUpload = multer({
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
      const ext = path.extname(file.originalname);
      cb(null, `mobile-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
  },
});

// Multer fields configuration for legacy unified upload
export const mobileUploadMiddleware = mobileUpload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'keypoints', maxCount: 1 },
  { name: 'metadata', maxCount: 1 },
  { name: 'screenRecording', maxCount: 1 },
]);

// Multer for keypoints-only upload (priority channel)
export const keypointsUploadMiddleware = mobileUpload.fields([
  { name: 'keypoints', maxCount: 1 },
  { name: 'metadata', maxCount: 1 },
]);

// Multer for video-only upload (background channel)
export const videoUploadMiddleware = mobileUpload.single('video');

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
export const uploadKeypoints = async (req: Request, res: Response) => {
  const tempFiles: string[] = [];

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
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
    if (keypointsFile) tempFiles.push(keypointsFile.path);
    if (metadataFile) tempFiles.push(metadataFile.path);

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
    let metadata: Record<string, any> = {};
    if (metadataFile) {
      try {
        const metadataContent = fs.readFileSync(metadataFile.path, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch (e) {
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

    // Pre-compute GCS paths
    // Database stores full URIs (gs://bucket/path) - required by NOT NULL constraint
    // But uploadFile() expects relative paths (Uploads-mp4/path)
    const bucketName = gcsService.getBucketName();
    const videoDataPathRelative = `Uploads-mp4/${sessionId}/video.mp4`;
    const rawKeypointDataPathRelative = `Uploads-CSV/${sessionId}/keypoints.csv`;
    const analyzedXlsxPathRelative = `Result-Output/${sessionId}/analysis.xlsx`;
    const reportPdfPathRelative = `Result-Output/${sessionId}/report.pdf`;
    
    // Full GCS URIs for database (placeholders until upload)
    const videoDataPath = `gs://${bucketName}/${videoDataPathRelative}`;
    const rawKeypointDataPath = `gs://${bucketName}/${rawKeypointDataPathRelative}`;
    const analyzedXlsxPath = `gs://${bucketName}/${analyzedXlsxPathRelative}`;
    const reportPdfPath = `gs://${bucketName}/${reportPdfPathRelative}`;

    // Parse grip strength from metadata (Float array)
    const gripStrength: number[] = metadata.gripStrength || [];

    // Create experiment session with new schema
    const experimentSession = await prisma.experimentSession.create({
      data: {
        mobileSessionId: sessionId,
        clinicianId: patientInfo.clinicianId,
        patientId: patientId,
        protocolId: protocolId || await getDefaultProtocolId(),
        gripStrength: gripStrength,
        videoDataPath: videoDataPath,  // Pre-computed path (pending upload)
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
    const keypointsGcsPath = await gcsService.uploadFile(keypointsFile.path, rawKeypointDataPathRelative);

    // Upload metadata to GCS if provided: Uploads-CSV/{sessionId}/metadata.json
    let metadataGcsPath: string | null = null;
    if (metadataFile) {
      const metaPath = `Uploads-CSV/${sessionId}/metadata.json`;
      metadataGcsPath = await gcsService.uploadFile(metadataFile.path, metaPath);
    }

    // CRITICAL FIX: Update database with FULL GCS URI (not relative path)
    // The uploadFile() returns full GCS URI like "gs://bucket-name/path"
    await prisma.experimentSession.update({
      where: { id: recordingId },
      data: {
        rawKeypointDataPath: keypointsGcsPath,  // Update with full GCS URI
        status: 'analyzing',
        analysisProgress: 5,
      },
    });

    // Queue analysis job immediately - don't wait for video!
    try {
      await queueService.addAnalysisJob({
        recordingId: recordingId,
        patientId: patientInfo.clinicianId,
        keypointsGcsPath: keypointsGcsPath,
        protocolId: protocolId,
        configuration: {
          analysisTypes: ['tremor', 'rom', 'smoothness'],
          priority: 'high',
        },
      });
      console.log(`[PARALLEL] Queued analysis for session ${sessionId} (protocol: ${protocolId || 'default'}) - not waiting for video`);
    } catch (queueError) {
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
  } catch (error) {
    console.error('Error uploading keypoints:', error);
    cleanupTempFiles(tempFiles);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Keypoints upload failed',
    });
  }
};

/**
 * POST /api/mobile/video - Background Channel
 * Upload video file for an existing session
 * Can be called after keypoints upload - doesn't block analysis
 */
export const uploadVideo = async (req: Request, res: Response) => {
  let tempFile: string | null = null;

  try {
    const sessionId = req.body.session_id;
    const videoFile = req.file;

    // Validate required fields
    if (!sessionId) {
      if (videoFile) fs.unlinkSync(videoFile.path);
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
        videoDataPath: existingSession.videoDataPath,
      });
    }

    // Upload video to GCS using the pre-computed path
    const videoGcsPath = await gcsService.uploadFile(videoFile.path, existingSession.videoDataPath.replace(`gs://${gcsService.getBucketName()}/`, ""));

    // Determine new status based on analysis progress
    let newStatus = existingSession.status;
    if (existingSession.analysisProgress === 100) {
      newStatus = 'completed';
    } else if (existingSession.status === 'analyzing' || existingSession.status === 'keypoints_uploaded') {
      newStatus = 'video_uploaded';
    }

    // CRITICAL FIX: Update database with FULL GCS URI (not relative path)
    // The uploadFile() returns full GCS URI like "gs://bucket-name/path"
    await prisma.experimentSession.update({
      where: { id: existingSession.id },
      data: {
        videoDataPath: videoGcsPath,  // Update with full GCS URI
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
      videoDataPath: videoGcsPath,
      uploadedAt: new Date().toISOString(),
      status: newStatus,
      message: existingSession.analysisProgress === 100
        ? 'Video uploaded, session complete'
        : 'Video uploaded, analysis in progress',
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    if (tempFile) cleanupTempFiles([tempFile]);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Video upload failed',
    });
  }
};

/**
 * GET /api/mobile/session/:sessionId - Enhanced Session Status
 * Returns detailed status of both upload channels and analysis progress
 */
export const getSessionStatus = async (req: Request, res: Response) => {
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
    let analysisStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';
    if (session.analysisError) {
      analysisStatus = 'failed';
    } else if (session.analysisProgress === 100) {
      analysisStatus = 'completed';
    } else if (session.analysisProgress > 0) {
      analysisStatus = 'processing';
    }

    // Check if files are uploaded (not just pre-computed paths)
    const hasKeypoints = session.rawKeypointDataPath &&
      await gcsService.fileExists(session.rawKeypointDataPath);
    const hasVideo = session.videoDataPath &&
      await gcsService.fileExists(session.videoDataPath);

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
  } catch (error) {
    console.error('Error getting session status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session status',
    });
  }
};

// ============================================================================
// LEGACY UNIFIED UPLOAD ENDPOINT (Backward Compatibility)
// ============================================================================

/**
 * POST /api/mobile/upload - Legacy unified upload
 * Accepts: video (mp4), keypoints (csv), metadata (json), session_id
 * @deprecated Use /api/mobile/keypoints and /api/mobile/video for parallel upload
 */
export const uploadMobileRecording = async (req: Request, res: Response) => {
  const tempFiles: string[] = [];

  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
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
    if (videoFile) tempFiles.push(videoFile.path);
    if (keypointsFile) tempFiles.push(keypointsFile.path);
    if (metadataFile) tempFiles.push(metadataFile.path);
    if (screenRecordingFile) tempFiles.push(screenRecordingFile.path);

    // At least video or keypoints must be provided
    if (!videoFile && !keypointsFile) {
      cleanupTempFiles(tempFiles);
      return res.status(400).json({
        success: false,
        error: 'At least video or keypoints file is required',
      });
    }

    // Parse metadata if provided
    let metadata: Record<string, any> = {};
    if (metadataFile) {
      try {
        const metadataContent = fs.readFileSync(metadataFile.path, 'utf-8');
        metadata = JSON.parse(metadataContent);
      } catch (e) {
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
    // Database stores full URIs (gs://bucket/path) - required by NOT NULL constraint
    // But uploadFile() expects relative paths (Uploads-mp4/path)
    const bucketName = gcsService.getBucketName();
    const videoDataPathRelative = `Uploads-mp4/${sessionId}/video.mp4`;
    const rawKeypointDataPathRelative = `Uploads-CSV/${sessionId}/keypoints.csv`;
    const analyzedXlsxPathRelative = `Result-Output/${sessionId}/analysis.xlsx`;
    const reportPdfPathRelative = `Result-Output/${sessionId}/report.pdf`;
    
    // Full GCS URIs for database (placeholders until upload)
    const videoDataPath = `gs://${bucketName}/${videoDataPathRelative}`;
    const rawKeypointDataPath = `gs://${bucketName}/${rawKeypointDataPathRelative}`;
    const analyzedXlsxPath = `gs://${bucketName}/${analyzedXlsxPathRelative}`;
    const reportPdfPath = `gs://${bucketName}/${reportPdfPathRelative}`;

    // Parse grip strength from metadata (Float array)
    const gripStrength: number[] = metadata.gripStrength || [];

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
    let videoGcsPath: string | null = null;
    if (videoFile) {
      console.log(`📹 Uploading video: ${videoFile.originalname} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`);
      videoGcsPath = await gcsService.uploadFile(videoFile.path, videoDataPathRelative);
      console.log(`✅ Video uploaded to: ${videoGcsPath}`);
    }

    // Upload keypoints to GCS if provided
    let keypointsGcsPath: string | null = null;
    if (keypointsFile) {
      console.log(`📊 Uploading keypoints: ${keypointsFile.originalname} (${(keypointsFile.size / 1024).toFixed(2)}KB)`);
      keypointsGcsPath = await gcsService.uploadFile(keypointsFile.path, rawKeypointDataPathRelative);
      console.log(`✅ Keypoints uploaded to: ${keypointsGcsPath}`);
    }

    // Upload metadata to GCS if provided
    let metadataGcsPath: string | null = null;
    if (metadataFile) {
      console.log(`📋 Uploading metadata: ${metadataFile.originalname}`);
      const metaPath = `Uploads-CSV/${sessionId}/metadata.json`;
      metadataGcsPath = await gcsService.uploadFile(metadataFile.path, metaPath);
      console.log(`✅ Metadata uploaded to: ${metadataGcsPath}`);
    }

    // Upload screen recording to GCS if provided
    let screenRecordingGcsPath: string | null = null;
    if (screenRecordingFile) {
      const screenRecPath = `Uploads-mp4/${sessionId}/screenRecording.mp4`;
      screenRecordingGcsPath = await gcsService.uploadFile(screenRecordingFile.path, screenRecPath);
    }

    // Update session status and FULL GCS URIs
    const newStatus = videoGcsPath ? 'processing' : 'completed';
    // CRITICAL FIX: Update database with FULL GCS URIs (not relative paths)
    await prisma.experimentSession.update({
      where: { id: recordingId },
      data: {
        videoDataPath: videoGcsPath || videoDataPath,  // Use full GCS URI if uploaded
        rawKeypointDataPath: keypointsGcsPath || rawKeypointDataPath,  // Use full GCS URI if uploaded
        status: newStatus,
        analysisProgress: keypointsGcsPath ? 5 : 0,
      },
    });

    // Queue video processing if video was uploaded
    if (videoGcsPath) {
      try {
        console.log('📤 Attempting to queue video processing job...');
        await queueService.addVideoProcessingJob({
          recordingId: recordingId,
          patientId: patientInfo.clinicianId,
          videoGcsPath: videoGcsPath,
          configuration: {
            handDetection: { confidence: 0.5, maxHands: 2 },
            filters: ['butterworth', 'kalman'],
            analysisTypes: ['tremor', 'rom'],
            outputFormats: ['video', 'excel'],
          },
        });
      } catch (queueError) {
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
  } catch (error) {
    console.error('❌ Error uploading mobile recording:', error);
    cleanupTempFiles(tempFiles);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
};

/**
 * GET /api/mobile/status/:sessionId - Legacy status endpoint
 * @deprecated Use /api/mobile/session/:sessionId for enhanced status
 */
export const getMobileUploadStatus = async (req: Request, res: Response) => {
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
  } catch (error) {
    console.error('Error getting mobile upload status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status',
    });
  }
};

/**
 * GET /api/mobile/uploads - List mobile uploads
 */
export const listMobileUploads = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

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
  } catch (error) {
    console.error('Error listing mobile uploads:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list uploads',
    });
  }
};

// ============================================================================
// GENERATE LABELED VIDEO (POST-PROCESS)
// ============================================================================

/**
 * POST /api/mobile/generate-labeled/:sessionId
 * Generate labeled video with hand landmarks overlay
 */
export const generateLabeledVideo = async (req: Request, res: Response) => {
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

  } catch (error) {
    console.error('Error generating labeled video:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate labeled video',
    });
  }
};

// ============================================================================
// PROTOCOL ENDPOINTS
// ============================================================================

/**
 * GET /api/mobile/protocols - Get available protocols for mobile app
 * Returns public protocols for the mobile app
 * Updated for Protocol-Table schema
 */
export const getProtocols = async (req: Request, res: Response) => {
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
      let instructions: string | null = null;
      if (protocol.protocolInformation && Array.isArray(protocol.protocolInformation)) {
        const infoItem = protocol.protocolInformation.find(
          (item: any) => item.instructions
        );
        if (infoItem && typeof infoItem === 'object') {
          instructions = (infoItem as any).instructions || null;
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
  } catch (error) {
    console.error('Error fetching protocols:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch protocols',
    });
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get patient info and associated clinician (creator)
 * Returns patient info with clinician ID for session creation
 */
async function getPatientAndClinician(patientId: string | null | undefined): Promise<{
  patientId: string;
  clinicianId: string;
  firstName: string;
  lastName: string;
} | null> {
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
async function getDefaultProtocolId(): Promise<string> {
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
function cleanupTempFiles(files: string[]) {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      console.warn(`Failed to cleanup temp file: ${file}`, e);
    }
  }
}
