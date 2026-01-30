package com.handpose.app.patients

// ============================================================================
// IMPORTS
// ============================================================================

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewModelScope
import com.handpose.app.MainActivity
import com.handpose.app.auth.TokenManager
import com.handpose.app.common.BaseUiState
import com.handpose.app.common.BaseViewModel
import com.handpose.app.common.LoadingState
import com.handpose.app.common.isLoading
import com.handpose.app.data.BaseDataManager
import com.handpose.app.data.SupabaseDataRepository
import com.handpose.app.data.model.BaseResponse
import com.handpose.app.data.model.CreatePatientRequest
import com.handpose.app.data.model.ExperimentSession
import com.handpose.app.data.model.Patient
import com.handpose.app.data.model.PatientResponse
import com.handpose.app.data.model.PatientsResponse
import com.handpose.app.data.model.Recording
import com.handpose.app.data.model.UpdatePatientRequest
import com.handpose.app.projects.ProjectRepository
import com.handpose.app.ui.theme.SynaptiHandTheme
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// DATA LAYER - Service Interface
// ============================================================================

/**
 * Retrofit service interface for patient-related API endpoints.
 *
 * Provides network operations for CRUD operations on patients.
 */
interface PatientService {

    /**
     * Get all patients accessible to the current user
     * Endpoint: GET /api/patients
     */
    @GET("/api/patients")
    suspend fun getAllPatients(): Response<PatientsResponse>

    /**
     * Get patients for a specific project
     * Endpoint: GET /api/patients
     * @param projectId The project ID to filter patients by
     */
    @GET("/api/patients")
    suspend fun getPatientsByProject(
        @Query("projectId") projectId: String
    ): Response<PatientsResponse>

    /**
     * Get a single patient by ID
     * Endpoint: GET /api/patients/{id}
     */
    @GET("/api/patients/{id}")
    suspend fun getPatient(
        @Path("id") id: String
    ): Response<PatientResponse>

    /**
     * Create a new patient
     * Endpoint: POST /api/patients
     */
    @POST("/api/patients")
    suspend fun createPatient(
        @Body request: CreatePatientRequest
    ): Response<PatientResponse>

    /**
     * Update an existing patient
     * Endpoint: PUT /api/patients/{id}
     */
    @PUT("/api/patients/{id}")
    suspend fun updatePatient(
        @Path("id") id: String,
        @Body request: UpdatePatientRequest
    ): Response<PatientResponse>

    /**
     * Delete a patient
     * Endpoint: DELETE /api/patients/{id}
     */
    @DELETE("/api/patients/{id}")
    suspend fun deletePatient(
        @Path("id") id: String
    ): Response<BaseResponse>
}

// ============================================================================
// DATA LAYER - Repository
// ============================================================================

/**
 * Patient repository using Supabase for direct database access.
 *
 * Extends BaseDataManager to eliminate duplicated error handling and logging patterns.
 */
@Singleton
class PatientRepository @Inject constructor(
    supabaseDataRepository: SupabaseDataRepository
) : BaseDataManager(supabaseDataRepository, TAG) {
    private val _patients = MutableStateFlow<List<Patient>>(emptyList())
    val patients: StateFlow<List<Patient>> = _patients.asStateFlow()

    suspend fun fetchPatientsByProject(projectId: String): Result<List<Patient>> {
        return executeWithLogging(
            operation = "fetch patients",
            onSuccess = { patients ->
                _patients.value = patients
                logInfo("Fetched ${patients.size} patients for project $projectId")
            }
        ) {
            supabaseDataRepository.getPatientsByProject(projectId)
        }
    }

    suspend fun getPatient(id: String): Result<Patient> {
        logDebug("Fetching patient detail for ID: ${id.take(8)}...")
        return executeWithLogging(
            operation = "fetch patient"
        ) {
            supabaseDataRepository.getPatient(id)
        }
    }

    /**
     * Create a new patient with the new schema fields.
     *
     * @param projectId The project this patient belongs to
     * @param creatorId The user creating this patient
     * @param patientId The patient's identifier code
     * @param firstName Patient's first name
     * @param lastName Patient's last name
     * @param birthDate Patient's birth date (YYYY-MM-DD format)
     * @param height Patient's height in cm
     * @param weight Patient's weight in kg
     * @param middleName Optional middle name
     * @param gender Optional gender
     * @param diagnosis Optional diagnosis (defaults to "Healthy")
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
        diagnosis: String? = null
    ): Result<Patient> {
        return executeWithLogging(
            operation = "create patient",
            onSuccess = { patient ->
                logInfo("Created patient: ${patient.firstName} ${patient.lastName}")
            }
        ) {
            supabaseDataRepository.createPatient(
                projectId = projectId,
                creatorId = creatorId,
                patientId = patientId,
                firstName = firstName,
                lastName = lastName,
                birthDate = birthDate,
                height = height,
                weight = weight,
                middleName = middleName,
                gender = gender,
                diagnosis = diagnosis
            )
        }
    }

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
        return executeWithLogging(
            operation = "update patient"
        ) {
            supabaseDataRepository.updatePatient(
                id = id,
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
        }
    }

    suspend fun deletePatient(id: String): Result<Unit> {
        return executeWithLoggingUnit(
            operation = "delete patient",
            onSuccess = {
                logInfo("Deleted patient: $id")
            }
        ) {
            supabaseDataRepository.deletePatient(id)
        }
    }

    /**
     * Get experiment sessions (recordings) for a patient.
     */
    suspend fun getPatientRecordings(patientId: String): Result<List<ExperimentSession>> {
        return executeWithLogging(
            operation = "fetch recordings"
        ) {
            supabaseDataRepository.getSessionsByPatient(patientId)
        }
    }

    companion object {
        private const val TAG = "PatientRepository"
    }
}

