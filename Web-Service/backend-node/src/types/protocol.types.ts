// ============================================================================
// PROTOCOL MOVEMENT SYSTEM TYPES
// ============================================================================
// Comprehensive type definitions for the hierarchical movement-based protocol system
// Supports 6 movement types with type-specific configurations

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export enum Hand {
  LEFT = 'left',
  RIGHT = 'right',
  BOTH = 'both'
}

export const HANDS = [Hand.LEFT, Hand.RIGHT, Hand.BOTH] as const;

export enum Posture {
  PRONATION = 'pronation',
  SUPINATION = 'supination',
  NEUTRAL = 'neutral'
}

export const POSTURES = [Posture.PRONATION, Posture.SUPINATION, Posture.NEUTRAL] as const;

export enum MovementType {
  WRIST_ROTATION = 'wrist_rotation',
  FINGER_TAPPING = 'finger_tapping',
  FINGERS_BENDING = 'fingers_bending',
  APERTURE_CLOSURE = 'aperture_closure',
  OBJECT_HOLD = 'object_hold',
  FREESTYLE = 'freestyle'
}

export const MOVEMENT_TYPES = [
  MovementType.WRIST_ROTATION,
  MovementType.FINGER_TAPPING,
  MovementType.FINGERS_BENDING,
  MovementType.APERTURE_CLOSURE,
  MovementType.OBJECT_HOLD,
  MovementType.FREESTYLE
] as const;

// ============================================================================
// WRIST ROTATION
// ============================================================================

export enum WristRotationSubMovement {
  ROTATION_IN_OUT = 'rotation_in_out',
  ROTATION_OUT_IN = 'rotation_out_in',
  ROTATION_IN = 'rotation_in',
  ROTATION_OUT = 'rotation_out'
}

export const WRIST_ROTATION_SUB_MOVEMENTS = [
  WristRotationSubMovement.ROTATION_IN_OUT,
  WristRotationSubMovement.ROTATION_OUT_IN,
  WristRotationSubMovement.ROTATION_IN,
  WristRotationSubMovement.ROTATION_OUT
] as const;

export interface WristRotationConfig {
  subMovement: WristRotationSubMovement;
}

// ============================================================================
// FINGER TAPPING
// ============================================================================

export enum Finger {
  THUMB = 'thumb',
  INDEX = 'index',
  MIDDLE = 'middle',
  RING = 'ring',
  LITTLE = 'little'
}

export const FINGERS = [
  Finger.THUMB,
  Finger.INDEX,
  Finger.MIDDLE,
  Finger.RING,
  Finger.LITTLE
] as const;

export enum UnilateralMode {
  TAP_SLOWLY = 'tap_slowly',
  TAP_FAST = 'tap_fast'
}

export const UNILATERAL_MODES = [
  UnilateralMode.TAP_SLOWLY,
  UnilateralMode.TAP_FAST
] as const;

export enum BilateralPattern {
  ALTERNATING = 'alternating',
  SYNCHRONOUS = 'synchronous'
}

export const BILATERAL_PATTERNS = [
  BilateralPattern.ALTERNATING,
  BilateralPattern.SYNCHRONOUS
] as const;

export interface FingerTappingConfig {
  fingers: Finger[];
  unilateral: UnilateralMode;
  bilateral: BilateralPattern;
}

// ============================================================================
// FINGERS BENDING
// ============================================================================

export enum FingersBendingSubMovement {
  UNILATERAL = 'unilateral',
  BILATERAL = 'bilateral'
}

export const FINGERS_BENDING_SUB_MOVEMENTS = [
  FingersBendingSubMovement.UNILATERAL,
  FingersBendingSubMovement.BILATERAL
] as const;

export interface FingersBendingConfig {
  subMovement: FingersBendingSubMovement;
}

// ============================================================================
// APERTURE-CLOSURE
// ============================================================================

export enum ApertureCategory {
  APERTURE = 'aperture',
  CLOSURE = 'closure',
  APERTURE_CLOSURE = 'aperture_closure'
}

export const APERTURE_CATEGORIES = [
  ApertureCategory.APERTURE,
  ApertureCategory.CLOSURE,
  ApertureCategory.APERTURE_CLOSURE
] as const;

export enum HandCategory {
  UNILATERAL = 'unilateral',
  BILATERAL = 'bilateral'
}

export const HAND_CATEGORIES = [
  HandCategory.UNILATERAL,
  HandCategory.BILATERAL
] as const;

export interface ApertureClosureConfig {
  apertureCategory: ApertureCategory;
  handCategory: HandCategory;
}

