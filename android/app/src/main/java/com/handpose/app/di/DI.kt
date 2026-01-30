package com.handpose.app.di

import android.content.Context
import android.util.Log
import com.handpose.app.auth.AuthService
import com.handpose.app.auth.TokenManager
import com.handpose.app.config.ServerSettingsManager
import com.handpose.app.config.SupabaseConfig
import com.handpose.app.patients.PatientService
import com.handpose.app.projects.ProjectService
import com.handpose.app.recording.ProtocolRepository
import com.handpose.app.recording.RecordingService
import com.handpose.app.video.VideoLabelingProcessor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.Realtime
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// INTERCEPTORS
// ============================================================================

/**
 * OkHttp interceptor that adds JWT authentication token to outgoing requests.
 *
 * Skips the /auth/login endpoint to avoid circular dependencies.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {

    companion object {
        private const val TAG = "AuthInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val url = originalRequest.url.toString()

        // Skip auth header for login endpoint
        if (originalRequest.url.encodedPath.contains("/auth/login")) {
            Log.d(TAG, "⚠️ Skipping auth for login endpoint: $url")
            return chain.proceed(originalRequest)
        }

        val token = tokenManager.getToken()

        return if (token != null) {
            Log.d(TAG, "✅ Auth token present (${token.take(20)}...) for: $url")
            val authenticatedRequest = originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
            chain.proceed(authenticatedRequest)
        } else {
            Log.w(TAG, "❌ NO AUTH TOKEN for: $url")
            Log.w(TAG, "⚠️ User may not be logged in - request will likely fail with 401")
            chain.proceed(originalRequest)
        }
    }
}

/**
 * OkHttp interceptor that dynamically rewrites request URLs based on
 * the current server environment settings.
 *
 * This allows runtime server switching without needing to recreate
 * Retrofit instances or restart the app.
 */
@Singleton
class DynamicBaseUrlInterceptor @Inject constructor(
    private val serverSettingsManager: ServerSettingsManager
) : Interceptor {

    companion object {
        private const val TAG = "DynamicBaseUrlInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val originalUrl = originalRequest.url

        // Get current server configuration
        val currentBaseUrl = serverSettingsManager.getCurrentBaseUrl()
        val targetUrl = currentBaseUrl.toHttpUrlOrNull()

        if (targetUrl == null) {
            Log.e(TAG, "❌ Invalid base URL: $currentBaseUrl, using original request")
            return chain.proceed(originalRequest)
        }

        // Build new URL with current server's host/scheme/port
        val newUrl = originalUrl.newBuilder()
            .scheme(targetUrl.scheme)
            .host(targetUrl.host)
            .port(targetUrl.port)
            .build()

        // Log URL rewrite for debugging
        if (originalUrl.host != newUrl.host || originalUrl.scheme != newUrl.scheme) {
            Log.d(TAG, "🔄 URL Rewrite: ${originalUrl.scheme}://${originalUrl.host} → ${newUrl.scheme}://${newUrl.host}:${newUrl.port}")
        }

        // Log final target for production server connectivity debugging
        Log.d(TAG, "🌐 Target: ${newUrl.scheme}://${newUrl.host}:${newUrl.port}${newUrl.encodedPath}")

        // Build new request with updated URL
        val newRequest = originalRequest.newBuilder()
            .url(newUrl)
            .build()

        try {
            val response = chain.proceed(newRequest)
            Log.d(TAG, "✅ Network response: ${response.code} ${response.message} (${newUrl.host})")
            return response
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "❌ DNS FAILURE: Cannot resolve ${newUrl.host}")
            Log.e(TAG, "⚠️ Check: 1) Internet connection 2) DNS resolver 3) Firewall")
            throw e
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "❌ TIMEOUT: ${newUrl.host} not responding")
            Log.e(TAG, "⚠️ Check: 1) Server is running 2) Firewall 3) Network speed")
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "❌ Network error: ${e.javaClass.simpleName}: ${e.message}")
            throw e
        }
    }
}

// ============================================================================
// NETWORK MODULE
// ============================================================================

/**
 * Hilt module providing network-related dependencies including OkHttp, Retrofit,
 * and various API service interfaces.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideAuthInterceptor(tokenManager: TokenManager): AuthInterceptor {
        return AuthInterceptor(tokenManager)
    }

    @Provides
    @Singleton
    fun provideDynamicBaseUrlInterceptor(
        serverSettingsManager: ServerSettingsManager
    ): DynamicBaseUrlInterceptor {
        return DynamicBaseUrlInterceptor(serverSettingsManager)
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        dynamicBaseUrlInterceptor: DynamicBaseUrlInterceptor
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        return OkHttpClient.Builder()
            // Order matters: dynamic URL first, then auth, then logging
            .addInterceptor(dynamicBaseUrlInterceptor)  // Rewrite URL based on settings
            .addInterceptor(authInterceptor)             // Add auth token
            .addInterceptor(logging)                     // Log final request
            .connectTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(5, TimeUnit.MINUTES)           // Increased for large file uploads
            .readTimeout(5, TimeUnit.MINUTES)            // Increased for large file uploads
            .callTimeout(10, TimeUnit.MINUTES)           // Overall call timeout
            .retryOnConnectionFailure(true)              // Auto-retry on network failure
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit {
        // Use placeholder URL - actual URL is dynamically set by DynamicBaseUrlInterceptor
        // This allows runtime server switching without recreating Retrofit
        return Retrofit.Builder()
            .baseUrl("https://placeholder.local/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideAuthService(retrofit: Retrofit): AuthService {
        return retrofit.create(AuthService::class.java)
    }

    @Provides
    @Singleton
    fun provideProjectService(retrofit: Retrofit): ProjectService {
        return retrofit.create(ProjectService::class.java)
    }

    @Provides
    @Singleton
    fun providePatientService(retrofit: Retrofit): PatientService {
        return retrofit.create(PatientService::class.java)
    }

    @Provides
    @Singleton
    fun provideRecordingService(retrofit: Retrofit): RecordingService {
        return retrofit.create(RecordingService::class.java)
    }

    @Provides
    @Singleton
    fun provideProtocolRepository(recordingService: RecordingService): ProtocolRepository {
        return ProtocolRepository(recordingService)
    }

    @Provides
    @Singleton
    fun provideVideoLabelingProcessor(
        @ApplicationContext context: Context
    ): VideoLabelingProcessor {
        return VideoLabelingProcessor(context)
    }
}

// ============================================================================
// SUPABASE MODULE
// ============================================================================

/**
 * Hilt module providing Supabase client and services.
 *
 * This replaces the Node.js backend - Android connects directly to Supabase
 * for authentication and database operations.
 *
 * Using supabase-kt version 2.5.4 (compatible with Kotlin 1.9.x)
 */
@Module
@InstallIn(SingletonComponent::class)
object SupabaseModule {

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient {
        return createSupabaseClient(
            supabaseUrl = SupabaseConfig.SUPABASE_URL,
            supabaseKey = SupabaseConfig.SUPABASE_ANON_KEY
        ) {
            // Auth plugin for user authentication (v2.x naming)
            install(Auth) {
                // Session is automatically persisted
            }

            // Postgrest plugin for database operations
            install(Postgrest)

            // Realtime plugin for live updates (optional, for future use)
            install(Realtime)
        }
    }

    @Provides
    @Singleton
    fun provideSupabaseAuth(client: SupabaseClient): Auth {
        return client.auth
    }

    @Provides
    @Singleton
    fun provideSupabasePostgrest(client: SupabaseClient): Postgrest {
        return client.postgrest
    }
}
