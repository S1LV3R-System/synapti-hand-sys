package com.handpose.app.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.handpose.app.R
import com.handpose.app.data.model.BaseResponse
import com.handpose.app.data.model.LoginRequest
import com.handpose.app.data.model.LoginResponse
import com.handpose.app.data.model.SupabaseUserMain
import com.handpose.app.data.model.User
import com.handpose.app.data.model.UserResponse
import com.handpose.app.ui.theme.SynaptiHandTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.providers.builtin.Email
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// AUTH STATE - Sealed class representing authentication states
// ============================================================================

/**
 * Sealed class representing all possible authentication states in the app.
 *
 * This provides exhaustive state modeling to prevent undefined behavior
 * during authentication flows.
 *
 * States:
 * - Unknown: Initial state before any auth check
 * - Validating: Checking existing session or login in progress
 * - Authenticated: User is logged in with valid session
 * - NotAuthenticated: User not logged in or session invalid
 * - PendingApproval: User registered but not approved by admin
 * - Error: Authentication error occurred
 */
sealed class AuthState {
    /**
     * Unknown state - Initial state before any auth check
     * UI: Show loading screen
     */
    object Unknown : AuthState()

    /**
     * Validating state - Checking existing session or login in progress
     * UI: Show loading screen or spinner
     * @param message Optional message to display (e.g., "Logging in...", "Checking session...")
     */
    data class Validating(val message: String = "Validating session...") : AuthState()

    /**
     * Authenticated state - User is logged in with valid session
     * UI: Navigate to authenticated screens (ProjectsScreen)
     * @param user The authenticated user object
     */
    data class Authenticated(val user: User) : AuthState()

    /**
     * NotAuthenticated state - User not logged in or session invalid
     * UI: Show LoginScreen
     * @param reason Optional reason (e.g., "Session expired", null for initial state)
     */
    data class NotAuthenticated(val reason: String? = null) : AuthState()

    /**
     * PendingApproval state - User registered but not approved by admin
     * UI: Show informational message on LoginScreen
     */
    object PendingApproval : AuthState()

    /**
     * Error state - Authentication error occurred
     * UI: Show error message, allow retry
     * @param error The error message
     * @param canRetry Whether the user can retry the operation
     */
    data class Error(val error: String, val canRetry: Boolean = true) : AuthState()
}

/**
 * Helper extension properties for UI logic
 */

/**
 * Check if the current state represents a loading state
 */
val AuthState.isLoading: Boolean
    get() = this is AuthState.Unknown || this is AuthState.Validating

/**
 * Check if the user can navigate to authenticated screens (ProjectsScreen)
 */
val AuthState.canNavigateToProjects: Boolean
    get() = this is AuthState.Authenticated

/**
 * Check if the login screen should be shown
 */
val AuthState.shouldShowLogin: Boolean
    get() = this is AuthState.NotAuthenticated ||
            this is AuthState.PendingApproval ||
            this is AuthState.Error

// ============================================================================
// TOKEN MANAGER - Encrypted token storage
// ============================================================================

@Singleton
class TokenManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    // Lazy initialization with fallback to standard prefs if encryption fails
    private val sharedPreferences: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (t: Throwable) {
            // Catch all errors including LinkageError and AssertionError
            Log.e(TAG, "Encryption failed, falling back to standard SharedPreferences", t)
            context.getSharedPreferences("${PREFS_NAME}_fallback", Context.MODE_PRIVATE)
        }
    }

    fun saveToken(token: String) {
        sharedPreferences.edit().putString(KEY_TOKEN, token).apply()
    }

    fun getToken(): String? {
        return sharedPreferences.getString(KEY_TOKEN, null)
    }

    fun clearToken() {
        sharedPreferences.edit().remove(KEY_TOKEN).apply()
    }

    fun saveUserId(userId: String) {
        sharedPreferences.edit().putString(KEY_USER_ID, userId).apply()
    }

    fun getUserId(): String? {
        return sharedPreferences.getString(KEY_USER_ID, null)
    }

    fun saveUserEmail(email: String) {
        sharedPreferences.edit().putString(KEY_USER_EMAIL, email).apply()
    }

    fun getUserEmail(): String? {
        return sharedPreferences.getString(KEY_USER_EMAIL, null)
    }

    fun saveUserName(name: String) {
        sharedPreferences.edit().putString(KEY_USER_NAME, name).apply()
    }

    fun getUserName(): String? {
        return sharedPreferences.getString(KEY_USER_NAME, null)
    }

    fun isLoggedIn(): Boolean {
        return getToken() != null
    }

    fun clearAll() {
        sharedPreferences.edit().clear().apply()
    }

    companion object {
        private const val TAG = "TokenManager"
        private const val PREFS_NAME = "handpose_secure_prefs"
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_USER_NAME = "user_name"
    }
}

