import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';
import type { LoginCredentials, RegisterData } from '../types/api.types';

// Query keys
export const authKeys = {
  currentUser: ['auth', 'current-user'] as const,
};

/**
 * Hook to get current authenticated user
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: () => authService.getCurrentUser(),
    enabled: authService.isAuthenticated(),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}

/**
 * Hook to login
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      // Set the current user in cache
      queryClient.setQueryData(authKeys.currentUser, data.user);
    },
  });
}

/**
 * Hook to register
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onSuccess: (data) => {
      // Set the current user in cache
      queryClient.setQueryData(authKeys.currentUser, data.user);
    },
  });
}

/**
 * Hook to logout
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      // Clear all queries
      queryClient.clear();
    },
  });
}
