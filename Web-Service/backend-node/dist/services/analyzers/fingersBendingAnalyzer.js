"use strict";
// ============================================================================
// FINGERS BENDING ANALYZER
// ============================================================================
// Analyzes finger bending movements for range of motion and symmetry
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFingersBending = analyzeFingersBending;
const analysisUtils_1 = require("./analysisUtils");
/**
 * Analyze fingers bending movement
 */
async function analyzeFingersBending(input) {
    const { rawLandmarks, movement, config } = input;
    const anomalies = [];
    // Parse landmarks
    const frames = (0, analysisUtils_1.parseLandmarks)(rawLandmarks);
    if (frames.length < 10) {
        return createEmptyResult('Insufficient frames for analysis');
    }
    // Detect sample rate
    const sampleRate = (0, analysisUtils_1.detectSampleRate)(frames);
    // Calculate ROM for each finger
    const fingerNames = ['thumb', 'index', 'middle', 'ring', 'little'];
    const romPerFinger = {};
    const fingerBendingSignals = {};
    for (const finger of fingerNames) {
        const { rom, signal } = calculateFingerROM(frames, finger);
        romPerFinger[finger] = rom;
        fingerBendingSignals[finger] = signal;
    }
    // Calculate average bending smoothness
    const smoothnessValues = [];
    for (const finger of fingerNames) {
        const signal = fingerBendingSignals[finger];
        if (signal.length >= 10) {
            const smoothness = (0, analysisUtils_1.calculateSPARC)(signal, sampleRate);
            smoothnessValues.push(smoothness);
        }
    }
    const bendingSmoothness = smoothnessValues.length > 0
        ? (0, analysisUtils_1.mean)(smoothnessValues)
        : 0;
    // Calculate asymmetry index (compare left vs right side fingers)
    // For single hand, compare index+middle vs ring+little
    const leftSideSignal = [
        ...fingerBendingSignals['index'],
        ...fingerBendingSignals['middle']
    ];
    const rightSideSignal = [
        ...fingerBendingSignals['ring'],
        ...fingerBendingSignals['little']
    ];
    const asymmetryIndex = (0, analysisUtils_1.calculateAsymmetryIndex)(leftSideSignal, rightSideSignal);
    // Validate results
    validateBendingResults(romPerFinger, config, anomalies);
    // Calculate quality score
    const qualityScore = calculateQualityScore(frames, romPerFinger, anomalies);
    // Calculate confidence
    const confidence = calculateConfidence(frames, qualityScore);
    return {
        metrics: {
            romPerFinger,
            bendingSmoothness,
            asymmetryIndex
        },
        confidence,
        qualityScore,
        anomalies
    };
}
/**
 * Calculate range of motion for a specific finger
 */
function calculateFingerROM(frames, finger) {
    const indices = analysisUtils_1.FINGER_LANDMARKS[finger];
    const bendingAngles = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21) {
            continue;
        }
        // For thumb, use different joints
        if (finger === 'thumb') {
            // CMC-MCP-IP angle
            const cmc = frame.landmarks[indices[0]];
            const mcp = frame.landmarks[indices[1]];
            const ip = frame.landmarks[indices[2]];
            const angle = (0, analysisUtils_1.calculateAngle)(cmc, mcp, ip);
            bendingAngles.push(angle);
        }
        else {
            // MCP-PIP-DIP angle for other fingers
            const mcp = frame.landmarks[indices[0]];
            const pip = frame.landmarks[indices[1]];
            const dip = frame.landmarks[indices[2]];
            const angle = (0, analysisUtils_1.calculateAngle)(mcp, pip, dip);
            bendingAngles.push(angle);
        }
    }
    const rom = bendingAngles.length > 0 ? (0, analysisUtils_1.range)(bendingAngles) : 0;
    return { rom, signal: bendingAngles };
}
/**
 * Validate bending results
 */
function validateBendingResults(romPerFinger, config, anomalies) {
    const fingerNames = Object.keys(romPerFinger);
    // Check for abnormally low ROM
    for (const finger of fingerNames) {
        const rom = romPerFinger[finger];
        if (rom < 10) {
            anomalies.push(`Very limited range of motion detected for ${finger} finger`);
        }
    }
    // Check for asymmetry in bilateral mode
    if (config.subMovement === 'bilateral') {
        const indexRom = romPerFinger['index'] || 0;
        const middleRom = romPerFinger['middle'] || 0;
        const ringRom = romPerFinger['ring'] || 0;
        const littleRom = romPerFinger['little'] || 0;
        const leftAvg = (indexRom + middleRom) / 2;
        const rightAvg = (ringRom + littleRom) / 2;
        if (leftAvg > 0 && rightAvg > 0) {
            const asymmetry = Math.abs(leftAvg - rightAvg) / Math.max(leftAvg, rightAvg);
            if (asymmetry > 0.3) {
                anomalies.push('Significant asymmetry detected between finger groups');
            }
        }
    }
}
/**
 * Calculate quality score
 */
function calculateQualityScore(frames, romPerFinger, anomalies) {
    let score = 1.0;
    // Check for valid ROM values
    const romValues = Object.values(romPerFinger);
    const validRomCount = romValues.filter(r => r > 0).length;
    score *= validRomCount / 5; // 5 fingers expected
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
            romPerFinger: {
                thumb: 0,
                index: 0,
                middle: 0,
                ring: 0,
                little: 0
            },
            bendingSmoothness: 0,
            asymmetryIndex: 0
        },
        confidence: 0,
        qualityScore: 0,
        anomalies: [errorMessage]
    };
}
