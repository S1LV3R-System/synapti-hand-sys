/**
 * SynaptiHand - Consolidated Data Service
 *
 * Combines all Supabase-based data operations:
 * - Projects (CRUD, members)
 * - Patients (CRUD, by project/diagnosis)
 * - Protocols (CRUD, accessibility)
 * - Sessions/Recordings (CRUD, uploads)
 * - Clinical (analysis, reports, plots)
 */

import { supabase } from '../lib/supabase';
import { apiClient, extractData, extractPagination } from './api.service';
import type {
  // Project types
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilters,
  ProjectDataPath,
  // Patient types
  Patient,
  CreatePatientInput,
  UpdatePatientInput,
  PatientFilters,
  // Protocol types
  Protocol,
  CreateProtocolInput,
  UpdateProtocolInput,
  ProtocolFilters,
  // Session types
  ExperimentSession,
  CreateSessionInput,
  UpdateSessionInput,
  SessionFilters,
  SignedUrlResponse,
  VideoUploadMetadata,
  // Clinical types
  AnalysisData,
  LSTMEventsResponse,
  ComprehensiveAnalysisResponse,
  AnalysisPlotUrls,
  // Recording types (legacy)
  RecordingSession,
  CreateRecordingInput,
  UpdateRecordingInput,
  UpdateRecordingStatusInput,
  RecordingFilters,
  // Common types
  User,
  ApiResponse,
  PaginationMeta
} from '../types/api.types';

// ============================================================================
// SHARED MAPPERS
// ============================================================================

function mapToUser(row: Record<string, unknown>): User {
  const firstName = row.first_name as string;
  const middleName = row.middle__name as string | null;
  const lastName = row.last_name as string;

  return {
    id: row.User_ID as string,
    email: row.email as string,
    userType: row.user_type as User['userType'],
    firstName,
    middleName,
    lastName,
    fullName: [firstName, middleName, lastName].filter(Boolean).join(' '),
    birthDate: row.birth_date as string,
    phoneNumber: row.phone_number as string,
    institute: row.Institute as string,
    department: row.Department as string,
    verificationStatus: row.Verification_status as boolean,
    approvalStatus: row.Approval_status as boolean,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | null,
    approvedAt: row.Approved_at as string | null,
    rejectedAt: row.Rejected_at as string | null,
    verifiedAt: row.Verified_at as string | null,
    role: row.user_type as User['userType'],
    isActive: !(row.deleted_at as string | null),
    isApproved: row.Approval_status as boolean,
    hospital: row.Institute as string
  };
}

function mapToProject(row: Record<string, unknown>): Project {
  const patients = row.patients as Record<string, unknown>[] | undefined;

  return {
    id: row.project_id as string,
    projectName: row.project_name as string,
    projectDescription: row.project_description as string | null,
    projectCreatorId: row.project_creator as string,
    projectCreator: row.creator ? mapToUser(row.creator as Record<string, unknown>) : undefined,
    projectMembers: row.project_members as string[] || [],
    projectDataPath: row['project-data_path'] as ProjectDataPath || {},
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | null,
    patientsCount: patients?.length,
    name: row.project_name as string,
    description: row.project_description as string | null,
    owner: row.creator ? mapToUser(row.creator as Record<string, unknown>) : undefined,
    ownerId: row.project_creator as string,
    members: row.project_members as string[] || []
  };
}

function mapToPatient(row: Record<string, unknown>): Patient {
  const firstName = row.first_name as string;
  const middleName = row.middle_name as string | null;
  const lastName = row.last_name as string;
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  return {
    id: row.id as number,
    projectId: row.project_id as string,
    project: row.project ? mapToProject(row.project as Record<string, unknown>) : undefined,
    creatorId: row.creator_id as string,
    creator: row.creator ? mapToUser(row.creator as Record<string, unknown>) : undefined,
    patientId: row.patient_id as string,
    firstName,
    middleName,
    lastName,
    fullName,
    birthDate: row.birth_date as string,
    height: row.height as number,
    weight: row.weight as number,
    diagnosis: row.diagnosis as string | null,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | null,
    patientName: fullName,
    dateOfBirth: row.birth_date as string,
    createdById: row.creator_id as string,
    createdBy: row.creator ? mapToUser(row.creator as Record<string, unknown>) : undefined,
    mrn: row.patient_id as string
  };
}

