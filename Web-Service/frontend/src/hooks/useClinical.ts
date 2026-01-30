import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalService } from '../services';
import { recordingKeys } from './useRecordings';
import type {
  CreateAnalysisInput,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  CreateComparisonInput,
  AnnotationType,
  SeverityLevel
} from '../types/api.types';

// Query keys
export const clinicalKeys = {
  all: ['clinical'] as const,
  analyses: () => [...clinicalKeys.all, 'analysis'] as const,
  analysis: (recordingId: string) => [...clinicalKeys.analyses(), recordingId] as const,
  annotations: () => [...clinicalKeys.all, 'annotations'] as const,
  annotationsList: (recordingId: string, filters?: any) =>
    [...clinicalKeys.annotations(), recordingId, filters] as const,
  comparisons: () => [...clinicalKeys.all, 'comparisons'] as const,
  comparisonsList: (filters?: any) => [...clinicalKeys.comparisons(), 'list', filters] as const,
  comparison: (id: string) => [...clinicalKeys.comparisons(), id] as const,
};

// ============================================================================
// Analysis Hooks
// ============================================================================

/**
 * Hook to get clinical analysis for a recording
 */
export function useAnalysis(recordingId: string, enabled = true) {
  return useQuery({
    queryKey: clinicalKeys.analysis(recordingId),
    queryFn: () => clinicalService.getAnalysis(recordingId),
    enabled: enabled && !!recordingId,
  });
}

/**
 * Hook to create clinical analysis
 */
export function useCreateAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordingId, data }: { recordingId: string; data: CreateAnalysisInput }) =>
      clinicalService.createAnalysis(recordingId, data),
    onSuccess: (_, variables) => {
      // Update analysis cache
      queryClient.invalidateQueries({ queryKey: clinicalKeys.analysis(variables.recordingId) });
      // Update recording cache (status might change to 'analyzed')
      queryClient.invalidateQueries({ queryKey: recordingKeys.detail(variables.recordingId) });
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to update clinical analysis
 */
export function useUpdateAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ analysisId, data }: { analysisId: string; data: Partial<CreateAnalysisInput> }) =>
      clinicalService.updateAnalysis(analysisId, data),
    onSuccess: (updatedAnalysis: any) => {
      // Update analysis cache
      if (updatedAnalysis?.recordingId) {
        queryClient.setQueryData(
          clinicalKeys.analysis(updatedAnalysis.recordingId),
          updatedAnalysis
        );
      }
    },
  });
}

// ============================================================================
// Annotation Hooks
// ============================================================================

/**
 * Hook to list annotations for a recording
 */
export function useAnnotations(
  recordingId: string,
  filters?: {
    page?: number;
    limit?: number;
    annotationType?: AnnotationType;
    severity?: SeverityLevel;
    isResolved?: boolean;
  },
  enabled = true
) {
  return useQuery({
    queryKey: clinicalKeys.annotationsList(recordingId, filters),
    queryFn: () => clinicalService.listAnnotations(recordingId, filters),
    enabled: enabled && !!recordingId,
  });
}

/**
 * Hook to create annotation
 */
export function useCreateAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordingId, data }: { recordingId: string; data: CreateAnnotationInput }) =>
      clinicalService.createAnnotation(recordingId, data),
    onSuccess: () => {
      // Invalidate annotations list
      queryClient.invalidateQueries({
        queryKey: clinicalKeys.annotations(),
      });
    },
  });
}

/**
 * Hook to update annotation
 */
export function useUpdateAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ annotationId, data }: { annotationId: string; data: UpdateAnnotationInput }) =>
      clinicalService.updateAnnotation(annotationId, data),
    onSuccess: () => {
      // Invalidate annotations for this recording
      queryClient.invalidateQueries({
        queryKey: clinicalKeys.annotations(),
      });
    },
  });
}

/**
 * Hook to delete annotation
 */
export function useDeleteAnnotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (annotationId: string) => clinicalService.deleteAnnotation(annotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicalKeys.annotations() });
    },
  });
}

// ============================================================================
// Comparison Hooks
// ============================================================================

/**
 * Hook to list comparisons
 */
export function useComparisons(filters?: {
  page?: number;
  limit?: number;
  recordingId?: string;
  comparisonType?: string;
}) {
  return useQuery({
    queryKey: clinicalKeys.comparisonsList(filters),
    queryFn: () => clinicalService.listComparisons(filters),
  });
}

/**
 * Hook to get single comparison
 */
export function useComparison(comparisonId: string, enabled = true) {
  return useQuery({
    queryKey: clinicalKeys.comparison(comparisonId),
    queryFn: () => clinicalService.getComparison(comparisonId),
    enabled: enabled && !!comparisonId,
  });
}

/**
 * Hook to create comparison
 */
export function useCreateComparison() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateComparisonInput) => clinicalService.createComparison(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicalKeys.comparisons() });
    },
  });
}

/**
 * Hook to delete comparison
 */
export function useDeleteComparison() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (comparisonId: string) => clinicalService.deleteComparison(comparisonId),
    onSuccess: (_, comparisonId) => {
      queryClient.removeQueries({ queryKey: clinicalKeys.comparison(comparisonId) });
      queryClient.invalidateQueries({ queryKey: clinicalKeys.comparisons() });
    },
  });
}

// ============================================================================
// Protocol-Based Movement Analysis Hooks
// ============================================================================

/**
 * Hook to trigger protocol-based movement analysis
 */
export function useAnalyzeWithProtocol() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recordingId, options }: { 
      recordingId: string; 
      options?: { forceReanalyze?: boolean } 
    }) => clinicalService.analyzeWithProtocol(recordingId, options),
    onSuccess: (_, variables) => {
      // Invalidate analysis cache for this recording
      queryClient.invalidateQueries({ 
        queryKey: clinicalKeys.analysis(variables.recordingId) 
      });
      // Invalidate movement analysis cache
      queryClient.invalidateQueries({ 
        queryKey: [...clinicalKeys.all, 'movement-analysis', variables.recordingId] 
      });
      // Update recording status
      queryClient.invalidateQueries({ 
        queryKey: recordingKeys.detail(variables.recordingId) 
      });
    },
  });
}

/**
 * Hook to get movement-specific analysis results
 */
export function useMovementAnalysis(recordingId: string, enabled = true) {
  return useQuery({
    queryKey: [...clinicalKeys.all, 'movement-analysis', recordingId],
    queryFn: () => clinicalService.getMovementAnalysisResults(recordingId),
    enabled: enabled && !!recordingId,
  });
}
