import { z } from 'zod';
import { paginationSchema, searchSchema, softDeleteSchema, jsonStringSchema } from './common.schema';

// ============================================================================
// Protocol Configuration Schema (New Hierarchical Movement System)
// ============================================================================

// Base enums
const handSchema = z.enum(['left', 'right', 'both'] as const);
const postureSchema = z.enum(['pronation', 'supination', 'neutral'] as const);

// Movement-specific config schemas
const wristRotationConfigSchema = z.object({
  subMovement: z.enum([
    'rotation_in_out',
    'rotation_out_in',
    'rotation_in',
    'rotation_out'
  ] as const)
});

const fingerTappingConfigSchema = z.object({
  fingers: z.array(
    z.enum(['thumb', 'index', 'middle', 'ring', 'little'] as const)
  )
    .min(1, { message: 'Select at least one finger' })
    .max(5, { message: 'Cannot exceed 5 fingers' }),
  unilateral: z.enum(['tap_slowly', 'tap_fast'] as const),
  bilateral: z.enum(['alternating', 'synchronous'] as const)
});

const fingersBendingConfigSchema = z.object({
  subMovement: z.enum(['unilateral', 'bilateral'] as const)
});

const apertureClosureConfigSchema = z.object({
  apertureCategory: z.enum(['aperture', 'closure', 'aperture_closure'] as const),
  handCategory: z.enum(['unilateral', 'bilateral'] as const)
});

const objectHoldConfigSchema = z.object({
  subMovement: z.enum(['open_palm', 'closed_grasp'] as const)
});

const freestyleConfigSchema = z.object({});

// Base movement schema (common fields)
const baseMovementSchema = z.object({
  id: z.string().uuid({ message: 'Invalid UUID format' }),
  order: z.number()
    .int({ message: 'Order must be a whole number' })
    .min(0, { message: 'Order cannot be negative' }),
  hand: handSchema,
  posture: postureSchema,
  duration: z.number()
    .int({ message: 'Duration must be a whole number' })
    .min(5, { message: 'Minimum duration is 5 seconds' })
    .max(300, { message: 'Maximum duration is 5 minutes (300 seconds)' }),
  repetitions: z.number()
    .int({ message: 'Repetitions must be a whole number' })
    .min(1, { message: 'At least 1 repetition required' })
    .max(100, { message: 'Maximum 100 repetitions' }),
  instructions: z.string()
    .min(1, { message: 'Instructions are required' })
    .max(1000, { message: 'Instructions cannot exceed 1000 characters' })
});

// Discriminated union for type-safe movement config
const movementSchema = z.discriminatedUnion('movementType', [
  baseMovementSchema.extend({
    movementType: z.literal('wrist_rotation'),
    config: wristRotationConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('finger_tapping'),
    config: fingerTappingConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('fingers_bending'),
    config: fingersBendingConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('aperture_closure'),
    config: apertureClosureConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('object_hold'),
    config: objectHoldConfigSchema
  }),
  baseMovementSchema.extend({
    movementType: z.literal('freestyle'),
    config: freestyleConfigSchema
  })
] as const);

// Legacy movement schema for backward compatibility
const legacyMovementSchema = z.object({
  name: z.string().min(1, 'Movement name is required'),
  duration: z.number().positive('Duration must be positive'),
  repetitions: z.number().int().positive('Repetitions must be positive'),
  instructions: z.string().optional()
});

// ============================================================================
// Analysis Outputs Configuration Schema
// ============================================================================

const fingertipSchema = z.enum([
  'thumb_tip', 'index_tip', 'middle_tip', 'ring_tip', 'pinky_tip'
] as const);

const fingerSchema = z.enum([
  'thumb', 'index', 'middle', 'ring', 'pinky'
] as const);

const romMeasurementSchema = z.enum(['flexion', 'extension'] as const);
const romPlotTypeSchema = z.enum(['violin', 'radar'] as const);

const handApertureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  fingerPair: z.enum(['thumb_index', 'thumb_middle'] as const).default('thumb_index'),
  hand: handSchema.default('right')
});

const cyclogram3DConfigSchema = z.object({
  enabled: z.boolean().default(false),
  fingertip: fingertipSchema.default('index_tip'),
  hand: handSchema.default('right')
});

const trajectory3DConfigSchema = z.object({
  enabled: z.boolean().default(false),
  fingertip: fingertipSchema.default('index_tip'),
  hand: handSchema.default('right')
});

