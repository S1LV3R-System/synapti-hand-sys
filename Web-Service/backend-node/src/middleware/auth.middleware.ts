import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { verifySupabaseToken } from '../lib/supabase';
import prisma from '../lib/prisma';


export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;  // Maps to userType in new schema
    userType?: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7);

    // Try Supabase token verification first
    let payload = await verifySupabaseToken(token);

    // Fall back to legacy JWT verification if Supabase fails
    if (!payload) {
      try {
        payload = verifyToken(token);
      } catch {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }
    }

    // Verify user exists, is active, and not deleted
    // Using new schema fields: userType, approvalStatus, verificationStatus
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        userType: true,
        deletedAt: true,
        approvalStatus: true,
        verificationStatus: true,
      },
    });

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user is deleted (soft delete)
    if (user.deletedAt) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deleted',
      });
    }

    // Check if user is approved (approvalStatus in new schema)
    if (user.approvalStatus === false) {
      return res.status(401).json({
        success: false,
        message: 'Account registration was rejected',
      });
    }

    // Check if user is verified (verificationStatus in new schema)
    // Note: For now, allow unverified users since email verification isn't implemented
    // if (user.verificationStatus === false) {
    //   return res.status(401).json({
    //     success: false,
    //     message: 'Email not verified',
    //   });
    // }

    // Set user info with both old and new field names for compatibility
    req.user = {
      ...payload,
      role: (payload.role || user.userType || '').toLowerCase(),  // Normalize to lowercase for UserRole enum matching
      userType: user.userType,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const role = req.user?.role || req.user?.userType;
  // Accept both old lowercase 'admin' and new PascalCase 'Admin'
  if (role !== 'admin' && role !== 'Admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
    });
  }
  next();
};

/**
 * Helper to check if user has a specific role
 * Handles both old (lowercase) and new (PascalCase) role values
 */
export function hasRole(user: { role?: string; userType?: string } | undefined, targetRole: string): boolean {
  if (!user) return false;
  const role = user.role || user.userType;
  return role?.toLowerCase() === targetRole.toLowerCase();
}

/**
 * Helper to check if user is admin
 */
export function isAdmin(user: { role?: string; userType?: string } | undefined): boolean {
  return hasRole(user, 'admin');
}

/**
 * Helper to check if user is clinician
 */
export function isClinician(user: { role?: string; userType?: string } | undefined): boolean {
  return hasRole(user, 'clinician');
}

/**
 * Helper to check if user is researcher
 */
export function isResearcher(user: { role?: string; userType?: string } | undefined): boolean {
  return hasRole(user, 'researcher');
}
