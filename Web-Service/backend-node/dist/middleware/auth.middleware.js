"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = exports.authMiddleware = void 0;
exports.hasRole = hasRole;
exports.isAdmin = isAdmin;
exports.isClinician = isClinician;
exports.isResearcher = isResearcher;
const jwt_1 = require("../utils/jwt");
const supabase_1 = require("../lib/supabase");
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
const basePrisma = new client_1.PrismaClient();
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
const authMiddleware = async (req, res, next) => {
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
        let payload = await (0, supabase_1.verifySupabaseToken)(token);
        // Fall back to legacy JWT verification if Supabase fails
        if (!payload) {
            try {
                payload = (0, jwt_1.verifyToken)(token);
            }
            catch {
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
            role: (payload.role || user.userType || '').toLowerCase(), // Normalize to lowercase for UserRole enum matching
            userType: user.userType,
        };
        next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }
};
exports.authMiddleware = authMiddleware;
const adminMiddleware = async (req, res, next) => {
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
exports.adminMiddleware = adminMiddleware;
/**
 * Helper to check if user has a specific role
 * Handles both old (lowercase) and new (PascalCase) role values
 */
function hasRole(user, targetRole) {
    if (!user)
        return false;
    const role = user.role || user.userType;
    return role?.toLowerCase() === targetRole.toLowerCase();
}
/**
 * Helper to check if user is admin
 */
function isAdmin(user) {
    return hasRole(user, 'admin');
}
/**
 * Helper to check if user is clinician
 */
function isClinician(user) {
    return hasRole(user, 'clinician');
}
/**
 * Helper to check if user is researcher
 */
function isResearcher(user) {
    return hasRole(user, 'researcher');
}