// ============================================================================
// OBJECT HOLD
// ============================================================================

export enum ObjectHoldSubMovement {
  OPEN_PALM = 'open_palm',
  CLOSED_GRASP = 'closed_grasp'
}

export const OBJECT_HOLD_SUB_MOVEMENTS = [
  ObjectHoldSubMovement.OPEN_PALM,
  ObjectHoldSubMovement.CLOSED_GRASP
] as const;

export interface ObjectHoldConfig {
  subMovement: ObjectHoldSubMovement;
}

// ============================================================================
// FREESTYLE
// ============================================================================

export type FreestyleConfig = Record<string, never>;

// ============================================================================
// UNION TYPES
// ============================================================================

export type MovementConfig = 
  | WristRotationConfig
  | FingerTappingConfig
  | FingersBendingConfig
  | ApertureClosureConfig
  | ObjectHoldConfig
  | FreestyleConfig;

// ============================================================================
// PROTOCOL MOVEMENT
// ============================================================================

export interface ProtocolMovement {
  id: string; // UUID
  order: number; // 0-indexed position in movements array
  movementType: MovementType;
  
  // Global movement settings
  hand: Hand;
  posture: Posture;
  duration: number; // seconds
  repetitions: number; // Number of times to perform this movement
  instructions: string; // Clinical instructions for patient
  
  // Type-specific configuration
  config: MovementConfig;
}

// ============================================================================
// ANALYSIS OUTPUT TYPES
// ============================================================================

export interface AnalysisOutputConfig {
  enabled: boolean;
  fingerPair?: string;        // For hand aperture: 'thumb_index' | 'thumb_middle'
  fingertip?: string;         // For cyclogram/trajectory: 'thumb_tip' | 'index_tip' | etc.
  hand?: string;              // 'left' | 'right' | 'both'
  plotType?: string;          // For ROM: 'violin' | 'radar'
  measurement?: string;       // For ROM: 'flexion' | 'extension'
  fingers?: Record<string, boolean>; // For ROM: which fingers to include
  finger1?: string;           // For inter-finger coordination
  finger2?: string;           // For inter-finger coordination
}

export interface AnalysisOutputsConfig {
  handAperture?: AnalysisOutputConfig;
  cyclogram3D?: AnalysisOutputConfig;
  trajectory3D?: AnalysisOutputConfig;
  romPlot?: AnalysisOutputConfig;
  tremorSpectrogram?: AnalysisOutputConfig;
  openingClosingVelocity?: AnalysisOutputConfig;
  cycleFrequency?: AnalysisOutputConfig;
  cycleVariability?: AnalysisOutputConfig;
  interFingerCoordination?: AnalysisOutputConfig;
  cycleSymmetry?: AnalysisOutputConfig;
  geometricCurvature?: AnalysisOutputConfig;
}

// ============================================================================
// PROTOCOL CONFIGURATION
// ============================================================================

export interface ProtocolConfiguration {
  movements: ProtocolMovement[];
  overallRepetitions: number; // Number of times to repeat entire protocol
  requiredMetrics?: string[]; // Metrics to calculate for this protocol
  instructions?: string;      // Patient instructions
  clinicalGuidelines?: string; // Interpretation guidelines for clinicians
  // Analysis outputs configuration - specifies which outputs to generate
  analysisOutputs?: AnalysisOutputsConfig | null;
}

// ============================================================================
// PROTOCOL MODEL
// ============================================================================

