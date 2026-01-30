# Android Login Crash Fix - Complete System Design

**Version**: 1.0
**Date**: 2026-01-21
**Status**: Design Complete - Ready for Implementation

---

## Table of Contents

1. [Design Overview](#design-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Specifications](#component-specifications)
4. [State Management Design](#state-management-design)
5. [Navigation Flow Design](#navigation-flow-design)
6. [Error Handling Design](#error-handling-design)
7. [Implementation Plan](#implementation-plan)
8. [Testing Strategy](#testing-strategy)

---

## Design Overview

### Problem Statement

The Android app crashes after login due to a race condition where:
1. Navigation to ProjectsScreen happens before Supabase session is fully initialized
2. ProjectViewModel immediately tries to fetch data requiring authentication
3. Postgrest query fails because auth token is not available yet

### Solution Architecture

**Multi-layered Authentication State Management System** with:
- Explicit loading states for session initialization
- Delayed navigation until authentication is validated
- Graceful error handling with user feedback
- Session persistence across app restarts

### Design Principles

1. **Explicit State Management**: Replace implicit assumptions with explicit state tracking
2. **Async-First Design**: All auth operations are async with proper waiting
3. **Fail-Safe Navigation**: Never navigate to authenticated screens without validation
4. **User-Centric UX**: Show loading states and clear error messages
5. **Testable Architecture**: Each component has clear responsibilities and contracts

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         App Startup / Login                         │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   MainActivity         │
                    │   (Compose Root)       │
                    └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   AuthViewModel        │
                    │   - AuthState Flow     │
                    │   - Session Validation │
                    └────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
    ┌──────────────────────┐         ┌──────────────────────┐
    │  SupabaseAuthRepo    │         │  TokenManager        │
    │  - Session Check     │         │  - Encrypted Storage │
    │  - Token Validation  │         │  - Token Retrieval   │
    └──────────────────────┘         └──────────────────────┘
                │
                ▼
    ┌──────────────────────┐
    │  Supabase SDK        │
    │  - Auth              │
    │  - Postgrest         │
    └──────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────────────────┐
    │             Navigation Decision                   │
    │                                                   │
    │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐│
    │  │  Loading    │  │   Login     │  │ Projects ││
    │  │  Screen     │  │   Screen    │  │  Screen  ││
    │  └─────────────┘  └─────────────┘  └──────────┘│
    └──────────────────────────────────────────────────┘
```

### State Flow Diagram

```
App Start
    │
    ▼
┌────────────────────────┐
│ AuthState: Unknown     │ ← Initial state
│ Show: LoadingScreen    │
└────────────────────────┘
    │
    ├─ Session exists? ──→ NO ──→ ┌──────────────────────┐
    │                             │ AuthState: NotAuth    │
    │                             │ Show: LoginScreen     │
    │                             └──────────────────────┘
    │                                      │
    │                                      ▼
    │                              User enters credentials
    │                                      │
    │                                      ▼
    │                              ┌──────────────────────┐
    │                              │ AuthState: Loading   │
    │                              │ Show: Login with     │
    │                              │       spinner        │
    │                              └──────────────────────┘
    │                                      │
    │                                      ▼
    │                              Login Success
    │                                      │
    ▼                                      ▼
 YES ──────────────────────────────────────┐
    │                                       │
    ▼                                       ▼
┌────────────────────────┐        ┌────────────────────────┐
│ AuthState: Validating  │        │ AuthState: Validating  │
│ Show: LoadingScreen    │        │ Show: LoadingScreen    │
└────────────────────────┘        └────────────────────────┘
    │                                       │
    ├─ Valid? ─→ YES ──→ ┌──────────────────────────────┐
    │                    │ AuthState: Authenticated(user)│
    │                    │ Show: ProjectsScreen          │
    │                    └──────────────────────────────┘
    │
    └─ Valid? ─→ NO ───→ ┌──────────────────────┐
                         │ AuthState: NotAuth    │
                         │ Show: LoginScreen     │
                         │       with error      │
                         └──────────────────────┘
```

---

## Component Specifications

### 1. AuthState (Sealed Class Enhancement)

**File**: `app/src/main/java/com/handpose/app/auth/AuthState.kt` (NEW)

**Purpose**: Explicit state modeling for all authentication scenarios

```kotlin
sealed class AuthState {
    /**
     * Unknown state - Initial state before any auth check
     * UI: Show loading screen
     */
    object Unknown : AuthState()

    /**
     * Validating state - Checking existing session or login in progress
     * UI: Show loading screen or spinner
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
     * @param reason Optional reason (e.g., "Session expired")
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
     * @param canRetry Whether the user can retry
     */
    data class Error(val error: String, val canRetry: Boolean = true) : AuthState()
}

/**
 * Helper extensions for UI logic
 */
val AuthState.isLoading: Boolean
    get() = this is AuthState.Unknown || this is AuthState.Validating

val AuthState.canNavigateToProjects: Boolean
    get() = this is AuthState.Authenticated

val AuthState.shouldShowLogin: Boolean
    get() = this is AuthState.NotAuthenticated || this is AuthState.PendingApproval || this is AuthState.Error
```

**Design Rationale**:
- Exhaustive state modeling prevents undefined behavior
- Each state has clear UI implications
- Extension properties simplify UI logic
- Type-safe state transitions

---

### 2. Enhanced AuthViewModel

**File**: `app/src/main/java/com/handpose/app/auth/AuthViewModel.kt` (MODIFY)

**Purpose**: Central authentication state coordinator with proper async handling

```kotlin
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: SupabaseAuthRepository
) : ViewModel() {

    // UI State Flow - exposed to UI layer
    private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    // Login form state
    private val _loginUiState = MutableStateFlow(LoginUiState())
    val loginUiState: StateFlow<LoginUiState> = _loginUiState.asStateFlow()

    init {
        // Start session validation on ViewModel creation
        validateExistingSession()
    }

    /**
     * Validate existing session on app startup
     * Called automatically in init
     */
    private fun validateExistingSession() {
        viewModelScope.launch {
            _authState.value = AuthState.Validating("Checking session...")

            // Add delay to ensure Supabase SDK is fully initialized
            delay(300)  // Allow SDK to hydrate session from storage

            if (authRepository.isLoggedIn()) {
                // Session exists, validate it
                Log.d(TAG, "Found existing session, validating...")
                val result = authRepository.validateToken()

                result.fold(
                    onSuccess = { user ->
                        Log.i(TAG, "Session valid for user: ${user.email}")
                        _authState.value = AuthState.Authenticated(user)
                    },
                    onFailure = { exception ->
                        Log.w(TAG, "Session validation failed: ${exception.message}")
                        _authState.value = AuthState.NotAuthenticated(
                            reason = "Session expired. Please log in again."
                        )
                    }
                )
            } else {
                // No session found
                Log.d(TAG, "No existing session found")
                _authState.value = AuthState.NotAuthenticated()
            }
        }
    }

    /**
     * Login with email and password
     */
    fun login() {
        val currentState = _loginUiState.value

        // Validate input
        if (currentState.email.isBlank()) {
            _loginUiState.value = currentState.copy(errorMessage = "Please enter your email")
            return
        }
        if (currentState.password.isBlank()) {
            _loginUiState.value = currentState.copy(errorMessage = "Please enter your password")
            return
        }

        viewModelScope.launch {
            // Set loading state
            _authState.value = AuthState.Validating("Logging in...")
            _loginUiState.value = currentState.copy(isLoading = true, errorMessage = null)

            // Perform login
            val result = authRepository.login(currentState.email, currentState.password)

            result.fold(
                onSuccess = { user ->
                    Log.i(TAG, "Login successful for ${user.email}")

                    // Add small delay to ensure session is fully propagated
                    delay(300)

                    _authState.value = AuthState.Authenticated(user)
                    _loginUiState.value = _loginUiState.value.copy(
                        isLoading = false,
                        isLoginSuccess = true
                    )
                },
                onFailure = { exception ->
                    Log.e(TAG, "Login failed: ${exception.message}")

                    val isPending = exception.message?.contains("pending") == true

                    if (isPending) {
                        _authState.value = AuthState.PendingApproval
                    } else {
                        _authState.value = AuthState.Error(
                            error = exception.message ?: "Login failed",
                            canRetry = true
                        )
                    }

                    _loginUiState.value = _loginUiState.value.copy(
                        isLoading = false,
                        errorMessage = exception.message,
                        isPendingApproval = isPending
                    )
                }
            )
        }
    }

    /**
     * Logout current user
     */
    fun logout() {
        viewModelScope.launch {
            _authState.value = AuthState.Validating("Logging out...")

            authRepository.logout()

            _authState.value = AuthState.NotAuthenticated()
            _loginUiState.value = LoginUiState()  // Reset login form
        }
    }

    /**
     * Retry after error
     */
    fun retryAuth() {
        validateExistingSession()
    }

    /**
     * Clear error state (e.g., dismiss error message)
     */
    fun clearError() {
        _loginUiState.value = _loginUiState.value.copy(errorMessage = null)
    }

    /**
     * Update login form fields
     */
    fun updateEmail(email: String) {
        _loginUiState.value = _loginUiState.value.copy(
            email = email,
            errorMessage = null
        )
    }

    fun updatePassword(password: String) {
        _loginUiState.value = _loginUiState.value.copy(
            password = password,
            errorMessage = null
        )
    }

    /**
     * Reset login success flag (for navigation)
     */
    fun resetLoginSuccess() {
        _loginUiState.value = _loginUiState.value.copy(isLoginSuccess = false)
    }

    companion object {
        private const val TAG = "AuthViewModel"
    }
}

/**
 * Login UI State (separate from auth state)
 */
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isLoginSuccess: Boolean = false,
    val isPendingApproval: Boolean = false
)
```

**Design Rationale**:
- Clear separation: AuthState (system) vs LoginUiState (UI form)
- 300ms delays allow SDK initialization/propagation
- Comprehensive error handling with specific states
- Logging at every state transition for debugging

---

### 3. LoadingScreen Component

**File**: `app/src/main/java/com/handpose/app/ui/LoadingScreen.kt` (NEW)

**Purpose**: Unified loading screen for authentication validation

```kotlin
package com.handpose.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.handpose.app.R
import com.handpose.app.ui.theme.SynaptiHandTheme

/**
 * Loading screen shown during authentication validation
 *
 * Used when:
 * - App is starting and checking for existing session
 * - User just logged in and session is being validated
 * - Logging out
 *
 * @param message Optional message to display (default: "Loading...")
 */
@Composable
fun LoadingScreen(
    message: String = "Loading..."
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SynaptiHandTheme.Background),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // App Logo
            Image(
                painter = painterResource(id = R.drawable.logo_full),
                contentDescription = "SynaptiHand",
                modifier = Modifier
                    .width(280.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Loading indicator
            CircularProgressIndicator(
                color = SynaptiHandTheme.Primary,
                strokeWidth = 3.dp
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Loading message
            Text(
                text = message,
                color = SynaptiHandTheme.TextSecondary,
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}
```

**Design Rationale**:
- Branded loading experience with app logo
- Consistent with existing LoginScreen design
- Configurable message for different scenarios
- Simple, no complex state management

---

### 4. Enhanced MainActivity Navigation

**File**: `app/src/main/java/com/handpose/app/MainActivity.kt` (MODIFY)

**Purpose**: State-driven navigation with proper waiting

```kotlin
@Composable
fun HandPoseApp(
    cameraManager: CameraManager,
    handPoseDetector: HandPoseDetector,
    authRepository: SupabaseAuthRepository,
    protocolRepository: ProtocolRepository
) {
    val navController = rememberNavController()
    val authViewModel: AuthViewModel = hiltViewModel()

    // Observe authentication state
    val authState by authViewModel.authState.collectAsState()

    // State-driven UI rendering
    when (authState) {
        is AuthState.Unknown -> {
            // Initial state - show loading
            LoadingScreen(message = "Initializing...")
        }

        is AuthState.Validating -> {
            // Validating session - show loading with message
            val message = (authState as AuthState.Validating).message
            LoadingScreen(message = message)
        }

        is AuthState.Authenticated -> {
            // User authenticated - show main app navigation
            val user = (authState as AuthState.Authenticated).user

            NavHost(
                navController = navController,
                startDestination = "projects"  // Always start at projects when authenticated
            ) {
                // Projects list (Home)
                composable("projects") {
                    ProjectsScreen(
                        onNavigateToProject = { projectId ->
                            navController.navigate("project/$projectId")
                        },
                        onLogout = {
                            authViewModel.logout()
                        }
                    )
                }

                // Project detail (Patients list)
                composable(
                    route = "project/{projectId}",
                    arguments = listOf(navArgument("projectId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val projectId = backStackEntry.arguments?.getString("projectId") ?: ""
                    ProjectDetailScreen(
                        projectId = projectId,
                        onNavigateBack = { navController.popBackStack() },
                        onNavigateToPatient = { patientId ->
                            navController.navigate("patient/$patientId")
                        }
                    )
                }

                // Patient detail (Recordings list)
                composable(
                    route = "patient/{patientId}",
                    arguments = listOf(navArgument("patientId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val patientId = backStackEntry.arguments?.getString("patientId") ?: ""
                    PatientDetailScreen(
                        patientId = patientId,
                        onNavigateBack = { navController.popBackStack() },
                        onNavigateToCamera = { patId ->
                            navController.navigate("camera/$patId")
                        },
                        onNavigateToRecording = { recordingId ->
                            navController.navigate("recording/$recordingId")
                        }
                    )
                }

                // Recording detail
                composable(
                    route = "recording/{recordingId}",
                    arguments = listOf(navArgument("recordingId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val recordingId = backStackEntry.arguments?.getString("recordingId") ?: ""
                    RecordingDetailScreen(
                        recordingId = recordingId,
                        onNavigateBack = { navController.popBackStack() }
                    )
                }

                // Camera screen for recording
                composable(
                    route = "camera/{patientId}",
                    arguments = listOf(navArgument("patientId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val patientId = backStackEntry.arguments?.getString("patientId") ?: ""
                    CameraScreen(
                        cameraManager = cameraManager,
                        handPoseDetector = handPoseDetector,
                        patientId = patientId,
                        onNavigateBack = { navController.popBackStack() },
                        protocolRepository = protocolRepository
                    )
                }
            }
        }

        is AuthState.NotAuthenticated,
        is AuthState.PendingApproval,
        is AuthState.Error -> {
            // Show login screen for all non-authenticated states
            LoginScreen(
                onLoginSuccess = {
                    // No manual navigation needed - AuthState change will trigger recomposition
                    // and show authenticated UI automatically
                }
            )
        }
    }
}
```

**Design Rationale**:
- Single source of truth: `authState` controls all UI
- No manual navigation triggers - state-driven rendering
- Loading states shown for all validation scenarios
- Login screen handles all error states internally

---

### 5. Simplified LoginScreen

**File**: `app/src/main/java/com/handpose/app/auth/LoginScreen.kt` (MODIFY)

**Purpose**: Remove navigation logic - just trigger login

```kotlin
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,  // Keep for API compatibility, but not used for navigation
    viewModel: AuthViewModel = hiltViewModel()
) {
    val loginUiState by viewModel.loginUiState.collectAsState()
    val authState by viewModel.authState.collectAsState()
    val focusManager = LocalFocusManager.current
    var passwordVisible by remember { mutableStateOf(false) }

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
                value = loginUiState.email,
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
                value = loginUiState.password,
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
            if (loginUiState.errorMessage != null) {
                Text(
                    text = loginUiState.errorMessage!!,
                    color = if (loginUiState.isPendingApproval) SynaptiHandTheme.Warning else SynaptiHandTheme.Error,
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
```

**Design Rationale**:
- No LaunchedEffect for navigation - state-driven at top level
- Loading spinner shown inline (button disabled)
- Error messages from loginUiState and authState
- `onLoginSuccess` callback kept for API compatibility but not used

---

### 6. Enhanced SupabaseAuthRepository

**File**: `app/src/main/java/com/handpose/app/auth/SupabaseAuthRepository.kt` (MODIFY)

**Purpose**: Add session readiness checks

```kotlin
// Add these methods to SupabaseAuthRepository

/**
 * Check if the Supabase session is fully initialized and ready for use
 *
 * @return true if session exists and access token is available
 */
fun isSessionReady(): Boolean {
    val session = auth.currentSessionOrNull()
    val accessToken = auth.currentAccessTokenOrNull()

    return session != null && accessToken != null
}

/**
 * Wait for session to be ready (with timeout)
 *
 * Useful when session exists but might be hydrating from storage
 *
 * @param timeoutMs Maximum time to wait (default 2000ms)
 * @return true if session became ready, false if timeout
 */
suspend fun waitForSessionReady(timeoutMs: Long = 2000): Boolean {
    val startTime = System.currentTimeMillis()

    while (System.currentTimeMillis() - startTime < timeoutMs) {
        if (isSessionReady()) {
            Log.d(TAG, "Session ready after ${System.currentTimeMillis() - startTime}ms")
            return true
        }
        delay(50)  // Check every 50ms
    }

    Log.w(TAG, "Session not ready after ${timeoutMs}ms timeout")
    return false
}

// Modify validateToken() to use session readiness check
suspend fun validateToken(): Result<User> {
    return try {
        val session = auth.currentSessionOrNull()
        val authUserId = session?.user?.id

        if (authUserId == null) {
            _authState.value = AuthState.NotAuthenticated
            return Result.failure(Exception("Not logged in"))
        }

        // Wait for session to be fully ready before making requests
        if (!isSessionReady()) {
            Log.d(TAG, "Session not ready, waiting...")
            val ready = waitForSessionReady(timeoutMs = 2000)
            if (!ready) {
                return Result.failure(Exception("Session initialization timeout"))
            }
        }

        // Proceed with validation...
        val userProfile = fetchUserProfile(authUserId)
        // ... rest of existing validation logic

    } catch (e: Exception) {
        Log.e(TAG, "Token validation failed", e)
        Result.failure(Exception("Session validation failed: ${e.message}"))
    }
}
```

**Design Rationale**:
- Explicit session readiness checking
- Timeout-based waiting prevents infinite loops
- Logging for debugging session hydration timing
- Non-blocking with 50ms polling interval

---

## Error Handling Design

### Error Categories

| Error Type | AuthState | User Action | Auto-Retry |
|------------|-----------|-------------|------------|
| Network offline | Error("No internet connection", canRetry=true) | Show error, allow retry | No |
| Session expired | NotAuthenticated("Session expired") | Redirect to login | No |
| Invalid credentials | Error("Invalid email or password", canRetry=true) | Show error, stay on login | No |
| Pending approval | PendingApproval | Show info message | No |
| Session timeout | Error("Session initialization timeout", canRetry=true) | Show error, allow retry | Yes (after 2s) |
| Unknown error | Error(message, canRetry=true) | Show error, allow retry | No |

### Error Handling Flow

```
Error Occurs
    │
    ▼
AuthViewModel catches exception
    │
    ├─ Network error? ─→ AuthState.Error("No internet", canRetry=true)
    │
    ├─ 401/403? ───────→ AuthState.NotAuthenticated("Session expired")
    │
    ├─ Timeout? ───────→ AuthState.Error("Timeout", canRetry=true)
    │
    └─ Other ──────────→ AuthState.Error(message, canRetry=true)
    │
    ▼
UI renders error state
    │
    ├─ canRetry=true ─→ Show "Retry" button
    │                   onClick: viewModel.retryAuth()
    │
    └─ canRetry=false ─→ Show error message only
                         User must restart app or re-login
```

---

## Implementation Plan

### Phase 1: Core State Management (30 min)

**Files to modify**:
1. Create `app/src/main/java/com/handpose/app/auth/AuthState.kt` (NEW)
2. Modify `app/src/main/java/com/handpose/app/auth/AuthViewModel.kt`
3. Modify `app/src/main/java/com/handpose/app/auth/SupabaseAuthRepository.kt`

**Changes**:
- [ ] Create enhanced AuthState sealed class with all states
- [ ] Refactor AuthViewModel to use new state system
- [ ] Add session readiness checks to repository
- [ ] Add proper delays for session initialization
- [ ] Implement retry logic

**Testing**:
```bash
# Build and verify compilation
cd android
./gradlew build

# Check for errors
./gradlew lint
```

### Phase 2: Loading UI (15 min)

**Files to modify**:
1. Create `app/src/main/java/com/handpose/app/ui/LoadingScreen.kt` (NEW)

**Changes**:
- [ ] Create LoadingScreen composable with branding
- [ ] Match design with existing LoginScreen
- [ ] Add configurable message parameter

**Testing**:
- Preview LoadingScreen in Android Studio
- Verify logo displays correctly
- Test different messages

### Phase 3: Navigation Refactor (20 min)

**Files to modify**:
1. Modify `app/src/main/java/com/handpose/app/MainActivity.kt`
2. Modify `app/src/main/java/com/handpose/app/auth/LoginScreen.kt`

**Changes**:
- [ ] Replace manual navigation with state-driven rendering
- [ ] Add when() block for AuthState handling
- [ ] Remove LaunchedEffect navigation from LoginScreen
- [ ] Update HandPoseApp to show LoadingScreen for loading states

**Testing**:
```kotlin
// Test different auth states manually
_authState.value = AuthState.Unknown  // Should show loading
_authState.value = AuthState.Validating("Test")  // Should show loading
_authState.value = AuthState.Authenticated(mockUser)  // Should show projects
_authState.value = AuthState.NotAuthenticated()  // Should show login
```

### Phase 4: Error Handling (10 min)

**Changes**:
- [ ] Add error display in LoginScreen for AuthState.Error
- [ ] Add retry button for retryable errors
- [ ] Test all error scenarios

### Phase 5: Integration Testing (15 min)

**Test Scenarios**:
1. Fresh app install → Login → Projects
2. App restart after login → Projects (no login)
3. Session expired → Login screen with message
4. Invalid credentials → Error on login screen
5. Network offline → Error with retry
6. Pending approval → Info message

---

## Testing Strategy

### Unit Tests

**File**: `app/src/test/java/com/handpose/app/auth/AuthViewModelTest.kt`

```kotlin
class AuthViewModelTest {
    @Test
    fun `validateExistingSession with valid session sets Authenticated state`() = runTest {
        // Given: Repository returns valid user
        val mockUser = User(id = "123", email = "test@test.com")
        val mockRepo = mockk<SupabaseAuthRepository> {
            coEvery { isLoggedIn() } returns true
            coEvery { validateToken() } returns Result.success(mockUser)
        }
        val viewModel = AuthViewModel(mockRepo)

        // When: Wait for validation
        advanceTimeBy(500)

        // Then: State should be Authenticated
        assertTrue(viewModel.authState.value is AuthState.Authenticated)
    }

    @Test
    fun `login with invalid credentials sets Error state`() = runTest {
        // Test login error handling
    }
}
```

### Integration Tests

**File**: `app/src/androidTest/java/com/handpose/app/auth/AuthFlowTest.kt`

```kotlin
@HiltAndroidTest
class AuthFlowTest {
    @Test
    fun userCanLoginAndNavigateToProjects() {
        // Launch app
        composeTestRule.setContent {
            HandPoseApp(...)
        }

        // Should show loading initially
        composeTestRule.onNodeWithText("Initializing...").assertIsDisplayed()

        // Wait for login screen
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Email").assertIsDisplayed()

        // Enter credentials
        composeTestRule.onNodeWithText("Email").performTextInput("test@test.com")
        composeTestRule.onNodeWithText("Password").performTextInput("password123")
        composeTestRule.onNodeWithText("Sign In").performClick()

        // Should show loading
        composeTestRule.onNodeWithText("Logging in...").assertIsDisplayed()

        // Should navigate to projects
        composeTestRule.waitUntil(timeoutMillis = 3000) {
            composeTestRule
                .onAllNodesWithText("Projects")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }
}
```

### Manual Testing Checklist

- [ ] **Fresh Install**: Install app → Open → See login → Login → See projects
- [ ] **App Restart**: After login → Kill app → Reopen → See projects immediately
- [ ] **Session Expiration**: Manually clear token → Restart app → See login with message
- [ ] **Invalid Credentials**: Enter wrong password → See error → Try again with correct
- [ ] **Network Offline**: Turn off network → Try to login → See network error
- [ ] **Pending Approval**: Login with unapproved account → See pending message
- [ ] **Logout**: Login → Navigate to projects → Logout → See login screen
- [ ] **Background Resume**: Login → Background app (2 min) → Resume → Still logged in

---

## Success Criteria

### Functional Requirements

- ✅ App NEVER crashes on login or startup
- ✅ User sees loading screen during session validation
- ✅ Navigation only happens when auth state is confirmed
- ✅ Error messages are clear and actionable
- ✅ Session persists across app restarts
- ✅ Logout properly clears session

### Performance Requirements

- ✅ Session validation completes within 2 seconds
- ✅ Loading screen displays within 100ms
- ✅ No noticeable lag between login and projects screen
- ✅ No unnecessary network calls or retries

### User Experience Requirements

- ✅ Smooth transitions between states
- ✅ Consistent loading indicators
- ✅ Clear error messages with recovery options
- ✅ No blank screens or undefined states

---

## Rollback Plan

If issues arise after deployment:

1. **Immediate Rollback**: Revert to previous APK version
2. **Quick Fix**: Add feature flag to disable new auth flow
3. **Partial Rollback**: Keep loading screen, revert to sync navigation

**Feature Flag Implementation**:
```kotlin
object FeatureFlags {
    const val USE_NEW_AUTH_FLOW = true  // Set to false to rollback
}

// In HandPoseApp
if (FeatureFlags.USE_NEW_AUTH_FLOW) {
    // New state-driven navigation
} else {
    // Old navigation logic
}
```

---

## Monitoring and Observability

### Logging Strategy

**Priority Logs**:
```kotlin
// Session validation
Log.i("AuthViewModel", "Session validation started")
Log.i("AuthViewModel", "Session valid for user: ${user.email}")
Log.e("AuthViewModel", "Session validation failed: ${error}")

// State transitions
Log.d("AuthViewModel", "State: ${authState.value::class.simpleName}")

// Navigation
Log.d("MainActivity", "Rendering: ${when(authState) { ... }}")
```

### Crash Reporting

Integrate Firebase Crashlytics to track:
- Uncaught exceptions
- ANR (Application Not Responding)
- Auth flow breadcrumbs

```kotlin
// In AuthViewModel
try {
    // Auth logic
} catch (e: Exception) {
    FirebaseCrashlytics.getInstance().apply {
        setCustomKey("auth_state", authState.value.toString())
        setCustomKey("has_token", authRepository.isLoggedIn())
        recordException(e)
    }
    throw e
}
```

---

## Appendix

### A. State Transition Table

| From State | Event | To State | Side Effects |
|------------|-------|----------|--------------|
| Unknown | App starts | Validating | Start session check |
| Validating | Session valid | Authenticated | None |
| Validating | No session | NotAuthenticated | None |
| Validating | Validation error | Error | Log error |
| NotAuthenticated | User clicks login | Validating | Call login API |
| Validating | Login success | Authenticated | Save token |
| Validating | Login fails | Error | Show error |
| Authenticated | User clicks logout | Validating | Call logout API |
| Validating | Logout complete | NotAuthenticated | Clear token |
| Error | User clicks retry | Validating | Retry validation |

### B. API Compatibility

This design maintains backward compatibility with:
- Existing SupabaseAuthRepository interface
- Current TokenManager implementation
- ProjectViewModel data fetching logic

No changes needed to:
- ProjectRepository
- SupabaseDataRepository
- Any other ViewModels or repositories

### C. Future Enhancements

1. **Biometric Authentication**: Add fingerprint/face unlock
2. **Remember Me**: Optional persistent login
3. **Multi-account Support**: Switch between multiple users
4. **Offline Mode**: Cache user data for offline access
5. **Session Refresh**: Auto-refresh tokens before expiry

---

**End of Design Document**

This design is ready for implementation. Estimated total implementation time: **90 minutes**.
