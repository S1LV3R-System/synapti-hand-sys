// ============================================================================
// PROCESSING WORKER - Background job processor
// ============================================================================

import { Job } from 'bull';
import prisma from '../lib/prisma';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { ProcessingJobData, ProcessingResult } from '../types/processing.types';
import { gcsService } from '../services/gcs.service';
import { processingService } from '../services/processing.service';
import { lstmAnalysisService } from '../services/lstm-analysis.service';
import { queueService } from '../services/queue.service';
import { analyzeRecordingWithProtocol } from '../services/analyzers/movementAnalysisOrchestrator';

/**
 * Convert XLSX file to CSV format
 * Android uploads keypoints.xlsx but processing expects CSV
 */
function convertXlsxToCsv(xlsxPath: string, csvPath: string): void {
  console.log(`[WORKER] Converting XLSX to CSV: ${xlsxPath} → ${csvPath}`);

  const workbook = XLSX.readFile(xlsxPath);

  // Get the first sheet (Android creates "Left Hand" and "Right Hand" sheets)
  // For processing, we combine both hands into a single CSV
  const allData: any[][] = [];
  let headerWritten = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (jsonData.length === 0) continue;

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

  fs.writeFileSync(csvPath, csvContent);
  console.log(`[WORKER] ✓ Converted ${allData.length} rows to CSV`);
}


/**
 * Process video recording job
 * Supports both parallel upload (keypoints-first) and legacy unified upload
 */