// ============================================================================
// AUTH SERVICE - Retrofit interface (DEPRECATED - kept for reference)
// ============================================================================

interface AuthService {

    @POST("/api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @GET("/api/auth/me")
    suspend fun getCurrentUser(): Response<UserResponse>

    @POST("/api/auth/logout")
    suspend fun logout(): Response<BaseResponse>
}

// ============================================================================
// SUPABASE AUTH REPOSITORY - Active authentication implementation
// ============================================================================

/**
 * Auth repository using Supabase Auth SDK (v2.5.4).
 *
 * Updated for new schema with "User-Main" table.
 * Handles:
 * - Email/password authentication via Supabase Auth
 * - User profile fetching from "User-Main" table via Postgrest
 * - Session persistence (automatic with Supabase SDK)
 */
@Singleton
class SupabaseAuthRepository @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val tokenManager: TokenManager
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    init {
        // Check initial auth state
        checkAuthState()
    }

    private fun checkAuthState() {
        val session = auth.currentSessionOrNull()
        if (session != null) {
            Log.d(TAG, "Found existing session")
            // We have a session but need to fetch user profile
            _authState.value = AuthState.Unknown
        } else {
            Log.d(TAG, "No existing session")
            _authState.value = AuthState.NotAuthenticated()
        }
    }

    /**
     * Login with email and password using Supabase Auth.
     * After successful auth, fetches user profile from "User-Main" table.
     */
    suspend fun login(email: String, password: String): Result<User> {
        return try {
            Log.d(TAG, "Attempting login for $email")

            // Authenticate with Supabase Auth
            auth.signInWith(Email) {
                this.email = email
                this.password = password
            }

            // Get the authenticated user ID
            val session = auth.currentSessionOrNull()
            val authUserId = session?.user?.id

            if (authUserId == null) {
                Log.e(TAG, "Auth succeeded but no user ID returned")
                return Result.failure(Exception("Authentication failed"))
            }

            Log.d(TAG, "Auth successful, fetching user profile for $authUserId")

            // Fetch user profile from User-Main table
            val userProfile = fetchUserProfile(authUserId)

            if (userProfile == null) {
                Log.e(TAG, "User profile not found in database")
                auth.signOut()
                return Result.failure(Exception("User profile not found"))
            }

            // Check if user is approved (Approval_status)
            if (userProfile.approvalStatus != true) {
                Log.w(TAG, "User account pending approval")
                auth.signOut()
                _authState.value = AuthState.PendingApproval
                return Result.failure(Exception("Your account is pending approval"))
            }

            // Check if user is active (not soft-deleted)
            if (userProfile.deletedAt != null) {
                Log.w(TAG, "User account is deactivated")
                auth.signOut()
                return Result.failure(Exception("Your account has been deactivated"))
            }

            // Convert to our User model
            val user = userProfile.toUser()

            // Save to TokenManager (wrapped to prevent storage crashes)
            try {
                tokenManager.saveUserId(user.id)
                tokenManager.saveUserEmail(user.email)
                tokenManager.saveUserName(user.fullName)
            } catch (t: Throwable) {
                // Catch all errors including LinkageError from EncryptedSharedPreferences
                Log.e(TAG, "Auth succeeded but token storage failed", t)
                // Continue - login still succeeded, just storage failed
            }

            _currentUser.value = user
            _authState.value = AuthState.Authenticated(user)

            Log.i(TAG, "Login successful for ${user.email}")
            Result.success(user)

        } catch (e: Exception) {
            Log.e(TAG, "Login failed", e)
            val errorMessage = when {
                e.message?.contains("Invalid login credentials") == true -> "Invalid email or password"
                e.message?.contains("Email not confirmed") == true -> "Please verify your email"
                else -> "Login failed: ${e.message}"
            }
            Result.failure(Exception(errorMessage))
        }
    }

