"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProtocolSchema = exports.getProtocolSchema = exports.listProtocolsSchema = exports.updateProtocolSchema = exports.createProtocolSchema = exports.protocolConfigurationSchema = exports.movementSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("./common.schema");
// ============================================================================
// Protocol Configuration Schema (New Hierarchical Movement System)
// ============================================================================
// Base enums
const handSchema = zod_1.z.enum(['left', 'right', 'both']);
const postureSchema = zod_1.z.enum(['pronation', 'supination', 'neutral']);
// Movement-specific config schemas
const wristRotationConfigSchema = zod_1.z.object({
    subMovement: zod_1.z.enum([
        'rotation_in_out',
        'rotation_out_in',
        'rotation_in',
        'rotation_out'
    ])
});
const fingerTappingConfigSchema = zod_1.z.object({
    fingers: zod_1.z.array(zod_1.z.enum(['thumb', 'index', 'middle', 'ring', 'little']))
        .min(1, { message: 'Select at least one finger' })
        .max(5, { message: 'Cannot exceed 5 fingers' }),
    unilateral: zod_1.z.enum(['tap_slowly', 'tap_fast']),
    bilateral: zod_1.z.enum(['alternating', 'synchronous'])
});
const fingersBendingConfigSchema = zod_1.z.object({
    subMovement: zod_1.z.enum(['unilateral', 'bilateral'])
});
const apertureClosureConfigSchema = zod_1.z.object({
    apertureCategory: zod_1.z.enum(['aperture', 'closure', 'aperture_closure']),
    handCategory: zod_1.z.enum(['unilateral', 'bilateral'])
});
const objectHoldConfigSchema = zod_1.z.object({
    subMovement: zod_1.z.enum(['open_palm', 'closed_grasp'])
});
const freestyleConfigSchema = zod_1.z.object({});
// Base movement schema (common fields)
const baseMovementSchema = zod_1.z.object({
    id: zod_1.z.string().uuid({ message: 'Invalid UUID format' }),
    order: zod_1.z.number()
        .int({ message: 'Order must be a whole number' })
        .min(0, { message: 'Order cannot be negative' }),
    hand: handSchema,
    posture: postureSchema,
    duration: zod_1.z.number()
        .int({ message: 'Duration must be a whole number' })
        .min(5, { message: 'Minimum duration is 5 seconds' })
        .max(300, { message: 'Maximum duration is 5 minutes (300 seconds)' }),
    repetitions: zod_1.z.number()
        .int({ message: 'Repetitions must be a whole number' })
        .min(1, { message: 'At least 1 repetition required' })
        .max(100, { message: 'Maximum 100 repetitions' }),
    instructions: zod_1.z.string()
        .min(1, { message: 'Instructions are required' })
        .max(1000, { message: 'Instructions cannot exceed 1000 characters' })
});
// Discriminated union for type-safe movement config
const movementSchema = zod_1.z.discriminatedUnion('movementType', [
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('wrist_rotation'),
        config: wristRotationConfigSchema
    }),
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('finger_tapping'),
        config: fingerTappingConfigSchema
    }),
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('fingers_bending'),
        config: fingersBendingConfigSchema
    }),
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('aperture_closure'),
        config: apertureClosureConfigSchema
    }),
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('object_hold'),
        config: objectHoldConfigSchema
    }),
    baseMovementSchema.extend({
        movementType: zod_1.z.literal('freestyle'),
        config: freestyleConfigSchema
    })
]);
exports.movementSchema = movementSchema;
// Legacy movement schema for backward compatibility
const legacyMovementSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Movement name is required'),
    duration: zod_1.z.number().positive('Duration must be positive'),
    repetitions: zod_1.z.number().int().positive('Repetitions must be positive'),
    instructions: zod_1.z.string().optional()
});
// ============================================================================
// Analysis Outputs Configuration Schema
// ============================================================================
const fingertipSchema = zod_1.z.enum([
    'thumb_tip', 'index_tip', 'middle_tip', 'ring_tip', 'pinky_tip'
]);
const fingerSchema = zod_1.z.enum([
    'thumb', 'index', 'middle', 'ring', 'pinky'
]);
const romMeasurementSchema = zod_1.z.enum(['flexion', 'extension']);
const romPlotTypeSchema = zod_1.z.enum(['violin', 'radar']);
const handApertureConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    fingerPair: zod_1.z.enum(['thumb_index', 'thumb_middle']).default('thumb_index'),
    hand: handSchema.default('right')
});
const cyclogram3DConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    fingertip: fingertipSchema.default('index_tip'),
    hand: handSchema.default('right')
});
const trajectory3DConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    fingertip: fingertipSchema.default('index_tip'),
    hand: handSchema.default('right')
});
const romPlotConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    plotType: romPlotTypeSchema.default('violin'),
    measurement: romMeasurementSchema.default('flexion'),
    fingers: zod_1.z.object({
        thumb: zod_1.z.boolean().default(false),
        index: zod_1.z.boolean().default(true),
        middle: zod_1.z.boolean().default(false),
        ring: zod_1.z.boolean().default(false),
        pinky: zod_1.z.boolean().default(false)
    }).default({}),
    hand: handSchema.default('right')
});
const tremorSpectrogramConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    hand: handSchema.default('both')
});
const openingClosingVelocityConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    hand: handSchema.default('right')
});
const cycleFrequencyConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    hand: handSchema.default('right')
});
const cycleVariabilityConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    hand: handSchema.default('right')
});
const interFingerCoordinationConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    finger1: fingerSchema.default('thumb'),
    finger2: fingerSchema.default('index'),
    hand: handSchema.default('right')
});
const cycleSymmetryConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false)
});
const geometricCurvatureConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    hand: handSchema.default('right')
});
const analysisOutputsConfigSchema = zod_1.z.object({
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
const protocolConfigurationSchema = zod_1.z.object({
    movements: zod_1.z.array(zod_1.z.union([movementSchema, legacyMovementSchema])).default([]),
    overallRepetitions: zod_1.z.number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(1),
    requiredMetrics: zod_1.z.array(zod_1.z.string()).default([]),
    instructions: zod_1.z.string().optional(),
    clinicalGuidelines: zod_1.z.string().optional(),
    analysisOutputs: analysisOutputsConfigSchema
});
exports.protocolConfigurationSchema = protocolConfigurationSchema;
// ============================================================================
// Create Protocol Schema
// ============================================================================
exports.createProtocolSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, 'Protocol name is required').max(200),
        description: zod_1.z.string().max(1000).optional(),
        version: zod_1.z.string().default('1.0'),
        configuration: zod_1.z.union([
            protocolConfigurationSchema,
            common_schema_1.jsonStringSchema.transform((str) => JSON.parse(str))
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)),
        indicatedFor: zod_1.z.string().max(500).optional(),
        contraindications: zod_1.z.string().max(500).optional(),
        isPublic: zod_1.z.boolean().default(false),
        isActive: zod_1.z.boolean().default(true)
    })
});
// ============================================================================
// Update Protocol Schema
// ============================================================================
exports.updateProtocolSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).max(200).optional(),
        description: zod_1.z.string().max(1000).optional(),
        version: zod_1.z.string().optional(),
        configuration: zod_1.z.union([
            protocolConfigurationSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        indicatedFor: zod_1.z.string().max(500).optional(),
        contraindications: zod_1.z.string().max(500).optional(),
        isPublic: zod_1.z.boolean().optional(),
        isActive: zod_1.z.boolean().optional()
    }).strict()
});
// ============================================================================
// List Protocols Schema
// ============================================================================
exports.listProtocolsSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema
        .extend({
        isPublic: zod_1.z.coerce.boolean().optional(),
        isActive: zod_1.z.coerce.boolean().optional(),
        createdById: zod_1.z.string().uuid().optional()
    })
        .merge(common_schema_1.searchSchema)
        .merge(common_schema_1.softDeleteSchema)
});
// ============================================================================
// Get Protocol Schema
// ============================================================================
exports.getProtocolSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid protocol ID')
    })
});
// ============================================================================
// Delete Protocol Schema
// ============================================================================
exports.deleteProtocolSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid protocol ID')
    }),
    body: zod_1.z.object({
        hard: zod_1.z.boolean().default(false)
    }).optional()
});
