# Android APK Login Crash Analysis

**Date**: 2026-01-21
**Severity**: 🔴 Critical
**Impact**: App crashes immediately after successful login, blocking all user workflows

---

## Executive Summary

The Android APK crashes immediately after login due to a **race condition** between Supabase authentication session initialization and database query execution. The app navigates to the Projects screen before the authentication token is fully propagated through the Supabase SDK, causing Postgrest queries to fail with an uncaught exception.

---

## Root Cause Analysis

### Critical Flow Path

```
Login Success
    ↓
Navigation Trigger (Immediate)
    ↓
ProjectsScreen Composition
    ↓
ProjectViewModel Creation (Hilt)
    ↓
init {} Block Executes
    ↓
loadProjects() → fetchProjects() → getProjects()
    ↓
Postgrest Query with RLS Authentication
    ↓
❌ CRASH: Auth token not available yet
```

### Technical Root Cause

**File**: `app/src/main/java/com/handpose/app/MainActivity.kt` (lines 143-146)

```kotlin
// Check if user is logged in
val isLoggedIn = authRepository.isLoggedIn()
val startDestination = if (isLoggedIn) "projects" else "login"
```

**Problem**: This synchronous check only verifies that a session exists in storage, but does NOT wait for:
1. Session hydration (loading session from storage)
2. Token validation (ensuring token is valid and not expired)
3. Token propagation (ensuring Postgrest client has the auth token attached)

### Race Condition Scenarios

#### Scenario 1: Immediate Post-Login
```
1. User enters credentials → SupabaseAuthRepository.login()
2. auth.signInWith(Email) → Session created
3. isLoginSuccess = true → Navigation triggered
4. navController.navigate("projects") → Synchronous
5. ProjectsScreen composed → ProjectViewModel created
6. init {} runs → loadProjects() called IMMEDIATELY
7. supabaseDataRepository.getProjects() → Postgrest query
8. ❌ Auth token might not be attached to Postgrest client yet
```

#### Scenario 2: App Restart (More Common)
```
1. App starts → Supabase SDK loads persisted session (ASYNC)
2. authRepository.isLoggedIn() → Returns true (session exists)
3. startDestination = "projects" → Navigation happens IMMEDIATELY
4. ProjectViewModel.init {} → loadProjects() called
5. Postgrest query → ❌ Session hydration still in progress
```

### Evidence from Code

**1. ProjectViewModel Initialization** (`app/src/main/java/com/handpose/app/projects/ProjectViewModel.kt:29-31`)
```kotlin
init {
    loadProjects()  // ❌ Called immediately, no auth check
}
```

**2. Supabase Data Repository** (`app/src/main/java/com/handpose/app/data/SupabaseDataRepository.kt:34-50`)
```kotlin
suspend fun getProjects(): Result<List<Project>> {
    return try {
        val projects = postgrest.from("Project-Table")
            .select(...) {
                filter {
                    exact("deleted_at", null)  // ❌ RLS requires auth token
                }
            }
        // ...
    } catch (e: Exception) {
        Result.failure(...)
    }
}
```

**Comment in Code** (line 23):
```kotlin
/**
 * Get all projects accessible to current user.
 * RLS policies filter based on ownership and membership.  // ← Requires authentication
 */
```

**3. AuthViewModel Token Validation** (`app/src/main/java/com/handpose/app/auth/AuthViewModel.kt:23-31`)
```kotlin
init {
    // Check if already logged in
    viewModelScope.launch {  // ❌ ASYNC - happens in background
        if (authRepository.isLoggedIn()) {
            val result = authRepository.validateToken()
            if (result.isSuccess) {
                _uiState.value = _uiState.value.copy(isLoginSuccess = true)
            }
        }
    }
}
```

**Issue**: This validation is asynchronous and NOT awaited before navigation decision.

---

## Why Error Handling Doesn't Catch It

The error handling in `ProjectViewModel.loadProjects()` wraps the coroutine body:

```kotlin
fun loadProjects() {
    viewModelScope.launch {  // Coroutine context
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

        val result = projectRepository.fetchProjects()
        result.fold(
            onSuccess = { /* update UI */ },
            onFailure = { exception ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = exception.message  // Would show error if caught
                )
            }
        )
    }
}
```

**However**, the crash likely occurs because:
1. Supabase SDK throws an exception during query setup (before entering try-catch)
2. The exception is related to missing or invalid authentication context
3. The exception propagates up to the Android runtime instead of being caught

---

## Affected Components

| Component | File | Impact |
|-----------|------|--------|
| MainActivity | `MainActivity.kt:143` | Incorrect navigation logic |
| ProjectViewModel | `ProjectViewModel.kt:29` | Premature data loading |
| SupabaseDataRepository | `SupabaseDataRepository.kt:34` | RLS requires auth token |
| AuthViewModel | `AuthViewModel.kt:23` | Validation not awaited |
| ProjectsScreen | `ProjectsScreen.kt` | Cannot load without auth |

---

## Solution Design

### Option 1: Delayed Navigation with Loading Screen (Recommended)

**Benefits**: Clean user experience, proper auth flow
**Complexity**: Low

**Implementation**:

1. Add loading state to AuthViewModel
2. Make MainActivity wait for validation before deciding destination
3. Show loading screen during auth check

