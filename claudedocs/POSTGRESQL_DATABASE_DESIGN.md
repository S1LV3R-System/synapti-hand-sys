# PostgreSQL Database Design for SynaptiHand

## Executive Summary

This document outlines the migration from SQLite to PostgreSQL, leveraging PostgreSQL's advanced features for improved performance, data integrity, and scalability.

---

## 1. Current State Analysis

### SQLite Limitations Identified
| Issue | Impact | PostgreSQL Solution |
|-------|--------|---------------------|
| JSON stored as TEXT | No query capability | JSONB with GIN indexes |
| String-based enums | No type safety | Native ENUM types |
| Limited indexing | Slower queries | Partial, GIN, BRIN indexes |
| No CHECK constraints | Data validation in app | Database-level validation |
| Single-writer lock | Concurrency bottleneck | MVCC full concurrency |
| No array types | JSON workarounds | Native array support |

### Current Schema Statistics
- **18 models** with complex relationships
- **~50 indexes** (basic B-tree only)
- **~15 JSON string columns** needing conversion
- **~12 string enum patterns** needing native types

---

## 2. PostgreSQL Schema Design

### 2.1 Custom ENUM Types

```sql
-- ============================================================================
-- ENUM TYPE DEFINITIONS
-- ============================================================================

-- User roles
CREATE TYPE user_role AS ENUM (
    'patient',
    'clinician',
    'researcher',
    'admin'
);

-- Account approval status
CREATE TYPE approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

-- Gender options
CREATE TYPE gender_type AS ENUM (
    'male',
    'female',
    'other',
    'prefer_not_to_say'
);

-- Project member roles
CREATE TYPE project_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
);

-- Invitation status
CREATE TYPE invitation_status AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'expired'
);

-- Recording session status
CREATE TYPE recording_status AS ENUM (
    'created',
    'keypoints_uploaded',
    'analyzing',
    'video_uploaded',
    'completed',
    'error',
    -- Legacy states for compatibility
    'uploaded',
    'processing',
    'processed',
    'analyzed',
    'failed'
);

-- Review status
CREATE TYPE review_status AS ENUM (
    'pending',
    'approved',
    'flagged',
    'rejected'
);

-- Clinical annotation types
CREATE TYPE annotation_type AS ENUM (
    'observation',
    'diagnosis',
    'recommendation',
    'flag',
    'note'
);

-- Severity levels
CREATE TYPE severity_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

-- Report types
CREATE TYPE report_type AS ENUM (
    'clinical',
    'research',
    'comparison',
    'progress',
    'summary'
);

-- Comparison types
CREATE TYPE comparison_type AS ENUM (
    'longitudinal',
    'bilateral',
    'treatment_response',
    'baseline'
);

-- Change assessment
CREATE TYPE change_assessment AS ENUM (
    'improved',
    'stable',
    'declined',
    'inconclusive'
);

-- Image source types
CREATE TYPE image_source AS ENUM (
    'android_screenshot',
    'backend_generated',
    'clinician_upload',
    'system'
);

-- Image types
CREATE TYPE image_type AS ENUM (
    'labeled_frame',
    'screenshot',
    'annotation_image',
    'overlay',
    'thumbnail'
);

-- Audit log status
CREATE TYPE audit_status AS ENUM (
    'success',
    'failure',
    'warning'
);

-- Admin note types
CREATE TYPE admin_note_type AS ENUM (
    'general',
    'approval',
    'rejection',
    'info_request',
    'warning'
);

-- Analysis types
CREATE TYPE analysis_type AS ENUM (
    'comprehensive',
    'tremor_focused',
    'rom_focused',
    'coordination',
    'custom'
);

-- LSTM event categories
CREATE TYPE lstm_category AS ENUM (
    'WRIST',
    'FINGER',
    'POSTURE',
    'STATE'
);

-- Clinical specialties
CREATE TYPE clinical_specialty AS ENUM (
    'neurology',
    'orthopedics',
    'physical_therapy',
    'occupational_therapy',
    'rehabilitation',
    'general'
);

-- Diagnosis categories
CREATE TYPE diagnosis_category AS ENUM (
    'parkinsons',
    'essential_tremor',
    'stroke_recovery',
    'multiple_sclerosis',
    'cerebral_palsy',
    'peripheral_neuropathy',
    'carpal_tunnel',
    'arthritis',
    'healthy_control',
    'other'
);
```

### 2.2 Core Tables