    /**
     * Validate current session and refresh user profile.
     */
    suspend fun validateToken(): Result<User> {
        return try {
            val session = auth.currentSessionOrNull()
            val authUserId = session?.user?.id

            if (authUserId == null) {
                _authState.value = AuthState.NotAuthenticated()
                return Result.failure(Exception("Not logged in"))
            }

            // Wait for session to be fully ready before making requests
            if (!isSessionReady()) {
                Log.d(TAG, "Session not ready, waiting for initialization...")
                val ready = waitForSessionReady(timeoutMs = 2000)
                if (!ready) {
                    Log.e(TAG, "Session initialization timeout")
                    return Result.failure(Exception("Session initialization timeout"))
                }
            }

            Log.d(TAG, "Validating token for user $authUserId")

            val userProfile = fetchUserProfile(authUserId)
            if (userProfile == null) {
                logout()
                return Result.failure(Exception("User profile not found"))
            }

            if (userProfile.approvalStatus != true) {
                logout()
                return Result.failure(Exception("Account pending approval"))
            }

            if (userProfile.deletedAt != null) {
                logout()
                return Result.failure(Exception("Account has been deactivated"))
            }

            val user = userProfile.toUser()
            _currentUser.value = user
            _authState.value = AuthState.Authenticated(user)
            Result.success(user)

        } catch (e: Exception) {
            Log.e(TAG, "Token validation failed", e)
            Result.failure(Exception("Session validation failed: ${e.message}"))
        }
    }

    /**
     * Sign out from Supabase and clear local state.
     */
    suspend fun logout() {
        try {
            auth.signOut()
            Log.d(TAG, "Supabase signout successful")
        } catch (e: Exception) {
            Log.w(TAG, "Supabase signout failed", e)
        }

        // Always clear local state
        tokenManager.clearAll()
        _currentUser.value = null
        _authState.value = AuthState.NotAuthenticated()
        Log.i(TAG, "Logged out - local state cleared")
    }

    /**
     * Check if user has an active session.
     */
    fun isLoggedIn(): Boolean {
        return auth.currentSessionOrNull() != null
    }

    /**
     * Get current access token for API calls.
     */
    fun getAccessToken(): String? {
        return auth.currentAccessTokenOrNull()
    }

    /**
     * Get the current user's User_ID from the User-Main table.
     * This is different from the Supabase Auth user ID.
     */
    fun getCurrentUserId(): String? {
        return _currentUser.value?.id
    }

    /**
     * Check if the Supabase session is fully initialized and ready for use.
     *
     * This checks that both the session and access token are available,
     * which is required for authenticated Postgrest queries.
     *
     * @return true if session exists and access token is available
     */
    fun isSessionReady(): Boolean {
        val session = auth.currentSessionOrNull()
        val accessToken = auth.currentAccessTokenOrNull()

        val ready = session != null && accessToken != null
        if (!ready) {
            Log.d(TAG, "Session not ready - session: ${session != null}, token: ${accessToken != null}")
        }
        return ready
    }

    /**
     * Wait for session to be ready (with timeout).
     *
     * Useful when session exists but might be hydrating from storage.
     * This prevents race conditions where queries are made before the session
     * is fully initialized.
     *
     * @param timeoutMs Maximum time to wait (default 2000ms)
     * @return true if session became ready, false if timeout
     */
    suspend fun waitForSessionReady(timeoutMs: Long = 2000): Boolean {
        val startTime = System.currentTimeMillis()

        while (System.currentTimeMillis() - startTime < timeoutMs) {
            if (isSessionReady()) {
                val elapsed = System.currentTimeMillis() - startTime
                Log.d(TAG, "Session ready after ${elapsed}ms")
                return true
            }
            delay(50)  // Check every 50ms
        }

        Log.w(TAG, "Session not ready after ${timeoutMs}ms timeout")
        return false
    }

    /**
     * Fetch user profile from the "User-Main" table.
     * Uses auth_user_id to link Supabase Auth with our user profile.
     */
    private suspend fun fetchUserProfile(authUserId: String): SupabaseUserMain? {
        return try {
            val result = postgrest.from("User-Main")
                .select(columns = Columns.ALL) {
                    filter {
                        eq("auth_user_id", authUserId)
                    }
                }
                .decodeSingleOrNull<SupabaseUserMain>()

            result
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch user profile", e)
            null
        }
    }

    /**
     * Create a new user profile in User-Main after Supabase Auth registration.
     * This should be called after successful signup.
     */
    suspend fun createUserProfile(
        authUserId: String,
        email: String,
        firstName: String,
        lastName: String,
        birthDate: String,
        phoneNumber: String,
        institute: String,
        department: String,
        userType: String = "Clinician",
        middleName: String? = null
    ): Result<User> {
        return try {
            val userProfile = postgrest.from("User-Main")
                .insert(
                    buildMap {
                        put("auth_user_id", authUserId)
                        put("email", email)
                        put("first_name", firstName)
                        put("last_name", lastName)
                        put("birth_date", birthDate)
                        put("phone_number", phoneNumber)
                        put("Institute", institute)
                        put("Department", department)
                        put("user_type", userType)
                        put("Verification_status", false)
                        put("Approval_status", false)
                        middleName?.let { put("middle__name", it) }
                    }
                ) {
                    select()
                }
                .decodeSingle<SupabaseUserMain>()

            Log.d(TAG, "Created user profile: ${userProfile.userId}")
            Result.success(userProfile.toUser())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create user profile", e)
            Result.failure(Exception("Failed to create profile: ${e.message}"))
        }
    }

