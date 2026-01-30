# Database Schema Documentation

## Overview

This document provides comprehensive documentation for the medical hand pose analysis platform database schema. The schema is designed for SQLite initially with a clear migration path to PostgreSQL.

---

## Architecture Overview

### Core Design Principles

1. **Medical Data Integrity**: All clinical data relationships use cascade deletes to maintain referential integrity
2. **Audit Trail**: Comprehensive audit logging for all user actions and data modifications
3. **Soft Deletes**: Critical models include `deletedAt` timestamp for data recovery
4. **Temporal Tracking**: All models include `createdAt` and `updatedAt` timestamps
5. **Version Control**: Processing and analysis results include version tracking for reproducibility
6. **Performance Optimization**: Strategic indexes for common query patterns

---

## Model Relationships

### Entity Relationship Summary

```
User (patient/clinician/admin/researcher)
├── owns → RecordingSession (as patient)
├── orders → RecordingSession (as clinician)
├── reviews → RecordingSession (as reviewer)
├── creates → Protocol
├── annotates → ClinicalAnnotation
├── authenticated via → Session
└── tracked in → AuditLog

RecordingSession (core entity)
├── belongs to → User (patient)
├── ordered by → User (clinician)
├── follows → Protocol
├── has → SignalProcessingResult (1:many)
├── has → ClinicalAnalysis (1:many)
├── has → Report (1:many)
├── has → ClinicalAnnotation (1:many)
├── compared in → RecordingComparison (as baseline)
└── compared in → RecordingComparison (as comparison)

Protocol
├── created by → User
└── used in → RecordingSession (1:many)

SignalProcessingResult
└── belongs to → RecordingSession

ClinicalAnalysis
└── belongs to → RecordingSession

ClinicalAnnotation
├── belongs to → RecordingSession
└── created by → User (clinician)

Report
└── belongs to → RecordingSession

RecordingComparison
├── baseline → RecordingSession
└── compared → RecordingSession
```

---

## Detailed Model Documentation

### 1. User Model

**Purpose**: Central authentication and role management for all platform users.

**Roles Supported**:
- `patient`: Individuals being assessed
- `clinician`: Medical professionals (neurologists, therapists, etc.)
- `admin`: Platform administrators
- `researcher`: Research personnel with analytics access

**Key Fields**:
- `licenseNumber`: Professional license for clinicians (for legal compliance)
- `specialty`: Clinical specialty for appropriate protocol recommendations
- `organization`: Institutional affiliation for data segregation
- `deletedAt`: Soft delete for user deactivation while preserving data history

**Relationships**:
- **1:many** with RecordingSession (as patient, clinician, reviewer)
- **1:many** with Protocol (creator)
- **1:many** with ClinicalAnnotation (author)
- **1:many** with Session (active sessions)
- **1:many** with AuditLog (action history)

**Query Patterns**:
```sql
-- Find all active clinicians in neurology
SELECT * FROM users
WHERE role = 'clinician'
  AND specialty = 'neurology'
  AND is_active = true
  AND deleted_at IS NULL;

-- Get patient with all their recordings
SELECT u.*, rs.*
FROM users u
LEFT JOIN recording_sessions rs ON rs.patient_id = u.id
WHERE u.id = ? AND u.role = 'patient';
```

---

### 2. Protocol Model

**Purpose**: Standardized clinical assessment templates for consistent evaluation.

**Use Cases**:
- Parkinson's tremor assessment protocol
- Post-stroke rehabilitation tracking
- Essential tremor evaluation
- Custom research protocols

**Configuration Structure** (JSON):
```json
{
  "movements": [
    {
      "name": "finger_tap",
      "duration": 30,
      "repetitions": 10,
      "hand": "both",
      "instructions": "Tap thumb and index finger..."
    },
    {
      "name": "rest_tremor",
      "duration": 60,
      "instructions": "Rest hands on lap..."
    }
  ],
  "requiredMetrics": [
    "tremor_frequency",
    "tremor_amplitude",
    "sparc",
    "asymmetry_index"
  ],
  "instructions": "Patient-facing instructions...",
  "clinicalGuidelines": "Interpretation guidelines for clinicians...",
  "scoring": {
    "mild": {"tremor_frequency": [0, 4], "amplitude": [0, 2]},
    "moderate": {"tremor_frequency": [4, 6], "amplitude": [2, 5]},
    "severe": {"tremor_frequency": [6, 10], "amplitude": [5, 10]}
  }
}
```

