-- ============================================================================
-- SynaptiHand PostgreSQL Initialization Script
-- This script runs on first database creation
-- ============================================================================

-- Enable useful extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram similarity for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN index support for B-tree types

-- Create application user with limited privileges (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'synaptihand_app') THEN
        CREATE ROLE synaptihand_app WITH LOGIN PASSWORD 'app_password';
    END IF;
END
$$;

-- Grant necessary privileges
GRANT CONNECT ON DATABASE synaptihand TO synaptihand_app;
GRANT USAGE ON SCHEMA public TO synaptihand_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO synaptihand_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO synaptihand_app;

-- Create function for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Performance tuning for session (these are session-level, not permanent)
-- For permanent changes, modify postgresql.conf

-- Log queries taking longer than 1 second (for development/debugging)
-- SET log_min_duration_statement = 1000;

-- Increase work memory for complex queries
-- SET work_mem = '256MB';

-- Output initialization complete message
DO $$
BEGIN
    RAISE NOTICE '✅ SynaptiHand PostgreSQL initialization complete';
    RAISE NOTICE '   - UUID extension enabled';
    RAISE NOTICE '   - Trigram extension enabled for fuzzy search';
    RAISE NOTICE '   - GIN index extension enabled';
    RAISE NOTICE '   - Application user configured';
END
$$;
