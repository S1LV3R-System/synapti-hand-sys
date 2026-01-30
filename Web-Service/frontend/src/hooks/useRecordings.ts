import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recordingsService } from '../services';
import type {
  RecordingFilters,
  CreateRecordingInput,
  UpdateRecordingInput,
  UpdateRecordingStatusInput,
  UpdateReviewStatusInput,
  VideoUploadMetadata
} from '../types/api.types';

// Query keys
export const recordingKeys = {
  all: ['recordings'] as const,
  lists: () => [...recordingKeys.all, 'list'] as const,
  list: (filters?: RecordingFilters) => [...recordingKeys.lists(), filters] as const,
  details: () => [...recordingKeys.all, 'detail'] as const,
  detail: (id: string) => [...recordingKeys.details(), id] as const,
  status: (id: string) => [...recordingKeys.all, 'status', id] as const,
  videoUrl: (id: string) => [...recordingKeys.all, 'video-url', id] as const,
};

/**
 * Hook to list recordings with filters
 */
export function useRecordings(filters?: RecordingFilters) {
  return useQuery({
    queryKey: recordingKeys.list(filters),
    queryFn: () => recordingsService.listRecordings(filters),
  });
}

/**
 * Hook to get single recording
 */
export function useRecording(
  id: string,
  options?: {
    includeAnalysis?: boolean;
    includeAnnotations?: boolean;
    includeProcessing?: boolean;
  },
  enabled = true
) {
  return useQuery({
    queryKey: recordingKeys.detail(id),
    queryFn: () => recordingsService.getRecording(id),
    enabled: enabled && !!id,
  });
}

/**
 * Hook to poll recording status (for processing updates)
 */
export function useRecordingStatus(id: string, enabled = true) {
  return useQuery({
    queryKey: recordingKeys.status(id),
    queryFn: () => recordingsService.getStatus(id),
    enabled: enabled && !!id,
    refetchInterval: (query) => {
      // Poll every 5 seconds if processing
      const data = query.state.data;
      if (data?.status === 'processing' || data?.status === 'uploaded') {
        return 5000;
      }
      // Stop polling if completed or failed
      return false;
    },
  });
}

/**
 * Hook to get video playback URL
 */
export function useVideoUrl(id: string, enabled = true) {
  return useQuery({
    queryKey: recordingKeys.videoUrl(id),
    queryFn: () => recordingsService.getVideoUrl(id),
    enabled: enabled && !!id,
    staleTime: 1000 * 60 * 50, // 50 minutes (URLs expire after 1 hour)
  });
}

/**
 * Hook to create recording
 */
export function useCreateRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRecordingInput) => recordingsService.createRecording(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to update recording
 */
export function useUpdateRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecordingInput }) =>
      recordingsService.updateRecording(id, data),
    onSuccess: (updatedRecording) => {
      queryClient.setQueryData(recordingKeys.detail(updatedRecording.id), updatedRecording);
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to update recording status
 */
export function useUpdateRecordingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateRecordingStatusInput }) =>
      recordingsService.updateStatus(id, data),
    onSuccess: (updatedRecording) => {
      queryClient.setQueryData(recordingKeys.detail(updatedRecording.id), updatedRecording);
      queryClient.setQueryData(recordingKeys.status(updatedRecording.id), updatedRecording);
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to update review status
 * @deprecated Review status not tracked in new schema
 */
export function useUpdateReviewStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateReviewStatusInput }) =>
      recordingsService.updateStatus(id, data as any),
    onSuccess: (updatedRecording: any) => {
      if (updatedRecording?.id) {
        queryClient.setQueryData(recordingKeys.detail(updatedRecording.id), updatedRecording);
      }
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to delete recording (soft delete - permanently deleted after 30 days)
 */
export function useDeleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      recordingsService.deleteRecording(id),
    onSuccess: (_, variables) => {
      queryClient.removeQueries({ queryKey: recordingKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}

/**
 * Hook to upload video with progress tracking
 */
export function useUploadVideo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      metadata,
      onProgress,
    }: {
      file: File;
      metadata: VideoUploadMetadata;
      onProgress?: (progress: number) => void;
    }) => {
      // Step 1: Get signed URL and create recording
      const { signedUrl, recordingId } = await recordingsService.getUploadUrl(metadata);

      // Step 2: Upload file to GCS
      await recordingsService.uploadVideo(file, signedUrl, onProgress);

      // Step 3: Complete upload and start processing
      const recording = await recordingsService.completeUpload(recordingId);

      return { recording, recordingId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordingKeys.lists() });
    },
  });
}
