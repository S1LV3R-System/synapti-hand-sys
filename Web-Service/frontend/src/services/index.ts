/**
 * SynaptiHand Frontend Services - Unified Export
 *
 * CONSOLIDATED ARCHITECTURE (3 service files):
 * 1. api.service.ts           - Core axios client, interceptors, token management
 * 2. data.service.ts          - All Supabase data operations (projects, patients, protocols, sessions, clinical)
 * 3. admin.consolidated.service.ts - All admin operations (users, stats, system, invitations)
 *
 * Import from this file for cleaner imports:
 *   import { projectsService, patientsService, adminService } from '@/services';
 */

// ============================================================================
// CORE API (from api.service.ts)
// ============================================================================
export { apiClient, extractData, extractPagination, tokenManager, userStorage } from './api.service';

// ============================================================================
// AUTHENTICATION (from authService.ts)
// ============================================================================
export { authService } from './authService';

// ============================================================================
// DATA SERVICES (from data.service.ts - consolidated)
// ============================================================================
export {
  // Projects
  projectsService,
  // Patients
  patientsService,
  // Protocols
  protocolsService,
  // Sessions (new schema)
  sessionsService,
  // Recordings (legacy wrapper)
  recordingsService,
  // Clinical analysis
  clinicalService
} from './data.service';

// ============================================================================
// ADMIN & SYSTEM SERVICES (from admin.consolidated.service.ts)
// ============================================================================
export {
  // Admin operations
  adminService,
  // Dashboard statistics
  statsService,
  // System management
  systemService,
  // Project invitations
  invitationService,
  // Types
  type UserStats,
  type RecentRecording,
  type DiagnosisGroup,
  type MetricStats,
  type DiagnosisComparisonData,
  type DiagnosisComparisonResponse,
  type SoftDeletedStats,
  type CleanupPreview,
  type CleanupStats,
  type HardDeleteResponse,
  type ProjectInvitation,
  type SentInvitation,
  type ApiKey,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse
} from './admin.consolidated.service';

// ============================================================================
// TYPES RE-EXPORT
// ============================================================================
export type { ApiResponse, PaginationMeta } from '../types/api.types';
