# Database Migration Guide

## Quick Start

### 1. Generate Migration

```bash
# From backend-node directory
npx prisma migrate dev --name initial_medical_schema
```

This will:
- Generate SQL migration files
- Apply migration to database
- Regenerate Prisma Client

### 2. Verify Migration

```bash
# Check migration status
npx prisma migrate status

# View generated SQL
cat prisma/migrations/*/migration.sql
```

### 3. Regenerate Client

```bash
npx prisma generate
```

---

## Step-by-Step Migration Process

### Phase 1: Schema Setup (Current)

**Objective**: Deploy complete medical data schema with SQLite.

```bash
# 1. Backup existing database
cp prisma/dev.db prisma/dev.db.backup

# 2. Create migration
npx prisma migrate dev --name add_medical_models

# 3. Verify tables created
sqlite3 prisma/dev.db ".tables"
# Expected output:
# audit_logs                 recording_comparisons
# clinical_analyses          recording_sessions
# clinical_annotations       reports
# protocols                  sessions
# signal_processing_results  users
```

**Validation Queries**:

```sql
-- Check all tables exist
SELECT name FROM sqlite_master WHERE type='table';

-- Verify indexes
SELECT name, tbl_name FROM sqlite_master WHERE type='index';

-- Check foreign keys enabled
PRAGMA foreign_keys;
```

---

### Phase 2: Seed Initial Data (Optional)

Create initial protocols, test users, etc.

```bash
npx prisma db seed
```

**Seed Script** (`prisma/seed.ts`):

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@handpose.local' },
    update: {},
    create: {
      email: 'admin@handpose.local',
      passwordHash: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      isActive: true,
    },
  });
  console.log('Created admin:', admin.email);

  // Create sample clinician
  const clinicianPassword = await bcrypt.hash('clinician123', 10);
  const clinician = await prisma.user.upsert({
    where: { email: 'clinician@handpose.local' },
    update: {},
    create: {
      email: 'clinician@handpose.local',
      passwordHash: clinicianPassword,
      firstName: 'Dr. Jane',
      lastName: 'Smith',
      role: 'clinician',
      specialty: 'neurology',
      licenseNumber: 'MD-12345',
      organization: 'Medical Center',
      isActive: true,
    },
  });
  console.log('Created clinician:', clinician.email);

  // Create sample patient
  const patientPassword = await bcrypt.hash('patient123', 10);
  const patient = await prisma.user.upsert({
    where: { email: 'patient@handpose.local' },
    update: {},
    create: {
      email: 'patient@handpose.local',
      passwordHash: patientPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'patient',
      isActive: true,
    },
  });
  console.log('Created patient:', patient.email);

  // Create sample protocol
  const protocol = await prisma.protocol.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Parkinson\'s Tremor Assessment',
      description: 'Standard protocol for assessing tremor in Parkinson\'s disease patients',
      version: '1.0',
      configuration: JSON.stringify({
        movements: [
          {
            name: 'rest_tremor',
            duration: 60,
            instructions: 'Rest hands on lap, palms up, stay relaxed',
          },
          {
            name: 'postural_tremor',
            duration: 30,
            instructions: 'Extend arms forward, palms down',
          },
          {
            name: 'kinetic_tremor',
            duration: 30,
            repetitions: 10,
            instructions: 'Touch nose with index finger repeatedly',
          },
        ],
        requiredMetrics: [
          'tremor_frequency',
          'tremor_amplitude',
          'tremor_regularity',
          'asymmetry_index',
        ],
        instructions: 'Follow the on-screen prompts for each movement.',
        clinicalGuidelines: 'Evaluate tremor presence, frequency, and asymmetry.',
      }),
      indicatedFor: 'Parkinson\'s Disease, Essential Tremor',
      contraindications: 'Recent hand surgery, severe arthritis',
      createdById: clinician.id,
      isPublic: true,
      isActive: true,
    },
  });
  console.log('Created protocol:', protocol.name);

  // Create sample recording session
  const recording = await prisma.recordingSession.create({
    data: {
      patientId: patient.id,
      clinicianId: clinician.id,
      protocolId: protocol.id,
      recordingDate: new Date(),
      duration: 120,
      fps: 30,
      deviceInfo: JSON.stringify({
        deviceType: 'webcam',
        model: 'Logitech C920',
        resolution: '1920x1080',
      }),
      videoPath: 'gs://handpose-recordings/sample/video.mp4',
      csvPath: 'gs://handpose-recordings/sample/landmarks.csv',
      status: 'completed',
      processingMetadata: JSON.stringify({
        uploadedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        pipeline: 'v1.0',
        computeTime: 45,
      }),
      reviewStatus: 'pending',
    },
  });
  console.log('Created recording session:', recording.id);

  // Create sample clinical analysis
  const analysis = await prisma.clinicalAnalysis.create({
    data: {
      recordingSessionId: recording.id,
      analysisVersion: '1.0',
      analysisType: 'comprehensive',
      tremorFrequency: 5.2,
      tremorAmplitude: 3.5,
      tremorRegularity: 0.85,
      dominantFrequency: 5.2,
      frequencySpectrum: JSON.stringify({
        frequencies: [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0],
        power: [0.1, 0.15, 0.2, 0.25, 0.4, 0.6, 0.8, 1.2, 1.8, 2.3, 1.5, 0.8],
        peaks: [
          { frequency: 5.2, power: 2.3, width: 0.4 },
          { frequency: 10.4, power: 0.8, width: 0.2 },
        ],
      }),
      sparc: -2.5,
      ldljv: 3.2,
      normalizedJerk: 0.15,
      romMeasurements: JSON.stringify({
        wrist: { flexion: 70, extension: 80, radialDeviation: 20, ulnarDeviation: 30 },
        fingers: {
          thumb: { abduction: 60, opposition: 8 },
          index: { mcp: 90, pip: 100, dip: 80 },
        },
      }),
      asymmetryIndex: 0.15,
      asymmetryDetails: JSON.stringify({
        left: { tremor: 5.2, amplitude: 3.5 },
        right: { tremor: 4.8, amplitude: 3.0 },
      }),
      coordinationScore: 75,
      reactionTime: 320,
      movementAccuracy: 0.85,
      severityScores: JSON.stringify({
        UPDRS: 2,
        customScale: 3,
        confidence: 0.85,
      }),
      overallScore: 72,
      clinicalSummary: 'Moderate resting tremor present, predominantly on right side. Good coordination and range of motion.',
      confidence: 0.88,
      qualityFlags: JSON.stringify([]),
    },
  });
  console.log('Created clinical analysis:', analysis.id);

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Update package.json**:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

