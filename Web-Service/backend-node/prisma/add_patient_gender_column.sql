-- ============================================================================
-- Migration: Add gender column to Patient-Table
-- Date: 2026-01-22
-- Purpose: Fix Android app error - "Could not find the 'gender' column"
-- ============================================================================

-- Add gender column to Patient-Table
ALTER TABLE "Patient-Table"
ADD COLUMN IF NOT EXISTS "gender" TEXT;

-- Add comment to document the column
COMMENT ON COLUMN "Patient-Table"."gender" IS 'Patient gender (optional field for demographic data)';

-- Create index for performance (optional, but recommended if filtering by gender)
CREATE INDEX IF NOT EXISTS "idx_patient_gender" ON "Patient-Table"("gender");

-- Verify the column was added successfully
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Patient-Table' AND column_name = 'gender';
