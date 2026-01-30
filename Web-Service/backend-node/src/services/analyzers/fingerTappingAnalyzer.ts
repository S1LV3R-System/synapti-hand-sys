// ============================================================================
// FINGER TAPPING ANALYZER
// ============================================================================
// Analyzes finger tapping movements for frequency, regularity, and coordination

import {
  FingerTappingMetrics,
  ProtocolMovement,
  FingerTappingConfig,
  Finger
} from '../../types/protocol.types';
import {
  LandmarkFrame,
  parseLandmarks,
  FINGER_LANDMARKS,
  HAND_LANDMARKS,
  distance3D,
  mean,
  standardDeviation,
  detectPeaks,
  calculateRegularity,
  detectSampleRate,
  coefficientOfVariation
} from './analysisUtils';

export interface FingerTappingAnalysisInput {
  rawLandmarks: string;
  movement: ProtocolMovement;
  config: FingerTappingConfig;
}

export interface FingerTappingAnalysisResult {
  metrics: FingerTappingMetrics;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}

/**
 * Analyze finger tapping movement
 */
export async function analyzeFingerTapping(
  input: FingerTappingAnalysisInput
): Promise<FingerTappingAnalysisResult> {
  const { rawLandmarks, movement, config } = input;
  const anomalies: string[] = [];
  
  // Parse landmarks
  const frames = parseLandmarks(rawLandmarks);
  
  if (frames.length < 10) {
    return createEmptyResult('Insufficient frames for analysis');
  }
  
  // Detect sample rate
  const sampleRate = detectSampleRate(frames);
  
  // Analyze each configured finger
  const fingerResults: Map<string, FingerTapResult> = new Map();
  
  for (const finger of config.fingers) {
    const result = analyzeFingerTaps(frames, finger, sampleRate);
    fingerResults.set(finger, result);
  }
  
  // Calculate aggregate metrics
  const allTapFrequencies = Array.from(fingerResults.values())
    .map(r => r.tapFrequency)
    .filter(f => f > 0);
  
  const tapFrequency = allTapFrequencies.length > 0 
    ? mean(allTapFrequencies) 
    : 0;
  
  // Calculate regularity across all fingers
  const allIntervals: number[] = [];
  fingerResults.forEach(result => {
    allIntervals.push(...result.tapIntervals);
  });
  
  const regularity = allIntervals.length >= 2 
    ? calculateRegularity(allIntervals)
    : 0;
  
  // Calculate inter-tap interval variance
  const interTapIntervalVariance = allIntervals.length >= 2
    ? standardDeviation(allIntervals) * 1000 // Convert to ms
    : 0;
  
  // Calculate finger independence (how different are each finger's patterns)
  const fingerIndependence = calculateFingerIndependence(fingerResults);
  
  // Calculate bilateral coordination if applicable
  const bilateralCoordination = config.bilateral === 'alternating' || 
                                config.bilateral === 'synchronous'
    ? calculateBilateralCoordination(fingerResults, config.bilateral)
    : undefined;
  
  // Check for anomalies
  validateTappingPattern(fingerResults, config, anomalies);
  
  // Calculate quality score
  const qualityScore = calculateQualityScore(frames, fingerResults, anomalies);
  
  // Calculate confidence
  const confidence = calculateConfidence(frames, qualityScore, allIntervals.length);
  
  return {
    metrics: {
      tapFrequency,
      regularity,
      fingerIndependence,
      interTapIntervalVariance,
      bilateralCoordination
    },
    confidence,
    qualityScore,
    anomalies
  };
}

interface FingerTapResult {
  tapFrequency: number;
  tapCount: number;
  tapIntervals: number[];
  peakIndices: number[];
}

/**
 * Analyze taps for a specific finger
 */
