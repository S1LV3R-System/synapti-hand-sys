-- ============================================================================
-- Migration: Protocol Extended Schema
-- Description: Add extended metadata, clinical guidelines, and analysis configuration
-- Version: 002
-- Date: 2026-01-22
-- ============================================================================

-- Add extended protocol metadata columns
ALTER TABLE "Protocol-Table"
ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS indicated_for TEXT,
ADD COLUMN IF NOT EXISTS contraindications TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add clinical guidelines columns
ALTER TABLE "Protocol-Table"
ADD COLUMN IF NOT EXISTS patient_instructions TEXT,
ADD COLUMN IF NOT EXISTS clinical_guidelines TEXT,
ADD COLUMN IF NOT EXISTS overall_repetitions INTEGER DEFAULT 1;

-- Add analysis configuration column (JSONB for flexible output configuration)
ALTER TABLE "Protocol-Table"
ADD COLUMN IF NOT EXISTS analysis_outputs JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "Protocol-Table".version IS 'Protocol version (e.g., 1.0, 2.0)';
COMMENT ON COLUMN "Protocol-Table".indicated_for IS 'Clinical indications for the protocol';
COMMENT ON COLUMN "Protocol-Table".contraindications IS 'Clinical contraindications';
COMMENT ON COLUMN "Protocol-Table".is_active IS 'Whether the protocol is currently active and usable';
COMMENT ON COLUMN "Protocol-Table".patient_instructions IS 'Instructions to be given to the patient';
COMMENT ON COLUMN "Protocol-Table".clinical_guidelines IS 'Clinical interpretation guidelines for clinicians';
COMMENT ON COLUMN "Protocol-Table".overall_repetitions IS 'Number of times to repeat the entire protocol';
COMMENT ON COLUMN "Protocol-Table".analysis_outputs IS 'JSON configuration specifying which analysis outputs to generate (e.g., tremor spectrogram, ROM plots, etc.)';

-- Create index on is_active for filtering active protocols
CREATE INDEX IF NOT EXISTS idx_protocol_is_active ON "Protocol-Table" (is_active) WHERE is_active = true;

-- ============================================================================
-- Example analysis_outputs structure:
-- {
--   "handAperture": { "enabled": true, "fingerPair": "thumb_index", "hand": "right" },
--   "cyclogram3D": { "enabled": true, "fingertip": "index_tip", "hand": "right" },
--   "trajectory3D": { "enabled": false, "fingertip": "index_tip", "hand": "right" },
--   "romPlot": { "enabled": true, "plotType": "violin", "measurement": "flexion", "fingers": {"thumb": true, "index": true}, "hand": "right" },
--   "tremorSpectrogram": { "enabled": true, "hand": "both" },
--   "openingClosingVelocity": { "enabled": true, "hand": "right" },
--   "cycleFrequency": { "enabled": true, "hand": "right" },
--   "cycleVariability": { "enabled": false, "hand": "right" },
--   "interFingerCoordination": { "enabled": false, "finger1": "thumb", "finger2": "index", "hand": "right" },
--   "cycleSymmetry": { "enabled": false },
--   "geometricCurvature": { "enabled": false, "hand": "right" }
-- }
-- ============================================================================