---

### Phase 3: PostgreSQL Migration (Future)

**When to Migrate**:
- Concurrent write load exceeds SQLite limits
- JSON querying becomes critical
- Dataset approaches 100GB
- Multi-region deployment needed

**Migration Steps**:

#### 1. Setup PostgreSQL

```bash
# Local development (Docker)
docker run --name handpose-postgres \
  -e POSTGRES_PASSWORD=handpose \
  -e POSTGRES_DB=handpose_db \
  -p 5432:5432 \
  -d postgres:15

# Or use managed service (GCP Cloud SQL, AWS RDS, etc.)
```

#### 2. Update Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Update `.env`:

```env
# SQLite
# DATABASE_URL="file:./dev.db"

# PostgreSQL
DATABASE_URL="postgresql://postgres:handpose@localhost:5432/handpose_db"
```

#### 3. Convert JSON Strings to Native JSON

Before migration, update schema:

```prisma
model Protocol {
  // Change from:
  configuration String  // JSON string

  // To:
  configuration Json    // Native JSON/JSONB
}
```

Apply to all JSON fields in:
- Protocol: `configuration`
- RecordingSession: `deviceInfo`, `processingMetadata`
- SignalProcessingResult: All filter columns, `qualityMetrics`
- ClinicalAnalysis: `frequencySpectrum`, `romMeasurements`, etc.
- Report: `configuration`, `sharedWith`
- RecordingComparison: `metricDifferences`, `statisticalTests`

#### 4. Create Migration

```bash
# Generate PostgreSQL migration
npx prisma migrate dev --name migrate_to_postgresql
```

#### 5. Data Migration Script

