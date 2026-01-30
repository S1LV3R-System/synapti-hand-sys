package com.handpose.app.data.model

import com.google.gson.annotations.SerializedName
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Project model matching the Project-Table Supabase schema.
 *
 * Table: "Project-Table"
 * Primary Key: project_id (uuid)
 *
 * Note: project_members is now a UUID array instead of a join table.
 */
data class Project(
    val id: String,                              // project_id in database
    val name: String,                            // project_name
    val description: String? = null,             // project_description
    @SerializedName("creatorId")
    val creatorId: String? = null,               // project_creator: FK to User-Main
    @SerializedName("members")
    val members: List<String> = emptyList(),     // project_members: UUID array
    @SerializedName("dataPath")
    val dataPath: ProjectDataPath? = null,       // project-data_path: JSON object
    @SerializedName("isPublic")
    val isPublic: Boolean = false,               // Derived from visibility
    @SerializedName("_count")
    val count: ProjectCount? = null,             // Aggregation counts
    @SerializedName("createdAt")
    val createdAt: String? = null,
    @SerializedName("updatedAt")
    val updatedAt: String? = null,
    @SerializedName("deletedAt")
    val deletedAt: String? = null
) {
    // Convenience properties to access counts
    val patientCount: Int get() = count?.patients ?: 0
    val recordingCount: Int get() = count?.recordings ?: 0

    /**
     * Check if a user is a member of this project
     */
    fun isMember(userId: String): Boolean =
        creatorId == userId || members.contains(userId)
}

/**
 * Project data path JSON structure
 */
data class ProjectDataPath(
    @SerializedName("base_path")
    val basePath: String = "",
    @SerializedName("exports_path")
    val exportsPath: String = ""
)

/**
 * Prisma returns counts in a nested _count object
 */
data class ProjectCount(
    val patients: Int = 0,
    val recordings: Int = 0
)

/**
 * Supabase Project-Table model for Postgrest serialization.
 * Uses exact field names matching the database schema.
 */
@Serializable
data class SupabaseProjectTable(
    @SerialName("project_id")
    val projectId: String,
    @SerialName("project_name")
    val projectName: String,
    @SerialName("project_description")
    val projectDescription: String? = null,
    @SerialName("project_creator")
    val projectCreator: String,
    @SerialName("project_members")
    val projectMembers: List<String> = emptyList(),
    @SerialName("project-data_path")
    val projectDataPath: SupabaseProjectDataPath? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("deleted_at")
    val deletedAt: String? = null,
    // Aggregation counts from joined tables
    @SerialName("Patient-Table")
    val patients: List<CountResult>? = null
) {
    fun toProject(): Project = Project(
        id = projectId,
        name = projectName,
        description = projectDescription,
        creatorId = projectCreator,
        members = projectMembers,
        dataPath = projectDataPath?.let {
            ProjectDataPath(
                basePath = it.basePath,
                exportsPath = it.exportsPath
            )
        },
        count = ProjectCount(
            patients = patients?.firstOrNull()?.count ?: 0,
            recordings = 0  // Recording count not available at project level (indirect relationship)
        ),
        createdAt = createdAt,
        deletedAt = deletedAt
    )
}

/**
 * Supabase project data path JSON structure
 */
@Serializable
data class SupabaseProjectDataPath(
    @SerialName("base_path")
    val basePath: String = "",
    @SerialName("exports_path")
    val exportsPath: String = ""
)

/**
 * Supabase Project-Table insert DTO.
 * This fully serializable class bypasses the Map<String, Any?> serialization issue.
 */
@Serializable
data class SupabaseProjectInsert(
    @SerialName("project_name")
    val projectName: String,
    @SerialName("project_description")
    val projectDescription: String? = null,
    @SerialName("project_creator")
    val projectCreator: String,
    @SerialName("project_members")
    val projectMembers: List<String> = emptyList(),
    @SerialName("project-data_path")
    val projectDataPath: SupabaseProjectDataPath
)

// ============================================================================
// API Request/Response Models
// ============================================================================

data class ProjectsResponse(
    val success: Boolean,
    val data: List<Project>?,
    val message: String?
)

data class ProjectResponse(
    val success: Boolean,
    val data: Project?,
    val message: String?
)

/**
 * Request model for creating a project.
 */
data class CreateProjectRequest(
    val name: String,                           // project_name: Required
    val description: String? = null,            // project_description: Optional
    val members: List<String> = emptyList(),    // project_members: Optional UUID array
    val dataPath: ProjectDataPath? = null       // project-data_path: Optional, auto-generated if null
)

/**
 * Request model for updating a project.
 */
data class UpdateProjectRequest(
    val name: String? = null,
    val description: String? = null,
    val members: List<String>? = null,
    val dataPath: ProjectDataPath? = null
)

/**
 * Request model for adding members to a project.
 */
data class AddProjectMembersRequest(
    val memberIds: List<String>
)

/**
 * Request model for removing a member from a project.
 */
data class RemoveProjectMemberRequest(
    val memberId: String
)
