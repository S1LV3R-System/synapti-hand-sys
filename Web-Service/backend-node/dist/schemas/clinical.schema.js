"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listComparisonsSchema = exports.getComparisonSchema = exports.createComparisonSchema = exports.listAnnotationsSchema = exports.updateAnnotationSchema = exports.createAnnotationSchema = exports.getAnalysisSchema = exports.updateAnalysisSchema = exports.createAnalysisSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("./common.schema");
const api_types_1 = require("../types/api.types");
// ============================================================================
// Clinical Analysis Schema
// ============================================================================
const frequencySpectrumSchema = zod_1.z.object({
    frequencies: zod_1.z.array(zod_1.z.number()),
    power: zod_1.z.array(zod_1.z.number()),
    peaks: zod_1.z.array(zod_1.z.object({
        frequency: zod_1.z.number(),
        power: zod_1.z.number()
    }))
});
const romMeasurementsSchema = zod_1.z.object({
    wrist: zod_1.z.object({
        flexion: zod_1.z.number().optional(),
        extension: zod_1.z.number().optional(),
        radialDeviation: zod_1.z.number().optional(),
        ulnarDeviation: zod_1.z.number().optional()
    }).optional(),
    fingers: zod_1.z.record(zod_1.z.object({
        flexion: zod_1.z.number().optional(),
        extension: zod_1.z.number().optional()
    })).optional()
});
const severityScoresSchema = zod_1.z.object({
    UPDRS: zod_1.z.number().optional(),
    ARAT: zod_1.z.number().optional(),
    customScale: zod_1.z.number().optional()
});
exports.createAnalysisSchema = zod_1.z.object({
    params: zod_1.z.object({
        recordingId: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        analysisVersion: zod_1.z.string().default('1.0'),
        analysisType: common_schema_1.analysisTypeSchema.default(api_types_1.AnalysisType.COMPREHENSIVE),
        // Tremor metrics
        tremorFrequency: zod_1.z.number().optional(),
        tremorAmplitude: zod_1.z.number().optional(),
        tremorRegularity: common_schema_1.scoreSchema.optional(),
        dominantFrequency: zod_1.z.number().optional(),
        frequencySpectrum: zod_1.z.union([
            frequencySpectrumSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        // Smoothness metrics
        sparc: zod_1.z.number().optional(),
        ldljv: zod_1.z.number().optional(),
        normalizedJerk: zod_1.z.number().optional(),
        // ROM measurements
        romMeasurements: zod_1.z.union([
            romMeasurementsSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        // Asymmetry analysis
        asymmetryIndex: common_schema_1.scoreSchema.optional(),
        asymmetryDetails: common_schema_1.jsonStringSchema.optional(),
        // Coordination scores
        coordinationScore: zod_1.z.number().min(0).max(100).optional(),
        reactionTime: zod_1.z.number().positive().optional(),
        movementAccuracy: common_schema_1.scoreSchema.optional(),
        // Severity scoring
        severityScores: zod_1.z.union([
            severityScoresSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
        // Overall assessment
        overallScore: zod_1.z.number().min(0).max(100).optional(),
        clinicalSummary: zod_1.z.string().max(5000).optional(),
        // Quality
        confidence: common_schema_1.scoreSchema.default(0),
        qualityFlags: zod_1.z.union([
            zod_1.z.array(zod_1.z.string()),
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional()
    })
});
// ============================================================================
// Update Analysis Schema
// ============================================================================
exports.updateAnalysisSchema = zod_1.z.object({
    params: zod_1.z.object({
        analysisId: zod_1.z.string().uuid('Invalid analysis ID')
    }),
    body: exports.createAnalysisSchema.shape.body.partial()
});
// ============================================================================
// Get Analysis Schema
// ============================================================================
exports.getAnalysisSchema = zod_1.z.object({
    params: zod_1.z.object({
        recordingId: zod_1.z.string().uuid('Invalid recording ID')
    })
});
// ============================================================================
// Clinical Annotation Schema
// ============================================================================
exports.createAnnotationSchema = zod_1.z.object({
    params: zod_1.z.object({
        recordingId: zod_1.z.string().uuid('Invalid recording ID')
    }),
    body: zod_1.z.object({
        annotationType: common_schema_1.annotationTypeSchema,
        content: zod_1.z.string().min(1, 'Annotation content is required').max(5000),
        severity: common_schema_1.severityLevelSchema.optional(),
        timestampStart: zod_1.z.number().nonnegative().optional(),
        timestampEnd: zod_1.z.number().nonnegative().optional()
    }).refine((data) => {
        if (data.timestampStart !== undefined && data.timestampEnd !== undefined) {
            return data.timestampStart <= data.timestampEnd;
        }
        return true;
    }, {
        message: 'Start timestamp must be before or equal to end timestamp'
    })
});
// ============================================================================
// Update Annotation Schema
// ============================================================================
exports.updateAnnotationSchema = zod_1.z.object({
    params: zod_1.z.object({
        annotationId: zod_1.z.string().uuid('Invalid annotation ID')
    }),
    body: zod_1.z.object({
        content: zod_1.z.string().min(1).max(5000).optional(),
        severity: common_schema_1.severityLevelSchema.optional(),
        isResolved: zod_1.z.boolean().optional()
    }).strict()
});
// ============================================================================
// List Annotations Schema
// ============================================================================
exports.listAnnotationsSchema = zod_1.z.object({
    params: zod_1.z.object({
        recordingId: zod_1.z.string().uuid('Invalid recording ID')
    }),
    query: common_schema_1.paginationSchema.extend({
        annotationType: common_schema_1.annotationTypeSchema.optional(),
        severity: common_schema_1.severityLevelSchema.optional(),
        isResolved: zod_1.z.coerce.boolean().optional()
    })
});
// ============================================================================
// Recording Comparison Schema
// ============================================================================
const metricDifferenceSchema = zod_1.z.record(zod_1.z.object({
    baseline: zod_1.z.number(),
    compared: zod_1.z.number(),
    change: zod_1.z.number(),
    changePercent: zod_1.z.number()
}));
exports.createComparisonSchema = zod_1.z.object({
    body: zod_1.z.object({
        baselineRecordingId: zod_1.z.string().uuid('Invalid baseline recording ID'),
        comparedRecordingId: zod_1.z.string().uuid('Invalid compared recording ID'),
        comparisonType: common_schema_1.comparisonTypeSchema,
        metricDifferences: zod_1.z.union([
            metricDifferenceSchema,
            common_schema_1.jsonStringSchema
        ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)),
        overallChange: zod_1.z.enum(['improved', 'stable', 'declined']).optional(),
        changeScore: zod_1.z.number().min(-100).max(100).optional(),
        statisticalTests: common_schema_1.jsonStringSchema.optional(),
        clinicalNotes: zod_1.z.string().max(5000).optional()
    })
});
// ============================================================================
// Get Comparison Schema
// ============================================================================
exports.getComparisonSchema = zod_1.z.object({
    params: zod_1.z.object({
        comparisonId: zod_1.z.string().uuid('Invalid comparison ID')
    })
});
// ============================================================================
// List Comparisons Schema
// ============================================================================
exports.listComparisonsSchema = zod_1.z.object({
    query: common_schema_1.paginationSchema.extend({
        recordingId: zod_1.z.string().uuid().optional(),
        comparisonType: common_schema_1.comparisonTypeSchema.optional()
    })
});
