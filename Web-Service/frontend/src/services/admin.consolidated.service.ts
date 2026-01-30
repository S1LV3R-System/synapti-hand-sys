/**
 * SynaptiHand - Consolidated Admin Service
 *
 * Combines all admin and system operations:
 * - Admin (users, roles, audit logs, API keys)
 * - Stats (dashboard statistics, diagnosis comparison)
 * - System (soft-delete management, cleanup)
 * - Invitations (project invitations)
 */

import { apiClient, extractData, extractPagination } from './api.service';
import type {
  AdminStats,
  User,
  UpdateUserRoleInput,
  UserFilters,
  AuditLog,
  AuditLogFilters,
  ApiResponse,
  PaginationMeta
} from '../types/api.types';
import type {
  PendingUser,
  AdminNote,
  ApproveUserRequest,
  RejectUserRequest,
  RequestMoreInfoRequest,
  AddAdminNoteRequest,
} from '../types/admin.types';

// ============================================================================
// TYPES
// ============================================================================

// Stats types
export interface UserStats {
  projects: number;
  patients: number;
  recordings: number;
  pendingAnalysis: number;
  recentRecordings: RecentRecording[];
  diagnosisGroups: DiagnosisGroup[];
}

export interface RecentRecording {
  id: string;
  status: string;
  createdAt: string;
  patient: { id: string; patientId: string; patientName: string; diagnosis: string | null } | null;
  project: { id: string; name: string } | null;
}

export interface DiagnosisGroup {
  diagnosis: string;
  count: number;
}

export interface MetricStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  count: number;
}

export interface DiagnosisComparisonData {
  diagnosis: string;
  patientCount: number;
  recordingCount: number;
  metrics: {
    tremorFrequency: MetricStats | null;
    tremorAmplitude: MetricStats | null;
    sparc: MetricStats | null;
  };
}

export interface DiagnosisComparisonResponse {
  comparison: DiagnosisComparisonData[];
  availableDiagnoses: string[];
  totalPatients: number;
  isAdminView: boolean;
}

// System types
export interface SoftDeletedStats {
  users: number;
  projects: number;
  patients: number;
  protocols: number;
  recordings: number;
  total: number;
}

export interface CleanupPreview {
  dryRun: boolean;
  fifteenDaysAgo: string;
  retentionDays?: number;
  cutoffDate?: Date;
  toDelete: {
    recordings: number;
    protocols: number;
    patients: number;
    projects: number;
    users: number;
    total: number;
  };
  message?: string;
}

export interface CleanupStats {
  protocols: number;
  patients: number;
  users: number;
  projects: number;
  recordings: number;
  total: number;
}

export interface HardDeleteResponse {
  success: boolean;
  message: string;
  data?: {
    deletedRecordings?: number;
    deletedProtocols?: number;
    deletedPatients?: number;
    deletedProjects?: number;
  };
}

// Invitation types
export interface ProjectInvitation {
  id: string;
  email?: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  project: { id: string; name: string; description?: string };
  invitedBy: { fullName: string; email: string };
}

export interface SentInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  invitedBy: { fullName: string; email: string };
}

// API Key types
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  permissions: string;
  lastUsedAt: string | null;
  usageCount: number;
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; fullName: string; role: string };
}

export interface CreateApiKeyRequest {
  userId: string;
  name: string;
  permissions?: 'read' | 'write' | 'admin';
  expiresAt?: string | null;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  permissions: string;
  expiresAt: string | null;
  createdAt: string;
}

// ============================================================================
// ADMIN SERVICE
// ============================================================================