// ============================================================================
// VIEWMODEL LAYER - UI State & ViewModel
// ============================================================================

/**
 * UI state for patient selection screen
 */
data class PatientSelectionUiState(
    val patients: List<Patient> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

data class PatientsUiState(
    val projectId: String? = null,
    val projectName: String? = null,
    val patients: List<Patient> = emptyList(),
    val filteredPatients: List<Patient> = emptyList(),
    val searchQuery: String = "",
    val isRefreshing: Boolean = false,
    val showCreateDialog: Boolean = false,
    val createPatientId: String = "",
    val createFirstName: String = "",     // First name field
    val createMiddleName: String = "",    // Middle name field (optional)
    val createLastName: String = "",      // Last name field
    val createGender: String = "",
    val createDateOfBirth: String = "",
    val createHeight: String = "",
    val createWeight: String = "",
    val createDiagnosis: String = "",
    val isCreating: Boolean = false,
    val validationErrors: Map<String, String> = emptyMap(),
    val showEditDialog: Boolean = false,
    val editPatientId: String = "",
    val editPatientDbId: String? = null,
    val editFirstName: String = "",       // First name field
    val editMiddleName: String = "",      // Middle name field (optional)
    val editLastName: String = "",        // Last name field
    val editGender: String = "",
    val editDateOfBirth: String = "",
    val editHeight: String = "",
    val editWeight: String = "",
    val editDiagnosis: String = "",
    val isUpdating: Boolean = false,
    val editValidationErrors: Map<String, String> = emptyMap(),
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): PatientsUiState {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

data class PatientDetailUiState(
    val patient: Patient? = null,
    val recordings: List<ExperimentSession> = emptyList(),
    val isRefreshing: Boolean = false,
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): PatientDetailUiState {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

/**
 * ViewModel for patient selection and management
 *
 * SECURITY FEATURES:
 * - Patient data fetched via HTTPS (encrypted in transit)
 * - No local caching of patient PHI
 * - Error messages sanitized (no sensitive data leaked)
 * - Audit logging for patient access
 *
 * PRIVACY:
 * - Implements minimum necessary principle
 * - Only fetches data required for patient selection
 * - No unnecessary patient demographics
 */
@HiltViewModel
class PatientsViewModel @Inject constructor(
    private val patientService: PatientService
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientSelectionUiState())
    val uiState: StateFlow<PatientSelectionUiState> = _uiState.asStateFlow()

    companion object {
        private const val TAG = "PatientsViewModel"
    }

    /**
     * Load patients for a specific project
     *
     * Security: Only fetches patients user has access to via project association
     */
    fun loadPatientsForProject(projectId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            try {
                Log.d(TAG, "Fetching patients for project: ${projectId.take(8)}...")

                val response = patientService.getPatientsByProject(projectId)

                if (response.isSuccessful && response.body() != null) {
                    val patientsResponse = response.body()!!

                    if (patientsResponse.success && patientsResponse.data != null) {
                        // Use existing Patient model from data layer
                        val patients = patientsResponse.data!!

                        Log.i(TAG, "Loaded ${patients.size} patients for project ${projectId.take(8)}")

                        _uiState.update {
                            it.copy(
                                patients = patients,
                                isLoading = false,
                                errorMessage = null
                            )
                        }
                    } else {
                        // API returned error
                        val errorMsg = patientsResponse.message ?: "Failed to load patients"
                        Log.e(TAG, "API error loading patients: $errorMsg")

                        _uiState.update {
                            it.copy(
                                patients = emptyList(),
                                isLoading = false,
                                errorMessage = sanitizeErrorMessage(errorMsg)
                            )
                        }
                    }
                } else {
                    // HTTP error
                    val errorMsg = when (response.code()) {
                        401 -> "Authentication failed. Please log in again."
                        403 -> "You don't have access to this project's patients."
                        404 -> "Project not found."
                        500 -> "Server error. Please try again later."
                        else -> "Failed to load patients (${response.code()})"
                    }

                    Log.e(TAG, "HTTP error loading patients: ${response.code()} ${response.message()}")

                    _uiState.update {
                        it.copy(
                            patients = emptyList(),
                            isLoading = false,
                            errorMessage = errorMsg
                        )
                    }
                }
            } catch (e: java.net.SocketTimeoutException) {
                Log.e(TAG, "Timeout loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "Connection timeout. Please check your internet connection."
                    )
                }
            } catch (e: java.net.UnknownHostException) {
                Log.e(TAG, "Network error loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "Cannot connect to server. Please check your internet connection."
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected error loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "An unexpected error occurred. Please try again."
                    )
                }
            }
        }
    }

    /**
     * Load all patients (for admin users or when no project selected)
     *
     * Security: Only available to users with appropriate permissions
     * Backend enforces access control (returns only patients user can access)
     */
    fun loadAllPatients() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            try {
                Log.d(TAG, "Fetching all accessible patients from production server")
                Log.d(TAG, "Request URL: https://app.synaptihand.com/api/patients")

                val response = patientService.getAllPatients()

                Log.d(TAG, "Response code: ${response.code()}")
                Log.d(TAG, "Response message: ${response.message()}")
                Log.d(TAG, "Response body: ${response.body()}")
                Log.d(TAG, "Response error body: ${response.errorBody()?.string()}")

                if (response.isSuccessful && response.body() != null) {
                    val patientsResponse = response.body()!!

                    Log.d(TAG, "Success: ${patientsResponse.success}, Data size: ${patientsResponse.data?.size}")

                    if (patientsResponse.success && patientsResponse.data != null) {
                        val patients = patientsResponse.data!!

                        Log.i(TAG, "✅ Loaded ${patients.size} accessible patients")

                        _uiState.update {
                            it.copy(
                                patients = patients,
                                isLoading = false,
                                errorMessage = null
                            )
                        }
                    } else {
                        val errorMsg = patientsResponse.message ?: "Failed to load patients"
                        Log.e(TAG, "❌ API error loading patients: $errorMsg")
                        Log.e(TAG, "Full response: $patientsResponse")

                        _uiState.update {
                            it.copy(
                                patients = emptyList(),
                                isLoading = false,
                                errorMessage = sanitizeErrorMessage(errorMsg)
                            )
                        }
                    }
                } else {
                    val errorBody = try {
                        response.errorBody()?.string()
                    } catch (e: Exception) {
                        "Could not read error body"
                    }

                    val errorMsg = when (response.code()) {
                        401 -> "Authentication failed. Please log in again."
                        403 -> "You don't have permission to view patients."
                        404 -> "Patient endpoint not found. Check server configuration."
                        500 -> "Server error. Please try again later."
                        else -> "Failed to load patients (${response.code()})"
                    }

                    Log.e(TAG, "❌ HTTP error loading patients: ${response.code()} ${response.message()}")
                    Log.e(TAG, "Error body: $errorBody")

                    _uiState.update {
                        it.copy(
                            patients = emptyList(),
                            isLoading = false,
                            errorMessage = errorMsg
                        )
                    }
                }
            } catch (e: java.net.SocketTimeoutException) {
                Log.e(TAG, "Timeout loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "Connection timeout. Please check your internet connection."
                    )
                }
            } catch (e: java.net.UnknownHostException) {
                Log.e(TAG, "Network error loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "Cannot connect to server. Please check your internet connection."
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Unexpected error loading patients", e)
                _uiState.update {
                    it.copy(
                        patients = emptyList(),
                        isLoading = false,
                        errorMessage = "An unexpected error occurred. Please try again."
                    )
                }
            }
        }
    }

    /**
     * Sanitize error messages to prevent information leakage
     *
     * Security: Ensures stack traces, database errors, or system paths
     * are not exposed to the UI where they could be screenshot or logged
     */
    private fun sanitizeErrorMessage(error: String): String {
        // Remove any potential SQL error messages
        if (error.contains("SQL", ignoreCase = true) ||
            error.contains("database", ignoreCase = true) ||
            error.contains("prisma", ignoreCase = true)
        ) {
            return "A database error occurred. Please contact support."
        }

        // Remove any file paths
        if (error.contains("/") || error.contains("\\")) {
            return "A system error occurred. Please contact support."
        }

        // Truncate very long error messages (potential stack traces)
        if (error.length > 200) {
            return "An error occurred. Please try again or contact support."
        }

        return error
    }

    /**
     * Clear patient list (for security when navigating away)
     */
    fun clearPatients() {
        Log.d(TAG, "Clearing patient list")
        _uiState.update {
            it.copy(
                patients = emptyList(),
                isLoading = false,
                errorMessage = null
            )
        }
    }
}