    /**
     * Update user profile in User-Main table.
     */
    suspend fun updateUserProfile(
        userId: String,
        firstName: String? = null,
        middleName: String? = null,
        lastName: String? = null,
        phoneNumber: String? = null,
        institute: String? = null,
        department: String? = null
    ): Result<User> {
        return try {
            val updates = buildMap {
                firstName?.let { put("first_name", it) }
                middleName?.let { put("middle__name", it) }
                lastName?.let { put("last_name", it) }
                phoneNumber?.let { put("phone_number", it) }
                institute?.let { put("Institute", it) }
                department?.let { put("Department", it) }
            }

            if (updates.isEmpty()) {
                return Result.failure(Exception("No updates provided"))
            }

            val userProfile = postgrest.from("User-Main")
                .update(updates) {
                    filter {
                        eq("User_ID", userId)
                    }
                    select()
                }
                .decodeSingle<SupabaseUserMain>()

            val user = userProfile.toUser()
            _currentUser.value = user

            Log.d(TAG, "Updated user profile: $userId")
            Result.success(user)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update user profile", e)
            Result.failure(Exception("Failed to update profile: ${e.message}"))
        }
    }

    companion object {
        private const val TAG = "SupabaseAuthRepo"
    }
}

// ============================================================================
// AUTH VIEW MODEL - Manages authentication UI state
// ============================================================================

/**
 * Login UI State - Separate from authentication state
 * Manages form inputs and validation
 */
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isLoginSuccess: Boolean = false,
    val isPendingApproval: Boolean = false
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: SupabaseAuthRepository
) : ViewModel() {

    // Authentication state - expose repository's state (single source of truth)
    val authState: StateFlow<AuthState> = authRepository.authState

    // Login UI state - form-level state
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        // Start session validation on ViewModel creation
        Log.d(TAG, "AuthViewModel initialized, starting session validation")
        validateExistingSession()
    }

    /**
     * Validate existing session on app startup
     * Called automatically in init
     */
    private fun validateExistingSession() {
        viewModelScope.launch {
            // Auth state is managed by repository

            Log.d(TAG, "Starting session validation...")

            // Add delay to ensure Supabase SDK is fully initialized
            delay(300)  // Allow SDK to hydrate session from storage

            if (authRepository.isLoggedIn()) {
                // Session exists, validate it
                Log.d(TAG, "Found existing session, validating token...")
                val result = authRepository.validateToken()

                result.fold(
                    onSuccess = { user ->
                        Log.i(TAG, "Session valid for user: ${user.email}")
                        // Repository already set AuthState.Authenticated
                    },
                    onFailure = { exception ->
                        Log.w(TAG, "Session validation failed: ${exception.message}")
                        // Repository already set AuthState.NotAuthenticated
                    }
                )
            } else {
                // No session found - repository manages state
                Log.d(TAG, "No existing session found")
            }
        }
    }

    fun updateEmail(email: String) {
        _uiState.value = _uiState.value.copy(
            email = email,
            errorMessage = null
        )
    }

    fun updatePassword(password: String) {
        _uiState.value = _uiState.value.copy(
            password = password,
            errorMessage = null
        )
    }

    fun login() {
        val currentState = _uiState.value

        // Validate input
        if (currentState.email.isBlank()) {
            _uiState.value = currentState.copy(errorMessage = "Please enter your email")
            return
        }
        if (currentState.password.isBlank()) {
            _uiState.value = currentState.copy(errorMessage = "Please enter your password")
            return
        }

        viewModelScope.launch {
            // Set loading state (auth state managed by repository)
            _uiState.value = currentState.copy(isLoading = true, errorMessage = null)

            Log.d(TAG, "Attempting login for ${currentState.email}")

            // Perform login
            val result = authRepository.login(currentState.email, currentState.password)

            result.fold(
                onSuccess = { user ->
                    Log.i(TAG, "Login successful for ${user.email}")

                    // Add small delay to ensure session is fully propagated
                    delay(300)

                    // Repository already set AuthState.Authenticated
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isLoginSuccess = true
                    )
                },
                onFailure = { exception ->
                    Log.e(TAG, "Login failed: ${exception.message}")

                    val isPending = exception.message?.contains("pending") == true

                    // Repository already set auth state (PendingApproval or Error)

                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = exception.message,
                        isPendingApproval = isPending
                    )
                }
            )
        }
    }

    fun logout() {
        viewModelScope.launch {
            Log.d(TAG, "Logging out user...")

            authRepository.logout()

            // Repository already set AuthState.NotAuthenticated
            _uiState.value = LoginUiState()  // Reset login form

            Log.i(TAG, "Logout complete")
        }
    }

    /**
     * Retry after error
     */
    fun retryAuth() {
        Log.d(TAG, "Retrying authentication...")
        validateExistingSession()
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun resetLoginSuccess() {
        _uiState.value = _uiState.value.copy(isLoginSuccess = false)
    }

    companion object {
        private const val TAG = "AuthViewModel"
    }
}