const romPlotConfigSchema = z.object({
  enabled: z.boolean().default(false),
  plotType: romPlotTypeSchema.default('violin'),
  measurement: romMeasurementSchema.default('flexion'),
  fingers: z.object({
    thumb: z.boolean().default(false),
    index: z.boolean().default(true),
    middle: z.boolean().default(false),
    ring: z.boolean().default(false),
    pinky: z.boolean().default(false)
  }).default({}),
  hand: handSchema.default('right')
});

const tremorSpectrogramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hand: handSchema.default('both')
});

const openingClosingVelocityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hand: handSchema.default('right')
});

const cycleFrequencyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hand: handSchema.default('right')
});

const cycleVariabilityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hand: handSchema.default('right')
});

const interFingerCoordinationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  finger1: fingerSchema.default('thumb'),
  finger2: fingerSchema.default('index'),
  hand: handSchema.default('right')
});

const cycleSymmetryConfigSchema = z.object({
  enabled: z.boolean().default(false)
});

const geometricCurvatureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  hand: handSchema.default('right')
});

const analysisOutputsConfigSchema = z.object({
  handAperture: handApertureConfigSchema.optional().default({}),
  cyclogram3D: cyclogram3DConfigSchema.optional().default({}),
  trajectory3D: trajectory3DConfigSchema.optional().default({}),
  romPlot: romPlotConfigSchema.optional().default({}),
  tremorSpectrogram: tremorSpectrogramConfigSchema.optional().default({}),
  openingClosingVelocity: openingClosingVelocityConfigSchema.optional().default({}),
  cycleFrequency: cycleFrequencyConfigSchema.optional().default({}),
  cycleVariability: cycleVariabilityConfigSchema.optional().default({}),
  interFingerCoordination: interFingerCoordinationConfigSchema.optional().default({}),
  cycleSymmetry: cycleSymmetryConfigSchema.optional().default({}),
  geometricCurvature: geometricCurvatureConfigSchema.optional().default({})
}).optional();

// Protocol configuration schema (supports both new and legacy formats)
const protocolConfigurationSchema = z.object({
  movements: z.array(
    z.union([movementSchema, legacyMovementSchema])
  ).default([]),
  overallRepetitions: z.number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(1),
  requiredMetrics: z.array(z.string()).default([]),
  instructions: z.string().optional(),
  clinicalGuidelines: z.string().optional(),
  analysisOutputs: analysisOutputsConfigSchema
});

// Export movement schema for use elsewhere
export { movementSchema, protocolConfigurationSchema };
export type MovementInput = z.infer<typeof movementSchema>;

// ============================================================================
// Create Protocol Schema
// ============================================================================

export const createProtocolSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Protocol name is required').max(200),
    description: z.string().max(1000).optional(),
    version: z.string().default('1.0'),
    configuration: z.union([
      protocolConfigurationSchema,
      jsonStringSchema.transform((str) => JSON.parse(str))
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)),
    indicatedFor: z.string().max(500).optional(),
    contraindications: z.string().max(500).optional(),
    isPublic: z.boolean().default(false),
    isActive: z.boolean().default(true)
  })
});

export type CreateProtocolInput = z.infer<typeof createProtocolSchema>['body'];

// ============================================================================
// Update Protocol Schema
// ============================================================================

export const updateProtocolSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    version: z.string().optional(),
    configuration: z.union([
      protocolConfigurationSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
    indicatedFor: z.string().max(500).optional(),
    contraindications: z.string().max(500).optional(),
    isPublic: z.boolean().optional(),
    isActive: z.boolean().optional()
  }).strict()
});

export type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>['body'];

// ============================================================================
// List Protocols Schema
// ============================================================================

export const listProtocolsSchema = z.object({
  query: paginationSchema
    .extend({
      isPublic: z.coerce.boolean().optional(),
      isActive: z.coerce.boolean().optional(),
      createdById: z.string().uuid().optional()
    })
    .merge(searchSchema)
    .merge(softDeleteSchema)
});

export type ListProtocolsInput = z.infer<typeof listProtocolsSchema>['query'];

// ============================================================================
// Get Protocol Schema
// ============================================================================

export const getProtocolSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid protocol ID')
  })
});

export type GetProtocolInput = z.infer<typeof getProtocolSchema>['params'];

// ============================================================================
// Delete Protocol Schema
// ============================================================================

export const deleteProtocolSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid protocol ID')
  }),
  body: z.object({
    hard: z.boolean().default(false)
  }).optional()
});

export type DeleteProtocolInput = {
  params: z.infer<typeof deleteProtocolSchema>['params'];
  body?: z.infer<typeof deleteProtocolSchema>['body'];
};
