"use strict";
// ============================================================================
// FREESTYLE ANALYZER
// ============================================================================
// Analyzes general hand movements without specific constraints
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFreestyle = analyzeFreestyle;
const analysisUtils_1 = require("./analysisUtils");
/**
 * Analyze freestyle movement
 */
async function analyzeFreestyle(input) {
    const { rawLandmarks, movement } = input;
    const anomalies = [];
    // Parse landmarks
    const frames = (0, analysisUtils_1.parseLandmarks)(rawLandmarks);
    if (frames.length < 10) {
        return createEmptyResult('Insufficient frames for analysis');
    }
    // Detect sample rate
    const sampleRate = (0, analysisUtils_1.detectSampleRate)(frames);
    // Calculate hand stability (wrist position variance)
    const handStability = calculateHandStability(frames);
    // Calculate overall ROM (range of finger movements)
    const overallROM = calculateOverallROM(frames);
    // Calculate tremor frequency
    const tremorFrequency = calculateTremorFrequency(frames, sampleRate);
    // Calculate smoothness
    const smoothness = calculateOverallSmoothness(frames, sampleRate);
    // Validate results
    validateFreestyleResults(frames, anomalies);
    // Calculate quality score
    const qualityScore = calculateQualityScore(frames, anomalies);
    // Calculate confidence
    const confidence = calculateConfidence(frames, qualityScore);
    return {
        metrics: {
            handStability,
            overallROM,
            tremorFrequency,
            smoothness
        },
        confidence,
        qualityScore,
        anomalies
    };
}
/**
 * Calculate hand stability based on wrist position variance
 */
function calculateHandStability(frames) {
    const wristPositions = {
        x: [],
        y: [],
        z: []
    };
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21)
            continue;
        const wrist = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST];
        wristPositions.x.push(wrist.x);
        wristPositions.y.push(wrist.y);
        wristPositions.z.push(wrist.z);
    }
    if (wristPositions.x.length < 10)
        return 0;
    // Calculate variance in each dimension
    const varX = (0, analysisUtils_1.standardDeviation)(wristPositions.x);
    const varY = (0, analysisUtils_1.standardDeviation)(wristPositions.y);
    const varZ = (0, analysisUtils_1.standardDeviation)(wristPositions.z);
    // Total variance
    const totalVar = Math.sqrt(varX * varX + varY * varY + varZ * varZ);
    // Convert to stability score
    // Lower variance = higher stability
    // Typical normalized coord variance: 0.01-0.1 for stable, 0.1-0.3 for active
    return Math.max(0, Math.min(1, 1 - totalVar * 5));
}
/**
 * Calculate overall range of motion across all fingers
 */
function calculateOverallROM(frames) {
    const fingerNames = [
        'thumb', 'index', 'middle', 'ring', 'little'
    ];
    const romValues = [];
    for (const finger of fingerNames) {
        const extensions = [];
        for (const frame of frames) {
            if (!frame.landmarks || frame.landmarks.length < 21)
                continue;
            const extension = (0, analysisUtils_1.calculateFingerExtension)(frame.landmarks, finger);
            extensions.push(extension);
        }
        if (extensions.length >= 10) {
            const rom = (0, analysisUtils_1.range)(extensions);
            // Convert to degrees (approximate)
            // Typical extension range: 0.1-0.3 normalized = 30-90 degrees
            const romDegrees = rom * 300; // Rough conversion
            romValues.push(romDegrees);
        }
    }
    return romValues.length > 0 ? (0, analysisUtils_1.mean)(romValues) : 0;
}
/**
 * Calculate tremor frequency from wrist movement
 */
function calculateTremorFrequency(frames, sampleRate) {
    const wristX = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21)
            continue;
        wristX.push(frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST].x);
    }
    if (wristX.length < 20)
        return 0;
    // Remove slow movement component
    const smoothed = (0, analysisUtils_1.movingAverage)(wristX, 10);
    const tremor = wristX.map((v, i) => v - (smoothed[i] || 0));
    // Find dominant frequency
    const { frequency } = (0, analysisUtils_1.calculateDominantFrequency)(tremor, sampleRate);
    return frequency;
}
/**
 * Calculate overall movement smoothness
 */
function calculateOverallSmoothness(frames, sampleRate) {
    const wristX = [];
    const wristY = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21)
            continue;
        wristX.push(frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST].x);
        wristY.push(frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST].y);
    }
    if (wristX.length < 20)
        return 0.5;
    // Calculate SPARC for both dimensions
    const sparcX = (0, analysisUtils_1.calculateSPARC)(wristX, sampleRate);
    const sparcY = (0, analysisUtils_1.calculateSPARC)(wristY, sampleRate);
    return (sparcX + sparcY) / 2;
}
/**
 * Validate freestyle results
 */
function validateFreestyleResults(frames, anomalies) {
    // Check for sufficient movement
    const wristX = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21)
            continue;
        wristX.push(frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST].x);
    }
    if (wristX.length > 0) {
        const movementRange = (0, analysisUtils_1.range)(wristX);
        if (movementRange < 0.01) {
            anomalies.push('Very limited hand movement detected');
        }
    }
    // Check frame completeness
    const validFrames = frames.filter(f => f.landmarks && f.landmarks.length >= 21).length;
    if (validFrames < frames.length * 0.5) {
        anomalies.push('Many frames with incomplete landmark data');
    }
}
/**
 * Calculate quality score
 */
function calculateQualityScore(frames, anomalies) {
    let score = 1.0;
    // Check frame completeness
    const validFrames = frames.filter(f => f.landmarks && f.landmarks.length >= 21).length;
    const completeness = validFrames / frames.length;
    score *= completeness;
    // Check frame confidence
    const avgConfidence = (0, analysisUtils_1.mean)(frames.filter(f => f.confidence !== undefined).map(f => f.confidence));
    if (avgConfidence > 0) {
        score *= avgConfidence;
    }
    // Penalize for anomalies
    score -= anomalies.length * 0.1;
    return Math.max(0, Math.min(1, score));
}
/**
 * Calculate overall confidence
 */
function calculateConfidence(frames, qualityScore) {
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
            handStability: 0,
            overallROM: 0,
            tremorFrequency: 0,
            smoothness: 0
        },
        confidence: 0,
        qualityScore: 0,
        anomalies: [errorMessage]
    };
}
