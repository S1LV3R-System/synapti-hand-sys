"use strict";
// ============================================================================
// PROCESSING WORKER - Background job processor
// ============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoJob = processVideoJob;
exports.registerWorker = registerWorker;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const XLSX = __importStar(require("xlsx"));
const gcs_service_1 = require("../services/gcs.service");
const processing_service_1 = require("../services/processing.service");
const lstm_analysis_service_1 = require("../services/lstm-analysis.service");
const queue_service_1 = require("../services/queue.service");
const movementAnalysisOrchestrator_1 = require("../services/analyzers/movementAnalysisOrchestrator");
/**
 * Convert XLSX file to CSV format
 * Android uploads keypoints.xlsx but processing expects CSV
 */
function convertXlsxToCsv(xlsxPath, csvPath) {
    console.log(`[WORKER] Converting XLSX to CSV: ${xlsxPath} → ${csvPath}`);
    const workbook = XLSX.readFile(xlsxPath);
    // Get the first sheet (Android creates "Left Hand" and "Right Hand" sheets)
    // For processing, we combine both hands into a single CSV
    const allData = [];
    let headerWritten = false;
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (jsonData.length === 0)
            continue;
        // Write header only once (from first non-empty sheet)
        if (!headerWritten && jsonData.length > 0) {
            allData.push(jsonData[0]); // Header row
            headerWritten = true;
        }
        // Add data rows (skip header in subsequent sheets)
        const dataRows = headerWritten ? jsonData.slice(1) : jsonData;
        for (const row of dataRows) {
            if (row.length > 0) {
                allData.push(row);
            }
        }
    }
    // Create new workbook with combined data and write as CSV
    const newSheet = XLSX.utils.aoa_to_sheet(allData);
    const csvContent = XLSX.utils.sheet_to_csv(newSheet);
    fs_1.default.writeFileSync(csvPath, csvContent);
    console.log(`[WORKER] ✓ Converted ${allData.length} rows to CSV`);
}
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
/**
 * Process video recording job
 * Supports both parallel upload (keypoints-first) and legacy unified upload
 */
