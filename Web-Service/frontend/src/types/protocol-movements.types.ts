// ============================================================================
// Protocol Movement Types - Enhanced Movement System
// ============================================================================

/**
 * Movement types supported by the protocol system
 */
export const MovementType = {
  WRIST_ROTATION: 'wrist_rotation',
  FINGER_TAPPING: 'finger_tapping',
  FINGERS_BENDING: 'fingers_bending',
  APERTURE_CLOSURE: 'aperture_closure',
  OBJECT_HOLD: 'object_hold',
  FREESTYLE: 'freestyle'
} as const;

export type MovementType = typeof MovementType[keyof typeof MovementType];

/**
 * Hand selection options
 */
export const Hand = {
  LEFT: 'left',
  RIGHT: 'right',
  BOTH: 'both'
} as const;

export type Hand = typeof Hand[keyof typeof Hand];

/**
 * Posture selection options
 */
export const Posture = {
  PRONATION: 'pronation',
  SUPINATION: 'supination',
  NEUTRAL: 'neutral'
} as const;

export type Posture = typeof Posture[keyof typeof Posture];

// ============================================================================
// Wrist Rotation Types
// ============================================================================

export const WristRotationDirection = {
  IN_OUT: 'in_out',
  OUT_IN: 'out_in',
  IN_ONLY: 'in_only',
  OUT_ONLY: 'out_only'
} as const;

export type WristRotationDirection = typeof WristRotationDirection[keyof typeof WristRotationDirection];

export interface WristRotationConfig {
  direction: WristRotationDirection;
}

// ============================================================================
// Finger Tapping Types
// ============================================================================

export const TappingMode = {
  UNILATERAL: 'unilateral',
  BILATERAL: 'bilateral'
} as const;

export type TappingMode = typeof TappingMode[keyof typeof TappingMode];

export interface FingerTappingConfig {
  mode: TappingMode;
  fingers: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
}

// ============================================================================
// Fingers Bending Types
// ============================================================================

export const BendingMode = {
  UNILATERAL: 'unilateral',
  BILATERAL: 'bilateral'
} as const;

export type BendingMode = typeof BendingMode[keyof typeof BendingMode];

export interface FingersBendingConfig {
  mode: BendingMode;
}

// ============================================================================
// Aperture-Closure Types
// ============================================================================

export const ApertureType = {
  APERTURE: 'aperture',
  CLOSURE: 'closure',
  FULL_CYCLE: 'full_cycle'
} as const;

export type ApertureType = typeof ApertureType[keyof typeof ApertureType];

export const HandType = {
  OPEN_PALM: 'open_palm',
  CLOSED_GRASP: 'closed_grasp'
} as const;

export type HandType = typeof HandType[keyof typeof HandType];

export interface ApertureClosureConfig {
  apertureType: ApertureType;
  handType: HandType;
}

// ============================================================================
// Object Hold Types
// ============================================================================

export const GripType = {
  OPEN_PALM: 'open_palm',
  CLOSED_GRASP: 'closed_grasp'
} as const;

export type GripType = typeof GripType[keyof typeof GripType];

export interface ObjectHoldConfig {
  gripType: GripType;
}

// ============================================================================
// Freestyle Types
// ============================================================================

export interface FreestyleConfig {
  // No additional configuration needed
}

// ============================================================================
// Union Type for Movement Configs
// ============================================================================

export type MovementConfig = 
  | WristRotationConfig
  | FingerTappingConfig
  | FingersBendingConfig
  | ApertureClosureConfig
  | ObjectHoldConfig
  | FreestyleConfig;

// ============================================================================
// Enhanced Protocol Movement
// ============================================================================

export interface EnhancedProtocolMovement {
  id: string;
  order: number;
  movementType: MovementType;
  hand: Hand;
  posture: Posture;
  duration: number;
  repetitions: number;
  instructions: string;
  config: MovementConfig;
}

// ============================================================================
// Enhanced Protocol Configuration
// ============================================================================

