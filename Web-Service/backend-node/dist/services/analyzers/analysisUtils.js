"use strict";
// ============================================================================
// ANALYSIS UTILITIES
// ============================================================================
// Common signal processing and analysis utilities for movement analyzers
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINGER_LANDMARKS = exports.HAND_LANDMARKS = void 0;
exports.parseLandmarks = parseLandmarks;
exports.distance3D = distance3D;
exports.distance2D = distance2D;
exports.calculateAngle = calculateAngle;
exports.calculateRotationAngle = calculateRotationAngle;
exports.mean = mean;
exports.standardDeviation = standardDeviation;
exports.variance = variance;
exports.min = min;
exports.max = max;
exports.range = range;
exports.movingAverage = movingAverage;
exports.detectPeaks = detectPeaks;
exports.calculateDominantFrequency = calculateDominantFrequency;
exports.calculateSPARC = calculateSPARC;
exports.calculateNormalizedJerk = calculateNormalizedJerk;
exports.normalize = normalize;
exports.coefficientOfVariation = coefficientOfVariation;
exports.calculateRegularity = calculateRegularity;
exports.calculateAsymmetryIndex = calculateAsymmetryIndex;
exports.extractFingerPositions = extractFingerPositions;
exports.calculateFingerExtension = calculateFingerExtension;
exports.calculatePalmSpan = calculatePalmSpan;
exports.pixelsToMm = pixelsToMm;
exports.detectSampleRate = detectSampleRate;
/**
 * Hand landmark indices as defined by MediaPipe
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 */
exports.HAND_LANDMARKS = {
    WRIST: 0,
    THUMB_CMC: 1,
    THUMB_MCP: 2,
    THUMB_IP: 3,
    THUMB_TIP: 4,
    INDEX_MCP: 5,
    INDEX_PIP: 6,
    INDEX_DIP: 7,
    INDEX_TIP: 8,
    MIDDLE_MCP: 9,
    MIDDLE_PIP: 10,
    MIDDLE_DIP: 11,
    MIDDLE_TIP: 12,
    RING_MCP: 13,
    RING_PIP: 14,
    RING_DIP: 15,
    RING_TIP: 16,
    PINKY_MCP: 17,
    PINKY_PIP: 18,
    PINKY_DIP: 19,
    PINKY_TIP: 20
};
/**
 * Finger landmark groups for easy reference
 */
exports.FINGER_LANDMARKS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    little: [17, 18, 19, 20]
};
/**
 * Parse raw landmarks JSON string to typed array
 */
function parseLandmarks(rawLandmarks) {
    try {
        const parsed = JSON.parse(rawLandmarks);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        console.error('Failed to parse landmarks:', error);
        return [];
    }
}
/**
 * Calculate Euclidean distance between two 3D points
 */
function distance3D(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2));
}
/**
 * Calculate 2D Euclidean distance (ignoring z)
 */
function distance2D(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2));
}
/**
 * Calculate angle between three points (in degrees)
 * Returns angle at point b (vertex)
 */
function calculateAngle(a, b, c) {
    const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
    const magnitudeBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
    const magnitudeBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
    if (magnitudeBA === 0 || magnitudeBC === 0) {
        return 0;
    }
    const cosAngle = dotProduct / (magnitudeBA * magnitudeBC);
    // Clamp to valid range due to floating point precision
    const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
    return Math.acos(clampedCosAngle) * (180 / Math.PI);
}
/**
 * Calculate rotation angle around an axis (simplified wrist rotation)
 */
function calculateRotationAngle(wrist, middleMcp, indexMcp) {
    // Calculate the angle of the palm plane relative to horizontal
    const dx = indexMcp.x - middleMcp.x;
    const dy = indexMcp.y - middleMcp.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
}
/**
 * Calculate mean of an array
 */
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
/**
 * Calculate standard deviation
 */
function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const avg = mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(mean(squaredDiffs));
}
/**
 * Calculate variance
 */
function variance(values) {
    if (values.length < 2)
        return 0;
    const avg = mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    return mean(squaredDiffs);
}
/**
 * Calculate minimum value
 */