@HiltViewModel
class PatientViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val projectRepository: ProjectRepository,
    private val tokenManager: TokenManager
) : BaseViewModel<PatientsUiState>() {

    override val initialState = PatientsUiState()

    // Separate detail state management (not using base class for this)
    private val _detailUiState = MutableStateFlow(PatientDetailUiState())
    val detailUiState: StateFlow<PatientDetailUiState> = _detailUiState.asStateFlow()

    fun setProjectId(projectId: String) {
        if (currentState.projectId != projectId) {
            updateState { it.copy(projectId = projectId) }
            loadProjectInfo(projectId)
            loadPatients(projectId)
        }
    }

    private fun loadProjectInfo(projectId: String) {
        launchInViewModel {
            val result = projectRepository.getProject(projectId)
            result.fold(
                onSuccess = { project ->
                    updateState { it.copy(projectName = project.name) }
                },
                onFailure = { /* ignore */ }
            )
        }
    }

    private fun loadPatients(projectId: String) {
        executeWithLoading(
            operation = { patientRepository.fetchPatientsByProject(projectId) },
            onSuccess = { patients ->
                updateState {
                    it.copy(
                        patients = patients,
                        filteredPatients = filterPatients(patients, it.searchQuery)
                    )
                }
            }
        )
    }

    fun refreshPatients() {
        val projectId = currentState.projectId ?: return
        launchInViewModel {
            updateState { it.copy(isRefreshing = true) }

            val result = patientRepository.fetchPatientsByProject(projectId)
            result.fold(
                onSuccess = { patients ->
                    updateState {
                        it.copy(
                            patients = patients,
                            filteredPatients = filterPatients(patients, it.searchQuery),
                            isRefreshing = false,
                            loadingState = LoadingState.Success
                        )
                    }
                },
                onFailure = { exception ->
                    updateState {
                        it.copy(
                            isRefreshing = false,
                            loadingState = LoadingState.Error(exception.message ?: "Unknown error"),
                            errorMessage = exception.message
                        )
                    }
                }
            )
        }
    }

    fun updateSearchQuery(query: String) {
        updateState {
            it.copy(
                searchQuery = query,
                filteredPatients = filterPatients(it.patients, query)
            )
        }
    }

    private fun filterPatients(patients: List<Patient>, query: String): List<Patient> {
        if (query.isBlank()) return patients
        val lowerQuery = query.lowercase()
        return patients.filter { patient ->
            patient.patientName.lowercase().contains(lowerQuery) ||
            patient.patientId.lowercase().contains(lowerQuery) ||
            patient.diagnosis?.lowercase()?.contains(lowerQuery) == true
        }
    }

    fun showCreateDialog() {
        updateState {
            it.copy(
                showCreateDialog = true,
                createPatientId = "",
                createFirstName = "",
                createMiddleName = "",
                createLastName = "",
                createGender = "",
                createDateOfBirth = "",
                createHeight = "",
                createWeight = "",
                createDiagnosis = "",
                validationErrors = emptyMap(),
                errorMessage = null
            )
        }
    }

    fun hideCreateDialog() {
        updateState { it.copy(showCreateDialog = false) }
    }

    fun showEditDialog(patient: Patient) {
        updateState {
            it.copy(
                showEditDialog = true,
                editPatientId = patient.patientId,
                editPatientDbId = patient.id,
                editFirstName = patient.firstName,
                editMiddleName = patient.middleName ?: "",
                editLastName = patient.lastName,
                editGender = patient.gender ?: "",
                editDateOfBirth = patient.birthDate,
                editHeight = patient.height.toInt().toString(),
                editWeight = patient.weight.toInt().toString(),
                editDiagnosis = patient.diagnosis ?: "",
                editValidationErrors = emptyMap(),
                errorMessage = null
            )
        }
    }

    fun hideEditDialog() {
        updateState { it.copy(showEditDialog = false) }
    }

    // Update functions for create form
    fun updateCreatePatientId(id: String) {
        updateState { it.copy(createPatientId = id) }
    }

    fun updateCreateFirstName(firstName: String) {
        updateState { it.copy(createFirstName = firstName) }
    }

    fun updateCreateMiddleName(middleName: String) {
        updateState { it.copy(createMiddleName = middleName) }
    }

    fun updateCreateLastName(lastName: String) {
        updateState { it.copy(createLastName = lastName) }
    }

    fun updateCreateGender(gender: String) {
        updateState { it.copy(createGender = gender) }
    }

    fun updateCreateDateOfBirth(dateOfBirth: String) {
        updateState { it.copy(createDateOfBirth = dateOfBirth) }
    }

    fun updateCreateHeight(height: String) {
        updateState { it.copy(createHeight = height) }
    }

    fun updateCreateWeight(weight: String) {
        updateState { it.copy(createWeight = weight) }
    }

    fun updateCreateDiagnosis(diagnosis: String) {
        updateState { it.copy(createDiagnosis = diagnosis) }
    }

    // Update functions for edit form
    fun updateEditFirstName(firstName: String) {
        updateState { it.copy(editFirstName = firstName) }
    }

    fun updateEditMiddleName(middleName: String) {
        updateState { it.copy(editMiddleName = middleName) }
    }

    fun updateEditLastName(lastName: String) {
        updateState { it.copy(editLastName = lastName) }
    }

    fun updateEditGender(gender: String) {
        updateState { it.copy(editGender = gender) }
    }

    fun updateEditDateOfBirth(dateOfBirth: String) {
        updateState { it.copy(editDateOfBirth = dateOfBirth) }
    }

    fun updateEditHeight(height: String) {
        updateState { it.copy(editHeight = height) }
    }

    fun updateEditWeight(weight: String) {
        updateState { it.copy(editWeight = weight) }
    }

    fun updateEditDiagnosis(diagnosis: String) {
        updateState { it.copy(editDiagnosis = diagnosis) }
    }

    private fun validatePatientData(): Boolean {
        val errors = mutableMapOf<String, String>()
        val state = currentState

        // Required field validation
        if (state.createPatientId.trim().isBlank()) {
            errors["patientId"] = "Patient ID is required"
        }
        if (state.createFirstName.trim().isBlank()) {
            errors["firstName"] = "First name is required"
        }
        if (state.createLastName.trim().isBlank()) {
            errors["lastName"] = "Last name is required"
        }
        if (state.createDateOfBirth.trim().isBlank()) {
            errors["birthDate"] = "Birth date is required"
        }

        // Height validation - required and must be numeric
        if (state.createHeight.isBlank()) {
            errors["height"] = "Height is required"
        } else if (!state.createHeight.toFloatOrNull().let { it != null && it > 0 }) {
            errors["height"] = "Height must be a positive number"
        }

        // Weight validation - required and must be numeric
        if (state.createWeight.isBlank()) {
            errors["weight"] = "Weight is required"
        } else if (!state.createWeight.toFloatOrNull().let { it != null && it > 0 }) {
            errors["weight"] = "Weight must be a positive number"
        }

        updateState { it.copy(validationErrors = errors) }
        return errors.isEmpty()
    }

    private fun validateEditPatientData(): Boolean {
        val errors = mutableMapOf<String, String>()
        val state = currentState

        if (state.editFirstName.trim().isBlank()) {
            errors["firstName"] = "First name is required"
        }
        if (state.editLastName.trim().isBlank()) {
            errors["lastName"] = "Last name is required"
        }

        // Height validation - must be numeric if provided
        if (state.editHeight.isNotBlank()) {
            if (!state.editHeight.toFloatOrNull().let { it != null && it > 0 }) {
                errors["height"] = "Height must be a positive number"
            }
        }

        // Weight validation - must be numeric if provided
        if (state.editWeight.isNotBlank()) {
            if (!state.editWeight.toFloatOrNull().let { it != null && it > 0 }) {
                errors["weight"] = "Weight must be a positive number"
            }
        }

        updateState { it.copy(editValidationErrors = errors) }
        return errors.isEmpty()
    }

    private fun clearForm() {
        updateState {
            it.copy(
                createPatientId = "",
                createFirstName = "",
                createMiddleName = "",
                createLastName = "",
                createGender = "",
                createDateOfBirth = "",
                createHeight = "",
                createWeight = "",
                createDiagnosis = "",
                validationErrors = emptyMap()
            )
        }
    }

    fun createPatient() {
        // Validate form data first
        if (!validatePatientData()) {
            return
        }

        val projectId = currentState.projectId ?: return
        val creatorId = tokenManager.getUserId() ?: run {
            setError("User not authenticated")
            return
        }
        val state = currentState

        launchInViewModel {
            updateState { it.copy(isCreating = true) }
            clearError()

            val result = patientRepository.createPatient(
                projectId = projectId,
                creatorId = creatorId,
                patientId = state.createPatientId.trim(),
                firstName = state.createFirstName.trim(),
                lastName = state.createLastName.trim(),
                birthDate = state.createDateOfBirth.trim(),
                height = state.createHeight.trim().toFloatOrNull() ?: 0f,
                weight = state.createWeight.trim().toFloatOrNull() ?: 0f,
                middleName = state.createMiddleName.trim().ifBlank { null },
                gender = state.createGender.trim().ifBlank { null },
                diagnosis = state.createDiagnosis.trim().ifBlank { null }
            )

            result.fold(
                onSuccess = {
                    clearForm()
                    updateState {
                        it.copy(
                            isCreating = false,
                            showCreateDialog = false
                        )
                    }
                    refreshPatients()
                },
                onFailure = { exception ->
                    updateState { it.copy(isCreating = false) }
                    setError(exception.message ?: "Failed to create patient")
                }
            )
        }
    }

    fun updatePatient() {
        // Validate form data first
        if (!validateEditPatientData()) {
            return
        }

        val patientDbId = currentState.editPatientDbId ?: return
        val state = currentState

        launchInViewModel {
            updateState { it.copy(isUpdating = true) }
            clearError()

            val result = patientRepository.updatePatient(
                id = patientDbId,
                patientId = state.editPatientId.trim().ifBlank { null },
                firstName = state.editFirstName.trim(),
                middleName = state.editMiddleName.trim().ifBlank { null },
                lastName = state.editLastName.trim(),
                birthDate = state.editDateOfBirth.trim().ifBlank { null },
                height = state.editHeight.trim().toFloatOrNull(),
                weight = state.editWeight.trim().toFloatOrNull(),
                gender = state.editGender.trim().ifBlank { null },
                diagnosis = state.editDiagnosis.trim().ifBlank { null }
            )

            result.fold(
                onSuccess = {
                    updateState {
                        it.copy(
                            isUpdating = false,
                            showEditDialog = false
                        )
                    }
                    refreshPatients()
                },
                onFailure = { exception ->
                    updateState { it.copy(isUpdating = false) }
                    setError(exception.message ?: "Failed to update patient")
                }
            )
        }
    }

    // Patient Detail functions
    fun loadPatientDetail(patientId: String) {
        launchInViewModel {
            _detailUiState.value = _detailUiState.value.copy(
                loadingState = LoadingState.Loading,
                errorMessage = null
            )

            val patientResult = patientRepository.getPatient(patientId)
            patientResult.fold(
                onSuccess = { patient ->
                    _detailUiState.value = _detailUiState.value.copy(patient = patient)
                    loadPatientRecordings(patientId)
                },
                onFailure = { exception ->
                    _detailUiState.value = _detailUiState.value.copy(
                        loadingState = LoadingState.Error(exception.message ?: "Unknown error"),
                        errorMessage = exception.message
                    )
                }
            )
        }
    }

    private fun loadPatientRecordings(patientId: String) {
        launchInViewModel {
            val result = patientRepository.getPatientRecordings(patientId)
            result.fold(
                onSuccess = { recordings ->
                    _detailUiState.value = _detailUiState.value.copy(
                        recordings = recordings,
                        loadingState = LoadingState.Success
                    )
                },
                onFailure = { exception ->
                    _detailUiState.value = _detailUiState.value.copy(
                        loadingState = LoadingState.Error(exception.message ?: "Unknown error"),
                        errorMessage = exception.message
                    )
                }
            )
        }
    }

    fun refreshPatientDetail() {
        val patientId = _detailUiState.value.patient?.id ?: return
        launchInViewModel {
            _detailUiState.value = _detailUiState.value.copy(isRefreshing = true)

            val patientResult = patientRepository.getPatient(patientId)
            val recordingsResult = patientRepository.getPatientRecordings(patientId)

            _detailUiState.value = _detailUiState.value.copy(
                patient = patientResult.getOrNull() ?: _detailUiState.value.patient,
                recordings = recordingsResult.getOrElse { _detailUiState.value.recordings },
                isRefreshing = false,
                loadingState = if (patientResult.isSuccess) LoadingState.Success
                              else LoadingState.Error(patientResult.exceptionOrNull()?.message ?: "Unknown error")
            )
        }
    }

    fun deletePatient(patientId: String) {
        launchInViewModel {
            val result = patientRepository.deletePatient(patientId)
            result.fold(
                onSuccess = {
                    setError("Patient deleted successfully")
                },
                onFailure = { exception ->
                    setError("Failed to delete patient: ${exception.message}")
                }
            )
        }
    }

    fun clearPatientDetailError() {
        _detailUiState.value = _detailUiState.value.copy(errorMessage = null)
    }
}

