package com.handpose.app.network

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.handpose.app.config.AppConfig
import com.handpose.app.recording.ProgressRequestBody
import com.handpose.app.recording.RecordingService
import com.handpose.app.recording.UploadState
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// PARALLEL UPLOAD MANAGER - Modern parallel upload with retry logic
// ============================================================================

/**
 * Manages parallel upload of keypoints (priority) and video (background)
 *
 * Architecture: Android → Backend API → GCS
 * Security: Android NEVER sees GCS credentials. All uploads go through backend.
 *
 * Flow:
 * 1. Upload keypoints (CSV) first - fast, triggers analysis immediately
 * 2. Upload video in parallel - slow, doesn't block analysis
 * 3. Backend uploads to GCS using service account (not exposed to Android)
 */
@Singleton
class ParallelUploadManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val recordingService: RecordingService
) {
    companion object {
        private const val TAG = "ParallelUploadManager"

        // Retry configuration
        private const val KEYPOINTS_MAX_RETRIES = 5
        private const val KEYPOINTS_INITIAL_BACKOFF_MS = 1000L
        private const val KEYPOINTS_MAX_BACKOFF_MS = 30000L

        private const val VIDEO_MAX_RETRIES = 10
        private const val VIDEO_INITIAL_BACKOFF_MS = 5000L
        private const val VIDEO_MAX_BACKOFF_MS = 300000L  // 5 minutes
    }

    // Current upload state
    private val _uploadState = MutableStateFlow<ParallelUploadState>(ParallelUploadState.Idle)
    val uploadState = _uploadState.asStateFlow()

    /**
     * Upload session using parallel channels
     * Returns flow of upload progress updates
     *
     * Workflow: Processing → Uploading Keypoints → Uploading Video → Analyzing → Completed
     */
    fun uploadSession(
        sessionId: String,
        sessionDir: File,
        patientId: String?
    ): Flow<UploadState> = flow {
        Log.i(TAG, "Starting parallel upload for session: $sessionId")

        val csvFile = File(sessionDir, "keypoints.xlsx")
        // Prefer labeled video (with overlay) over raw video
        val labeledVideoFile = File(sessionDir, "video_labeled.mp4")
        val videoFile = if (labeledVideoFile.exists()) labeledVideoFile else File(sessionDir, "video.mp4")
        val metadataFile = File(sessionDir, "metadata.json")

        Log.i(TAG, "Video file to upload: ${videoFile.name} (labeled: ${labeledVideoFile.exists()})")

        if (!csvFile.exists()) {
            emit(UploadState.Failed("Keypoints file not found", UploadState.FailedChannel.KEYPOINTS))
            return@flow
        }

        // Phase 0: Processing - Prepare files for upload
        emit(UploadState.Processing(progress = 0, message = "Preparing upload..."))
        kotlinx.coroutines.delay(200)  // Brief delay to show processing state

        emit(UploadState.Processing(progress = 30, message = "Validating keypoints data..."))
        kotlinx.coroutines.delay(200)

        emit(UploadState.Processing(progress = 60, message = "Preparing video for upload..."))
        kotlinx.coroutines.delay(200)

        emit(UploadState.Processing(progress = 100, message = "Starting upload..."))
        kotlinx.coroutines.delay(300)

        // Phase 1: Upload keypoints (priority channel)
        emit(UploadState.Uploading(keypointsProgress = 0))

        val keypointsResult = uploadKeypointsWithRetry(
            sessionId = sessionId,
            patientId = patientId,
            csvFile = csvFile,
            metadataFile = if (metadataFile.exists()) metadataFile else null,
            onProgress = { progress ->
                _uploadState.update {
                    ParallelUploadState.Uploading(
                        keypointsProgress = progress,
                        videoProgress = 0,
                        keypointsComplete = false,
                        videoComplete = false
                    )
                }
            }
        )

        if (!keypointsResult.success) {
            emit(UploadState.Failed(
                keypointsResult.error ?: "Keypoints upload failed",
                UploadState.FailedChannel.KEYPOINTS
            ))
            return@flow
        }

        val recordingId = keypointsResult.recordingId
        Log.i(TAG, "Keypoints uploaded, recordingId: $recordingId, starting analysis")

        // Keypoints done - analysis started
        emit(UploadState.Uploading(
            keypointsProgress = 100,
            keypointsComplete = true,
            analyzing = true
        ))

        // Phase 2: Upload video in parallel (background channel)
        if (videoFile.exists()) {
            Log.i(TAG, "Starting video upload for session: $sessionId")

            // Use coroutineScope to manage parallel operations
            coroutineScope {
                // Start video upload
                val videoJob = async(Dispatchers.IO) {
                    uploadVideoWithRetry(
                        sessionId = sessionId,
                        videoFile = videoFile,
                        onProgress = { progress ->
                            _uploadState.update { current ->
                                when (current) {
                                    is ParallelUploadState.Uploading -> current.copy(
                                        videoProgress = progress,
                                        keypointsComplete = true
                                    )
                                    else -> ParallelUploadState.Uploading(
                                        keypointsProgress = 100,
                                        videoProgress = progress,
                                        keypointsComplete = true,
                                        videoComplete = false
                                    )
                                }
                            }
                        }
                    )
                }

                // Poll for analysis status while video uploads
                val analysisJob = async(Dispatchers.IO) {
                    pollAnalysisStatus(sessionId)
                }

                // Wait for video upload
                val videoResult = videoJob.await()

                if (!videoResult.success) {
                    Log.w(TAG, "Video upload failed: ${videoResult.error}")
                    // Video failed but analysis may still complete
                    emit(UploadState.Analyzing(
                        progress = 50, // Approximate
                        videoProgress = 0,
                        videoComplete = false
                    ))
                } else {
                    Log.i(TAG, "Video upload completed for session: $sessionId")
                }

                // Check analysis status (don't block on it - uploads are the priority)
                val analysisComplete = try {
                    // Short timeout - just check if already complete
                    analysisJob.await()
                } catch (e: Exception) {
                    Log.w(TAG, "Analysis polling failed: ${e.message}")
                    false
                }

                // Emit final state - consider complete when BOTH uploads succeed
                // Analysis continues in background on server
                if (videoResult.success) {
                    // Both uploads successful = session complete
                    Log.i(TAG, "Both uploads complete for session: $sessionId (analysis: $analysisComplete)")
                    emit(UploadState.Completed(recordingId))
                } else if (analysisComplete) {
                    // Analysis done but video failed
                    emit(UploadState.PartiallyComplete(
                        recordingId = recordingId ?: "",
                        analysisComplete = true,
                        videoComplete = false
                    ))
                } else {
                    // Video failed, analysis still running
                    emit(UploadState.Analyzing(
                        progress = 100,
                        videoProgress = 0,
                        videoComplete = false
                    ))
                }
            }
        } else {
            // No video file - just wait for analysis
            Log.i(TAG, "No video file, waiting for analysis to complete")

            val analysisComplete = pollAnalysisStatus(sessionId)

            if (analysisComplete) {
                emit(UploadState.Completed(recordingId))
            } else {
                emit(UploadState.Analyzing(progress = 100, videoComplete = true))
            }
        }

        _uploadState.value = ParallelUploadState.Completed(recordingId)
    }

    /**
     * Upload keypoints with retry logic
     */
    private suspend fun uploadKeypointsWithRetry(
        sessionId: String,
        patientId: String?,
        csvFile: File,
        metadataFile: File?,
        onProgress: (Int) -> Unit
    ): UploadResult = withContext(Dispatchers.IO) {
        var lastError: String? = null
        var backoffMs = KEYPOINTS_INITIAL_BACKOFF_MS

        repeat(KEYPOINTS_MAX_RETRIES) { attempt ->
            try {
                Log.d(TAG, "Keypoints upload attempt ${attempt + 1}/$KEYPOINTS_MAX_RETRIES")

                val result = uploadKeypoints(sessionId, patientId, csvFile, metadataFile, onProgress)
                if (result.success) {
                    return@withContext result
                }
                lastError = result.error
            } catch (e: Exception) {
                Log.e(TAG, "Keypoints upload error: ${e.message}", e)
                lastError = e.message
            }

            if (attempt < KEYPOINTS_MAX_RETRIES - 1) {
                Log.d(TAG, "Retrying keypoints upload in ${backoffMs}ms")
                delay(backoffMs)
                backoffMs = (backoffMs * 2).coerceAtMost(KEYPOINTS_MAX_BACKOFF_MS)
            }
        }

        UploadResult(success = false, error = lastError ?: "Max retries exceeded")
    }

    /**
     * Upload keypoints to backend
     */
    private suspend fun uploadKeypoints(
        sessionId: String,
        patientId: String?,
        csvFile: File,
        metadataFile: File?,
        onProgress: (Int) -> Unit
    ): UploadResult = withContext(Dispatchers.IO) {
        try {
            val sessionIdBody = sessionId.toRequestBody("text/plain".toMediaType())
            val patientIdBody = (patientId ?: "unknown").toRequestBody("text/plain".toMediaType())

            // Create keypoints part with progress tracking
            val keypointsBody = ProgressRequestBody(
                file = csvFile,
                contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".toMediaType(),
                onProgress = { written, total ->
                    val progress = ((written.toFloat() / total) * 100).toInt()
                    onProgress(progress)
                }
            )
            val keypointsPart = MultipartBody.Part.createFormData(
                "keypoints",
                csvFile.name,
                keypointsBody
            )

            // Create metadata part if exists
            val metadataPart = metadataFile?.let { file ->
                MultipartBody.Part.createFormData(
                    "metadata",
                    file.name,
                    file.readBytes().toRequestBody("application/json".toMediaType())
                )
            }

            val response = recordingService.uploadKeypoints(
                sessionId = sessionIdBody,
                patientId = patientIdBody,
                keypoints = keypointsPart,
                metadata = metadataPart
            )

            if (response.isSuccessful && response.body()?.success == true) {
                UploadResult(
                    success = true,
                    recordingId = response.body()?.recordingId
                )
            } else {
                UploadResult(
                    success = false,
                    error = response.body()?.message ?: "Keypoints upload failed: ${response.code()}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Keypoints upload exception", e)
            UploadResult(success = false, error = e.message)
        }
    }

    /**
     * Upload video with retry logic
     */
    private suspend fun uploadVideoWithRetry(
        sessionId: String,
        videoFile: File,
        onProgress: (Int) -> Unit
    ): UploadResult = withContext(Dispatchers.IO) {
        var lastError: String? = null
        var backoffMs = VIDEO_INITIAL_BACKOFF_MS

        repeat(VIDEO_MAX_RETRIES) { attempt ->
            try {
                Log.d(TAG, "Video upload attempt ${attempt + 1}/$VIDEO_MAX_RETRIES")

                val result = uploadVideo(sessionId, videoFile, onProgress)
                if (result.success) {
                    return@withContext result
                }
                lastError = result.error
            } catch (e: Exception) {
                Log.e(TAG, "Video upload error: ${e.message}", e)
                lastError = e.message
            }

            if (attempt < VIDEO_MAX_RETRIES - 1) {
                Log.d(TAG, "Retrying video upload in ${backoffMs}ms")
                delay(backoffMs)
                backoffMs = (backoffMs * 2).coerceAtMost(VIDEO_MAX_BACKOFF_MS)
            }
        }

        UploadResult(success = false, error = lastError ?: "Max retries exceeded")
    }

    /**
     * Upload video to backend
     */
    private suspend fun uploadVideo(
        sessionId: String,
        videoFile: File,
        onProgress: (Int) -> Unit
    ): UploadResult = withContext(Dispatchers.IO) {
        try {
            val sessionIdBody = sessionId.toRequestBody("text/plain".toMediaType())

            // Create video part with progress tracking
            val videoBody = ProgressRequestBody(
                file = videoFile,
                contentType = "video/mp4".toMediaType(),
                onProgress = { written, total ->
                    val progress = ((written.toFloat() / total) * 100).toInt()
                    onProgress(progress)
                }
            )
            val videoPart = MultipartBody.Part.createFormData(
                "video",
                videoFile.name,
                videoBody
            )

            val response = recordingService.uploadVideo(
                sessionId = sessionIdBody,
                video = videoPart
            )

            if (response.isSuccessful && response.body()?.success == true) {
                UploadResult(
                    success = true,
                    recordingId = response.body()?.recordingId
                )
            } else {
                UploadResult(
                    success = false,
                    error = response.body()?.error ?: response.body()?.message
                        ?: "Video upload failed: ${response.code()}"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Video upload exception", e)
            UploadResult(success = false, error = e.message)
        }
    }

    /**
     * Poll for analysis completion
     */
    private suspend fun pollAnalysisStatus(
        sessionId: String,
        maxPolls: Int = 60,
        pollIntervalMs: Long = 2000
    ): Boolean = withContext(Dispatchers.IO) {
        repeat(maxPolls) { attempt ->
            try {
                val response = recordingService.getSessionStatus(sessionId)
                if (response.isSuccessful) {
                    val session = response.body()?.session
                    val analysisStatus = session?.analysis?.status

                    Log.d(TAG, "Analysis status poll $attempt: $analysisStatus")

                    when (analysisStatus) {
                        "completed" -> return@withContext true
                        "failed" -> return@withContext false
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Analysis status poll error: ${e.message}")
            }

            delay(pollIntervalMs)
        }

        Log.w(TAG, "Analysis polling timed out after $maxPolls attempts")
        false
    }

    /**
     * Reset upload state
     */
    fun reset() {
        _uploadState.value = ParallelUploadState.Idle
    }

    /**
     * Internal upload result
     */
    private data class UploadResult(
        val success: Boolean,
        val recordingId: String? = null,
        val error: String? = null
    )
}

// ============================================================================
// PARALLEL UPLOAD STATE - Internal state tracking
// ============================================================================

/**
 * Internal state tracking for parallel upload
 */
sealed class ParallelUploadState {
    object Idle : ParallelUploadState()

    data class Uploading(
        val keypointsProgress: Int = 0,
        val videoProgress: Int = 0,
        val keypointsComplete: Boolean = false,
        val videoComplete: Boolean = false
    ) : ParallelUploadState()

    data class Completed(
        val recordingId: String?
    ) : ParallelUploadState()

    data class Failed(
        val error: String,
        val channel: String
    ) : ParallelUploadState()
}

// ============================================================================
// SESSION UPLOAD WORKER - Background upload via WorkManager
// ============================================================================

/**
 * WorkManager worker for uploading session files in the background
 */
@HiltWorker
class SessionUploadWorker @AssistedInject constructor(
    @Assisted private val context: Context,
    @Assisted private val workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val TAG = "SessionUploadWorker"

        // Input data keys
        const val KEY_SESSION_ID = "session_id"
        const val KEY_SESSION_DIR = "session_dir"
        const val KEY_UPLOAD_URL = "upload_url"

        // Output data keys
        const val KEY_RESULT_MESSAGE = "result_message"
        const val KEY_UPLOAD_SUCCESS = "upload_success"

        // Default upload URL - centralized in AppConfig
        private val DEFAULT_UPLOAD_URL = AppConfig.UPLOAD_URL

        /**
         * Create and enqueue an upload work request
         */
        fun enqueueUpload(
            context: Context,
            sessionId: String,
            sessionDir: String,
            uploadUrl: String = DEFAULT_UPLOAD_URL
        ) {
            val inputData = workDataOf(
                KEY_SESSION_ID to sessionId,
                KEY_SESSION_DIR to sessionDir,
                KEY_UPLOAD_URL to uploadUrl
            )

            val uploadRequest = OneTimeWorkRequestBuilder<SessionUploadWorker>()
                .setInputData(inputData)
                .addTag("upload_$sessionId")
                .build()

            WorkManager.getInstance(context).enqueue(uploadRequest)
            Log.i(TAG, "Enqueued upload for session: $sessionId")
        }
    }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val sessionId = inputData.getString(KEY_SESSION_ID)
            ?: return@withContext Result.failure(
                workDataOf(KEY_RESULT_MESSAGE to "Missing session ID")
            )

        val sessionDir = inputData.getString(KEY_SESSION_DIR)
            ?: return@withContext Result.failure(
                workDataOf(KEY_RESULT_MESSAGE to "Missing session directory")
            )

        val uploadUrl = inputData.getString(KEY_UPLOAD_URL) ?: DEFAULT_UPLOAD_URL

        Log.i(TAG, "Starting upload for session: $sessionId")

        try {
            val result = uploadSession(sessionId, File(sessionDir), uploadUrl)

            if (result.success) {
                Log.i(TAG, "Upload successful for session: $sessionId")
                Result.success(
                    workDataOf(
                        KEY_UPLOAD_SUCCESS to true,
                        KEY_RESULT_MESSAGE to "Upload completed successfully"
                    )
                )
            } else {
                Log.e(TAG, "Upload failed for session: $sessionId - ${result.message}")
                if (runAttemptCount < 3) {
                    Result.retry()
                } else {
                    Result.failure(
                        workDataOf(
                            KEY_UPLOAD_SUCCESS to false,
                            KEY_RESULT_MESSAGE to result.message
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload exception for session: $sessionId", e)
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure(
                    workDataOf(
                        KEY_UPLOAD_SUCCESS to false,
                        KEY_RESULT_MESSAGE to "Upload failed: ${e.message}"
                    )
                )
            }
        }
    }

    /**
     * Upload session files to the server
     */
    private suspend fun uploadSession(
        sessionId: String,
        sessionDir: File,
        uploadUrl: String
    ): UploadResult = withContext(Dispatchers.IO) {
        if (!sessionDir.exists()) {
            return@withContext UploadResult(false, "Session directory not found")
        }

        val csvFile = File(sessionDir, "keypoints.csv")
        val videoFile = File(sessionDir, "video.mp4")
        val metadataFile = File(sessionDir, "metadata.json")

        // Build multipart request
        val multipartBuilder = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("session_id", sessionId)

        // Add metadata
        if (metadataFile.exists()) {
            multipartBuilder.addFormDataPart(
                "metadata",
                "metadata.json",
                metadataFile.asRequestBody("application/json".toMediaType())
            )
        }

        // Add keypoints CSV
        if (csvFile.exists()) {
            multipartBuilder.addFormDataPart(
                "keypoints",
                "keypoints.csv",
                csvFile.asRequestBody("text/csv".toMediaType())
            )
        }

        // Add video (if exists)
        if (videoFile.exists()) {
            multipartBuilder.addFormDataPart(
                "video",
                "video.mp4",
                videoFile.asRequestBody("video/mp4".toMediaType())
            )
        }

        val requestBody = multipartBuilder.build()

        val request = Request.Builder()
            .url(uploadUrl)
            .post(requestBody)
            .build()

        try {
            val response = httpClient.newCall(request).execute()

            if (response.isSuccessful) {
                UploadResult(true, "Upload successful")
            } else {
                UploadResult(false, "Server error: ${response.code} - ${response.message}")
            }
        } catch (e: Exception) {
            UploadResult(false, "Network error: ${e.message}")
        }
    }

    private data class UploadResult(
        val success: Boolean,
        val message: String
    )
}