```typescript
// scripts/migrate-sqlite-to-postgres.ts
import { PrismaClient as SQLiteClient } from '../generated/sqlite-client';
import { PrismaClient as PostgresClient } from '@prisma/client';

const sqlite = new SQLiteClient({
  datasources: { db: { url: 'file:./dev.db' } },
});

const postgres = new PostgresClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
});

async function migrate() {
  console.log('Starting migration from SQLite to PostgreSQL...');

  try {
    // 1. Migrate Users
    console.log('Migrating users...');
    const users = await sqlite.user.findMany();
    for (const user of users) {
      await postgres.user.upsert({
        where: { id: user.id },
        update: {},
        create: user,
      });
    }
    console.log(`Migrated ${users.length} users`);

    // 2. Migrate Sessions
    console.log('Migrating sessions...');
    const sessions = await sqlite.session.findMany();
    for (const session of sessions) {
      await postgres.session.upsert({
        where: { id: session.id },
        update: {},
        create: session,
      });
    }
    console.log(`Migrated ${sessions.length} sessions`);

    // 3. Migrate AuditLogs
    console.log('Migrating audit logs...');
    const auditLogs = await sqlite.auditLog.findMany();
    for (const log of auditLogs) {
      await postgres.auditLog.create({
        data: log,
      });
    }
    console.log(`Migrated ${auditLogs.length} audit logs`);

    // 4. Migrate Protocols
    console.log('Migrating protocols...');
    const protocols = await sqlite.protocol.findMany();
    for (const protocol of protocols) {
      await postgres.protocol.upsert({
        where: { id: protocol.id },
        update: {},
        create: {
          ...protocol,
          configuration: JSON.parse(protocol.configuration), // Parse JSON string
        },
      });
    }
    console.log(`Migrated ${protocols.length} protocols`);

    // 5. Migrate RecordingSessions
    console.log('Migrating recording sessions...');
    const recordings = await sqlite.recordingSession.findMany();
    for (const recording of recordings) {
      await postgres.recordingSession.upsert({
        where: { id: recording.id },
        update: {},
        create: {
          ...recording,
          deviceInfo: recording.deviceInfo ? JSON.parse(recording.deviceInfo) : null,
          processingMetadata: recording.processingMetadata
            ? JSON.parse(recording.processingMetadata)
            : null,
        },
      });
    }
    console.log(`Migrated ${recordings.length} recording sessions`);

    // 6. Migrate SignalProcessingResults
    console.log('Migrating signal processing results...');
    const signalResults = await sqlite.signalProcessingResult.findMany();
    for (const result of signalResults) {
      await postgres.signalProcessingResult.upsert({
        where: { id: result.id },
        update: {},
        create: {
          ...result,
          rawLandmarks: JSON.parse(result.rawLandmarks),
          filtersApplied: JSON.parse(result.filtersApplied),
          butterworth: result.butterworth ? JSON.parse(result.butterworth) : null,
          kalman: result.kalman ? JSON.parse(result.kalman) : null,
          savitzkyGolay: result.savitzkyGolay ? JSON.parse(result.savitzkyGolay) : null,
          movingAverage: result.movingAverage ? JSON.parse(result.movingAverage) : null,
          exponentialSmoothing: result.exponentialSmoothing
            ? JSON.parse(result.exponentialSmoothing)
            : null,
          fftFiltered: result.fftFiltered ? JSON.parse(result.fftFiltered) : null,
          waveletDenoised: result.waveletDenoised
            ? JSON.parse(result.waveletDenoised)
            : null,
          particleFilter: result.particleFilter ? JSON.parse(result.particleFilter) : null,
          unscentedKalman: result.unscentedKalman
            ? JSON.parse(result.unscentedKalman)
            : null,
          qualityMetrics: result.qualityMetrics ? JSON.parse(result.qualityMetrics) : null,
        },
      });
    }
    console.log(`Migrated ${signalResults.length} signal processing results`);

    // 7. Migrate ClinicalAnalyses
    console.log('Migrating clinical analyses...');
    const analyses = await sqlite.clinicalAnalysis.findMany();
    for (const analysis of analyses) {
      await postgres.clinicalAnalysis.upsert({
        where: { id: analysis.id },
        update: {},
        create: {
          ...analysis,
          frequencySpectrum: analysis.frequencySpectrum
            ? JSON.parse(analysis.frequencySpectrum)
            : null,
          romMeasurements: analysis.romMeasurements
            ? JSON.parse(analysis.romMeasurements)
            : null,
          asymmetryDetails: analysis.asymmetryDetails
            ? JSON.parse(analysis.asymmetryDetails)
            : null,
          severityScores: analysis.severityScores
            ? JSON.parse(analysis.severityScores)
            : null,
          qualityFlags: analysis.qualityFlags ? JSON.parse(analysis.qualityFlags) : null,
        },
      });
    }
    console.log(`Migrated ${analyses.length} clinical analyses`);

    // 8. Migrate ClinicalAnnotations
    console.log('Migrating clinical annotations...');
    const annotations = await sqlite.clinicalAnnotation.findMany();
    for (const annotation of annotations) {
      await postgres.clinicalAnnotation.upsert({
        where: { id: annotation.id },
        update: {},
        create: annotation,
      });
    }
    console.log(`Migrated ${annotations.length} clinical annotations`);

    // 9. Migrate Reports
    console.log('Migrating reports...');
    const reports = await sqlite.report.findMany();
    for (const report of reports) {
      await postgres.report.upsert({
        where: { id: report.id },
        update: {},
        create: {
          ...report,
          configuration: report.configuration ? JSON.parse(report.configuration) : null,
          sharedWith: report.sharedWith ? JSON.parse(report.sharedWith) : null,
        },
      });
    }
    console.log(`Migrated ${reports.length} reports`);

    // 10. Migrate RecordingComparisons
    console.log('Migrating recording comparisons...');
    const comparisons = await sqlite.recordingComparison.findMany();
    for (const comparison of comparisons) {
      await postgres.recordingComparison.upsert({
        where: { id: comparison.id },
        update: {},
        create: {
          ...comparison,
          metricDifferences: JSON.parse(comparison.metricDifferences),
          statisticalTests: comparison.statisticalTests
            ? JSON.parse(comparison.statisticalTests)
            : null,
        },
      });
    }
    console.log(`Migrated ${comparisons.length} recording comparisons`);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await sqlite.$disconnect();
    await postgres.$disconnect();
  }
}

// Run migration
migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

**Run Migration**:

```bash
# Dry run (test without committing)
DATABASE_URL="postgresql://..." npx ts-node scripts/migrate-sqlite-to-postgres.ts