export interface EnhancedProtocolConfiguration {
  movements: EnhancedProtocolMovement[];
  requiredMetrics: string[];
  instructions?: string;
  clinicalGuidelines?: string;
  overallRepetitions?: number;
  analysisOutputs?: AnalysisOutputsConfig;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWristRotationConfig(config: MovementConfig): config is WristRotationConfig {
  return 'direction' in config;
}

export function isFingerTappingConfig(config: MovementConfig): config is FingerTappingConfig {
  return 'fingers' in config && 'mode' in config;
}

export function isFingersBendingConfig(config: MovementConfig): config is FingersBendingConfig {
  return 'mode' in config && !('fingers' in config) && !('apertureType' in config);
}

export function isApertureClosureConfig(config: MovementConfig): config is ApertureClosureConfig {
  return 'apertureType' in config;
}

export function isObjectHoldConfig(config: MovementConfig): config is ObjectHoldConfig {
  return 'gripType' in config;
}

export function isFreestyleConfig(config: MovementConfig): config is FreestyleConfig {
  return Object.keys(config).length === 0;
}

// ============================================================================
// Display Labels
// ============================================================================

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  [MovementType.WRIST_ROTATION]: 'Wrist Rotation',
  [MovementType.FINGER_TAPPING]: 'Finger Tapping',
  [MovementType.FINGERS_BENDING]: 'Fingers Bending',
  [MovementType.APERTURE_CLOSURE]: 'Aperture-Closure',
  [MovementType.OBJECT_HOLD]: 'Object Hold',
  [MovementType.FREESTYLE]: 'Freestyle'
};

export const HAND_LABELS: Record<Hand, string> = {
  [Hand.LEFT]: 'Left Hand',
  [Hand.RIGHT]: 'Right Hand',
  [Hand.BOTH]: 'Both Hands'
};

export const POSTURE_LABELS: Record<Posture, string> = {
  [Posture.PRONATION]: 'Pronation (palm down)',
  [Posture.SUPINATION]: 'Supination (palm up)',
  [Posture.NEUTRAL]: 'Neutral'
};

export const WRIST_ROTATION_LABELS: Record<WristRotationDirection, string> = {
  [WristRotationDirection.IN_OUT]: 'Rotation In-Out',
  [WristRotationDirection.OUT_IN]: 'Rotation Out-In',
  [WristRotationDirection.IN_ONLY]: 'Rotation In Only',
  [WristRotationDirection.OUT_ONLY]: 'Rotation Out Only'
};

export const TAPPING_MODE_LABELS: Record<TappingMode, string> = {
  [TappingMode.UNILATERAL]: 'Unilateral',
  [TappingMode.BILATERAL]: 'Bilateral'
};

export const BENDING_MODE_LABELS: Record<BendingMode, string> = {
  [BendingMode.UNILATERAL]: 'Unilateral',
  [BendingMode.BILATERAL]: 'Bilateral'
};

export const APERTURE_TYPE_LABELS: Record<ApertureType, string> = {
  [ApertureType.APERTURE]: 'Aperture (Opening)',
  [ApertureType.CLOSURE]: 'Closure (Closing)',
  [ApertureType.FULL_CYCLE]: 'Full Cycle'
};

export const HAND_TYPE_LABELS: Record<HandType, string> = {
  [HandType.OPEN_PALM]: 'Open Palm',
  [HandType.CLOSED_GRASP]: 'Closed Grasp'
};

export const GRIP_TYPE_LABELS: Record<GripType, string> = {
  [GripType.OPEN_PALM]: 'Open Palm',
  [GripType.CLOSED_GRASP]: 'Closed Grasp'
};

// ============================================================================
// Default Configs
// ============================================================================

export const DEFAULT_WRIST_ROTATION_CONFIG: WristRotationConfig = {
  direction: WristRotationDirection.IN_OUT
};

export const DEFAULT_FINGER_TAPPING_CONFIG: FingerTappingConfig = {
  mode: TappingMode.UNILATERAL,
  fingers: {
    thumb: true,
    index: true,
    middle: false,
    ring: false,
    pinky: false
  }
};

export const DEFAULT_FINGERS_BENDING_CONFIG: FingersBendingConfig = {
  mode: BendingMode.UNILATERAL
};

export const DEFAULT_APERTURE_CLOSURE_CONFIG: ApertureClosureConfig = {
  apertureType: ApertureType.FULL_CYCLE,
  handType: HandType.OPEN_PALM
};