```sql
-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(200) GENERATED ALWAYS AS (
        COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')
    ) STORED,
    role user_role NOT NULL DEFAULT 'patient',

    -- Registration fields
    phone_number VARCHAR(20),
    hospital VARCHAR(255),
    department VARCHAR(255),

    -- Clinical context
    license_number VARCHAR(50),
    license_state VARCHAR(50),
    specialty clinical_specialty,
    organization VARCHAR(255),

    -- Email verification
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,

    -- Account approval workflow
    approval_status approval_status DEFAULT 'pending',
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    rejected_at TIMESTAMPTZ,

    -- Registration metadata
    registration_ip INET,
    registration_device JSONB,

    -- Account status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    account_expires_at TIMESTAMPTZ,
    last_login TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT users_approval_logic CHECK (
        (approval_status = 'approved' AND approved_at IS NOT NULL) OR
        (approval_status = 'rejected' AND rejected_at IS NOT NULL) OR
        (approval_status = 'pending')
    )
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_approval ON users(approval_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_created_at ON users USING BRIN(created_at);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- SESSIONS TABLE
-- ============================================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Device/session metadata
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,

    CONSTRAINT sessions_token_unique UNIQUE (token_hash)
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- AUDIT LOGS TABLE (Partitioned by month)
-- ============================================================================
CREATE TABLE audit_logs (
    id BIGSERIAL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    status audit_status NOT NULL DEFAULT 'success',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create partitions for audit logs (create monthly partitions)
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- Add more partitions as needed...

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs USING BRIN(created_at);
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN(details);

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    -- Project settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT projects_name_length CHECK (LENGTH(name) >= 2)
);

CREATE INDEX idx_projects_owner ON projects(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_public ON projects(is_public) WHERE deleted_at IS NULL AND is_public = TRUE;
CREATE INDEX idx_projects_created_at ON projects USING BRIN(created_at);
CREATE INDEX idx_projects_settings ON projects USING GIN(settings);

-- ============================================================================
-- PROJECT MEMBERS TABLE
-- ============================================================================
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'member',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT project_members_unique UNIQUE (project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- ============================================================================
-- PROJECT INVITATIONS TABLE
-- ============================================================================
CREATE TABLE project_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    invited_email VARCHAR(255) NOT NULL,
    invited_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role project_role NOT NULL DEFAULT 'member',
    status invitation_status NOT NULL DEFAULT 'pending',

    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invitations_email_format CHECK (invited_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT invitations_unique UNIQUE (project_id, invited_email)
);

CREATE INDEX idx_invitations_project ON project_invitations(project_id);
CREATE INDEX idx_invitations_email ON project_invitations(invited_email);
CREATE INDEX idx_invitations_status ON project_invitations(status) WHERE status = 'pending';

-- ============================================================================
-- PATIENTS TABLE
-- ============================================================================
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id VARCHAR(100) NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    gender gender_type,
    date_of_birth DATE,

    -- Physical characteristics
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),

    -- Clinical information
    diagnosis diagnosis_category,
    diagnosis_details TEXT,

    -- Project association
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Medical information (JSONB for flexibility)
    medical_history JSONB DEFAULT '{}',
    medications JSONB DEFAULT '[]',
    notes TEXT,

    -- Metadata
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT patients_patient_id_unique UNIQUE (patient_id),
    CONSTRAINT patients_height_range CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300)),
    CONSTRAINT patients_weight_range CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500))
);

CREATE INDEX idx_patients_project ON patients(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_patient_id ON patients(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_diagnosis ON patients(diagnosis) WHERE deleted_at IS NULL;
CREATE INDEX idx_patients_created_by ON patients(created_by_id);
CREATE INDEX idx_patients_medical_history ON patients USING GIN(medical_history);

-- ============================================================================
-- PROTOCOLS TABLE
-- ============================================================================
CREATE TABLE protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0',

    -- Protocol configuration (JSONB)
    -- Structure: {
    --   "movements": [{"name": "finger_tap", "duration": 30, "repetitions": 10}],
    --   "requiredMetrics": ["tremor_frequency", "amplitude", "sparc"],
    --   "instructions": "...",
    --   "clinicalGuidelines": "..."
    -- }
    configuration JSONB NOT NULL DEFAULT '{}',

    -- Clinical context
    indicated_for TEXT[],
    contraindications TEXT[],

    -- Metadata
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT protocols_version_format CHECK (version ~ '^\d+\.\d+(\.\d+)?$')
);

CREATE INDEX idx_protocols_created_by ON protocols(created_by_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_protocols_public ON protocols(is_public) WHERE deleted_at IS NULL AND is_public = TRUE;
CREATE INDEX idx_protocols_active ON protocols(is_active) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_protocols_config ON protocols USING GIN(configuration);
CREATE INDEX idx_protocols_indicated ON protocols USING GIN(indicated_for);

-- ============================================================================
-- RECORDING SESSIONS TABLE
-- ============================================================================
CREATE TABLE recording_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Patient and clinical context
    patient_model_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    patient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    clinician_id UUID REFERENCES users(id) ON DELETE SET NULL,
    protocol_id UUID REFERENCES protocols(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- Mobile session identification
    mobile_session_id VARCHAR(100),

    -- Recording metadata
    recording_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_seconds INTEGER,
    fps INTEGER,

    -- Device information (JSONB)
    device_info JSONB DEFAULT '{}',

    -- File storage paths (GCS)
    keypoints_path TEXT,
    metadata_path TEXT,
    video_path TEXT,
    csv_path TEXT,

    -- Parallel upload timestamps
    keypoints_uploaded_at TIMESTAMPTZ,
    video_uploaded_at TIMESTAMPTZ,

    -- Analysis tracking
    analysis_started_at TIMESTAMPTZ,
    analysis_completed_at TIMESTAMPTZ,
    analysis_error TEXT,
    analysis_progress SMALLINT DEFAULT 0,

    -- Status
    status recording_status NOT NULL DEFAULT 'created',

    -- Processing metadata (JSONB)
    processing_metadata JSONB DEFAULT '{}',

    -- Clinical notes
    clinical_notes TEXT,

    -- Review tracking
    reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_status review_status DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT recordings_mobile_session_unique UNIQUE (mobile_session_id),
    CONSTRAINT recordings_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    CONSTRAINT recordings_fps_range CHECK (fps IS NULL OR (fps > 0 AND fps <= 240)),
    CONSTRAINT recordings_progress_range CHECK (analysis_progress >= 0 AND analysis_progress <= 100)
);

-- Indexes for recording sessions
CREATE INDEX idx_recordings_patient_model ON recording_sessions(patient_model_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_patient_user ON recording_sessions(patient_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_clinician ON recording_sessions(clinician_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_protocol ON recording_sessions(protocol_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_project ON recording_sessions(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_mobile_session ON recording_sessions(mobile_session_id) WHERE mobile_session_id IS NOT NULL;
CREATE INDEX idx_recordings_status ON recording_sessions(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_review_status ON recording_sessions(review_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_recordings_date ON recording_sessions USING BRIN(recording_date);
CREATE INDEX idx_recordings_created_at ON recording_sessions USING BRIN(created_at);
CREATE INDEX idx_recordings_device_info ON recording_sessions USING GIN(device_info);
CREATE INDEX idx_recordings_processing ON recording_sessions USING GIN(processing_metadata);

-- Full-text search on clinical notes
CREATE INDEX idx_recordings_clinical_notes_fts ON recording_sessions
    USING GIN(to_tsvector('english', COALESCE(clinical_notes, '')));

-- ============================================================================
-- SIGNAL PROCESSING RESULTS TABLE
-- ============================================================================
CREATE TABLE signal_processing_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Processing configuration
    processing_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    filters_applied TEXT[] NOT NULL DEFAULT '{}',

    -- Raw landmark data (JSONB - compressed)
    -- Structure: compressed array of frames with landmarks
    raw_landmarks JSONB NOT NULL,

    -- Filtered data storage (JSONB for each filter)
    butterworth JSONB,
    kalman JSONB,
    savitzky_golay JSONB,
    moving_average JSONB,
    exponential_smoothing JSONB,
    fft_filtered JSONB,
    wavelet_denoised JSONB,
    particle_filter JSONB,
    unscented_kalman JSONB,

    -- Quality metrics (JSONB)
    quality_metrics JSONB DEFAULT '{}',

    -- Processing performance
    processing_time_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT spr_processing_time_positive CHECK (processing_time_ms IS NULL OR processing_time_ms > 0)
);

CREATE INDEX idx_spr_recording ON signal_processing_results(recording_session_id);
CREATE INDEX idx_spr_version ON signal_processing_results(processing_version);
CREATE INDEX idx_spr_filters ON signal_processing_results USING GIN(filters_applied);
CREATE INDEX idx_spr_quality ON signal_processing_results USING GIN(quality_metrics);

-- ============================================================================
-- CLINICAL ANALYSES TABLE
-- ============================================================================
CREATE TABLE clinical_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Analysis configuration
    analysis_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    analysis_type analysis_type NOT NULL DEFAULT 'comprehensive',

    -- Tremor metrics
    tremor_frequency_hz DECIMAL(6,3),
    tremor_amplitude_mm DECIMAL(8,3),
    tremor_regularity DECIMAL(4,3),
    dominant_frequency_hz DECIMAL(6,3),

    -- Frequency spectrum (JSONB)
    frequency_spectrum JSONB DEFAULT '{}',

    -- Smoothness metrics
    sparc DECIMAL(10,6),
    ldljv DECIMAL(10,6),
    normalized_jerk DECIMAL(10,6),

    -- Range of Motion (JSONB)
    rom_measurements JSONB DEFAULT '{}',

    -- Asymmetry analysis
    asymmetry_index DECIMAL(4,3),
    asymmetry_details JSONB DEFAULT '{}',

    -- Coordination scores
    coordination_score DECIMAL(5,2),
    reaction_time_ms DECIMAL(8,2),
    movement_accuracy DECIMAL(4,3),

    -- Clinical severity (JSONB)
    severity_scores JSONB DEFAULT '{}',

    -- Overall assessment
    overall_score DECIMAL(5,2),
    clinical_summary TEXT,

    -- Quality metrics
    confidence DECIMAL(4,3) DEFAULT 0.0,
    quality_flags TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT ca_tremor_regularity_range CHECK (tremor_regularity IS NULL OR (tremor_regularity >= 0 AND tremor_regularity <= 1)),
    CONSTRAINT ca_asymmetry_range CHECK (asymmetry_index IS NULL OR (asymmetry_index >= 0 AND asymmetry_index <= 1)),
    CONSTRAINT ca_coordination_range CHECK (coordination_score IS NULL OR (coordination_score >= 0 AND coordination_score <= 100)),
    CONSTRAINT ca_accuracy_range CHECK (movement_accuracy IS NULL OR (movement_accuracy >= 0 AND movement_accuracy <= 1)),
    CONSTRAINT ca_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT ca_overall_range CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100))
);

CREATE INDEX idx_ca_recording ON clinical_analyses(recording_session_id);
CREATE INDEX idx_ca_type ON clinical_analyses(analysis_type);
CREATE INDEX idx_ca_version ON clinical_analyses(analysis_version);
CREATE INDEX idx_ca_tremor_freq ON clinical_analyses(tremor_frequency_hz) WHERE tremor_frequency_hz IS NOT NULL;
CREATE INDEX idx_ca_overall ON clinical_analyses(overall_score) WHERE overall_score IS NOT NULL;
CREATE INDEX idx_ca_severity ON clinical_analyses USING GIN(severity_scores);
CREATE INDEX idx_ca_rom ON clinical_analyses USING GIN(rom_measurements);

-- Full-text search on clinical summary
CREATE INDEX idx_ca_summary_fts ON clinical_analyses
    USING GIN(to_tsvector('english', COALESCE(clinical_summary, '')));

-- ============================================================================
-- LSTM EVENT DETECTIONS TABLE
-- ============================================================================
CREATE TABLE lstm_event_detections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Event identification
    category lstm_category NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    label VARCHAR(255),

    -- Temporal information
    start_frame INTEGER NOT NULL,
    end_frame INTEGER NOT NULL,
    duration_frames INTEGER GENERATED ALWAYS AS (end_frame - start_frame) STORED,
    duration_seconds DECIMAL(10,4) NOT NULL,

    -- LSTM confidence scores
    confidence DECIMAL(4,3) NOT NULL,
    peak_confidence DECIMAL(4,3) NOT NULL,

    -- Raw predictions (JSONB)
    raw_predictions JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT led_frame_order CHECK (end_frame >= start_frame),
    CONSTRAINT led_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT led_peak_confidence_range CHECK (peak_confidence >= 0 AND peak_confidence <= 1)
);

CREATE INDEX idx_led_recording ON lstm_event_detections(recording_session_id);
CREATE INDEX idx_led_category ON lstm_event_detections(category);
CREATE INDEX idx_led_event_type ON lstm_event_detections(event_type);
CREATE INDEX idx_led_frames ON lstm_event_detections(start_frame, end_frame);
CREATE INDEX idx_led_confidence ON lstm_event_detections(confidence) WHERE confidence > 0.7;

-- ============================================================================
-- CLINICAL ANNOTATIONS TABLE
-- ============================================================================
CREATE TABLE clinical_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    clinician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Annotation content
    annotation_type annotation_type NOT NULL,
    content TEXT NOT NULL,
    severity severity_level,

    -- Temporal reference
    timestamp_start_sec DECIMAL(10,4),
    timestamp_end_sec DECIMAL(10,4),

    -- Resolution tracking
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ca_timestamp_order CHECK (
        timestamp_end_sec IS NULL OR
        timestamp_start_sec IS NULL OR
        timestamp_end_sec >= timestamp_start_sec
    )
);

CREATE INDEX idx_annotations_recording ON clinical_annotations(recording_session_id);
CREATE INDEX idx_annotations_clinician ON clinical_annotations(clinician_id);
CREATE INDEX idx_annotations_type ON clinical_annotations(annotation_type);
CREATE INDEX idx_annotations_resolved ON clinical_annotations(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_annotations_severity ON clinical_annotations(severity) WHERE severity IN ('high', 'critical');

-- Full-text search on content
CREATE INDEX idx_annotations_content_fts ON clinical_annotations
    USING GIN(to_tsvector('english', content));

-- ============================================================================
-- LABEL IMAGES TABLE
-- ============================================================================
CREATE TABLE label_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Source and type
    image_source image_source NOT NULL,
    image_type image_type NOT NULL,

    -- Temporal reference
    frame_number INTEGER,
    timestamp_sec DECIMAL(10,4),

    -- Storage paths
    image_path TEXT NOT NULL,
    thumbnail_path TEXT,

    -- Image metadata
    width_px INTEGER,
    height_px INTEGER,
    file_size_bytes INTEGER,
    mime_type VARCHAR(50),

    -- Landmarks data (JSONB)
    landmarks_data JSONB,

    -- Link to annotation
    annotation_id UUID REFERENCES clinical_annotations(id) ON DELETE SET NULL,

    -- Descriptive information
    title VARCHAR(255),
    description TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Upload metadata
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    device_info JSONB DEFAULT '{}',

    -- Processing flags
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    overlays_applied TEXT[] DEFAULT '{}',

    -- Visibility
    is_public BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT li_dimensions_positive CHECK (
        (width_px IS NULL OR width_px > 0) AND
        (height_px IS NULL OR height_px > 0) AND
        (file_size_bytes IS NULL OR file_size_bytes > 0)
    )
);

CREATE INDEX idx_label_images_recording ON label_images(recording_session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_label_images_source ON label_images(image_source) WHERE deleted_at IS NULL;
CREATE INDEX idx_label_images_type ON label_images(image_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_label_images_frame ON label_images(frame_number) WHERE frame_number IS NOT NULL;
CREATE INDEX idx_label_images_annotation ON label_images(annotation_id) WHERE annotation_id IS NOT NULL;
CREATE INDEX idx_label_images_tags ON label_images USING GIN(tags);
CREATE INDEX idx_label_images_landmarks ON label_images USING GIN(landmarks_data) WHERE landmarks_data IS NOT NULL;

-- ============================================================================
-- REPORTS TABLE
-- ============================================================================
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Report metadata
    report_type report_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT,

    -- Storage
    pdf_path TEXT,

    -- Configuration (JSONB)
    configuration JSONB DEFAULT '{}',

    -- Generation metadata
    generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version VARCHAR(20) NOT NULL DEFAULT '1.0',

    -- Access control
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    shared_with UUID[] DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_recording ON reports(recording_session_id);
CREATE INDEX idx_reports_type ON reports(report_type);
CREATE INDEX idx_reports_generated ON reports USING BRIN(generated_at);
CREATE INDEX idx_reports_shared ON reports(is_shared) WHERE is_shared = TRUE;
CREATE INDEX idx_reports_shared_with ON reports USING GIN(shared_with);

-- ============================================================================
-- RECORDING COMPARISONS TABLE
-- ============================================================================
CREATE TABLE recording_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baseline_recording_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    compared_recording_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,

    -- Comparison type
    comparison_type comparison_type NOT NULL,

    -- Computed differences (JSONB)
    metric_differences JSONB NOT NULL DEFAULT '{}',

    -- Overall assessment
    overall_change change_assessment,
    change_score DECIMAL(6,2),

    -- Statistical tests (JSONB)
    statistical_tests JSONB DEFAULT '{}',

    -- Clinical notes
    clinical_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT rc_different_recordings CHECK (baseline_recording_id != compared_recording_id),
    CONSTRAINT rc_change_score_range CHECK (change_score IS NULL OR (change_score >= -100 AND change_score <= 100))
);

CREATE INDEX idx_comparisons_baseline ON recording_comparisons(baseline_recording_id);
CREATE INDEX idx_comparisons_compared ON recording_comparisons(compared_recording_id);
CREATE INDEX idx_comparisons_type ON recording_comparisons(comparison_type);
CREATE INDEX idx_comparisons_change ON recording_comparisons(overall_change) WHERE overall_change IS NOT NULL;
CREATE INDEX idx_comparisons_metrics ON recording_comparisons USING GIN(metric_differences);

-- ============================================================================
-- ADMIN NOTES TABLE
-- ============================================================================
CREATE TABLE admin_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    note_type admin_note_type NOT NULL DEFAULT 'general',
    is_internal BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_notes_user ON admin_notes(user_id);
CREATE INDEX idx_admin_notes_admin ON admin_notes(admin_id);
CREATE INDEX idx_admin_notes_type ON admin_notes(note_type);
CREATE INDEX idx_admin_notes_created ON admin_notes USING BRIN(created_at);

-- Full-text search on content
CREATE INDEX idx_admin_notes_content_fts ON admin_notes
    USING GIN(to_tsvector('english', content));

-- ============================================================================
-- EMAIL VERIFICATIONS TABLE
-- ============================================================================
CREATE TABLE email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ev_code_format CHECK (code ~ '^\d{6}$'),
    CONSTRAINT ev_max_attempts CHECK (attempts <= 5)
);

CREATE INDEX idx_email_verifications_email ON email_verifications(email);
CREATE INDEX idx_email_verifications_code ON email_verifications(code) WHERE verified = FALSE;
CREATE INDEX idx_email_verifications_expires ON email_verifications(expires_at);

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Key identification
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(64) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,

    -- Permissions
    permissions TEXT[] NOT NULL DEFAULT '{read}',

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    usage_count INTEGER NOT NULL DEFAULT 0,

    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT api_keys_hash_unique UNIQUE (key_hash),
    CONSTRAINT api_keys_prefix_format CHECK (key_prefix ~ '^hp_[a-zA-Z0-9]{8}$')
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_api_keys_permissions ON api_keys USING GIN(permissions);
```

