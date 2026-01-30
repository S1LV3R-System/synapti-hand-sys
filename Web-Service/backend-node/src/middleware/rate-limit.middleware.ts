/**
 * Rate Limiting Middleware
 * Simple in-memory rate limiter for API endpoints
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

/**
 * Create a rate limiter middleware
 * @param windowMs - Time window in milliseconds
 * @param maxRequests - Maximum number of requests per window
 */
function createRateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const now = Date.now();

    // Clean up expired entries
    if (store[key] && store[key].resetTime < now) {
      delete store[key];
    }

    // Initialize or increment counter
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      };
    } else {
      store[key].count++;
    }

    // Check rate limit
    if (store[key].count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later'
      });
    }

    next();
  };
}

// Auth endpoints rate limiter: 10 requests per 15 minutes
export const authRateLimiter = createRateLimiter(15 * 60 * 1000, 10);

// API rate limiter: 100 requests per minute
export const apiRateLimiter = createRateLimiter(60 * 1000, 100);

// Strict rate limiter for sensitive operations: 5 requests per hour
export const strictRateLimiter = createRateLimiter(60 * 60 * 1000, 5);
