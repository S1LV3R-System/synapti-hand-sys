// ============================================================================
// APERTURE-CLOSURE ANALYZER
// ============================================================================
// Analyzes hand opening/closing movements for aperture, timing, and stability

import {
  ApertureClosureMetrics,
  ProtocolMovement,
  ApertureClosureConfig
} from '../../types/protocol.types';
import {
  LandmarkFrame,
  parseLandmarks,
  HAND_LANDMARKS,
  calculatePalmSpan,
  mean,
  range,
  standardDeviation,
  max,
  min,
  calculateSPARC,
  calculateDominantFrequency,
  detectSampleRate,
  detectPeaks,
  pixelsToMm,
  movingAverage
} from './analysisUtils';

export interface ApertureClosureAnalysisInput {
  rawLandmarks: string;
  movement: ProtocolMovement;
  config: ApertureClosureConfig;
}

export interface ApertureClosureAnalysisResult {
  metrics: ApertureClosureMetrics;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}

/**
 * Analyze aperture-closure movement
 */
export async function analyzeApertureClosure(
  input: ApertureClosureAnalysisInput
): Promise<ApertureClosureAnalysisResult> {
  const { rawLandmarks, movement, config } = input;
  const anomalies: string[] = [];
  
  // Parse landmarks
  const frames = parseLandmarks(rawLandmarks);
  
  if (frames.length < 10) {
    return createEmptyResult('Insufficient frames for analysis');
  }
  
  // Detect sample rate
  const sampleRate = detectSampleRate(frames);
  
  // Calculate palm span over time (aperture signal)
  const apertureSignal = extractApertureSignal(frames);
  
  if (apertureSignal.length < 10) {
    return createEmptyResult('Unable to extract aperture signal');
  }
  
  // Smooth the signal
  const smoothedSignal = movingAverage(apertureSignal, 5);
  
  // Calculate max aperture distance
  const maxApertureRaw = max(smoothedSignal);
  const maxApertureDistance = pixelsToMm(maxApertureRaw);
  
  // Calculate closure time based on movement type
  const closureTime = calculateClosureTime(
    smoothedSignal, 
    config.apertureCategory, 
    sampleRate
  );
  
  // Calculate smoothness
  const smoothness = calculateSPARC(smoothedSignal, sampleRate);
  
  // Calculate stability (inverse of variance during steady states)
  const stability = calculateStability(smoothedSignal);
  
  // Calculate tremor during movement
  const tremorSignal = extractTremorSignal(apertureSignal, smoothedSignal);
  const { frequency: tremorDuringMovement } = calculateDominantFrequency(
    tremorSignal, 
    sampleRate
  );
  
  // Validate results based on configuration
  validateApertureResults(
    smoothedSignal, 
    config, 
    closureTime, 
    anomalies
  );
  
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
function extractApertureSignal(frames: LandmarkFrame[]): number[] {
  const signal: number[] = [];
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) {
      continue;
    }
    
    const span = calculatePalmSpan(frame.landmarks);
    signal.push(span);
  }
  
  return signal;
}

/**
 * Extract tremor signal from difference between raw and smoothed
 */
function extractTremorSignal(raw: number[], smoothed: number[]): number[] {
  const tremor: number[] = [];
  const minLength = Math.min(raw.length, smoothed.length);
  
  for (let i = 0; i < minLength; i++) {
    tremor.push(raw[i] - smoothed[i]);
  }
  
  return tremor;
}

/**
 * Calculate closure time based on aperture category
 */
function calculateClosureTime(
  signal: number[],
  category: string,
  sampleRate: number
): number {
  if (signal.length < 10) return 0;
  
  const maxAperture = max(signal);
  const minAperture = min(signal);
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
      const peaks = detectPeaks(signal, mean(signal), Math.ceil(sampleRate * 0.2));
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
function findTimeToThreshold(
  signal: number[],
  threshold: number,
  direction: 'above' | 'below',
  sampleRate: number
): number {
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
function calculateStability(signal: number[]): number {
  if (signal.length < 20) return 0.5;
  
  // Find steady-state regions (first and last 10% of signal)
  const windowSize = Math.floor(signal.length * 0.1);
  const startRegion = signal.slice(0, windowSize);
  const endRegion = signal.slice(-windowSize);
  
  const startVariance = standardDeviation(startRegion);
  const endVariance = standardDeviation(endRegion);
  
  // Lower variance = higher stability
  const avgVariance = (startVariance + endVariance) / 2;
  const signalRange = range(signal);
  
  if (signalRange === 0) return 1;
  
  // Normalize variance to stability score
  const normalizedVariance = avgVariance / signalRange;
  return Math.max(0, Math.min(1, 1 - normalizedVariance * 5));
}

/**
 * Validate aperture results based on configuration
 */
function validateApertureResults(
  signal: number[],
  config: ApertureClosureConfig,
  closureTime: number,
  anomalies: string[]
): void {
  const signalRange = range(signal);
  
  // Check for sufficient movement
  if (signalRange < 0.05) { // Very small range
    anomalies.push('Very limited aperture movement detected');
  }
  
  // Check closure time is reasonable
  if (closureTime < 0.1) {
    anomalies.push('Closure time too short - possible detection issue');
  } else if (closureTime > 10) {
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
function calculateQualityScore(
  frames: LandmarkFrame[],
  signal: number[],
  anomalies: string[]
): number {
  let score = 1.0;
  
  // Check signal completeness
  const completeness = signal.length / frames.length;
  score *= completeness;
  
  // Check frame confidence
  const avgConfidence = mean(
    frames.filter(f => f.confidence !== undefined).map(f => f.confidence!)
  );
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
function calculateConfidence(
  frames: LandmarkFrame[],
  qualityScore: number
): number {
  let confidence = qualityScore;
  
  // Boost for sufficient data
  if (frames.length >= 60) {
    confidence *= 1.1;
  } else if (frames.length < 30) {
    confidence *= 0.8;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Create empty result for error cases
 */
function createEmptyResult(errorMessage: string): ApertureClosureAnalysisResult {
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
