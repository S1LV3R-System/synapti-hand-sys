package com.handpose.app.data

import android.util.Log
import com.google.gson.annotations.SerializedName
import com.handpose.app.data.model.*
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

// ==================== DATA MODELS ====================

/**
 * Data Transfer Object for Patient information from API
 *
 * SECURITY NOTE:
 * - Only contains minimum necessary fields for patient selection
 * - No sensitive PHI beyond what's required for identification
 * - Data encrypted in transit via HTTPS
 * - Not persisted locally (fetched fresh each time)
 */
data class PatientDto(
    @SerializedName("id")
    val id: String,

    @SerializedName("firstName")
    val firstName: String,

    @SerializedName("lastName")
    val lastName: String,

    @SerializedName("diagnosis")
    val diagnosis: String? = null,

    @SerializedName("dateOfBirth")
    val dateOfBirth: String? = null,  // ISO date string

    @SerializedName("projectId")
    val projectId: String? = null
)

/**
 * API Response wrapper for patient list
 */
data class PatientsResponse(
    @SerializedName("success")
    val success: Boolean,

    @SerializedName("patients")
    val patients: List<PatientDto> = emptyList(),

    @SerializedName("error")
    val error: String? = null
)

/**
 * Pre-computed session paths for GCS storage.
 */
data class SessionPaths(
    val videoDataPath: String,
    val rawKeypointDataPath: String,
    val analyzedXlsxPath: String,
    val reportPdfPath: String
)

/**
 * Protocol-Table model for Supabase queries.
 */
@Serializable
data class SupabaseProtocolTable(
    val id: String,
    @SerialName("protocol_name")
    val protocolName: String,
    @SerialName("protocol_description")
    val protocolDescription: String? = null,
    val creator: String,
    @SerialName("linked_project")
    val linkedProject: String? = null,
    @SerialName("protocol_information")
    val protocolInformation: List<String> = emptyList(),
    val private: Boolean = true,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("deleted_at")
    val deletedAt: String? = null
) {
    /**
     * Convert to Protocol model for UI use.
     */
    fun toProtocol(): com.handpose.app.recording.Protocol {
        return com.handpose.app.recording.Protocol(
            id = id,
            name = protocolName,
            description = protocolDescription,
            version = null,  // Not in Supabase schema
            indicatedFor = null,  // Not in Supabase schema
            instructions = null,  // Not in Supabase schema
            isSystem = !private  // System protocols are public
        )
    }
}

// ==================== REPOSITORIES ====================

/**
 * Data repository using Supabase Postgrest for direct database access.
 *
 * Updated for new schema with hyphenated table names:
 * - "User-Main" (users)
 * - "Project-Table" (projects)
 * - "Patient-Table" (patients)
 * - "Protocol-Table" (protocols)
 * - "Experiment-Session" (recording_sessions)
 *
 * Uses Row Level Security (RLS) for access control.
 */