# Actual migration
DATABASE_URL="postgresql://..." npx ts-node scripts/migrate-sqlite-to-postgres.ts
```

#### 6. Create PostgreSQL Indexes

```sql
-- GIN indexes for JSONB queries
CREATE INDEX idx_protocol_config_movements
ON protocols USING GIN ((configuration->'movements'));

CREATE INDEX idx_clinical_analysis_severity
ON clinical_analyses USING GIN ((severity_scores));

-- Full-text search
CREATE INDEX idx_clinical_notes_fts
ON recording_sessions USING GIN (to_tsvector('english', clinical_notes));

CREATE INDEX idx_protocol_description_fts
ON protocols USING GIN (to_tsvector('english', description));

-- Partial indexes (smaller, faster)
CREATE INDEX idx_active_completed_recordings
ON recording_sessions (patient_id, recording_date)
WHERE deleted_at IS NULL AND status = 'completed';

CREATE INDEX idx_pending_reviews
ON recording_sessions (clinician_id, recording_date)
WHERE review_status = 'pending' AND status IN ('analyzed', 'completed');

-- Expression indexes
CREATE INDEX idx_patient_email_lower
ON users (LOWER(email))
WHERE role = 'patient';
```

#### 7. Verify Migration

```typescript
// scripts/verify-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('Verifying migration...');

  // Count records in each table
  const counts = {
    users: await prisma.user.count(),
    sessions: await prisma.session.count(),
    auditLogs: await prisma.auditLog.count(),
    protocols: await prisma.protocol.count(),
    recordings: await prisma.recordingSession.count(),
    signalResults: await prisma.signalProcessingResult.count(),
    analyses: await prisma.clinicalAnalysis.count(),
    annotations: await prisma.clinicalAnnotation.count(),
    reports: await prisma.report.count(),
    comparisons: await prisma.recordingComparison.count(),
  };

  console.log('Record counts:');
  console.table(counts);

  // Test JSON querying (PostgreSQL only)
  const protocolsWithFingerTap = await prisma.$queryRaw`
    SELECT * FROM protocols
    WHERE configuration->'movements' @> '[{"name": "finger_tap"}]'::jsonb
  `;
  console.log(`Protocols with finger_tap: ${protocolsWithFingerTap.length}`);

  // Test full-text search
  const searchResults = await prisma.$queryRaw`
    SELECT * FROM recording_sessions
    WHERE to_tsvector('english', clinical_notes) @@ to_tsquery('english', 'tremor')
    LIMIT 10
  `;
  console.log(`Full-text search results: ${searchResults.length}`);

  console.log('Verification completed!');
}