export const DEFAULT_OBJECT_HOLD_CONFIG: ObjectHoldConfig = {
  gripType: GripType.CLOSED_GRASP
};

export const DEFAULT_FREESTYLE_CONFIG: FreestyleConfig = {};

export function getDefaultConfig(movementType: MovementType): MovementConfig {
  switch (movementType) {
    case MovementType.WRIST_ROTATION:
      return { ...DEFAULT_WRIST_ROTATION_CONFIG };
    case MovementType.FINGER_TAPPING:
      return { ...DEFAULT_FINGER_TAPPING_CONFIG, fingers: { ...DEFAULT_FINGER_TAPPING_CONFIG.fingers } };
    case MovementType.FINGERS_BENDING:
      return { ...DEFAULT_FINGERS_BENDING_CONFIG };
    case MovementType.APERTURE_CLOSURE:
      return { ...DEFAULT_APERTURE_CLOSURE_CONFIG };
    case MovementType.OBJECT_HOLD:
      return { ...DEFAULT_OBJECT_HOLD_CONFIG };
    case MovementType.FREESTYLE:
      return { ...DEFAULT_FREESTYLE_CONFIG };
    default:
      return {};
  }
}

// ============================================================================
// Analysis Results Output Types
// ============================================================================

/**
 * Available analysis output types
 */
export const AnalysisOutputType = {
  HAND_APERTURE: 'hand_aperture',
  CYCLOGRAM_3D: 'cyclogram_3d',
  TRAJECTORY_3D: 'trajectory_3d',
  ROM_PLOT: 'rom_plot',
  TREMOR_SPECTROGRAM: 'tremor_spectrogram',
  OPENING_CLOSING_VELOCITY: 'opening_closing_velocity',
  CYCLE_FREQUENCY: 'cycle_frequency',
  CYCLE_VARIABILITY: 'cycle_variability',
  INTER_FINGER_COORDINATION: 'inter_finger_coordination',
  CYCLE_SYMMETRY: 'cycle_symmetry',
  GEOMETRIC_CURVATURE: 'geometric_curvature'
} as const;

export type AnalysisOutputType = typeof AnalysisOutputType[keyof typeof AnalysisOutputType];

/**
 * Fingertip keypoint identifiers for analysis
 */
export const Fingertip = {
  THUMB_TIP: 'thumb_tip',
  INDEX_TIP: 'index_tip',
  MIDDLE_TIP: 'middle_tip',
  RING_TIP: 'ring_tip',
  PINKY_TIP: 'pinky_tip'
} as const;

export type Fingertip = typeof Fingertip[keyof typeof Fingertip];

/**
 * Finger identifiers (for ROM)
 */
export const Finger = {
  THUMB: 'thumb',
  INDEX: 'index',
  MIDDLE: 'middle',
  RING: 'ring',
  PINKY: 'pinky'
} as const;

export type Finger = typeof Finger[keyof typeof Finger];

/**
 * ROM measurement type
 */
export const RomMeasurement = {
  FLEXION: 'flexion',
  EXTENSION: 'extension'
} as const;

export type RomMeasurement = typeof RomMeasurement[keyof typeof RomMeasurement];

/**
 * ROM plot type
 */
export const RomPlotType = {
  VIOLIN: 'violin',
  RADAR: 'radar'
} as const;

export type RomPlotType = typeof RomPlotType[keyof typeof RomPlotType];

/**
 * Hand Aperture Configuration
 * - Maximum distance between thumb and selected finger
 */
export interface HandApertureConfig {
  enabled: boolean;
  fingerPair: 'thumb_index' | 'thumb_middle';
  hand: Hand;
}

/**
 * 3D Cyclogram Configuration
 * - Select fingertip keypoint for cyclogram representation
 */
export interface Cyclogram3DConfig {
  enabled: boolean;
  fingertip: Fingertip;
  hand: Hand;
}

/**
 * 3D Trajectory Plot Configuration
 * - Select fingertip keypoint for trajectory representation
 */
export interface Trajectory3DConfig {
  enabled: boolean;
  fingertip: Fingertip;
  hand: Hand;
}

/**
 * ROM Plot Configuration
 * - Violin/Radar plot for finger ROM
 * - Select fingers and flexion/extension
 * - All 3 joints output per selected finger
 */
