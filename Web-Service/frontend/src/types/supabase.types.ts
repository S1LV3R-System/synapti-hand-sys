/**
 * Supabase Database Types
 * Auto-generated from complete-schema.sql
 *
 * These types provide TypeScript type safety for Supabase queries.
 */

// ============================================================================
// ENUM TYPES
// ============================================================================

export type UserRole = 'patient' | 'clinician' | 'researcher' | 'admin';
export type GenderType = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type RecordingStatus = 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed' | 'archived';
export type ReviewStatus = 'pending' | 'approved' | 'needs_review' | 'rejected';
export type AnnotationType = 'marker' | 'segment' | 'note' | 'measurement';
export type SeverityLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type ReportType = 'progress' | 'clinical' | 'research' | 'summary' | 'comparison';
export type ComparisonType = 'before_after' | 'treatment_comparison' | 'longitudinal' | 'baseline';
export type ChangeAssessment = 'improved' | 'unchanged' | 'worsened' | 'inconclusive';
export type ImageSource = 'analysis' | 'manual' | 'clinical';
export type ImageType = 'frequency_spectrum' | 'waveform' | 'heatmap' | 'trajectory' | 'other';
export type ClinicalSpecialty = 'neurology' | 'movement_disorders' | 'rehabilitation' | 'occupational_therapy' | 'physical_therapy' | 'general' | 'other';
export type DiagnosisCategory = 'essential_tremor' | 'parkinsons' | 'dystonia' | 'cerebellar' | 'functional' | 'physiological' | 'drug_induced' | 'neuropathic' | 'other' | 'undiagnosed';
export type AnalysisType = 'tremor' | 'rom' | 'smoothness' | 'coordination' | 'full';
export type AdminNoteType = 'approval' | 'rejection' | 'warning' | 'general' | 'support';
export type LstmCategory = 'tremor_type' | 'movement_phase' | 'quality_issue' | 'clinical_event';

// ============================================================================
// TABLE ROW TYPES
// ============================================================================

export interface DbUser {
  id: string;
  auth_user_id: string | null;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  hospital: string | null;
  department: string | null;
  license_number: string | null;
  license_state: string | null;
  specialty: ClinicalSpecialty | null;
  organization: string | null;
  role: UserRole;
  is_active: boolean;
  is_approved: boolean | null;
  email_verified: boolean;
  email_verified_at: string | null;
  approved_at: string | null;
  approved_by_id: string | null;
  rejected_at: string | null;
  rejected_by_id: string | null;
  rejection_reason: string | null;
  registration_ip: string | null;
  registration_device: string | null;
  last_login: string | null;
  account_expires_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbProject {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
  created_at: string;
}

export interface DbProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  token: string;
  status: InvitationStatus;
  invited_by_id: string;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
}

