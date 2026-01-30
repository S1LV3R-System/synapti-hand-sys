"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRecordingSchema = exports.getRecordingSchema = exports.listRecordingsSchema = exports.updateReviewStatusSchema = exports.updateRecordingStatusSchema = exports.updateRecordingSchema = exports.createRecordingSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("./common.schema");
const api_types_1 = require("../types/api.types");
// ============================================================================
// Device Info Schema
// ============================================================================
const deviceInfoSchema = zod_1.z.object({
    deviceType: zod_1.z.string(),
    model: zod_1.z.string().optional(),
    resolution: zod_1.z.string().optional(),
    frameRate: zod_1.z.number().optional()
});
// ============================================================================
// Processing Metadata Schema
// ============================================================================
const processingMetadataSchema = zod_1.z.object({
    uploadedAt: zod_1.z.string().datetime().optional(),
    processedAt: zod_1.z.string().datetime().optional(),
    errorDetails: zod_1.z.string().optional(),
    processingDuration: zod_1.z.number().optional()
});
// ============================================================================
// Create Recording Session Schema
// ============================================================================
exports.createRecordingSchema = zod_1.z.object({
    body: zod_1.z.object({
        patientUserId: zod_1.z.string().uuid('Invalid patient ID'),
        clinicianId: zod_1.z.string().uuid('Invalid clinician ID').optional(),
        protocolId: zod_1.z.string().uuid('Invalid protocol ID').optional(),
        recordingDate: zod_1.z.string().datetime().default(() => new Date().toISOString()),
        duration: zod_1.z.number().int().positive().optional(),
        fps: zod_1.z.number().int().positive().optional(),
        deviceInfo: zod_1.z.union([
            deviceInfoSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        videoPath: zod_1.z.string().max(500).optional(),
        csvPath: zod_1.z.string().max(500).optional(),
        clinicalNotes: zod_1.z.string().max(5000).optional(),
        status: common_schema_1.recordingStatusSchema.default(api_types_1.RecordingStatus.UPLOADED)
    })
});
// ============================================================================
// Update Recording Session Schema
// ============================================================================
exports.updateRecordingSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        protocolId: zod_1.z.string().uuid('Invalid protocol ID').optional(),
        duration: zod_1.z.number().int().positive().optional(),
        fps: zod_1.z.number().int().positive().optional(),
        deviceInfo: zod_1.z.union([
            deviceInfoSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        videoPath: zod_1.z.string().max(500).optional(),
        csvPath: zod_1.z.string().max(500).optional(),
        clinicalNotes: zod_1.z.string().max(5000).optional()
    }).strict()
});
// ============================================================================
// Update Recording Status Schema
// ============================================================================
exports.updateRecordingStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        status: common_schema_1.recordingStatusSchema,
        processingMetadata: zod_1.z.union([
            processingMetadataSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional()
    })
});
// ============================================================================
// Update Review Status Schema
// ============================================================================
exports.updateReviewStatusSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        reviewStatus: common_schema_1.reviewStatusSchema,
        reviewNotes: zod_1.z.string().max(2000).optional()
    })
});
// ============================================================================
// List Recordings Schema
// ============================================================================
exports.listRecordingsSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema
        .extend({
        patientUserId: zod_1.z.string().uuid().optional(),
        clinicianId: zod_1.z.string().uuid().optional(),
        protocolId: zod_1.z.string().uuid().optional(),
        status: common_schema_1.recordingStatusSchema.optional(),
        reviewStatus: common_schema_1.reviewStatusSchema.optional(),
        startDate: zod_1.z.string().datetime().optional(),
        endDate: zod_1.z.string().datetime().optional()
    })
        .merge(common_schema_1.searchSchema)
        .merge(common_schema_1.softDeleteSchema)
});
// ============================================================================
// Get Recording Schema
// ============================================================================
exports.getRecordingSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid recording ID')
    }),
    query: zod_1.z.object({
        includeAnalysis: zod_1.z.coerce.boolean().default(false),
        includeAnnotations: zod_1.z.coerce.boolean().default(false),
        includeProcessing: zod_1.z.coerce.boolean().default(false)
    }).optional()
});
// ============================================================================
// Delete Recording Schema
// ============================================================================
exports.deleteRecordingSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        hard: zod_1.z.boolean().default(false)
    }).optional()
});
