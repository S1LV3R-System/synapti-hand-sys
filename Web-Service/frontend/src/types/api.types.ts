// ============================================================================
// SYNAPTIHAND API TYPES - Matches Supabase Final-schema.sql
// ============================================================================
// Architecture: Database stores metadata + GCS paths, ALL data in GCS
// Tables: User-Main, Patient-Table, Project-Table, Protocol-Table, Experiment-Session
// ============================================================================

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
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
  details?: unknown;
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

export interface SessionFilters extends PaginationParams {
  patientId?: string;
  clinicianId?: string;
  protocolId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  status?: string;  // Legacy filter - status not in new schema but kept for compatibility
  reviewStatus?: string;  // Legacy filter
}

export interface UserFilters extends PaginationParams {
  userType?: UserType;
  verificationStatus?: boolean;
  approvalStatus?: boolean | null;
  search?: string;
}

export interface PatientFilters extends PaginationParams {
  projectId?: string;
  diagnosis?: string;
  creatorId?: string;
  search?: string;
}

export interface ProjectFilters extends PaginationParams {
  creatorId?: string;
  search?: string;
}

export interface ProtocolFilters extends PaginationParams {
  creatorId?: string;
  linkedProject?: string;
  isPrivate?: boolean;
  search?: string;
  // Legacy compatibility
  isActive?: boolean;
  isPublic?: boolean;
}

// ============================================================================
// Enum Types (matches Supabase schema)
// ============================================================================

// User type (from User-Main table)
export const UserType = {
  ADMIN: 'Admin',
  CLINICIAN: 'Clinician',
  RESEARCHER: 'Researcher'
} as const;

export type UserType = typeof UserType[keyof typeof UserType];

// Legacy alias for backward compatibility
export const UserRole = UserType;
export type UserRole = UserType;

// ============================================================================
// User Types (User-Main table)
// ============================================================================

export interface User {
  id: string;                          // User_ID uuid
  authUserId?: string;                 // Links to Supabase Auth (if used)
  email: string;                       // email - unique
  userType: UserType;                  // user_type - default 'Clinician'
  firstName: string;                   // first_name
  middleName?: string | null;          // middle__name (note double underscore in schema)
  lastName: string;                    // last_name
  fullName?: string | null;            // computed: first + middle + last
  birthDate: string;                   // birth_date
  phoneNumber: string;                 // phone_number - unique
  institute: string;                   // Institute
  department: string;                  // Department
  verificationStatus: boolean;         // Verification_status - default false
  approvalStatus: boolean;             // Approval_status - default false
  passwordHash?: string;               // passwordHash (not exposed to frontend)
  // Timestamps
  createdAt: string;                   // created_at
  deletedAt?: string | null;           // deleted_at
  approvedAt?: string | null;          // Approved_at
  rejectedAt?: string | null;          // Rejected_at
  verifiedAt?: string | null;          // Verified_at
  // Extended fields from backend (optional)
  lastLogin?: string | null;
  organization?: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  rejectionReason?: string | null;
  registrationIp?: string | null;
  registrationDevice?: string | null;
  accountExpiresAt?: string | null;
  // Legacy compatibility
  role?: UserType;
  isActive?: boolean;
  isApproved?: boolean | null;
  hospital?: string | null;
  licenseNumber?: string | null;
  licenseState?: string | null;
  specialty?: string | null;
  updatedAt?: string;
}