function min(values) {
    if (values.length === 0)
        return 0;
    return Math.min(...values);
}
/**
 * Calculate maximum value
 */
function max(values) {
    if (values.length === 0)
        return 0;
    return Math.max(...values);
}
/**
 * Calculate range (max - min)
 */
function range(values) {
    return max(values) - min(values);
}
/**
 * Simple moving average filter
 */
function movingAverage(data, windowSize) {
    if (data.length === 0 || windowSize <= 0)
        return [];
    const result = [];
    const halfWindow = Math.floor(windowSize / 2);
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - halfWindow);
        const end = Math.min(data.length, i + halfWindow + 1);
        const windowData = data.slice(start, end);
        result.push(mean(windowData));
    }
    return result;
}
/**
 * Detect peaks in a signal
 * Returns indices of local maxima
 */
function detectPeaks(signal, threshold = 0, minDistance = 1) {
    const peaks = [];
    for (let i = 1; i < signal.length - 1; i++) {
        // Check if it's a local maximum
        if (signal[i] > signal[i - 1] &&
            signal[i] > signal[i + 1] &&
            signal[i] > threshold) {
            // Check minimum distance from last peak
            if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
                peaks.push(i);
            }
        }
    }
    return peaks;
}
/**
 * Simple FFT-based dominant frequency detection
 * Uses DFT for small datasets (not optimized for large N)
 */
function calculateDominantFrequency(signal, sampleRate) {
    if (signal.length < 4) {
        return { frequency: 0, power: 0 };
    }
    const N = signal.length;
    const magnitudes = [];
    // DFT calculation (simplified)
    for (let k = 0; k < N / 2; k++) {
        let realSum = 0;
        let imagSum = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            realSum += signal[n] * Math.cos(angle);
            imagSum -= signal[n] * Math.sin(angle);
        }
        magnitudes.push(Math.sqrt(realSum * realSum + imagSum * imagSum));
    }
    // Find peak (skip DC component at index 0)
    let maxMag = 0;
    let maxIndex = 0;
    for (let i = 1; i < magnitudes.length; i++) {
        if (magnitudes[i] > maxMag) {
            maxMag = magnitudes[i];
            maxIndex = i;
        }
    }
    const frequency = (maxIndex * sampleRate) / N;
    const power = maxMag / N;
    return { frequency, power };
}
/**
 * Calculate SPARC (Spectral Arc Length) smoothness metric
 * Lower values indicate smoother movement
 * Returns normalized value between 0 and 1 (1 = perfectly smooth)
 */
function calculateSPARC(signal, sampleRate) {
    if (signal.length < 10) {
        return 0.5; // Default for insufficient data
    }
    // Calculate velocity profile
    const velocity = [];
    for (let i = 1; i < signal.length; i++) {
        velocity.push((signal[i] - signal[i - 1]) * sampleRate);
    }
    // Simplified SPARC: based on velocity profile smoothness
    const velocityChanges = [];
    for (let i = 1; i < velocity.length; i++) {
        velocityChanges.push(Math.abs(velocity[i] - velocity[i - 1]));
    }
    const avgChange = mean(velocityChanges);
    const maxVel = max(velocity.map(Math.abs));
    if (maxVel === 0) {
        return 1; // No movement = perfectly smooth
    }
    // Normalize: lower avgChange relative to maxVel = smoother
    const rawSmoothness = 1 - (avgChange / maxVel);
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, rawSmoothness));
}
/**
 * Calculate jerk (derivative of acceleration)
 * Lower values indicate smoother movement
 */
