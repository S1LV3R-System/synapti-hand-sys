-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Experiment-Session (
  session_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  Clinician uuid NOT NULL,
  Patient bigint NOT NULL,
  Protocol uuid NOT NULL,
  Grip_strength ARRAY,
  video_data_path text NOT NULL,
  raw_keypoint_data_path text NOT NULL,
  analyzed_xlsx_path text NOT NULL,
  Report_pdf_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone NOT NULL,
  CONSTRAINT Experiment-Session_pkey PRIMARY KEY (session_id),
  CONSTRAINT Experiment-Session_Clinician_fkey FOREIGN KEY (Clinician) REFERENCES public.User-Main(User_ID),
  CONSTRAINT Experiment-Session_Patient_fkey FOREIGN KEY (Patient) REFERENCES public.Patient-Table(id),
  CONSTRAINT Experiment-Session_Protocol_fkey FOREIGN KEY (Protocol) REFERENCES public.Protocol-Table(id)
);
CREATE TABLE public.Patient-Table (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  project_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  patient_id character varying NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  birth_date date NOT NULL,
  height numeric NOT NULL,
  weight numeric NOT NULL,
  diagnosis text DEFAULT 'Healthy'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,
  CONSTRAINT Patient-Table_pkey PRIMARY KEY (id),
  CONSTRAINT Patient-Table_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.User-Main(User_ID),
  CONSTRAINT Patient-Table_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.Project-Table(project_id)
);
CREATE TABLE public.Project-Table (
  project_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  project_name text NOT NULL,
  project_description text,
  project_creator uuid NOT NULL DEFAULT auth.uid(),
  project_members ARRAY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  project-data_path json NOT NULL,
  deleted_at timestamp without time zone,
  CONSTRAINT Project-Table_pkey PRIMARY KEY (project_id),
  CONSTRAINT Project-Table_project_creator_fkey FOREIGN KEY (project_creator) REFERENCES public.User-Main(User_ID)
);
CREATE TABLE public.Protocol-Table (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  protocol_name text NOT NULL,
  protocol_description text,
  creator uuid NOT NULL,
  linked_project uuid,
  protocol_information ARRAY NOT NULL,
  private boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT Protocol-Table_pkey PRIMARY KEY (id),
  CONSTRAINT Protocol-Table_creator_fkey FOREIGN KEY (creator) REFERENCES public.User-Main(User_ID),
  CONSTRAINT Protocol-Table_linked_project_fkey FOREIGN KEY (linked_project) REFERENCES public.Project-Table(project_id)
);
CREATE TABLE public.User-Main (
  User_ID uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_type text NOT NULL DEFAULT '''Clinician''::text'::text,
  first_name character varying NOT NULL DEFAULT ''::character varying,
  middle__name character varying DEFAULT ''::character varying,
  last_name character varying NOT NULL,
  birth_date date NOT NULL,
  email text NOT NULL UNIQUE,
  phone_number text NOT NULL UNIQUE,
  Institute text NOT NULL,
  Department text NOT NULL,
  Verification_status boolean NOT NULL DEFAULT false,
  Approval_status boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp without time zone,
  Approved_at timestamp without time zone,
  Rejected_at timestamp without time zone,
  Verified_at timestamp without time zone,
  CONSTRAINT User-Main_pkey PRIMARY KEY (User_ID)
);