export interface RegisterUserInput {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  phoneNumber: string;
  institute: string;
  department: string;
  userType?: UserType;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

// ============================================================================
// Project Types (Project-Table)
// ============================================================================

export interface ProjectDataPath {
  base_path?: string;
  exports_path?: string;
  [key: string]: string | undefined;
}

export interface Project {
  id: string;                          // project_id uuid
  projectName: string;                 // project_name
  projectDescription?: string | null;  // project_description
  projectCreatorId: string;            // project_creator uuid
  projectCreator?: User;               // Relation to User-Main
  projectMembers: string[];            // project_members uuid[]
  projectDataPath: ProjectDataPath;    // project-data_path json
  createdAt: string;                   // created_at
  deletedAt?: string | null;           // deleted_at
  // Computed/included fields
  patientsCount?: number;
  // Legacy compatibility
  name?: string;
  description?: string | null;
  owner?: User;
  ownerId?: string;
  members?: string[];
}

export interface CreateProjectInput {
  projectName: string;
  projectDescription?: string;
  projectDataPath?: ProjectDataPath;
  // Legacy compatibility
  name?: string;
  description?: string;
}

export interface UpdateProjectInput {
  projectName?: string;
  projectDescription?: string;
  projectDataPath?: ProjectDataPath;
  projectMembers?: string[];
  // Legacy compatibility
  name?: string;
  description?: string;
}

// ============================================================================
// Patient Types (Patient-Table)
// ============================================================================

export interface Patient {
  id: number;                          // id bigint (auto-increment)
  projectId: string;                   // project_id uuid
  project?: Project;                   // Relation to Project-Table
  creatorId: string;                   // creator_id uuid
  creator?: User;                      // Relation to User-Main
  patientId: string;                   // patient_id varchar (MRN/study ID)
  firstName: string;                   // first_name
  middleName?: string | null;          // middle_name
  lastName: string;                    // last_name
  fullName?: string;                   // Computed: first + middle + last
  birthDate: string;                   // birth_date
  height: number;                      // height numeric
  weight: number;                      // weight numeric
  diagnosis?: string | null;           // diagnosis - default 'Healthy'
  createdAt: string;                   // created_at
  deletedAt?: string | null;           // deleted_at
  // Computed fields
  sessionsCount?: number;
  // Legacy compatibility
  patientName?: string;
  dateOfBirth?: string | null;
  createdById?: string;
  createdBy?: User;
  gender?: string | null;
  diagnosisDate?: string | null;
  diagnosisNotes?: string | null;
  medicalHistory?: string | null;
  notes?: string | null;
  updatedAt?: string;
  mrn?: string;  // Alias for patientId (Medical Record Number)
}

export interface CreatePatientInput {
  projectId: string;
  patientId: string;                   // MRN/study ID
  firstName: string;
  middleName?: string;
  lastName: string;
  birthDate: string;
  height: number;
  weight: number;
  diagnosis?: string;
  // Legacy compatibility
  patientName?: string;
  dateOfBirth?: string;
}

export interface UpdatePatientInput {
  patientId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  birthDate?: string;
  height?: number;
  weight?: number;
  diagnosis?: string;
  // Legacy compatibility
  patientName?: string;
  dateOfBirth?: string;
}

// ============================================================================
// Protocol Types (Protocol-Table)
// ============================================================================

export interface ProtocolMovement {
  name: string;
  duration?: number;
  repetitions?: number;
  instructions?: string;
  [key: string]: unknown;
}

export interface Protocol {
  id: string;                          // id uuid
  protocolName: string;                // protocol_name
  protocolDescription?: string | null; // protocol_description
  creatorId: string;                   // creator uuid
  creator?: User;                      // Relation to User-Main
  linkedProjectId?: string | null;     // linked_project uuid
  linkedProject?: Project;             // Relation to Project-Table
  protocolInformation: ProtocolMovement[]; // protocol_information array
  isPrivate: boolean;                  // private - default true
  createdAt: string;                   // created_at
  // Extended protocol metadata
  version?: string;                    // Protocol version (e.g., "1.0")
  indicatedFor?: string | null;        // Clinical indications
  contraindications?: string | null;   // Clinical contraindications
  isActive?: boolean;                  // Whether protocol is active
  // Clinical guidelines
  patientInstructions?: string | null; // Instructions for patients
  instructions?: string | null;        // Alias for patientInstructions
  clinicalGuidelines?: string | null;  // Guidelines for clinicians
  overallRepetitions?: number;         // Overall repetitions count
  // Analysis configuration
  analysisOutputs?: AnalysisOutputsConfiguration | null; // Which analysis outputs to generate
  // Legacy compatibility
  name?: string;
  description?: string | null;
  configuration?: ProtocolConfiguration | string;
  isPublic?: boolean;
  createdById?: string;
  createdBy?: User;
  updatedAt?: string;
  deletedAt?: string;
}

// Analysis outputs configuration type
export interface AnalysisOutputsConfiguration {
  handAperture?: { enabled: boolean; fingerPair?: string; hand?: string };
  cyclogram3D?: { enabled: boolean; fingertip?: string; hand?: string };
  trajectory3D?: { enabled: boolean; fingertip?: string; hand?: string };
  romPlot?: { enabled: boolean; plotType?: string; measurement?: string; fingers?: Record<string, boolean>; hand?: string };
  tremorSpectrogram?: { enabled: boolean; hand?: string };
  openingClosingVelocity?: { enabled: boolean; hand?: string };
  cycleFrequency?: { enabled: boolean; hand?: string };
  cycleVariability?: { enabled: boolean; hand?: string };
  interFingerCoordination?: { enabled: boolean; finger1?: string; finger2?: string; hand?: string };
  cycleSymmetry?: { enabled: boolean };
  geometricCurvature?: { enabled: boolean; hand?: string };
}

// Protocol configuration for legacy compatibility
export interface ProtocolConfiguration {
  movements?: ProtocolMovement[];
  instructions?: string;
  clinicalGuidelines?: string;
  overallRepetitions?: number;
  requiredMetrics?: string[];
  analysisOutputs?: AnalysisOutputsConfiguration;
}

export interface CreateProtocolInput {
  protocolName: string;
  protocolDescription?: string;
  linkedProjectId?: string;
  protocolInformation: ProtocolMovement[];
  isPrivate?: boolean;
  // Extended protocol metadata
  version?: string;
  indicatedFor?: string;
  contraindications?: string;
  isActive?: boolean;
  // Clinical guidelines
  patientInstructions?: string;
  instructions?: string;
  clinicalGuidelines?: string;
  overallRepetitions?: number;
  // Analysis configuration
  analysisOutputs?: AnalysisOutputsConfiguration;
  // Legacy compatibility
  name?: string;
  description?: string;
  configuration?: string | ProtocolConfiguration;
  isPublic?: boolean;
}

export interface UpdateProtocolInput {
  protocolName?: string;
  protocolDescription?: string;
  linkedProjectId?: string;
  protocolInformation?: ProtocolMovement[];
  isPrivate?: boolean;
  // Extended protocol metadata
  version?: string;
  indicatedFor?: string;
  contraindications?: string;
  isActive?: boolean;
  // Clinical guidelines
  patientInstructions?: string;
  instructions?: string;
  clinicalGuidelines?: string;
  overallRepetitions?: number;
  // Analysis configuration
  analysisOutputs?: AnalysisOutputsConfiguration;
  // Legacy compatibility
  name?: string;
  description?: string;
  configuration?: string | ProtocolConfiguration;
  isPublic?: boolean;
}

// ============================================================================
// Experiment Session Types (Experiment-Session table)
// ============================================================================

export interface ExperimentSession {
  sessionId: string;                   // session_id uuid
  clinicianId: string;                 // Clinician uuid
  clinician?: User;                    // Relation to User-Main
  patientId: number;                   // Patient bigint
  patient?: Patient;                   // Relation to Patient-Table
  protocolId: string;                  // Protocol uuid
  protocol?: Protocol;                 // Relation to Protocol-Table
  gripStrength?: number[] | null;      // Grip_strength array
  videoDataPath: string;               // video_data_path
  rawKeypointDataPath: string;         // raw_keypoint_data_path
  analyzedXlsxPath: string;            // analyzed_xlsx_path
  reportPdfPath: string;               // Report_pdf_path
  createdAt: string;                   // created_at
  deletedAt: string;                   // deleted_at (NOT NULL in schema)
}

export interface CreateSessionInput {
  clinicianId?: string;
  patientId: number;
  protocolId: string;
  gripStrength?: number[];
  videoDataPath: string;
  rawKeypointDataPath: string;
  analyzedXlsxPath?: string;
  reportPdfPath?: string;
}

export interface UpdateSessionInput {
  gripStrength?: number[];
  videoDataPath?: string;
  rawKeypointDataPath?: string;
  analyzedXlsxPath?: string;
  reportPdfPath?: string;
}

// ============================================================================
// Legacy Recording Session Types (for backward compatibility)
// Maps to Experiment-Session where applicable
// ============================================================================

// Recording status (processing pipeline) - kept for backward compatibility
export const RecordingStatus = {
  CREATED: 'created',
  KEYPOINTS_UPLOADED: 'keypoints_uploaded',
  VIDEO_UPLOADED: 'video_uploaded',
  UPLOADED: 'uploaded',           // Legacy alias for video_uploaded
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ANALYZED: 'analyzed',           // Legacy alias for completed
  FAILED: 'failed'
} as const;

export type RecordingStatus = typeof RecordingStatus[keyof typeof RecordingStatus];

// Device metadata structure
export interface DeviceInfo {
  deviceType?: string;
  model?: string;
  os?: string;
  osVersion?: string;
  resolution?: string;
  frameRate?: number;
}

// Protocol configuration (stored as JSONB)
export interface ProtocolConfig {
  name?: string;
  movements?: ProtocolMovement[];
  instructions?: string;
}

// GCS Data Pathways
export interface GCSPaths {
  videoPath?: string | null;
  keypointsPath?: string | null;
  metadataPath?: string | null;
  labeledVideoPath?: string | null;
  analysisPath?: string | null;
  xlsxPath?: string | null;
  pdfPath?: string | null;
  plotsPath?: string | null;
}

/** @deprecated Use ExperimentSession instead */
export interface RecordingSession extends GCSPaths {
  id: string;
  patientId: string;
  patient?: Patient;
  clinicianId: string;
  clinician?: User;
  recordingDate: string;
  durationSeconds?: number | null;
  fps?: number | null;
  deviceInfo?: DeviceInfo | null;
  protocolConfig?: ProtocolConfig | null;
  status: RecordingStatus;
  keypointsUploadedAt?: string | null;
  videoUploadedAt?: string | null;
  processingStartedAt?: string | null;
  processingCompletedAt?: string | null;
  processingError?: string | null;
  clinicalNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  // Legacy/UI compatibility fields
  protocol?: Protocol;
  duration?: number | null;
  reviewStatus?: 'pending' | 'reviewed' | 'approved' | null;
  analyses?: AnalysisData[];
  progress?: number;
}

/** @deprecated Use CreateSessionInput instead */
export interface CreateRecordingInput {
  patientId: string;
  clinicianId?: string;
  recordingDate?: string;
  durationSeconds?: number;
  fps?: number;
  deviceInfo?: DeviceInfo;
  protocolConfig?: ProtocolConfig;
  videoPath?: string;
  keypointsPath?: string;
  clinicalNotes?: string;
}

/** @deprecated Use UpdateSessionInput instead */
export interface UpdateRecordingInput {
  durationSeconds?: number;
  fps?: number;
  deviceInfo?: DeviceInfo;
  protocolConfig?: ProtocolConfig;
  videoPath?: string;
  keypointsPath?: string;
  metadataPath?: string;
  labeledVideoPath?: string;
  analysisPath?: string;
  xlsxPath?: string;
  pdfPath?: string;
  plotsPath?: string;
  clinicalNotes?: string;
}

export interface UpdateRecordingStatusInput {
  status: RecordingStatus;
  processingError?: string;
}

// Alias for backward compatibility
export type RecordingFilters = SessionFilters;

// ============================================================================
// Analysis Data Types (stored in GCS as analysis.json)
// ============================================================================

export interface AnalysisData {
  recordingId?: string;  // Added for compatibility
  version: string;
  analyzedAt: string;
  tremorFrequency?: number;
  tremorAmplitude?: number;
  tremorRegularity?: number;
  dominantFrequency?: number;
  frequencySpectrum?: {
    frequencies: number[];
    power: number[];
    peaks: Array<{ frequency: number; power: number }>;
  };
  sparc?: number;
  ldljv?: number;
  normalizedJerk?: number;
  romMeasurements?: {
    wrist?: {
      flexion?: number;
      extension?: number;
      radialDeviation?: number;
      ulnarDeviation?: number;
    };
    fingers?: Record<string, {
      flexion?: number;
      extension?: number;
    }>;
  };
  overallScore?: number;
  coordinationScore?: number;  // Added for compatibility
  clinicalSummary?: string;
  confidence?: number;
  qualityFlags?: string[];
}

// ============================================================================
// LSTM Event Detection Types
// ============================================================================

export interface LSTMEvent {
  category: 'WRIST' | 'FINGER' | 'POSTURE' | 'STATE';
  event_type: string;
  label: string;
  start_frame: number;
  end_frame: number;
  duration_frames: number;
  duration_seconds: number;
  confidence: number;
  peak_confidence: number;
}

export interface LSTMEventSummary {
  count: number;
  total_duration_seconds: number;
  avg_duration_seconds: number;
}

export interface LSTMEventsResponse {
  recordingId: string;
  events: LSTMEvent[];
  summary: Record<string, LSTMEventSummary>;
  stats?: {
    duration_seconds?: number;
    n_frames?: number;
    fps?: number;
  };
}

// ============================================================================
// Comprehensive Analysis Types
// ============================================================================

export interface MovementAnalysisResult {
  id: string;
  recordingSessionId: string;
  movementName: string;
  outputType: string;
  metrics?: Record<string, number | string>;
  plotPath?: string | null;
  dataPath?: string | null;
  createdAt: string;
}

export interface SignalProcessingResult {
  id: string;
  recordingSessionId: string;
  filterType: string;
  parameters?: Record<string, unknown>;
  metrics?: Record<string, number | string>;
  filteredDataPath?: string | null;
  createdAt: string;
}

export interface ComprehensiveAnalysisResponse {
  recordingId: string;
  clinicalAnalyses: ClinicalAnalysis[];
  movementAnalysis: MovementAnalysisResult[];
  lstmEvents?: LSTMEventsResponse;
  signalProcessing: SignalProcessingResult[];
  summary: {
    hasLstmAnalysis: boolean;
    hasMovementAnalysis: boolean;
    hasClinicalAnalysis: boolean;
    totalEvents: number;
    analysisDate?: string;
  };
}

export interface AnalysisPlotUrls {
  plotsPath?: string;
  plots?: {
    filename: string;
    url: string;
    type: string;
  }[];
  excelReportUrl?: string;
  pdfReportUrl?: string;
}

// ============================================================================
// Admin Types
// ============================================================================

export interface AdminStats {
  users: {
    total: number;
    admins: number;
    clinicians: number;
    researchers: number;
    pendingApproval: number;
  };
  patients: {
    total: number;
    byDiagnosis: Record<string, number>;
  };
  projects: {
    total: number;
    active: number;
  };
  sessions: {
    total: number;
    completed: number;
    processing: number;
  };
  protocols: {
    total: number;
    public: number;
    private: number;
  };
  activity: {
    sessionsToday: number;
    patientsCreatedToday: number;
    activeUsers: number;
  };
}

export interface UpdateUserRoleInput {
  userType: UserType;
  // Legacy
  role?: UserRole;
}

export interface UpdateUserApprovalInput {
  approvalStatus: boolean;
  // Legacy
  isApproved?: boolean;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface VideoUploadMetadata {
  patientId: string | number;
  clinicianId?: string;
  protocolId?: string;
  deviceInfo?: DeviceInfo;
  clinicalNotes?: string;
}

export interface SignedUrlResponse {
  signedUrl: string;
  sessionId: string;
  expiresAt: string;
  // Legacy
  recordingId?: string;
}

// ============================================================================
// DEPRECATED TYPES - For backwards compatibility during migration
// ============================================================================

/** @deprecated Use RegisterUserInput instead */
export type RegisterData = RegisterUserInput;

/** @deprecated Use Patient['diagnosis'] instead */
export const DiagnosisCategory = {
  PARKINSONS: 'parkinsons',
  ESSENTIAL_TREMOR: 'essential_tremor',
  DYSTONIA: 'dystonia',
  STROKE_RECOVERY: 'stroke_recovery',
  MULTIPLE_SCLEROSIS: 'multiple_sclerosis',
  CEREBRAL_PALSY: 'cerebral_palsy',
  PERIPHERAL_NEUROPATHY: 'peripheral_neuropathy',
  CARPAL_TUNNEL: 'carpal_tunnel',
  ARTHRITIS: 'arthritis',
  HEALTHY_CONTROL: 'healthy_control',
  HEALTHY: 'Healthy',
  OTHER: 'other'
} as const;

export type DiagnosisCategory = typeof DiagnosisCategory[keyof typeof DiagnosisCategory];

/** @deprecated Use Patient['gender'] instead */
export const GenderType = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
  PREFER_NOT_TO_SAY: 'prefer_not_to_say'
} as const;

export type GenderType = typeof GenderType[keyof typeof GenderType];

/** @deprecated Review status removed from schema */
export const ReviewStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  FLAGGED: 'flagged'
} as const;
export type ReviewStatus = typeof ReviewStatus[keyof typeof ReviewStatus];

