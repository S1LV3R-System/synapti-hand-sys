// ============================================================================
// MOVEMENT ANALYSIS ORCHESTRATOR
// ============================================================================
// Coordinates movement-specific analysis for protocol-based recordings

import prisma from '../../lib/prisma';
import {
  MovementType,
  ProtocolMovement,
  ProtocolConfiguration,
  MovementAnalysisResult,
  MovementAnalysisData,
  WristRotationConfig,
  FingerTappingConfig,
  FingersBendingConfig,
  ApertureClosureConfig,
  ObjectHoldConfig
} from '../../types/protocol.types';
import {
  analyzeWristRotation,
  WristRotationAnalysisResult
} from './wristRotationAnalyzer';
import {
  analyzeFingerTapping,
  FingerTappingAnalysisResult
} from './fingerTappingAnalyzer';
import {
  analyzeFingersBending,
  FingersBendingAnalysisResult
} from './fingersBendingAnalyzer';
import {
  analyzeApertureClosure,
  ApertureClosureAnalysisResult
} from './apertureClosureAnalyzer';
import {
  analyzeObjectHold,
  ObjectHoldAnalysisResult
} from './objectHoldAnalyzer';
import {
  analyzeFreestyle,
  FreestyleAnalysisResult
} from './freestyleAnalyzer';
import { mean } from './analysisUtils';

export interface AnalysisInput {
  recordingSessionId: string;
  protocolId: string;
}

export interface AnalysisOutput {
  clinicalAnalysisId: string;
  movementAnalysis: MovementAnalysisData;
  overallMetrics: OverallMetrics;
  timestamp: string;
}

export interface OverallMetrics {
  overallScore: number;
  tremorFrequency: number | null;
  tremorAmplitude: number | null;
  smoothness: number;
  confidence: number;
}

/**
 * Main entry point for analyzing a recording based on its protocol
 */