function mapToProtocol(row: Record<string, unknown>): Protocol {
  return {
    id: row.id as string,
    protocolName: row.protocol_name as string,
    protocolDescription: row.protocol_description as string | null,
    creatorId: row.creator as string,
    creator: row.creator_data ? mapToUser(row.creator_data as Record<string, unknown>) : undefined,
    linkedProjectId: row.linked_project as string | null,
    linkedProject: row.linked_project_data ? mapToProject(row.linked_project_data as Record<string, unknown>) : undefined,
    protocolInformation: row.protocol_information as Protocol['protocolInformation'],
    isPrivate: row.private as boolean,
    createdAt: row.created_at as string,
    name: row.protocol_name as string,
    description: row.protocol_description as string | null,
    isPublic: !(row.private as boolean),
    isActive: true,
    createdById: row.creator as string,
    createdBy: row.creator_data ? mapToUser(row.creator_data as Record<string, unknown>) : undefined,
    configuration: JSON.stringify(row.protocol_information),
    version: '1.0'
  };
}

function mapToSession(row: Record<string, unknown>): ExperimentSession {
  return {
    sessionId: row.session_id as string,
    clinicianId: row.Clinician as string,
    clinician: row.clinician ? mapToUser(row.clinician as Record<string, unknown>) : undefined,
    patientId: row.Patient as number,
    patient: row.patient ? mapToPatient(row.patient as Record<string, unknown>) : undefined,
    protocolId: row.Protocol as string,
    protocol: row.protocol ? mapToProtocol(row.protocol as Record<string, unknown>) : undefined,
    gripStrength: row.Grip_strength as number[] | null,
    videoDataPath: row.video_data_path as string,
    rawKeypointDataPath: row.raw_keypoint_data_path as string,
    analyzedXlsxPath: row.analyzed_xlsx_path as string,
    reportPdfPath: row.Report_pdf_path as string,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string
  };
}

function sessionToRecording(session: ExperimentSession): RecordingSession {
  return {
    id: session.sessionId,
    patientId: String(session.patientId),
    patient: session.patient,
    clinicianId: session.clinicianId,
    clinician: session.clinician,
    recordingDate: session.createdAt,
    durationSeconds: null,
    duration: null,
    fps: null,
    deviceInfo: null,
    protocolConfig: session.protocol ? {
      name: session.protocol.protocolName,
      movements: session.protocol.protocolInformation,
      instructions: session.protocol.protocolDescription || undefined
    } : null,
    protocol: session.protocol,
    videoPath: session.videoDataPath,
    keypointsPath: session.rawKeypointDataPath,
    metadataPath: null,
    labeledVideoPath: null,
    analysisPath: null,
    xlsxPath: session.analyzedXlsxPath,
    pdfPath: session.reportPdfPath,
    plotsPath: null,
    status: 'completed',
    keypointsUploadedAt: null,
    videoUploadedAt: null,
    processingStartedAt: null,
    processingCompletedAt: null,
    processingError: null,
    clinicalNotes: null,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
    deletedAt: session.deletedAt,
    reviewStatus: null
  };
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: userProfile } = await supabase
    .from('User-Main')
    .select('User_ID')
    .eq('email', userData.user.email)
    .single();

  return userProfile?.User_ID || null;
}

// ============================================================================
// PROJECTS SERVICE
// ============================================================================