export interface RomPlotConfig {
  enabled: boolean;
  plotType: RomPlotType;
  measurement: RomMeasurement;
  fingers: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  hand: Hand;
}

/**
 * Tremor Spectrogram Configuration
 * - Wavelet spectrogram for whole hand
 * - Separate output for each hand
 */
export interface TremorSpectrogramConfig {
  enabled: boolean;
  hand: Hand;
}

/**
 * Opening-Closing Velocity Configuration
 * - Vertical bar chart with MAD error bars
 */
export interface OpeningClosingVelocityConfig {
  enabled: boolean;
  hand: Hand;
}

/**
 * Cycle Frequency Configuration
 * - Vertical bar representing cycle window time (ms)
 */
export interface CycleFrequencyConfig {
  enabled: boolean;
  hand: Hand;
}

/**
 * Cycle Variability Configuration
 * - Significance X/Y line scatter plot
 */
export interface CycleVariabilityConfig {
  enabled: boolean;
  hand: Hand;
}

/**
 * Inter-Finger Coordination Configuration
 * - Sine wave plot for two selected fingers
 */
export interface InterFingerCoordinationConfig {
  enabled: boolean;
  finger1: Finger;
  finger2: Finger;
  hand: Hand;
}

/**
 * Cycle Symmetry Configuration
 * - Sine wave plot showing rise/fall of cycle
 * - Left vs right hand comparison
 */
export interface CycleSymmetryConfig {
  enabled: boolean;
}

/**
 * Geometric Curvature Score Configuration
 * - Radar plot visualization
 */
export interface GeometricCurvatureConfig {
  enabled: boolean;
  hand: Hand;
}

/**
 * Complete analysis outputs configuration
 */
export interface AnalysisOutputsConfig {
  handAperture: HandApertureConfig;
  cyclogram3D: Cyclogram3DConfig;
  trajectory3D: Trajectory3DConfig;
  romPlot: RomPlotConfig;
  tremorSpectrogram: TremorSpectrogramConfig;
  openingClosingVelocity: OpeningClosingVelocityConfig;
  cycleFrequency: CycleFrequencyConfig;
  cycleVariability: CycleVariabilityConfig;
  interFingerCoordination: InterFingerCoordinationConfig;
  cycleSymmetry: CycleSymmetryConfig;
  geometricCurvature: GeometricCurvatureConfig;
}

// ============================================================================
// Analysis Output Labels
// ============================================================================

export const ANALYSIS_OUTPUT_LABELS: Record<AnalysisOutputType, string> = {
  [AnalysisOutputType.HAND_APERTURE]: 'Maximum Hand Aperture',
  [AnalysisOutputType.CYCLOGRAM_3D]: '3D Cyclogram',
  [AnalysisOutputType.TRAJECTORY_3D]: '3D Trajectory Plot',
  [AnalysisOutputType.ROM_PLOT]: 'ROM (Range of Motion)',
  [AnalysisOutputType.TREMOR_SPECTROGRAM]: 'Tremor (Wavelet Spectrogram)',
  [AnalysisOutputType.OPENING_CLOSING_VELOCITY]: 'Opening-Closing Velocity',
  [AnalysisOutputType.CYCLE_FREQUENCY]: 'Cycle Frequency',
  [AnalysisOutputType.CYCLE_VARIABILITY]: 'Variability Across Cycles',
  [AnalysisOutputType.INTER_FINGER_COORDINATION]: 'Inter-Finger Coordination',
  [AnalysisOutputType.CYCLE_SYMMETRY]: 'Symmetry Across Cycles',
  [AnalysisOutputType.GEOMETRIC_CURVATURE]: 'Geometric Curvature Score'
};