### 2.3 Triggers and Functions

```sql
-- ============================================================================
-- AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_protocols_updated_at BEFORE UPDATE ON protocols
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recordings_updated_at BEFORE UPDATE ON recording_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_spr_updated_at BEFORE UPDATE ON signal_processing_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ca_updated_at BEFORE UPDATE ON clinical_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON clinical_annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_label_images_updated_at BEFORE UPDATE ON label_images
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_notes_updated_at BEFORE UPDATE ON admin_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AUDIT LOGGING FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
        VALUES (
            current_setting('app.current_user_id', TRUE)::UUID,
            'CREATE',
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object('new_data', to_jsonb(NEW))
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
        VALUES (
            current_setting('app.current_user_id', TRUE)::UUID,
            'UPDATE',
            TG_TABLE_NAME,
            NEW.id,
            jsonb_build_object(
                'old_data', to_jsonb(OLD),
                'new_data', to_jsonb(NEW),
                'changed_fields', (
                    SELECT jsonb_object_agg(key, value)
                    FROM jsonb_each(to_jsonb(NEW))
                    WHERE to_jsonb(OLD) -> key IS DISTINCT FROM value
                )
            )
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (user_id, action, resource, resource_id, details)
        VALUES (
            current_setting('app.current_user_id', TRUE)::UUID,
            'DELETE',
            TG_TABLE_NAME,
            OLD.id,
            jsonb_build_object('deleted_data', to_jsonb(OLD))
        );
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SOFT DELETE CASCADE FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION cascade_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- When a project is soft-deleted, cascade to related entities
    IF TG_TABLE_NAME = 'projects' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE patients SET deleted_at = NEW.deleted_at WHERE project_id = NEW.id AND deleted_at IS NULL;
        UPDATE recording_sessions SET deleted_at = NEW.deleted_at WHERE project_id = NEW.id AND deleted_at IS NULL;
    END IF;

    -- When a patient is soft-deleted, cascade to recordings
    IF TG_TABLE_NAME = 'patients' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        UPDATE recording_sessions SET deleted_at = NEW.deleted_at WHERE patient_model_id = NEW.id AND deleted_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cascade_project_soft_delete AFTER UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION cascade_soft_delete();
CREATE TRIGGER cascade_patient_soft_delete AFTER UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION cascade_soft_delete();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user has access to a project
CREATE OR REPLACE FUNCTION user_has_project_access(
    p_user_id UUID,
    p_project_id UUID,
    p_required_role project_role DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_project_owner UUID;
    v_member_role project_role;
BEGIN
    -- Check if user is the owner
    SELECT owner_id INTO v_project_owner FROM projects WHERE id = p_project_id AND deleted_at IS NULL;
    IF v_project_owner = p_user_id THEN
        RETURN TRUE;
    END IF;

    -- Check membership
    SELECT role INTO v_member_role FROM project_members WHERE project_id = p_project_id AND user_id = p_user_id;

    IF v_member_role IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_required_role IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check role hierarchy: owner > admin > member > viewer
    RETURN CASE v_member_role
        WHEN 'owner' THEN TRUE
        WHEN 'admin' THEN p_required_role IN ('admin', 'member', 'viewer')
        WHEN 'member' THEN p_required_role IN ('member', 'viewer')
        WHEN 'viewer' THEN p_required_role = 'viewer'
        ELSE FALSE
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get patient statistics
CREATE OR REPLACE FUNCTION get_patient_statistics(p_patient_id UUID)
RETURNS TABLE (
    total_recordings BIGINT,
    completed_recordings BIGINT,
    average_tremor_frequency DECIMAL,
    latest_overall_score DECIMAL,
    days_since_last_recording INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(rs.id) as total_recordings,
        COUNT(rs.id) FILTER (WHERE rs.status = 'completed') as completed_recordings,
        AVG(ca.tremor_frequency_hz)::DECIMAL as average_tremor_frequency,
        (
            SELECT ca2.overall_score
            FROM clinical_analyses ca2
            JOIN recording_sessions rs2 ON ca2.recording_session_id = rs2.id
            WHERE rs2.patient_model_id = p_patient_id AND rs2.deleted_at IS NULL
            ORDER BY ca2.created_at DESC
            LIMIT 1
        ) as latest_overall_score,
        EXTRACT(DAY FROM NOW() - MAX(rs.recording_date))::INTEGER as days_since_last_recording
    FROM recording_sessions rs
    LEFT JOIN clinical_analyses ca ON rs.id = ca.recording_session_id
    WHERE rs.patient_model_id = p_patient_id AND rs.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## 3. Migration Strategy

### 3.1 Pre-Migration Checklist

```bash
# 1. Backup existing SQLite database
cp backend-node/dev.db backend-node/dev.db.backup.$(date +%Y%m%d)