**Key Fields**:
- `isPublic`: Protocols can be shared across organization or kept private
- `indicatedFor`: Target conditions (e.g., "Parkinson's Disease, Essential Tremor")
- `contraindications`: Safety warnings (e.g., "Recent hand surgery")

---

### 3. RecordingSession Model

**Purpose**: Core entity representing a single patient assessment recording.

**Lifecycle States** (`status` field):
1. `uploaded`: Video/CSV uploaded to GCS, awaiting processing
2. `processing`: Signal processing pipeline in progress
3. `processed`: Raw data processed, awaiting clinical analysis
4. `analyzed`: Clinical metrics computed
5. `completed`: All analysis complete, report generated
6. `failed`: Processing error occurred

**Review States** (`reviewStatus` field):
- `pending`: Awaiting clinician review
- `approved`: Clinician approved results
- `flagged`: Results flagged for attention

**File Storage**:
- `videoPath`: GCS URI (e.g., `gs://handpose-recordings/patient123/2025-01-08/video.mp4`)
- `csvPath`: GCS URI for landmark data

**Processing Metadata Structure** (JSON):
```json
{
  "uploadedAt": "2025-01-08T10:30:00Z",
  "processingStartedAt": "2025-01-08T10:31:00Z",
  "processedAt": "2025-01-08T10:35:00Z",
  "errorDetails": null,
  "pipeline": "v2.1",
  "computeTime": 240
}
```

**Query Patterns**:
```sql
-- Get all completed recordings for a patient, most recent first
SELECT * FROM recording_sessions
WHERE patient_id = ?
  AND status = 'completed'
  AND deleted_at IS NULL
ORDER BY recording_date DESC;

-- Find recordings needing review
SELECT * FROM recording_sessions
WHERE review_status = 'pending'
  AND status IN ('analyzed', 'completed')
ORDER BY recording_date ASC;
```

---

### 4. SignalProcessingResult Model

**Purpose**: Store raw and filtered hand landmark data from 40+ adaptive filters.

**Data Storage Strategy**:

**For SQLite**: Each filter result stored as separate JSON string column
- Advantage: Simple querying of specific filter results
- Trade-off: Storage overhead, no JSON querying capabilities

**For PostgreSQL Migration**: Convert to JSONB or separate tables
- Option A: Single JSONB column with all filter results (better for small datasets)
- Option B: Separate `FilterResult` table with filter_name + data (better for large datasets)

**Raw Landmarks Structure** (JSON):
```json
[
  {
    "frame": 0,
    "timestamp": 0.0,
    "hand": "right",
    "landmarks": [
      {"id": 0, "name": "WRIST", "x": 0.5, "y": 0.5, "z": 0.0, "visibility": 0.98},
      {"id": 1, "name": "THUMB_CMC", "x": 0.52, "y": 0.48, "z": -0.02, "visibility": 0.95},
      // ... 19 more landmarks
    ]
  },
  // ... more frames
]
```

**Supported Filters**:
- **Smoothing**: Butterworth, Kalman, Savitzky-Golay, Moving Average, Exponential Smoothing
- **Frequency Domain**: FFT Filtered, Wavelet Denoised
- **Advanced**: Particle Filter, Unscented Kalman Filter

**Quality Metrics Structure** (JSON):
```json
{
  "confidence": [0.95, 0.98, 0.96, ...], // Per-frame confidence
  "jitter": 0.02, // Overall jitter metric
  "dropoutRate": 0.01, // Percentage of missing frames
  "occlusions": [{"frame": 45, "duration": 3, "landmarks": [5, 6]}],
  "qualityScore": 0.93 // Overall 0-1 score
}
```

---

### 5. ClinicalAnalysis Model

**Purpose**: Clinical metrics and medical assessments derived from processed data.

