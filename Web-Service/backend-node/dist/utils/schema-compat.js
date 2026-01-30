"use strict";
/**
 * Schema Compatibility Layer
 *
 * This file provides stub implementations for models that were removed in the
 * Supabase schema migration. These stubs allow the backend to compile while
 * the full migration is completed.
 *
 * Removed Models:
 * - ClinicalAnalysis (now stored in GCS via analysis_path)
 * - SignalProcessingResult (now stored in GCS via analyzed_xlsx_path)
 * - LSTMEventDetection (removed - not needed in new architecture)
 * - AdminNote (removed)
 * - ProjectMember (replaced by project_members UUID array)
 * - ApiKey (removed - use Supabase Auth)
 * - Session (removed - use Supabase Auth sessions)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionStub = exports.apiKeyStub = exports.projectMemberStub = exports.adminNoteStub = exports.lstmEventDetectionStub = exports.signalProcessingResultStub = exports.clinicalAnalysisStub = void 0;
exports.extendPrismaWithStubs = extendPrismaWithStubs;
// Stub for removed ClinicalAnalysis model
exports.clinicalAnalysisStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    findUnique: async (_args) => null,
    create: async (_args) => {
        console.warn('ClinicalAnalysis.create called - model removed, data should be stored in GCS');
        return { id: 'stub', recordingId: _args?.data?.recordingId || '' };
    },
    update: async (_args) => {
        console.warn('ClinicalAnalysis.update called - model removed');
        return { id: _args?.where?.id || 'stub' };
    },
    delete: async (_args) => {
        console.warn('ClinicalAnalysis.delete called - model removed');
        return { id: _args?.where?.id || 'stub' };
    },
    deleteMany: async (_args) => {
        console.warn('ClinicalAnalysis.deleteMany called - model removed');
        return { count: 0 };
    },
    count: async (_args) => 0,
};
// Stub for removed SignalProcessingResult model
exports.signalProcessingResultStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    findUnique: async (_args) => null,
    create: async (_args) => {
        console.warn('SignalProcessingResult.create called - model removed, data should be stored in GCS');
        return { id: 'stub', recordingId: _args?.data?.recordingId || '' };
    },
    update: async (_args) => {
        console.warn('SignalProcessingResult.update called - model removed');
        return { id: _args?.where?.id || 'stub' };
    },
    delete: async (_args) => {
        console.warn('SignalProcessingResult.delete called - model removed');
        return { id: _args?.where?.id || 'stub' };
    },
    deleteMany: async (_args) => {
        console.warn('SignalProcessingResult.deleteMany called - model removed');
        return { count: 0 };
    },
    count: async (_args) => 0,
    aggregate: async (_args) => ({ _avg: { processingTime: null } }),
};
// Stub for removed LSTMEventDetection model
exports.lstmEventDetectionStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    create: async (_args) => {
        console.warn('LSTMEventDetection.create called - model removed');
        return { id: 'stub' };
    },
    deleteMany: async (_args) => ({ count: 0 }),
};
// Stub for removed AdminNote model
exports.adminNoteStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    create: async (_args) => {
        console.warn('AdminNote.create called - model removed');
        return { id: 'stub', content: _args?.data?.content || '', noteType: 'general', createdAt: new Date() };
    },
    update: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    delete: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    deleteMany: async (_args) => ({ count: 0 }),
    count: async (_args) => 0,
};
// Stub for removed ProjectMember model (now use project_members UUID array)
exports.projectMemberStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    findUnique: async (_args) => null,
    create: async (_args) => {
        console.warn('ProjectMember.create called - use Project.projectMembers array instead');
        return { id: 'stub', userId: _args?.data?.userId || '', projectId: _args?.data?.projectId || '' };
    },
    update: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    delete: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    deleteMany: async (_args) => {
        console.warn('ProjectMember.deleteMany called - use Project.projectMembers array instead');
        return { count: 0 };
    },
    count: async (_args) => 0,
};
// Stub for removed ApiKey model (use Supabase Auth instead)
exports.apiKeyStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    findUnique: async (_args) => null,
    create: async (_args) => {
        console.warn('ApiKey.create called - use Supabase Auth for API keys');
        return {
            id: 'stub',
            name: _args?.data?.name || 'stub',
            keyHash: 'stub',
            keyPrefix: 'hp_',
            permissions: 'read',
            isActive: true,
            createdAt: new Date()
        };
    },
    update: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    updateMany: async (_args) => ({ count: 0 }),
    delete: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    deleteMany: async (_args) => ({ count: 0 }),
    count: async (_args) => 0,
};
// Stub for removed Session model (use Supabase Auth sessions instead)
exports.sessionStub = {
    findFirst: async (_args) => null,
    findMany: async (_args) => [],
    findUnique: async (_args) => null,
    create: async (_args) => {
        console.warn('Session.create called - use Supabase Auth for sessions');
        return { id: 'stub', userId: _args?.data?.userId || '' };
    },
    update: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    delete: async (_args) => ({ id: _args?.where?.id || 'stub' }),
    deleteMany: async (_args) => {
        console.warn('Session.deleteMany called - use Supabase Auth for session management');
        return { count: 0 };
    },
    count: async (_args) => 0,
};
/**
 * Extended Prisma client with stub models for compatibility
 */
function extendPrismaWithStubs(prisma) {
    // Use Proxy to properly forward all Prisma client methods including $queryRaw, $executeRaw, etc.
    // Object spread doesn't copy prototype methods, so we need a Proxy approach
    return new Proxy(prisma, {
        get(target, prop) {
            // Override with stubs for removed models
            switch (prop) {
                case 'clinicalAnalysis':
                    return exports.clinicalAnalysisStub;
                case 'signalProcessingResult':
                    return exports.signalProcessingResultStub;
                case 'lSTMEventDetection':
                    return exports.lstmEventDetectionStub;
                case 'adminNote':
                    return exports.adminNoteStub;
                case 'projectMember':
                    return exports.projectMemberStub;
                case 'apiKey':
                    return exports.apiKeyStub;
                case 'session':
                    return exports.sessionStub;
                default:
                    // Forward all other properties/methods to original Prisma client
                    const value = target[prop];
                    // Bind methods to preserve 'this' context
                    if (typeof value === 'function') {
                        return value.bind(target);
                    }
                    return value;
            }
        }
    });
}