@Singleton
class SupabaseDataRepository @Inject constructor(
    private val postgrest: Postgrest
) {
    // ==================== PROJECTS ====================

    /**
     * Get all projects accessible to current user.
     * RLS policies filter based on ownership and membership.
     */
    suspend fun getProjects(): Result<List<Project>> {
        return try {
            val projects = postgrest.from("Project-Table")
                .select(columns = Columns.raw("""
                    *,
                    "Patient-Table"(count)
                """.trimIndent())) {
                    filter {
                        // Filter soft-deleted records using exact null check
                        exact("deleted_at", null)
                    }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<SupabaseProjectTable>()
                .map { it.toProject() }

            Log.d(TAG, "Fetched ${projects.size} projects")
            Result.success(projects)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch projects", e)
            Result.failure(Exception("Failed to load projects: ${e.message}"))
        }
    }

    /**
     * Get a single project by ID.
     */
    suspend fun getProject(id: String): Result<Project> {
        return try {
            val project = postgrest.from("Project-Table")
                .select(columns = Columns.raw("""
                    *,
                    "Patient-Table"(count)
                """.trimIndent())) {
                    filter {
                        eq("project_id", id)
                    }
                }
                .decodeSingleOrNull<SupabaseProjectTable>()
                ?.toProject()

            if (project != null) {
                Result.success(project)
            } else {
                Result.failure(Exception("Project not found"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch project $id", e)
            Result.failure(Exception("Failed to load project: ${e.message}"))
        }
    }

    /**
     * Create a new project.
     */
    suspend fun createProject(
        name: String,
        description: String?,
        creatorId: String,
        dataPath: ProjectDataPath? = null
    ): Result<Project> {
        return try {
            // Generate default data path if not provided
            val defaultDataPath = dataPath ?: ProjectDataPath(
                basePath = "gs://handpose-system/projects/${java.util.UUID.randomUUID()}",
                exportsPath = "gs://handpose-system/projects/${java.util.UUID.randomUUID()}/exports"
            )

            // Create fully serializable insert DTO
            val insertDto = SupabaseProjectInsert(
                projectName = name,
                projectDescription = description,
                projectCreator = creatorId,
                projectMembers = emptyList(),
                projectDataPath = SupabaseProjectDataPath(
                    basePath = defaultDataPath.basePath,
                    exportsPath = defaultDataPath.exportsPath
                )
            )

            val project = postgrest.from("Project-Table")
                .insert(insertDto) {
                    select()
                }
                .decodeSingle<SupabaseProjectTable>()
                .toProject()

            Log.d(TAG, "Created project: ${project.id}")
            Result.success(project)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create project", e)
            Result.failure(Exception("Failed to create project: ${e.message}"))
        }
    }

    /**
     * Update a project.
     */
    suspend fun updateProject(
        projectId: String,
        name: String? = null,
        description: String? = null,
        members: List<String>? = null
    ): Result<Project> {
        return try {
            val updates = buildMap {
                name?.let { put("project_name", it) }
                description?.let { put("project_description", it) }
                members?.let { put("project_members", it) }
            }

            if (updates.isEmpty()) {
                return Result.failure(Exception("No updates provided"))
            }

            val project = postgrest.from("Project-Table")
                .update(updates) {
                    filter {
                        eq("project_id", projectId)
                    }
                    select()
                }
                .decodeSingle<SupabaseProjectTable>()
                .toProject()

            Log.d(TAG, "Updated project: $projectId")
            Result.success(project)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update project $projectId", e)
            Result.failure(Exception("Failed to update project: ${e.message}"))
        }
    }

    /**
     * Soft-delete a project by setting deleted_at timestamp.
     */
    suspend fun deleteProject(projectId: String): Result<Unit> {
        return try {
            val timestamp = java.time.Instant.now().toString()

            postgrest.from("Project-Table")
                .update(mapOf("deleted_at" to timestamp)) {
                    filter {
                        eq("project_id", projectId)
                    }
                }

            Log.d(TAG, "Soft-deleted project: $projectId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete project $projectId", e)
            Result.failure(Exception("Failed to delete project: ${e.message}"))
        }
    }

    // ==================== PATIENTS ====================

    /**
     * Get patients for a specific project.
     */
    suspend fun getPatientsByProject(projectId: String): Result<List<Patient>> {
        return try {
            val patients = postgrest.from("Patient-Table")
                .select(columns = Columns.raw("""
                    *,
                    "Experiment-Session"(count)
                """.trimIndent())) {
                    filter {
                        eq("project_id", projectId)
                        exact("deleted_at", null)
                    }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<SupabasePatientTable>()
                .map { it.toPatient() }

            Log.d(TAG, "Fetched ${patients.size} patients for project $projectId")
            Result.success(patients)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch patients for project $projectId", e)
            Result.failure(Exception("Failed to load patients: ${e.message}"))
        }
    }

    /**
     * Get a single patient by ID.
     */
    suspend fun getPatient(id: String): Result<Patient> {
        return try {
            val patient = postgrest.from("Patient-Table")
                .select(columns = Columns.raw("""
                    *,
                    "Experiment-Session"(count)
                """.trimIndent())) {
                    filter {
                        eq("id", id)
                    }
                }
                .decodeSingleOrNull<SupabasePatientTable>()
                ?.toPatient()

            if (patient != null) {
                Result.success(patient)
            } else {
                Result.failure(Exception("Patient not found"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch patient $id", e)
            Result.failure(Exception("Failed to load patient: ${e.message}"))
        }
    }

    /**
     * Create a new patient with split name fields.
     */
    suspend fun createPatient(
        projectId: String,
        creatorId: String,
        patientId: String,
        firstName: String,
        lastName: String,
        birthDate: String,
        height: Float,
        weight: Float,
        middleName: String? = null,
        gender: String? = null,
        diagnosis: String? = "Healthy"
    ): Result<Patient> {
        return try {
            val insertDto = SupabasePatientInsert(
                projectId = projectId,
                creatorId = creatorId,
                patientId = patientId,
                firstName = firstName,
                middleName = middleName,
                lastName = lastName,
                birthDate = birthDate,
                height = height,
                weight = weight,
                gender = gender,
                diagnosis = diagnosis
            )

            val patient = postgrest.from("Patient-Table")
                .insert(insertDto) {
                    select()
                }
                .decodeSingle<SupabasePatientTable>()
                .toPatient()

            Log.d(TAG, "Created patient: ${patient.id}")
            Result.success(patient)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create patient", e)
            Result.failure(Exception("Failed to create patient: ${e.message}"))
        }
    }

    /**
     * Update a patient.
     */
    suspend fun updatePatient(
        id: String,
        patientId: String? = null,
        firstName: String? = null,
        middleName: String? = null,
        lastName: String? = null,
        birthDate: String? = null,
        height: Float? = null,
        weight: Float? = null,
        gender: String? = null,
        diagnosis: String? = null
    ): Result<Patient> {
        return try {
            val updates = buildMap {
                patientId?.let { put("patient_id", it) }
                firstName?.let { put("first_name", it) }
                middleName?.let { put("middle_name", it) }
                lastName?.let { put("last_name", it) }
                birthDate?.let { put("birth_date", it) }
                height?.let { put("height", it) }
                weight?.let { put("weight", it) }
                gender?.let { put("gender", it) }
                diagnosis?.let { put("diagnosis", it) }
            }

            if (updates.isEmpty()) {
                return Result.failure(Exception("No updates provided"))
            }

            val patient = postgrest.from("Patient-Table")
                .update(updates) {
                    filter {
                        eq("id", id)
                    }
                    select()
                }
                .decodeSingle<SupabasePatientTable>()
                .toPatient()

            Log.d(TAG, "Updated patient: $id")
            Result.success(patient)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update patient $id", e)
            Result.failure(Exception("Failed to update patient: ${e.message}"))
        }
    }

    /**
     * Soft-delete a patient by setting deleted_at timestamp.
     */
    suspend fun deletePatient(patientId: String): Result<Unit> {
        return try {
            val timestamp = java.time.Instant.now().toString()

            postgrest.from("Patient-Table")
                .update(mapOf("deleted_at" to timestamp)) {
                    filter {
                        eq("id", patientId)
                    }
                }

            Log.d(TAG, "Soft-deleted patient: $patientId")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete patient $patientId", e)
            Result.failure(Exception("Failed to delete patient: ${e.message}"))
        }
    }

    // ==================== PROTOCOLS ====================

    /**
     * Get all available protocols (public or owned by user).
     */
    suspend fun getProtocols(): Result<List<SupabaseProtocolTable>> {
        return try {
            val protocols = postgrest.from("Protocol-Table")
                .select() {
                    filter {
                        // Filter soft-deleted records using exact null check
                        exact("deleted_at", null)
                    }
                    order("protocol_name", Order.ASCENDING)
                }
                .decodeList<SupabaseProtocolTable>()

            Log.d(TAG, "Fetched ${protocols.size} protocols")
            Result.success(protocols)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch protocols", e)
            Result.failure(Exception("Failed to load protocols: ${e.message}"))
        }
    }

    /**
     * Get a single protocol by ID.
     */
    suspend fun getProtocol(id: String): Result<SupabaseProtocolTable> {
        return try {
            val protocol = postgrest.from("Protocol-Table")
                .select() {
                    filter {
                        eq("id", id)
                    }
                }
                .decodeSingleOrNull<SupabaseProtocolTable>()

            if (protocol != null) {
                Result.success(protocol)
            } else {
                Result.failure(Exception("Protocol not found"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch protocol $id", e)
            Result.failure(Exception("Failed to load protocol: ${e.message}"))
        }
    }

    // ==================== EXPERIMENT SESSIONS ====================

    /**
     * Get experiment sessions for a patient.
     */
    suspend fun getSessionsByPatient(patientId: String): Result<List<ExperimentSession>> {
        return try {
            val sessions = postgrest.from("Experiment-Session")
                .select(columns = Columns.raw("""
                    *,
                    "Protocol-Table"(id, protocol_name, protocol_description)
                """.trimIndent())) {
                    filter {
                        eq("Patient", patientId)
                        exact("deleted_at", null)
                    }
                    order("created_at", Order.DESCENDING)
                }
                .decodeList<SupabaseExperimentSession>()
                .map { it.toExperimentSession() }

            Log.d(TAG, "Fetched ${sessions.size} sessions for patient $patientId")
            Result.success(sessions)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch sessions", e)
            Result.failure(Exception("Failed to load sessions: ${e.message}"))
        }
    }

    /**
     * Get a single experiment session by ID.
     */
    suspend fun getSession(sessionId: String): Result<ExperimentSession> {
        return try {
            val session = postgrest.from("Experiment-Session")
                .select(columns = Columns.raw("""
                    *,
                    "Protocol-Table"(id, protocol_name, protocol_description)
                """.trimIndent())) {
                    filter {
                        eq("session_id", sessionId)
                    }
                }
                .decodeSingleOrNull<SupabaseExperimentSession>()
                ?.toExperimentSession()

            if (session != null) {
                Result.success(session)
            } else {
                Result.failure(Exception("Session not found"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch session $sessionId", e)
            Result.failure(Exception("Failed to load session: ${e.message}"))
        }
    }

    /**
     * Create a new experiment session with pre-computed GCS paths.
     */
    suspend fun createExperimentSession(
        clinicianId: String,
        patientId: String,
        protocolId: String,
        gripStrength: List<Float>,
        videoDataPath: String,
        rawKeypointDataPath: String,
        analyzedXlsxPath: String,
        reportPdfPath: String,
        mobileSessionId: String,
        fps: Int,
        deviceInfo: String? = null
    ): Result<ExperimentSession> {
        return try {
            val session = postgrest.from("Experiment-Session")
                .insert(
                    buildMap {
                        put("Clinician", clinicianId)
                        put("Patient", patientId)
                        put("Protocol", protocolId)
                        put("Grip_strength", gripStrength)
                        put("video_data_path", videoDataPath)
                        put("raw_keypoint_data_path", rawKeypointDataPath)
                        put("analyzed_xlsx_path", analyzedXlsxPath)
                        put("Report_pdf_path", reportPdfPath)
                        put("mobile_session_id", mobileSessionId)
                        put("fps", fps)
                        put("status", "created")
                        deviceInfo?.let { put("device_info", it) }
                    }
                ) {
                    select()
                }
                .decodeSingle<SupabaseExperimentSession>()
                .toExperimentSession()

            Log.d(TAG, "Created experiment session: ${session.sessionId}")
            Result.success(session)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create experiment session", e)
            Result.failure(Exception("Failed to create session: ${e.message}"))
        }
    }

    /**
     * Update experiment session status and metadata.
     */
    suspend fun updateSessionStatus(
        sessionId: String,
        status: String? = null,
        duration: Int? = null,
        analysisProgress: Int? = null,
        analysisError: String? = null,
        clinicalNotes: String? = null
    ): Result<Unit> {
        return try {
            val updates = buildMap {
                status?.let { put("status", it) }
                duration?.let { put("duration", it) }
                analysisProgress?.let { put("analysis_progress", it) }
                analysisError?.let { put("analysis_error", it) }
                clinicalNotes?.let { put("clinical_notes", it) }
            }

            if (updates.isEmpty()) {
                return Result.failure(Exception("No updates provided"))
            }

            postgrest.from("Experiment-Session")
                .update(updates) {
                    filter {
                        eq("session_id", sessionId)
                    }
                }

            Log.d(TAG, "Updated session $sessionId status to $status")
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update session status", e)
            Result.failure(Exception("Failed to update session: ${e.message}"))
        }
    }

    /**
     * Get session by mobile session ID (for resuming uploads).
     */
    suspend fun getSessionByMobileId(mobileSessionId: String): Result<ExperimentSession?> {
        return try {
            val session = postgrest.from("Experiment-Session")
                .select(columns = Columns.raw("""
                    *,
                    "Protocol-Table"(id, protocol_name, protocol_description)
                """.trimIndent())) {
                    filter {
                        eq("mobile_session_id", mobileSessionId)
                    }
                }
                .decodeSingleOrNull<SupabaseExperimentSession>()
                ?.toExperimentSession()

            Result.success(session)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch session by mobile ID", e)
            Result.failure(Exception("Failed to load session: ${e.message}"))
        }
    }

    // ==================== UTILITY FUNCTIONS ====================

    /**
     * Generate pre-computed GCS paths for a new experiment session.
     */
    fun generateSessionPaths(
        userId: String,
        patientId: String,
        sessionId: String,
        bucketName: String = "handpose-system"
    ): SessionPaths {
        val basePath = "gs://$bucketName/users/$userId/patients/$patientId/sessions/$sessionId"
        return SessionPaths(
            videoDataPath = "$basePath/video.mp4",
            rawKeypointDataPath = "$basePath/keypoints.csv",
            analyzedXlsxPath = "$basePath/analysis.xlsx",
            reportPdfPath = "$basePath/report.pdf"
        )
    }

    companion object {
        private const val TAG = "SupabaseDataRepo"
    }
}

// ==================== UTILITIES ====================

/**
 * Base class for data managers/repositories that provides common error handling,
 * logging, and Result<T> wrapping patterns.
 *
 * This eliminates ~50-75 lines of duplicated boilerplate across repository classes
 * by centralizing the try-catch-log-return pattern that wraps every data access operation.
 *
 * @param supabaseDataRepository The underlying data source
 * @param tag Logging tag for this manager (typically the class name)
 */
abstract class BaseDataManager(
    protected val supabaseDataRepository: SupabaseDataRepository,
    private val tag: String
) {
    /**
     * Execute a data operation with automatic error handling and logging.
     *
     * Pattern:
     * 1. Wraps operation in try-catch
     * 2. Logs errors automatically
     * 3. Maps exceptions to Result.failure with consistent error messages
     * 4. Optionally logs success via onSuccess callback
     *
     * @param operation The operation name for error messages (e.g., "fetch patients")
     * @param onSuccess Optional callback for success logging/side effects
     * @param block The actual data operation to execute
     * @return Result<T> from the operation or mapped failure
     */
    protected suspend fun <T> executeWithLogging(
        operation: String,
        onSuccess: ((T) -> Unit)? = null,
        block: suspend () -> Result<T>
    ): Result<T> {
        return try {
            val result = block()
            result.onSuccess { data ->
                onSuccess?.invoke(data)
            }
            result
        } catch (e: Exception) {
            Log.e(tag, "Error during $operation", e)
            Result.failure(Exception("Failed to $operation: ${e.message}"))
        }
    }

    /**
     * Execute a data operation with automatic error handling and logging (Unit variant).
     *
     * Specialized version for operations that return Result<Unit>.
     *
     * @param operation The operation name for error messages (e.g., "delete patient")
     * @param onSuccess Optional callback for success logging/side effects
     * @param block The actual data operation to execute
     * @return Result<Unit> from the operation or mapped failure
     */
    protected suspend fun executeWithLoggingUnit(
        operation: String,
        onSuccess: (() -> Unit)? = null,
        block: suspend () -> Result<Unit>
    ): Result<Unit> {
        return try {
            val result = block()
            result.onSuccess {
                onSuccess?.invoke()
            }
            result
        } catch (e: Exception) {
            Log.e(tag, "Error during $operation", e)
            Result.failure(Exception("Failed to $operation: ${e.message}"))
        }
    }

    /**
     * Log an informational message using this manager's tag.
     */
    protected fun logInfo(message: String) {
        Log.i(tag, message)
    }

    /**
     * Log a debug message using this manager's tag.
     */
    protected fun logDebug(message: String) {
        Log.d(tag, message)
    }

    /**
     * Log an error message using this manager's tag.
     */
    protected fun logError(message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }
}