**Analysis Types**:
- `comprehensive`: Full metric suite (default)
- `tremor_focused`: Detailed tremor analysis for movement disorders
- `rom_focused`: Range of motion emphasis for rehabilitation
- `coordination_focused`: Fine motor coordination assessment

**Tremor Metrics**:
- `tremorFrequency`: Dominant tremor frequency in Hz (typically 4-6 Hz for Parkinson's)
- `tremorAmplitude`: Amplitude in millimeters
- `tremorRegularity`: Consistency score (0-1)
- `dominantFrequency`: Primary frequency component

**Frequency Spectrum Structure** (JSON):
```json
{
  "frequencies": [0.5, 1.0, 1.5, ..., 15.0], // Hz
  "power": [0.1, 0.3, 0.8, ..., 0.05], // Power spectral density
  "peaks": [
    {"frequency": 5.2, "power": 2.3, "width": 0.4},
    {"frequency": 10.4, "power": 0.8, "width": 0.2}
  ],
  "bandwidth": 0.6 // Frequency bandwidth of primary peak
}
```

**Smoothness Metrics**:
- `sparc`: Spectral Arc Length (lower = smoother, range: -10 to 0)
- `ldljv`: Log Dimensionless Jerk (lower = smoother)
- `normalizedJerk`: Normalized jerk metric

**ROM Measurements Structure** (JSON):
```json
{
  "wrist": {
    "flexion": 70, // degrees
    "extension": 80,
    "radialDeviation": 20,
    "ulnarDeviation": 30
  },
  "fingers": {
    "thumb": {"abduction": 60, "opposition": 8},
    "index": {"mcp": 90, "pip": 100, "dip": 80},
    "middle": {"mcp": 90, "pip": 100, "dip": 80},
    "ring": {"mcp": 90, "pip": 100, "dip": 80},
    "pinky": {"mcp": 90, "pip": 100, "dip": 80}
  }
}
```

**Severity Scores Structure** (JSON):
```json
{
  "UPDRS": 2, // Unified Parkinson's Disease Rating Scale (0-4)
  "ARAT": 45, // Action Research Arm Test (0-57)
  "WMFT": 3.2, // Wolf Motor Function Test
  "customScale": 3, // Organization-specific scale
  "confidence": 0.85 // Confidence in automated scoring
}
```

---

### 6. ClinicalAnnotation Model

**Purpose**: Clinician observations, diagnoses, and flags on recordings.

**Annotation Types**:
- `observation`: Clinical observation (e.g., "Resting tremor present in right hand")
- `diagnosis`: Diagnostic impression
- `recommendation`: Treatment or follow-up recommendations
- `flag`: Attention required (e.g., "Abnormal movement pattern detected")

**Use Cases**:
- Mark specific moments in video requiring attention
- Document clinical reasoning
- Flag data quality issues
- Track resolution of flagged items

**Temporal Annotations**:
- `timestampStart` and `timestampEnd` allow annotations on specific video segments
- Useful for marking tremor episodes, involuntary movements, etc.

---

### 7. Report Model

**Purpose**: Generated PDF reports for clinical documentation and patient records.

**Report Types**:
- `clinical`: Standard clinical assessment report
- `research`: Research-focused with detailed metrics
- `comparison`: Longitudinal comparison report
- `progress`: Progress summary over multiple sessions

**Configuration Structure** (JSON):
```json
{
  "includedSections": [
    "patient_info",
    "recording_metadata",
    "tremor_analysis",
    "rom_measurements",
    "clinical_summary"
  ],
  "metrics": [
    "tremor_frequency",
    "sparc",
    "asymmetry_index"
  ],
  "visualizations": [
    {"type": "frequency_spectrum", "style": "line"},
    {"type": "tremor_timeline", "style": "heatmap"},
    {"type": "rom_comparison", "style": "radar"}
  ],
  "branding": {
    "organizationLogo": "gs://...",
    "footer": "Confidential Medical Record"
  }
}
```

**Access Control**:
- `isShared`: Report shared with other users
- `sharedWith`: JSON array of user IDs with access

---

### 8. RecordingComparison Model

**Purpose**: Track longitudinal changes and treatment response over time.

**Comparison Types**:
- `longitudinal`: Same patient, different time points (track disease progression)
- `bilateral`: Left vs right hand comparison (asymmetry analysis)
- `treatment_response`: Pre/post treatment comparison

**Metric Differences Structure** (JSON):
```json
{
  "tremorFrequency": {
    "baseline": 5.2,
    "compared": 4.8,
    "absoluteChange": -0.4,
    "percentChange": -7.7,
    "clinicallySignificant": true
  },
  "tremorAmplitude": {
    "baseline": 3.5,
    "compared": 2.8,
    "absoluteChange": -0.7,
    "percentChange": -20.0,
    "clinicallySignificant": true
  },
  "sparc": {
    "baseline": -2.5,
    "compared": -2.1,
    "absoluteChange": 0.4,
    "percentChange": -16.0,
    "clinicallySignificant": false
  }
}
```

**Statistical Tests Structure** (JSON):
```json
{
  "pairedTTest": {
    "metric": "tremor_frequency",
    "tStatistic": -2.45,
    "pValue": 0.023,
    "significant": true,
    "alpha": 0.05
  },
  "effectSize": {
    "cohensD": 0.68,
    "interpretation": "medium"
  },
  "clinicalSignificance": {
    "minimalDetectableChange": 0.3,
    "observed": 0.4,
    "clinicallyMeaningful": true
  }
}
```

---

## Index Strategy

### Performance Optimization Principles

1. **Foreign Key Indexes**: All foreign key columns indexed for JOIN performance
2. **Filter Columns**: Status, date, and role columns indexed for WHERE clauses
3. **Sort Columns**: Date columns indexed for ORDER BY operations
4. **Composite Indexes**: Considered for common multi-column queries (future optimization)

### Current Index Coverage

#### User Model
- `email` (unique): Authentication lookup
- `role`: Role-based access control queries
- `isActive`: Filter active users
- `deletedAt`: Exclude soft-deleted records

#### RecordingSession Model
- `patientId`: Patient's recording history
- `clinicianId`: Clinician's ordered assessments
- `protocolId`: Protocol usage tracking
- `status`: Workflow state filtering
- `recordingDate`: Chronological sorting
- `reviewStatus`: Review queue management
- `createdAt`: Recent activity queries

#### SignalProcessingResult Model
- `recordingSessionId`: Link to recording
- `processingVersion`: Version-specific queries
- `createdAt`: Processing history

#### ClinicalAnalysis Model
- `recordingSessionId`: Link to recording
- `analysisVersion`: Version tracking
- `analysisType`: Analysis type filtering
- `createdAt`: Analysis history

#### ClinicalAnnotation Model
- `recordingSessionId`: Recording's annotations
- `clinicianId`: Clinician's annotations
- `annotationType`: Type-based filtering
- `isResolved`: Pending items queue

#### Report Model
- `recordingSessionId`: Recording's reports
- `reportType`: Type-based filtering
- `generatedAt`: Generation history

#### RecordingComparison Model
- `baselineRecordingId`: Baseline recording lookups
- `comparedRecordingId`: Comparison recording lookups
- `comparisonType`: Type-based filtering
- `createdAt`: Comparison history

#### Session Model
- `userId`: User session lookup
- `tokenHash`: Token validation
- `expiresAt`: Cleanup expired sessions

#### AuditLog Model
- `userId`: User activity history
- `action`: Action-based filtering
- `resource`: Resource-based filtering
- `createdAt`: Time-based queries

---

## SQLite Constraints & Considerations

### Current SQLite Limitations

1. **No Native JSON Type**:
   - **Current**: Store as TEXT, parse in application layer
   - **Impact**: No JSON querying in database (e.g., `JSON_EXTRACT`)
   - **Workaround**: Extract key metrics to top-level columns for filtering

2. **Limited ALTER TABLE Support**:
   - **Current**: Cannot drop columns, limited modifications
   - **Impact**: Schema changes require table recreation
   - **Mitigation**: Plan schema carefully, use migrations for changes

3. **No Array Types**:
   - **Current**: Store arrays as JSON strings
   - **Impact**: Cannot use array operations in queries

4. **Single Writer Concurrency**:
   - **Current**: Multiple readers OK, but only one concurrent write
   - **Impact**: May cause bottlenecks under high write load
   - **Mitigation**: Use queue for write operations

5. **No Full-Text Search**:
   - **Current**: Use LIKE queries (slower)
   - **Alternative**: Enable FTS5 extension if needed

### SQLite Advantages (Current Phase)

1. **Simplicity**: Zero configuration, file-based
2. **Portability**: Easy backup (single file)
3. **Development Speed**: No database server setup
4. **Cost**: Zero infrastructure cost
5. **Sufficient for MVP**: Handles 1000s of recordings without issues

---

## PostgreSQL Migration Path

### Migration Timing Triggers

Migrate when:
1. **Concurrent write load** exceeds SQLite single-writer limit
2. **JSON querying** becomes critical for analytics
3. **Dataset size** approaches 100GB (SQLite performs well up to ~1TB, but optimization becomes harder)
4. **Advanced features** needed (full-text search, PostGIS for spatial analysis)
5. **Multi-region deployment** required

### Schema Changes for PostgreSQL

#### 1. JSON to JSONB Conversion

```prisma
// Change from:
configuration String  // JSON string

// To:
configuration Json  // Native JSONB in PostgreSQL
```

**Models to update**:
- Protocol: `configuration`
- RecordingSession: `deviceInfo`, `processingMetadata`
- SignalProcessingResult: All filter columns, `qualityMetrics`
- ClinicalAnalysis: `frequencySpectrum`, `romMeasurements`, `asymmetryDetails`, `severityScores`, `qualityFlags`
- Report: `configuration`, `sharedWith`
- RecordingComparison: `metricDifferences`, `statisticalTests`

#### 2. Advanced Indexing

```sql
-- GIN indexes for JSONB columns (fast JSON queries)
CREATE INDEX idx_protocol_config_movements
ON protocols USING GIN ((configuration->'movements'));

-- Full-text search indexes
CREATE INDEX idx_clinical_notes_fts
ON recording_sessions USING GIN (to_tsvector('english', clinical_notes));

-- Partial indexes (smaller, faster)
CREATE INDEX idx_active_recordings
ON recording_sessions (patient_id, recording_date)
WHERE deleted_at IS NULL AND status = 'completed';

-- Expression indexes
CREATE INDEX idx_patient_email_lower
ON users (LOWER(email))
WHERE role = 'patient';
```

#### 3. Advanced Data Types

```sql
-- Array types for multi-value fields
ALTER TABLE clinical_analyses
ADD COLUMN quality_issues TEXT[] DEFAULT '{}';

-- Range types for date ranges
ALTER TABLE recording_sessions
ADD COLUMN analysis_window tstzrange;

-- Point types for spatial data (if adding 3D visualization)
-- Requires PostGIS extension
```

#### 4. Partitioning Strategy

For large datasets, partition by date:

```sql
-- Partition recording_sessions by month
CREATE TABLE recording_sessions_2025_01
PARTITION OF recording_sessions
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE recording_sessions_2025_02
PARTITION OF recording_sessions
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

#### 5. Materialized Views

Create pre-computed views for analytics:

```sql
-- Patient statistics dashboard
CREATE MATERIALIZED VIEW patient_statistics AS
SELECT
  p.id as patient_id,
  COUNT(rs.id) as total_recordings,
  AVG(ca.tremor_frequency) as avg_tremor_freq,
  AVG(ca.sparc) as avg_smoothness,
  MAX(rs.recording_date) as last_recording
FROM users p
LEFT JOIN recording_sessions rs ON rs.patient_id = p.id
LEFT JOIN clinical_analyses ca ON ca.recording_session_id = rs.id
WHERE p.role = 'patient' AND rs.deleted_at IS NULL
GROUP BY p.id;

-- Refresh strategy
CREATE INDEX ON patient_statistics (patient_id);
REFRESH MATERIALIZED VIEW CONCURRENTLY patient_statistics;
```

### Migration Execution Plan

```typescript
// 1. Schema migration
// Update prisma/schema.prisma datasource
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 2. Data migration script
import { PrismaClient as SQLiteClient } from './generated/sqlite-client';
import { PrismaClient as PostgresClient } from './generated/postgres-client';

async function migrate() {
  const sqlite = new SQLiteClient();
  const postgres = new PostgresClient();

  // Migrate in order of dependencies
  // 1. Users (no dependencies)
  const users = await sqlite.user.findMany();
  for (const user of users) {
    await postgres.user.create({
      data: {
        ...user,
        // Parse JSON strings to objects for PostgreSQL
        // No changes needed for User model
      }
    });
  }

  // 2. Protocols
  const protocols = await sqlite.protocol.findMany();
  for (const protocol of protocols) {
    await postgres.protocol.create({
      data: {
        ...protocol,
        configuration: JSON.parse(protocol.configuration), // String -> JSON
      }
    });
  }

  // 3. RecordingSessions
  // ... similar pattern

  // 4. Create indexes
  await postgres.$executeRaw`
    CREATE INDEX CONCURRENTLY idx_protocol_config
    ON protocols USING GIN (configuration);
  `;
}
```

---

## Query Optimization Patterns

### Common Query Patterns

#### 1. Patient Dashboard

```typescript
// Get patient overview with latest metrics
const patientOverview = await prisma.user.findUnique({
  where: { id: patientId },
  include: {
    patientRecordings: {
      where: {
        status: 'completed',
        deletedAt: null,
      },
      orderBy: { recordingDate: 'desc' },
      take: 10,
      include: {
        clinicalAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        protocol: true,
      },
    },
  },
});
```

#### 2. Clinician Review Queue

```typescript
// Get recordings awaiting review, prioritized by date
const reviewQueue = await prisma.recordingSession.findMany({
  where: {
    clinicianId: clinicianId,
    reviewStatus: 'pending',
    status: { in: ['analyzed', 'completed'] },
    deletedAt: null,
  },
  orderBy: { recordingDate: 'asc' },
  include: {
    patient: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    protocol: {
      select: { name: true },
    },
    clinicalAnalyses: {
      orderBy: { createdAt: 'desc' },
      take: 1,
    },
  },
});
```

#### 3. Longitudinal Comparison

```typescript
// Get all recordings for a patient for trend analysis
const longitudinalData = await prisma.recordingSession.findMany({
  where: {
    patientId: patientId,
    status: 'completed',
    deletedAt: null,
  },
  orderBy: { recordingDate: 'asc' },
  include: {
    clinicalAnalyses: {
      select: {
        tremorFrequency: true,
        tremorAmplitude: true,
        sparc: true,
        asymmetryIndex: true,
        overallScore: true,
        createdAt: true,
      },
    },
  },
});
```

#### 4. Protocol Usage Analytics

```typescript
// Get protocol usage statistics
const protocolStats = await prisma.protocol.findMany({
  include: {
    _count: {
      select: { recordings: true },
    },
    recordings: {
      where: {
        status: 'completed',
        deletedAt: null,
      },
      include: {
        clinicalAnalyses: {
          select: {
            overallScore: true,
            confidence: true,
          },
        },
      },
    },
  },
});
```

### Performance Optimization Tips

1. **Select Only Required Fields**:
```typescript
// Bad: Fetches entire JSON strings (large payload)
const recordings = await prisma.recordingSession.findMany({
  include: { signalProcessingResults: true }
});

// Good: Select specific fields
const recordings = await prisma.recordingSession.findMany({
  include: {
    signalProcessingResults: {
      select: { id: true, processingVersion: true, createdAt: true }
    }
  }
});
```

2. **Paginate Large Result Sets**:
```typescript
const pageSize = 20;
const page = 1;

const recordings = await prisma.recordingSession.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: { recordingDate: 'desc' },
});