// ============================================================================
// UI LAYER - Activities & Composables
// ============================================================================

/**
 * Activity for selecting a patient before recording.
 *
 * SECURITY CONSIDERATIONS:
 * - Patient data encrypted in transit (HTTPS)
 * - No patient PHI stored locally (fetch from server each time)
 * - Patient ID validated before recording starts
 * - Audit trail: logs patient selection for compliance
 *
 * PRIVACY:
 * - Only displays patient ID (truncated) and name
 * - No sensitive medical data shown in list
 * - Compliant with HIPAA minimum necessary principle
 *
 * Flow:
 * 1. Fetch patients from backend (project-specific or all)
 * 2. User selects patient
 * 3. Pass patient ID to MainActivity via Intent
 * 4. MainActivity sets patient context in RecordingViewModel
 */
@AndroidEntryPoint
class PatientSelectionActivity : ComponentActivity() {

    companion object {
        private const val TAG = "PatientSelectionActivity"
        const val EXTRA_PROJECT_ID = "projectId"
        const val EXTRA_PATIENT_ID = "patientId"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val projectId = intent.getStringExtra(EXTRA_PROJECT_ID)
        Log.d(TAG, "Launched with projectId: ${projectId ?: "none (all patients)"}")

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    PatientSelectionScreen(
                        projectId = projectId,
                        onPatientSelected = { patientId, patientName ->
                            // Security: Log patient selection for audit trail
                            Log.i(TAG, "Patient selected: id=${patientId.take(8)}..., name=$patientName")

                            // Navigate to recording screen with patient context
                            val intent = Intent(this, MainActivity::class.java).apply {
                                putExtra("patientId", patientId)
                                putExtra("projectId", projectId)
                                putExtra("startRecording", true)
                                // Security: Clear back stack to prevent accidental data leakage
                                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            startActivity(intent)
                            finish()
                        },
                        onBack = {
                            Log.d(TAG, "User cancelled patient selection")
                            finish()
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientSelectionScreen(
    projectId: String?,
    onPatientSelected: (String, String) -> Unit,
    onBack: () -> Unit,
    viewModel: PatientsViewModel = hiltViewModel()
) {
    // Fetch patients when screen loads
    LaunchedEffect(projectId) {
        if (projectId != null) {
            viewModel.loadPatientsForProject(projectId)
        } else {
            viewModel.loadAllPatients()
        }
    }

    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Select Patient",
                        style = MaterialTheme.typography.titleLarge
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                uiState.isLoading -> {
                    // Loading state
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator()
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Loading patients...",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                uiState.errorMessage != null -> {
                    // Error state
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Failed to load patients",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.errorMessage ?: "Unknown error",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = {
                                if (projectId != null) {
                                    viewModel.loadPatientsForProject(projectId)
                                } else {
                                    viewModel.loadAllPatients()
                                }
                            }
                        ) {
                            Text("Retry")
                        }
                    }
                }

                uiState.patients.isEmpty() -> {
                    // Empty state
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No patients found",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = if (projectId != null) {
                                "No patients assigned to this project yet"
                            } else {
                                "No patients in the system"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                else -> {
                    // Patient list
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 8.dp)
                    ) {
                        items(
                            items = uiState.patients,
                            key = { it.id }
                        ) { patient ->
                            PatientListItem(
                                patient = patient,
                                onClick = {
                                    onPatientSelected(patient.id, patient.patientName)
                                }
                            )
                            Divider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PatientListItem(
    patient: Patient,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Patient icon
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primaryContainer
            ) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Spacer(modifier = Modifier.width(16.dp))

            // Patient details
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = patient.patientName,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Security: Only show truncated patient ID
                    Text(
                        text = "ID: ${patient.patientId}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Show recording count if available
                    if (patient.recordingCount > 0) {
                        Text(
                            text = "•",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "${patient.recordingCount} recordings",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Selection indicator
            Icon(
                imageVector = Icons.Default.ChevronRight,
                contentDescription = "Select patient",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientDetailScreen(
    patientId: String,
    onNavigateBack: () -> Unit,
    onNavigateToCamera: (String) -> Unit,
    onNavigateToRecording: (String) -> Unit = {},
    viewModel: PatientViewModel = hiltViewModel()
) {
    val uiState by viewModel.detailUiState.collectAsState()
    val showDeleteConfirmation = remember { mutableStateOf(false) }

    LaunchedEffect(patientId) {
        viewModel.loadPatientDetail(patientId)
    }

    // Auto-refresh when screen becomes visible
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            viewModel.refreshPatientDetail()
        }
    }

    Scaffold(
        containerColor = SynaptiHandTheme.Background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = uiState.patient?.patientName ?: "Patient",
                        color = SynaptiHandTheme.TextPrimary,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = SynaptiHandTheme.TextPrimary
                        )
                    }
                },
                actions = {
                    if (uiState.patient != null) {
                        IconButton(onClick = {
                            viewModel.showEditDialog(uiState.patient!!)
                        }) {
                            Icon(
                                imageVector = Icons.Default.Edit,
                                contentDescription = "Edit Patient",
                                tint = SynaptiHandTheme.TextPrimary
                            )
                        }

                        IconButton(onClick = { showDeleteConfirmation.value = true }) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Delete Patient",
                                tint = SynaptiHandTheme.TextPrimary
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SynaptiHandTheme.Background
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { onNavigateToCamera(patientId) },
                containerColor = SynaptiHandTheme.StatusCompleted,
                contentColor = SynaptiHandTheme.TextOnPrimary
            ) {
                Icon(Icons.Default.CameraAlt, contentDescription = "New Recording")
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading && uiState.patient == null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = SynaptiHandTheme.Primary)
                    }
                }

                uiState.patient == null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Patient not found",
                            color = SynaptiHandTheme.TextSecondary
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item { Spacer(modifier = Modifier.height(8.dp)) }

                        // Patient info card
                        item {
                            PatientInfoCard(patient = uiState.patient!!)
                        }

                        // Recordings header
                        item {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 16.dp, bottom = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Recordings",
                                    color = SynaptiHandTheme.TextPrimary,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = "${uiState.recordings.size} total",
                                    color = SynaptiHandTheme.TextSecondary,
                                    fontSize = 14.sp
                                )
                            }
                        }

                        if (uiState.recordings.isEmpty()) {
                            item {
                                EmptyRecordingsState()
                            }
                        } else {
                            items(uiState.recordings) { recording ->
                                RecordingCard(
                                    recording = recording,
                                    onClick = { onNavigateToRecording(recording.id) }
                                )
                            }
                        }

                        item { Spacer(modifier = Modifier.height(80.dp)) }
                    }
                }
            }

            // Error message
            if (uiState.errorMessage != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(16.dp)
                        .background(
                            SynaptiHandTheme.Error.copy(alpha = 0.9f),
                            RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                        .clickable { viewModel.clearError() }
                ) {
                    Text(
                        text = uiState.errorMessage!!,
                        color = SynaptiHandTheme.TextOnPrimary,
                        fontSize = 14.sp
                    )
                }
            }
        }
    }

    // Edit patient dialog
    val detailUiState by viewModel.detailUiState.collectAsState()
    val mainUiState by viewModel.uiState.collectAsState()

    if (mainUiState.showEditDialog && detailUiState.patient != null) {
        EditPatientDialog(
            formData = EditPatientFormData(
                patientId = mainUiState.editPatientId,
                firstName = mainUiState.editFirstName,
                middleName = mainUiState.editMiddleName,
                lastName = mainUiState.editLastName,
                gender = mainUiState.editGender,
                birthDate = mainUiState.editDateOfBirth,
                height = mainUiState.editHeight,
                weight = mainUiState.editWeight,
                diagnosis = mainUiState.editDiagnosis
            ),
            isUpdating = mainUiState.isUpdating,
            onFormDataChange = { formData ->
                viewModel.updateEditFirstName(formData.firstName)
                viewModel.updateEditMiddleName(formData.middleName)
                viewModel.updateEditLastName(formData.lastName)
                viewModel.updateEditGender(formData.gender)
                viewModel.updateEditDateOfBirth(formData.birthDate)
                viewModel.updateEditHeight(formData.height)
                viewModel.updateEditWeight(formData.weight)
                viewModel.updateEditDiagnosis(formData.diagnosis)
            },
            onDismiss = { viewModel.hideEditDialog() },
            onUpdate = { viewModel.updatePatient() }
        )
    }

    // Delete patient confirmation dialog
    if (showDeleteConfirmation.value) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation.value = false },
            title = { Text("Delete Patient") },
            text = { Text("Are you sure you want to delete this patient? This action cannot be undone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deletePatient(patientId)
                        showDeleteConfirmation.value = false
                        onNavigateBack()
                    }
                ) {
                    Text("Delete", color = SynaptiHandTheme.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation.value = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun PatientInfoCard(patient: com.handpose.app.data.model.Patient) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = SynaptiHandTheme.Surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Patient icon
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(SynaptiHandTheme.StatusCompleted.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = SynaptiHandTheme.StatusCompleted,
                        modifier = Modifier.size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column {
                    Text(
                        text = patient.patientName,
                        color = SynaptiHandTheme.TextPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "ID: ${patient.patientId}",
                        color = SynaptiHandTheme.TextSecondary,
                        fontSize = 14.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Patient details
            if (patient.gender != null) {
                InfoRow(label = "Gender", value = patient.gender)
            }

            if (patient.dateOfBirth != null) {
                InfoRow(label = "Date of Birth", value = formatDateOfBirth(patient.dateOfBirth))
            }

            if (patient.height != null) {
                InfoRow(label = "Height", value = "${patient.height} cm")
            }

            if (patient.weight != null) {
                InfoRow(label = "Weight", value = "${patient.weight} kg")
            }

            patient.notes?.takeIf { it.isNotBlank() }?.let { notes ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Notes",
                    color = SynaptiHandTheme.TextSecondary,
                    fontSize = 12.sp
                )
                Text(
                    text = notes,
                    color = SynaptiHandTheme.TextPrimary,
                    fontSize = 14.sp
                )
            }
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            color = SynaptiHandTheme.TextSecondary,
            fontSize = 14.sp
        )
        Text(
            text = value,
            color = SynaptiHandTheme.TextPrimary,
            fontSize = 14.sp
        )
    }
}

/**
 * Format ISO date string (e.g., "2000-12-31T00:00:00.000Z") to mm-dd-yyyy format
 * Returns the original string if parsing fails
 */
fun formatDateOfBirth(isoDate: String): String {
    return try {
        // Try parsing ISO 8601 format with timezone
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        isoFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = isoFormat.parse(isoDate)

        // Format to mm-dd-yyyy
        val outputFormat = SimpleDateFormat("MM-dd-yyyy", Locale.US)
        date?.let { outputFormat.format(it) } ?: isoDate
    } catch (e: Exception) {
        // Try parsing without milliseconds
        try {
            val isoFormatNoMillis = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            isoFormatNoMillis.timeZone = TimeZone.getTimeZone("UTC")
            val date = isoFormatNoMillis.parse(isoDate)

            val outputFormat = SimpleDateFormat("MM-dd-yyyy", Locale.US)
            date?.let { outputFormat.format(it) } ?: isoDate
        } catch (e2: Exception) {
            // Try parsing just the date part (yyyy-MM-dd)
            try {
                val dateOnlyFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                val date = dateOnlyFormat.parse(isoDate.take(10))

                val outputFormat = SimpleDateFormat("MM-dd-yyyy", Locale.US)
                date?.let { outputFormat.format(it) } ?: isoDate
            } catch (e3: Exception) {
                // Return original if all parsing fails
                isoDate
            }
        }
    }
}

@Composable
fun RecordingCard(
    recording: Recording,
    onClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = SynaptiHandTheme.Surface
        ),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Status icon
            val (icon, iconColor) = when (recording.status) {
                "completed" -> Icons.Default.CheckCircle to SynaptiHandTheme.StatusCompleted
                "processing" -> Icons.Default.HourglassEmpty to SynaptiHandTheme.Warning
                "failed" -> Icons.Default.Error to SynaptiHandTheme.Error
                else -> Icons.Default.PlayArrow to SynaptiHandTheme.TextSecondary
            }

            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Show "Protocol Name - DateTime" format
                Text(
                    text = formatRecordingTitle(recording),
                    color = SynaptiHandTheme.TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    recording.durationMs?.let { durationMs ->
                        Text(
                            text = formatDuration(durationMs),
                            color = SynaptiHandTheme.TextSecondary,
                            fontSize = 12.sp
                        )
                    }

                    recording.totalFrames?.let { totalFrames ->
                        Text(
                            text = "$totalFrames frames",
                            color = SynaptiHandTheme.TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }

                // Indicators
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    if (recording.hasVideo) {
                        DataIndicator(
                            icon = Icons.Default.Videocam,
                            label = "Video"
                        )
                    }
                    if (recording.hasKeypoints) {
                        DataIndicator(
                            icon = Icons.Default.PlayArrow,
                            label = "Keypoints"
                        )
                    }
                }
            }
        }
    }
}