export interface Protocol {
  id: string;
  name: string;
  description?: string;
  version: string;
  configuration: ProtocolConfiguration;
  indicatedFor?: string; // Conditions this protocol targets
  contraindications?: string; // When NOT to use
  createdById: string; // User ID who created
  isPublic: boolean; // Available to all users
  isActive: boolean; // Can be used for new recordings
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null; // Soft delete
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export type CreateProtocolInput = Omit<
  Protocol,
  'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export type UpdateProtocolInput = Partial<Omit<
  Protocol,
  'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'deletedAt'
>>;

// ============================================================================
// ANALYSIS RESULT TYPES (Movement-Specific Metrics)
// ============================================================================

export interface WristRotationMetrics {
  rotationRange: number; // degrees
  rotationSmoothness: number; // 0-1 score
  dominantFrequency: number; // Hz
  tremorAmplitude: number; // mm
  tremorFrequency: number; // Hz
}

export interface FingerTappingMetrics {
  tapFrequency: number; // Hz
  regularity: number; // 0-1 consistency score
  fingerIndependence: number; // 0-1 score
  interTapIntervalVariance: number; // ms
  bilateralCoordination?: number; // 0-1 if bilateral
}

export interface FingersBendingMetrics {
  romPerFinger: Record<string, number>; // degrees per finger
  bendingSmoothness: number; // 0-1
  asymmetryIndex: number; // 0-1, 0 = perfect symmetry
}

export interface ApertureClosureMetrics {
  maxApertureDistance: number; // mm
  closureTime: number; // seconds
  smoothness: number; // 0-1
  stability: number; // 0-1
  tremorDuringMovement: number; // Hz
}

export interface ObjectHoldMetrics {
  gripStability: number; // 0-1
  tremorDuringHold: number; // Hz
  holdDuration: number; // seconds
  positionStability: number; // 0-1
}

export interface FreestyleMetrics {
  handStability: number; // 0-1
  overallROM: number; // degrees (average)
  tremorFrequency: number; // Hz
  smoothness: number; // 0-1
}

export type MovementMetrics = 
  | WristRotationMetrics
  | FingerTappingMetrics
  | FingersBendingMetrics
  | ApertureClosureMetrics
  | ObjectHoldMetrics
  | FreestyleMetrics;

// ============================================================================
// MOVEMENT ANALYSIS RESULT (Stored per movement in ClinicalAnalysis)
// ============================================================================

export interface MovementAnalysisResult {
  movementType: MovementType;
  hand: Hand;
  posture: Posture;
  metrics: MovementMetrics;
  confidence: number; // 0-1
  qualityScore: number; // 0-1
  anomalies?: string[]; // Quality issues detected
}

// ============================================================================
// CLINICAL ANALYSIS EXTENSION (For movement-specific results)
// ============================================================================

export interface MovementAnalysisData {
  [movementId: string]: MovementAnalysisResult;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface MovementTypeDescription {
  type: MovementType;
  displayName: string;
  description: string;
  hasSubMovements: boolean;
}

export interface SubMovementOption {
  value: string;
  label: string;
  description?: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isWristRotationConfig(config: MovementConfig): config is WristRotationConfig {
  return 'subMovement' in config && 
         Object.values(WristRotationSubMovement).includes((config as any).subMovement);
}

export function isFingerTappingConfig(config: MovementConfig): config is FingerTappingConfig {
  return 'fingers' in config && Array.isArray((config as any).fingers);
}

export function isFingersBendingConfig(config: MovementConfig): config is FingersBendingConfig {
  return 'subMovement' in config && 
         Object.values(FingersBendingSubMovement).includes((config as any).subMovement);
}

export function isApertureClosureConfig(config: MovementConfig): config is ApertureClosureConfig {
  return 'apertureCategory' in config && 'handCategory' in config;
}

export function isObjectHoldConfig(config: MovementConfig): config is ObjectHoldConfig {
  return 'subMovement' in config && 
         Object.values(ObjectHoldSubMovement).includes((config as any).subMovement);
}

export function isFreestyleConfig(config: MovementConfig): config is FreestyleConfig {
  return Object.keys(config).length === 0;
}

// ============================================================================
// CONSTANT DESCRIPTIONS
// ============================================================================

export const MOVEMENT_TYPE_DESCRIPTIONS: Record<MovementType, MovementTypeDescription> = {
  [MovementType.WRIST_ROTATION]: {
    type: MovementType.WRIST_ROTATION,
    displayName: 'Wrist Rotation',
    description: 'Rotating the wrist in specified directions to assess mobility and tremor',
    hasSubMovements: true
  },
  [MovementType.FINGER_TAPPING]: {
    type: MovementType.FINGER_TAPPING,
    displayName: 'Finger Tapping',
    description: 'Tapping selected fingers with specified rhythm to assess coordination',
    hasSubMovements: true
  },
  [MovementType.FINGERS_BENDING]: {
    type: MovementType.FINGERS_BENDING,
    displayName: 'Fingers Bending',
    description: 'Flexing and extending fingers to assess range of motion',
    hasSubMovements: true
  },
  [MovementType.APERTURE_CLOSURE]: {
    type: MovementType.APERTURE_CLOSURE,
    displayName: 'Aperture-Closure',
    description: 'Opening and closing hand to assess dexterity and control',
    hasSubMovements: true
  },
  [MovementType.OBJECT_HOLD]: {
    type: MovementType.OBJECT_HOLD,
    displayName: 'Object Hold',
    description: 'Holding an object with specified grip to assess stability',
    hasSubMovements: true
  },
  [MovementType.FREESTYLE]: {
    type: MovementType.FREESTYLE,
    displayName: 'Freestyle',
    description: 'Free hand movement without specific constraints',
    hasSubMovements: false
  }
};
