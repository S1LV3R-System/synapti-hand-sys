package com.handpose.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Experiment Session model matching the Experiment-Session Supabase schema.
 *
 * Table: "Experiment-Session"
 * Primary Key: session_id (uuid)
 *
 * This replaces the previous Recording model with the new schema fields.
 */
data class ExperimentSession(
    @SerializedName("sessionId")
    val sessionId: String,                      // session_id: Primary key
    @SerializedName("clinicianId")
    val clinicianId: String,                    // Clinician: FK to User-Main
    @SerializedName("patientId")
    val patientId: String,                      // Patient: FK to Patient-Table
    @SerializedName("protocolId")
    val protocolId: String,                     // Protocol: FK to Protocol-Table
    @SerializedName("gripStrength")
    val gripStrength: List<Float> = emptyList(), // Grip_strength: Float array
    @SerializedName("videoDataPath")
    val videoDataPath: String,                  // video_data_path: Required
    @SerializedName("rawKeypointDataPath")
    val rawKeypointDataPath: String,            // raw_keypoint_data_path: Required
    @SerializedName("analyzedXlsxPath")
    val analyzedXlsxPath: String,               // analyzed_xlsx_path: Required
    @SerializedName("reportPdfPath")
    val reportPdfPath: String,                  // Report_pdf_path: Required
    val status: String = "created",             // Workflow status
    @SerializedName("mobileSessionId")
    val mobileSessionId: String? = null,        // mobile_session_id: For mobile identification
    val duration: Int? = null,                  // Duration in seconds
    val fps: Int? = null,                       // Frames per second
    @SerializedName("deviceInfo")
    val deviceInfo: String? = null,             // Device information JSON
    @SerializedName("analysisProgress")
    val analysisProgress: Int = 0,              // Processing progress 0-100
    @SerializedName("analysisError")
    val analysisError: String? = null,          // Error message if failed
    @SerializedName("clinicalNotes")
    val clinicalNotes: String? = null,          // Clinical notes
    @SerializedName("createdAt")
    val createdAt: String? = null,
    @SerializedName("deletedAt")
    val deletedAt: String? = null,
    // Nested protocol info for display
    val protocol: ExperimentProtocol? = null
) {
    /**
     * Backward compatibility: id maps to sessionId
     */
    val id: String get() = sessionId

    /**
     * Backward compatibility: projectId from patient context
     */
    val projectId: String? get() = null // Must be fetched from patient

    /**
     * Check if video has been uploaded
     */
    val hasVideo: Boolean
        get() = videoDataPath.isNotEmpty() && !videoDataPath.contains("pending")

    /**
     * Check if keypoints have been uploaded
     */
    val hasKeypoints: Boolean
        get() = rawKeypointDataPath.isNotEmpty() && !rawKeypointDataPath.contains("pending")

    /**
     * Duration in milliseconds (backward compatibility)
     */
    val durationMs: Long?
        get() = duration?.let { it * 1000L }

    /**
     * Backward compatibility: avgFps maps to fps
     */
    val avgFps: Float?
        get() = fps?.toFloat()

    /**
     * Video URL for playback (backward compatibility)
     */
    val videoUrl: String?
        get() = if (hasVideo) videoDataPath else null

    /**
     * Keypoints URL for download (backward compatibility)
     */
    val keypointsUrl: String?
        get() = if (hasKeypoints) rawKeypointDataPath else null

    /**
     * Total frames (computed if fps and duration available)
     */
    val totalFrames: Int?
        get() = if (fps != null && duration != null) fps * duration else null
}

/**
 * Protocol info nested in ExperimentSession response
 */
data class ExperimentProtocol(
    val id: String,
    val name: String,
    val description: String? = null
)

/**
 * Supabase Experiment-Session model for Postgrest serialization.
 * Uses exact field names matching the database schema.
 */
