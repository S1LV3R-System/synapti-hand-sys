import { Request, Response, NextFunction } from 'express';

// ============================================================================
// Rate Limiting Middleware (Simple Implementation)
// ============================================================================

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Simple rate limiter middleware
 * @param windowMs Time window in milliseconds
 * @param max Maximum number of requests per window
 * @param message Error message to return
 */
export const rateLimit = (
  windowMs: number,
  max: number,
  message: string = 'Too many requests, please try again later'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use IP address as identifier (could also use user ID if authenticated)
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${identifier}`;
    const now = Date.now();

    // Initialize or get existing record
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }

    // Increment count
    store[key].count++;

    // Check if limit exceeded
    if (store[key].count > max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        message,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: `${retryAfter} seconds`
        }
      });
    }

    next();
  };
};

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Strict rate limiter for authentication endpoints
 * 5 requests per 15 minutes
 */
export const authRateLimiter = rateLimit(
  15 * 60 * 1000, // 15 minutes
  5, // 5 requests
  'Too many authentication attempts, please try again in 15 minutes'
);

/**
 * Moderate rate limiter for general API endpoints
 * 100 requests per 15 minutes
 */
export const apiRateLimiter = rateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests
  'Too many API requests, please try again later'
);

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per hour
 */
export const sensitiveOperationLimiter = rateLimit(
  60 * 60 * 1000, // 1 hour
  10, // 10 requests
  'Too many sensitive operations, please try again later'
);

/**
 * Lenient rate limiter for file uploads
 * 50 uploads per hour
 */
export const uploadRateLimiter = rateLimit(
  60 * 60 * 1000, // 1 hour
  50, // 50 requests
  'Too many file uploads, please try again later'
);
