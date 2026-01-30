-- ============================================================================
-- SYNAPTIHAND SUPABASE SCHEMA
-- Version: 3.0.0 - Full Supabase Migration
-- Generated from Final-schema.sql with refinements
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USER-MAIN TABLE (Authentication & User Profiles)
-- ============================================================================
-- Note: Supabase Auth handles password storage, this table stores profile data

CREATE TABLE "User-Main" (
    "User_ID" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "user_type" text NOT NULL DEFAULT 'Clinician',
    "first_name" varchar NOT NULL DEFAULT '',
    "middle__name" varchar DEFAULT '',
    "last_name" varchar NOT NULL,
    "birth_date" date NOT NULL,
    "email" text NOT NULL UNIQUE,
    "phone_number" text NOT NULL UNIQUE,
    "Institute" text NOT NULL,
    "Department" text NOT NULL,
    "Verification_status" boolean NOT NULL DEFAULT false,
    "Approval_status" boolean NOT NULL DEFAULT false,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,
    "Approved_at" timestamptz,
    "Rejected_at" timestamptz,
    "Verified_at" timestamptz,
    -- Link to Supabase Auth user
    "auth_user_id" uuid UNIQUE,

    CONSTRAINT "User-Main_pkey" PRIMARY KEY ("User_ID")
);

-- Indexes for User-Main
CREATE INDEX "User-Main_email_idx" ON "User-Main" ("email");
CREATE INDEX "User-Main_user_type_idx" ON "User-Main" ("user_type");
CREATE INDEX "User-Main_Approval_status_idx" ON "User-Main" ("Approval_status");
CREATE INDEX "User-Main_deleted_at_idx" ON "User-Main" ("deleted_at");
CREATE INDEX "User-Main_auth_user_id_idx" ON "User-Main" ("auth_user_id");

-- ============================================================================
-- PROJECT-TABLE
-- ============================================================================

CREATE TABLE "Project-Table" (
    "project_id" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "project_name" text NOT NULL,
    "project_description" text,
    "project_creator" uuid NOT NULL,
    "project_members" uuid[] DEFAULT '{}',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "project-data_path" jsonb NOT NULL DEFAULT '{"base_path": "", "exports_path": ""}',
    "deleted_at" timestamptz,

    CONSTRAINT "Project-Table_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "Project-Table_project_creator_fkey"
        FOREIGN KEY ("project_creator")
        REFERENCES "User-Main"("User_ID") ON DELETE RESTRICT
);

-- Indexes for Project-Table
CREATE INDEX "Project-Table_project_creator_idx" ON "Project-Table" ("project_creator");
CREATE INDEX "Project-Table_created_at_idx" ON "Project-Table" ("created_at");
CREATE INDEX "Project-Table_deleted_at_idx" ON "Project-Table" ("deleted_at");

-- ============================================================================
-- PATIENT-TABLE
-- ============================================================================

CREATE TABLE "Patient-Table" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL,
    "creator_id" uuid NOT NULL,
    "patient_id" varchar NOT NULL,
    "first_name" text NOT NULL,
    "middle_name" text,
    "last_name" text NOT NULL,
    "birth_date" date NOT NULL,
    "height" numeric NOT NULL,
    "weight" numeric NOT NULL,
    "diagnosis" text DEFAULT 'Healthy',
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,

    CONSTRAINT "Patient-Table_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Patient-Table_patient_id_unique" UNIQUE ("patient_id"),
    CONSTRAINT "Patient-Table_creator_id_fkey"
        FOREIGN KEY ("creator_id")
        REFERENCES "User-Main"("User_ID") ON DELETE RESTRICT,
    CONSTRAINT "Patient-Table_project_id_fkey"
        FOREIGN KEY ("project_id")
        REFERENCES "Project-Table"("project_id") ON DELETE CASCADE
);

