import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitationService, type ProjectInvitation, type SentInvitation } from '../services';

/**
 * Hook to fetch pending invitations for current user
 */
export const useMyInvitations = () => {
  return useQuery<ProjectInvitation[], Error>({
    queryKey: ['invitations', 'me'],
    queryFn: () => invitationService.getMyInvitations(),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true
  });
};

/**
 * Hook to fetch invitations for a specific project
 */
export const useProjectInvitations = (projectId: string) => {
  return useQuery<SentInvitation[], Error>({
    queryKey: ['invitations', 'project', projectId],
    queryFn: () => invitationService.getProjectInvitations(projectId),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2
  });
};

/**
 * Hook to send a project invitation
 */
export const useSendInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, email, role }: { projectId: string; email: string; role?: string }) =>
      invitationService.sendInvitation(projectId, email, role),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invitations', 'project', variables.projectId] });
    }
  });
};

/**
 * Hook to accept an invitation
 */
export const useAcceptInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => invitationService.acceptInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'stats'] });
    }
  });
};

/**
 * Hook to reject an invitation
 */
export const useRejectInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => invitationService.rejectInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', 'me'] });
    }
  });
};

/**
 * Hook to cancel an invitation
 */
export const useCancelInvitation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => invitationService.cancelInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    }
  });
};
