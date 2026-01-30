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

// Stub for removed ClinicalAnalysis model
export const clinicalAnalysisStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  findUnique: async (_args?: any) => null,
  create: async (_args?: any) => {
    console.warn('ClinicalAnalysis.create called - model removed, data should be stored in GCS');
    return { id: 'stub', recordingId: _args?.data?.recordingId || '' };
  },
  update: async (_args?: any) => {
    console.warn('ClinicalAnalysis.update called - model removed');
    return { id: _args?.where?.id || 'stub' };
  },
  delete: async (_args?: any) => {
    console.warn('ClinicalAnalysis.delete called - model removed');
    return { id: _args?.where?.id || 'stub' };
  },
  deleteMany: async (_args?: any) => {
    console.warn('ClinicalAnalysis.deleteMany called - model removed');
    return { count: 0 };
  },
  count: async (_args?: any) => 0,
};

// Stub for removed SignalProcessingResult model
export const signalProcessingResultStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  findUnique: async (_args?: any) => null,
  create: async (_args?: any) => {
    console.warn('SignalProcessingResult.create called - model removed, data should be stored in GCS');
    return { id: 'stub', recordingId: _args?.data?.recordingId || '' };
  },
  update: async (_args?: any) => {
    console.warn('SignalProcessingResult.update called - model removed');
    return { id: _args?.where?.id || 'stub' };
  },
  delete: async (_args?: any) => {
    console.warn('SignalProcessingResult.delete called - model removed');
    return { id: _args?.where?.id || 'stub' };
  },
  deleteMany: async (_args?: any) => {
    console.warn('SignalProcessingResult.deleteMany called - model removed');
    return { count: 0 };
  },
  count: async (_args?: any) => 0,
  aggregate: async (_args?: any) => ({ _avg: { processingTime: null } }),
};

// Stub for removed LSTMEventDetection model
export const lstmEventDetectionStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  create: async (_args?: any) => {
    console.warn('LSTMEventDetection.create called - model removed');
    return { id: 'stub' };
  },
  deleteMany: async (_args?: any) => ({ count: 0 }),
};

// Stub for removed AdminNote model
export const adminNoteStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  create: async (_args?: any) => {
    console.warn('AdminNote.create called - model removed');
    return { id: 'stub', content: _args?.data?.content || '', noteType: 'general', createdAt: new Date() };
  },
  update: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  delete: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  deleteMany: async (_args?: any) => ({ count: 0 }),
  count: async (_args?: any) => 0,
};

// Stub for removed ProjectMember model (now use project_members UUID array)
export const projectMemberStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  findUnique: async (_args?: any) => null,
  create: async (_args?: any) => {
    console.warn('ProjectMember.create called - use Project.projectMembers array instead');
    return { id: 'stub', userId: _args?.data?.userId || '', projectId: _args?.data?.projectId || '' };
  },
  update: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  delete: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  deleteMany: async (_args?: any) => {
    console.warn('ProjectMember.deleteMany called - use Project.projectMembers array instead');
    return { count: 0 };
  },
  count: async (_args?: any) => 0,
};

// Stub for removed ApiKey model (use Supabase Auth instead)
export const apiKeyStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  findUnique: async (_args?: any) => null,
  create: async (_args?: any) => {
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
  update: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  updateMany: async (_args?: any) => ({ count: 0 }),
  delete: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  deleteMany: async (_args?: any) => ({ count: 0 }),
  count: async (_args?: any) => 0,
};

// Stub for removed Session model (use Supabase Auth sessions instead)
export const sessionStub = {
  findFirst: async (_args?: any) => null,
  findMany: async (_args?: any) => [],
  findUnique: async (_args?: any) => null,
  create: async (_args?: any) => {
    console.warn('Session.create called - use Supabase Auth for sessions');
    return { id: 'stub', userId: _args?.data?.userId || '' };
  },
  update: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  delete: async (_args?: any) => ({ id: _args?.where?.id || 'stub' }),
  deleteMany: async (_args?: any) => {
    console.warn('Session.deleteMany called - use Supabase Auth for session management');
    return { count: 0 };
  },
  count: async (_args?: any) => 0,
};

/**
 * Extended Prisma client with stub models for compatibility
 */
export function extendPrismaWithStubs(prisma: any) {
  // Use Proxy to properly forward all Prisma client methods including $queryRaw, $executeRaw, etc.
  // Object spread doesn't copy prototype methods, so we need a Proxy approach
  return new Proxy(prisma, {
    get(target, prop) {
      // Override with stubs for removed models
      switch (prop) {
        case 'clinicalAnalysis':
          return clinicalAnalysisStub;
        case 'signalProcessingResult':
          return signalProcessingResultStub;
        case 'lSTMEventDetection':
          return lstmEventDetectionStub;
        case 'adminNote':
          return adminNoteStub;
        case 'projectMember':
          return projectMemberStub;
        case 'apiKey':
          return apiKeyStub;
        case 'session':
          return sessionStub;
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