-- Indexes for Patient-Table
CREATE INDEX "Patient-Table_project_id_idx" ON "Patient-Table" ("project_id");
CREATE INDEX "Patient-Table_creator_id_idx" ON "Patient-Table" ("creator_id");
CREATE INDEX "Patient-Table_patient_id_idx" ON "Patient-Table" ("patient_id");
CREATE INDEX "Patient-Table_deleted_at_idx" ON "Patient-Table" ("deleted_at");

-- ============================================================================
-- PROTOCOL-TABLE
-- ============================================================================

CREATE TABLE "Protocol-Table" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "protocol_name" text NOT NULL,
    "protocol_description" text,
    "creator" uuid NOT NULL,
    "linked_project" uuid,
    "protocol_information" jsonb[] NOT NULL DEFAULT '{}',
    "private" boolean NOT NULL DEFAULT true,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,

    CONSTRAINT "Protocol-Table_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Protocol-Table_creator_fkey"
        FOREIGN KEY ("creator")
        REFERENCES "User-Main"("User_ID") ON DELETE RESTRICT,
    CONSTRAINT "Protocol-Table_linked_project_fkey"
        FOREIGN KEY ("linked_project")
        REFERENCES "Project-Table"("project_id") ON DELETE SET NULL
);

-- Indexes for Protocol-Table
CREATE INDEX "Protocol-Table_creator_idx" ON "Protocol-Table" ("creator");
CREATE INDEX "Protocol-Table_linked_project_idx" ON "Protocol-Table" ("linked_project");
CREATE INDEX "Protocol-Table_private_idx" ON "Protocol-Table" ("private");
CREATE INDEX "Protocol-Table_deleted_at_idx" ON "Protocol-Table" ("deleted_at");

-- ============================================================================
-- EXPERIMENT-SESSION TABLE (formerly recording_sessions)
-- ============================================================================

CREATE TABLE "Experiment-Session" (
    "session_id" uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    "Clinician" uuid NOT NULL,
    "Patient" uuid NOT NULL,
    "Protocol" uuid NOT NULL,
    "Grip_strength" float[] DEFAULT '{}',
    "video_data_path" text NOT NULL,
    "raw_keypoint_data_path" text NOT NULL,
    "analyzed_xlsx_path" text NOT NULL,
    "Report_pdf_path" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "deleted_at" timestamptz,

    -- Additional fields for mobile/processing workflow
    "mobile_session_id" varchar(100) UNIQUE,
    "duration" integer,
    "fps" integer,
    "device_info" text,
    "status" varchar(30) NOT NULL DEFAULT 'created',
    "analysis_progress" integer DEFAULT 0,
    "analysis_error" text,
    "clinical_notes" text,

    CONSTRAINT "Experiment-Session_pkey" PRIMARY KEY ("session_id"),
    CONSTRAINT "Experiment-Session_Clinician_fkey"
        FOREIGN KEY ("Clinician")
        REFERENCES "User-Main"("User_ID") ON DELETE RESTRICT,
    CONSTRAINT "Experiment-Session_Patient_fkey"
        FOREIGN KEY ("Patient")
        REFERENCES "Patient-Table"("id") ON DELETE RESTRICT,
    CONSTRAINT "Experiment-Session_Protocol_fkey"
        FOREIGN KEY ("Protocol")
        REFERENCES "Protocol-Table"("id") ON DELETE RESTRICT
);

-- Indexes for Experiment-Session
CREATE INDEX "Experiment-Session_Clinician_idx" ON "Experiment-Session" ("Clinician");
CREATE INDEX "Experiment-Session_Patient_idx" ON "Experiment-Session" ("Patient");
CREATE INDEX "Experiment-Session_Protocol_idx" ON "Experiment-Session" ("Protocol");
CREATE INDEX "Experiment-Session_mobile_session_id_idx" ON "Experiment-Session" ("mobile_session_id");
CREATE INDEX "Experiment-Session_status_idx" ON "Experiment-Session" ("status");
CREATE INDEX "Experiment-Session_created_at_idx" ON "Experiment-Session" ("created_at");
CREATE INDEX "Experiment-Session_deleted_at_idx" ON "Experiment-Session" ("deleted_at");

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE "User-Main" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project-Table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Patient-Table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Protocol-Table" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Experiment-Session" ENABLE ROW LEVEL SECURITY;