async function processVideoJob(job) {
    const { recordingId, patientUserId, keypointsGcsPath, videoGcsPath, protocolId, configuration } = job.data;
    // Determine processing mode
    const isParallelUpload = !!keypointsGcsPath;
    const hasVideo = !!videoGcsPath;
    console.log(`\n[WORKER] Starting processing for recording: ${recordingId}`);
    console.log(`[WORKER] Mode: ${isParallelUpload ? 'Parallel (keypoints-first)' : 'Legacy (video)'}`);
    let tempVideoPath = null;
    let tempKeypointsPath = null;
    let tempOutputDir = null;
    try {
        // Update progress
        await job.progress(10);
        // Create temp directories
        const tempDir = process.env.TEMP_UPLOAD_DIR || '/tmp/synaptihand-processing';
        tempOutputDir = path_1.default.join(tempDir, recordingId);
        if (!fs_1.default.existsSync(tempOutputDir)) {
            fs_1.default.mkdirSync(tempOutputDir, { recursive: true });
        }
        // Download keypoints file for parallel upload (handles both XLSX and CSV)
        if (isParallelUpload && keypointsGcsPath) {
            console.log(`[WORKER] Downloading keypoints from GCS: ${keypointsGcsPath}`);
            // Determine file extension from GCS path
            const isXlsx = keypointsGcsPath.toLowerCase().endsWith('.xlsx');
            const downloadedPath = path_1.default.join(tempOutputDir, isXlsx ? 'keypoints.xlsx' : 'keypoints.csv');
            await gcs_service_1.gcsService.downloadFile(keypointsGcsPath, downloadedPath);
            // Convert XLSX to CSV if needed (Android uploads .xlsx, processing expects .csv)
            if (isXlsx) {
                tempKeypointsPath = path_1.default.join(tempOutputDir, 'keypoints.csv');
                convertXlsxToCsv(downloadedPath, tempKeypointsPath);
                // Clean up the original xlsx file
                fs_1.default.unlinkSync(downloadedPath);
            }
            else {
                tempKeypointsPath = downloadedPath;
            }
        }
        // Download video if available (legacy mode or parallel with video)
        if (hasVideo && videoGcsPath) {
            console.log(`[WORKER] Downloading video from GCS: ${videoGcsPath}`);
            tempVideoPath = path_1.default.join(tempOutputDir, 'input_video.mp4');
            await gcs_service_1.gcsService.downloadFile(videoGcsPath, tempVideoPath);
        }
        await job.progress(20);
        // Update database status
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: {
                status: 'processing',
                processingMetadata: JSON.stringify({
                    processingStartedAt: new Date().toISOString(),
                }),
            },
        });
        // Call Python processing service
        // For parallel upload: process keypoints CSV directly (faster - no video required)
        // For legacy upload: process video to extract keypoints first
        console.log(`[WORKER] Starting Python processing service`);
        const pythonResults = await processing_service_1.processingService.processVideoAndWait(tempVideoPath || tempKeypointsPath, // Prefer video, fallback to keypoints
        tempOutputDir, {
            handDetection: configuration?.handDetection || { confidence: 0.5, maxHands: 2 },
            filters: configuration?.filters || ['butterworth', 'kalman', 'savitzky_golay'],
            analysisTypes: configuration?.analysisTypes || ['tremor', 'rom', 'coordination', 'smoothness'],
            outputFormats: configuration?.outputFormats || (tempVideoPath ? ['video', 'excel', 'dashboards'] : ['excel', 'dashboards']),
        });
        await job.progress(70);
        // Upload output files to GCS (Result-Output/{recordingId}/)
        console.log(`[WORKER] Uploading output files to GCS (Result-Output/${recordingId}/)`);
        const recording = await prisma.experimentSession.findUnique({
            where: { id: recordingId },
            include: { patientUser: true },
        });
        if (!recording) {
            throw new Error('Recording not found');
        }
        const outputPaths = {};
        // Upload labeled video to Result-Output/{recordingId}/video_labeled.mp4
        if (pythonResults.outputs.videoLabeledPath && fs_1.default.existsSync(pythonResults.outputs.videoLabeledPath)) {
            const videoGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'video_labeled.mp4');
            outputPaths.videoLabeledPath = await gcs_service_1.gcsService.uploadFile(pythonResults.outputs.videoLabeledPath, videoGcsPath);
        }
        // Upload raw data Excel to Result-Output/{recordingId}/Raw_data.xlsx
        if (pythonResults.outputs.rawDataPath && fs_1.default.existsSync(pythonResults.outputs.rawDataPath)) {
            const dataGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'Raw_data.xlsx');
            outputPaths.rawDataPath = await gcs_service_1.gcsService.uploadFile(pythonResults.outputs.rawDataPath, dataGcsPath);
        }
        // Upload dashboard image to Result-Output/{recordingId}/Comprehensive_Hand_Kinematic_Dashboard.png
        if (pythonResults.outputs.dashboardPath && fs_1.default.existsSync(pythonResults.outputs.dashboardPath)) {
            const dashboardGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'Comprehensive_Hand_Kinematic_Dashboard.png');
            outputPaths.dashboardPath = await gcs_service_1.gcsService.uploadFile(pythonResults.outputs.dashboardPath, dashboardGcsPath);
        }
        // Upload aperture dashboard to Result-Output/{recordingId}/Advance_Hand_Aperture-Closure_Dashboard.png
        if (pythonResults.outputs.apertureDashboardPath && fs_1.default.existsSync(pythonResults.outputs.apertureDashboardPath)) {
            const apertureGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'Advance_Hand_Aperture-Closure_Dashboard.png');
            outputPaths.apertureDashboardPath = await gcs_service_1.gcsService.uploadFile(pythonResults.outputs.apertureDashboardPath, apertureGcsPath);
        }
        await job.progress(85);
        // Store signal processing results
        console.log(`[WORKER] Storing signal processing results`);
        await prisma.signalProcessingResult.create({
            data: {
                recordingSessionId: recordingId,
                processingVersion: '1.0',
                filtersApplied: JSON.stringify(configuration?.filters || []),
                rawLandmarks: JSON.stringify(pythonResults.landmarks),
                qualityMetrics: JSON.stringify(pythonResults.analysis.quality || {}),
                processingTime: pythonResults.metrics.processingTime,
            },
        });
        // Store clinical analysis
        console.log(`[WORKER] Storing clinical analysis`);
        await prisma.clinicalAnalysis.create({
            data: {
                recordingSessionId: recordingId,
                analysisVersion: '1.0',
                analysisType: 'comprehensive',
                tremorFrequency: pythonResults.analysis.tremor?.frequency,
                tremorAmplitude: pythonResults.analysis.tremor?.amplitude,
                tremorRegularity: pythonResults.analysis.tremor?.regularity,
                dominantFrequency: pythonResults.analysis.tremor?.dominantFrequency,
                frequencySpectrum: pythonResults.analysis.tremor?.frequencySpectrum
                    ? JSON.stringify(pythonResults.analysis.tremor.frequencySpectrum)
                    : null,
                sparc: pythonResults.analysis.smoothness?.sparc,
                ldljv: pythonResults.analysis.smoothness?.ldljv,
                normalizedJerk: pythonResults.analysis.smoothness?.normalizedJerk,
                romMeasurements: pythonResults.analysis.rom
                    ? JSON.stringify(pythonResults.analysis.rom)
                    : null,
                coordinationScore: pythonResults.analysis.coordination?.coordinationScore,
                reactionTime: pythonResults.analysis.coordination?.reactionTime,
                movementAccuracy: pythonResults.analysis.coordination?.movementAccuracy,
                asymmetryIndex: pythonResults.analysis.coordination?.asymmetryIndex,
                confidence: pythonResults.analysis.quality?.averageConfidence || 0.0,
                qualityFlags: pythonResults.analysis.quality
                    ? JSON.stringify([])
                    : null,
            },
        });
        // ========================================================================
        // LSTM Event Detection Analysis (Adaptive Mode)
        // ========================================================================
        console.log(`[WORKER] Running LSTM event detection`);
        await job.progress(90);
        try {
            const lstmAvailable = await lstm_analysis_service_1.lstmAnalysisService.isAvailable();
            if (lstmAvailable && tempKeypointsPath) {
                const lstmOutputDir = path_1.default.join(tempOutputDir, 'lstm_analysis');
                if (!fs_1.default.existsSync(lstmOutputDir)) {
                    fs_1.default.mkdirSync(lstmOutputDir, { recursive: true });
                }
                const lstmResults = await lstm_analysis_service_1.lstmAnalysisService.analyzeCsv({
                    inputCsv: tempKeypointsPath,
                    outputDir: lstmOutputDir,
                    recordingId: recordingId,
                    patientId: patientUserId,
                    fps: 30,
                    adaptive: true, // Enable adaptive filtering and LSTM
                });
                if (lstmResults.success && lstmResults.lstm_events.length > 0) {
                    console.log(`[WORKER] Storing ${lstmResults.lstm_events.length} LSTM events`);
                    // Store each LSTM event in database
                    for (const event of lstmResults.lstm_events) {
                        await prisma.lSTMEventDetection.create({
                            data: {
                                recordingSessionId: recordingId,
                                category: event.category,
                                eventType: event.event_type,
                                label: event.label || null,
                                startFrame: event.start_frame,
                                endFrame: event.end_frame,
                                durationFrames: event.duration_frames,
                                durationSeconds: event.duration_seconds,
                                confidence: event.confidence,
                                peakConfidence: event.peak_confidence,
                                rawPredictions: null, // Can be added if needed
                            },
                        });
                    }
                    // Upload LSTM Excel report to GCS
                    if (lstmResults.output_paths.excel_report && fs_1.default.existsSync(lstmResults.output_paths.excel_report)) {
                        const lstmReportGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'LSTM_Analysis_Report.xlsx');
                        outputPaths.lstmReportPath = await gcs_service_1.gcsService.uploadFile(lstmResults.output_paths.excel_report, lstmReportGcsPath);
                        console.log(`[WORKER] ✓ Uploaded LSTM Excel report`);
                    }
                    // Upload LSTM PDF report to GCS
                    if (lstmResults.output_paths.pdf_report && fs_1.default.existsSync(lstmResults.output_paths.pdf_report)) {
                        const lstmPdfGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'LSTM_Analysis_Report.pdf');
                        outputPaths.lstmPdfPath = await gcs_service_1.gcsService.uploadFile(lstmResults.output_paths.pdf_report, lstmPdfGcsPath);
                        console.log(`[WORKER] ✓ Uploaded LSTM PDF report`);
                    }
                    // Upload combined plots PNG to GCS
                    if (lstmResults.output_paths.plots && fs_1.default.existsSync(lstmResults.output_paths.plots)) {
                        const lstmPlotsGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, 'LSTM_Plots.png');
                        outputPaths.lstmPlotsPath = await gcs_service_1.gcsService.uploadFile(lstmResults.output_paths.plots, lstmPlotsGcsPath);
                        console.log(`[WORKER] ✓ Uploaded LSTM combined plots`);
                    }
                    // Upload separate plot PNGs (user mentioned: "all of the plots are generated as separate png")
                    const separatePlots = await lstm_analysis_service_1.lstmAnalysisService.getPlotFiles(lstmOutputDir);
                    if (separatePlots.length > 0) {
                        console.log(`[WORKER] Uploading ${separatePlots.length} separate plot files`);
                        outputPaths.lstmSeparatePlots = [];
                        for (const plotPath of separatePlots) {
                            const plotFilename = path_1.default.basename(plotPath);
                            const plotGcsPath = gcs_service_1.gcsService.generateResultOutputPath(recordingId, `LSTM_${plotFilename}`);
                            const uploadedPath = await gcs_service_1.gcsService.uploadFile(plotPath, plotGcsPath);
                            outputPaths.lstmSeparatePlots.push(uploadedPath);
                        }
                        console.log(`[WORKER] ✓ Uploaded ${separatePlots.length} separate plot files`);
                    }
                    console.log(`[WORKER] ✓ LSTM analysis complete - ${lstmResults.lstm_events.length} events detected`);
                    console.log(`[WORKER] Event summary:`, lstmResults.event_summary);
                }
                else if (lstmResults.success) {
                    console.log(`[WORKER] LSTM analysis completed but no events detected`);
                }
                else {
                    console.warn(`[WORKER] LSTM analysis failed: ${lstmResults.error}`);
                }
            }
            else if (!lstmAvailable) {
                console.warn(`[WORKER] LSTM analysis not available - skipping`);
            }
            else {
                console.warn(`[WORKER] No keypoints CSV available for LSTM analysis - skipping`);
            }
        }
        catch (lstmError) {
            // Non-fatal error - continue processing even if LSTM fails
            console.error(`[WORKER] LSTM analysis error (non-fatal):`, lstmError);
        }
        // ========================================================================
        // PROTOCOL-BASED MOVEMENT ANALYSIS (If protocolId present)
        // ========================================================================
        if (protocolId) {
            console.log(`[WORKER] Running protocol-based analysis for protocol: ${protocolId}`);
            try {
                const protocolResults = await (0, movementAnalysisOrchestrator_1.analyzeRecordingWithProtocol)({
                    recordingSessionId: recordingId,
                    protocolId: protocolId,
                });
                console.log(`[WORKER] ✓ Protocol analysis complete: ${protocolResults.clinicalAnalysisId}`);
                console.log(`[WORKER] Overall score: ${protocolResults.overallMetrics.overallScore}`);
                // Store protocol analysis results in output paths
                outputPaths.protocolAnalysisId = protocolResults.clinicalAnalysisId;
            }
            catch (protocolError) {
                // Non-fatal error - continue even if protocol analysis fails
                console.error(`[WORKER] Protocol analysis error (non-fatal):`, protocolError);
            }
        }
        else {
            console.log(`[WORKER] No protocolId provided - skipping protocol-based analysis`);
        }
        await job.progress(95);
        // Update recording session
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: {
                status: 'analyzed',
                duration: pythonResults.metrics.duration,
                fps: pythonResults.metrics.fps,
                csvPath: outputPaths.rawDataPath,
                processingMetadata: JSON.stringify({
                    processingStartedAt: new Date().toISOString(),
                    processingCompletedAt: new Date().toISOString(),
                    processingTime: pythonResults.metrics.processingTime,
                    frameCount: pythonResults.metrics.frameCount,
                    outputPaths,
                }),
            },
        });
        await job.progress(100);
        console.log(`[WORKER] Successfully completed processing for recording: ${recordingId}`);
        // Cleanup temp files (entire directory including video and keypoints)
        cleanupTempDirectory(tempOutputDir);
        return {
            recordingId,
            status: 'success',
            outputs: {
                ...outputPaths,
                landmarksData: pythonResults.landmarks,
                analysisResults: pythonResults.analysis,
            },
            metrics: pythonResults.metrics,
        };
    }
    catch (error) {
        console.error(`[WORKER] Error processing recording ${recordingId}:`, error);
        // Update recording status to failed
        await prisma.experimentSession.update({
            where: { id: recordingId },
            data: {
                status: 'failed',
                analysisError: error instanceof Error ? error.message : 'Unknown error',
                processingMetadata: JSON.stringify({
                    processingStartedAt: new Date().toISOString(),
                    processingFailedAt: new Date().toISOString(),
                    error: error instanceof Error ? error.message : 'Unknown error',
                }),
            },
        });
        // Cleanup temp files
        cleanupTempDirectory(tempOutputDir);
        throw error;
    }
}
/**
 * Cleanup temporary directory (includes all files: video, keypoints, outputs)
 */
