// ============================================================================
// FREESTYLE ANALYZER
// ============================================================================
// Analyzes general hand movements without specific constraints

import {
  FreestyleMetrics,
  ProtocolMovement
} from '../../types/protocol.types';
import {
  LandmarkFrame,
  parseLandmarks,
  HAND_LANDMARKS,
  FINGER_LANDMARKS,
  distance3D,
  mean,
  range,
  standardDeviation,
  calculateSPARC,
  calculateDominantFrequency,
  detectSampleRate,
  movingAverage,
  calculateFingerExtension
} from './analysisUtils';

export interface FreestyleAnalysisInput {
  rawLandmarks: string;
  movement: ProtocolMovement;
}

export interface FreestyleAnalysisResult {
  metrics: FreestyleMetrics;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}

/**
 * Analyze freestyle movement
 */
export async function analyzeFreestyle(
  input: FreestyleAnalysisInput
): Promise<FreestyleAnalysisResult> {
  const { rawLandmarks, movement } = input;
  const anomalies: string[] = [];
  
  // Parse landmarks
  const frames = parseLandmarks(rawLandmarks);
  
  if (frames.length < 10) {
    return createEmptyResult('Insufficient frames for analysis');
  }
  
  // Detect sample rate
  const sampleRate = detectSampleRate(frames);
  
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
function calculateHandStability(frames: LandmarkFrame[]): number {
  const wristPositions = {
    x: [] as number[],
    y: [] as number[],
    z: [] as number[]
  };
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) continue;
    
    const wrist = frame.landmarks[HAND_LANDMARKS.WRIST];
    wristPositions.x.push(wrist.x);
    wristPositions.y.push(wrist.y);
    wristPositions.z.push(wrist.z);
  }
  
  if (wristPositions.x.length < 10) return 0;
  
  // Calculate variance in each dimension
  const varX = standardDeviation(wristPositions.x);
  const varY = standardDeviation(wristPositions.y);
  const varZ = standardDeviation(wristPositions.z);
  
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
function calculateOverallROM(frames: LandmarkFrame[]): number {
  const fingerNames: (keyof typeof FINGER_LANDMARKS)[] = [
    'thumb', 'index', 'middle', 'ring', 'little'
  ];
  
  const romValues: number[] = [];
  
  for (const finger of fingerNames) {
    const extensions: number[] = [];
    
    for (const frame of frames) {
      if (!frame.landmarks || frame.landmarks.length < 21) continue;
      
      const extension = calculateFingerExtension(frame.landmarks, finger);
      extensions.push(extension);
    }
    
    if (extensions.length >= 10) {
      const rom = range(extensions);
      // Convert to degrees (approximate)
      // Typical extension range: 0.1-0.3 normalized = 30-90 degrees
      const romDegrees = rom * 300; // Rough conversion
      romValues.push(romDegrees);
    }
  }
  
  return romValues.length > 0 ? mean(romValues) : 0;
}

/**
 * Calculate tremor frequency from wrist movement
 */
function calculateTremorFrequency(
  frames: LandmarkFrame[],
  sampleRate: number
): number {
  const wristX: number[] = [];
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) continue;
    wristX.push(frame.landmarks[HAND_LANDMARKS.WRIST].x);
  }
  
  if (wristX.length < 20) return 0;
  
  // Remove slow movement component
  const smoothed = movingAverage(wristX, 10);
  const tremor = wristX.map((v, i) => v - (smoothed[i] || 0));
  
  // Find dominant frequency
  const { frequency } = calculateDominantFrequency(tremor, sampleRate);
  
  return frequency;
}

/**
 * Calculate overall movement smoothness
 */
function calculateOverallSmoothness(
  frames: LandmarkFrame[],
  sampleRate: number
): number {
  const wristX: number[] = [];
  const wristY: number[] = [];
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) continue;
    wristX.push(frame.landmarks[HAND_LANDMARKS.WRIST].x);
    wristY.push(frame.landmarks[HAND_LANDMARKS.WRIST].y);
  }
  
  if (wristX.length < 20) return 0.5;
  
  // Calculate SPARC for both dimensions
  const sparcX = calculateSPARC(wristX, sampleRate);
  const sparcY = calculateSPARC(wristY, sampleRate);
  
  return (sparcX + sparcY) / 2;
}

/**
 * Validate freestyle results
 */
function validateFreestyleResults(
  frames: LandmarkFrame[],
  anomalies: string[]
): void {
  // Check for sufficient movement
  const wristX: number[] = [];
  
  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 21) continue;
    wristX.push(frame.landmarks[HAND_LANDMARKS.WRIST].x);
  }
  
  if (wristX.length > 0) {
    const movementRange = range(wristX);
    if (movementRange < 0.01) {
      anomalies.push('Very limited hand movement detected');
    }
  }
  
  // Check frame completeness
  const validFrames = frames.filter(
    f => f.landmarks && f.landmarks.length >= 21
  ).length;
  
  if (validFrames < frames.length * 0.5) {
    anomalies.push('Many frames with incomplete landmark data');
  }
}

/**
 * Calculate quality score
 */
function calculateQualityScore(
  frames: LandmarkFrame[],
  anomalies: string[]
): number {
  let score = 1.0;
  
  // Check frame completeness
  const validFrames = frames.filter(
    f => f.landmarks && f.landmarks.length >= 21
  ).length;
  const completeness = validFrames / frames.length;
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
function createEmptyResult(errorMessage: string): FreestyleAnalysisResult {
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
