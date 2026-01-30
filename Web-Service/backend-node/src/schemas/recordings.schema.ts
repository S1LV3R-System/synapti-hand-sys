import { z } from 'zod';
import {
  paginationSchema,
  searchSchema,
  softDeleteSchema,
  dateRangeSchema,
  recordingStatusSchema,
  reviewStatusSchema,
  jsonStringSchema
} from './common.schema';
import { RecordingStatus } from '../types/api.types';

// ============================================================================
// Device Info Schema
// ============================================================================

const deviceInfoSchema = z.object({
  deviceType: z.string(),
  model: z.string().optional(),
  resolution: z.string().optional(),
  frameRate: z.number().optional()
});

// ============================================================================
// Processing Metadata Schema
// ============================================================================

const processingMetadataSchema = z.object({
  uploadedAt: z.string().datetime().optional(),
  processedAt: z.string().datetime().optional(),
  errorDetails: z.string().optional(),
  processingDuration: z.number().optional()
});

// ============================================================================
// Create Recording Session Schema
// ============================================================================

export const createRecordingSchema = z.object({
  body: z.object({
    patientUserId: z.string().uuid('Invalid patient ID'),
    clinicianId: z.string().uuid('Invalid clinician ID').optional(),
    protocolId: z.string().uuid('Invalid protocol ID').optional(),
    recordingDate: z.string().datetime().default(() => new Date().toISOString()),
    duration: z.number().int().positive().optional(),
    fps: z.number().int().positive().optional(),
    deviceInfo: z.union([
      deviceInfoSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
    videoPath: z.string().max(500).optional(),
    csvPath: z.string().max(500).optional(),
    clinicalNotes: z.string().max(5000).optional(),
    status: recordingStatusSchema.default(RecordingStatus.UPLOADED)
  })
});

export type CreateRecordingInput = z.infer<typeof createRecordingSchema>['body'];

// ============================================================================
// Update Recording Session Schema
// ============================================================================

export const updateRecordingSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    protocolId: z.string().uuid('Invalid protocol ID').optional(),
    duration: z.number().int().positive().optional(),
    fps: z.number().int().positive().optional(),
    deviceInfo: z.union([
      deviceInfoSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional(),
    videoPath: z.string().max(500).optional(),
    csvPath: z.string().max(500).optional(),
    clinicalNotes: z.string().max(5000).optional()
  }).strict()
});

export type UpdateRecordingInput = {
  params: z.infer<typeof updateRecordingSchema>['params'];
  body: z.infer<typeof updateRecordingSchema>['body'];
};

// ============================================================================
// Update Recording Status Schema
// ============================================================================

export const updateRecordingStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    status: recordingStatusSchema,
    processingMetadata: z.union([
      processingMetadataSchema,
      jsonStringSchema
    ]).transform((val) => typeof val === 'string' ? val : JSON.stringify(val)).optional()
  })
});

export type UpdateRecordingStatusInput = {
  params: z.infer<typeof updateRecordingStatusSchema>['params'];
  body: z.infer<typeof updateRecordingStatusSchema>['body'];
};

// ============================================================================
// Update Review Status Schema
// ============================================================================

export const updateReviewStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    reviewStatus: reviewStatusSchema,
    reviewNotes: z.string().max(2000).optional()
  })
});

export type UpdateReviewStatusInput = {
  params: z.infer<typeof updateReviewStatusSchema>['params'];
  body: z.infer<typeof updateReviewStatusSchema>['body'];
};

// ============================================================================
// List Recordings Schema
// ============================================================================

export const listRecordingsSchema = z.object({
  query: paginationSchema
    .extend({
      patientUserId: z.string().uuid().optional(),
      clinicianId: z.string().uuid().optional(),
      protocolId: z.string().uuid().optional(),
      status: recordingStatusSchema.optional(),
      reviewStatus: reviewStatusSchema.optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional()
    })
    .merge(searchSchema)
    .merge(softDeleteSchema)
});

export type ListRecordingsInput = z.infer<typeof listRecordingsSchema>['query'];

// ============================================================================
// Get Recording Schema
// ============================================================================

export const getRecordingSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid recording ID')
  }),
  query: z.object({
    includeAnalysis: z.coerce.boolean().default(false),
    includeAnnotations: z.coerce.boolean().default(false),
    includeProcessing: z.coerce.boolean().default(false)
  }).optional()
});

export type GetRecordingInput = {
  params: z.infer<typeof getRecordingSchema>['params'];
  query?: z.infer<typeof getRecordingSchema>['query'];
};

// ============================================================================
// Delete Recording Schema
// ============================================================================

export const deleteRecordingSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid recording ID')
  }),
  body: z.object({
    hard: z.boolean().default(false)
  }).optional()
});

export type DeleteRecordingInput = {
  params: z.infer<typeof deleteRecordingSchema>['params'];
  body?: z.infer<typeof deleteRecordingSchema>['body'];
};