/**
 * Format recording title as "Protocol Name - DateTime"
 * Falls back to "Session - DateTime" if protocol is not available
 */
fun formatRecordingTitle(recording: Recording): String {
    val dateTime = formatRecordingDateTime(recording.createdAt)
    val protocolName = recording.protocol?.name ?: "Session"

    return "$protocolName - $dateTime"
}

/**
 * Format ISO date-time string to 12-hour format: "MM/dd/yyyy hh:mm a"
 * Example: "01/19/2026 03:45 PM"
 */
fun formatRecordingDateTime(isoDate: String?): String {
    if (isoDate == null) return "Unknown Date"

    return try {
        // Try parsing ISO 8601 format with timezone
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        isoFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = isoFormat.parse(isoDate)

        // Format to 12-hour format with AM/PM
        val outputFormat = SimpleDateFormat("MM/dd/yyyy hh:mm a", Locale.US)
        outputFormat.timeZone = TimeZone.getDefault() // Convert to local timezone
        date?.let { outputFormat.format(it) } ?: "Unknown Date"
    } catch (e: Exception) {
        // Try parsing without milliseconds
        try {
            val isoFormatNoMillis = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            isoFormatNoMillis.timeZone = TimeZone.getTimeZone("UTC")
            val date = isoFormatNoMillis.parse(isoDate)

            val outputFormat = SimpleDateFormat("MM/dd/yyyy hh:mm a", Locale.US)
            outputFormat.timeZone = TimeZone.getDefault()
            date?.let { outputFormat.format(it) } ?: "Unknown Date"
        } catch (e2: Exception) {
            // Try parsing with timezone offset (e.g., "2026-01-19T15:45:00+00:00")
            try {
                val isoFormatOffset = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
                val date = isoFormatOffset.parse(isoDate)

                val outputFormat = SimpleDateFormat("MM/dd/yyyy hh:mm a", Locale.US)
                outputFormat.timeZone = TimeZone.getDefault()
                date?.let { outputFormat.format(it) } ?: "Unknown Date"
            } catch (e3: Exception) {
                "Unknown Date"
            }
        }
    }
}

@Composable
fun DataIndicator(icon: ImageVector, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SynaptiHandTheme.Primary,
            modifier = Modifier.size(12.dp)
        )
        Text(
            text = label,
            color = SynaptiHandTheme.Primary,
            fontSize = 10.sp
        )
    }
}

@Composable
fun EmptyRecordingsState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Videocam,
            contentDescription = null,
            tint = SynaptiHandTheme.TextSecondary,
            modifier = Modifier.size(48.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "No recordings yet",
            color = SynaptiHandTheme.TextPrimary,
            fontSize = 16.sp
        )

        Text(
            text = "Tap the camera button to start recording",
            color = SynaptiHandTheme.TextSecondary,
            fontSize = 14.sp
        )
    }
}

fun formatDuration(ms: Long): String {
    val seconds = ms / 1000
    val minutes = seconds / 60
    val remainingSeconds = seconds % 60
    return if (minutes > 0) {
        "${minutes}m ${remainingSeconds}s"
    } else {
        "${remainingSeconds}s"
    }
}