# 2. Export current data
sqlite3 backend-node/dev.db ".dump" > backup_full.sql

# 3. Set up PostgreSQL
docker run -d \
  --name synaptihand-postgres \
  -e POSTGRES_USER=synaptihand \
  -e POSTGRES_PASSWORD=secure_password \
  -e POSTGRES_DB=synaptihand \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

### 3.2 Prisma Schema Updates

```prisma
// prisma/schema.prisma

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Use native PostgreSQL enums
enum UserRole {
  patient
  clinician
  researcher
  admin
}

enum ApprovalStatus {
  pending
  approved
  rejected
}

enum GenderType {
  male
  female
  other
  prefer_not_to_say
}

enum RecordingStatus {
  created
  keypoints_uploaded
  analyzing
  video_uploaded
  completed
  error
  uploaded
  processing
  processed
  analyzed
  failed
}

// ... (continue with all models using proper PostgreSQL types)
```

### 3.3 Migration Steps

```bash
# Step 1: Update schema.prisma with PostgreSQL provider
# Step 2: Update .env with PostgreSQL connection string
DATABASE_URL="postgresql://synaptihand:password@localhost:5432/synaptihand"

# Step 3: Reset and regenerate
npx prisma migrate reset --force  # Development only!
npx prisma migrate dev --name postgresql_migration

# Step 4: Generate new client
npx prisma generate

# Step 5: Run data migration script (see below)
npm run migrate:data
```