export async function processVideoJob(job: Job<ProcessingJobData>): Promise<ProcessingResult> {
  const { recordingId, patientId, keypointsGcsPath, videoGcsPath, protocolId, configuration } = job.data;

  // Determine processing mode
  const isParallelUpload = !!keypointsGcsPath;
  const hasVideo = !!videoGcsPath;

  console.log(`\n[WORKER] Starting processing for recording: ${recordingId}`);
  console.log(`[WORKER] Mode: ${isParallelUpload ? 'Parallel (keypoints-first)' : 'Legacy (video)'}`);

  let tempVideoPath: string | null = null;
  let tempKeypointsPath: string | null = null;
  let tempOutputDir: string | null = null;

  try {
    // Update progress
    await job.progress(10);

    // Create temp directories
    const tempDir = process.env.TEMP_UPLOAD_DIR || '/tmp/synaptihand-processing';
    tempOutputDir = path.join(tempDir, recordingId);

    if (!fs.existsSync(tempOutputDir)) {
      fs.mkdirSync(tempOutputDir, { recursive: true });
    }

    // Download keypoints file for parallel upload (handles both XLSX and CSV)
    if (isParallelUpload && keypointsGcsPath) {
      console.log(`[WORKER] Downloading keypoints from GCS: ${keypointsGcsPath}`);

      // Determine file extension from GCS path
      const isXlsx = keypointsGcsPath.toLowerCase().endsWith('.xlsx');
      const downloadedPath = path.join(tempOutputDir, isXlsx ? 'keypoints.xlsx' : 'keypoints.csv');
      await gcsService.downloadFile(keypointsGcsPath, downloadedPath);

      // Convert XLSX to CSV if needed (Android uploads .xlsx, processing expects .csv)
      if (isXlsx) {
        tempKeypointsPath = path.join(tempOutputDir, 'keypoints.csv');
        convertXlsxToCsv(downloadedPath, tempKeypointsPath);
        // Clean up the original xlsx file
        fs.unlinkSync(downloadedPath);
      } else {
        tempKeypointsPath = downloadedPath;
      }
    }

    // Download video if available (legacy mode or parallel with video)
    if (hasVideo && videoGcsPath) {
      console.log(`[WORKER] Downloading video from GCS: ${videoGcsPath}`);
      tempVideoPath = path.join(tempOutputDir, 'input_video.mp4');
      await gcsService.downloadFile(videoGcsPath, tempVideoPath);
    }

    await job.progress(20);

    // Update database status
    await prisma.experimentSession.update({
      where: { id: recordingId },
      data: {
        status: 'processing',
      },
    });

    // Call Python processing service
    // For parallel upload: process keypoints CSV directly (faster - no video required)
    // For legacy upload: process video to extract keypoints first
    console.log(`[WORKER] Starting Python processing service`);
    const pythonResults = await processingService.processVideoAndWait(
      tempVideoPath || tempKeypointsPath!,  // Prefer video, fallback to keypoints
      tempOutputDir,
      {
        handDetection: configuration?.handDetection || { confidence: 0.5, maxHands: 2 },
        filters: configuration?.filters || ['butterworth', 'kalman', 'savitzky_golay'],
        analysisTypes: configuration?.analysisTypes || ['tremor', 'rom', 'coordination', 'smoothness'],
        outputFormats: configuration?.outputFormats || (tempVideoPath ? ['video', 'excel', 'dashboards'] : ['excel', 'dashboards']),
      }
    );

    await job.progress(70);

    // Upload output files to GCS (Result-Output/{recordingId}/)
    console.log(`[WORKER] Uploading output files to GCS (Result-Output/${recordingId}/)`);
    const recording = await prisma.experimentSession.findUnique({
      where: { id: recordingId },
      include: { patient: true },
    });

    if (!recording) {
      throw new Error('Recording not found');
    }

    const outputPaths: any = {};

    // Upload labeled video to Result-Output/{recordingId}/video_labeled.mp4
    if (pythonResults.outputs.videoLabeledPath && fs.existsSync(pythonResults.outputs.videoLabeledPath)) {
      const videoGcsPath = gcsService.generateResultOutputPath(recordingId, 'video_labeled.mp4');
      outputPaths.videoLabeledPath = await gcsService.uploadFile(
        pythonResults.outputs.videoLabeledPath,
        videoGcsPath
      );
    }

    // Upload raw data Excel to Result-Output/{recordingId}/Raw_data.xlsx
    if (pythonResults.outputs.rawDataPath && fs.existsSync(pythonResults.outputs.rawDataPath)) {
      const dataGcsPath = gcsService.generateResultOutputPath(recordingId, 'Raw_data.xlsx');
      outputPaths.rawDataPath = await gcsService.uploadFile(
        pythonResults.outputs.rawDataPath,
        dataGcsPath
      );
    }

    // Upload dashboard image to Result-Output/{recordingId}/Comprehensive_Hand_Kinematic_Dashboard.png
    if (pythonResults.outputs.dashboardPath && fs.existsSync(pythonResults.outputs.dashboardPath)) {
      const dashboardGcsPath = gcsService.generateResultOutputPath(recordingId, 'Comprehensive_Hand_Kinematic_Dashboard.png');
      outputPaths.dashboardPath = await gcsService.uploadFile(
        pythonResults.outputs.dashboardPath,
        dashboardGcsPath
      );
    }

    // Upload aperture dashboard to Result-Output/{recordingId}/Advance_Hand_Aperture-Closure_Dashboard.png
    if (pythonResults.outputs.apertureDashboardPath && fs.existsSync(pythonResults.outputs.apertureDashboardPath)) {
      const apertureGcsPath = gcsService.generateResultOutputPath(recordingId, 'Advance_Hand_Aperture-Closure_Dashboard.png');
      outputPaths.apertureDashboardPath = await gcsService.uploadFile(
        pythonResults.outputs.apertureDashboardPath,
        apertureGcsPath
      );
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
      const lstmAvailable = await lstmAnalysisService.isAvailable();

      if (lstmAvailable && tempKeypointsPath) {
        const lstmOutputDir = path.join(tempOutputDir, 'lstm_analysis');
        if (!fs.existsSync(lstmOutputDir)) {
          fs.mkdirSync(lstmOutputDir, { recursive: true });
        }

        // Load protocol configuration with analysisOutputs for LSTM analysis
        let protocolJsonPath: string | undefined;
        if (protocolId) {
          const protocol = await prisma.protocol.findUnique({
            where: { id: protocolId }
          });

          if (protocol) {
            // Build protocol config with analysisOutputs from dedicated column
            const protocolConfig = {
              name: protocol.protocolName,
              version: protocol.version || '1.0',
              movements: protocol.protocolInformation || [],
              instructions: protocol.patientInstructions || '',
              clinicalGuidelines: protocol.clinicalGuidelines || '',
              overallRepetitions: protocol.overallRepetitions || 1,
              // Key: analysisOutputs from dedicated column determines which outputs to generate
              analysisOutputs: protocol.analysisOutputs || null,
            };

            // Save protocol config as JSON for Python to read
            protocolJsonPath = path.join(lstmOutputDir, 'protocol_config.json');
            fs.writeFileSync(protocolJsonPath, JSON.stringify(protocolConfig, null, 2));
            console.log(`[WORKER] Saved protocol config with analysisOutputs to: ${protocolJsonPath}`);
          }
        }

        const lstmResults = await lstmAnalysisService.analyzeCsv({
          inputCsv: tempKeypointsPath,
          outputDir: lstmOutputDir,
          recordingId: recordingId,
          patientId: patientId,
          protocolJson: protocolJsonPath,  // Pass protocol config to Python analysis
          fps: 30,
          adaptive: true,  // Enable adaptive filtering and LSTM
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
                rawPredictions: null,  // Can be added if needed
              },
            });
          }

          // Upload LSTM Excel report to GCS
          if (lstmResults.output_paths.excel_report && fs.existsSync(lstmResults.output_paths.excel_report)) {
            const lstmReportGcsPath = gcsService.generateResultOutputPath(recordingId, 'LSTM_Analysis_Report.xlsx');
            outputPaths.lstmReportPath = await gcsService.uploadFile(
              lstmResults.output_paths.excel_report,
              lstmReportGcsPath
            );
            console.log(`[WORKER] ✓ Uploaded LSTM Excel report`);
          }

          // Upload LSTM PDF report to GCS
          if (lstmResults.output_paths.pdf_report && fs.existsSync(lstmResults.output_paths.pdf_report)) {
            const lstmPdfGcsPath = gcsService.generateResultOutputPath(recordingId, 'LSTM_Analysis_Report.pdf');
            outputPaths.lstmPdfPath = await gcsService.uploadFile(
              lstmResults.output_paths.pdf_report,
              lstmPdfGcsPath
            );
            console.log(`[WORKER] ✓ Uploaded LSTM PDF report`);
          }

          // Upload combined plots PNG to GCS
          if (lstmResults.output_paths.plots && fs.existsSync(lstmResults.output_paths.plots)) {
            const lstmPlotsGcsPath = gcsService.generateResultOutputPath(recordingId, 'LSTM_Plots.png');
            outputPaths.lstmPlotsPath = await gcsService.uploadFile(
              lstmResults.output_paths.plots,
              lstmPlotsGcsPath
            );
            console.log(`[WORKER] ✓ Uploaded LSTM combined plots`);
          }

          // Upload separate plot PNGs (user mentioned: "all of the plots are generated as separate png")
          const separatePlots = await lstmAnalysisService.getPlotFiles(lstmOutputDir);
          if (separatePlots.length > 0) {
            console.log(`[WORKER] Uploading ${separatePlots.length} separate plot files`);
            outputPaths.lstmSeparatePlots = [];

            for (const plotPath of separatePlots) {
              const plotFilename = path.basename(plotPath);
              const plotGcsPath = gcsService.generateResultOutputPath(recordingId, `LSTM_${plotFilename}`);
              const uploadedPath = await gcsService.uploadFile(plotPath, plotGcsPath);
              outputPaths.lstmSeparatePlots.push(uploadedPath);
            }
            console.log(`[WORKER] ✓ Uploaded ${separatePlots.length} separate plot files`);
          }

          console.log(`[WORKER] ✓ LSTM analysis complete - ${lstmResults.lstm_events.length} events detected`);
          console.log(`[WORKER] Event summary:`, lstmResults.event_summary);
        } else if (lstmResults.success) {
          console.log(`[WORKER] LSTM analysis completed but no events detected`);
        } else {
          console.warn(`[WORKER] LSTM analysis failed: ${lstmResults.error}`);
        }
      } else if (!lstmAvailable) {
        console.warn(`[WORKER] LSTM analysis not available - skipping`);
      } else {
        console.warn(`[WORKER] No keypoints CSV available for LSTM analysis - skipping`);
      }
    } catch (lstmError) {
      // Non-fatal error - continue processing even if LSTM fails
      console.error(`[WORKER] LSTM analysis error (non-fatal):`, lstmError);
    }

    // ========================================================================
    // PROTOCOL-BASED MOVEMENT ANALYSIS (If protocolId present)
    // ========================================================================
    if (protocolId) {
      console.log(`[WORKER] Running protocol-based analysis for protocol: ${protocolId}`);
      try {
        const protocolResults = await analyzeRecordingWithProtocol({
          recordingSessionId: recordingId,
          protocolId: protocolId,
        });
        
        console.log(`[WORKER] ✓ Protocol analysis complete: ${protocolResults.clinicalAnalysisId}`);
        console.log(`[WORKER] Overall score: ${protocolResults.overallMetrics.overallScore}`);
        
        // Store protocol analysis results in output paths
        outputPaths.protocolAnalysisId = protocolResults.clinicalAnalysisId;
      } catch (protocolError) {
        // Non-fatal error - continue even if protocol analysis fails
        console.error(`[WORKER] Protocol analysis error (non-fatal):`, protocolError);
      }
    } else {
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
        rawKeypointDataPath: outputPaths.rawDataPath,
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
  } catch (error) {
    console.error(`[WORKER] Error processing recording ${recordingId}:`, error);

    // Update recording status to failed
    await prisma.experimentSession.update({
      where: { id: recordingId },
      data: {
        status: 'failed',
        analysisError: error instanceof Error ? error.message : 'Unknown error',
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
function cleanupTempDirectory(tempOutputDir: string | null): void {
  try {
    if (tempOutputDir && fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
      console.log(`[WORKER] Cleaned up temp directory: ${tempOutputDir}`);
    }
  } catch (error) {
    console.error('[WORKER] Error cleaning up temp files:', error);
  }
}

/**
 * Register workers with queues
 * CRITICAL: Both video and analysis queues need workers!
 * - Video queue: Processes video files (legacy/unified upload)
 * - Analysis queue: Processes keypoints CSV (parallel upload - priority channel)
 */
export function registerWorker(): void {
  const { videoQueue, analysisQueue } = queueService.getQueues();

  // Video processing worker
  videoQueue.process(async (job: Job<ProcessingJobData>) => {
    return await processVideoJob(job);
  });

  // CRITICAL: Analysis queue worker for parallel upload keypoints-first flow
  // Without this, keypoints uploads get stuck in "analyzing" status forever!
  analysisQueue.process(async (job: Job<ProcessingJobData>) => {
    // Analysis jobs process keypoints CSV directly (no video required)
    return await processVideoJob(job);  // Same logic handles both paths
  });

  console.log('🔧 Processing workers registered (video + analysis queues)');
}
