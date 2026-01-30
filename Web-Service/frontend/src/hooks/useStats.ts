import { useQuery } from '@tanstack/react-query';
import { statsService, type UserStats, type DiagnosisComparisonResponse } from '../services';

/**
 * Hook to fetch user dashboard statistics
 */
export const useUserStats = () => {
  return useQuery<UserStats, Error>({
    queryKey: ['user', 'stats'],
    queryFn: () => statsService.getUserStats(),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true
  });
};

/**
 * Hook to fetch diagnosis-based comparison data
 * @param diagnosis - Filter by specific diagnosis or 'all'
 */
export const useDiagnosisComparison = (diagnosis?: string) => {
  return useQuery<DiagnosisComparisonResponse, Error>({
    queryKey: ['stats', 'comparison', diagnosis],
    queryFn: () => statsService.getDiagnosisComparison(diagnosis),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: true
  });
};