export const adminService = {
  // --- System Statistics ---
  async getStats(): Promise<AdminStats> {
    const response = await apiClient.get<ApiResponse<AdminStats>>('/admin/stats');
    return extractData(response);
  },

  // --- User Management ---
  async listUsers(filters?: UserFilters): Promise<{ data: User[]; pagination?: PaginationMeta }> {
    const response = await apiClient.get<ApiResponse<User[]>>('/admin/users', { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async getUser(id: string): Promise<User> {
    const response = await apiClient.get<ApiResponse<User>>(`/admin/users/${id}`);
    return extractData(response);
  },

  async updateUserRole(id: string, data: UpdateUserRoleInput): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(`/admin/users/${id}/role`, data);
    return extractData(response);
  },

  async activateUser(id: string): Promise<User> {
    const response = await apiClient.post<ApiResponse<User>>(`/admin/users/${id}/activate`);
    return extractData(response);
  },

  async deactivateUser(id: string): Promise<User> {
    const response = await apiClient.post<ApiResponse<User>>(`/admin/users/${id}/deactivate`);
    return extractData(response);
  },

  async deleteUser(id: string, permanent = false): Promise<void> {
    await apiClient.delete(`/admin/users/${id}`, { params: { permanent } });
  },

  async toggleUserStatus(userId: string): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(`/admin/users/${userId}/status`);
    return extractData(response);
  },

  async setAccountExpiration(userId: string, expiresAt: string | null): Promise<User> {
    const response = await apiClient.patch<ApiResponse<User>>(`/admin/users/${userId}/expiration`, { accountExpiresAt: expiresAt });
    return extractData(response);
  },

  // --- User Approval Workflow ---
  async getPendingUsers(filters?: UserFilters): Promise<{ data: PendingUser[]; pagination?: PaginationMeta }> {
    const response = await apiClient.get<ApiResponse<PendingUser[]>>('/admin/users/pending', { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async approveUser(userId: string, request: ApproveUserRequest): Promise<User> {
    const response = await apiClient.post<ApiResponse<User>>(`/admin/users/${userId}/approve`, request);
    return extractData(response);
  },

  async rejectUser(userId: string, request: RejectUserRequest): Promise<User> {
    const response = await apiClient.post<ApiResponse<User>>(`/admin/users/${userId}/reject`, request);
    return extractData(response);
  },

  async requestMoreInfo(userId: string, request: RequestMoreInfoRequest): Promise<AdminNote> {
    const response = await apiClient.post<ApiResponse<AdminNote>>(`/admin/users/${userId}/request-info`, request);
    return extractData(response);
  },

  async addAdminNote(userId: string, request: AddAdminNoteRequest): Promise<AdminNote> {
    const response = await apiClient.post<ApiResponse<AdminNote>>(`/admin/users/${userId}/notes`, request);
    return extractData(response);
  },

  async getUserNotes(userId: string, includeInternal = true): Promise<AdminNote[]> {
    const response = await apiClient.get<ApiResponse<AdminNote[]>>(`/admin/users/${userId}/notes`, { params: { includeInternal } });
    return extractData(response);
  },

  // --- Audit Logs ---
  async listAuditLogs(filters?: AuditLogFilters): Promise<{ data: AuditLog[]; pagination?: PaginationMeta }> {
    const response = await apiClient.get<ApiResponse<AuditLog[]>>('/admin/audit-logs', { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async getAuditLog(id: string): Promise<AuditLog> {
    const response = await apiClient.get<ApiResponse<AuditLog>>(`/admin/audit-logs/${id}`);
    return extractData(response);
  },

  async exportAuditLogs(filters?: AuditLogFilters): Promise<Blob> {
    const response = await apiClient.get('/admin/audit-logs/export', { params: filters, responseType: 'blob' });
    return response.data;
  },

  getLogDetails(log: AuditLog): unknown {
    if (!log.details) return null;
    try { return JSON.parse(log.details); } catch { return null; }
  },

  // --- API Key Management ---
  async getAllApiKeys(filters?: { userId?: string; isActive?: boolean; page?: number; limit?: number }): Promise<{ data: ApiKey[]; pagination?: PaginationMeta }> {
    const response = await apiClient.get<ApiResponse<ApiKey[]>>('/admin/api-keys', { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    const response = await apiClient.post<ApiResponse<CreateApiKeyResponse>>('/admin/api-keys', request);
    return extractData(response);
  },

  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const response = await apiClient.get<ApiResponse<ApiKey[]>>(`/admin/users/${userId}/api-keys`);
    return extractData(response);
  },

  async revokeApiKey(keyId: string): Promise<ApiKey> {
    const response = await apiClient.patch<ApiResponse<ApiKey>>(`/admin/api-keys/${keyId}/revoke`);
    return extractData(response);
  },

  async deleteApiKey(keyId: string): Promise<void> {
    await apiClient.delete(`/admin/api-keys/${keyId}`);
  }
};

// ============================================================================
// STATS SERVICE
// ============================================================================

export const statsService = {
  async getUserStats(): Promise<UserStats> {
    const response = await apiClient.get<UserStats>('/stats');
    return response.data;
  },

  async getDiagnosisComparison(diagnosis?: string): Promise<DiagnosisComparisonResponse> {
    const params = diagnosis && diagnosis !== 'all' ? { diagnosis } : {};
    const response = await apiClient.get<DiagnosisComparisonResponse>('/stats/comparison', { params });
    return response.data;
  }
};

// ============================================================================
// SYSTEM SERVICE
// ============================================================================

export const systemService = {
  async getSoftDeletedStats(): Promise<SoftDeletedStats> {
    const response = await apiClient.get<ApiResponse<SoftDeletedStats>>('/system/soft-deleted/stats');
    return extractData(response);
  },

  async previewCleanup(): Promise<CleanupPreview> {
    const response = await apiClient.get<ApiResponse<CleanupPreview>>('/system/cleanup/preview');
    return extractData(response);
  },

  async runCleanup(): Promise<CleanupStats> {
    const response = await apiClient.post<ApiResponse<CleanupStats>>('/system/cleanup/run');
    return extractData(response);
  },

  async hardDeleteProtocol(id: string): Promise<HardDeleteResponse> {
    const response = await apiClient.delete<HardDeleteResponse>(`/system/protocols/${id}/hard-delete`);
    return response.data;
  },

  async hardDeletePatient(id: string): Promise<HardDeleteResponse> {
    const response = await apiClient.delete<HardDeleteResponse>(`/system/patients/${id}/hard-delete`);
    return response.data;
  },

  async hardDeleteUser(id: string): Promise<HardDeleteResponse> {
    const response = await apiClient.delete<HardDeleteResponse>(`/system/users/${id}/hard-delete`);
    return response.data;
  },

  async hardDeleteProject(id: string): Promise<HardDeleteResponse> {
    const response = await apiClient.delete<HardDeleteResponse>(`/system/projects/${id}/hard-delete`);
    return response.data;
  },

  async hardDeleteRecording(id: string): Promise<HardDeleteResponse> {
    const response = await apiClient.delete<HardDeleteResponse>(`/system/recordings/${id}/hard-delete`);
    return response.data;
  }
};

// ============================================================================
// INVITATION SERVICE
// ============================================================================

export const invitationService = {
  async getMyInvitations(): Promise<ProjectInvitation[]> {
    const response = await apiClient.get<ProjectInvitation[]>('/invitations/me');
    return response.data;
  },

  async sendInvitation(projectId: string, email: string, role: string = 'member'): Promise<{ message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(`/invitations/project/${projectId}`, { email, role });
    return { message: response.data.message };
  },

  async getProjectInvitations(projectId: string): Promise<SentInvitation[]> {
    const response = await apiClient.get<SentInvitation[]>(`/invitations/project/${projectId}`);
    return response.data;
  },

  async acceptInvitation(invitationId: string): Promise<{ projectId: string; projectName: string }> {
    const response = await apiClient.post<{ projectId: string; projectName: string }>(`/invitations/${invitationId}/accept`);
    return response.data;
  },

  async rejectInvitation(invitationId: string): Promise<void> {
    await apiClient.post(`/invitations/${invitationId}/reject`);
  },

  async cancelInvitation(invitationId: string): Promise<void> {
    await apiClient.delete(`/invitations/${invitationId}`);
  }
};