-- User-Main policies
CREATE POLICY "Users can view their own profile" ON "User-Main"
    FOR SELECT USING (auth.uid() = "auth_user_id");

CREATE POLICY "Users can update their own profile" ON "User-Main"
    FOR UPDATE USING (auth.uid() = "auth_user_id");

CREATE POLICY "Authenticated users can view approved users" ON "User-Main"
    FOR SELECT USING (
        auth.role() = 'authenticated'
        AND "Approval_status" = true
        AND "deleted_at" IS NULL
    );

-- Project-Table policies
CREATE POLICY "Users can view their own projects" ON "Project-Table"
    FOR SELECT USING (
        "project_creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
        OR auth.uid()::uuid = ANY("project_members")
    );

CREATE POLICY "Users can create projects" ON "Project-Table"
    FOR INSERT WITH CHECK (
        "project_creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

CREATE POLICY "Project owners can update" ON "Project-Table"
    FOR UPDATE USING (
        "project_creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

CREATE POLICY "Project owners can delete" ON "Project-Table"
    FOR DELETE USING (
        "project_creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

-- Patient-Table policies
CREATE POLICY "Users can view patients in their projects" ON "Patient-Table"
    FOR SELECT USING (
        "project_id" IN (
            SELECT "project_id" FROM "Project-Table"
            WHERE "project_creator" IN (
                SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
            )
            OR auth.uid()::uuid = ANY("project_members")
        )
    );

CREATE POLICY "Users can create patients in their projects" ON "Patient-Table"
    FOR INSERT WITH CHECK (
        "project_id" IN (
            SELECT "project_id" FROM "Project-Table"
            WHERE "project_creator" IN (
                SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
            )
            OR auth.uid()::uuid = ANY("project_members")
        )
    );

CREATE POLICY "Users can update patients in their projects" ON "Patient-Table"
    FOR UPDATE USING (
        "project_id" IN (
            SELECT "project_id" FROM "Project-Table"
            WHERE "project_creator" IN (
                SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
            )
        )
    );

-- Protocol-Table policies
CREATE POLICY "Users can view public protocols or own protocols" ON "Protocol-Table"
    FOR SELECT USING (
        "private" = false
        OR "creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

CREATE POLICY "Users can create protocols" ON "Protocol-Table"
    FOR INSERT WITH CHECK (
        "creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

CREATE POLICY "Protocol creators can update" ON "Protocol-Table"
    FOR UPDATE USING (
        "creator" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

-- Experiment-Session policies
CREATE POLICY "Users can view sessions they're involved in" ON "Experiment-Session"
    FOR SELECT USING (
        "Clinician" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
        OR "Patient" IN (
            SELECT "id" FROM "Patient-Table" WHERE "project_id" IN (
                SELECT "project_id" FROM "Project-Table"
                WHERE "project_creator" IN (
                    SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
                )
                OR auth.uid()::uuid = ANY("project_members")
            )
        )
    );

CREATE POLICY "Clinicians can create sessions" ON "Experiment-Session"
    FOR INSERT WITH CHECK (
        "Clinician" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

CREATE POLICY "Clinicians can update their sessions" ON "Experiment-Session"
    FOR UPDATE USING (
        "Clinician" IN (
            SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid()
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current user's User_ID
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid AS $$
    SELECT "User_ID" FROM "User-Main" WHERE "auth_user_id" = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user is project member
CREATE OR REPLACE FUNCTION is_project_member(project_uuid uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM "Project-Table"
        WHERE "project_id" = project_uuid
        AND (
            "project_creator" = get_current_user_id()
            OR get_current_user_id() = ANY("project_members")
        )
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT (if needed)
-- ============================================================================

-- Note: Supabase doesn't auto-update timestamps, add if needed
-- CREATE OR REPLACE FUNCTION update_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = now();
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
