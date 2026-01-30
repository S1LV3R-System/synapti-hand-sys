"use strict";
// ============================================================================
// WRIST ROTATION ANALYZER
// ============================================================================
// Analyzes wrist rotation movements for tremor, range of motion, and smoothness
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeWristRotation = analyzeWristRotation;
const analysisUtils_1 = require("./analysisUtils");
/**
 * Analyze wrist rotation movement
 */
async function analyzeWristRotation(input) {
    const { rawLandmarks, movement, config } = input;
    const anomalies = [];
    // Parse landmarks
    const frames = (0, analysisUtils_1.parseLandmarks)(rawLandmarks);
    if (frames.length < 10) {
        return createEmptyResult('Insufficient frames for analysis');
    }
    // Detect sample rate
    const sampleRate = (0, analysisUtils_1.detectSampleRate)(frames);
    // Extract rotation angles over time
    const rotationAngles = extractRotationAngles(frames);
    // Apply smoothing
    const smoothedAngles = (0, analysisUtils_1.movingAverage)(rotationAngles, 5);
    // Calculate metrics
    const rotationRange = (0, analysisUtils_1.range)(smoothedAngles);
    // Calculate smoothness using SPARC
    const rotationSmoothness = (0, analysisUtils_1.calculateSPARC)(smoothedAngles, sampleRate);
    // Extract tremor signal (high-frequency component)
    const tremorSignal = extractTremorSignal(rotationAngles, smoothedAngles);
    // Calculate tremor metrics using FFT
    const { frequency: dominantFrequency, power } = (0, analysisUtils_1.calculateDominantFrequency)(tremorSignal, sampleRate);
    // Calculate tremor amplitude (RMS of tremor signal)
    const tremorAmplitudeRaw = Math.sqrt((0, analysisUtils_1.mean)(tremorSignal.map(t => t * t)));
    const tremorAmplitude = (0, analysisUtils_1.pixelsToMm)(tremorAmplitudeRaw);
    // Tremor frequency - typical pathological tremor is 3-12 Hz
    const tremorFrequency = dominantFrequency;
    // Validate based on expected rotation direction
    validateRotationDirection(smoothedAngles, config.subMovement, anomalies);
    // Calculate quality score
    const qualityScore = calculateQualityScore(frames, rotationAngles, anomalies);
    // Calculate confidence
    const confidence = calculateConfidence(frames, qualityScore);
    return {
        metrics: {
            rotationRange,
            rotationSmoothness,
            dominantFrequency,
            tremorAmplitude,
            tremorFrequency
        },
        confidence,
        qualityScore,
        anomalies
    };
}
/**
 * Extract rotation angles from frames
 */
function extractRotationAngles(frames) {
    const angles = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21) {
            continue;
        }
        const wrist = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST];
        const middleMcp = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.MIDDLE_MCP];
        const indexMcp = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.INDEX_MCP];
        const angle = (0, analysisUtils_1.calculateRotationAngle)(wrist, middleMcp, indexMcp);
        angles.push(angle);
    }
    return angles;
}
/**
 * Extract tremor signal (difference between raw and smoothed)
 */
function extractTremorSignal(raw, smoothed) {
    const tremor = [];
    const minLength = Math.min(raw.length, smoothed.length);
    for (let i = 0; i < minLength; i++) {
        tremor.push(raw[i] - smoothed[i]);
    }
    return tremor;
}
/**
 * Validate rotation direction matches expected
 */
function validateRotationDirection(angles, expectedDirection, anomalies) {
    if (angles.length < 2)
        return;
    // Calculate overall direction
    const startAngle = (0, analysisUtils_1.mean)(angles.slice(0, Math.min(5, angles.length)));
    const endAngle = (0, analysisUtils_1.mean)(angles.slice(-Math.min(5, angles.length)));
    const overallChange = endAngle - startAngle;
    // Check if direction matches expected
    switch (expectedDirection) {
        case 'rotation_in':
            if (overallChange > 0) {
                anomalies.push('Rotation direction may not match expected (rotation_in)');
            }
            break;
        case 'rotation_out':
            if (overallChange < 0) {
                anomalies.push('Rotation direction may not match expected (rotation_out)');
            }
            break;
        case 'rotation_in_out':
        case 'rotation_out_in':
            // These should show bidirectional movement
            const angleRange = (0, analysisUtils_1.range)(angles);
            if (angleRange < 20) {
                anomalies.push('Limited rotation range for bidirectional movement');
            }
            break;
    }
}
/**
 * Calculate quality score based on data quality
 */
function calculateQualityScore(frames, angles, anomalies) {
    let score = 1.0;
    // Penalize for missing frames
    const expectedFrames = frames.length;
    const actualAngles = angles.length;
    const frameCompleteness = actualAngles / expectedFrames;
    score *= frameCompleteness;
    // Penalize for low confidence frames
    const avgConfidence = (0, analysisUtils_1.mean)(frames.filter(f => f.confidence !== undefined).map(f => f.confidence));
    if (avgConfidence > 0) {
        score *= avgConfidence;
    }
    // Penalize for anomalies
    score -= anomalies.length * 0.1;
    return Math.max(0, Math.min(1, score));
}
/**
 * Calculate overall confidence in the analysis
 */
function calculateConfidence(frames, qualityScore) {
    // Base confidence from quality
    let confidence = qualityScore;
    // Boost for sufficient data
    if (frames.length >= 60) {
        confidence *= 1.1;
    }
    else if (frames.length < 30) {
        confidence *= 0.8;
    }
    return Math.max(0, Math.min(1, confidence));
}
/**
 * Create empty result for error cases
 */
function createEmptyResult(errorMessage) {
    return {
        metrics: {
            rotationRange: 0,
            rotationSmoothness: 0,
            dominantFrequency: 0,
            tremorAmplitude: 0,
            tremorFrequency: 0
        },
        confidence: 0,
        qualityScore: 0,
        anomalies: [errorMessage]
    };
}