@Serializable
data class SupabaseExperimentSession(
    @SerialName("session_id")
    val sessionId: String,
    @SerialName("Clinician")
    val clinician: String,
    @SerialName("Patient")
    val patient: String,
    @SerialName("Protocol")
    val protocol: String,
    @SerialName("Grip_strength")
    val gripStrength: List<Float> = emptyList(),
    @SerialName("video_data_path")
    val videoDataPath: String,
    @SerialName("raw_keypoint_data_path")
    val rawKeypointDataPath: String,
    @SerialName("analyzed_xlsx_path")
    val analyzedXlsxPath: String,
    @SerialName("Report_pdf_path")
    val reportPdfPath: String,
    val status: String = "created",
    @SerialName("mobile_session_id")
    val mobileSessionId: String? = null,
    val duration: Int? = null,
    val fps: Int? = null,
    @SerialName("device_info")
    val deviceInfo: String? = null,
    @SerialName("analysis_progress")
    val analysisProgress: Int = 0,
    @SerialName("analysis_error")
    val analysisError: String? = null,
    @SerialName("clinical_notes")
    val clinicalNotes: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("deleted_at")
    val deletedAt: String? = null,
    // Nested protocol info
    @SerialName("Protocol-Table")
    val protocolInfo: SupabaseProtocolNested? = null
) {
    fun toExperimentSession(): ExperimentSession = ExperimentSession(
        sessionId = sessionId,
        clinicianId = clinician,
        patientId = patient,
        protocolId = protocol,
        gripStrength = gripStrength,
        videoDataPath = videoDataPath,
        rawKeypointDataPath = rawKeypointDataPath,
        analyzedXlsxPath = analyzedXlsxPath,
        reportPdfPath = reportPdfPath,
        status = status,
        mobileSessionId = mobileSessionId,
        duration = duration,
        fps = fps,
        deviceInfo = deviceInfo,
        analysisProgress = analysisProgress,
        analysisError = analysisError,
        clinicalNotes = clinicalNotes,
        createdAt = createdAt,
        deletedAt = deletedAt,
        protocol = protocolInfo?.let {
            ExperimentProtocol(
                id = it.id,
                name = it.protocolName,
                description = it.protocolDescription
            )
        }
    )
}

/**
 * Nested protocol info from Supabase join
 */
@Serializable
data class SupabaseProtocolNested(
    val id: String,
    @SerialName("protocol_name")
    val protocolName: String,
    @SerialName("protocol_description")
    val protocolDescription: String? = null
)

// ============================================================================
// API Request/Response Models
// ============================================================================

data class ExperimentSessionsResponse(
    val success: Boolean,
    val data: List<ExperimentSession>?,
    val message: String?
)

data class ExperimentSessionResponse(
    val success: Boolean,
    val data: ExperimentSession?,
    val message: String?
)

/**
 * Request model for creating an experiment session.
 * Pre-computed paths are required at creation time.
 */
data class CreateExperimentSessionRequest(
    val clinicianId: String,                // Clinician UUID
    val patientId: String,                  // Patient UUID
    val protocolId: String,                 // Protocol UUID
    val gripStrength: List<Float>,          // Grip strength measurements
    val videoDataPath: String,              // Pre-computed GCS path
    val rawKeypointDataPath: String,        // Pre-computed GCS path
    val analyzedXlsxPath: String,           // Pre-computed GCS path
    val reportPdfPath: String,              // Pre-computed GCS path
    val mobileSessionId: String,            // Mobile session identifier
    val fps: Int,                           // Target FPS
    val deviceInfo: String? = null          // Device metadata JSON
)

/**
 * Request model for updating experiment session status.
 */
data class UpdateExperimentSessionRequest(
    val status: String? = null,
    val duration: Int? = null,
    val analysisProgress: Int? = null,
    val analysisError: String? = null,
    val clinicalNotes: String? = null
)

// ============================================================================
// Backward Compatibility: Recording Type Aliases
// ============================================================================

/**
 * Type alias for backward compatibility with existing code.
 * Recording is now ExperimentSession.
 */
typealias Recording = ExperimentSession

/**
 * Type alias for RecordingProtocol (backward compatibility)
 */
typealias RecordingProtocol = ExperimentProtocol

/**
 * Type alias for RecordingsResponse (backward compatibility)
 */
typealias RecordingsResponse = ExperimentSessionsResponse

/**
 * Type alias for RecordingResponse (backward compatibility)
 */
typealias RecordingResponse = ExperimentSessionResponse