### 3.4 Data Migration Script

```typescript
// scripts/migrate-to-postgresql.ts

import { PrismaClient as SQLiteClient } from '@prisma/client-sqlite';
import { PrismaClient as PostgresClient } from '@prisma/client';

async function migrateData() {
  const sqlite = new SQLiteClient();
  const postgres = new PostgresClient();

  try {
    // Migrate users first (no dependencies)
    console.log('Migrating users...');
    const users = await sqlite.user.findMany();
    for (const user of users) {
      await postgres.user.create({
        data: {
          ...user,
          // Convert string enum to proper enum
          role: user.role as any,
          // Parse JSON strings to objects
          registrationDevice: user.registrationDevice
            ? JSON.parse(user.registrationDevice)
            : null,
        },
      });
    }

    // Migrate projects
    console.log('Migrating projects...');
    const projects = await sqlite.project.findMany();
    for (const project of projects) {
      await postgres.project.create({ data: project });
    }

    // Continue with other tables in dependency order...
    // patients, protocols, recording_sessions, etc.

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sqlite.$disconnect();
    await postgres.$disconnect();
  }
}

migrateData();
```

---

## 4. Performance Optimizations

### 4.1 Connection Pooling

```typescript
// prisma/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### 4.2 PgBouncer Configuration

```ini
# pgbouncer.ini
[databases]
synaptihand = host=localhost port=5432 dbname=synaptihand

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
```

### 4.3 Query Optimization Examples

```sql
-- Optimized query for patient recordings with analysis
EXPLAIN ANALYZE
SELECT
    rs.id,
    rs.recording_date,
    rs.status,
    ca.overall_score,
    ca.tremor_frequency_hz
