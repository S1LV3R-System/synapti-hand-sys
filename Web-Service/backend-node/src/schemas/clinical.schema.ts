import { z } from 'zod';
import {
  analysisTypeSchema,
  annotationTypeSchema,
  severityLevelSchema,
  comparisonTypeSchema,
  jsonStringSchema,
  scoreSchema,
  paginationSchema
} from './common.schema';
import { AnalysisType } from '../types/api.types';

// ============================================================================
// Clinical Analysis Schema
// ============================================================================

const frequencySpectrumSchema = z.object({
  frequencies: z.array(z.number()),
  power: z.array(z.number()),
  peaks: z.array(z.object({
    frequency: z.number(),
    power: z.number()
  }))
});

const romMeasurementsSchema = z.object({
  wrist: z.object({
    flexion: z.number().optional(),
    extension: z.number().optional(),
    radialDeviation: z.number().optional(),
    ulnarDeviation: z.number().optional()
  }).optional(),
  fingers: z.record(z.object({
    flexion: z.number().optional(),
    extension: z.number().optional()
  })).optional()
});

const severityScoresSchema = z.object({
  UPDRS: z.number().optional(),
  ARAT: z.number().optional(),
  customScale: z.number().optional()
});

export const createAnalysisSchema = z.object({
  params: z.object({
    recordingId: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    analysisVersion: z.string().default('1.0'),
    analysisType: analysisTypeSchema.default(AnalysisType.COMPREHENSIVE),

    // Tremor metrics
    tremorFrequency: z.number().optional(),
    tremorAmplitude: z.number().optional(),
    tremorRegularity: scoreSchema.optional(),
    dominantFrequency: z.number().optional(),
    frequencySpectrum: z.union([
      frequencySpectrumSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),

    // Smoothness metrics
    sparc: z.number().optional(),
    ldljv: z.number().optional(),
    normalizedJerk: z.number().optional(),

    // ROM measurements
    romMeasurements: z.union([
      romMeasurementsSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),

    // Asymmetry analysis
    asymmetryIndex: scoreSchema.optional(),
    asymmetryDetails: jsonStringSchema.optional(),

    // Coordination scores
    coordinationScore: z.number().min(0).max(100).optional(),
    reactionTime: z.number().positive().optional(),
    movementAccuracy: scoreSchema.optional(),

    // Severity scoring
    severityScores: z.union([
      severityScoresSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),

    // Overall assessment
    overallScore: z.number().min(0).max(100).optional(),
    clinicalSummary: z.string().max(5000).optional(),

    // Quality
    confidence: scoreSchema.default(0),
    qualityFlags: z.union([
      z.array(z.string()),
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional()
  })
});

export type CreateAnalysisInput = {
  params: z.infer<typeof createAnalysisSchema>['params'];
  body: z.infer<typeof createAnalysisSchema>['body'];
};

// ============================================================================
// Update Analysis Schema
// ============================================================================

export const updateAnalysisSchema = z.object({
  params: z.object({
    analysisId: z.string().uuid('Invalid analysis ID')
  }),
  body: createAnalysisSchema.shape.body.partial()
});

export type UpdateAnalysisInput = {
  params: z.infer<typeof updateAnalysisSchema>['params'];
  body: z.infer<typeof updateAnalysisSchema>['body'];
};

// ============================================================================
// Get Analysis Schema
// ============================================================================

export const getAnalysisSchema = z.object({
  params: z.object({
    recordingId: z.string().uuid('Invalid recording ID')
  })
});

export type GetAnalysisInput = z.infer<typeof getAnalysisSchema>['params'];

// ============================================================================
// Clinical Annotation Schema
// ============================================================================

export const createAnnotationSchema = z.object({
  params: z.object({
    recordingId: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    annotationType: annotationTypeSchema,
    content: z.string().min(1, 'Annotation content is required').max(5000),
    severity: severityLevelSchema.optional(),
    timestampStart: z.number().nonnegative().optional(),
    timestampEnd: z.number().nonnegative().optional()
  }).refine(
    (data) => {
      if (data.timestampStart !== undefined && data.timestampEnd !== undefined) {
        return data.timestampStart <= data.timestampEnd;
      }
      return true;
    },
    {
      message: 'Start timestamp must be before or equal to end timestamp'
    }
  )
});

export type CreateAnnotationInput = {
  params: z.infer<typeof createAnnotationSchema>['params'];
  body: z.infer<typeof createAnnotationSchema>['body'];
};

// ============================================================================
// Update Annotation Schema
// ============================================================================

export const updateAnnotationSchema = z.object({
  params: z.object({
    annotationId: z.string().uuid('Invalid annotation ID')
  }),
  body: z.object({
    content: z.string().min(1).max(5000).optional(),
    severity: severityLevelSchema.optional(),
    isResolved: z.boolean().optional()
  }).strict()
});

export type UpdateAnnotationInput = {
  params: z.infer<typeof updateAnnotationSchema>['params'];
  body: z.infer<typeof updateAnnotationSchema>['body'];
};

// ============================================================================
// List Annotations Schema
// ============================================================================

export const listAnnotationsSchema = z.object({
  params: z.object({
    recordingId: z.string().uuid('Invalid recording ID')
  }),
  query: paginationSchema.extend({
    annotationType: annotationTypeSchema.optional(),
    severity: severityLevelSchema.optional(),
    isResolved: z.coerce.boolean().optional()
  })
});

export type ListAnnotationsInput = {
  params: z.infer<typeof listAnnotationsSchema>['params'];
  query: z.infer<typeof listAnnotationsSchema>['query'];
};

// ============================================================================
// Recording Comparison Schema
// ============================================================================

const metricDifferenceSchema = z.record(
  z.object({
    baseline: z.number(),
    compared: z.number(),
    change: z.number(),
    changePercent: z.number()
  })
);

export const createComparisonSchema = z.object({
  body: z.object({
    baselineRecordingId: z.string().uuid('Invalid baseline recording ID'),
    comparedRecordingId: z.string().uuid('Invalid compared recording ID'),
    comparisonType: comparisonTypeSchema,
    metricDifferences: z.union([
      metricDifferenceSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)),
    overallChange: z.enum(['improved', 'stable', 'declined']).optional(),
    changeScore: z.number().min(-100).max(100).optional(),
    statisticalTests: jsonStringSchema.optional(),
    clinicalNotes: z.string().max(5000).optional()
  })
});

export type CreateComparisonInput = z.infer<typeof createComparisonSchema>['body'];

// ============================================================================
// Get Comparison Schema
// ============================================================================

export const getComparisonSchema = z.object({
  params: z.object({
    comparisonId: z.string().uuid('Invalid comparison ID')
  })
});

export type GetComparisonInput = z.infer<typeof getComparisonSchema>['params'];

// ============================================================================
// List Comparisons Schema
// ============================================================================

export const listComparisonsSchema = z.object({
  query: paginationSchema.extend({
    recordingId: z.string().uuid().optional(),
    comparisonType: comparisonTypeSchema.optional()
  })
});

export type ListComparisonsInput = z.infer<typeof listComparisonsSchema>['query'];