// ============================================================================
// LOGIN SCREEN - Compose UI
// ============================================================================

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by viewModel.authState.collectAsState()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }

    // Trigger navigation when login succeeds
    LaunchedEffect(uiState.isLoginSuccess) {
        if (uiState.isLoginSuccess) {
            onLoginSuccess()
        }
    }

    // Show loading overlay if validating
    val isValidating = authState is AuthState.Validating

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SynaptiHandTheme.Background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // App Logo
            Image(
                painter = painterResource(id = R.drawable.logo_full),
                contentDescription = "SynaptiHand - From Movement to Meaning",
                modifier = Modifier
                    .width(280.dp)
                    .padding(bottom = 32.dp)
            )

            // Email Field
            OutlinedTextField(
                value = uiState.email,
                onValueChange = { viewModel.updateEmail(it) },
                label = { Text("Email") },
                enabled = !isValidating,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Email,
                        contentDescription = "Email",
                        tint = SynaptiHandTheme.IconDefault
                    )
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = SynaptiHandTheme.TextPrimary,
                    unfocusedTextColor = SynaptiHandTheme.TextPrimary,
                    focusedBorderColor = SynaptiHandTheme.Primary,
                    unfocusedBorderColor = SynaptiHandTheme.Border,
                    focusedLabelColor = SynaptiHandTheme.Primary,
                    unfocusedLabelColor = SynaptiHandTheme.TextSecondary,
                    cursorColor = SynaptiHandTheme.Primary
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Password Field
            OutlinedTextField(
                value = uiState.password,
                onValueChange = { viewModel.updatePassword(it) },
                label = { Text("Password") },
                enabled = !isValidating,
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = "Password",
                        tint = SynaptiHandTheme.IconDefault
                    )
                },
                trailingIcon = {
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                            contentDescription = if (passwordVisible) "Hide password" else "Show password",
                            tint = SynaptiHandTheme.IconDefault
                        )
                    }
                },
                singleLine = true,
                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        focusManager.clearFocus()
                        viewModel.login()
                    }
                ),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = SynaptiHandTheme.TextPrimary,
                    unfocusedTextColor = SynaptiHandTheme.TextPrimary,
                    focusedBorderColor = SynaptiHandTheme.Primary,
                    unfocusedBorderColor = SynaptiHandTheme.Border,
                    focusedLabelColor = SynaptiHandTheme.Primary,
                    unfocusedLabelColor = SynaptiHandTheme.TextSecondary,
                    cursorColor = SynaptiHandTheme.Primary
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Error Message
            if (uiState.errorMessage != null) {
                Text(
                    text = uiState.errorMessage!!,
                    color = if (uiState.isPendingApproval) SynaptiHandTheme.Warning else SynaptiHandTheme.Error,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 16.dp)
                )
            }

            // Login Button
            Button(
                onClick = { viewModel.login() },
                enabled = !isValidating,
                colors = ButtonDefaults.buttonColors(
                    containerColor = SynaptiHandTheme.Primary,
                    disabledContainerColor = SynaptiHandTheme.Primary.copy(alpha = 0.5f)
                ),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                if (isValidating) {
                    CircularProgressIndicator(
                        color = SynaptiHandTheme.TextOnPrimary,
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Sign In",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        color = SynaptiHandTheme.TextOnPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Help text
            Text(
                text = "Contact your administrator for account access",
                fontSize = 12.sp,
                color = SynaptiHandTheme.TextTertiary,
                textAlign = TextAlign.Center
            )
        }
    }
}
