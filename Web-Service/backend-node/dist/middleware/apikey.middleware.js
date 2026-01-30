"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireApiKeyPermission = exports.flexibleAuthMiddleware = exports.apiKeyMiddleware = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
/**
 * Middleware to authenticate requests using API keys
 * API key should be provided in the X-API-Key header
 *
 * This middleware can be used as an alternative to JWT authentication
 * The API key identifies the user and their permissions
 */
const apiKeyMiddleware = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: 'No API key provided',
            });
        }
        // Validate API key format (should start with hp_)
        if (!apiKey.startsWith('hp_')) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key format',
            });
        }
        // Hash the provided key to compare with stored hash
        const keyHash = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
        // Find the API key in the database
        const apiKeyRecord = await prisma.apiKey.findUnique({
            where: { keyHash },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        isActive: true,
                        deletedAt: true,
                    },
                },
            },
        });
        if (!apiKeyRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid API key',
            });
        }
        // Check if API key is active
        if (!apiKeyRecord.isActive) {
            return res.status(401).json({
                success: false,
                message: 'API key has been revoked',
            });
        }
        // Check if API key is expired
        if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
            return res.status(401).json({
                success: false,
                message: 'API key has expired',
            });
        }
        // Check if user exists and is active
        if (!apiKeyRecord.user || !apiKeyRecord.user.isActive || apiKeyRecord.user.deletedAt) {
            return res.status(401).json({
                success: false,
                message: 'User associated with this API key is inactive or deleted',
            });
        }
        // Update usage statistics (async, don't wait)
        prisma.apiKey.update({
            where: { id: apiKeyRecord.id },
            data: {
                lastUsedAt: new Date(),
                usageCount: { increment: 1 },
            },
        }).catch(err => console.error('Failed to update API key usage:', err));
        // Set user context from API key
        req.user = {
            userId: apiKeyRecord.user.id,
            email: apiKeyRecord.user.email,
            role: apiKeyRecord.user.role,
        };
        // Attach API key info for permission checks
        req.apiKey = {
            id: apiKeyRecord.id,
            permissions: apiKeyRecord.permissions,
            name: apiKeyRecord.name,
        };
        next();
    }
    catch (error) {
        console.error('API key authentication error:', error);
        return res.status(401).json({
            success: false,
            message: 'API key authentication failed',
        });
    }
};
exports.apiKeyMiddleware = apiKeyMiddleware;
/**
 * Middleware that accepts either JWT or API key authentication
 * First checks for Bearer token, then falls back to X-API-Key header
 */
const flexibleAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    // If Bearer token is provided, use JWT authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
        // Import dynamically to avoid circular dependency
        const { authMiddleware } = await Promise.resolve().then(() => __importStar(require('./auth.middleware')));
        return authMiddleware(req, res, next);
    }
    // If API key is provided, use API key authentication
    if (apiKey) {
        return (0, exports.apiKeyMiddleware)(req, res, next);
    }
    // Neither authentication method provided
    return res.status(401).json({
        success: false,
        message: 'Authentication required. Provide Bearer token or X-API-Key header.',
    });
};
exports.flexibleAuthMiddleware = flexibleAuthMiddleware;
/**
 * Middleware to check API key permissions
 * Use after apiKeyMiddleware or flexibleAuthMiddleware
 */
const requireApiKeyPermission = (requiredPermission) => {
    return (req, res, next) => {
        const apiKeyInfo = req.apiKey;
        // If not authenticated via API key, skip permission check
        // (JWT users have full access based on their role)
        if (!apiKeyInfo) {
            return next();
        }
        const permissions = apiKeyInfo.permissions.split(',').map((p) => p.trim());
        // Permission hierarchy: admin > write > read
        const permissionLevel = {
            read: 1,
            write: 2,
            admin: 3,
        };
        const userMaxPermission = Math.max(...permissions.map((p) => permissionLevel[p] || 0));
        const requiredLevel = permissionLevel[requiredPermission];
        if (userMaxPermission < requiredLevel) {
            return res.status(403).json({
                success: false,
                message: `API key does not have '${requiredPermission}' permission`,
            });
        }
        next();
    };
};
exports.requireApiKeyPermission = requireApiKeyPermission;
