"use strict";
// ============================================================================
// OBJECT HOLD ANALYZER
// ============================================================================
// Analyzes object holding movements for grip stability and tremor
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeObjectHold = analyzeObjectHold;
const analysisUtils_1 = require("./analysisUtils");
/**
 * Analyze object hold movement
 */
async function analyzeObjectHold(input) {
    const { rawLandmarks, movement, config } = input;
    const anomalies = [];
    // Parse landmarks
    const frames = (0, analysisUtils_1.parseLandmarks)(rawLandmarks);
    if (frames.length < 10) {
        return createEmptyResult('Insufficient frames for analysis');
    }
    // Detect sample rate
    const sampleRate = (0, analysisUtils_1.detectSampleRate)(frames);
    // Extract hand position signal (centroid movement)
    const positionSignal = extractPositionSignal(frames);
    if (positionSignal.x.length < 10) {
        return createEmptyResult('Unable to extract position signal');
    }
    // Calculate grip stability based on hold type
    const gripStability = calculateGripStability(frames, config.subMovement, sampleRate);
    // Calculate tremor during hold
    const smoothedX = (0, analysisUtils_1.movingAverage)(positionSignal.x, 5);
    const tremorSignalX = positionSignal.x.map((v, i) => v - (smoothedX[i] || 0));
    const { frequency: tremorDuringHold } = (0, analysisUtils_1.calculateDominantFrequency)(tremorSignalX, sampleRate);
    // Calculate hold duration (time when hand is relatively stable)
    const holdDuration = calculateHoldDuration(positionSignal, sampleRate);
    // Calculate position stability (inverse of position variance)
    const positionStability = calculatePositionStability(positionSignal);
    // Validate results
    validateHoldResults(frames, config, gripStability, holdDuration, anomalies);
    // Calculate quality score
    const qualityScore = calculateQualityScore(frames, positionSignal, anomalies);
    // Calculate confidence
    const confidence = calculateConfidence(frames, qualityScore);
    return {
        metrics: {
            gripStability,
            tremorDuringHold,
            holdDuration,
            positionStability
        },
        confidence,
        qualityScore,
        anomalies
    };
}
/**
 * Extract hand position signal (wrist centroid over time)
 */
function extractPositionSignal(frames) {
    const x = [];
    const y = [];
    const z = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21) {
            continue;
        }
        const wrist = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST];
        x.push(wrist.x);
        y.push(wrist.y);
        z.push(wrist.z);
    }
    return { x, y, z };
}
/**
 * Calculate grip stability based on hold type
 */
function calculateGripStability(frames, holdType, sampleRate) {
    if (frames.length < 10)
        return 0;
    const fingerDistances = [[], [], [], [], []];
    const fingerIndices = [
        analysisUtils_1.FINGER_LANDMARKS.thumb,
        analysisUtils_1.FINGER_LANDMARKS.index,
        analysisUtils_1.FINGER_LANDMARKS.middle,
        analysisUtils_1.FINGER_LANDMARKS.ring,
        analysisUtils_1.FINGER_LANDMARKS.little
    ];
    // Track finger tip positions relative to wrist
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21)
            continue;
        const wrist = frame.landmarks[analysisUtils_1.HAND_LANDMARKS.WRIST];
        fingerIndices.forEach((indices, fingerIdx) => {
            const tip = frame.landmarks[indices[indices.length - 1]];
            const dist = (0, analysisUtils_1.distance3D)(wrist, tip);
            fingerDistances[fingerIdx].push(dist);
        });
    }
    // Calculate stability for each finger (lower variance = more stable)
    const stabilityScores = [];
    for (const distances of fingerDistances) {
        if (distances.length < 10)
            continue;
        const avgDist = (0, analysisUtils_1.mean)(distances);
        const stdDist = (0, analysisUtils_1.standardDeviation)(distances);
        // Normalize: variance / mean (coefficient of variation)
        const cv = avgDist > 0 ? stdDist / avgDist : 1;
        // Convert to stability score (lower CV = higher stability)
        const stability = Math.max(0, 1 - cv * 3);
        stabilityScores.push(stability);
    }
    // Different weights based on hold type
    if (holdType === 'closed_grasp') {
        // All fingers important for grasp
        return (0, analysisUtils_1.mean)(stabilityScores);
    }
    else {
        // Open palm - focus on finger extension consistency
        // Index, middle, ring, little more important than thumb
        const weights = [0.1, 0.25, 0.25, 0.2, 0.2];
        let weightedSum = 0;
        stabilityScores.forEach((score, i) => {
            weightedSum += score * weights[i];
        });
        return weightedSum;
    }
}
/**
 * Calculate hold duration (time with stable position)
 */
function calculateHoldDuration(positionSignal, sampleRate) {
    if (positionSignal.x.length < 10)
        return 0;
    // Calculate position change per frame
    const changes = [];
    for (let i = 1; i < positionSignal.x.length; i++) {
        const dx = positionSignal.x[i] - positionSignal.x[i - 1];
        const dy = positionSignal.y[i] - positionSignal.y[i - 1];
        const dz = positionSignal.z[i] - positionSignal.z[i - 1];
        const change = Math.sqrt(dx * dx + dy * dy + dz * dz);
        changes.push(change);
    }
    // Threshold for "stable" (low movement)
    const threshold = (0, analysisUtils_1.mean)(changes) * 0.5;
    // Count frames where hand is stable
    const stableFrames = changes.filter(c => c < threshold).length;
    return stableFrames / sampleRate;
}
/**
 * Calculate position stability
 */
function calculatePositionStability(positionSignal) {
    if (positionSignal.x.length < 10)
        return 0;
    // Calculate variance in each dimension
    const varX = (0, analysisUtils_1.standardDeviation)(positionSignal.x);
    const varY = (0, analysisUtils_1.standardDeviation)(positionSignal.y);
    const varZ = (0, analysisUtils_1.standardDeviation)(positionSignal.z);
    // Total position variance
    const totalVar = Math.sqrt(varX * varX + varY * varY + varZ * varZ);
    // Convert to stability score (lower variance = higher stability)
    // Typical normalized coordinate variance is 0.01-0.1
    const stability = Math.max(0, 1 - totalVar * 10);
    return stability;
}
/**
 * Validate hold results
 */
function validateHoldResults(frames, config, gripStability, holdDuration, anomalies) {
    // Check grip stability
    if (gripStability < 0.3) {
        anomalies.push('Low grip stability detected');
    }
    // Check hold duration
    if (holdDuration < 1) {
        anomalies.push('Very short hold duration detected');
    }
    // Check for appropriate grip pattern
    if (config.subMovement === 'closed_grasp') {
        // Expect fingers to be closer together
    }
    else if (config.subMovement === 'open_palm') {
        // Expect fingers to be spread
    }
}
/**
 * Calculate quality score
 */
function calculateQualityScore(frames, positionSignal, anomalies) {
    let score = 1.0;
    // Check signal completeness
    const completeness = positionSignal.x.length / frames.length;
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
            gripStability: 0,
            tremorDuringHold: 0,
            holdDuration: 0,
            positionStability: 0
        },
        confidence: 0,
        qualityScore: 0,
        anomalies: [errorMessage]
    };
}