export interface DbPatient {
  id: string;
  patient_id: string;
  patient_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: GenderType | null;
  diagnosis: DiagnosisCategory | null;
  diagnosis_date: string | null;
  treating_physician: string | null;
  notes: string | null;
  project_id: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbProtocol {
  id: string;
  name: string;
  description: string | null;
  version: string;
  configuration: string;
  indicated_for: string | null;
  contraindications: string | null;
  is_public: boolean;
  is_active: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbRecordingSession {
  id: string;
  patient_model_id: string;
  clinician_id: string | null;
  protocol_id: string | null;
  recording_date: string;
  duration: number | null;
  fps: number | null;
  device_info: string | null;
  video_path: string | null;
  keypoints_path: string | null;
  clinical_notes: string | null;
  status: RecordingStatus;
  progress: number | null;
  review_status: ReviewStatus;
  review_notes: string | null;
  reviewed_by_id: string | null;
  reviewed_at: string | null;
  processing_metadata: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbSignalProcessingResult {
  id: string;
  recording_id: string;
  processing_date: string;
  processing_version: string;
  raw_landmarks: string | null;
  filtered_landmarks: string | null;
  butterworth_low: string | null;
  butterworth_high: string | null;
  butterworth_band: string | null;
  kalman_filtered: string | null;
  savgol_filtered: string | null;
  wavelet_filtered: string | null;
  median_filtered: string | null;
  exponential_smooth: string | null;
  double_exponential: string | null;
  holt_winters: string | null;
  gaussian_filtered: string | null;
  bilateral_filtered: string | null;
  nlm_filtered: string | null;
  wiener_filtered: string | null;
  rls_filtered: string | null;
  lms_filtered: string | null;
  hampel_filtered: string | null;
  mad_filtered: string | null;
  iqr_filtered: string | null;
  zscore_filtered: string | null;
  emd_filtered: string | null;
  vmd_filtered: string | null;
  fft_filtered: string | null;
  stft_filtered: string | null;
  cwt_filtered: string | null;
  pca_denoised: string | null;
  ica_denoised: string | null;
  lowess_smoothed: string | null;
  spline_smoothed: string | null;
  loess_smoothed: string | null;
  moving_average: string | null;
  weighted_ma: string | null;
  triangular_ma: string | null;
  cubic_spline: string | null;
  bezier_smoothed: string | null;
  gaussian_process: string | null;
  total_variation: string | null;
  morphological_filtered: string | null;
  velocity_data: string | null;
  acceleration_data: string | null;
  jerk_data: string | null;
  angular_data: string | null;
  quality_metrics: string | null;
  processing_errors: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbClinicalAnalysis {
  id: string;
  recording_id: string;
  analyzed_by_id: string | null;
  analysis_date: string;
  analysis_version: string;
  analysis_type: AnalysisType;
  tremor_frequency: number | null;
  tremor_amplitude: number | null;
  tremor_regularity: number | null;
  dominant_frequency: number | null;
  frequency_spectrum: string | null;
  sparc: number | null;
  ldljv: number | null;
  normalized_jerk: number | null;
  rom_measurements: string | null;
  asymmetry_index: number | null;
  asymmetry_details: string | null;
  coordination_score: number | null;
  reaction_time: number | null;
  movement_accuracy: number | null;
  severity_scores: string | null;
  overall_score: number | null;
  clinical_summary: string | null;
  confidence: number;
  quality_flags: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbClinicalAnnotation {
  id: string;
  recording_id: string;
  created_by_id: string | null;
  annotation_type: AnnotationType;
  timestamp_start: number;
  timestamp_end: number | null;
  content: string;
  severity: SeverityLevel | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbLstmEventDetection {
  id: string;
  recording_id: string;
  category: LstmCategory;
  event_label: string;
  confidence: number;
  timestamp_start: number;
  timestamp_end: number | null;
  metadata: string | null;
  model_version: string;
  created_at: string;
}

export interface DbLabelImage {
  id: string;
  recording_id: string;
  analysis_id: string | null;
  image_type: ImageType;
  source: ImageSource;
  file_path: string;
  title: string | null;
  description: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbReport {
  id: string;
  recording_id: string | null;
  patient_id: string | null;
  created_by_id: string | null;
  report_type: ReportType;
  title: string;
  content: string;
  analysis_summary: string | null;
  recommendations: string | null;
  file_path: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbRecordingComparison {
  id: string;
  patient_id: string;
  recording_1_id: string;
  recording_2_id: string;
  compared_by_id: string | null;
  comparison_type: ComparisonType;
  comparison_date: string;
  tremor_change: ChangeAssessment | null;
  rom_change: ChangeAssessment | null;
  smoothness_change: ChangeAssessment | null;
  detailed_comparison: string | null;
  clinical_notes: string | null;
  created_at: string;
}

export interface DbAuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface DbAdminNote {
  id: string;
  user_id: string;
  admin_id: string;
  note_type: AdminNoteType;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DbApiKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DATABASE SCHEMA TYPE (for createClient generic)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      users: {
        Row: DbUser;
        Insert: Omit<DbUser, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbUser, 'id' | 'created_at'>>;
      };
      projects: {
        Row: DbProject;
        Insert: Omit<DbProject, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbProject, 'id' | 'created_at'>>;
      };
      project_members: {
        Row: DbProjectMember;
        Insert: Omit<DbProjectMember, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DbProjectMember, 'id' | 'created_at'>>;
      };
      project_invitations: {
        Row: DbProjectInvitation;
        Insert: Omit<DbProjectInvitation, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DbProjectInvitation, 'id' | 'created_at'>>;
      };
      patients: {
        Row: DbPatient;
        Insert: Omit<DbPatient, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbPatient, 'id' | 'created_at'>>;
      };
      protocols: {
        Row: DbProtocol;
        Insert: Omit<DbProtocol, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbProtocol, 'id' | 'created_at'>>;
      };
      recording_sessions: {
        Row: DbRecordingSession;
        Insert: Omit<DbRecordingSession, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbRecordingSession, 'id' | 'created_at'>>;
      };
      signal_processing_results: {
        Row: DbSignalProcessingResult;
        Insert: Omit<DbSignalProcessingResult, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbSignalProcessingResult, 'id' | 'created_at'>>;
      };
      clinical_analyses: {
        Row: DbClinicalAnalysis;
        Insert: Omit<DbClinicalAnalysis, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbClinicalAnalysis, 'id' | 'created_at'>>;
      };
      clinical_annotations: {
        Row: DbClinicalAnnotation;
        Insert: Omit<DbClinicalAnnotation, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbClinicalAnnotation, 'id' | 'created_at'>>;
      };
      lstm_event_detections: {
        Row: DbLstmEventDetection;
        Insert: Omit<DbLstmEventDetection, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DbLstmEventDetection, 'id' | 'created_at'>>;
      };
      label_images: {
        Row: DbLabelImage;
        Insert: Omit<DbLabelImage, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbLabelImage, 'id' | 'created_at'>>;
      };
      reports: {
        Row: DbReport;
        Insert: Omit<DbReport, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbReport, 'id' | 'created_at'>>;
      };
      recording_comparisons: {
        Row: DbRecordingComparison;
        Insert: Omit<DbRecordingComparison, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DbRecordingComparison, 'id' | 'created_at'>>;
      };
      audit_logs: {
        Row: DbAuditLog;
        Insert: Omit<DbAuditLog, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<DbAuditLog, 'id' | 'created_at'>>;
      };
      admin_notes: {
        Row: DbAdminNote;
        Insert: Omit<DbAdminNote, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbAdminNote, 'id' | 'created_at'>>;
      };
      api_keys: {
        Row: DbApiKey;
        Insert: Omit<DbApiKey, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<DbApiKey, 'id' | 'created_at'>>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_current_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_project_member: {
        Args: { project_uuid: string };
        Returns: boolean;
      };
      is_project_owner: {
        Args: { project_uuid: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
      gender_type: GenderType;
      project_role: ProjectRole;
      invitation_status: InvitationStatus;
      recording_status: RecordingStatus;
      review_status: ReviewStatus;
      annotation_type: AnnotationType;
      severity_level: SeverityLevel;
      report_type: ReportType;
      comparison_type: ComparisonType;
      change_assessment: ChangeAssessment;
      image_source: ImageSource;
      image_type: ImageType;
      clinical_specialty: ClinicalSpecialty;
      diagnosis_category: DiagnosisCategory;
      analysis_type: AnalysisType;
      admin_note_type: AdminNoteType;
      lstm_category: LstmCategory;
    };
  };
}
