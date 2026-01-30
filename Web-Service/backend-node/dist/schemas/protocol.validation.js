"use strict";
// ============================================================================
// PROTOCOL VALIDATION SCHEMAS
// ============================================================================
// Zod schemas for protocol and movement validation
// Provides both frontend and backend validation with discriminated unions
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProtocolSchema = exports.createProtocolSchema = exports.protocolConfigurationSchema = exports.movementSchema = void 0;
exports.validateProtocol = validateProtocol;
exports.validateProtocolUpdate = validateProtocolUpdate;
exports.validateMovement = validateMovement;
exports.validateProtocolConfiguration = validateProtocolConfiguration;
exports.safeValidateProtocol = safeValidateProtocol;
exports.safeValidateMovement = safeValidateMovement;
exports.createDefaultMovement = createDefaultMovement;
exports.formatValidationError = formatValidationError;
exports.getValidationErrorMap = getValidationErrorMap;
const zod_1 = require("zod");
// Types are used via Zod schema definitions - no direct import needed
// The enums are redefined as Zod schemas below for validation
// ============================================================================
// BASE ENUMS
// ============================================================================
const handSchema = zod_1.z.enum(['left', 'right', 'both']);
const postureSchema = zod_1.z.enum(['pronation', 'supination', 'neutral']);
// ============================================================================
// MOVEMENT-SPECIFIC CONFIG SCHEMAS
// ============================================================================
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
const freestyleConfigSchema = zod_1.z.object({}).strict();
// ============================================================================
// BASE MOVEMENT SCHEMA
// ============================================================================
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
// ============================================================================
// DISCRIMINATED UNION FOR TYPE-SAFE MOVEMENT CONFIG
// ============================================================================
exports.movementSchema = zod_1.z.discriminatedUnion('movementType', [
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
// ============================================================================
// PROTOCOL CONFIGURATION SCHEMA
// ============================================================================
exports.protocolConfigurationSchema = zod_1.z.object({
    movements: zod_1.z.array(exports.movementSchema)
        .min(1, { message: 'At least one movement is required' })
        .max(20, { message: 'Maximum 20 movements per protocol' }),
    overallRepetitions: zod_1.z.number()
        .int({ message: 'Must be a whole number' })
        .min(1, { message: 'At least 1 repetition required' })
        .max(20, { message: 'Maximum 20 repetitions' }),
    requiredMetrics: zod_1.z.array(zod_1.z.string()).optional().default([]),
    clinicalGuidelines: zod_1.z.string().optional()
});
// ============================================================================
// PROTOCOL SCHEMA
// ============================================================================
exports.createProtocolSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, { message: 'Protocol name is required' })
        .max(100, { message: 'Protocol name cannot exceed 100 characters' }),
    description: zod_1.z.string()
        .max(500, { message: 'Description cannot exceed 500 characters' })
        .optional(),
    version: zod_1.z.string().default('1.0'),
    configuration: exports.protocolConfigurationSchema,
    indicatedFor: zod_1.z.string().optional(),
    contraindications: zod_1.z.string().optional(),
    isPublic: zod_1.z.boolean().default(false),
    isActive: zod_1.z.boolean().default(true)
});
exports.updateProtocolSchema = exports.createProtocolSchema.partial();
// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================
/**
 * Validate protocol creation input
 */
async function validateProtocol(data) {
    return exports.createProtocolSchema.parseAsync(data);
}
/**
 * Validate protocol update input
 */
async function validateProtocolUpdate(data) {
    return exports.updateProtocolSchema.parseAsync(data);
}
/**
 * Validate movement configuration
 */
async function validateMovement(data) {
    return exports.movementSchema.parseAsync(data);
}
/**
 * Validate protocol configuration
 */
async function validateProtocolConfiguration(data) {
    return exports.protocolConfigurationSchema.parseAsync(data);
}
// ============================================================================
// SAFE VALIDATION FUNCTIONS (Return error objects)
// ============================================================================
/**
 * Safely validate protocol without throwing
 */
function safeValidateProtocol(data) {
    const result = exports.createProtocolSchema.safeParse(data);
    return result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error };
}
/**
 * Safely validate movement without throwing
 */
function safeValidateMovement(data) {
    const result = exports.movementSchema.safeParse(data);
    return result.success
        ? { success: true, data: result.data }
        : { success: false, error: result.error };
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Create a default movement for testing/initialization
 */
function createDefaultMovement(movementType, index = 0) {
    const baseMovement = {
        id: crypto.randomUUID?.() || `mov_${Date.now()}_${Math.random()}`,
        order: index,
        hand: 'right',
        posture: 'neutral',
        duration: 30,
        repetitions: 5,
        instructions: `Perform ${movementType} movement as instructed`
    };
    const configMap = {
        wrist_rotation: { subMovement: 'rotation_in_out' },
        finger_tapping: {
            fingers: ['index'],
            unilateral: 'tap_slowly',
            bilateral: 'alternating'
        },
        fingers_bending: { subMovement: 'unilateral' },
        aperture_closure: {
            apertureCategory: 'aperture',
            handCategory: 'unilateral'
        },
        object_hold: { subMovement: 'open_palm' },
        freestyle: {}
    };
    const config = configMap[movementType] || {};
    return {
        ...baseMovement,
        movementType: movementType,
        config
    };
}
/**
 * Extract validation errors in a user-friendly format
 */
function formatValidationError(error) {
    const formatted = {};
    error.errors.forEach((err) => {
        const path = err.path.join('.');
        formatted[path] = err.message;
    });
    return formatted;
}
/**
 * Validate and get error field map
 */
function getValidationErrorMap(data, validator) {
    const result = validator.safeParse(data);
    if (result.success) {
        return null;
    }
    return formatValidationError(result.error);
}