export const projectsService = {
  async listProjects(filters?: ProjectFilters): Promise<{ data: Project[]; pagination?: PaginationMeta }> {
    let query = supabase
      .from('Project-Table')
      .select(`*, creator:"User-Main"!project_creator(*)`, { count: 'exact' })
      .is('deleted_at', null);

    const userId = await getCurrentUserId();
    if (userId) {
      query = query.or(`project_creator.eq.${userId},project_members.cs.{${userId}}`);
    }

    if (filters?.creatorId) query = query.eq('project_creator', filters.creatorId);
    if (filters?.search) query = query.or(`project_name.ilike.%${filters.search}%,project_description.ilike.%${filters.search}%`);

    const sortBy = filters?.sortBy || 'created_at';
    query = query.order(sortBy, { ascending: filters?.sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch projects: ${error.message}`);

    return {
      data: (data || []).map(mapToProject),
      pagination: count !== null ? { page, limit, total: count, totalPages: Math.ceil(count / limit) } : undefined
    };
  },

  async getProject(id: string): Promise<Project> {
    const { data, error } = await supabase
      .from('Project-Table')
      .select(`*, creator:"User-Main"!project_creator(*), patients:"Patient-Table"(*)`)
      .eq('project_id', id)
      .single();

    if (error || !data) throw new Error('Project not found');
    return mapToProject(data as unknown as Record<string, unknown>);
  },

  async createProject(input: CreateProjectInput): Promise<Project> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const projectName = input.projectName || input.name || '';
    const projectDescription = input.projectDescription ?? input.description ?? null;

    const { data, error } = await supabase
      .from('Project-Table')
      .insert({
        project_name: projectName,
        project_description: projectDescription,
        project_creator: userId,
        project_members: [],
        'project-data_path': input.projectDataPath || { base_path: '', exports_path: '' }
      })
      .select(`*, creator:"User-Main"!project_creator(*)`)
      .single();

    if (error) throw new Error(`Failed to create project: ${error.message}`);
    return mapToProject(data);
  },

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const updateData: Record<string, unknown> = {};
    if (input.projectName !== undefined || input.name !== undefined) updateData.project_name = input.projectName || input.name;
    if (input.projectDescription !== undefined || input.description !== undefined) updateData.project_description = input.projectDescription ?? input.description;
    if (input.projectDataPath !== undefined) updateData['project-data_path'] = input.projectDataPath;
    if (input.projectMembers !== undefined) updateData.project_members = input.projectMembers;

    const { data, error } = await supabase
      .from('Project-Table')
      .update(updateData)
      .eq('project_id', id)
      .select(`*, creator:"User-Main"!project_creator(*)`)
      .single();

    if (error) throw new Error(`Failed to update project: ${error.message}`);
    return mapToProject(data);
  },

  async deleteProject(id: string): Promise<void> {
    const { error } = await supabase.from('Project-Table').update({ deleted_at: new Date().toISOString() }).eq('project_id', id);
    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  },

  async addMember(projectId: string, userId: string): Promise<Project> {
    const { data: project } = await supabase.from('Project-Table').select('project_members').eq('project_id', projectId).single();
    if (!project) throw new Error('Project not found');

    const members = project.project_members || [];
    if (members.includes(userId)) throw new Error('User is already a member');

    const { data, error } = await supabase
      .from('Project-Table')
      .update({ project_members: [...members, userId] })
      .eq('project_id', projectId)
      .select(`*, creator:"User-Main"!project_creator(*)`)
      .single();

    if (error) throw new Error(`Failed to add member: ${error.message}`);
    return mapToProject(data);
  },

  async removeMember(projectId: string, userId: string): Promise<Project> {
    const { data: project } = await supabase.from('Project-Table').select('project_members').eq('project_id', projectId).single();
    if (!project) throw new Error('Project not found');

    const members = (project.project_members || []).filter((m: string) => m !== userId);

    const { data, error } = await supabase
      .from('Project-Table')
      .update({ project_members: members })
      .eq('project_id', projectId)
      .select(`*, creator:"User-Main"!project_creator(*)`)
      .single();

    if (error) throw new Error(`Failed to remove member: ${error.message}`);
    return mapToProject(data);
  },

  async getProjectMembers(projectId: string): Promise<User[]> {
    const { data: project } = await supabase.from('Project-Table').select('project_members').eq('project_id', projectId).single();
    if (!project) throw new Error('Project not found');

    const memberIds = project.project_members || [];
    if (memberIds.length === 0) return [];

    const { data, error } = await supabase.from('User-Main').select('*').in('User_ID', memberIds);
    if (error) throw new Error(`Failed to fetch members: ${error.message}`);
    return (data || []).map(mapToUser);
  },

  async getMyProjects(): Promise<Project[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    const { data } = await this.listProjects({ creatorId: userId, limit: 1000 });
    return data;
  }
};

// ============================================================================
// PATIENTS SERVICE
// ============================================================================

export const patientsService = {
  async listPatients(filters?: PatientFilters): Promise<{ data: Patient[]; pagination?: PaginationMeta }> {
    let query = supabase
      .from('Patient-Table')
      .select(`*, creator:"User-Main"!creator_id(*), project:"Project-Table"!project_id(*)`, { count: 'exact' })
      .is('deleted_at', null);

    if (filters?.projectId) query = query.eq('project_id', filters.projectId);
    if (filters?.diagnosis) query = query.eq('diagnosis', filters.diagnosis);
    if (filters?.creatorId) query = query.eq('creator_id', filters.creatorId);
    if (filters?.search) query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,patient_id.ilike.%${filters.search}%`);

    const sortBy = filters?.sortBy || 'created_at';
    query = query.order(sortBy, { ascending: filters?.sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch patients: ${error.message}`);

    return {
      data: (data || []).map(mapToPatient),
      pagination: count !== null ? { page, limit, total: count, totalPages: Math.ceil(count / limit) } : undefined
    };
  },

  async getPatient(id: number | string): Promise<Patient> {
    const { data, error } = await supabase
      .from('Patient-Table')
      .select(`*, creator:"User-Main"!creator_id(*), project:"Project-Table"!project_id(*)`)
      .eq('id', id)
      .single();

    if (error || !data) throw new Error('Patient not found');
    return mapToPatient(data as unknown as Record<string, unknown>);
  },

  async getPatientByPatientId(patientId: string): Promise<Patient | null> {
    const { data, error } = await supabase
      .from('Patient-Table')
      .select(`*, creator:"User-Main"!creator_id(*), project:"Project-Table"!project_id(*)`)
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch patient: ${error.message}`);
    return data ? mapToPatient(data as unknown as Record<string, unknown>) : null;
  },

  async createPatient(input: CreatePatientInput): Promise<Patient> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    let firstName = input.firstName;
    let lastName = input.lastName;
    if (!firstName && input.patientName) {
      const nameParts = input.patientName.split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    const { data, error } = await supabase
      .from('Patient-Table')
      .insert({
        project_id: input.projectId,
        creator_id: userId,
        patient_id: input.patientId,
        first_name: firstName,
        middle_name: input.middleName || null,
        last_name: lastName,
        birth_date: input.birthDate || input.dateOfBirth,
        height: input.height || 0,
        weight: input.weight || 0,
        diagnosis: input.diagnosis || 'Healthy'
      })
      .select(`*, creator:"User-Main"!creator_id(*), project:"Project-Table"!project_id(*)`)
      .single();

    if (error) throw new Error(`Failed to create patient: ${error.message}`);
    return mapToPatient(data);
  },

  async updatePatient(id: number | string, input: UpdatePatientInput): Promise<Patient> {
    const updateData: Record<string, unknown> = {};
    if (input.patientId !== undefined) updateData.patient_id = input.patientId;
    if (input.firstName !== undefined) updateData.first_name = input.firstName;
    if (input.middleName !== undefined) updateData.middle_name = input.middleName;
    if (input.lastName !== undefined) updateData.last_name = input.lastName;
    if (input.birthDate !== undefined) updateData.birth_date = input.birthDate;
    if (input.dateOfBirth !== undefined) updateData.birth_date = input.dateOfBirth;
    if (input.height !== undefined) updateData.height = input.height;
    if (input.weight !== undefined) updateData.weight = input.weight;
    if (input.diagnosis !== undefined) updateData.diagnosis = input.diagnosis;

    if (input.patientName !== undefined) {
      const nameParts = input.patientName.split(' ');
      updateData.first_name = nameParts[0] || '';
      updateData.last_name = nameParts.slice(1).join(' ') || '';
    }

    const { data, error } = await supabase
      .from('Patient-Table')
      .update(updateData)
      .eq('id', id)
      .select(`*, creator:"User-Main"!creator_id(*), project:"Project-Table"!project_id(*)`)
      .single();

    if (error) throw new Error(`Failed to update patient: ${error.message}`);
    return mapToPatient(data);
  },

  async deletePatient(id: number | string): Promise<void> {
    const { error } = await supabase.from('Patient-Table').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(`Failed to delete patient: ${error.message}`);
  },

  async getPatientsByProject(projectId: string): Promise<Patient[]> {
    const { data } = await this.listPatients({ projectId, limit: 1000 });
    return data;
  },

  async getMyPatients(): Promise<Patient[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    const { data } = await this.listPatients({ creatorId: userId, limit: 1000 });
    return data;
  },

  async getPatientsByDiagnosis(diagnosis: string): Promise<Patient[]> {
    if (!diagnosis) return [];
    const { data } = await this.listPatients({ diagnosis, limit: 1000 });
    return data;
  }
};

// ============================================================================
// PROTOCOLS SERVICE
// ============================================================================

export const protocolsService = {
  async listProtocols(filters?: ProtocolFilters): Promise<{ data: Protocol[]; pagination?: PaginationMeta }> {
    let query = supabase
      .from('Protocol-Table')
      .select(`*, creator:"User-Main"!creator(*), linked_project:"Project-Table"!linked_project(*)`, { count: 'exact' });

    if (filters?.creatorId) query = query.eq('creator', filters.creatorId);
    if (filters?.linkedProject) query = query.eq('linked_project', filters.linkedProject);
    if (filters?.isPrivate !== undefined) query = query.eq('private', filters.isPrivate);
    if (filters?.search) query = query.or(`protocol_name.ilike.%${filters.search}%,protocol_description.ilike.%${filters.search}%`);

    const sortBy = filters?.sortBy || 'created_at';
    query = query.order(sortBy, { ascending: filters?.sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch protocols: ${error.message}`);

    return {
      data: (data || []).map(mapToProtocol),
      pagination: count !== null ? { page, limit, total: count, totalPages: Math.ceil(count / limit) } : undefined
    };
  },

  async getProtocol(id: string): Promise<Protocol> {
    const { data, error } = await supabase
      .from('Protocol-Table')
      .select(`*, creator:"User-Main"!creator(*), linked_project:"Project-Table"!linked_project(*)`)
      .eq('id', id)
      .single();

    if (error || !data) throw new Error('Protocol not found');
    return mapToProtocol(data as unknown as Record<string, unknown>);
  },

  async getAccessibleProtocols(): Promise<Protocol[]> {
    const userId = await getCurrentUserId();

    let query = supabase
      .from('Protocol-Table')
      .select(`*, creator:"User-Main"!creator(*), linked_project:"Project-Table"!linked_project(*)`);

    if (userId) {
      query = query.or(`private.eq.false,creator.eq.${userId}`);
    } else {
      query = query.eq('private', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch protocols: ${error.message}`);
    return (data || []).map(mapToProtocol);
  },

  async getProjectProtocols(projectId: string): Promise<Protocol[]> {
    const { data } = await this.listProtocols({ linkedProject: projectId, limit: 1000 });
    return data;
  },

  async createProtocol(input: CreateProtocolInput): Promise<Protocol> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const protocolName = input.protocolName || input.name || '';
    const protocolDescription = input.protocolDescription || input.description || null;
    const isPrivate = input.isPrivate ?? (input.isPublic !== undefined ? !input.isPublic : true);

    let protocolInformation = input.protocolInformation;
    if (!protocolInformation && input.configuration) {
      if (typeof input.configuration === 'string') {
        try {
          const parsed = JSON.parse(input.configuration);
          protocolInformation = Array.isArray(parsed) ? parsed : (parsed.movements || []);
        } catch { protocolInformation = []; }
      } else {
        // ProtocolConfiguration has movements property
        protocolInformation = input.configuration.movements || [];
      }
    }

    const { data, error } = await supabase
      .from('Protocol-Table')
      .insert({
        protocol_name: protocolName,
        protocol_description: protocolDescription,
        creator: userId,
        linked_project: input.linkedProjectId || null,
        protocol_information: protocolInformation || [],
        private: isPrivate
      })
      .select(`*, creator:"User-Main"!creator(*), linked_project:"Project-Table"!linked_project(*)`)
      .single();

    if (error) throw new Error(`Failed to create protocol: ${error.message}`);
    return mapToProtocol(data);
  },

  async updateProtocol(id: string, input: UpdateProtocolInput): Promise<Protocol> {
    const updateData: Record<string, unknown> = {};
    if (input.protocolName !== undefined || input.name !== undefined) updateData.protocol_name = input.protocolName || input.name;
    if (input.protocolDescription !== undefined || input.description !== undefined) updateData.protocol_description = input.protocolDescription ?? input.description;
    if (input.linkedProjectId !== undefined) updateData.linked_project = input.linkedProjectId;
    if (input.protocolInformation !== undefined) {
      updateData.protocol_information = input.protocolInformation;
    } else if (input.configuration !== undefined) {
      if (typeof input.configuration === 'string') {
        try {
          const parsed = JSON.parse(input.configuration);
          updateData.protocol_information = Array.isArray(parsed) ? parsed : (parsed.movements || []);
        } catch { updateData.protocol_information = []; }
      } else {
        // ProtocolConfiguration has movements property
        updateData.protocol_information = input.configuration.movements || [];
      }
    }
    if (input.isPrivate !== undefined) updateData.private = input.isPrivate;
    else if (input.isPublic !== undefined) updateData.private = !input.isPublic;

    const { data, error } = await supabase
      .from('Protocol-Table')
      .update(updateData)
      .eq('id', id)
      .select(`*, creator:"User-Main"!creator(*), linked_project:"Project-Table"!linked_project(*)`)
      .single();

    if (error) throw new Error(`Failed to update protocol: ${error.message}`);
    return mapToProtocol(data);
  },

  async deleteProtocol(id: string): Promise<void> {
    const { error } = await supabase.from('Protocol-Table').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete protocol: ${error.message}`);
  },

  async getPublicProtocols(): Promise<Protocol[]> {
    const { data } = await this.listProtocols({ isPrivate: false, limit: 1000 });
    return data;
  },

  async getMyProtocols(): Promise<Protocol[]> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');
    const { data } = await this.listProtocols({ creatorId: userId, limit: 1000 });
    return data;
  }
};

// ============================================================================
// SESSIONS SERVICE
// ============================================================================

export const sessionsService = {
  async listSessions(filters?: SessionFilters): Promise<{ data: ExperimentSession[]; pagination?: PaginationMeta }> {
    let query = supabase
      .from('Experiment-Session')
      .select(`*, patient:"Patient-Table"!Patient(*), clinician:"User-Main"!Clinician(*), protocol:"Protocol-Table"!Protocol(*)`, { count: 'exact' })
      .is('deleted_at', null);

    if (filters?.patientId) query = query.eq('Patient', filters.patientId);
    if (filters?.clinicianId) query = query.eq('Clinician', filters.clinicianId);
    if (filters?.protocolId) query = query.eq('Protocol', filters.protocolId);
    if (filters?.startDate) query = query.gte('created_at', filters.startDate);
    if (filters?.endDate) query = query.lte('created_at', filters.endDate);

    const sortBy = filters?.sortBy || 'created_at';
    query = query.order(sortBy, { ascending: filters?.sortOrder === 'asc' });

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);

    return {
      data: (data || []).map(mapToSession),
      pagination: count !== null ? { page, limit, total: count, totalPages: Math.ceil(count / limit) } : undefined
    };
  },

  async getSession(id: string): Promise<ExperimentSession> {
    const { data, error } = await supabase
      .from('Experiment-Session')
      .select(`*, patient:"Patient-Table"!Patient(*), clinician:"User-Main"!Clinician(*), protocol:"Protocol-Table"!Protocol(*)`)
      .eq('session_id', id)
      .single();

    if (error || !data) throw new Error('Session not found');
    return mapToSession(data as unknown as Record<string, unknown>);
  },

  async createSession(input: CreateSessionInput): Promise<ExperimentSession> {
    let clinicianId = input.clinicianId;
    if (!clinicianId) {
      clinicianId = await getCurrentUserId() || undefined;
    }

    const { data, error } = await supabase
      .from('Experiment-Session')
      .insert({
        Clinician: clinicianId,
        Patient: input.patientId,
        Protocol: input.protocolId,
        Grip_strength: input.gripStrength || null,
        video_data_path: input.videoDataPath,
        raw_keypoint_data_path: input.rawKeypointDataPath,
        analyzed_xlsx_path: input.analyzedXlsxPath || '',
        Report_pdf_path: input.reportPdfPath || '',
        deleted_at: new Date(9999, 11, 31).toISOString()
      })
      .select(`*, patient:"Patient-Table"!Patient(*), clinician:"User-Main"!Clinician(*), protocol:"Protocol-Table"!Protocol(*)`)
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return mapToSession(data);
  },

  async updateSession(id: string, input: UpdateSessionInput): Promise<ExperimentSession> {
    const updateData: Record<string, unknown> = {};
    if (input.gripStrength !== undefined) updateData.Grip_strength = input.gripStrength;
    if (input.videoDataPath !== undefined) updateData.video_data_path = input.videoDataPath;
    if (input.rawKeypointDataPath !== undefined) updateData.raw_keypoint_data_path = input.rawKeypointDataPath;
    if (input.analyzedXlsxPath !== undefined) updateData.analyzed_xlsx_path = input.analyzedXlsxPath;
    if (input.reportPdfPath !== undefined) updateData.Report_pdf_path = input.reportPdfPath;

    const { data, error } = await supabase
      .from('Experiment-Session')
      .update(updateData)
      .eq('session_id', id)
      .select(`*, patient:"Patient-Table"!Patient(*), clinician:"User-Main"!Clinician(*), protocol:"Protocol-Table"!Protocol(*)`)
      .single();

    if (error) throw new Error(`Failed to update session: ${error.message}`);
    return mapToSession(data);
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase.from('Experiment-Session').update({ deleted_at: new Date().toISOString() }).eq('session_id', id);
    if (error) throw new Error(`Failed to delete session: ${error.message}`);
  },

  async getPatientSessions(patientId: number | string): Promise<ExperimentSession[]> {
    const { data } = await this.listSessions({ patientId: String(patientId), limit: 100 });
    return data;
  },

  async getUploadUrl(metadata: VideoUploadMetadata): Promise<SignedUrlResponse> {
    const response = await apiClient.post<ApiResponse<SignedUrlResponse>>('/mobile/upload-url', metadata);
    return extractData(response);
  },

  async uploadVideo(file: File, signedUrl: string, onProgress?: (progress: number) => void): Promise<void> {
    await apiClient.put(signedUrl, file, {
      headers: { 'Content-Type': file.type || 'video/mp4' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        }
      }
    });
  },

  async getVideoUrl(id: string): Promise<{ url: string; expiresAt: string }> {
    const response = await apiClient.get<ApiResponse<{ url: string; expiresAt: string }>>(`/sessions/${id}/video-url`);
    return extractData(response);
  }
};

// ============================================================================
// RECORDINGS SERVICE (Legacy wrapper)
// ============================================================================

export const recordingsService = {
  async listRecordings(filters?: RecordingFilters): Promise<{ data: RecordingSession[]; pagination?: PaginationMeta }> {
    const { data, pagination } = await sessionsService.listSessions(filters);
    return { data: data.map(sessionToRecording), pagination };
  },

  async getRecording(id: string): Promise<RecordingSession> {
    const session = await sessionsService.getSession(id);
    return sessionToRecording(session);
  },

  async createRecording(input: CreateRecordingInput): Promise<RecordingSession> {
    const sessionInput: CreateSessionInput = {
      clinicianId: input.clinicianId,
      patientId: parseInt(input.patientId) || 0,
      protocolId: input.protocolConfig?.name || '',
      videoDataPath: input.videoPath || '',
      rawKeypointDataPath: input.keypointsPath || ''
    };
    const session = await sessionsService.createSession(sessionInput);
    return sessionToRecording(session);
  },

  async updateRecording(id: string, input: UpdateRecordingInput): Promise<RecordingSession> {
    const sessionInput: UpdateSessionInput = {
      videoDataPath: input.videoPath,
      rawKeypointDataPath: input.keypointsPath,
      analyzedXlsxPath: input.xlsxPath,
      reportPdfPath: input.pdfPath
    };
    const session = await sessionsService.updateSession(id, sessionInput);
    return sessionToRecording(session);
  },

  async updateStatus(id: string, _input: UpdateRecordingStatusInput): Promise<RecordingSession> {
    const session = await sessionsService.getSession(id);
    return sessionToRecording(session);
  },

  async deleteRecording(id: string): Promise<void> {
    await sessionsService.deleteSession(id);
  },

  getUploadUrl: sessionsService.getUploadUrl,
  uploadVideo: sessionsService.uploadVideo,

  async completeUpload(recordingId: string): Promise<RecordingSession> {
    const response = await apiClient.post<ApiResponse<RecordingSession>>(`/recordings/${recordingId}/complete-upload`);
    return extractData(response);
  },

  async getStatus(id: string): Promise<RecordingSession> {
    return this.getRecording(id);
  },

  async getVideoUrl(id: string): Promise<{ url: string; expiresAt: string }> {
    return sessionsService.getVideoUrl(id);
  },

  async getPatientRecordings(patientId: string): Promise<RecordingSession[]> {
    const sessions = await sessionsService.getPatientSessions(patientId);
    return sessions.map(sessionToRecording);
  },

  async getRecordingsByStatus(_status: RecordingSession['status']): Promise<RecordingSession[]> {
    const { data } = await sessionsService.listSessions({ limit: 100 });
    return data.map(sessionToRecording);
  }
};

// ============================================================================
// CLINICAL SERVICE
// ============================================================================

export const clinicalService = {
  async getAnalysis(recordingId: string): Promise<AnalysisData | null> {
    try {
      const response = await apiClient.get<ApiResponse<AnalysisData>>(`/recordings/${recordingId}/analysis`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  async getAnalysisUrl(recordingId: string): Promise<{ url: string; expiresAt: string } | null> {
    try {
      const response = await apiClient.get<ApiResponse<{ url: string; expiresAt: string }>>(`/recordings/${recordingId}/analysis-url`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  async getPdfReportUrl(recordingId: string): Promise<{ url: string; expiresAt: string } | null> {
    try {
      const response = await apiClient.get<ApiResponse<{ url: string; expiresAt: string }>>(`/recordings/${recordingId}/pdf-url`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  async getExcelReportUrl(recordingId: string): Promise<{ url: string; expiresAt: string } | null> {
    try {
      const response = await apiClient.get<ApiResponse<{ url: string; expiresAt: string }>>(`/recordings/${recordingId}/xlsx-url`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  async getPlotUrls(recordingId: string): Promise<{ frequencySpectrum?: string; tremorWaveform?: string; romHeatmap?: string; trajectory?: string } | null> {
    try {
      const response = await apiClient.get<ApiResponse<{ frequencySpectrum?: string; tremorWaveform?: string; romHeatmap?: string; trajectory?: string }>>(`/recordings/${recordingId}/plot-urls`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  async comparePatientHistory(patientId: string, options?: { limit?: number; startDate?: string; endDate?: string }) {
    const response = await apiClient.get<ApiResponse<{
      recordings: Array<{ recordingId: string; recordingDate: string; analysis: AnalysisData | null }>;
      trends: { tremorFrequency?: { change: number; trend: 'improving' | 'stable' | 'declining' }; tremorAmplitude?: { change: number; trend: 'improving' | 'stable' | 'declining' }; overallScore?: { change: number; trend: 'improving' | 'stable' | 'declining' } };
    }>>(`/clinical/patients/${patientId}/history`, { params: options });
    return extractData(response);
  },

  async compareGroup(options: { diagnosis?: string; patientIds?: string[]; startDate?: string; endDate?: string }) {
    const response = await apiClient.post<ApiResponse<{
      totalRecordings: number;
      averageMetrics: { tremorFrequency?: number; tremorAmplitude?: number; overallScore?: number };
      distribution: { metric: string; min: number; max: number; mean: number; median: number; stdDev: number }[];
    }>>('/clinical/group-analysis', options);
    return extractData(response);
  },

  hasAnalysis(recording: RecordingSession): boolean {
    return recording.status === 'completed' && !!recording.analysisPath;
  },

  hasReports(recording: RecordingSession): boolean {
    return !!recording.pdfPath || !!recording.xlsxPath;
  },

  hasPlots(recording: RecordingSession): boolean {
    return !!recording.plotsPath;
  },

  formatTremorFrequency(hz: number | undefined): string {
    if (hz === undefined || hz === null) return 'N/A';
    return `${hz.toFixed(1)} Hz`;
  },

  formatOverallScore(score: number | undefined): string {
    if (score === undefined || score === null) return 'N/A';
    return `${Math.round(score)}/100`;
  },

  getSeverityLevel(score: number | undefined): 'normal' | 'mild' | 'moderate' | 'severe' | 'unknown' {
    if (score === undefined || score === null) return 'unknown';
    if (score >= 80) return 'normal';
    if (score >= 60) return 'mild';
    if (score >= 40) return 'moderate';
    return 'severe';
  },

  async analyzeWithProtocol(recordingId: string, options?: { forceReanalyze?: boolean }): Promise<unknown> {
    const response = await apiClient.post<ApiResponse<unknown>>(`/recordings/${recordingId}/analyze`, options);
    return extractData(response);
  },

  async getMovementAnalysisResults(recordingId: string): Promise<unknown> {
    return this.getAnalysis(recordingId);
  },

  // Analysis CRUD
  async createAnalysis(recordingId: string, data: unknown): Promise<unknown> {
    const response = await apiClient.post<ApiResponse<unknown>>(`/recordings/${recordingId}/analysis`, data);
    return extractData(response);
  },

  async updateAnalysis(analysisId: string, data: unknown): Promise<unknown> {
    const response = await apiClient.patch<ApiResponse<unknown>>(`/clinical/analysis/${analysisId}`, data);
    return extractData(response);
  },

  // Annotations CRUD
  async listAnnotations(recordingId: string, filters?: unknown): Promise<{ data: unknown[]; pagination?: unknown }> {
    const response = await apiClient.get<ApiResponse<unknown[]>>(`/recordings/${recordingId}/annotations`, { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async createAnnotation(recordingId: string, data: unknown): Promise<unknown> {
    const response = await apiClient.post<ApiResponse<unknown>>(`/recordings/${recordingId}/annotations`, data);
    return extractData(response);
  },

  async updateAnnotation(annotationId: string, data: unknown): Promise<unknown> {
    const response = await apiClient.patch<ApiResponse<unknown>>(`/clinical/annotations/${annotationId}`, data);
    return extractData(response);
  },

  async deleteAnnotation(annotationId: string): Promise<void> {
    await apiClient.delete(`/clinical/annotations/${annotationId}`);
  },

  // Comparisons CRUD
  async listComparisons(filters?: unknown): Promise<{ data: unknown[]; pagination?: unknown }> {
    const response = await apiClient.get<ApiResponse<unknown[]>>('/clinical/comparisons', { params: filters });
    return { data: extractData(response), pagination: extractPagination(response) };
  },

  async getComparison(comparisonId: string): Promise<unknown> {
    const response = await apiClient.get<ApiResponse<unknown>>(`/clinical/comparisons/${comparisonId}`);
    return extractData(response);
  },

  async createComparison(data: unknown): Promise<unknown> {
    const response = await apiClient.post<ApiResponse<unknown>>('/clinical/comparisons', data);
    return extractData(response);
  },

  async deleteComparison(comparisonId: string): Promise<void> {
    await apiClient.delete(`/clinical/comparisons/${comparisonId}`);
  },

  // LSTM Event Detection
  async getLSTMEvents(recordingId: string): Promise<LSTMEventsResponse | null> {
    try {
      const response = await apiClient.get<ApiResponse<LSTMEventsResponse>>(`/clinical/recordings/${recordingId}/lstm-events`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  // Comprehensive Analysis (combines all data)
  async getComprehensiveAnalysis(recordingId: string): Promise<ComprehensiveAnalysisResponse | null> {
    try {
      const response = await apiClient.get<ApiResponse<ComprehensiveAnalysisResponse>>(`/clinical/recordings/${recordingId}/comprehensive-analysis`);
      return extractData(response);
    } catch {
      return null;
    }
  },

  // Get plot image URLs
  async getAnalysisPlotUrls(recordingId: string): Promise<AnalysisPlotUrls | null> {
    try {
      const response = await apiClient.get<ApiResponse<AnalysisPlotUrls>>(`/clinical/recordings/${recordingId}/plot-urls`);
      return extractData(response);
    } catch {
      return null;
    }
  }
};
