package com.handpose.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Patient model matching the Patient-Table Supabase schema.
 *
 * Table: "Patient-Table"
 * Primary Key: id (uuid)
 *
 * Note: Names are now split into first_name, middle_name, last_name
 * instead of single patientName field.
 */
data class Patient(
    val id: String,
    @SerializedName("patientId")
    val patientId: String,              // User-defined ID like "P001"
    @SerializedName("firstName")
    val firstName: String,              // first_name: Required
    @SerializedName("middleName")
    val middleName: String? = null,     // middle_name: Optional
    @SerializedName("lastName")
    val lastName: String,               // last_name: Required
    @SerializedName("birthDate")
    val birthDate: String,              // birth_date: Required (yyyy-MM-dd)
    val gender: String?,
    val height: Float,                  // height: Required (cm)
    val weight: Float,                  // weight: Required (kg)
    val diagnosis: String? = "Healthy", // diagnosis: Default 'Healthy'
    @SerializedName("projectId")
    val projectId: String,
    @SerializedName("creatorId")
    val creatorId: String? = null,
    @SerializedName("recordingCount")
    val recordingCount: Int = 0,
    @SerializedName("createdAt")
    val createdAt: String?,
    @SerializedName("updatedAt")
    val updatedAt: String? = null,
    @SerializedName("deletedAt")
    val deletedAt: String? = null
) {
    /**
     * Full name computed from name parts (backward compatibility)
     */
    val patientName: String
        get() = listOfNotNull(firstName, middleName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")

    /**
     * Display name for UI (same as patientName)
     */
    val displayName: String get() = patientName

    /**
     * Date of birth formatted for display (backward compatibility)
     */
    val dateOfBirth: String get() = birthDate

    /**
     * Notes field (backward compatibility - maps to diagnosis)
     */
    val notes: String? get() = diagnosis
}

/**
 * Supabase Patient-Table model for Postgrest serialization.
 * Uses exact field names matching the database schema.
 */
@Serializable
data class SupabasePatientTable(
    val id: String,
    @SerialName("project_id")
    val projectId: String,
    @SerialName("creator_id")
    val creatorId: String,
    @SerialName("patient_id")
    val patientId: String,
    @SerialName("first_name")
    val firstName: String,
    @SerialName("middle_name")
    val middleName: String? = null,
    @SerialName("last_name")
    val lastName: String,
    @SerialName("birth_date")
    val birthDate: String,
    val height: Float,
    val weight: Float,
    val gender: String? = null,
    val diagnosis: String? = "Healthy",
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("deleted_at")
    val deletedAt: String? = null,
    // Aggregation count from joined table
    @SerialName("Experiment-Session")
    val experimentSessions: List<CountResult>? = null
) {
    fun toPatient(): Patient = Patient(
        id = id,
        patientId = patientId,
        firstName = firstName,
        middleName = middleName,
        lastName = lastName,
        birthDate = birthDate,
        gender = gender,
        height = height,
        weight = weight,
        diagnosis = diagnosis,
        projectId = projectId,
        creatorId = creatorId,
        recordingCount = experimentSessions?.firstOrNull()?.count ?: 0,
        createdAt = createdAt,
        deletedAt = deletedAt
    )
}

/**
 * DTO for inserting patients into Supabase Patient-Table.
 * Uses explicit types (no Map<String, Any?>) to avoid serialization errors.
 */
@Serializable
data class SupabasePatientInsert(
    @SerialName("project_id")
    val projectId: String,
    @SerialName("creator_id")
    val creatorId: String,
    @SerialName("patient_id")
    val patientId: String,
    @SerialName("first_name")
    val firstName: String,
    @SerialName("middle_name")
    val middleName: String? = null,
    @SerialName("last_name")
    val lastName: String,
    @SerialName("birth_date")
    val birthDate: String,
    val height: Float,
    val weight: Float,
    val gender: String? = null,
    val diagnosis: String? = "Healthy"
)

// ============================================================================
// API Request/Response Models
// ============================================================================

data class PatientsResponse(
    val success: Boolean,
    val data: List<Patient>?,
    val message: String?
)

data class PatientResponse(
    val success: Boolean,
    val data: Patient?,
    val message: String?
)

/**
 * Request model for creating a patient.
 * Matches the required fields in Patient-Table schema.
 */
data class CreatePatientRequest(
    val patientId: String,              // User-defined ID
    val firstName: String,              // Required
    val middleName: String? = null,     // Optional
    val lastName: String,               // Required
    val birthDate: String,              // Required: yyyy-MM-dd format
    val height: Float,                  // Required: in cm
    val weight: Float,                  // Required: in kg
    val gender: String? = null,
    val diagnosis: String? = "Healthy"
)

/**
 * Request model for updating a patient.
 * All fields optional - only provided fields are updated.
 */
data class UpdatePatientRequest(
    val patientId: String? = null,
    val firstName: String? = null,
    val middleName: String? = null,
    val lastName: String? = null,
    val birthDate: String? = null,
    val height: Float? = null,
    val weight: Float? = null,
    val gender: String? = null,
    val diagnosis: String? = null
)

/**
 * Count result for aggregation queries
 */
@Serializable
data class CountResult(
    val count: Int = 0
)
