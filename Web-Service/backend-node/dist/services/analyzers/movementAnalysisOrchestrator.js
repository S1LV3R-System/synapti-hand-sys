"use strict";
// ============================================================================
// MOVEMENT ANALYSIS ORCHESTRATOR
// ============================================================================
// Coordinates movement-specific analysis for protocol-based recordings
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRecordingWithProtocol = analyzeRecordingWithProtocol;
exports.reanalyzeRecording = reanalyzeRecording;
exports.getMovementAnalysis = getMovementAnalysis;
exports.protocolRequiresReanalysis = protocolRequiresReanalysis;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../../utils/schema-compat");
const wristRotationAnalyzer_1 = require("./wristRotationAnalyzer");
const fingerTappingAnalyzer_1 = require("./fingerTappingAnalyzer");
const fingersBendingAnalyzer_1 = require("./fingersBendingAnalyzer");
const apertureClosureAnalyzer_1 = require("./apertureClosureAnalyzer");
const objectHoldAnalyzer_1 = require("./objectHoldAnalyzer");
const freestyleAnalyzer_1 = require("./freestyleAnalyzer");
const analysisUtils_1 = require("./analysisUtils");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
/**
 * Main entry point for analyzing a recording based on its protocol
 */
async function analyzeRecordingWithProtocol(input) {
    const { recordingSessionId, protocolId } = input;
    console.log(`Starting protocol-based analysis for recording: ${recordingSessionId}`);
    // 1. Load protocol
    const protocol = await prisma.protocol.findUnique({
        where: { id: protocolId }
    });
    if (!protocol) {
        throw new Error(`Protocol not found: ${protocolId}`);
    }
    // 2. Parse protocol configuration
    let configuration;
    try {
        configuration = JSON.parse(protocol.configuration);
    }
    catch (error) {
        throw new Error(`Invalid protocol configuration: ${error}`);
    }
    // 3. Load signal processing result
    const signalResult = await prisma.signalProcessingResult.findFirst({
        where: { recordingSessionId },
        orderBy: { createdAt: 'desc' }
    });
    if (!signalResult) {
        throw new Error(`No signal processing result found for recording: ${recordingSessionId}`);
    }
    // 4. Analyze each movement
    const movementAnalysis = {};
    const analysisResults = [];
    for (const movement of configuration.movements) {
        try {
            const result = await analyzeMovement(movement, signalResult.rawLandmarks);
            movementAnalysis[movement.id] = {
                movementType: movement.movementType,
                hand: movement.hand,
                posture: movement.posture,
                metrics: result.metrics,
                confidence: result.confidence,
                qualityScore: result.qualityScore,
                anomalies: result.anomalies
            };
            analysisResults.push(movementAnalysis[movement.id]);
            console.log(`Analyzed movement ${movement.id} (${movement.movementType}): confidence=${result.confidence.toFixed(2)}`);
        }
        catch (error) {
            console.error(`Error analyzing movement ${movement.id}:`, error);
            movementAnalysis[movement.id] = {
                movementType: movement.movementType,
                hand: movement.hand,
                posture: movement.posture,
                metrics: {},
                confidence: 0,
                qualityScore: 0,
                anomalies: [`Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    // 5. Calculate overall metrics
    const overallMetrics = calculateOverallMetrics(analysisResults, movementAnalysis);
    // 6. Store or update clinical analysis
    // First check if analysis exists for this recording with version 2.0
    const existingAnalysis = await prisma.clinicalAnalysis.findFirst({
        where: {
            recordingSessionId,
            analysisVersion: '2.0'
        }
    });
    const analysisData = {
        overallScore: overallMetrics.overallScore,
        tremorFrequency: overallMetrics.tremorFrequency,
        tremorAmplitude: overallMetrics.tremorAmplitude,
        sparc: overallMetrics.smoothness,
        confidence: overallMetrics.confidence,
        clinicalSummary: JSON.stringify({
            movementAnalysis,
            protocolId,
            analysisTimestamp: new Date().toISOString()
        })
    };
    let clinicalAnalysis;
    if (existingAnalysis) {
        clinicalAnalysis = await prisma.clinicalAnalysis.update({
            where: { id: existingAnalysis.id },
            data: {
                ...analysisData,
                updatedAt: new Date()
            }
        });
    }
    else {
        clinicalAnalysis = await prisma.clinicalAnalysis.create({
            data: {
                recordingSessionId,
                analysisVersion: '2.0',
                analysisType: 'comprehensive',
                ...analysisData
            }
        });
    }
    console.log(`Protocol-based analysis complete: ${clinicalAnalysis.id}`);
    return {
        clinicalAnalysisId: clinicalAnalysis.id,
        movementAnalysis,
        overallMetrics,
        timestamp: new Date().toISOString()
    };
}
/**
 * Analyze a single movement based on its type
 */
async function analyzeMovement(movement, rawLandmarks) {
    switch (movement.movementType) {
        case 'wrist_rotation':
            return (0, wristRotationAnalyzer_1.analyzeWristRotation)({
                rawLandmarks,
                movement,
                config: movement.config
            });
        case 'finger_tapping':
            return (0, fingerTappingAnalyzer_1.analyzeFingerTapping)({
                rawLandmarks,
                movement,
                config: movement.config
            });
        case 'fingers_bending':
            return (0, fingersBendingAnalyzer_1.analyzeFingersBending)({
                rawLandmarks,
                movement,
                config: movement.config
            });
        case 'aperture_closure':
            return (0, apertureClosureAnalyzer_1.analyzeApertureClosure)({
                rawLandmarks,
                movement,
                config: movement.config
            });
        case 'object_hold':
            return (0, objectHoldAnalyzer_1.analyzeObjectHold)({
                rawLandmarks,
                movement,
                config: movement.config
            });
        case 'freestyle':
            return (0, freestyleAnalyzer_1.analyzeFreestyle)({
                rawLandmarks,
                movement
            });
        default:
            throw new Error(`Unknown movement type: ${movement.movementType}`);
    }
}
/**
 * Calculate overall metrics from individual movement analyses
 */
function calculateOverallMetrics(results, movementAnalysis) {
    if (results.length === 0) {
        return {
            overallScore: 0,
            tremorFrequency: null,
            tremorAmplitude: null,
            smoothness: 0,
            confidence: 0
        };
    }
    // Collect metrics from all movements
    const confidences = results.map(r => r.confidence);
    const qualityScores = results.map(r => r.qualityScore);
    // Extract tremor metrics where available
    const tremorFrequencies = [];
    const tremorAmplitudes = [];
    const smoothnessValues = [];
    for (const [, result] of Object.entries(movementAnalysis)) {
        const metrics = result.metrics;
        if (metrics.tremorFrequency !== undefined && metrics.tremorFrequency > 0) {
            tremorFrequencies.push(metrics.tremorFrequency);
        }
        if (metrics.tremorAmplitude !== undefined && metrics.tremorAmplitude > 0) {
            tremorAmplitudes.push(metrics.tremorAmplitude);
        }
        if (metrics.rotationSmoothness !== undefined) {
            smoothnessValues.push(metrics.rotationSmoothness);
        }
        if (metrics.bendingSmoothness !== undefined) {
            smoothnessValues.push(metrics.bendingSmoothness);
        }
        if (metrics.smoothness !== undefined) {
            smoothnessValues.push(metrics.smoothness);
        }
    }
    // Calculate aggregates
    const overallConfidence = (0, analysisUtils_1.mean)(confidences);
    const overallQuality = (0, analysisUtils_1.mean)(qualityScores);
    // Overall score: combination of quality and confidence
    const overallScore = (overallQuality * 0.6 + overallConfidence * 0.4) * 100;
    return {
        overallScore: Math.round(overallScore),
        tremorFrequency: tremorFrequencies.length > 0 ? (0, analysisUtils_1.mean)(tremorFrequencies) : null,
        tremorAmplitude: tremorAmplitudes.length > 0 ? (0, analysisUtils_1.mean)(tremorAmplitudes) : null,
        smoothness: smoothnessValues.length > 0 ? (0, analysisUtils_1.mean)(smoothnessValues) : 0,
        confidence: overallConfidence
    };
}
/**
 * Re-analyze an existing recording with a different or updated protocol
 */
async function reanalyzeRecording(recordingSessionId) {
    // Get recording with protocol
    const recording = await prisma.recordingSession.findUnique({
        where: { id: recordingSessionId },
        select: { protocolId: true }
    });
    if (!recording?.protocolId) {
        console.log(`Recording ${recordingSessionId} has no protocol - skipping analysis`);
        return null;
    }
    return analyzeRecordingWithProtocol({
        recordingSessionId,
        protocolId: recording.protocolId
    });
}
/**
 * Get analysis results for a recording
 */
async function getMovementAnalysis(recordingSessionId) {
    const analysis = await prisma.clinicalAnalysis.findFirst({
        where: {
            recordingSessionId,
            analysisVersion: '2.0'
        },
        orderBy: { createdAt: 'desc' }
    });
    if (!analysis?.clinicalSummary) {
        return null;
    }
    try {
        const summary = JSON.parse(analysis.clinicalSummary);
        return summary.movementAnalysis || null;
    }
    catch {
        return null;
    }
}
/**
 * Check if protocol requires re-analysis
 */
function protocolRequiresReanalysis(existingAnalysisTimestamp, protocolUpdatedAt) {
    return protocolUpdatedAt > existingAnalysisTimestamp;
}