function calculateNormalizedJerk(positions, sampleRate) {
    if (positions.length < 4) {
        return 0;
    }
    // Calculate velocity
    const velocity = [];
    for (let i = 1; i < positions.length; i++) {
        velocity.push((positions[i] - positions[i - 1]) * sampleRate);
    }
    // Calculate acceleration
    const acceleration = [];
    for (let i = 1; i < velocity.length; i++) {
        acceleration.push((velocity[i] - velocity[i - 1]) * sampleRate);
    }
    // Calculate jerk
    const jerk = [];
    for (let i = 1; i < acceleration.length; i++) {
        jerk.push((acceleration[i] - acceleration[i - 1]) * sampleRate);
    }
    // Calculate normalized jerk (dimensionless)
    const jerkSquaredSum = jerk.reduce((sum, j) => sum + j * j, 0);
    const duration = positions.length / sampleRate;
    const pathLength = positions.reduce((sum, p, i) => {
        if (i === 0)
            return 0;
        return sum + Math.abs(positions[i] - positions[i - 1]);
    }, 0);
    if (pathLength === 0 || duration === 0) {
        return 0;
    }
    // Dimensionless jerk normalization
    const normalizedJerk = Math.sqrt((duration ** 5 * jerkSquaredSum) / (2 * pathLength ** 2));
    return normalizedJerk;
}
/**
 * Normalize a value to 0-1 range
 */
function normalize(value, minVal, maxVal) {
    if (maxVal === minVal)
        return 0.5;
    const normalized = (value - minVal) / (maxVal - minVal);
    return Math.max(0, Math.min(1, normalized));
}
/**
 * Calculate coefficient of variation (CV)
 * Useful for measuring consistency/regularity
 */
function coefficientOfVariation(values) {
    const avg = mean(values);
    if (avg === 0)
        return 0;
    return standardDeviation(values) / avg;
}
/**
 * Calculate regularity score (0-1, higher = more regular)
 */
function calculateRegularity(intervals) {
    if (intervals.length < 2)
        return 1;
    const cv = coefficientOfVariation(intervals);
    // Convert CV to regularity (lower CV = higher regularity)
    // CV of 0.1 or less is considered highly regular
    return Math.max(0, 1 - cv);
}
/**
 * Calculate asymmetry index between two signals (0-1, 0 = symmetric)
 */
function calculateAsymmetryIndex(signal1, signal2) {
    const mean1 = mean(signal1);
    const mean2 = mean(signal2);
    const maxMean = Math.max(Math.abs(mean1), Math.abs(mean2));
    if (maxMean === 0)
        return 0;
    return Math.abs(mean1 - mean2) / maxMean;
}
/**
 * Extract finger positions from frame
 */
function extractFingerPositions(frame, fingerName) {
    const indices = exports.FINGER_LANDMARKS[fingerName];
    return indices.map(i => frame.landmarks[i]);
}
/**
 * Calculate finger extension (tip distance from MCP)
 */
function calculateFingerExtension(landmarks, fingerName) {
    const indices = exports.FINGER_LANDMARKS[fingerName];
    const mcp = landmarks[indices[0]];
    const tip = landmarks[indices[indices.length - 1]];
    return distance3D(mcp, tip);
}
/**
 * Calculate palm span (distance from thumb tip to pinky tip)
 */
function calculatePalmSpan(landmarks) {
    const thumbTip = landmarks[exports.HAND_LANDMARKS.THUMB_TIP];
    const pinkyTip = landmarks[exports.HAND_LANDMARKS.PINKY_TIP];
    return distance3D(thumbTip, pinkyTip);
}
/**
 * Convert pixel distance to millimeters (approximate)
 * Assumes average hand width of 85mm for calibration
 */
function pixelsToMm(pixelDistance, referencePixelWidth = 0.3 // Normalized coordinates
) {
    const AVG_HAND_WIDTH_MM = 85;
    return (pixelDistance / referencePixelWidth) * AVG_HAND_WIDTH_MM;
}
/**
 * Sample rate detection from timestamps
 */
function detectSampleRate(frames) {
    if (frames.length < 2)
        return 30; // Default to 30 fps
    const intervals = [];
    for (let i = 1; i < Math.min(frames.length, 100); i++) {
        const interval = frames[i].timestamp - frames[i - 1].timestamp;
        if (interval > 0) {
            intervals.push(interval);
        }
    }
    if (intervals.length === 0)
        return 30;
    const avgInterval = mean(intervals);
    return avgInterval > 0 ? 1 / avgInterval : 30;
}