function analyzeFingerTaps(
  frames: LandmarkFrame[],
  finger: Finger,
  sampleRate: number
): FingerTapResult {
  // Get finger tip distance to thumb tip over time
  const distances: number[] = [];
  
  const fingerIndices = FINGER_LANDMARKS[finger];
  const tipIndex = fingerIndices[fingerIndices.length - 1]; // Last index is tip
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) {
      continue;
    }
    
    const fingerTip = frame.landmarks[tipIndex];
    const thumbTip = frame.landmarks[HAND_LANDMARKS.THUMB_TIP];
    
    const dist = distance3D(fingerTip, thumbTip);
    distances.push(dist);
  }
  
  if (distances.length < 10) {
    return { tapFrequency: 0, tapCount: 0, tapIntervals: [], peakIndices: [] };
  }
  
  // Detect tap events (minima in the distance signal = finger touching thumb)
  // First invert the signal so minima become maxima for peak detection
  const invertedDistances = distances.map(d => -d);
  const threshold = mean(invertedDistances) + standardDeviation(invertedDistances) * 0.5;
  const minDistance = Math.ceil(sampleRate * 0.1); // Minimum 100ms between taps
  
  const peakIndices = detectPeaks(invertedDistances, threshold, minDistance);
  
  // Calculate tap intervals
  const tapIntervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    const intervalFrames = peakIndices[i] - peakIndices[i - 1];
    const intervalSeconds = intervalFrames / sampleRate;
    tapIntervals.push(intervalSeconds);
  }
  
  // Calculate tap frequency
  const tapCount = peakIndices.length;
  const duration = distances.length / sampleRate;
  const tapFrequency = duration > 0 ? tapCount / duration : 0;
  
  return {
    tapFrequency,
    tapCount,
    tapIntervals,
    peakIndices
  };
}

/**
 * Calculate finger independence score
 */
function calculateFingerIndependence(
  fingerResults: Map<string, FingerTapResult>
): number {
  if (fingerResults.size < 2) {
    return 1.0; // Single finger = perfect independence
  }
  
  // Compare tap patterns between fingers
  const frequencies = Array.from(fingerResults.values()).map(r => r.tapFrequency);
  
  // If all fingers tap at the same rate, they're not independent
  const cv = coefficientOfVariation(frequencies.filter(f => f > 0));
  
  // Higher CV = more independence
  // CV of 0 = all same (not independent)
  // CV of 0.3+ = good independence
  return Math.min(1, cv / 0.3);
}

/**
 * Calculate bilateral coordination score
 */
function calculateBilateralCoordination(
  fingerResults: Map<string, FingerTapResult>,
  pattern: 'alternating' | 'synchronous'
): number {
  // Simplified: measure how consistent the tap timing is
  const allIntervals: number[] = [];
  fingerResults.forEach(result => {
    allIntervals.push(...result.tapIntervals);
  });
  
  if (allIntervals.length < 2) {
    return 0;
  }
  
  // Good coordination = consistent intervals
  return calculateRegularity(allIntervals);
}

/**
 * Validate tapping pattern against configuration
 */
function validateTappingPattern(
  fingerResults: Map<string, FingerTapResult>,
  config: FingerTappingConfig,
  anomalies: string[]
): void {
  // Check if configured fingers actually showed tapping activity
  for (const finger of config.fingers) {
    const result = fingerResults.get(finger);
    if (result && result.tapCount < 3) {
      anomalies.push(`Low tap count detected for ${finger} finger`);
    }
  }
  
  // Check for appropriate tap rate based on mode
  const avgFreq = mean(
    Array.from(fingerResults.values())
      .map(r => r.tapFrequency)
      .filter(f => f > 0)
  );
  
  if (config.unilateral === 'tap_slowly' && avgFreq > 3) {
    anomalies.push('Tap rate higher than expected for slow tapping mode');
  } else if (config.unilateral === 'tap_fast' && avgFreq < 2) {
    anomalies.push('Tap rate lower than expected for fast tapping mode');
  }
}

/**
 * Calculate quality score
 */
function calculateQualityScore(
  frames: LandmarkFrame[],
  fingerResults: Map<string, FingerTapResult>,
  anomalies: string[]
): number {
  let score = 1.0;
  
  // Check for sufficient tap events
  const totalTaps = Array.from(fingerResults.values())
    .reduce((sum, r) => sum + r.tapCount, 0);
  
  if (totalTaps < 5) {
    score *= 0.5;
  } else if (totalTaps < 10) {
    score *= 0.8;
  }
  
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
  qualityScore: number,
  intervalCount: number
): number {
  let confidence = qualityScore;
  
  // More intervals = higher confidence
  if (intervalCount >= 10) {
    confidence *= 1.1;
  } else if (intervalCount < 5) {
    confidence *= 0.7;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Create empty result for error cases
 */
function createEmptyResult(errorMessage: string): FingerTappingAnalysisResult {
  return {
    metrics: {
      tapFrequency: 0,
      regularity: 0,
      fingerIndependence: 0,
      interTapIntervalVariance: 0
    },
    confidence: 0,
    qualityScore: 0,
    anomalies: [errorMessage]
  };
}