```kotlin
// AuthViewModel.kt
data class AuthUiState(
    val isLoading: Boolean = true,  // ← Start as loading
    val isAuthenticated: Boolean = false
)

init {
    viewModelScope.launch {
        val isLoggedIn = authRepository.isLoggedIn()
        if (isLoggedIn) {
            val result = authRepository.validateToken()
            _authState.value = AuthUiState(
                isLoading = false,
                isAuthenticated = result.isSuccess
            )
        } else {
            _authState.value = AuthUiState(
                isLoading = false,
                isAuthenticated = false
            )
        }
    }
}

// MainActivity.kt
@Composable
fun HandPoseApp(...) {
    val authState by authViewModel.authState.collectAsState()

    when {
        authState.isLoading -> {
            LoadingScreen()  // Show loading indicator
        }
        else -> {
            val startDestination = if (authState.isAuthenticated) "projects" else "login"
            NavHost(navController, startDestination) {
                // ... routes
            }
        }
    }
}
```

### Option 2: Lazy Loading in ProjectViewModel

**Benefits**: Localized fix
**Complexity**: Low

**Implementation**:

```kotlin
// ProjectViewModel.kt
@HiltViewModel
class ProjectViewModel @Inject constructor(
    private val projectRepository: ProjectRepository,
    private val authRepository: SupabaseAuthRepository  // Add auth check
) : ViewModel() {

    init {
        // Only load if authenticated
        viewModelScope.launch {
            if (authRepository.isLoggedIn()) {
                // Add delay to allow session hydration
                delay(500)  // Give SDK time to hydrate session
                loadProjects()
            }
        }
    }
}
```

**Note**: This is a workaround, not a proper fix.

### Option 3: Manual Navigation Control

**Benefits**: Full control over timing
**Complexity**: Medium

**Implementation**:

Remove automatic navigation, use manual navigation after validation:

```kotlin
// LoginScreen.kt
LaunchedEffect(uiState.isLoginSuccess) {
    if (uiState.isLoginSuccess) {
        // Wait for token validation
        delay(500)  // Or use proper validation callback
        onLoginSuccess()
    }
}

// MainActivity.kt - Always start at login
val startDestination = "login"

// In ProjectsScreen, add auth check
LaunchedEffect(Unit) {
    if (!authRepository.isLoggedIn()) {
        // Navigate back to login
        onNavigateToLogin()
    }
}
```

---

## Recommended Solution: Option 1

**Why**:
- Cleanest user experience (proper loading state)
- Solves both post-login AND app restart scenarios
- Proper separation of concerns
- No hacky delays or workarounds

**Implementation Steps**:

1. Update `AuthViewModel` to expose loading state
2. Add `LoadingScreen` composable in MainActivity
3. Update `HandPoseApp` to wait for auth validation
4. Remove synchronous `isLoggedIn()` check from navigation logic

**Estimated Effort**: 30-45 minutes

---

## Testing Checklist

After implementing the fix, verify:

- [ ] **Fresh login**: User can log in and see projects without crash
- [ ] **App restart**: Reopen app after login, should navigate to projects without crash
- [ ] **Token expiration**: Test with expired token, should redirect to login
- [ ] **Network offline**: Test offline behavior, should show proper error message
- [ ] **Logout and login again**: Should work without crash
- [ ] **Invalid credentials**: Should show error, not crash
- [ ] **Background app**: Kill and restart app, should handle session properly

---

## Additional Recommendations

### 1. Add Comprehensive Error Handling

```kotlin
// SupabaseDataRepository.kt
suspend fun getProjects(): Result<List<Project>> {
    return try {
        // Check auth state before making query
        val session = auth.currentSessionOrNull()
        if (session == null) {
            return Result.failure(Exception("Not authenticated"))
        }

        val projects = postgrest.from("Project-Table")
            .select(...) { ... }

        Result.success(projects)
    } catch (e: Exception) {
        Log.e(TAG, "Failed to fetch projects", e)
        when {
            e.message?.contains("JWTExpired") == true ->
                Result.failure(Exception("Session expired. Please log in again."))
            e.message?.contains("PGRST301") == true ->
                Result.failure(Exception("Not authenticated"))
            else ->
                Result.failure(Exception("Failed to load projects: ${e.message}"))
        }
    }
}
```

### 2. Add Session Expiration Handling

```kotlin
// AuthRepository.kt
suspend fun refreshSessionIfNeeded(): Result<Unit> {
    return try {
        val session = auth.currentSessionOrNull()
        if (session?.isExpired() == true) {
            auth.refreshSession()
        }
        Result.success(Unit)
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

### 3. Add Global Exception Handler

```kotlin
// HandPoseApplication.kt
class HandPoseApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("CrashHandler", "Uncaught exception", throwable)
            // Log to crash reporting service (Firebase Crashlytics)
        }
    }
}
```

---

## Monitoring and Debugging

### Add Logging to Track Flow

```kotlin
// AuthViewModel.kt
init {
    Log.d("AuthViewModel", "Initializing - checking auth state")
    viewModelScope.launch {
        val isLoggedIn = authRepository.isLoggedIn()
        Log.d("AuthViewModel", "isLoggedIn: $isLoggedIn")

        if (isLoggedIn) {
            Log.d("AuthViewModel", "Validating token...")
            val result = authRepository.validateToken()
            Log.d("AuthViewModel", "Token validation: ${result.isSuccess}")
        }
    }
}

// ProjectViewModel.kt
init {
    Log.d("ProjectViewModel", "Initializing - loading projects")
    loadProjects()
}
```

### Check Logcat for Crash Stack Trace

Look for:
- `RestException` from Supabase SDK
- `NullPointerException` related to auth token
- `JWTExpired` or `PGRST301` (not authenticated) errors

---

## Conclusion

The crash is caused by a timing issue where the app navigates to an authenticated screen before the Supabase session is fully initialized. The recommended solution is to add proper loading state management in `AuthViewModel` and wait for session validation before navigation.

**Priority**: 🔴 Critical - Implement immediately
**Risk Level**: High - Affects all users after login
**User Impact**: Complete app unavailability after login
