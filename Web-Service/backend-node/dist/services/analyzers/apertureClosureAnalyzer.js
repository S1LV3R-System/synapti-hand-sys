"use strict";
// ============================================================================
// APERTURE-CLOSURE ANALYZER
// ============================================================================
// Analyzes hand opening/closing movements for aperture, timing, and stability
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeApertureClosure = analyzeApertureClosure;
const analysisUtils_1 = require("./analysisUtils");
/**
 * Analyze aperture-closure movement
 */
async function analyzeApertureClosure(input) {
    const { rawLandmarks, movement, config } = input;
    const anomalies = [];
    // Parse landmarks
    const frames = (0, analysisUtils_1.parseLandmarks)(rawLandmarks);
    if (frames.length < 10) {
        return createEmptyResult('Insufficient frames for analysis');
    }
    // Detect sample rate
    const sampleRate = (0, analysisUtils_1.detectSampleRate)(frames);
    // Calculate palm span over time (aperture signal)
    const apertureSignal = extractApertureSignal(frames);
    if (apertureSignal.length < 10) {
        return createEmptyResult('Unable to extract aperture signal');
    }
    // Smooth the signal
    const smoothedSignal = (0, analysisUtils_1.movingAverage)(apertureSignal, 5);
    // Calculate max aperture distance
    const maxApertureRaw = (0, analysisUtils_1.max)(smoothedSignal);
    const maxApertureDistance = (0, analysisUtils_1.pixelsToMm)(maxApertureRaw);
    // Calculate closure time based on movement type
    const closureTime = calculateClosureTime(smoothedSignal, config.apertureCategory, sampleRate);
    // Calculate smoothness
    const smoothness = (0, analysisUtils_1.calculateSPARC)(smoothedSignal, sampleRate);
    // Calculate stability (inverse of variance during steady states)
    const stability = calculateStability(smoothedSignal);
    // Calculate tremor during movement
    const tremorSignal = extractTremorSignal(apertureSignal, smoothedSignal);
    const { frequency: tremorDuringMovement } = (0, analysisUtils_1.calculateDominantFrequency)(tremorSignal, sampleRate);
    // Validate results based on configuration
    validateApertureResults(smoothedSignal, config, closureTime, anomalies);
    // Calculate quality score
    const qualityScore = calculateQualityScore(frames, smoothedSignal, anomalies);
    // Calculate confidence
    const confidence = calculateConfidence(frames, qualityScore);
    return {
        metrics: {
            maxApertureDistance,
            closureTime,
            smoothness,
            stability,
            tremorDuringMovement
        },
        confidence,
        qualityScore,
        anomalies
    };
}
/**
 * Extract aperture signal (palm span over time)
 */
function extractApertureSignal(frames) {
    const signal = [];
    for (const frame of frames) {
        if (!frame.landmarks || frame.landmarks.length < 21) {
            continue;
        }
        const span = (0, analysisUtils_1.calculatePalmSpan)(frame.landmarks);
        signal.push(span);
    }
    return signal;
}
/**
 * Extract tremor signal from difference between raw and smoothed
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
 * Calculate closure time based on aperture category
 */
function calculateClosureTime(signal, category, sampleRate) {
    if (signal.length < 10)
        return 0;
    const maxAperture = (0, analysisUtils_1.max)(signal);
    const minAperture = (0, analysisUtils_1.min)(signal);
    const threshold = minAperture + (maxAperture - minAperture) * 0.9;
    switch (category) {
        case 'aperture':
            // Time to reach max aperture
            return findTimeToThreshold(signal, threshold, 'above', sampleRate);
        case 'closure':
            // Time to reach min aperture from max
            const reverseSignal = [...signal].reverse();
            return findTimeToThreshold(reverseSignal, threshold, 'below', sampleRate);
        case 'aperture_closure':
            // Full cycle time
            const peaks = (0, analysisUtils_1.detectPeaks)(signal, (0, analysisUtils_1.mean)(signal), Math.ceil(sampleRate * 0.2));
            if (peaks.length >= 2) {
                const cycleDuration = (peaks[1] - peaks[0]) / sampleRate;
                return cycleDuration;
            }
            return signal.length / sampleRate / 2; // Approximate
        default:
            return 0;
    }
}
/**
 * Find time to cross threshold
 */
function findTimeToThreshold(signal, threshold, direction, sampleRate) {
    for (let i = 0; i < signal.length; i++) {
        if (direction === 'above' && signal[i] >= threshold) {
            return i / sampleRate;
        }
        if (direction === 'below' && signal[i] <= threshold) {
            return i / sampleRate;
        }
    }
    return signal.length / sampleRate;
}
/**
 * Calculate stability (low variance during steady states)
 */
function calculateStability(signal) {
    if (signal.length < 20)
        return 0.5;
    // Find steady-state regions (first and last 10% of signal)
    const windowSize = Math.floor(signal.length * 0.1);
    const startRegion = signal.slice(0, windowSize);
    const endRegion = signal.slice(-windowSize);
    const startVariance = (0, analysisUtils_1.standardDeviation)(startRegion);
    const endVariance = (0, analysisUtils_1.standardDeviation)(endRegion);
    // Lower variance = higher stability
    const avgVariance = (startVariance + endVariance) / 2;
    const signalRange = (0, analysisUtils_1.range)(signal);
    if (signalRange === 0)
        return 1;
    // Normalize variance to stability score
    const normalizedVariance = avgVariance / signalRange;
    return Math.max(0, Math.min(1, 1 - normalizedVariance * 5));
}
/**
 * Validate aperture results based on configuration
 */
function validateApertureResults(signal, config, closureTime, anomalies) {
    const signalRange = (0, analysisUtils_1.range)(signal);
    // Check for sufficient movement
    if (signalRange < 0.05) { // Very small range
        anomalies.push('Very limited aperture movement detected');
    }
    // Check closure time is reasonable
    if (closureTime < 0.1) {
        anomalies.push('Closure time too short - possible detection issue');
    }
    else if (closureTime > 10) {
        anomalies.push('Closure time unusually long');
    }
    // Check bilateral coordination if applicable
    if (config.handCategory === 'bilateral') {
        // Would need separate hand data for full bilateral analysis
        anomalies.push('Note: Bilateral analysis requires both hands tracked');
    }
}
/**
 * Calculate quality score
 */
function calculateQualityScore(frames, signal, anomalies) {
    let score = 1.0;
    // Check signal completeness
    const completeness = signal.length / frames.length;
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
            maxApertureDistance: 0,
            closureTime: 0,
            smoothness: 0,
            stability: 0,
            tremorDuringMovement: 0
        },
        confidence: 0,
        qualityScore: 0,
        anomalies: [errorMessage]
    };
}