verify()
  .catch((e) => {
    console.error('Verification error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## Rollback Strategy

### SQLite Rollback

```bash
# Restore from backup
cp prisma/dev.db.backup prisma/dev.db

# Or revert to previous migration
npx prisma migrate resolve --rolled-back <migration_name>
```

### PostgreSQL Rollback

```bash
# Revert migration
npx prisma migrate resolve --rolled-back <migration_name>

# Or restore from SQL dump
psql handpose_db < backups/handpose_backup.sql
```

---

## Common Issues & Solutions

### Issue 1: Foreign Key Constraint Failure

**Symptom**: `FOREIGN KEY constraint failed` error

**Solution**: Ensure parent records exist before creating child records

```typescript
// Wrong order
await prisma.recordingSession.create({ data: { patientId: 'non-existent' } });

// Correct order
const user = await prisma.user.create({ data: { ... } });
await prisma.recordingSession.create({ data: { patientId: user.id } });
```

### Issue 2: JSON Parsing Errors

**Symptom**: `Unexpected token` or JSON parse errors

**Solution**: Validate JSON before storing

```typescript
// Validate JSON
function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// Store with validation
const config = JSON.stringify(configObject);
if (!isValidJSON(config)) {
  throw new Error('Invalid JSON configuration');
}
await prisma.protocol.create({
  data: { configuration: config, ... }
});
```

### Issue 3: Migration Timeout

**Symptom**: Migration hangs or times out

**Solution**: Break large migrations into smaller chunks

```typescript
// Batch processing
async function migrateInBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>
) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
    console.log(`Processed ${Math.min(i + batchSize, items.length)} / ${items.length}`);
  }
}

// Usage
const recordings = await sqlite.recordingSession.findMany();
await migrateInBatches(recordings, 100, async (batch) => {
  await postgres.recordingSession.createMany({ data: batch });
});
```

### Issue 4: Unique Constraint Violation

**Symptom**: `Unique constraint failed on the fields: (email)`

**Solution**: Use upsert instead of create

```typescript
// May fail if record exists
await prisma.user.create({ data: { email: 'test@example.com', ... } });

// Safe upsert
await prisma.user.upsert({
  where: { email: 'test@example.com' },
  update: {},
  create: { email: 'test@example.com', ... },
});
```

---

## Performance Monitoring

### Query Performance

```typescript
// Enable query logging
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Measure query time
async function measureQuery<T>(
  name: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await queryFn();
  const duration = Date.now() - start;
  console.log(`Query ${name} took ${duration}ms`);
  return result;
}

// Usage
const recordings = await measureQuery(
  'patient_recordings',
  () => prisma.recordingSession.findMany({ where: { patientId } })
);
```

### Database Size Monitoring

```bash
# SQLite database size
ls -lh prisma/dev.db

# PostgreSQL database size
psql -c "SELECT pg_size_pretty(pg_database_size('handpose_db'));"
```

---

## Backup & Restore

### Automated Backups

```bash
# SQLite backup script (backup.sh)
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="prisma/backups"
mkdir -p $BACKUP_DIR

# Backup database
cp prisma/dev.db $BACKUP_DIR/dev_$TIMESTAMP.db

# Keep only last 7 days
find $BACKUP_DIR -name "dev_*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/dev_$TIMESTAMP.db"
```

```bash
# PostgreSQL backup script
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
mkdir -p $BACKUP_DIR

pg_dump handpose_db > $BACKUP_DIR/handpose_$TIMESTAMP.sql

# Compress
gzip $BACKUP_DIR/handpose_$TIMESTAMP.sql

# Keep only last 7 days
find $BACKUP_DIR -name "handpose_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/handpose_$TIMESTAMP.sql.gz"
```

### Schedule Backups (Cron)

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * /path/to/backup.sh
```

---

## Next Steps

1. **Run Initial Migration**: `npx prisma migrate dev --name initial_medical_schema`
2. **Seed Database**: `npx prisma db seed`
3. **Test Queries**: Verify all relationships work correctly
4. **Monitor Performance**: Track query times and database size
5. **Plan PostgreSQL Migration**: When scale requirements increase

For questions or issues, refer to:
- Prisma Docs: https://www.prisma.io/docs
- SCHEMA_DOCUMENTATION.md for detailed model explanations