export const ANALYSIS_OUTPUT_DESCRIPTIONS: Record<AnalysisOutputType, string> = {
  [AnalysisOutputType.HAND_APERTURE]: 'Distance between thumb and index/middle fingertip',
  [AnalysisOutputType.CYCLOGRAM_3D]: 'Cyclic movement pattern visualization for selected fingertip',
  [AnalysisOutputType.TRAJECTORY_3D]: '3D trajectory path for selected fingertip',
  [AnalysisOutputType.ROM_PLOT]: 'Violin/Radar plot for finger joint angles (all 3 joints)',
  [AnalysisOutputType.TREMOR_SPECTROGRAM]: 'Wavelet spectrogram analysis for whole hand',
  [AnalysisOutputType.OPENING_CLOSING_VELOCITY]: 'Vertical bar chart with MAD error bars',
  [AnalysisOutputType.CYCLE_FREQUENCY]: 'Cycle window time representation (ms)',
  [AnalysisOutputType.CYCLE_VARIABILITY]: 'Significance scatter plot across cycles',
  [AnalysisOutputType.INTER_FINGER_COORDINATION]: 'Sine wave coordination between two fingers',
  [AnalysisOutputType.CYCLE_SYMMETRY]: 'Rise/fall cycle comparison (left vs right hand)',
  [AnalysisOutputType.GEOMETRIC_CURVATURE]: 'Radar plot of geometric curvature scores'
};

export const FINGERTIP_LABELS: Record<Fingertip, string> = {
  [Fingertip.THUMB_TIP]: 'Thumb Tip',
  [Fingertip.INDEX_TIP]: 'Index Finger Tip',
  [Fingertip.MIDDLE_TIP]: 'Middle Finger Tip',
  [Fingertip.RING_TIP]: 'Ring Finger Tip',
  [Fingertip.PINKY_TIP]: 'Pinky Tip'
};

export const FINGER_LABELS: Record<Finger, string> = {
  [Finger.THUMB]: 'Thumb',
  [Finger.INDEX]: 'Index',
  [Finger.MIDDLE]: 'Middle',
  [Finger.RING]: 'Ring',
  [Finger.PINKY]: 'Pinky'
};

export const ROM_MEASUREMENT_LABELS: Record<RomMeasurement, string> = {
  [RomMeasurement.FLEXION]: 'Flexion',
  [RomMeasurement.EXTENSION]: 'Extension'
};

export const ROM_PLOT_TYPE_LABELS: Record<RomPlotType, string> = {
  [RomPlotType.VIOLIN]: 'Violin Plot',
  [RomPlotType.RADAR]: 'Radar Plot'
};

// ============================================================================
// Default Analysis Outputs Configuration
// ============================================================================

export const DEFAULT_ANALYSIS_OUTPUTS_CONFIG: AnalysisOutputsConfig = {
  handAperture: {
    enabled: false,
    fingerPair: 'thumb_index',
    hand: Hand.RIGHT
  },
  cyclogram3D: {
    enabled: false,
    fingertip: Fingertip.INDEX_TIP,
    hand: Hand.RIGHT
  },
  trajectory3D: {
    enabled: false,
    fingertip: Fingertip.INDEX_TIP,
    hand: Hand.RIGHT
  },
  romPlot: {
    enabled: false,
    plotType: RomPlotType.VIOLIN,
    measurement: RomMeasurement.FLEXION,
    fingers: {
      thumb: false,
      index: true,
      middle: false,
      ring: false,
      pinky: false
    },
    hand: Hand.RIGHT
  },
  tremorSpectrogram: {
    enabled: false,
    hand: Hand.BOTH
  },
  openingClosingVelocity: {
    enabled: false,
    hand: Hand.RIGHT
  },
  cycleFrequency: {
    enabled: false,
    hand: Hand.RIGHT
  },
  cycleVariability: {
    enabled: false,
    hand: Hand.RIGHT
  },
  interFingerCoordination: {
    enabled: false,
    finger1: Finger.THUMB,
    finger2: Finger.INDEX,
    hand: Hand.RIGHT
  },
  cycleSymmetry: {
    enabled: false
  },
  geometricCurvature: {
    enabled: false,
    hand: Hand.RIGHT
  }
};

// ============================================================================
// Utility: Create New Movement
// ============================================================================

export function createNewMovement(order: number): EnhancedProtocolMovement {
  return {
    id: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    order,
    movementType: MovementType.WRIST_ROTATION,
    hand: Hand.RIGHT,
    posture: Posture.NEUTRAL,
    duration: 30,
    repetitions: 1,
    instructions: '',
    config: getDefaultConfig(MovementType.WRIST_ROTATION)
  };
}