FROM recording_sessions rs
LEFT JOIN LATERAL (
    SELECT overall_score, tremor_frequency_hz
    FROM clinical_analyses
    WHERE recording_session_id = rs.id
    ORDER BY created_at DESC
    LIMIT 1
) ca ON TRUE
WHERE rs.patient_model_id = $1
  AND rs.deleted_at IS NULL
ORDER BY rs.recording_date DESC
LIMIT 20;

-- Use materialized view for dashboard statistics
CREATE MATERIALIZED VIEW patient_dashboard_stats AS
SELECT
    p.id as patient_id,
    p.patient_name,
    p.diagnosis,
    COUNT(rs.id) as total_recordings,
    COUNT(rs.id) FILTER (WHERE rs.status = 'completed') as completed_recordings,
    AVG(ca.overall_score) as avg_score,
    MAX(rs.recording_date) as last_recording
FROM patients p
LEFT JOIN recording_sessions rs ON p.id = rs.patient_model_id AND rs.deleted_at IS NULL
LEFT JOIN clinical_analyses ca ON rs.id = ca.recording_session_id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.patient_name, p.diagnosis;

CREATE UNIQUE INDEX ON patient_dashboard_stats(patient_id);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY patient_dashboard_stats;
```

---

## 5. Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SYNAPTIHAND POSTGRESQL SCHEMA                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐         │
│  │    USERS     │─────────│  PROJECT_MEMBERS │─────────│    PROJECTS     │         │
│  │──────────────│   1:N   │──────────────────│   N:1   │─────────────────│         │
│  │ id (PK)      │         │ id (PK)          │         │ id (PK)         │         │
│  │ email        │         │ project_id (FK)  │         │ name            │         │
│  │ role [ENUM]  │         │ user_id (FK)     │         │ owner_id (FK)   │         │
│  │ approval_sta-│         │ role [ENUM]      │         │ settings [JSONB]│         │
│  │ tus [ENUM]   │         │ added_at         │         │ deleted_at      │         │
│  │ deleted_at   │         └──────────────────┘         └────────┬────────┘         │
│  └──────┬───────┘                                               │                   │
│         │                                                       │                   │
│         │ 1:N                                                   │ 1:N               │
│         ▼                                                       ▼                   │
│  ┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐         │
│  │   SESSIONS   │         │    PROTOCOLS     │         │    PATIENTS     │         │
│  │──────────────│         │──────────────────│         │─────────────────│         │
│  │ id (PK)      │         │ id (PK)          │         │ id (PK)         │         │
│  │ user_id (FK) │         │ name             │         │ patient_id      │         │
│  │ token_hash   │         │ configuration    │         │ project_id (FK) │         │
│  │ expires_at   │         │ [JSONB]          │         │ diagnosis [ENUM]│         │
│  │ device_info  │         │ indicated_for[]  │         │ medical_history │         │
│  │ [JSONB]      │         │ deleted_at       │         │ [JSONB]         │         │
│  └──────────────┘         └────────┬─────────┘         │ deleted_at      │         │
│                                    │                   └────────┬────────┘         │
│                                    │ 1:N                        │                   │
│                                    ▼                            │ 1:N               │
│         ┌────────────────────────────────────────────────────────▼───────────┐      │
│         │                    RECORDING_SESSIONS                               │      │
│         │─────────────────────────────────────────────────────────────────────│      │
│         │ id (PK)                                                             │      │
│         │ patient_model_id (FK) ──────────────────────────────────────────────┤      │
│         │ clinician_id (FK)                                                   │      │
│         │ protocol_id (FK)                                                    │      │
│         │ project_id (FK)                                                     │      │
│         │ mobile_session_id (UNIQUE)                                          │      │
│         │ status [ENUM: created|keypoints_uploaded|analyzing|completed|...]   │      │
│         │ device_info [JSONB]                                                 │      │
│         │ processing_metadata [JSONB]                                         │      │
│         │ review_status [ENUM]                                                │      │
│         │ deleted_at                                                          │      │
│         └──────────┬───────────────────┬───────────────────┬─────────────────┘      │
│                    │                   │                   │                        │
│           1:N      │          1:N      │          1:N      │                        │
│           ▼        │           ▼       │           ▼       │                        │
│  ┌─────────────────┴─┐  ┌──────────────┴───┐  ┌───────────┴────────┐              │
│  │ SIGNAL_PROCESSING │  │ CLINICAL_ANALYSES │  │ LSTM_EVENT_DETECT- │              │
│  │ _RESULTS          │  │                   │  │ IONS               │              │
│  │───────────────────│  │───────────────────│  │────────────────────│              │
│  │ id (PK)           │  │ id (PK)           │  │ id (PK)            │              │
│  │ recording_session_│  │ recording_session_│  │ recording_session_-│              │
│  │ id (FK)           │  │ id (FK)           │  │ id (FK)            │              │
│  │ raw_landmarks     │  │ analysis_type     │  │ category [ENUM]    │              │
│  │ [JSONB]           │  │ [ENUM]            │  │ event_type         │              │
│  │ butterworth [JSONB│  │ tremor_frequency  │  │ start_frame        │              │
│  │ kalman [JSONB]    │  │ overall_score     │  │ end_frame          │              │
│  │ quality_metrics   │  │ severity_scores   │  │ confidence         │              │
│  │ [JSONB]           │  │ [JSONB]           │  │ raw_predictions    │              │
│  └───────────────────┘  │ rom_measurements  │  │ [JSONB]            │              │
│                         │ [JSONB]           │  └────────────────────┘              │
│                         └───────────────────┘                                      │
│                                                                                     │
│  ┌──────────────────┐   ┌───────────────────┐   ┌────────────────────┐            │
│  │ CLINICAL_ANNOTAT-│   │   LABEL_IMAGES    │   │      REPORTS       │            │
│  │ IONS             │   │                   │   │                    │            │
│  │──────────────────│   │───────────────────│   │────────────────────│            │
│  │ id (PK)          │   │ id (PK)           │   │ id (PK)            │            │
│  │ recording_session│   │ recording_session_│   │ recording_session_ │            │
│  │ _id (FK)         │◄──│ id (FK)           │   │ id (FK)            │            │
│  │ clinician_id (FK)│   │ annotation_id (FK)│   │ report_type [ENUM] │            │
│  │ annotation_type  │   │ image_source [ENUM│   │ configuration      │            │
│  │ [ENUM]           │   │ image_type [ENUM] │   │ [JSONB]            │            │
│  │ severity [ENUM]  │   │ landmarks_data    │   │ shared_with UUID[] │            │
│  │ content          │   │ [JSONB]           │   └────────────────────┘            │
│  └──────────────────┘   │ tags TEXT[]       │                                      │
│                         └───────────────────┘                                      │
│                                                                                     │
│  ┌──────────────────┐   ┌───────────────────┐   ┌────────────────────┐            │
│  │  AUDIT_LOGS      │   │   ADMIN_NOTES     │   │     API_KEYS       │            │
│  │  (PARTITIONED)   │   │                   │   │                    │            │
│  │──────────────────│   │───────────────────│   │────────────────────│            │
│  │ id (PK)          │   │ id (PK)           │   │ id (PK)            │            │
│  │ user_id (FK)     │   │ user_id (FK)      │   │ user_id (FK)       │            │
│  │ action           │   │ admin_id (FK)     │   │ key_hash           │            │
│  │ resource         │   │ note_type [ENUM]  │   │ permissions TEXT[] │            │
│  │ details [JSONB]  │   │ is_internal       │   │ is_active          │            │
│  │ status [ENUM]    │   │ content           │   │ expires_at         │            │
│  │ created_at       │   └───────────────────┘   └────────────────────┘            │
│  └──────────────────┘                                                              │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘

LEGEND:
═══════
[PK]     = Primary Key (UUID)
[FK]     = Foreign Key
[ENUM]   = PostgreSQL Native Enum Type
[JSONB]  = PostgreSQL JSONB Column (queryable JSON)
TEXT[]   = PostgreSQL Array Type
1:N      = One-to-Many Relationship
────►    = Foreign Key Reference Direction
```

