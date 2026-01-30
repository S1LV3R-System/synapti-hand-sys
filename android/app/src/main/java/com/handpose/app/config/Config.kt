package com.handpose.app.config

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// SERVER ENVIRONMENT SEALED CLASS
// ============================================================================

/**
 * Server environment configuration - PRODUCTION ONLY.
 * All connections go to https://app.synaptihand.com with no exceptions.
 */
sealed class ServerEnvironment {
    abstract val displayName: String
    abstract val baseUrl: String
    abstract val useHttps: Boolean
    abstract val key: String

    /**
     * Production server (SynaptiHand cloud) - THE ONLY ENVIRONMENT
     */
    object Production : ServerEnvironment() {
        override val displayName = "Production (SynaptiHand)"
        override val baseUrl = "https://app.synaptihand.com"
        override val useHttps = true
        override val key = "production"
    }

    companion object {
        /**
         * Get the default (and only) environment - ALWAYS production
         */
        @Suppress("UNUSED_PARAMETER")
        fun getDefault(isDebugBuild: Boolean): ServerEnvironment = Production

        /**
         * Available environments - ONLY production
         */
        val presets: List<ServerEnvironment> = listOf(Production)
    }
}

// ============================================================================
// CONFIGURATION MANAGER - SINGLETON
// ============================================================================

/**
 * Unified configuration manager - single source of truth for all app configuration.
 *
 * Handles:
 * - Server URL configuration (production only)
 * - Supabase configuration
 * - App-level settings (video, upload, feature flags)
 * - Runtime overrides via SharedPreferences (for future extensibility)
 *
 * PRODUCTION ONLY: All connections go to https://app.synaptihand.com
 */
@Singleton
class ConfigManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "ConfigManager"

        // Production server configuration - NO EXCEPTIONS
        private const val PRODUCTION_HOST = "app.synaptihand.com"
        private const val PRODUCTION_URL = "https://app.synaptihand.com"
        private const val PRODUCTION_ENV_NAME = "Production (SynaptiHand)"

        // Supabase configuration
        private const val SUPABASE_URL = "https://mtodevikkgraisalolkq.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10b2Rldmlra2dyYWlzYWxvbGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NjM5MjAsImV4cCI6MjA4NDQzOTkyMH0.z-xOakwGQxH9H3buLTMayVc_tnNGivTrZIRlPOCDOso"
    }

    private var initialized = false
    private val _currentEnvironment = MutableStateFlow(ServerEnvironment.Production as ServerEnvironment)
    val currentEnvironment: StateFlow<ServerEnvironment> = _currentEnvironment.asStateFlow()

    /**
     * Initialize ConfigManager with application context.
     * Must be called in Application.onCreate()
     */
    fun init() {
        if (initialized) {
            Log.w(TAG, "ConfigManager already initialized")
            return
        }
        initialized = true
        Log.i(TAG, "ConfigManager initialized - Server: $PRODUCTION_ENV_NAME")
        Log.d(TAG, "Base URL: $PRODUCTION_URL")
    }

    /**
     * Check if ConfigManager has been initialized
     */
    fun isInitialized(): Boolean = initialized

    // =========================================================================
    // SERVER CONFIGURATION
    // =========================================================================

    /**
     * Get the current base URL - ALWAYS production
     */
    fun getCurrentBaseUrl(): String = PRODUCTION_URL

    /**
     * Server host - ALWAYS production
     */
    fun getServerHost(): String = PRODUCTION_HOST

    /**
     * Whether to use HTTPS - ALWAYS true for production
     */
    fun useHttps(): Boolean = true

    /**
     * Port number - ALWAYS 443 for HTTPS
     */
    fun getServerPort(): Int = 443

    /**
     * Current environment display name - ALWAYS production
     */
    fun getCurrentEnvironmentName(): String = PRODUCTION_ENV_NAME

    /**
     * Base URL for the backend API - ALWAYS production
     */
    fun getBaseUrl(): String = PRODUCTION_URL

    /**
     * Set environment - ALWAYS sets to production regardless of input
     * Provided for backward compatibility with existing code
     */
    @Suppress("UNUSED_PARAMETER")
    fun setEnvironment(environment: ServerEnvironment) {
        Log.i(TAG, "Environment is always Production ($PRODUCTION_URL)")
        _currentEnvironment.value = ServerEnvironment.Production
    }

    /**
     * Set production - the only available option
     */
    fun setProduction() {
        _currentEnvironment.value = ServerEnvironment.Production
    }

    /**
     * Reset to default - ALWAYS production
     */
    fun resetToDefault() {
        _currentEnvironment.value = ServerEnvironment.Production
        Log.i(TAG, "Environment is Production ($PRODUCTION_URL)")
    }

    // =========================================================================
    // API ENDPOINTS
    // =========================================================================

    /**
     * Legacy mobile upload endpoint (unified)
     * @deprecated Use getKeypointsUploadUrl() and getVideoUploadUrl() for parallel upload
     */
    fun getUploadUrl(): String = "$PRODUCTION_URL/api/mobile/upload"

    /**
     * Parallel upload endpoints (recommended)
     * Keypoints are uploaded first (fast), video uploaded separately (slow)
     */
    fun getKeypointsUploadUrl(): String = "$PRODUCTION_URL/api/mobile/keypoints"

    fun getVideoUploadUrl(): String = "$PRODUCTION_URL/api/mobile/video"

    fun getSessionStatusUrl(): String = "$PRODUCTION_URL/api/mobile/session"

    // =========================================================================
    // SUPABASE CONFIGURATION
    // =========================================================================

    /**
     * Get Supabase configuration.
     * Supabase replaces the Node.js backend - Android app connects directly to Supabase.
     * File storage (GCS) remains unchanged.
     */
    fun getSupabaseUrl(): String = SUPABASE_URL

    fun getSupabaseAnonKey(): String = SUPABASE_ANON_KEY

    fun getSupabaseRestUrl(): String = "$SUPABASE_URL/rest/v1"

    fun getSupabaseAuthUrl(): String = "$SUPABASE_URL/auth/v1"

    fun getSupabaseRealtimeUrl(): String = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1"

    // =========================================================================
    // FEATURE FLAGS
    // =========================================================================

    /**
     * Feature flag for parallel upload
     * Set to true to use new parallel upload (keypoints first, then video)
     * Set to false to use legacy unified upload
     */
    fun useParallelUpload(): Boolean = false  // Disabled - unified upload handles xlsx format

    /**
     * Feature flag for overlay video recording
     * When true, hand landmarks are burned into the video during recording
     * When false, raw video is recorded without overlay (faster)
     */
    fun recordWithOverlay(): Boolean = true

    // =========================================================================
    // VIDEO RECORDING CONFIGURATION
    // =========================================================================

    /**
     * Video recording configuration
     * NOTE: Video uses 720p (1280x720) for quality
     * Detection uses camera native resolution (typically 640x480) for 60 FPS performance
     */
    fun getVideoWidth(): Int = 1280   // 720p width

    fun getVideoHeight(): Int = 720   // 720p height

    fun getVideoFps(): Int = 30

    fun getVideoBitrate(): Int = 4_000_000  // 4 Mbps for 720p quality
}

