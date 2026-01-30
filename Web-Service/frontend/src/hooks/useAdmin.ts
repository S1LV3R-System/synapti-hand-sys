import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService, type CreateApiKeyRequest } from '../services';
import type {
  UserFilters,
  AuditLogFilters,
  UpdateUserRoleInput
} from '../types/api.types';
import type {
  ApproveUserRequest,
  RejectUserRequest,
  RequestMoreInfoRequest,
  AddAdminNoteRequest,
} from '../types/admin.types';
import { message } from 'antd';

// Query keys
export const adminKeys = {
  all: ['admin'] as const,
  stats: () => [...adminKeys.all, 'stats'] as const,
  users: () => [...adminKeys.all, 'users'] as const,
  usersList: (filters?: UserFilters) => [...adminKeys.users(), 'list', filters] as const,
  user: (id: string) => [...adminKeys.users(), id] as const,
  usersPending: (filters?: UserFilters) => [...adminKeys.users(), 'pending', filters] as const,
  userNotes: (userId: string) => [...adminKeys.users(), userId, 'notes'] as const,
  userApiKeys: (userId: string) => [...adminKeys.users(), userId, 'api-keys'] as const,
  auditLogs: () => [...adminKeys.all, 'audit-logs'] as const,
  auditLogsList: (filters?: AuditLogFilters) => [...adminKeys.auditLogs(), 'list', filters] as const,
  auditLog: (id: string) => [...adminKeys.auditLogs(), id] as const,
  apiKeys: () => [...adminKeys.all, 'api-keys'] as const,
  apiKeysList: (filters?: { userId?: string; isActive?: boolean }) => [...adminKeys.apiKeys(), 'list', filters] as const,
};

// ============================================================================
// Stats Hooks
// ============================================================================

/**
 * Hook to get admin statistics
 */
export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => adminService.getStats(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// ============================================================================
// User Management Hooks
// ============================================================================

/**
 * Hook to list users with filters
 */
export function useUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: adminKeys.usersList(filters),
    queryFn: () => adminService.listUsers(filters),
  });
}

/**
 * Hook to get single user
 */
export function useUser(id: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => adminService.getUser(id),
    enabled: enabled && !!id,
  });
}

/**
 * Hook to update user role
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserRoleInput }) =>
      adminService.updateUserRole(id, data),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(adminKeys.user(updatedUser.id), updatedUser);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
  });
}

/**
 * Hook to activate user
 */
export function useActivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminService.activateUser(id),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(adminKeys.user(updatedUser.id), updatedUser);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
  });
}

/**
 * Hook to deactivate user
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminService.deactivateUser(id),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(adminKeys.user(updatedUser.id), updatedUser);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
  });
}

/**
 * Hook to delete user
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, permanent = false }: { id: string; permanent?: boolean }) =>
      adminService.deleteUser(id, permanent),
    onSuccess: (_, { id }) => {
      message.success('User deleted successfully');
      queryClient.removeQueries({ queryKey: adminKeys.user(id) });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to delete user');
    },
  });
}

// ============================================================================
// Audit Log Hooks
// ============================================================================

/**
 * Hook to list audit logs with filters
 */
export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: adminKeys.auditLogsList(filters),
    queryFn: () => adminService.listAuditLogs(filters),
  });
}

/**
 * Hook to get single audit log
 */
export function useAuditLog(id: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.auditLog(id),
    queryFn: () => adminService.getAuditLog(id),
    enabled: enabled && !!id,
  });
}

/**
 * Hook to export audit logs
 */
export function useExportAuditLogs() {
  return useMutation({
    mutationFn: (filters?: AuditLogFilters) => adminService.exportAuditLogs(filters),
    onSuccess: (blob) => {
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
}

// ============================================================================
// User Approval Workflow Hooks
// ============================================================================

/**
 * Hook to get pending users awaiting approval
 */
export function usePendingUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: adminKeys.usersPending(filters),
    queryFn: () => adminService.getPendingUsers(filters),
    staleTime: 1000 * 30, // 30 seconds - fresh data for approvals
  });
}

/**
 * Hook to approve a pending user
 */
