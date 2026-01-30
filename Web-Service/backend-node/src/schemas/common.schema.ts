import { z } from 'zod';
import {
  USER_ROLES,
  RECORDING_STATUSES,
  REVIEW_STATUSES,
  ANNOTATION_TYPES,
  SEVERITY_LEVELS,
  ANALYSIS_TYPES,
  COMPARISON_TYPES
} from '../types/api.types';

// ============================================================================
// Common Validation Patterns
// ============================================================================

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const emailSchema = z.string().email('Invalid email address');

export const dateSchema = z.string().datetime('Invalid ISO 8601 datetime');

export const positiveIntSchema = z.number().int().positive('Must be a positive integer');

export const nonNegativeIntSchema = z.number().int().nonnegative('Must be a non-negative integer');

export const percentageSchema = z.number().min(0).max(100, 'Percentage must be between 0 and 100');

export const scoreSchema = z.number().min(0).max(1, 'Score must be between 0 and 1');

// ============================================================================
// Pagination Schema
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export type PaginationInput = z.infer<typeof paginationSchema>;

// ============================================================================
// ID Parameter Schemas
// ============================================================================

export const idParamSchema = z.object({
  id: uuidSchema
});

export type IdParam = z.infer<typeof idParamSchema>;

// ============================================================================
// Date Range Schema
// ============================================================================

export const dateRangeSchema = z.object({
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional()
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  {
    message: 'Start date must be before or equal to end date'
  }
);

// ============================================================================
// Enum Schemas
// ============================================================================

export const userRoleSchema = z.enum(USER_ROLES);

export const recordingStatusSchema = z.enum(RECORDING_STATUSES);

export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

export const annotationTypeSchema = z.enum(ANNOTATION_TYPES);

export const severityLevelSchema = z.enum(SEVERITY_LEVELS);

export const analysisTypeSchema = z.enum(ANALYSIS_TYPES);

export const comparisonTypeSchema = z.enum(COMPARISON_TYPES);

// ============================================================================
// JSON Schema Validators
// ============================================================================

export const jsonStringSchema = z.string().refine(
  (val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'Must be a valid JSON string'
  }
);

export const jsonObjectSchema = z.record(z.any());

// ============================================================================
// Search Schema
// ============================================================================

export const searchSchema = z.object({
  search: z.string().max(100).optional().transform(val => val === '' ? undefined : val)
});

// ============================================================================
// Soft Delete Schema
// ============================================================================

export const softDeleteSchema = z.object({
  includeDeleted: z.coerce.boolean().default(false)
});
