import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

// ============================================================================
// Validation Middleware Factory
// ============================================================================

/**
 * Create validation middleware from Zod schema
 */
export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });

      // Replace request data with validated data
      req.body = validated.body || req.body;
      req.query = validated.query || req.query;
      req.params = validated.params || req.params;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          error: {
            code: 'VALIDATION_ERROR',
            details: error.errors.map((err) => ({
              path: err.path.join('.'),
              message: err.message
            }))
          }
        });
      }

      next(error);
    }
  };
};

// ============================================================================
// Query Parameter Helpers
// ============================================================================

/**
 * Parse pagination parameters
 */
export function parsePagination(query: any) {
  return {
    page: Math.max(1, parseInt(query.page) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit) || 20)),
    sortBy: query.sortBy || 'createdAt',
    sortOrder: (query.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
  };
}

/**
 * Build Prisma skip/take from pagination
 */
export function buildPaginationQuery(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit
  };
}

/**
 * Build pagination metadata
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  };
}

// ============================================================================
// Filter Builders
// ============================================================================

/**
 * Build search filter for multiple fields
 */
export function buildSearchFilter(search: string | undefined, fields: string[]) {
  if (!search || search.trim().length === 0) {
    return {};
  }

  return {
    OR: fields.map((field) => ({
      [field]: {
        contains: search.trim(),
        mode: 'insensitive'
      }
    }))
  };
}

/**
 * Build date range filter
 */
export function buildDateRangeFilter(
  field: string,
  startDate?: string,
  endDate?: string
) {
  const filter: any = {};

  if (startDate || endDate) {
    filter[field] = {};

    if (startDate) {
      filter[field].gte = new Date(startDate);
    }

    if (endDate) {
      filter[field].lte = new Date(endDate);
    }
  }

  return filter;
}

/**
 * Build soft delete filter
 */
export function buildSoftDeleteFilter(includeDeleted: boolean = false) {
  if (includeDeleted) {
    return {};
  }

  return {
    deletedAt: null
  };
}