export function useApproveUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, request }: { userId: string; request: ApproveUserRequest }) =>
      adminService.approveUser(userId, request),
    onSuccess: (data) => {
      message.success(`User ${data.email} approved successfully`);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to approve user');
    },
  });
}

/**
 * Hook to reject a pending user
 */
export function useRejectUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, request }: { userId: string; request: RejectUserRequest }) =>
      adminService.rejectUser(userId, request),
    onSuccess: (data) => {
      message.success(`User ${data.email} rejected`);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to reject user');
    },
  });
}

/**
 * Hook to request more information from a pending user
 */
export function useRequestMoreInfo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, request }: { userId: string; request: RequestMoreInfoRequest }) =>
      adminService.requestMoreInfo(userId, request),
    onSuccess: (_, variables) => {
      message.success('Information request sent to user');
      queryClient.invalidateQueries({ queryKey: adminKeys.userNotes(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.user(variables.userId) });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to request information');
    },
  });
}

/**
 * Hook to get all notes for a user
 */
export function useUserNotes(userId: string, includeInternal = true) {
  return useQuery({
    queryKey: adminKeys.userNotes(userId),
    queryFn: () => adminService.getUserNotes(userId, includeInternal),
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
}

/**
 * Hook to add an admin note to a user
 */
export function useAddAdminNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, request }: { userId: string; request: AddAdminNoteRequest }) =>
      adminService.addAdminNote(userId, request),
    onSuccess: (_, variables) => {
      message.success('Note added successfully');
      queryClient.invalidateQueries({ queryKey: adminKeys.userNotes(variables.userId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.user(variables.userId) });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to add note');
    },
  });
}

/**
 * Hook to toggle user active status
 */
export function useToggleUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => adminService.toggleUserStatus(userId),
    onSuccess: (data, userId) => {
      message.success(`User ${data.isActive ? 'activated' : 'deactivated'} successfully`);
      queryClient.setQueryData(adminKeys.user(userId), data);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to update user status');
    },
  });
}

/**
 * Hook to set user account expiration date
 */
export function useSetAccountExpiration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, expiresAt }: { userId: string; expiresAt: string | null }) =>
      adminService.setAccountExpiration(userId, expiresAt),
    onSuccess: (data, variables) => {
      const expMsg = variables.expiresAt
        ? `Account will expire on ${new Date(variables.expiresAt).toLocaleDateString()}`
        : 'Account expiration removed';
      message.success(expMsg);
      queryClient.setQueryData(adminKeys.user(variables.userId), data);
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to set account expiration');
    },
  });
}

// ============================================================================
// API Key Management Hooks
// ============================================================================

/**
 * Hook to get all API keys (admin view)
 */
export function useAllApiKeys(filters?: { userId?: string; isActive?: boolean }) {
  return useQuery({
    queryKey: adminKeys.apiKeysList(filters),
    queryFn: () => adminService.getAllApiKeys(filters),
  });
}

/**
 * Hook to get API keys for a specific user
 */
export function useUserApiKeys(userId: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.userApiKeys(userId),
    queryFn: () => adminService.getUserApiKeys(userId),
    enabled: enabled && !!userId,
  });
}

/**
 * Hook to create a new API key
 */
export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateApiKeyRequest) => adminService.createApiKey(request),
    onSuccess: (data, variables) => {
      message.success(`API key "${data.name}" created successfully`);
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
      queryClient.invalidateQueries({ queryKey: adminKeys.userApiKeys(variables.userId) });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to create API key');
    },
  });
}

/**
 * Hook to revoke an API key
 */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => adminService.revokeApiKey(keyId),
    onSuccess: (data) => {
      message.success('API key revoked successfully');
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
      queryClient.invalidateQueries({ queryKey: adminKeys.userApiKeys(data.userId) });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to revoke API key');
    },
  });
}

/**
 * Hook to delete an API key permanently
 */
export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (keyId: string) => adminService.deleteApiKey(keyId),
    onSuccess: () => {
      message.success('API key deleted permanently');
      queryClient.invalidateQueries({ queryKey: adminKeys.apiKeys() });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to delete API key');
    },
  });
}
