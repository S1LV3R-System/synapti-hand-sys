import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { protocolsService } from '../services';
import type {
  ProtocolFilters,
  CreateProtocolInput,
  UpdateProtocolInput
} from '../types/api.types';

// Query keys
export const protocolKeys = {
  all: ['protocols'] as const,
  lists: () => [...protocolKeys.all, 'list'] as const,
  list: (filters?: ProtocolFilters) => [...protocolKeys.lists(), filters] as const,
  details: () => [...protocolKeys.all, 'detail'] as const,
  detail: (id: string) => [...protocolKeys.details(), id] as const,
};

/**
 * Hook to list protocols with filters
 */
export function useProtocols(filters?: ProtocolFilters) {
  return useQuery({
    queryKey: protocolKeys.list(filters),
    queryFn: () => protocolsService.listProtocols(filters),
  });
}

/**
 * Hook to get single protocol
 */
export function useProtocol(id: string, enabled = true) {
  return useQuery({
    queryKey: protocolKeys.detail(id),
    queryFn: () => protocolsService.getProtocol(id),
    enabled: enabled && !!id,
  });
}

/**
 * Hook to create protocol
 */
export function useCreateProtocol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProtocolInput) => protocolsService.createProtocol(data),
    onSuccess: () => {
      // Invalidate protocols list
      queryClient.invalidateQueries({ queryKey: protocolKeys.lists() });
    },
  });
}

/**
 * Hook to update protocol
 */
export function useUpdateProtocol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProtocolInput }) =>
      protocolsService.updateProtocol(id, data),
    onSuccess: (updatedProtocol) => {
      // Update the specific protocol in cache
      queryClient.setQueryData(protocolKeys.detail(updatedProtocol.id), updatedProtocol);
      // Invalidate lists to reflect changes
      queryClient.invalidateQueries({ queryKey: protocolKeys.lists() });
    },
  });
}

/**
 * Hook to delete protocol
 */
export function useDeleteProtocol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; hard?: boolean }) =>
      protocolsService.deleteProtocol(id),
    onSuccess: (_, variables) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: protocolKeys.detail(variables.id) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: protocolKeys.lists() });
    },
  });
}