---

## 6. Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] Set up PostgreSQL 16 server (Docker or managed)
- [ ] Configure PgBouncer for connection pooling
- [ ] Set up database backups (pg_dump/pg_basebackup)
- [ ] Configure monitoring (pg_stat_statements, pgmetrics)

### Phase 2: Schema Migration
- [ ] Update Prisma schema with PostgreSQL provider
- [ ] Create all ENUM types
- [ ] Create all tables with constraints
- [ ] Create indexes and triggers
- [ ] Test schema with Prisma migrate

### Phase 3: Data Migration
- [ ] Export SQLite data
- [ ] Transform JSON strings to JSONB
- [ ] Transform string enums to native enums
- [ ] Import to PostgreSQL
- [ ] Verify data integrity

### Phase 4: Application Updates
- [ ] Update environment variables
- [ ] Update Prisma client generation
- [ ] Test all CRUD operations
- [ ] Test complex queries
- [ ] Performance testing

### Phase 5: Production Deployment
- [ ] Set up production PostgreSQL instance
- [ ] Configure SSL/TLS
- [ ] Set up read replicas (if needed)
- [ ] Configure automated backups
- [ ] Deploy and monitor

---

## 7. Rollback Plan

If migration fails:
1. Stop application
2. Restore SQLite database from backup
3. Revert Prisma schema changes
4. Restart with SQLite configuration
5. Investigate and fix issues before retry

---

## 8. Maintenance Procedures

### Daily
- Monitor connection pool usage
- Check slow query log
- Verify backup completion

### Weekly
- Refresh materialized views
- Analyze table statistics
- Review audit log growth

### Monthly
- Create new audit_logs partitions
- Archive old partitions
- Review index usage
- Vacuum analyze all tables

```sql
-- Monthly maintenance script
DO $$
DECLARE
    next_month DATE := DATE_TRUNC('month', NOW()) + INTERVAL '2 months';
    partition_name TEXT;
BEGIN
    partition_name := 'audit_logs_' || TO_CHAR(next_month, 'YYYY_MM');
    EXECUTE FORMAT(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs
         FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        next_month,
        next_month + INTERVAL '1 month'
    );
END $$;

-- Vacuum and analyze
VACUUM ANALYZE;
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-18
**Author**: System Architect
