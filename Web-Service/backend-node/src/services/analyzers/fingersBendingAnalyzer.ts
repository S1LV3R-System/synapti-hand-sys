// ============================================================================
// FINGERS BENDING ANALYZER
// ============================================================================
// Analyzes finger bending movements for range of motion and symmetry

import {
  FingersBendingMetrics,
  ProtocolMovement,
  FingersBendingConfig
} from '../../types/protocol.types';
import {
  LandmarkFrame,
  parseLandmarks,
  FINGER_LANDMARKS,
  HAND_LANDMARKS,
  calculateAngle,
  mean,
  range,
  standardDeviation,
  calculateSPARC,
  detectSampleRate,
  calculateAsymmetryIndex,
  Point3D
} from './analysisUtils';

export interface FingersBendingAnalysisInput {
  rawLandmarks: string;
  movement: ProtocolMovement;
  config: FingersBendingConfig;
}

export interface FingersBendingAnalysisResult {
  metrics: FingersBendingMetrics;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}

type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'little';

/**
 * Analyze fingers bending movement
 */
export async function analyzeFingersBending(
  input: FingersBendingAnalysisInput
): Promise<FingersBendingAnalysisResult> {
  const { rawLandmarks, movement, config } = input;
  const anomalies: string[] = [];
  
  // Parse landmarks
  const frames = parseLandmarks(rawLandmarks);
  
  if (frames.length < 10) {
    return createEmptyResult('Insufficient frames for analysis');
  }
  
  // Detect sample rate
  const sampleRate = detectSampleRate(frames);
  
  // Calculate ROM for each finger
  const fingerNames: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'little'];
  const romPerFinger: Record<string, number> = {};
  const fingerBendingSignals: Record<string, number[]> = {};
  
  for (const finger of fingerNames) {
    const { rom, signal } = calculateFingerROM(frames, finger);
    romPerFinger[finger] = rom;
    fingerBendingSignals[finger] = signal;
  }
  
  // Calculate average bending smoothness
  const smoothnessValues: number[] = [];
  for (const finger of fingerNames) {
    const signal = fingerBendingSignals[finger];
    if (signal.length >= 10) {
      const smoothness = calculateSPARC(signal, sampleRate);
      smoothnessValues.push(smoothness);
    }
  }
  const bendingSmoothness = smoothnessValues.length > 0 
    ? mean(smoothnessValues) 
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
  
  const asymmetryIndex = calculateAsymmetryIndex(leftSideSignal, rightSideSignal);
  
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
function calculateFingerROM(
  frames: LandmarkFrame[],
  finger: FingerName
): { rom: number; signal: number[] } {
  const indices = FINGER_LANDMARKS[finger];
  const bendingAngles: number[] = [];
  
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
      const angle = calculateAngle(cmc, mcp, ip);
      bendingAngles.push(angle);
    } else {
      // MCP-PIP-DIP angle for other fingers
      const mcp = frame.landmarks[indices[0]];
      const pip = frame.landmarks[indices[1]];
      const dip = frame.landmarks[indices[2]];
      const angle = calculateAngle(mcp, pip, dip);
      bendingAngles.push(angle);
    }
  }
  
  const rom = bendingAngles.length > 0 ? range(bendingAngles) : 0;
  
  return { rom, signal: bendingAngles };
}

/**
 * Validate bending results
 */
function validateBendingResults(
  romPerFinger: Record<string, number>,
  config: FingersBendingConfig,
  anomalies: string[]
): void {
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
function calculateQualityScore(
  frames: LandmarkFrame[],
  romPerFinger: Record<string, number>,
  anomalies: string[]
): number {
  let score = 1.0;
  
  // Check for valid ROM values
  const romValues = Object.values(romPerFinger);
  const validRomCount = romValues.filter(r => r > 0).length;
  score *= validRomCount / 5; // 5 fingers expected
  
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
function createEmptyResult(errorMessage: string): FingersBendingAnalysisResult {
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
