"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.softDeleteSchema = exports.searchSchema = exports.jsonObjectSchema = exports.jsonStringSchema = exports.comparisonTypeSchema = exports.analysisTypeSchema = exports.severityLevelSchema = exports.annotationTypeSchema = exports.reviewStatusSchema = exports.recordingStatusSchema = exports.userRoleSchema = exports.dateRangeSchema = exports.idParamSchema = exports.paginationSchema = exports.scoreSchema = exports.percentageSchema = exports.nonNegativeIntSchema = exports.positiveIntSchema = exports.dateSchema = exports.emailSchema = exports.uuidSchema = void 0;
const zod_1 = require("zod");
const api_types_1 = require("../types/api.types");
// ============================================================================
// Common Validation Patterns
// ============================================================================
exports.uuidSchema = zod_1.z.string().uuid('Invalid UUID format');
exports.emailSchema = zod_1.z.string().email('Invalid email address');
exports.dateSchema = zod_1.z.string().datetime('Invalid ISO 8601 datetime');
exports.positiveIntSchema = zod_1.z.number().int().positive('Must be a positive integer');
exports.nonNegativeIntSchema = zod_1.z.number().int().nonnegative('Must be a non-negative integer');
exports.percentageSchema = zod_1.z.number().min(0).max(100, 'Percentage must be between 0 and 100');
exports.scoreSchema = zod_1.z.number().min(0).max(1, 'Score must be between 0 and 1');
// ============================================================================
// Pagination Schema
// ============================================================================
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    sortBy: zod_1.z.string().optional(),
    sortOrder: zod_1.z.enum(['asc', 'desc']).default('desc')
});
// ============================================================================
// ID Parameter Schemas
// ============================================================================
exports.idParamSchema = zod_1.z.object({
    id: exports.uuidSchema
});
// ============================================================================
// Date Range Schema
// ============================================================================
exports.dateRangeSchema = zod_1.z.object({
    startDate: exports.dateSchema.optional(),
    endDate: exports.dateSchema.optional()
}).refine((data) => {
    if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
}, {
    message: 'Start date must be before or equal to end date'
});
// ============================================================================
// Enum Schemas
// ============================================================================
exports.userRoleSchema = zod_1.z.enum(api_types_1.USER_ROLES);
exports.recordingStatusSchema = zod_1.z.enum(api_types_1.RECORDING_STATUSES);
exports.reviewStatusSchema = zod_1.z.enum(api_types_1.REVIEW_STATUSES);
exports.annotationTypeSchema = zod_1.z.enum(api_types_1.ANNOTATION_TYPES);
exports.severityLevelSchema = zod_1.z.enum(api_types_1.SEVERITY_LEVELS);
exports.analysisTypeSchema = zod_1.z.enum(api_types_1.ANALYSIS_TYPES);
exports.comparisonTypeSchema = zod_1.z.enum(api_types_1.COMPARISON_TYPES);
// ============================================================================
// JSON Schema Validators
// ============================================================================
exports.jsonStringSchema = zod_1.z.string().refine((val) => {
    try {
        JSON.parse(val);
        return true;
    }
    catch {
        return false;
    }
}, {
    message: 'Must be a valid JSON string'
});
exports.jsonObjectSchema = zod_1.z.record(zod_1.z.any());
// ============================================================================
// Search Schema
// ============================================================================
exports.searchSchema = zod_1.z.object({
    search: zod_1.z.string().max(100).optional().transform(val => val === '' ? undefined : val)
});
// ============================================================================
// Soft Delete Schema
// ============================================================================
exports.softDeleteSchema = zod_1.z.object({
    includeDeleted: zod_1.z.coerce.boolean().default(false)
});
