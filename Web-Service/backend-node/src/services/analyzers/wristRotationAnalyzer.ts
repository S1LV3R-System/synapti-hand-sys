// ============================================================================
// WRIST ROTATION ANALYZER
// ============================================================================
// Analyzes wrist rotation movements for tremor, range of motion, and smoothness

import {
  WristRotationMetrics,
  ProtocolMovement,
  WristRotationConfig
} from '../../types/protocol.types';
import {
  LandmarkFrame,
  parseLandmarks,
  HAND_LANDMARKS,
  calculateRotationAngle,
  mean,
  range,
  standardDeviation,
  calculateDominantFrequency,
  calculateSPARC,
  detectSampleRate,
  pixelsToMm,
  movingAverage
} from './analysisUtils';

export interface WristRotationAnalysisInput {
  rawLandmarks: string;
  movement: ProtocolMovement;
  config: WristRotationConfig;
}

export interface WristRotationAnalysisResult {
  metrics: WristRotationMetrics;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}

/**
 * Analyze wrist rotation movement
 */
export async function analyzeWristRotation(
  input: WristRotationAnalysisInput
): Promise<WristRotationAnalysisResult> {
  const { rawLandmarks, movement, config } = input;
  const anomalies: string[] = [];
  
  // Parse landmarks
  const frames = parseLandmarks(rawLandmarks);
  
  if (frames.length < 10) {
    return createEmptyResult('Insufficient frames for analysis');
  }
  
  // Detect sample rate
  const sampleRate = detectSampleRate(frames);
  
  // Extract rotation angles over time
  const rotationAngles = extractRotationAngles(frames);
  
  // Apply smoothing
  const smoothedAngles = movingAverage(rotationAngles, 5);
  
  // Calculate metrics
  const rotationRange = range(smoothedAngles);
  
  // Calculate smoothness using SPARC
  const rotationSmoothness = calculateSPARC(smoothedAngles, sampleRate);
  
  // Extract tremor signal (high-frequency component)
  const tremorSignal = extractTremorSignal(rotationAngles, smoothedAngles);
  
  // Calculate tremor metrics using FFT
  const { frequency: dominantFrequency, power } = 
    calculateDominantFrequency(tremorSignal, sampleRate);
  
  // Calculate tremor amplitude (RMS of tremor signal)
  const tremorAmplitudeRaw = Math.sqrt(mean(tremorSignal.map(t => t * t)));
  const tremorAmplitude = pixelsToMm(tremorAmplitudeRaw);
  
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
function extractRotationAngles(frames: LandmarkFrame[]): number[] {
  const angles: number[] = [];
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) {
      continue;
    }
    
    const wrist = frame.landmarks[HAND_LANDMARKS.WRIST];
    const middleMcp = frame.landmarks[HAND_LANDMARKS.MIDDLE_MCP];
    const indexMcp = frame.landmarks[HAND_LANDMARKS.INDEX_MCP];
    
    const angle = calculateRotationAngle(wrist, middleMcp, indexMcp);
    angles.push(angle);
  }
  
  return angles;
}

/**
 * Extract tremor signal (difference between raw and smoothed)
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
 * Validate rotation direction matches expected
 */
function validateRotationDirection(
  angles: number[],
  expectedDirection: string,
  anomalies: string[]
): void {
  if (angles.length < 2) return;
  
  // Calculate overall direction
  const startAngle = mean(angles.slice(0, Math.min(5, angles.length)));
  const endAngle = mean(angles.slice(-Math.min(5, angles.length)));
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
      const angleRange = range(angles);
      if (angleRange < 20) {
        anomalies.push('Limited rotation range for bidirectional movement');
      }
      break;
  }
}

/**
 * Calculate quality score based on data quality
 */
function calculateQualityScore(
  frames: LandmarkFrame[],
  angles: number[],
  anomalies: string[]
): number {
  let score = 1.0;
  
  // Penalize for missing frames
  const expectedFrames = frames.length;
  const actualAngles = angles.length;
  const frameCompleteness = actualAngles / expectedFrames;
  score *= frameCompleteness;
  
  // Penalize for low confidence frames
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
 * Calculate overall confidence in the analysis
 */
function calculateConfidence(
  frames: LandmarkFrame[],
  qualityScore: number
): number {
  // Base confidence from quality
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
function createEmptyResult(errorMessage: string): WristRotationAnalysisResult {
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