// ============================================================================
// DEPRECATED BACKWARD COMPATIBILITY OBJECTS
// ============================================================================

/**
 * Backward-compatible facade for app configuration.
 *
 * DEPRECATED: Use ConfigManager directly via dependency injection.
 * This object is maintained for backward compatibility only.
 *
 * PRODUCTION ONLY: All connections go to https://app.synaptihand.com
 * No local development, Docker, or custom server options.
 */
@Deprecated(
    message = "Use ConfigManager via dependency injection instead",
    replaceWith = ReplaceWith("ConfigManager", "com.handpose.app.config.ConfigManager"),
    level = DeprecationLevel.WARNING
)
object AppConfig {
    private var configManager: ConfigManager? = null

    /**
     * Initialize AppConfig with application context.
     * Must be called in Application.onCreate()
     */
    fun init(context: Context) {
        // ConfigManager is now injected via Hilt, but we maintain this for backward compatibility
        // The actual initialization happens in ConfigManager via DI
    }

    private fun getConfig(): ConfigManager {
        return configManager ?: throw IllegalStateException(
            "AppConfig not initialized. Use ConfigManager via dependency injection instead."
        )
    }

    /**
     * Internal method to set ConfigManager instance.
     * Called by HandPoseApplication after Hilt injection.
     */
    internal fun setConfigManager(manager: ConfigManager) {
        configManager = manager
    }

    /**
     * Server host - ALWAYS production
     */
    val SERVER_HOST: String
        get() = "app.synaptihand.com"

    /**
     * Whether to use HTTPS - ALWAYS true for production
     */
    val USE_HTTPS: Boolean
        get() = true

    /**
     * Port number - ALWAYS 443 for HTTPS
     */
    val SERVER_PORT: Int
        get() = 443

    /**
     * Base URL for the backend API - ALWAYS production
     */
    val BASE_URL: String
        get() = "https://app.synaptihand.com"

    /**
     * Legacy mobile upload endpoint (unified)
     * @deprecated Use KEYPOINTS_UPLOAD_URL and VIDEO_UPLOAD_URL for parallel upload
     */
    val UPLOAD_URL: String
        get() = "$BASE_URL/api/mobile/upload"