/** @deprecated Update review status removed */
export interface UpdateReviewStatusInput {
  reviewStatus: ReviewStatus;
  reviewNotes?: string;
}

/** @deprecated Audit logs use Supabase built-in logging */
export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/** @deprecated Audit logs use Supabase built-in logging */
export interface AuditLogFilters extends PaginationParams {
  userId?: string;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

/** @deprecated Clinical analysis stored in GCS, not database */
export interface ClinicalAnalysis extends AnalysisData {
  id: string;
  recordingId: string;
  analyzedById?: string;
  analysisType: 'comprehensive' | 'tremor_focused' | 'rom_focused';
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use AnalysisData for GCS analysis */
export interface CreateAnalysisInput {
  analysisVersion?: string;
  analysisType?: string;
  tremorFrequency?: number;
  tremorAmplitude?: number;
  confidence?: number;
}

/** @deprecated Annotations removed - use patient diagnosis */
export const AnnotationType = {
  OBSERVATION: 'observation',
  DIAGNOSIS: 'diagnosis',
  RECOMMENDATION: 'recommendation',
  FLAG: 'flag'
} as const;
export type AnnotationType = typeof AnnotationType[keyof typeof AnnotationType];

/** @deprecated Annotations removed - use patient diagnosis */
export const SeverityLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;
export type SeverityLevel = typeof SeverityLevel[keyof typeof SeverityLevel];

/** @deprecated Annotations removed */
export interface ClinicalAnnotation {
  id: string;
  recordingId: string;
  annotatedById: string;
  annotationType: AnnotationType;
  content: string;
  severity?: SeverityLevel;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Annotations removed */
export interface CreateAnnotationInput {
  annotationType: AnnotationType;
  content: string;
  severity?: SeverityLevel;
}

/** @deprecated Annotations removed */
export interface UpdateAnnotationInput {
  content?: string;
  severity?: SeverityLevel;
  isResolved?: boolean;
}

/** @deprecated Comparisons are runtime computed, not stored */
export const ComparisonType = {
  LONGITUDINAL: 'longitudinal',
  BILATERAL: 'bilateral',
  TREATMENT_RESPONSE: 'treatment_response'
} as const;
export type ComparisonType = typeof ComparisonType[keyof typeof ComparisonType];

/** @deprecated Comparisons are runtime computed */
export interface RecordingComparison {
  id: string;
  baselineRecordingId: string;
  baselineRecording?: RecordingSession;
  comparedRecordingId: string;
  comparedRecording?: RecordingSession;
  comparedById: string;
  comparedBy?: User;
  comparisonType: ComparisonType;
  metricDifferences: string;
  overallChange?: 'improved' | 'stable' | 'declined';
  changeScore?: number;
  clinicalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Comparisons are runtime computed */
export interface CreateComparisonInput {
  baselineRecordingId: string;
  comparedRecordingId: string;
  comparisonType: ComparisonType;
  metricDifferences: Record<string, unknown> | string;
  overallChange?: 'improved' | 'stable' | 'declined';
  changeScore?: number;
  clinicalNotes?: string;
}