const totalCount = await prisma.recordingSession.count();
```

3. **Use Transactions for Consistency**:
```typescript
// Atomic creation of recording with initial analysis
const result = await prisma.$transaction(async (tx) => {
  const recording = await tx.recordingSession.create({
    data: recordingData,
  });

  const analysis = await tx.clinicalAnalysis.create({
    data: {
      recordingSessionId: recording.id,
      ...analysisData,
    },
  });

  return { recording, analysis };
});
```

4. **Batch Operations**:
```typescript
// Create multiple annotations at once
await prisma.clinicalAnnotation.createMany({
  data: annotations.map(a => ({
    recordingSessionId: recordingId,
    clinicianId: clinicianId,
    ...a,
  })),
});
```

---

## Data Integrity & Validation

### Cascade Delete Strategy

**Models with CASCADE**:
- `Session → User`: Delete sessions when user deleted
- `SignalProcessingResult → RecordingSession`: Delete results with recording
- `ClinicalAnalysis → RecordingSession`: Delete analyses with recording
- `ClinicalAnnotation → RecordingSession`: Delete annotations with recording
- `Report → RecordingSession`: Delete reports with recording
- `RecordingComparison → RecordingSession`: Delete comparisons with recording

**Rationale**: These are dependent entities with no independent value.

**Models WITHOUT CASCADE**:
- `RecordingSession → User`: Preserve recordings even if user deleted (soft delete user instead)
- `Protocol → User`: Preserve protocols even if creator deleted

### Soft Delete Implementation

```typescript
// Soft delete a recording
await prisma.recordingSession.update({
  where: { id: recordingId },
  data: { deletedAt: new Date() },
});

