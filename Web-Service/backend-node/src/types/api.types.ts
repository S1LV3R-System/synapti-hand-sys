// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: PaginationMeta;
  error?: ApiError;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  details?: any;
}

// ============================================================================
// Query Parameters
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ProtocolFilters extends PaginationParams {
  isPublic?: boolean;
  isActive?: boolean;
  createdById?: string;
  search?: string;
}

export interface RecordingFilters extends PaginationParams {
  patientId?: string;
  clinicianId?: string;
  protocolId?: string;
  status?: string;
  reviewStatus?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface UserFilters extends PaginationParams {
  role?: string;
  isActive?: boolean;
  search?: string;
}

// ============================================================================
// User Roles
// ============================================================================

export enum UserRole {
  PATIENT = 'patient',
  CLINICIAN = 'clinician',
  RESEARCHER = 'researcher',
  ADMIN = 'admin'
}

export const USER_ROLES = [
  UserRole.PATIENT,
  UserRole.CLINICIAN,
  UserRole.RESEARCHER,
  UserRole.ADMIN
] as const;

// ============================================================================
// Recording Status
// ============================================================================

export enum RecordingStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  ANALYZED = 'analyzed',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export const RECORDING_STATUSES = [
  RecordingStatus.UPLOADED,
  RecordingStatus.PROCESSING,
  RecordingStatus.PROCESSED,
  RecordingStatus.ANALYZED,
  RecordingStatus.COMPLETED,
  RecordingStatus.FAILED
] as const;

// ============================================================================
// Review Status
// ============================================================================

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  FLAGGED = 'flagged'
}

export const REVIEW_STATUSES = [
  ReviewStatus.PENDING,
  ReviewStatus.APPROVED,
  ReviewStatus.FLAGGED
] as const;

// ============================================================================
// Annotation Types
// ============================================================================

export enum AnnotationType {
  OBSERVATION = 'observation',
  DIAGNOSIS = 'diagnosis',
  RECOMMENDATION = 'recommendation',
  FLAG = 'flag'
}

export const ANNOTATION_TYPES = [
  AnnotationType.OBSERVATION,
  AnnotationType.DIAGNOSIS,
  AnnotationType.RECOMMENDATION,
  AnnotationType.FLAG
] as const;

// ============================================================================
// Severity Levels
// ============================================================================

export enum SeverityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export const SEVERITY_LEVELS = [
  SeverityLevel.LOW,
  SeverityLevel.MEDIUM,
  SeverityLevel.HIGH,
  SeverityLevel.CRITICAL
] as const;

// ============================================================================
// Analysis Types
// ============================================================================

export enum AnalysisType {
  COMPREHENSIVE = 'comprehensive',
  TREMOR_FOCUSED = 'tremor_focused',
  ROM_FOCUSED = 'rom_focused'
}

export const ANALYSIS_TYPES = [
  AnalysisType.COMPREHENSIVE,
  AnalysisType.TREMOR_FOCUSED,
  AnalysisType.ROM_FOCUSED
] as const;

// ============================================================================
// Comparison Types
// ============================================================================

export enum ComparisonType {
  LONGITUDINAL = 'longitudinal',
  BILATERAL = 'bilateral',
  TREATMENT_RESPONSE = 'treatment_response'
}

export const COMPARISON_TYPES = [
  ComparisonType.LONGITUDINAL,
  ComparisonType.BILATERAL,
  ComparisonType.TREATMENT_RESPONSE
] as const;