function cleanupTempDirectory(tempOutputDir) {
    try {
        if (tempOutputDir && fs_1.default.existsSync(tempOutputDir)) {
            fs_1.default.rmSync(tempOutputDir, { recursive: true, force: true });
            console.log(`[WORKER] Cleaned up temp directory: ${tempOutputDir}`);
        }
    }
    catch (error) {
        console.error('[WORKER] Error cleaning up temp files:', error);
    }
}
/**
 * Register workers with queues
 * CRITICAL: Both video and analysis queues need workers!
 * - Video queue: Processes video files (legacy/unified upload)
 * - Analysis queue: Processes keypoints CSV (parallel upload - priority channel)
 */
function registerWorker() {
    const { videoQueue, analysisQueue } = queue_service_1.queueService.getQueues();
    // Video processing worker
    videoQueue.process(async (job) => {
        return await processVideoJob(job);
    });
    // CRITICAL: Analysis queue worker for parallel upload keypoints-first flow
    // Without this, keypoints uploads get stuck in "analyzing" status forever!
    analysisQueue.process(async (job) => {
        // Analysis jobs process keypoints CSV directly (no video required)
        return await processVideoJob(job); // Same logic handles both paths
    });
    console.log('🔧 Processing workers registered (video + analysis queues)');
}
