package com.handpose.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * User model matching the User-Main Supabase table schema.
 *
 * Table: "User-Main"
 * Primary Key: User_ID (uuid)
 */
data class User(
    val id: String,                          // User_ID in database
    val email: String,
    @SerializedName("userType")
    val userType: String = "Clinician",      // user_type: Clinician, Researcher, Patient
    @SerializedName("firstName")
    val firstName: String?,
    @SerializedName("middleName")
    val middleName: String? = null,          // middle__name in database (note: double underscore)
    @SerializedName("lastName")
    val lastName: String?,
    @SerializedName("birthDate")
    val birthDate: String? = null,           // birth_date: Required in schema
    @SerializedName("phoneNumber")
    val phoneNumber: String? = null,         // phone_number: Required in schema
    val institute: String? = null,           // Institute in database
    val department: String? = null,          // Department in database
    @SerializedName("verificationStatus")
    val verificationStatus: Boolean = false, // Verification_status
    @SerializedName("approvalStatus")
    val approvalStatus: Boolean = false,     // Approval_status
    @SerializedName("verifiedAt")
    val verifiedAt: String? = null,          // Verified_at
    @SerializedName("approvedAt")
    val approvedAt: String? = null,          // Approved_at
    @SerializedName("rejectedAt")
    val rejectedAt: String? = null,          // Rejected_at
    @SerializedName("createdAt")
    val createdAt: String? = null,
    @SerializedName("deletedAt")
    val deletedAt: String? = null
) {
    /**
     * Full name computed from name parts
     */
    val fullName: String
        get() = listOfNotNull(firstName, middleName, lastName)
            .filter { it.isNotBlank() }
            .joinToString(" ")

    /**
     * Backward compatibility: isApproved maps to approvalStatus
     */
    val isApproved: Boolean get() = approvalStatus

    /**
     * Backward compatibility: isActive is true if not deleted
     */
    val isActive: Boolean get() = deletedAt == null

    /**
     * Legacy role mapping: userType maps to role
     */
    val role: String get() = userType

    /**
     * Legacy hospital mapping: institute maps to hospital
     */
    val hospital: String? get() = institute
}

/**
 * Supabase User-Main table model for Postgrest serialization.
 * Uses snake_case field names matching the database schema.
 */
@Serializable
data class SupabaseUserMain(
    @SerialName("User_ID")
    val userId: String,
    val email: String,
    @SerialName("user_type")
    val userType: String = "Clinician",
    @SerialName("first_name")
    val firstName: String? = null,
    @SerialName("middle__name")
    val middleName: String? = null,
    @SerialName("last_name")
    val lastName: String? = null,
    @SerialName("birth_date")
    val birthDate: String? = null,
    @SerialName("phone_number")
    val phoneNumber: String? = null,
    @SerialName("Institute")
    val institute: String? = null,
    @SerialName("Department")
    val department: String? = null,
    @SerialName("Verification_status")
    val verificationStatus: Boolean? = false,
    @SerialName("Approval_status")
    val approvalStatus: Boolean? = false,
    @SerialName("Verified_at")
    val verifiedAt: String? = null,
    @SerialName("Approved_at")
    val approvedAt: String? = null,
    @SerialName("Rejected_at")
    val rejectedAt: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("deleted_at")
    val deletedAt: String? = null,
    @SerialName("auth_user_id")
    val authUserId: String? = null
) {
    /**
     * Convert to app's User model
     */
    fun toUser(): User = User(
        id = userId,
        email = email,
        userType = userType,
        firstName = firstName,
        middleName = middleName,
        lastName = lastName,
        birthDate = birthDate,
        phoneNumber = phoneNumber,
        institute = institute,
        department = department,
        verificationStatus = verificationStatus ?: false,
        approvalStatus = approvalStatus ?: false,
        verifiedAt = verifiedAt,
        approvedAt = approvedAt,
        rejectedAt = rejectedAt,
        createdAt = createdAt,
        deletedAt = deletedAt
    )
}

// ============================================================================
// Auth Request/Response Models
// ============================================================================

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val success: Boolean,
    val data: LoginData?,
    val message: String?
)

data class LoginData(
    val user: User,
    val token: String
)

data class UserResponse(
    val success: Boolean,
    val data: User?,
    val message: String?
)

data class BaseResponse(
    val success: Boolean,
    val message: String?
)