export async function analyzeRecordingWithProtocol(
  input: AnalysisInput
): Promise<AnalysisOutput> {
  const { recordingSessionId, protocolId } = input;

  console.log(`Starting protocol-based analysis for recording: ${recordingSessionId}`);

  // 1. Load protocol with all fields including analysisOutputs
  const protocol = await prisma.protocol.findUnique({
    where: { id: protocolId }
  });

  if (!protocol) {
    throw new Error(`Protocol not found: ${protocolId}`);
  }

  // 2. Parse protocol configuration
  // The protocol now has dedicated columns for analysisOutputs, clinicalGuidelines, etc.
  // But protocolInformation still contains the movements array
  let configuration: ProtocolConfiguration;
  try {
    // Build configuration from protocol fields
    const movements = (protocol.protocolInformation as any[]) || [];

    // Check if protocolInformation[0] has 'movements' inside it (legacy format)
    // or if protocolInformation IS the movements array (new format)
    const actualMovements = movements.length > 0 && (movements[0] as any).movements
      ? (movements[0] as any).movements
      : movements;

    configuration = {
      movements: actualMovements,
      // Use dedicated columns first, fall back to legacy JSON
      instructions: protocol.patientInstructions || (movements[0] as any)?.instructions || '',
      clinicalGuidelines: protocol.clinicalGuidelines || (movements[0] as any)?.clinicalGuidelines || '',
      overallRepetitions: protocol.overallRepetitions || (movements[0] as any)?.overallRepetitions || 1,
      // analysisOutputs from dedicated column (this is the key fix!)
      analysisOutputs: protocol.analysisOutputs as any || (movements[0] as any)?.analysisOutputs || null,
    } as ProtocolConfiguration;

    console.log(`[Orchestrator] Protocol loaded:`);
    console.log(`  - Movements: ${configuration.movements?.length || 0}`);
    console.log(`  - Analysis outputs configured: ${!!configuration.analysisOutputs}`);
    if (configuration.analysisOutputs) {
      const enabledOutputs = Object.entries(configuration.analysisOutputs)
        .filter(([_, v]) => (v as any)?.enabled)
        .map(([k]) => k);
      console.log(`  - Enabled outputs: ${enabledOutputs.join(', ') || 'none'}`);
    }
  } catch (error) {
    throw new Error(`Invalid protocol configuration: ${error}`);
  }

  // 3. Load signal processing result
  const signalResult = await prisma.signalProcessingResult.findFirst({
    where: { recordingSessionId },
    orderBy: { createdAt: 'desc' }
  });

  if (!signalResult) {
    throw new Error(`No signal processing result found for recording: ${recordingSessionId}`);
  }

  // 4. Analyze each movement
  const movementAnalysis: MovementAnalysisData = {};
  const analysisResults: MovementAnalysisResult[] = [];

  for (const movement of configuration.movements) {
    try {
      const result = await analyzeMovement(movement, signalResult.rawLandmarks);

      movementAnalysis[movement.id] = {
        movementType: movement.movementType,
        hand: movement.hand,
        posture: movement.posture,
        metrics: result.metrics,
        confidence: result.confidence,
        qualityScore: result.qualityScore,
        anomalies: result.anomalies
      };

      analysisResults.push(movementAnalysis[movement.id]);

      console.log(`Analyzed movement ${movement.id} (${movement.movementType}): confidence=${result.confidence.toFixed(2)}`);
    } catch (error) {
      console.error(`Error analyzing movement ${movement.id}:`, error);

      movementAnalysis[movement.id] = {
        movementType: movement.movementType,
        hand: movement.hand,
        posture: movement.posture,
        metrics: {} as any,
        confidence: 0,
        qualityScore: 0,
        anomalies: [`Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // 5. Calculate overall metrics
  const overallMetrics = calculateOverallMetrics(analysisResults, movementAnalysis);

  // 6. Store or update clinical analysis
  // First check if analysis exists for this recording with version 2.0
  const existingAnalysis = await prisma.clinicalAnalysis.findFirst({
    where: {
      recordingSessionId,
      analysisVersion: '2.0'
    }
  });

  const analysisData = {
    overallScore: overallMetrics.overallScore,
    tremorFrequency: overallMetrics.tremorFrequency,
    tremorAmplitude: overallMetrics.tremorAmplitude,
    sparc: overallMetrics.smoothness,
    confidence: overallMetrics.confidence,
    clinicalSummary: JSON.stringify({
      movementAnalysis,
      protocolId,
      analysisTimestamp: new Date().toISOString()
    })
  };

  let clinicalAnalysis;

  if (existingAnalysis) {
    clinicalAnalysis = await prisma.clinicalAnalysis.update({
      where: { id: existingAnalysis.id },
      data: {
        ...analysisData,
        updatedAt: new Date()
      }
    });
  } else {
    clinicalAnalysis = await prisma.clinicalAnalysis.create({
      data: {
        recordingSessionId,
        analysisVersion: '2.0',
        analysisType: 'comprehensive',
        ...analysisData
      }
    });
  }

  console.log(`Protocol-based analysis complete: ${clinicalAnalysis.id}`);

  return {
    clinicalAnalysisId: clinicalAnalysis.id,
    movementAnalysis,
    overallMetrics,
    timestamp: new Date().toISOString()
  };
}

/**
 * Analyze a single movement based on its type
 */
async function analyzeMovement(
  movement: ProtocolMovement,
  rawLandmarks: string
): Promise<{
  metrics: any;
  confidence: number;
  qualityScore: number;
  anomalies: string[];
}> {
  switch (movement.movementType) {
    case 'wrist_rotation':
      return analyzeWristRotation({
        rawLandmarks,
        movement,
        config: movement.config as WristRotationConfig
      });

    case 'finger_tapping':
      return analyzeFingerTapping({
        rawLandmarks,
        movement,
        config: movement.config as FingerTappingConfig
      });

    case 'fingers_bending':
      return analyzeFingersBending({
        rawLandmarks,
        movement,
        config: movement.config as FingersBendingConfig
      });

    case 'aperture_closure':
      return analyzeApertureClosure({
        rawLandmarks,
        movement,
        config: movement.config as ApertureClosureConfig
      });

    case 'object_hold':
      return analyzeObjectHold({
        rawLandmarks,
        movement,
        config: movement.config as ObjectHoldConfig
      });

    case 'freestyle':
      return analyzeFreestyle({
        rawLandmarks,
        movement
      });

    default:
      throw new Error(`Unknown movement type: ${(movement as any).movementType}`);
  }
}

/**
 * Calculate overall metrics from individual movement analyses
 */
function calculateOverallMetrics(
  results: MovementAnalysisResult[],
  movementAnalysis: MovementAnalysisData
): OverallMetrics {
  if (results.length === 0) {
    return {
      overallScore: 0,
      tremorFrequency: null,
      tremorAmplitude: null,
      smoothness: 0,
      confidence: 0
    };
  }

  // Collect metrics from all movements
  const confidences = results.map(r => r.confidence);
  const qualityScores = results.map(r => r.qualityScore);

  // Extract tremor metrics where available
  const tremorFrequencies: number[] = [];
  const tremorAmplitudes: number[] = [];
  const smoothnessValues: number[] = [];

  for (const [, result] of Object.entries(movementAnalysis)) {
    const metrics = result.metrics as any;

    if (metrics.tremorFrequency !== undefined && metrics.tremorFrequency > 0) {
      tremorFrequencies.push(metrics.tremorFrequency);
    }
    if (metrics.tremorAmplitude !== undefined && metrics.tremorAmplitude > 0) {
      tremorAmplitudes.push(metrics.tremorAmplitude);
    }
    if (metrics.rotationSmoothness !== undefined) {
      smoothnessValues.push(metrics.rotationSmoothness);
    }
    if (metrics.bendingSmoothness !== undefined) {
      smoothnessValues.push(metrics.bendingSmoothness);
    }
    if (metrics.smoothness !== undefined) {
      smoothnessValues.push(metrics.smoothness);
    }
  }

  // Calculate aggregates
  const overallConfidence = mean(confidences);
  const overallQuality = mean(qualityScores);

  // Overall score: combination of quality and confidence
  const overallScore = (overallQuality * 0.6 + overallConfidence * 0.4) * 100;

  return {
    overallScore: Math.round(overallScore),
    tremorFrequency: tremorFrequencies.length > 0 ? mean(tremorFrequencies) : null,
    tremorAmplitude: tremorAmplitudes.length > 0 ? mean(tremorAmplitudes) : null,
    smoothness: smoothnessValues.length > 0 ? mean(smoothnessValues) : 0,
    confidence: overallConfidence
  };
}

/**
 * Re-analyze an existing recording with a different or updated protocol
 */
export async function reanalyzeRecording(
  recordingSessionId: string
): Promise<AnalysisOutput | null> {
  // Get recording with protocol
  const recording = await prisma.experimentSession.findUnique({
    where: { id: recordingSessionId },
    select: { protocolId: true }
  });

  if (!recording?.protocolId) {
    console.log(`Recording ${recordingSessionId} has no protocol - skipping analysis`);
    return null;
  }

  return analyzeRecordingWithProtocol({
    recordingSessionId,
    protocolId: recording.protocolId
  });
}

/**
 * Get analysis results for a recording
 */
export async function getMovementAnalysis(
  recordingSessionId: string
): Promise<MovementAnalysisData | null> {
  const analysis = await prisma.clinicalAnalysis.findFirst({
    where: {
      recordingSessionId,
      analysisVersion: '2.0'
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!analysis?.clinicalSummary) {
    return null;
  }

  try {
    const summary = JSON.parse(analysis.clinicalSummary);
    return summary.movementAnalysis || null;
  } catch {
    return null;
  }
}

/**
 * Check if protocol requires re-analysis
 */
export function protocolRequiresReanalysis(
  existingAnalysisTimestamp: Date,
  protocolUpdatedAt: Date
): boolean {
  return protocolUpdatedAt > existingAnalysisTimestamp;
}