// Query excludes soft-deleted by default
const activeRecordings = await prisma.recordingSession.findMany({
  where: {
    patientId: patientId,
    deletedAt: null, // Explicit filter
  },
});

// Restore soft-deleted
await prisma.recordingSession.update({
  where: { id: recordingId },
  data: { deletedAt: null },
});

// Permanently delete (use with caution)
await prisma.recordingSession.delete({
  where: { id: recordingId },
});
```

### Data Validation Rules

Implement in application layer (Zod, class-validator, etc.):

```typescript
// Example validation schema
const RecordingSessionCreateSchema = z.object({
  patientId: z.string().uuid(),
  clinicianId: z.string().uuid().optional(),
  protocolId: z.string().uuid().optional(),
  duration: z.number().int().min(1).max(3600), // 1 second to 1 hour
  fps: z.number().int().min(15).max(120),
  videoPath: z.string().startsWith('gs://'),
  csvPath: z.string().startsWith('gs://'),
  deviceInfo: z.object({
    deviceType: z.enum(['webcam', 'mobile', 'tablet']),
    model: z.string(),
    resolution: z.string().regex(/^\d+x\d+$/),
  }),
});
```

---

## Security Considerations

### 1. Access Control Queries

```typescript
// Ensure user can only access their own data
async function getPatientRecordings(userId: string, requestingUserId: string) {
  // Check if requesting user is the patient or their clinician
  const hasAccess = await prisma.recordingSession.findFirst({
    where: {
      id: recordingId,
      OR: [
        { patientId: requestingUserId },
        { clinicianId: requestingUserId },
        { reviewedById: requestingUserId },
      ],
    },
  });

  if (!hasAccess) {
    throw new UnauthorizedError('Access denied');
  }

  return prisma.recordingSession.findMany({
    where: { patientId: userId },
  });
}
```

### 2. Audit Logging

```typescript
// Log all sensitive operations
async function createRecording(data: RecordingData, userId: string) {
  const recording = await prisma.recordingSession.create({ data });

  await prisma.auditLog.create({
    data: {
      userId: userId,
      action: 'CREATE',
      resource: 'RecordingSession',
      resourceId: recording.id,
      details: JSON.stringify({ protocolId: data.protocolId }),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  return recording;
}
```

### 3. Data Anonymization

```typescript
// For research datasets, anonymize patient data
async function exportAnonymizedData(recordingIds: string[]) {
  const recordings = await prisma.recordingSession.findMany({
    where: { id: { in: recordingIds } },
    include: {
      patient: {
        select: { id: true }, // Only include ID for mapping
      },
      clinicalAnalyses: true,
      signalProcessingResults: {
        select: {
          // Exclude raw landmarks (may contain identifying info)
          id: true,
          butterworth: true,
          kalman: true,
          qualityMetrics: true,
        },
      },
    },
  });

  // Replace patient IDs with anonymous IDs
  return recordings.map((r, idx) => ({
    ...r,
    patientId: `ANON_${idx}`,
    patient: undefined,
    videoPath: undefined, // Remove video reference
  }));
}
```

---

## Testing Strategy

### 1. Migration Testing

```typescript
// Test SQLite schema
describe('Prisma Schema', () => {
  it('should create recording with all relationships', async () => {
    const user = await prisma.user.create({
      data: { email: 'test@example.com', passwordHash: 'hash', role: 'patient' },
    });

    const protocol = await prisma.protocol.create({
      data: {
        name: 'Test Protocol',
        configuration: JSON.stringify({ movements: [] }),
        createdById: user.id,
      },
    });

    const recording = await prisma.recordingSession.create({
      data: {
        patientId: user.id,
        protocolId: protocol.id,
        status: 'uploaded',
      },
    });

    expect(recording.id).toBeDefined();
  });
});
```

### 2. Query Performance Testing

```typescript
// Benchmark common queries
describe('Query Performance', () => {
  it('should load patient dashboard in <100ms', async () => {
    const start = Date.now();

    await prisma.user.findUnique({
      where: { id: patientId },
      include: {
        patientRecordings: {
          take: 10,
          include: { clinicalAnalyses: { take: 1 } },
        },
      },
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100);
  });
});
```

---

## Future Extensions

### Prepared Model Structures

When adding these models, follow established patterns:

1. **PatientProfile**: Extended demographics and medical history
   - Link to User (1:1)
   - Include: demographics, conditions, medications, allergies
   - HIPAA compliance considerations

2. **TreatmentPlan**: Track interventions and outcomes
   - Link to User (patient)
   - Link to RecordingSession (assessment points)
   - Include: interventions, goals, outcomes

3. **MachineLearningModel**: Model versioning and performance
   - Track model versions, training data, performance metrics
   - Link to ClinicalAnalysis (which model version used)

4. **ResearchStudy**: Group recordings for research
   - Many-to-many with RecordingSession
   - Include: IRB approval, consent forms, study protocol

5. **NotificationPreference**: User notification settings
   - Link to User
   - Include: email, SMS, in-app preferences

6. **SystemConfiguration**: Application-wide settings
   - Singleton pattern
   - Include: feature flags, processing defaults

---

## Maintenance & Monitoring

### Database Health Checks

```typescript
// Check for orphaned records
async function findOrphanedRecords() {
  const orphanedAnalyses = await prisma.clinicalAnalysis.findMany({
    where: {
      recordingSession: null, // Should never happen with foreign key
    },
  });

  return orphanedAnalyses;
}

// Monitor processing pipeline
async function getProcessingHealth() {
  const stuckRecordings = await prisma.recordingSession.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: new Date(Date.now() - 60 * 60 * 1000), // Older than 1 hour
      },
    },
  });

  return {
    stuck: stuckRecordings.length,
    recordings: stuckRecordings,
  };
}
```

### Backup Strategy

```bash
# SQLite backup (simple file copy)
cp prisma/dev.db prisma/backups/dev_$(date +%Y%m%d_%H%M%S).db

# PostgreSQL backup
pg_dump handpose_db > backups/handpose_$(date +%Y%m%d_%H%M%S).sql
```

---

## Summary

This schema provides:

1. **Comprehensive medical data model** supporting all PRD requirements
2. **Flexible JSON storage** for complex data structures (adaptable to 40+ filters)
3. **Clinical workflow support** with status tracking and review processes
4. **Longitudinal tracking** for disease progression and treatment response
5. **Clear migration path** from SQLite to PostgreSQL as scale demands
6. **Performance optimized** with strategic indexes for common query patterns
7. **Data integrity** through cascade deletes and soft delete support
8. **Security foundation** with audit logging and access control patterns

The schema balances immediate needs (SQLite simplicity) with future scalability (PostgreSQL readiness), following medical data best practices throughout.
