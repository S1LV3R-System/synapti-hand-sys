-- ============================================================================
-- Database Cleanup Script - Orphaned Mobile Recordings
-- ============================================================================
-- Purpose: Archive recordings assigned to dummy mobile-uploads user
-- Execute: After deploying backend security fix (mobile.controller.ts)
-- Safety: Uses soft delete (deletedAt) - data recoverable if needed
-- ============================================================================

-- Step 1: Archive orphaned recordings (assign to dummy user)
-- Mark all recordings assigned to mobile-uploads@synaptihand.local as orphaned
UPDATE RecordingSession
SET
  status = 'orphaned_data',
  processingMetadata = JSON_SET(
    COALESCE(processingMetadata, '{}'),
    '$.migration_note',
    'Pre-patient-id-fix: Orphaned data - no valid patient association',
    '$.migrated_at',
    datetime('now')
  )
WHERE patientUserId = (
  SELECT id FROM User WHERE email = 'mobile-uploads@synaptihand.local'
)
AND status != 'orphaned_data';

-- Step 2: Verify count of orphaned recordings
SELECT
  COUNT(*) as orphaned_count,
  MIN(createdAt) as first_orphaned,
  MAX(createdAt) as last_orphaned
FROM RecordingSession
WHERE status = 'orphaned_data';

-- Step 3: Soft delete the mobile-uploads dummy user
UPDATE User
SET
  deletedAt = datetime('now'),
  isActive = false,
  isApproved = false
WHERE email = 'mobile-uploads@synaptihand.local';

-- Step 4: Verify deletion
SELECT
  id,
  email,
  deletedAt,
  isActive,
  firstName,
  lastName
FROM User
WHERE email = 'mobile-uploads@synaptihand.local';

-- Step 5: Optional - Add database constraint to prevent null patient IDs
-- (PostgreSQL only - SQLite doesn't support adding constraints to existing tables)
-- For PostgreSQL deployments, uncomment:
-- ALTER TABLE RecordingSession
-- ADD CONSTRAINT chk_patient_id_not_null
-- CHECK (patientModelId IS NOT NULL AND patientModelId != '');

-- ============================================================================
-- Rollback Script (if needed)
-- ============================================================================

-- Restore mobile-uploads user (uncomment if rollback needed)
-- UPDATE User
-- SET
--   deletedAt = NULL,
--   isActive = true,
--   isApproved = true
-- WHERE email = 'mobile-uploads@synaptihand.local';

-- Restore orphaned recordings status (uncomment if rollback needed)
-- UPDATE RecordingSession
-- SET status = 'uploaded'
-- WHERE status = 'orphaned_data';