    /**
     * Parallel upload endpoints (recommended)
     * Keypoints are uploaded first (fast), video uploaded separately (slow)
     */
    val KEYPOINTS_UPLOAD_URL: String
        get() = "$BASE_URL/api/mobile/keypoints"

    val VIDEO_UPLOAD_URL: String
        get() = "$BASE_URL/api/mobile/video"

    val SESSION_STATUS_URL: String
        get() = "$BASE_URL/api/mobile/session"

    /**
     * Feature flag for parallel upload
     * Set to true to use new parallel upload (keypoints first, then video)
     * Set to false to use legacy unified upload
     */
    const val USE_PARALLEL_UPLOAD = false  // Disabled - unified upload handles xlsx format

    /**
     * Feature flag for overlay video recording
     * When true, hand landmarks are burned into the video during recording
     * When false, raw video is recorded without overlay (faster)
     */
    const val RECORD_WITH_OVERLAY = true

    /**
     * Video recording configuration
     * NOTE: Video uses 720p (1280x720) for quality
     * Detection uses camera native resolution (typically 640x480) for 60 FPS performance
     */
    const val VIDEO_WIDTH = 1280   // 720p width
    const val VIDEO_HEIGHT = 720   // 720p height
    const val VIDEO_FPS = 30
    const val VIDEO_BITRATE = 4_000_000  // 4 Mbps for 720p quality

    /**
     * Check if AppConfig has been initialized
     */
    fun isInitialized(): Boolean = configManager?.isInitialized() ?: false

    /**
     * Current environment display name - ALWAYS production
     */
    val currentEnvironmentName: String
        get() = "Production (SynaptiHand)"
}

/**
 * Supabase configuration for direct database and auth access.
 *
 * DEPRECATED: Use ConfigManager.getSupabase*() methods via dependency injection.
 * This object is maintained for backward compatibility only.
 *
 * This replaces the Node.js backend - Android app connects directly to Supabase.
 * File storage (GCS) remains unchanged.
 */
@Deprecated(
    message = "Use ConfigManager.getSupabase*() methods via dependency injection instead",
    replaceWith = ReplaceWith("ConfigManager", "com.handpose.app.config.ConfigManager"),
    level = DeprecationLevel.WARNING
)
object SupabaseConfig {

    /**
     * Supabase project URL
     */
    const val SUPABASE_URL = "https://mtodevikkgraisalolkq.supabase.co"

    /**
     * Supabase anon/public key (safe to expose in client apps)
     * This key is used with Row Level Security (RLS) policies
     */
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10b2Rldmlra2dyYWlzYWxvbGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NjM5MjAsImV4cCI6MjA4NDQzOTkyMH0.z-xOakwGQxH9H3buLTMayVc_tnNGivTrZIRlPOCDOso"

    /**
     * Database REST API endpoint
     */
    val REST_URL: String
        get() = "$SUPABASE_URL/rest/v1"

    /**
     * Auth API endpoint
     */
    val AUTH_URL: String
        get() = "$SUPABASE_URL/auth/v1"

    /**
     * Realtime WebSocket endpoint
     */
    val REALTIME_URL: String
        get() = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1"
}

/**
 * Server settings manager - PRODUCTION ONLY.
 * All connections go to https://app.synaptihand.com with no exceptions.
 *
 * DEPRECATED: This class is now a thin wrapper around ConfigManager.
 * Use ConfigManager directly via dependency injection for new code.
 */
@Deprecated(
    message = "Use ConfigManager directly via dependency injection",
    replaceWith = ReplaceWith("ConfigManager", "com.handpose.app.config.ConfigManager"),
    level = DeprecationLevel.WARNING
)
@Singleton
class ServerSettingsManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configManager: ConfigManager
) {
    val currentEnvironment: StateFlow<ServerEnvironment>
        get() = configManager.currentEnvironment

    /**
     * Get the current base URL - ALWAYS production
     */
    fun getCurrentBaseUrl(): String = configManager.getCurrentBaseUrl()

    /**
     * Uses HTTPS - ALWAYS true
     */
    fun useHttps(): Boolean = configManager.useHttps()

    /**
     * Set environment - ALWAYS sets to production regardless of input
     */
    fun setEnvironment(environment: ServerEnvironment) {
        configManager.setEnvironment(environment)
    }

    /**
     * Set production - the only available option
     */
    fun setProduction() {
        configManager.setProduction()
    }

    /**
     * Reset to default - ALWAYS production
     */
    fun resetToDefault() {
        configManager.resetToDefault()
    }
}
