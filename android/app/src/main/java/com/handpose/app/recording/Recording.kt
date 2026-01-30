package com.handpose.app.recording

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.DisplayMetrics
import android.util.Log
import android.view.Surface
import android.view.WindowManager
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import com.handpose.app.common.BaseUiState
import com.handpose.app.common.BaseViewModel
import com.handpose.app.common.LoadingState
import com.handpose.app.common.isLoading
import com.handpose.app.config.AppConfig
import com.handpose.app.data.model.BaseResponse
import com.handpose.app.data.model.RecordingResponse
import com.handpose.app.data.model.RecordingsResponse
import com.handpose.app.data.model.SessionMetadata
import com.handpose.app.ml.HandPoseResult
import com.handpose.app.network.ParallelUploadManager
import com.handpose.app.ui.GripStrengthData
import com.handpose.app.ui.formatElapsedTime
import com.handpose.app.ui.theme.SynaptiHandTheme
import com.handpose.app.video.VideoLabelingProcessor
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import okio.buffer
import okio.ForwardingSink
import okio.Sink
import okio.source
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.json.JSONObject
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import java.io.BufferedWriter
import java.io.File
import java.io.FileOutputStream
import java.io.FileWriter
import java.io.IOException
import java.nio.ByteBuffer
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Represents the current state of recording
 */
sealed class RecordingState {
    /**
     * Not recording, ready to start
     */
    object Idle : RecordingState()

    /**
     * Currently recording
     */
    data class Recording(
        val sessionId: String,
        val startTime: Long,
        val frameCount: Long = 0,
        val durationMs: Long = 0
    ) : RecordingState()

    /**
     * Recording stopped, processing video (adding overlay labels)
     * This state is shown while the labeled video is being generated
     */
    data class Processing(
        val sessionId: String,
        val progress: Int = 0,       // 0-100 processing progress
        val message: String = "Processing video..."
    ) : RecordingState()

    /**
     * Recording stopped, session completed (ready for upload)
     */
    data class Completed(
        val metadata: SessionMetadata
    ) : RecordingState()

    /**
     * Error occurred during recording
     */
    data class Error(
        val message: String,
        val exception: Throwable? = null
    ) : RecordingState()
}

/**
 * Upload state for a session - supports parallel upload channels
 */
sealed class UploadState {
    object NotStarted : UploadState()

    /**
     * Processing state - shown briefly before upload starts
     * This is the "Processing video..." phase the user sees
     */
    data class Processing(
        val progress: Int = 0,
        val message: String = "Processing video..."
    ) : UploadState()

    /**
     * Parallel upload in progress
     * @param keypointsProgress 0-100 for keypoints upload
     * @param videoProgress 0-100 for video upload
     * @param keypointsComplete whether keypoints upload is done
     * @param videoComplete whether video upload is done
     * @param analyzing whether backend analysis has started
     */
    data class Uploading(
        val keypointsProgress: Int = 0,
        val videoProgress: Int = 0,
        val keypointsComplete: Boolean = false,
        val videoComplete: Boolean = false,
        val analyzing: Boolean = false
    ) : UploadState() {
        // Overall progress: keypoints = 0-30%, video = 30-100%
        // This gives more weight to the video upload which is larger
        val progress: Int
            get() = when {
                keypointsComplete && videoComplete -> 100
                keypointsComplete -> 30 + (videoProgress * 70 / 100)  // 30-100%
                else -> keypointsProgress * 30 / 100  // 0-30%
            }
    }

    /**
     * Keypoints uploaded, analysis in progress, video may still be uploading
     */
    data class Analyzing(
        val progress: Int = 0,           // Analysis progress 0-100
        val videoProgress: Int = 0,      // Video upload progress 0-100
        val videoComplete: Boolean = false
    ) : UploadState()

    /**
     * All uploads and analysis complete
     */
    data class Completed(
        val recordingId: String? = null
    ) : UploadState()

    /**
     * Partial completion - analysis done but video may still be uploading
     */
    data class PartiallyComplete(
        val recordingId: String,
        val analysisComplete: Boolean,
        val videoComplete: Boolean,
        val videoProgress: Int = 0
    ) : UploadState()

    /**
     * Upload or analysis failed
     */
    data class Failed(
        val error: String,
        val channel: FailedChannel = FailedChannel.UNKNOWN
    ) : UploadState()

    enum class FailedChannel {
        KEYPOINTS,
        VIDEO,
        ANALYSIS,
        UNKNOWN
    }
}

/**
 * UI state for recording controls
 */
data class RecordingUiState(
    val state: RecordingState = RecordingState.Idle,
    val isRecording: Boolean = false,
    val isVideoRecording: Boolean = false,
    val isProcessing: Boolean = false,  // True during video processing/labeling
    val processingProgress: Int = 0,     // 0-100 processing progress
    val sessionId: String = "",
    val frameCount: Long = 0,
    val durationMs: Long = 0,
    val durationFormatted: String = "00:00",
    val lastCompletedSession: SessionMetadata? = null,
    val lastVideoFile: String? = null,
    val uploadState: UploadState = UploadState.NotStarted,
    val patientId: String? = null,
    val projectId: String? = null,
    val gripStrengthData: GripStrengthData? = null,
    val isSubmitting: Boolean = false,
    val submissionError: String? = null,
    // Parallel upload tracking
    val recordingId: String? = null,  // Backend recording ID after keypoints upload
    // Video thumbnail for upload preview
    val videoThumbnail: Bitmap? = null
)

/**
 * Unified sealed class hierarchy for upload lifecycle management.
 *
 * This provides a single source of truth for upload progress tracking,
 * consolidating the previously fragmented state representations from
 * RecordingState.UploadState and ParallelUploadManager.ParallelUploadState.
 *
 * Used by:
 * - ParallelUploadManager (internal state management)
 * - RecordingDetailViewModel (UI state)
 * - Upload UI components (progress tracking)
 *
 * Flow:
 * Idle → Preparing → UploadingKeypoints → UploadingVideo → Analyzing → Complete
 *        └─────────────────────────────────────────────────────┴─→ Error (at any stage)
 */
sealed class UploadFlowState {
    /**
     * No upload in progress.
     * Initial state before upload begins.
     */
    data object Idle : UploadFlowState()

    /**
     * Setting up upload (creating directories, validating files, etc.)
     * Brief transitional state before actual upload begins.
     *
     * @param progress 0-100 percentage of preparation
     * @param message User-facing preparation status message
     */
    data class Preparing(
        val progress: Int = 0,
        val message: String = "Preparing upload..."
    ) : UploadFlowState()

    /**
     * Uploading keypoints data (priority channel).
     * Keypoints upload is fast and triggers backend analysis immediately.
     *
     * @param progress 0-100 percentage of keypoints upload
     * @param totalBytes Total size of keypoints file in bytes
     * @param uploadedBytes Number of bytes uploaded so far
     */
    data class UploadingKeypoints(
        val progress: Int = 0,
        val totalBytes: Long = 0L,
        val uploadedBytes: Long = 0L
    ) : UploadFlowState()

    /**
     * Uploading video data (background channel).
     * Video upload is large and runs in parallel with analysis.
     *
     * @param progress 0-100 percentage of video upload
     * @param totalBytes Total size of video file in bytes
     * @param uploadedBytes Number of bytes uploaded so far
     * @param keypointsComplete Whether keypoints upload finished
     */
    data class UploadingVideo(
        val progress: Int = 0,
        val totalBytes: Long = 0L,
        val uploadedBytes: Long = 0L,
        val keypointsComplete: Boolean = true
    ) : UploadFlowState()

    /**
     * Parallel upload in progress (both keypoints and video).
     * Represents concurrent upload of both data channels.
     *
     * @param keypointsProgress 0-100 percentage of keypoints upload
     * @param videoProgress 0-100 percentage of video upload
     * @param keypointsComplete Whether keypoints upload finished
     * @param videoComplete Whether video upload finished
     * @param analyzing Whether backend analysis has started
     */
    data class UploadingParallel(
        val keypointsProgress: Int = 0,
        val videoProgress: Int = 0,
        val keypointsComplete: Boolean = false,
        val videoComplete: Boolean = false,
        val analyzing: Boolean = false
    ) : UploadFlowState() {
        /**
         * Overall progress combining both channels.
         * Keypoints weighted 30%, video weighted 70% (video is larger).
         */
        val overallProgress: Int
            get() = when {
                keypointsComplete && videoComplete -> 100
                keypointsComplete -> 30 + (videoProgress * 70 / 100)  // 30-100%
                else -> keypointsProgress * 30 / 100  // 0-30%
            }
    }

    /**
     * Server processing uploaded data.
     * Analysis runs on keypoints while video may still be uploading.
     *
     * @param progress 0-100 percentage of analysis (if available)
     * @param videoProgress 0-100 percentage of video upload (if still uploading)
     * @param videoComplete Whether video upload finished
     */
    data class Analyzing(
        val progress: Int = 0,
        val videoProgress: Int = 0,
        val videoComplete: Boolean = false
    ) : UploadFlowState()

    /**
     * Upload and analysis complete.
     *
     * @param sessionId Server-generated session ID
     * @param recordingId Backend recording ID
     */
    data class Complete(
        val sessionId: String,
        val recordingId: String? = null
    ) : UploadFlowState()

    /**
     * Partial completion - analysis done but video may still be uploading.
     * Allows user to proceed while background upload continues.
     *
     * @param recordingId Backend recording ID
     * @param analysisComplete Whether analysis finished
     * @param videoComplete Whether video upload finished
     * @param videoProgress 0-100 percentage of video upload (if still uploading)
     */
    data class PartiallyComplete(
        val recordingId: String,
        val analysisComplete: Boolean,
        val videoComplete: Boolean,
        val videoProgress: Int = 0
    ) : UploadFlowState()

    /**
     * Upload or analysis failed.
     *
     * @param message User-facing error message
     * @param retryable Whether this error can be retried
     * @param channel Which upload channel failed
     * @param exception Original exception if available
     */
    data class Error(
        val message: String,
        val retryable: Boolean = false,
        val channel: FailedChannel = FailedChannel.UNKNOWN,
        val exception: Throwable? = null
    ) : UploadFlowState()

    /**
     * Which upload channel failed
     */
    enum class FailedChannel {
        KEYPOINTS,
        VIDEO,
        ANALYSIS,
        UNKNOWN;

        /**
         * Convert to legacy UploadState.FailedChannel
         */
        fun toRecordingStateChannel(): UploadState.FailedChannel = when (this) {
            KEYPOINTS -> UploadState.FailedChannel.KEYPOINTS
            VIDEO -> UploadState.FailedChannel.VIDEO
            ANALYSIS -> UploadState.FailedChannel.ANALYSIS
            UNKNOWN -> UploadState.FailedChannel.UNKNOWN
        }
    }

    // ---------------------------
    // Helper Properties
    // ---------------------------

    /**
     * Whether upload is actively in progress (any uploading or analyzing state).
     */
    val isInProgress: Boolean
        get() = this is Preparing ||
                this is UploadingKeypoints ||
                this is UploadingVideo ||
                this is UploadingParallel ||
                this is Analyzing

    /**
     * Whether upload completed successfully.
     */
    val isComplete: Boolean
        get() = this is Complete

    /**
     * Whether upload encountered an error.
     */
    val isError: Boolean
        get() = this is Error

    /**
     * Whether upload finished (either complete or error).
     */
    val isFinished: Boolean
        get() = isComplete || isError

    /**
     * Overall progress percentage (0-100).
     * Returns best estimate based on current state.
     */
    val progressPercentage: Int
        get() = when (this) {
            is Idle -> 0
            is Preparing -> progress
            is UploadingKeypoints -> progress
            is UploadingVideo -> if (keypointsComplete) 30 + (progress * 70 / 100) else progress
            is UploadingParallel -> overallProgress
            is Analyzing -> if (videoComplete) 100 else 50 + (videoProgress / 2)
            is Complete -> 100
            is PartiallyComplete -> if (videoComplete) 100 else 90
            is Error -> 0
        }

    /**
     * User-facing status message for current state.
     */
    val statusMessage: String
        get() = when (this) {
            is Idle -> "Ready to upload"
            is Preparing -> message
            is UploadingKeypoints -> "Uploading keypoints... $progress%"
            is UploadingVideo -> "Uploading video... $progress%"
            is UploadingParallel -> when {
                !keypointsComplete -> "Uploading keypoints... $keypointsProgress%"
                !videoComplete -> "Uploading video... $videoProgress%"
                analyzing -> "Processing..."
                else -> "Uploading... $overallProgress%"
            }
            is Analyzing -> when {
                !videoComplete -> "Analyzing... (video upload: $videoProgress%)"
                else -> "Analyzing results..."
            }
            is Complete -> "Upload complete"
            is PartiallyComplete -> when {
                !videoComplete -> "Analysis complete (video upload: $videoProgress%)"
                else -> "Upload complete"
            }
            is Error -> "Upload failed: $message"
        }

    // ---------------------------
    // Helper Functions
    // ---------------------------

    /**
     * Whether this error can be retried.
     * Only applicable to Error state.
     */
    fun canRetry(): Boolean = when (this) {
        is Error -> retryable
        else -> false
    }

    /**
     * Convert to legacy RecordingState.UploadState for backward compatibility.
     * Use during migration period while refactoring existing code.
     */
    fun toRecordingState(): UploadState = when (this) {
        is Idle -> UploadState.NotStarted
        is Preparing -> UploadState.Processing(progress, message)
        is UploadingKeypoints -> UploadState.Uploading(keypointsProgress = progress)
        is UploadingVideo -> UploadState.Uploading(
            keypointsProgress = 100,
            videoProgress = progress,
            keypointsComplete = keypointsComplete,
            videoComplete = false
        )
        is UploadingParallel -> UploadState.Uploading(
            keypointsProgress = keypointsProgress,
            videoProgress = videoProgress,
            keypointsComplete = keypointsComplete,
            videoComplete = videoComplete,
            analyzing = analyzing
        )
        is Analyzing -> UploadState.Analyzing(
            progress = progress,
            videoProgress = videoProgress,
            videoComplete = videoComplete
        )
        is Complete -> UploadState.Completed(recordingId)
        is PartiallyComplete -> UploadState.PartiallyComplete(
            recordingId = recordingId,
            analysisComplete = analysisComplete,
            videoComplete = videoComplete,
            videoProgress = videoProgress
        )
        is Error -> UploadState.Failed(message, channel.toRecordingStateChannel())
    }

    /**
     * Convert from legacy RecordingState.UploadState.
     * Use during migration period while refactoring existing code.
     */
    companion object {
        /**
         * Create UploadFlowState from legacy UploadState
         */
        fun fromRecordingState(state: UploadState): UploadFlowState = when (state) {
            is UploadState.NotStarted -> Idle
            is UploadState.Processing -> Preparing(state.progress, state.message)
            is UploadState.Uploading -> when {
                // Both complete - shouldn't happen but handle it
                state.keypointsComplete && state.videoComplete -> UploadingParallel(
                    keypointsProgress = 100,
                    videoProgress = 100,
                    keypointsComplete = true,
                    videoComplete = true,
                    analyzing = state.analyzing
                )
                // Keypoints done, video in progress
                state.keypointsComplete -> UploadingVideo(
                    progress = state.videoProgress,
                    keypointsComplete = true
                )
                // Keypoints in progress
                state.keypointsProgress > 0 -> UploadingKeypoints(progress = state.keypointsProgress)
                // Parallel upload
                else -> UploadingParallel(
                    keypointsProgress = state.keypointsProgress,
                    videoProgress = state.videoProgress,
                    keypointsComplete = state.keypointsComplete,
                    videoComplete = state.videoComplete,
                    analyzing = state.analyzing
                )
            }
            is UploadState.Analyzing -> Analyzing(
                progress = state.progress,
                videoProgress = state.videoProgress,
                videoComplete = state.videoComplete
            )
            is UploadState.Completed -> Complete(
                sessionId = state.recordingId ?: "",
                recordingId = state.recordingId
            )
            is UploadState.PartiallyComplete -> PartiallyComplete(
                recordingId = state.recordingId,
                analysisComplete = state.analysisComplete,
                videoComplete = state.videoComplete,
                videoProgress = state.videoProgress
            )
            is UploadState.Failed -> Error(
                message = state.error,
                retryable = false,
                channel = state.channel.toUploadFlowChannel()
            )
        }
    }
}

/**
 * Extension function to convert legacy UploadState.FailedChannel to UploadFlowState.FailedChannel
 */
fun UploadState.FailedChannel.toUploadFlowChannel(): UploadFlowState.FailedChannel = when (this) {
    UploadState.FailedChannel.KEYPOINTS -> UploadFlowState.FailedChannel.KEYPOINTS
    UploadState.FailedChannel.VIDEO -> UploadFlowState.FailedChannel.VIDEO
    UploadState.FailedChannel.ANALYSIS -> UploadFlowState.FailedChannel.ANALYSIS
    UploadState.FailedChannel.UNKNOWN -> UploadFlowState.FailedChannel.UNKNOWN
}

// ============================================================================
// DATA MODELS & UTILITIES
// ============================================================================

/**
 * RequestBody wrapper that reports upload progress
 * Optimized for fast uploads with throttled progress updates
 */
class ProgressRequestBody(
    private val file: File,
    private val contentType: MediaType?,
    private val onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit
) : RequestBody() {

    override fun contentType(): MediaType? = contentType

    override fun contentLength(): Long = file.length()

    @Throws(IOException::class)
    override fun writeTo(sink: BufferedSink) {
        val fileLength = file.length()
        val buffer = ByteArray(BUFFER_SIZE)
        val inputStream = file.inputStream()

        try {
            var uploaded: Long = 0
            var read: Int
            var lastProgressUpdate: Long = 0

            while (inputStream.read(buffer).also { read = it } != -1) {
                uploaded += read
                sink.write(buffer, 0, read)

                // Only update progress every 100ms or 100KB to avoid UI overhead
                val now = System.currentTimeMillis()
                if (now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL_MS || uploaded >= fileLength) {
                    onProgress(uploaded, fileLength)
                    lastProgressUpdate = now
                }
            }

            // Ensure final progress is reported
            onProgress(uploaded, fileLength)
        } finally {
            inputStream.close()
        }
    }

    companion object {
        // Larger buffer = faster upload (fewer system calls)
        private const val BUFFER_SIZE = 65536 // 64KB chunks for fast upload

        // Throttle progress updates to reduce UI overhead
        private const val PROGRESS_UPDATE_INTERVAL_MS = 100L // Update every 100ms max
    }
}

/**
 * Session info for list display
 */
data class SessionInfo(
    val sessionId: String,
    val directory: String,
    val hasKeypoints: Boolean,
    val hasVideo: Boolean,
    val keypointFileSize: Long,
    val videoFileSize: Long,
    val createdAt: Long
)

// ============================================================================
// RECORDER BASE & IMPLEMENTATIONS
// ============================================================================

/**
 * Abstract base class for keypoint recorders
 *
 * Provides shared functionality for recording hand landmarks including:
 * - Thread-safe recording state management
 * - Common frame processing and routing logic
 * - Handedness detection and confidence extraction
 * - Lifecycle management (initialize, record, finalize, cleanup)
 * - Error handling and logging
 *
 * Implementations must provide format-specific write logic.
 */
abstract class BaseKeypointRecorder(protected val context: Context) {

    protected var sessionDir: File? = null

    @Volatile
    protected var isRecording = false
    protected val recordLock = Any()

    protected var frameCount = 0
    protected val startTimeMs = System.currentTimeMillis()

    companion object {
        const val NUM_LANDMARKS = 21

        /**
         * Extract handedness label from MediaPipe result
         */
        fun getHandedness(
            handednesses: List<List<com.google.mediapipe.tasks.components.containers.Category>>?,
            handIndex: Int
        ): String {
            return if (handednesses != null && handIndex < handednesses.size) {
                val categoryList = handednesses[handIndex]
                if (categoryList.isNotEmpty()) {
                    categoryList[0].categoryName()
                } else {
                    "Unknown"
                }
            } else {
                "Unknown"
            }
        }

        /**
         * Extract confidence score from MediaPipe result
         */
        fun getConfidence(
            handednesses: List<List<com.google.mediapipe.tasks.components.containers.Category>>?,
            handIndex: Int
        ): Float {
            return if (handednesses != null && handIndex < handednesses.size) {
                val categoryList = handednesses[handIndex]
                if (categoryList.isNotEmpty()) {
                    categoryList[0].score()
                } else {
                    0.0f
                }
            } else {
                0.0f
            }
        }
    }

    /**
     * Initialize recorder with session directory
     * Implementations must set up their format-specific writers/workbooks
     */
    abstract fun doInitialize(sessionDir: File)

    /**
     * Write a single hand's data in format-specific way
     */
    protected abstract fun writeHandData(
        handIndex: Int,
        frameNumber: Long,
        timestampMs: Long,
        handedness: String,
        confidence: Float,
        landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>
    )

    /**
     * Finalize and close format-specific writer/workbook
     * @return The output file
     */
    protected abstract fun doFinalize(): File

    /**
     * Get tag for logging (e.g., "CsvKeypointRecorder")
     */
    protected abstract fun getTag(): String

    /**
     * Initialize recorder
     */
    fun initialize(sessionDir: File) {
        this.sessionDir = sessionDir

        try {
            doInitialize(sessionDir)
            frameCount = 0
            isRecording = true
            Log.i(getTag(), "Recorder initialized: ${sessionDir.absolutePath}")
        } catch (e: Exception) {
            Log.e(getTag(), "Failed to initialize recorder", e)
            throw e
        }
    }

    /**
     * Record a frame - dispatches to format-specific writer
     *
     * @param result HandLandmarkerResult containing detected hands
     * @param frameNumber Current frame number
     */
    fun recordFrame(result: HandLandmarkerResult, frameNumber: Long) {
        // Early exit if not recording
        if (!isRecording) {
            return
        }

        try {
            val timestampMs = System.currentTimeMillis() - startTimeMs

            val handLandmarks = result.landmarks()
            val handednesses = result.handednesses()

            if (handLandmarks.isEmpty()) {
                return  // No hands detected
            }

            // Write each detected hand
            synchronized(recordLock) {
                // Double-check recording status inside lock
                if (!isRecording) {
                    return
                }

                for (handIndex in handLandmarks.indices) {
                    val landmarks = handLandmarks[handIndex]
                    val handedness = getHandedness(handednesses, handIndex)
                    val confidence = getConfidence(handednesses, handIndex)

                    writeHandData(
                        handIndex,
                        frameNumber,
                        timestampMs,
                        handedness,
                        confidence,
                        landmarks
                    )

                    frameCount++
                }
            }

        } catch (e: Exception) {
            Log.e(getTag(), "Failed to record frame $frameNumber", e)
        }
    }

    /**
     * Finalize recording and return the output file
     */
    fun finalize(): File {
        if (sessionDir == null) {
            throw IllegalStateException("Recorder not initialized")
        }

        try {
            // Stop recording first
            isRecording = false
            Log.i(getTag(), "Recording stopped, flushing data...")

            // Wait for pending writes
            Thread.sleep(50)

            synchronized(recordLock) {
                val outputFile = doFinalize()
                val fileSizeKb = outputFile.length() / 1024

                Log.i(getTag(), "File written: ${outputFile.absolutePath}")
                Log.i(getTag(), "Total frames: $frameCount, File size: ${fileSizeKb}KB")

                return outputFile
            }

        } catch (e: Exception) {
            Log.e(getTag(), "Failed to finalize recording", e)
            throw e
        }
    }

    /**
     * Release resources (call in case of error)
     */
    open fun release() {
        try {
            isRecording = false
        } catch (e: Exception) {
            Log.e(getTag(), "Error releasing recorder", e)
        }
    }

    /**
     * Cleanup - alias for release()
     */
    fun cleanup() {
        release()
    }

    /**
     * Get frame counts - default implementation returns total count
     * Subclasses can override for hand-specific counts
     */
    open fun getFrameCounts(): Pair<Int, Int> {
        return Pair(frameCount, frameCount)
    }
}

/**
 * HIGH-PERFORMANCE CSV recorder for hand landmarks
 *
 * PERFORMANCE COMPARISON:
 * - Excel (POI): Creates 80,400 objects in memory for 20-sec recording → SLOW, laggy
 * - CSV (this): Streams data directly to file → FAST, smooth 60 FPS
 *
 * File Format: keypoints.csv
 * Columns: frame,timestamp,hand,confidence,landmark_0_x,landmark_0_y,landmark_0_z,...,landmark_20_x,landmark_20_y,landmark_20_z
 */
class CsvKeypointRecorder(context: Context) : BaseKeypointRecorder(context) {

    private var writer: BufferedWriter? = null

    companion object {
        private const val TAG = "CsvKeypointRecorder"
        private const val BUFFER_SIZE = 65536  // 64KB buffer for batch writes
    }

    override fun getTag(): String = TAG

    /**
     * Initialize CSV file with header row
     */
    override fun doInitialize(sessionDir: File) {
        val csvFile = File(sessionDir, "keypoints.csv")

        // Create buffered writer for fast writes
        writer = BufferedWriter(FileWriter(csvFile), BUFFER_SIZE)

        // Write header row
        val header = buildString {
            append("frame,timestamp")
            append(",hand,confidence")

            // Landmark columns
            for (i in 0 until NUM_LANDMARKS) {
                append(",landmark_${i}_x")
                append(",landmark_${i}_y")
                append(",landmark_${i}_z")
            }
        }

        writer?.write(header)
        writer?.newLine()

        Log.i(TAG, "CSV recorder initialized: ${csvFile.absolutePath}")
    }

    /**
     * Write hand data as CSV row - HIGH PERFORMANCE streaming write
     */
    override fun writeHandData(
        handIndex: Int,
        frameNumber: Long,
        timestampMs: Long,
        handedness: String,
        confidence: Float,
        landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>
    ) {
        val timestampSec = timestampMs / 1000.0

        // Build CSV row as string (FAST - no object creation)
        val row = buildString {
            append(frameNumber)
            append(",")
            append(String.format("%.3f", timestampSec))
            append(",")
            append(handedness)
            append(",")
            append(String.format("%.4f", confidence))

            // Landmark coordinates
            for (landmark in landmarks) {
                append(",")
                append(String.format("%.6f", landmark.x()))
                append(",")
                append(String.format("%.6f", landmark.y()))
                append(",")
                append(String.format("%.6f", landmark.z()))
            }
        }

        // Write to file (buffered, so batched to disk)
        writer?.write(row)
        writer?.newLine()
    }

    /**
     * Finalize CSV file - flush and close
     */
    override fun doFinalize(): File {
        if (writer == null || sessionDir == null) {
            throw IllegalStateException("CSV writer not initialized")
        }

        // Flush and close writer
        writer?.flush()
        writer?.close()
        writer = null

        return File(sessionDir, "keypoints.csv")
    }

    /**
     * Release resources (call in case of error)
     */
    override fun release() {
        super.release()
        try {
            writer?.close()
            writer = null
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing CSV writer", e)
        }
    }
}

/**
 * Records hand landmarks to Excel file with separate sheets for Left and Right hands.
 *
 * Excel Structure:
 * - Sheet 1: "Left Hand" - All left hand detections
 * - Sheet 2: "Right Hand" - All right hand detections
 *
 * Each row contains:
 * timestamp_ms | frame_number | handedness | confidence | landmark_0_x | landmark_0_y | landmark_0_z | ... | landmark_20_x | landmark_20_y | landmark_20_z
 */
class ExcelKeypointRecorder(context: Context) : BaseKeypointRecorder(context) {

    private var workbook: XSSFWorkbook? = null
    private var leftHandSheet: org.apache.poi.ss.usermodel.Sheet? = null
    private var rightHandSheet: org.apache.poi.ss.usermodel.Sheet? = null

    private var leftHandRowNum = 1  // Row 0 is header
    private var rightHandRowNum = 1

    private var leftHandFrameCount = 0
    private var rightHandFrameCount = 0

    companion object {
        private const val TAG = "ExcelKeypointRecorder"
        private const val LEFT_HAND_SHEET = "Left Hand"
        private const val RIGHT_HAND_SHEET = "Right Hand"
    }

    override fun getTag(): String = TAG

    /**
     * Initialize Excel workbook with 2 sheets and header rows
     */
    override fun doInitialize(sessionDir: File) {
        // Create new workbook
        workbook = XSSFWorkbook()

        // Create Left Hand sheet
        leftHandSheet = workbook?.createSheet(LEFT_HAND_SHEET)
        createHeaderRow(leftHandSheet!!)

        // Create Right Hand sheet
        rightHandSheet = workbook?.createSheet(RIGHT_HAND_SHEET)
        createHeaderRow(rightHandSheet!!)

        // Reset counters
        leftHandRowNum = 1
        rightHandRowNum = 1
        leftHandFrameCount = 0
        rightHandFrameCount = 0

        Log.i(TAG, "Excel workbook initialized with 2 sheets")
    }

    /**
     * Create header row for a sheet
     */
    private fun createHeaderRow(sheet: org.apache.poi.ss.usermodel.Sheet) {
        val headerRow = sheet.createRow(0)
        var colNum = 0

        // Basic columns
        headerRow.createCell(colNum++, CellType.STRING).setCellValue("timestamp_ms")
        headerRow.createCell(colNum++, CellType.STRING).setCellValue("frame_number")
        headerRow.createCell(colNum++, CellType.STRING).setCellValue("handedness")
        headerRow.createCell(colNum++, CellType.STRING).setCellValue("confidence")

        // Landmark columns (21 landmarks × 3 coordinates)
        for (i in 0 until NUM_LANDMARKS) {
            headerRow.createCell(colNum++, CellType.STRING).setCellValue("landmark_${i}_x")
            headerRow.createCell(colNum++, CellType.STRING).setCellValue("landmark_${i}_y")
            headerRow.createCell(colNum++, CellType.STRING).setCellValue("landmark_${i}_z")
        }
    }

    /**
     * Write hand data to appropriate sheet based on handedness
     */
    override fun writeHandData(
        handIndex: Int,
        frameNumber: Long,
        timestampMs: Long,
        handedness: String,
        confidence: Float,
        landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>
    ) {
        if (workbook == null) {
            Log.w(TAG, "Workbook not initialized, skipping frame")
            return
        }

        // Route to correct sheet
        when (handedness) {
            "Left" -> {
                writeToSheet(leftHandSheet!!, leftHandRowNum++, timestampMs, frameNumber, handedness, confidence, landmarks)
                leftHandFrameCount++
            }
            "Right" -> {
                writeToSheet(rightHandSheet!!, rightHandRowNum++, timestampMs, frameNumber, handedness, confidence, landmarks)
                rightHandFrameCount++
            }
            else -> {
                Log.w(TAG, "Unknown handedness at frame $frameNumber")
            }
        }
    }

    /**
     * Write hand data to a specific sheet row
     */
    private fun writeToSheet(
        sheet: org.apache.poi.ss.usermodel.Sheet,
        rowNum: Int,
        timestampMs: Long,
        frameNumber: Long,
        handedness: String,
        confidence: Float,
        landmarks: List<com.google.mediapipe.tasks.components.containers.NormalizedLandmark>
    ) {
        val row = sheet.createRow(rowNum)
        var colNum = 0

        // Basic data
        row.createCell(colNum++, CellType.NUMERIC).setCellValue(timestampMs.toDouble())
        row.createCell(colNum++, CellType.NUMERIC).setCellValue(frameNumber.toDouble())
        row.createCell(colNum++, CellType.STRING).setCellValue(handedness)
        row.createCell(colNum++, CellType.NUMERIC).setCellValue(confidence.toDouble())

        // Landmark coordinates
        for (landmark in landmarks) {
            row.createCell(colNum++, CellType.NUMERIC).setCellValue(landmark.x().toDouble())
            row.createCell(colNum++, CellType.NUMERIC).setCellValue(landmark.y().toDouble())
            row.createCell(colNum++, CellType.NUMERIC).setCellValue(landmark.z().toDouble())
        }
    }

    /**
     * Finalize and write Excel file to disk
     */
    override fun doFinalize(): File {
        if (workbook == null || sessionDir == null) {
            throw IllegalStateException("Workbook not initialized")
        }

        val excelFile = File(sessionDir, "keypoints.xlsx")

        // Write workbook to file
        FileOutputStream(excelFile).use { fileOut ->
            workbook?.write(fileOut)
        }

        // Close workbook
        workbook?.close()
        workbook = null

        Log.i(TAG, "Left hand frames: $leftHandFrameCount, Right hand frames: $rightHandFrameCount")

        return excelFile
    }

    /**
     * Get current frame counts for each hand
     */
    override fun getFrameCounts(): Pair<Int, Int> {
        return Pair(leftHandFrameCount, rightHandFrameCount)
    }

    /**
     * Clean up resources
     */
    override fun release() {
        super.release()
        try {
            Thread.sleep(50)  // Brief wait for in-flight frames
            workbook?.close()
            workbook = null
        } catch (e: Exception) {
            Log.w(TAG, "Error during cleanup", e)
        }
    }
}

/**
 * Factory for creating appropriate KeypointRecorder based on format configuration
 *
 * Supported formats:
 * - "csv" - High-performance CSV format (recommended for 60 FPS recording)
 * - "excel" - Excel format with separate sheets per hand (slower, use for analysis)
 */
object KeypointRecorderFactory {

    enum class Format {
        CSV,
        EXCEL;

        companion object {
            fun fromString(format: String): Format {
                return when (format.lowercase()) {
                    "csv" -> CSV
                    "excel", "xlsx" -> EXCEL
                    else -> CSV  // Default to CSV for best performance
                }
            }
        }
    }

    /**
     * Create a recorder based on format string
     *
     * @param context Android context
     * @param format Format string ("csv" or "excel")
     * @return Appropriate BaseKeypointRecorder implementation
     */
    fun create(context: Context, format: String): BaseKeypointRecorder {
        return create(context, Format.fromString(format))
    }

    /**
     * Create a recorder based on Format enum
     *
     * @param context Android context
     * @param format Format enum value
     * @return Appropriate BaseKeypointRecorder implementation
     */
    fun create(context: Context, format: Format): BaseKeypointRecorder {
        return when (format) {
            Format.CSV -> CsvKeypointRecorder(context)
            Format.EXCEL -> ExcelKeypointRecorder(context)
        }
    }

    /**
     * Get recommended format based on recording requirements
     *
     * @param highPerformance If true, prioritizes performance (returns CSV)
     * @param separateSheets If true, prioritizes separate hand sheets (returns Excel)
     * @return Recommended format
     */
    fun getRecommendedFormat(highPerformance: Boolean = true, separateSheets: Boolean = false): Format {
        return when {
            highPerformance -> Format.CSV
            separateSheets -> Format.EXCEL
            else -> Format.CSV  // Default to high performance
        }
    }
}

/**
 * Records screen display using Android MediaProjection API.
 *
 * Captures entire screen including:
 * - Camera preview
 * - GPU overlay (hand skeleton)
 * - Frame counter UI
 * - All other UI elements
 *
 * Output:
 * - Format: MP4 (H.264 codec)
 * - Resolution: 1280×720
 * - Frame Rate: 30 FPS
 * - Bitrate: 4 Mbps
 *
 * Usage:
 * 1. Request permission: val intent = requestPermission()
 * 2. Launch intent: startActivityForResult(intent, REQUEST_CODE)
 * 3. In onActivityResult: initialize(resultCode, data)
 * 4. Start recording: startRecording(outputFile)
 * 5. Stop recording: stopRecording()
 */
@SuppressLint("WrongConstant")
class ScreenCaptureRecorder(private val context: Context) {

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaCodec: MediaCodec? = null
    private var mediaMuxer: MediaMuxer? = null

    private var videoTrackIndex = -1
    private var muxerStarted = false
    private val isRecording = AtomicBoolean(false)
    private var encoderThread: Thread? = null

    // Screen dimensions
    private var screenWidth = 1280
    private var screenHeight = 720
    private var screenDensityDpi = DisplayMetrics.DENSITY_HIGH

    // Permission persistence
    private val sharedPrefs by lazy {
        context.getSharedPreferences("screen_capture_prefs", Context.MODE_PRIVATE)
    }

    companion object {
        private const val TAG = "ScreenCaptureRecorder"
        const val REQUEST_CODE_SCREEN_CAPTURE = 1001

        // Video encoding settings
        private const val MIME_TYPE = "video/avc"
        private const val FRAME_RATE = 30
        private const val IFRAME_INTERVAL = 1
        private const val BIT_RATE = 4_000_000  // 4 Mbps
        private const val TIMEOUT_US = 10000L

        // Persistence keys
        private const val PREF_KEY_PERMISSION_GRANTED = "permission_granted_once"
    }

    init {
        mediaProjectionManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        // Get actual screen dimensions
        val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val displayMetrics = DisplayMetrics()
        windowManager.defaultDisplay.getMetrics(displayMetrics)
        screenDensityDpi = displayMetrics.densityDpi
    }

    /**
     * Request screen capture permission from user.
     *
     * @return Intent that should be launched with startActivityForResult
     */
    fun requestPermission(): Intent {
        return mediaProjectionManager!!.createScreenCaptureIntent()
    }

    /**
     * Check if screen capture permission was granted before.
     *
     * @return true if user has granted permission at least once
     */
    fun wasPermissionGrantedBefore(): Boolean {
        val granted = sharedPrefs.getBoolean(PREF_KEY_PERMISSION_GRANTED, false)
        Log.d(TAG, "Permission previously granted: $granted")
        return granted
    }

    /**
     * Mark that screen capture permission was granted.
     * This persists across app restarts to avoid repeated permission prompts.
     */
    private fun markPermissionGranted() {
        sharedPrefs.edit().putBoolean(PREF_KEY_PERMISSION_GRANTED, true).apply()
        Log.i(TAG, "Permission grant status persisted")
    }

    /**
     * Initialize with permission result from onActivityResult.
     *
     * @param resultCode Result code from onActivityResult
     * @param data Intent data from onActivityResult
     */
    fun initialize(resultCode: Int, data: Intent?) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            throw IllegalStateException("Screen capture permission denied")
        }

        mediaProjection = mediaProjectionManager!!.getMediaProjection(resultCode, data)

        // Persist permission grant for future use
        markPermissionGranted()

        Log.i(TAG, "MediaProjection initialized and permission persisted")
    }

    /**
     * Start screen recording.
     *
     * @param outputFile File to write screen recording to
     * @return true if started successfully
     */
    fun startRecording(outputFile: File): Boolean {
        if (isRecording.get()) {
            Log.w(TAG, "Already recording")
            return false
        }

        if (mediaProjection == null) {
            Log.e(TAG, "MediaProjection not initialized - call initialize() first")
            return false
        }

        try {
            // Create MediaMuxer
            mediaMuxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

            // Create MediaCodec
            val format = MediaFormat.createVideoFormat(MIME_TYPE, screenWidth, screenHeight)
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            format.setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            format.setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, IFRAME_INTERVAL)

            mediaCodec = MediaCodec.createEncoderByType(MIME_TYPE)
            mediaCodec?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

            // Get input surface from MediaCodec
            val inputSurface: Surface = mediaCodec!!.createInputSurface()

            // Start MediaCodec
            mediaCodec?.start()

            // Create VirtualDisplay
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "HandPoseScreenCapture",
                screenWidth,
                screenHeight,
                screenDensityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                inputSurface,
                null,
                null
            )

            isRecording.set(true)
            videoTrackIndex = -1
            muxerStarted = false

            // Start encoder thread to drain output
            encoderThread = Thread({ drainEncoder() }, "ScreenCaptureEncoderThread")
            encoderThread?.start()

            Log.i(TAG, "Screen recording started: ${outputFile.absolutePath}")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start screen recording", e)
            release()
            return false
        }
    }

    /**
     * Stop screen recording.
     */
    fun stopRecording() {
        if (!isRecording.get()) {
            return
        }

        Log.i(TAG, "Stopping screen recording")
        isRecording.set(false)

        // Wait for encoder thread to finish
        encoderThread?.join(3000)

        // Release resources
        release()

        Log.i(TAG, "Screen recording stopped")
    }

    /**
     * Check if currently recording.
     */
    fun isRecording(): Boolean {
        return isRecording.get()
    }

    /**
     * Drain encoder output and write to muxer.
     */
    private fun drainEncoder() {
        val bufferInfo = MediaCodec.BufferInfo()

        while (isRecording.get() || hasEncoderOutput()) {
            try {
                val encoderStatus = mediaCodec?.dequeueOutputBuffer(bufferInfo, TIMEOUT_US) ?: continue

                when {
                    encoderStatus == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                        // No output available yet
                        if (!isRecording.get()) {
                            break  // Exit if not recording
                        }
                    }
                    encoderStatus == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                        // Output format changed - add track to muxer
                        if (muxerStarted) {
                            throw RuntimeException("Format changed after muxer started")
                        }

                        val newFormat = mediaCodec?.outputFormat
                        videoTrackIndex = mediaMuxer?.addTrack(newFormat!!) ?: -1
                        mediaMuxer?.start()
                        muxerStarted = true
                        Log.i(TAG, "MediaMuxer started, videoTrackIndex: $videoTrackIndex")
                    }
                    encoderStatus >= 0 -> {
                        // Valid output buffer
                        val encodedData: ByteBuffer? = mediaCodec?.getOutputBuffer(encoderStatus)

                        if (encodedData == null) {
                            throw RuntimeException("Encoder output buffer was null")
                        }

                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                            // Codec config data - don't write to muxer
                            bufferInfo.size = 0
                        }

                        if (bufferInfo.size != 0) {
                            if (!muxerStarted) {
                                throw RuntimeException("Muxer not started")
                            }

                            // Adjust buffer position
                            encodedData.position(bufferInfo.offset)
                            encodedData.limit(bufferInfo.offset + bufferInfo.size)

                            // Write to muxer
                            mediaMuxer?.writeSampleData(videoTrackIndex, encodedData, bufferInfo)
                        }

                        mediaCodec?.releaseOutputBuffer(encoderStatus, false)

                        if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                            // End of stream
                            break
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error draining encoder", e)
                break
            }
        }
    }

    /**
     * Check if encoder has remaining output.
     */
    private fun hasEncoderOutput(): Boolean {
        return mediaCodec != null && muxerStarted
    }

    /**
     * Release all resources.
     */
    private fun release() {
        try {
            // Stop VirtualDisplay
            virtualDisplay?.release()
            virtualDisplay = null

            // Signal end of stream and stop encoder
            mediaCodec?.signalEndOfInputStream()
            Thread.sleep(100)  // Give encoder time to flush

            mediaCodec?.stop()
            mediaCodec?.release()
            mediaCodec = null

            // Stop muxer
            if (muxerStarted) {
                try {
                    mediaMuxer?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping muxer", e)
                }
            }
            mediaMuxer?.release()
            mediaMuxer = null

            // Stop MediaProjection
            mediaProjection?.stop()
            mediaProjection = null

        } catch (e: Exception) {
            Log.e(TAG, "Error releasing resources", e)
        }
    }
}

// ============================================================================
// REPOSITORY LAYER
// ============================================================================

/**
 * Repository for managing clinical assessment protocols.
 * Handles fetching from backend API with in-memory caching.
 *
 * NOTE: No fallback protocols - if backend has no protocols, user selects "None"
 */
@Singleton
class ProtocolRepository @Inject constructor(
    private val recordingService: RecordingService
) {
    companion object {
        private const val TAG = "ProtocolRepository"
        private const val CACHE_DURATION_MS = 24 * 60 * 60 * 1000L // 24 hours
    }

    // In-memory cache
    private var cachedProtocols: List<Protocol>? = null
    private var cacheTimestamp: Long = 0

    // Loading state
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    // Error state
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    /**
     * Get protocols with caching support.
     *
     * @param forceRefresh If true, bypass cache and fetch from network
     * @return List of protocols (from network or cache). Empty list if no protocols exist.
     *
     * Behavior:
     * - Network success with protocols → return protocols
     * - Network success with empty list → return empty list (user selects "None")
     * - Network failure with cache → return cached protocols
     * - Network failure without cache → return empty list (user selects "None")
     */
    suspend fun getProtocols(forceRefresh: Boolean = false): List<Protocol> {
        return withContext(Dispatchers.IO) {
            _error.value = null

            // Check cache validity
            val cacheValid = !forceRefresh &&
                cachedProtocols != null &&
                (System.currentTimeMillis() - cacheTimestamp) < CACHE_DURATION_MS

            if (cacheValid) {
                Log.d(TAG, "Returning ${cachedProtocols!!.size} cached protocols")
                return@withContext cachedProtocols!!
            }

            // Try to fetch from network
            _isLoading.value = true
            try {
                val response = recordingService.getProtocols()

                if (response.isSuccessful && response.body()?.success == true) {
                    val protocols = response.body()?.protocols ?: emptyList()

                    // Update cache - even empty list is valid (means backend has no protocols)
                    cachedProtocols = protocols
                    cacheTimestamp = System.currentTimeMillis()

                    Log.i(TAG, "Fetched ${protocols.size} protocols from server")
                    _isLoading.value = false
                    // Return whatever the backend returned (including empty list)
                    return@withContext protocols
                } else {
                    val errorMsg = response.body()?.error ?: response.message() ?: "Unknown error"
                    Log.w(TAG, "Failed to fetch protocols: $errorMsg")
                    _error.value = errorMsg
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error fetching protocols", e)
                _error.value = "Network error: ${e.message}"
            }

            _isLoading.value = false

            // Network failed - return cached protocols if available
            if (cachedProtocols != null) {
                Log.d(TAG, "Returning ${cachedProtocols!!.size} cached protocols (network failed)")
                return@withContext cachedProtocols!!
            }

            // No cache and network failed - return empty list
            // User will see "None" option in the UI
            Log.w(TAG, "No protocols available - user will select None")
            return@withContext emptyList()
        }
    }

    /**
     * Get a specific protocol by ID.
     */
    suspend fun getProtocolById(id: String): Protocol? {
        val protocols = getProtocols()
        return protocols.find { it.id == id }
    }

    /**
     * Clear the protocol cache.
     */
    fun clearCache() {
        cachedProtocols = null
        cacheTimestamp = 0
        Log.d(TAG, "Protocol cache cleared")
    }

    /**
     * Check if protocols are available from the backend.
     * Returns true if we have protocols (either from network or cache).
     */
    fun hasProtocols(): Boolean {
        return cachedProtocols?.isNotEmpty() == true
    }
}

// ============================================================================
// SERVICE LAYER
// ============================================================================

interface RecordingService {

    // ============================================================================
    // PARALLEL UPLOAD ENDPOINTS (Recommended)
    // ============================================================================

    /**
     * Upload keypoints CSV and metadata - Priority Channel
     * This triggers analysis immediately without waiting for video
     * Endpoint: POST /api/mobile/keypoints
     */
    @Multipart
    @POST("/api/mobile/keypoints")
    suspend fun uploadKeypoints(
        @Part("session_id") sessionId: RequestBody,
        @Part("patient_id") patientId: RequestBody,
        @Part keypoints: MultipartBody.Part,
        @Part metadata: MultipartBody.Part?
    ): Response<KeypointsUploadResponse>

    /**
     * Upload video file - Background Channel
     * Can be called after keypoints upload, doesn't block analysis
     * Endpoint: POST /api/mobile/video
     */
    @Multipart
    @POST("/api/mobile/video")
    suspend fun uploadVideo(
        @Part("session_id") sessionId: RequestBody,
        @Part video: MultipartBody.Part
    ): Response<VideoUploadResponse>

    /**
     * Get detailed session status including both upload channels and analysis progress
     * Endpoint: GET /api/mobile/session/{sessionId}
     */
    @GET("/api/mobile/session/{sessionId}")
    suspend fun getSessionStatus(
        @Path("sessionId") sessionId: String
    ): Response<SessionStatusResponse>

    // ============================================================================
    // LEGACY UNIFIED UPLOAD (Backward Compatibility)
    // ============================================================================

    /**
     * Upload a completed recording from mobile app (unified upload)
     * Endpoint: POST /api/mobile/upload (no authentication required)
     * @deprecated Use uploadKeypoints() and uploadVideo() for parallel upload
     */
    @Multipart
    @POST("/api/mobile/upload")
    suspend fun uploadRecording(
        @Part("session_id") sessionId: RequestBody,
        @Part("patient_id") patientId: RequestBody,
        @Part video: MultipartBody.Part?,
        @Part keypoints: MultipartBody.Part?
    ): Response<RecordingResponse>

    // ============================================================================
    // PROTOCOL SYNC ENDPOINTS
    // ============================================================================

    /**
     * Get available protocols for recording sessions
     * Returns public, active protocols from the backend
     * Endpoint: GET /api/mobile/protocols
     */
    @GET("/api/mobile/protocols")
    suspend fun getProtocols(): Response<ProtocolsResponse>

    // ============================================================================
    // OTHER ENDPOINTS
    // ============================================================================

    /**
     * Get all recordings for a specific patient
     */
    suspend fun getPatientRecordings(patientId: String): Response<RecordingsResponse>

    /**
     * Delete a recording by ID
     */
    suspend fun deleteRecording(recordingId: String): Response<BaseResponse>

    /**
     * Get a pre-signed URL for downloading a recording video
     */
    suspend fun getVideoDownloadUrl(recordingId: String): Response<Map<String, String>>

    /**
     * Get downloadable files for a recording with signed URLs
     * Endpoint: GET /api/recordings/{id}/files
     */
    @GET("/api/recordings/{id}/files")
    suspend fun getRecordingFiles(
        @Path("id") recordingId: String
    ): Response<RecordingFilesResponse>
}

// ============================================================================
// RESPONSE DATA CLASSES
// ============================================================================

/**
 * Response from keypoints upload endpoint
 */
data class KeypointsUploadResponse(
    val success: Boolean,
    val recordingId: String?,
    val sessionId: String?,
    val status: String?,          // "analyzing"
    val message: String?,
    val uploadedAt: String?,
    val files: FilesStatus?
)

/**
 * Response from video upload endpoint
 */
data class VideoUploadResponse(
    val success: Boolean,
    val sessionId: String?,
    val recordingId: String?,
    val videoPath: String?,
    val uploadedAt: String?,
    val status: String?,
    val message: String?,
    val error: String?
)

/**
 * Response from session status endpoint
 */
data class SessionStatusResponse(
    val success: Boolean,
    val session: SessionStatus?,
    val error: String?
)

data class SessionStatus(
    val recordingId: String,
    val sessionId: String,
    val status: String,
    val createdAt: String?,
    val updatedAt: String?,
    val uploads: UploadsStatus?,
    val analysis: AnalysisStatus?
)

data class UploadsStatus(
    val keypoints: UploadChannelStatus?,
    val video: UploadChannelStatus?,
    val metadata: MetadataStatus?
)

data class UploadChannelStatus(
    val uploaded: Boolean,
    val uploadedAt: String?,
    val gcsPath: String?
)

data class MetadataStatus(
    val uploaded: Boolean
)

data class AnalysisStatus(
    val status: String,           // "pending", "processing", "completed", "failed"
    val startedAt: String?,
    val completedAt: String?,
    val progress: Int,
    val error: String?,
    val results: Any?             // Analysis results when complete
)

data class FilesStatus(
    val keypoints: Boolean,
    val metadata: Boolean,
    val video: Boolean
)

// ============================================================================
// PROTOCOL DATA CLASSES
// ============================================================================

/**
 * Response from protocols endpoint
 */
data class ProtocolsResponse(
    val success: Boolean,
    val protocols: List<Protocol>?,
    val syncedAt: String?,
    val error: String?
)

/**
 * Protocol data from backend
 */
data class Protocol(
    val id: String,
    val name: String,
    val description: String?,
    val version: String?,
    val indicatedFor: String?,
    val instructions: String?,
    val isSystem: Boolean
)

// ============================================================================
// RECORDING FILES RESPONSE DATA CLASSES
// ============================================================================

/**
 * Response from recording files endpoint
 */
data class RecordingFilesResponse(
    val success: Boolean,
    val data: RecordingFilesData?,
    val message: String?
)

/**
 * Recording files data with signed URLs
 */
data class RecordingFilesData(
    val recordingId: String,
    val status: String,
    val patientName: String,
    val files: List<RecordingFile>,
    val totalAvailable: Int
)

/**
 * Individual recording file with download URL
 */
data class RecordingFile(
    val type: String,       // "video", "labelled_video", "keypoints", "analysis_xlsx", "report_pdf", "chart_image"
    val name: String,       // Human-readable name
    val url: String?,       // Signed URL for download
    val available: Boolean  // Whether file is available for download
)


// ============================================================================
// VIEWMODEL LAYER
// ============================================================================

@HiltViewModel
class RecordingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val recordingService: RecordingService,
    private val parallelUploadManager: ParallelUploadManager,
    private val protocolRepository: ProtocolRepository,
    private val videoLabelingProcessor: VideoLabelingProcessor
) : ViewModel() {

    // PERFORMANCE: CSV recorder for streaming writes (10x faster than Excel)
    private val csvKeypointRecorder = CsvKeypointRecorder(context)

    // PROFESSIONAL 3-SURFACE ARCHITECTURE: VideoCapture for clean 60 FPS recording
    private var videoCapture: VideoCapture<Recorder>? = null
    private var currentRecording: Recording? = null

    private val _uiState = MutableStateFlow(RecordingUiState())
    val uiState: StateFlow<RecordingUiState> = _uiState.asStateFlow()

    private var timerJob: Job? = null
    private var currentSessionDir: File? = null
    private var onPauseCamera: (() -> Unit)? = null

    // NEW: Frame counter for UI
    private var frameNumber = 0L
    private val _leftHandFrames = MutableStateFlow(0)
    val leftHandFrames: StateFlow<Int> = _leftHandFrames.asStateFlow()
    private val _rightHandFrames = MutableStateFlow(0)
    val rightHandFrames: StateFlow<Int> = _rightHandFrames.asStateFlow()
    private val _totalFrames = MutableStateFlow(0)
    val totalFrames: StateFlow<Int> = _totalFrames.asStateFlow()

    // Detection status - tracks whether MediaPipe is actively processing
    private val _framesAnalyzed = MutableStateFlow(0L)
    val framesAnalyzed: StateFlow<Long> = _framesAnalyzed.asStateFlow()
    private val _isDetecting = MutableStateFlow(false)
    val isDetecting: StateFlow<Boolean> = _isDetecting.asStateFlow()

    // NEW: Elapsed time for frame counter
    private val _elapsedTime = MutableStateFlow(0f)
    val elapsedTime: StateFlow<Float> = _elapsedTime.asStateFlow()

    // Protocol management
    private val _protocols = MutableStateFlow<List<Protocol>>(emptyList())
    val protocols: StateFlow<List<Protocol>> = _protocols.asStateFlow()

    private val _isLoadingProtocols = MutableStateFlow(false)
    val isLoadingProtocols: StateFlow<Boolean> = _isLoadingProtocols.asStateFlow()

    init {
        // Load protocols when ViewModel is created
        loadProtocols()
    }

    companion object {
        private const val TAG = "RecordingViewModel"
    }

    /**
     * Set callback to pause camera during upload (prevents overheating)
     */
    fun setOnPauseCamera(callback: () -> Unit) {
        onPauseCamera = callback
    }

    /**
     * Set VideoCapture instance from CameraManager (3-surface architecture)
     * This enables clean 60 FPS video recording without screen capture
     */
    fun setVideoCapture(videoCaptureInstance: VideoCapture<Recorder>?) {
        videoCapture = videoCaptureInstance
        Log.i(TAG, "VideoCapture instance set from CameraManager")
    }

    /**
     * Set the patient context for recording
     */
    fun setPatientContext(patientId: String, projectId: String?) {
        _uiState.update {
            it.copy(patientId = patientId, projectId = projectId)
        }
        Log.d(TAG, "Patient context set: patientId=$patientId, projectId=$projectId")
    }

    /**
     * Clear the patient context
     */
    fun clearPatientContext() {
        _uiState.update {
            it.copy(patientId = null, projectId = null)
        }
    }

    /**
     * Set grip strength data for the recording
     */
    fun setGripStrengthData(gripData: GripStrengthData) {
        _uiState.update {
            it.copy(gripStrengthData = gripData)
        }
        Log.d(TAG, "Grip strength data set: left=${gripData.leftHandStrength}, right=${gripData.rightHandStrength}, notPossible=${gripData.notPossible}")
    }

    /**
     * Start recording (CSV keypoints @ 60 FPS + clean video @ 30 FPS)
     * PROFESSIONAL 3-SURFACE ARCHITECTURE - No screen recording, direct camera capture
     */
    fun startRecording() {
        viewModelScope.launch {
            try {
                // Get patient context and grip data
                val patientId = _uiState.value.patientId
                val projectId = _uiState.value.projectId
                val gripData = _uiState.value.gripStrengthData

                // Extract protocol info
                val protocolId = gripData?.selectedProtocol?.id
                val protocolName = gripData?.selectedProtocol?.name

                // Extract grip strength values
                val gripLeft = if (gripData?.notPossible == true) null else gripData?.leftHandStrength?.toDoubleOrNull()
                val gripRight = if (gripData?.notPossible == true) null else gripData?.rightHandStrength?.toDoubleOrNull()
                val gripNotPossible = gripData?.notPossible ?: false

                Log.d(TAG, "Starting recording with protocol: $protocolName ($protocolId)")

                // Create session directory
                val sessionId = System.currentTimeMillis().toString()
                currentSessionDir = File(context.filesDir, "session_$sessionId")
                currentSessionDir?.mkdirs()

                // Initialize CSV recorder (60 FPS keypoints)
                csvKeypointRecorder.initialize(currentSessionDir!!)

                // Check VideoCapture availability (from CameraManager 3-surface architecture)
                val videoCapInstance = videoCapture
                if (videoCapInstance == null) {
                    Log.w(TAG, "VideoCapture not available - camera must be started with enableVideoRecording=true")
                    _uiState.update { it.copy(
                        uploadState = UploadState.Failed("Video recording not initialized")
                    )}
                    return@launch
                }

                // Start clean video recording (60 FPS, 720p, no screen overlay)
                val videoFile = File(currentSessionDir, "video.mp4")
                val outputOptions = FileOutputOptions.Builder(videoFile).build()

                currentRecording = videoCapInstance.output
                    .prepareRecording(context, outputOptions)
                    .start(ContextCompat.getMainExecutor(context)) { event ->
                        when (event) {
                            is VideoRecordEvent.Start -> {
                                Log.i(TAG, "✅ VideoCapture recording started - 60 FPS clean camera feed")
                            }
                            is VideoRecordEvent.Finalize -> {
                                if (event.hasError()) {
                                    Log.e(TAG, "VideoCapture error: ${event.error}")
                                } else {
                                    Log.i(TAG, "✅ VideoCapture finalized: ${videoFile.length() / 1024}KB")
                                }
                            }
                            is VideoRecordEvent.Status -> {
                                // Progress updates (optional logging)
                                val stats = event.recordingStats
                                if (stats.numBytesRecorded % (1024 * 1024) == 0L) {
                                    Log.d(TAG, "Recording: ${stats.numBytesRecorded / 1024}KB")
                                }
                            }
                        }
                    }

                // Reset frame counters
                frameNumber = 0L
                _leftHandFrames.value = 0
                _rightHandFrames.value = 0
                _totalFrames.value = 0
                _elapsedTime.value = 0f
                _framesAnalyzed.value = 0L
                _isDetecting.value = false

                // Start timer
                startTimer()

                // Update UI state
                _uiState.update { it.copy(
                    isRecording = true,
                    durationMs = 0
                )}

                Log.i(TAG, "✅ Recording started - CSV keypoints @ 60 FPS + Clean video @ 30 FPS")
                Log.i(TAG, "   - Surface #1: VideoCapture → video.mp4 (720p @ 30 FPS)")
                Log.i(TAG, "   - Surface #2: ImageAnalysis → keypoints.csv (60 FPS)")
                Log.i(TAG, "   - Surface #3: Preview → User display")

            } catch (e: Exception) {
                Log.e(TAG, "Failed to start recording", e)
                csvKeypointRecorder.cleanup()
                currentRecording?.stop()
                currentRecording = null
                _uiState.update { it.copy(
                    isRecording = false,
                    uploadState = UploadState.Failed("Failed to start: ${e.message}")
                )}
            }
        }
    }

    /**
     * Stop recording and finalize files
     * PROFESSIONAL 3-SURFACE ARCHITECTURE - Stop clean video + CSV keypoints
     */
    fun stopRecording() {
        viewModelScope.launch {
            try {
                Log.i(TAG, "Stopping recording...")

                // Stop clean video recording (VideoCapture)
                currentRecording?.stop()
                currentRecording = null

                // Finalize CSV file
                val csvFile = csvKeypointRecorder.finalize()

                // Stop timer
                stopTimer()

                // Verify files exist
                val videoFile = File(currentSessionDir, "video.mp4")
                if (!videoFile.exists() || !csvFile.exists()) {
                    throw Exception("Recording files not found after stop")
                }

                val durationMs = (_elapsedTime.value * 1000).toLong()

                Log.i(TAG, "✅ Recording stopped - Video: ${videoFile.length() / 1024}KB, CSV: ${csvFile.length() / 1024}KB")
                Log.i(TAG, "   Frame counts - Left: ${_leftHandFrames.value}, Right: ${_rightHandFrames.value}, Total: ${_totalFrames.value}")
                Log.i(TAG, "   Duration: ${formatDuration(durationMs)}")

                // Create session metadata for the completed recording
                val gripData = _uiState.value.gripStrengthData
                val sessionMetadata = SessionMetadata(
                    sessionId = currentSessionDir?.name ?: "unknown",
                    startTime = System.currentTimeMillis() - durationMs,
                    endTime = System.currentTimeMillis(),
                    deviceModel = Build.MODEL,
                    deviceBrand = Build.MANUFACTURER,
                    imageWidth = 640,  // Default camera resolution
                    imageHeight = 480,
                    totalFrames = _totalFrames.value.toLong(),
                    patientId = _uiState.value.patientId,
                    projectId = _uiState.value.projectId,
                    protocolId = gripData?.selectedProtocol?.id,
                    protocolName = gripData?.selectedProtocol?.name,
                    gripStrengthLeft = gripData?.leftHandStrength?.toDoubleOrNull(),
                    gripStrengthRight = gripData?.rightHandStrength?.toDoubleOrNull(),
                    gripStrengthNotPossible = gripData?.notPossible ?: false
                )

                Log.i(TAG, "   Created session metadata: ${sessionMetadata.sessionId}, frames: ${sessionMetadata.totalFrames}")

                // Update UI state with completed session
                _uiState.update { it.copy(
                    isRecording = false,
                    durationMs = durationMs,
                    durationFormatted = formatDuration(durationMs),
                    lastCompletedSession = sessionMetadata
                )}

            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop recording", e)
                csvKeypointRecorder.cleanup()
                currentRecording?.stop()
                currentRecording = null
                _uiState.update { it.copy(
                    isRecording = false,
                    uploadState = UploadState.Failed("Failed to stop: ${e.message}")
                )}
            }
        }
    }

    /**
     * Toggle recording state
     */
    fun toggleRecording() {
        if (_uiState.value.isRecording) {
            stopRecording()
        } else {
            startRecording()
        }
    }

    /**
     * Submit the recorded session (upload to backend)
     * Uses parallel upload if enabled, otherwise falls back to unified upload
     */
    fun submitRecording() {
        viewModelScope.launch {
            if (AppConfig.USE_PARALLEL_UPLOAD) {
                submitRecordingParallel()
            } else {
                submitRecordingUnified()
            }
        }
    }

    /**
     * Submit recording using parallel upload (keypoints first, then video)
     * This triggers analysis immediately without waiting for video
     *
     * Phases: Processing (Video Labeling) → Uploading → Analyzing → Completed
     */
    private suspend fun submitRecordingParallel() {
        try {
            // Pause camera to save battery and prevent overheating during upload
            onPauseCamera?.invoke()
            Log.i(TAG, "Camera paused for parallel upload")

            // Start submitting
            _uiState.update {
                it.copy(
                    isSubmitting = true,
                    submissionError = null,
                    uploadState = UploadState.Processing(0, "Processing video with overlay...")
                )
            }

            val sessionDir = currentSessionDir
            if (sessionDir == null || !sessionDir.exists()) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submissionError = "Session directory not found"
                    )
                }
                return
            }

            // ═══════════════════════════════════════════════════════════════
            // PHASE 1: Video Labeling - Burn hand skeleton overlay into video
            // ═══════════════════════════════════════════════════════════════
            Log.i(TAG, "Starting video labeling for session: ${sessionDir.name}")

            try {
                val labeledVideoFile = videoLabelingProcessor.processVideo(sessionDir) { progress ->
                    val progressPercent = (progress * 100).toInt()
                    _uiState.update {
                        it.copy(
                            uploadState = UploadState.Processing(
                                progress = progressPercent,
                                message = "Adding overlay to video... ${progressPercent}%"
                            )
                        )
                    }
                }
                Log.i(TAG, "✅ Video labeling complete: ${labeledVideoFile.name} (${labeledVideoFile.length() / 1024}KB)")
            } catch (e: Exception) {
                Log.e(TAG, "Video labeling failed - continuing with raw video", e)
                // If labeling fails, we'll upload the raw video instead
                // This ensures the user can still submit their recording
            }

            Log.i(TAG, "Starting parallel upload for session: ${sessionDir.name}")

            // Use ParallelUploadManager for dual-channel upload
            parallelUploadManager.uploadSession(
                sessionId = sessionDir.name,
                sessionDir = sessionDir,
                patientId = _uiState.value.patientId
            ).catch { e ->
                Log.e(TAG, "Parallel upload error", e)
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submissionError = "Upload failed: ${e.message}",
                        uploadState = UploadState.Failed(e.message ?: "Unknown error")
                    )
                }
            }.collect { uploadState ->
                // Update UI state based on upload progress
                _uiState.update { it.copy(uploadState = uploadState) }

                when (uploadState) {
                    is UploadState.Completed -> {
                        Log.i(TAG, "Parallel upload completed: ${uploadState.recordingId}")
                        // Clean up session files
                        try {
                            val deleted = sessionDir.deleteRecursively()
                            if (deleted) {
                                Log.i(TAG, "Session directory deleted: ${sessionDir.absolutePath}")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error deleting session files", e)
                        }

                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                recordingId = uploadState.recordingId,
                                lastCompletedSession = null
                            )
                        }
                    }
                    is UploadState.Failed -> {
                        Log.e(TAG, "Parallel upload failed: ${uploadState.error}")
                        _uiState.update {
                            it.copy(
                                isSubmitting = false,
                                submissionError = uploadState.error
                            )
                        }
                    }
                    is UploadState.PartiallyComplete -> {
                        Log.i(TAG, "Parallel upload partially complete")
                        // Analysis done, video may still be uploading
                        if (uploadState.analysisComplete) {
                            _uiState.update {
                                it.copy(recordingId = uploadState.recordingId)
                            }
                        }
                    }
                    else -> {
                        // Progress updates handled by state flow
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit recording (parallel)", e)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = "Failed to submit: ${e.message ?: "Unknown error"}"
                )
            }
        }
    }

    /**
     * Submit recording using unified upload (legacy - all files at once)
     *
     * Phases: Processing (Video Labeling) → Uploading → Analyzing → Completed
     */
    private suspend fun submitRecordingUnified() {
        try {
            // Pause camera to save battery and prevent overheating during upload
            onPauseCamera?.invoke()
            Log.i(TAG, "Camera paused for upload")

            // Start submitting with processing state
            _uiState.update {
                it.copy(
                    isSubmitting = true,
                    submissionError = null,
                    uploadState = UploadState.Processing(0, "Processing video with overlay...")
                )
            }

            // ═══════════════════════════════════════════════════════════════
            // PHASE 0: Video Labeling - Burn hand skeleton overlay into video
            // ═══════════════════════════════════════════════════════════════
            val sessionDir = currentSessionDir
            if (sessionDir != null && sessionDir.exists()) {
                try {
                    Log.i(TAG, "Starting video labeling for unified upload: ${sessionDir.name}")
                    val labeledVideoFile = videoLabelingProcessor.processVideo(sessionDir) { progress ->
                        val progressPercent = (progress * 100).toInt()
                        _uiState.update {
                            it.copy(
                                uploadState = UploadState.Processing(
                                    progress = progressPercent,
                                    message = "Adding overlay to video... ${progressPercent}%"
                                )
                            )
                        }
                    }
                    Log.i(TAG, "✅ Video labeling complete: ${labeledVideoFile.name} (${labeledVideoFile.length() / 1024}KB)")
                } catch (e: Exception) {
                    Log.e(TAG, "Video labeling failed - continuing with raw video", e)
                }
            }

            // Get the last completed session
            val completedSession = _uiState.value.lastCompletedSession
            if (completedSession == null) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submissionError = "No completed session to submit"
                    )
                }
                return
            }

            // Verify session directory still exists (already assigned above)
            if (sessionDir == null || !sessionDir.exists()) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submissionError = "Session directory not found"
                    )
                }
                return
            }

            // Prepare files for upload
            val csvFile = File(sessionDir, "keypoints.csv")
            // Prefer labeled video (with overlay) over raw video
            val labeledVideoFile = File(sessionDir, "video_labeled.mp4")
            val videoFile = if (labeledVideoFile.exists()) labeledVideoFile else File(sessionDir, "video.mp4")
            val sessionId = sessionDir.name

            Log.i(TAG, "Uploading (unified): CSV ${csvFile.length() / 1024}KB, Video ${videoFile.name} ${videoFile.length() / 1024}KB")

            // Calculate total upload size
            val totalSize = (if (csvFile.exists()) csvFile.length() else 0) +
                    (if (videoFile.exists()) videoFile.length() else 0)
            var uploadedBytes = 0L

            // Create multipart body for keypoints (CSV) with progress
            val csvPart = if (csvFile.exists()) {
                val csvBody = ProgressRequestBody(
                    file = csvFile,
                    contentType = "text/csv".toMediaType(),
                    onProgress = { written, _ ->
                        uploadedBytes = written
                        val progress = ((uploadedBytes.toFloat() / totalSize) * 100).toInt()
                        _uiState.update { it.copy(uploadState = UploadState.Uploading(keypointsProgress = progress)) }
                    }
                )
                MultipartBody.Part.createFormData("keypoints", csvFile.name, csvBody)
            } else null

            // Create multipart body for video with progress
            val videoPart = if (videoFile.exists()) {
                val videoBody = ProgressRequestBody(
                    file = videoFile,
                    contentType = "video/mp4".toMediaType(),
                    onProgress = { written, _ ->
                        uploadedBytes = (csvFile.length()) + written
                        val progress = ((uploadedBytes.toFloat() / totalSize) * 100).toInt()
                        _uiState.update { it.copy(uploadState = UploadState.Uploading(videoProgress = progress)) }
                    }
                )
                MultipartBody.Part.createFormData("screenRecording", videoFile.name, videoBody)
            } else null

            // Create request bodies for form fields
            val sessionIdBody = sessionId.toRequestBody("text/plain".toMediaType())
            val patientIdBody = (_uiState.value.patientId ?: "unknown").toRequestBody("text/plain".toMediaType())

            Log.d(TAG, "Attempting unified upload: sessionId=$sessionId")

            val response = recordingService.uploadRecording(
                sessionIdBody,
                patientIdBody,
                videoPart,
                csvPart
            )

            Log.d(TAG, "Upload response: ${response.code()} ${response.message()}")

            if (response.isSuccessful) {
                // Show analyzing state briefly
                _uiState.update { it.copy(uploadState = UploadState.Analyzing()) }
                delay(1500)

                // Clean up session files
                try {
                    val deleted = sessionDir.deleteRecursively()
                    if (deleted) {
                        Log.i(TAG, "Session directory deleted: ${sessionDir.absolutePath}")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error deleting session files", e)
                }

                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        uploadState = UploadState.Completed(),
                        lastCompletedSession = null
                    )
                }
                Log.i(TAG, "Recording submitted successfully: $sessionId")
            } else {
                // Parse error response body for detailed message
                val errorBody = try {
                    response.errorBody()?.string()
                } catch (e: Exception) { null }

                val errorMsg = when (response.code()) {
                    400 -> "Invalid recording data. Please try recording again."
                    401 -> "Session expired. Please log in again."
                    404 -> "Upload endpoint not found. Please update the app."
                    413 -> "Recording file is too large (max 500MB)."
                    500 -> "Server error. Please wait a moment and try again."
                    502 -> "Server is restarting. Please try again in a few minutes."
                    503 -> "Server is temporarily unavailable. Please try again later."
                    504 -> "Request timed out. Check your internet connection."
                    else -> {
                        // Try to extract message from error body
                        if (errorBody?.contains("message") == true) {
                            try {
                                val jsonError = JSONObject(errorBody)
                                jsonError.optString("message", "Upload failed (${response.code()})")
                            } catch (e: Exception) {
                                "Upload failed: ${response.code()} - ${response.message()}"
                            }
                        } else {
                            "Upload failed: ${response.code()} - ${response.message()}"
                        }
                    }
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submissionError = errorMsg,
                        uploadState = UploadState.Failed(errorMsg)
                    )
                }
                Log.e(TAG, "Upload failed: ${response.code()} ${response.message()}")
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Upload timeout", e)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = "Upload timed out. Please check your internet connection and try again.",
                    uploadState = UploadState.Failed("Upload timed out")
                )
            }
        } catch (e: java.net.ConnectException) {
            Log.e(TAG, "Cannot connect to server", e)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = "Cannot connect to server. Please check your internet connection.",
                    uploadState = UploadState.Failed("Connection failed")
                )
            }
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Unknown host", e)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = "No internet connection. Please check your network settings.",
                    uploadState = UploadState.Failed("No internet connection")
                )
            }
        } catch (e: javax.net.ssl.SSLException) {
            Log.e(TAG, "SSL error", e)
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = "Secure connection failed. Please try again.",
                    uploadState = UploadState.Failed("SSL error")
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit recording", e)
            val errorMessage = when {
                e.message?.contains("timeout", ignoreCase = true) == true ->
                    "Request timed out. Please try again."
                e.message?.contains("network", ignoreCase = true) == true ->
                    "Network error. Please check your connection."
                e.message?.contains("connection", ignoreCase = true) == true ->
                    "Connection error. Please try again."
                else -> "Upload failed: ${e.message ?: "Unknown error"}"
            }
            _uiState.update {
                it.copy(
                    isSubmitting = false,
                    submissionError = errorMessage,
                    uploadState = UploadState.Failed(errorMessage)
                )
            }
        }
    }

    /**
     * Get callback for 60 FPS keypoint recording
     * This bypasses Compose recomposition for real-time CSV recording
     */
    fun getRecordingCallback(): (HandPoseResult) -> Unit {
        return { result ->
            // Track frames analyzed (regardless of detection) - thread-safe increment
            _framesAnalyzed.update { it + 1 }

            result.result?.let { landmarks ->
                // Hands detected - update detection status
                _isDetecting.value = true

                // Record to CSV (streams keypoints for each detected hand)
                csvKeypointRecorder.recordFrame(landmarks, frameNumber)

                // Update frame counts for UI
                val (leftCount, rightCount) = csvKeypointRecorder.getFrameCounts()
                _leftHandFrames.value = leftCount
                _rightHandFrames.value = rightCount
                _totalFrames.value = (leftCount + rightCount)

                // Increment frame number
                frameNumber++
            } ?: run {
                // No hands detected - update detection status
                _isDetecting.value = false
            }
        }
    }

    /**
     * Reset to idle state (retry - cancel and discard the recording)
     */
    fun resetToIdle() {
        viewModelScope.launch {
            try {
                // If currently recording, stop it
                if (_uiState.value.isRecording) {
                    timerJob?.cancel()
                    currentRecording?.stop()
                    currentRecording = null
                    csvKeypointRecorder.cleanup()
                }

                // Delete the current session directory if it exists
                currentSessionDir?.let { dir ->
                    try {
                        dir.deleteRecursively()
                        Log.i(TAG, "Cancelled recording session deleted: ${dir.absolutePath}")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to delete cancelled session", e)
                    }
                }
                currentSessionDir = null

                // Reset parallel upload manager
                parallelUploadManager.reset()

                // Reset frame counters
                frameNumber = 0L
                _leftHandFrames.value = 0
                _rightHandFrames.value = 0
                _totalFrames.value = 0
                _elapsedTime.value = 0f
                _framesAnalyzed.value = 0L
                _isDetecting.value = false

                // Reset UI state
                _uiState.update {
                    it.copy(
                        state = RecordingState.Idle,
                        isRecording = false,
                        isVideoRecording = false,
                        sessionId = "",
                        frameCount = 0,
                        durationMs = 0,
                        durationFormatted = "00:00",
                        uploadState = UploadState.NotStarted,
                        submissionError = null,
                        lastCompletedSession = null,
                        lastVideoFile = null,
                        recordingId = null,
                        videoThumbnail = null
                    )
                }

                Log.i(TAG, "Reset to idle state (recording discarded)")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to reset to idle", e)
                _uiState.update {
                    it.copy(
                        state = RecordingState.Error("Failed to cancel recording: ${e.message}", e),
                        isRecording = false,
                        isVideoRecording = false
                    )
                }
            }
        }
    }

    /**
     * Get list of all recorded sessions
     */
    fun getRecordedSessions(): List<SessionInfo> {
        val recordingsDir = context.filesDir
        if (!recordingsDir.exists()) return emptyList()

        return recordingsDir.listFiles()
            ?.filter { it.isDirectory && it.name.startsWith("session_") }
            ?.mapNotNull { sessionDir ->
                try {
                    val csvFile = File(sessionDir, "keypoints.csv")
                    val videoFile = File(sessionDir, "video.mp4")

                    SessionInfo(
                        sessionId = sessionDir.name,
                        directory = sessionDir.absolutePath,
                        hasKeypoints = csvFile.exists(),
                        hasVideo = videoFile.exists(),
                        keypointFileSize = if (csvFile.exists()) csvFile.length() else 0,
                        videoFileSize = if (videoFile.exists()) videoFile.length() else 0,
                        createdAt = sessionDir.lastModified()
                    )
                } catch (e: Exception) {
                    Log.e(TAG, "Error reading session: ${sessionDir.name}", e)
                    null
                }
            }
            ?.sortedByDescending { it.createdAt }
            ?: emptyList()
    }

    /**
     * Delete a recording session
     */
    fun deleteSession(sessionId: String): Boolean {
        val sessionDir = File(context.filesDir, sessionId)
        return try {
            sessionDir.deleteRecursively()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete session: $sessionId", e)
            false
        }
    }

    /**
     * Start the timer to update recording duration
     */
    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            var seconds = 0f
            while (isActive && _uiState.value.isRecording) {
                delay(100)  // Update every 100ms for smooth display
                seconds += 0.1f
                _elapsedTime.value = seconds

                // Update recording duration in state (milliseconds)
                val durationMs = (seconds * 1000).toLong()
                _uiState.update { it.copy(
                    durationMs = durationMs,
                    durationFormatted = formatDuration(durationMs)
                ) }
            }
        }
    }

    private fun stopTimer() {
        timerJob?.cancel()
        timerJob = null
    }

    /**
     * Format duration in mm:ss format
     */
    private fun formatDuration(durationMs: Long): String {
        val totalSeconds = durationMs / 1000
        val minutes = totalSeconds / 60
        val seconds = totalSeconds % 60
        return String.format(Locale.US, "%02d:%02d", minutes, seconds)
    }

    /**
     * Extract thumbnail from video file for preview during upload
     */
    private fun extractVideoThumbnail(videoFile: File): Bitmap? {
        return try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(videoFile.absolutePath)
            // Get frame at 1 second (or first frame if video is shorter)
            val thumbnail = retriever.getFrameAtTime(
                1000000, // 1 second in microseconds
                MediaMetadataRetriever.OPTION_CLOSEST_SYNC
            )
            retriever.release()
            thumbnail
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract video thumbnail", e)
            null
        }
    }

    /**
     * Get the recordings directory path
     */
    fun getRecordingsPath(): String {
        return context.filesDir.absolutePath
    }

    /**
     * Load protocols from repository
     */
    fun loadProtocols(forceRefresh: Boolean = false) {
        viewModelScope.launch {
            try {
                _isLoadingProtocols.value = true
                Log.d(TAG, "Loading protocols (forceRefresh=$forceRefresh)...")

                val protocols = protocolRepository.getProtocols(forceRefresh)
                _protocols.value = protocols

                Log.i(TAG, "✅ Loaded ${protocols.size} protocols")
                _isLoadingProtocols.value = false
            } catch (e: Exception) {
                Log.e(TAG, "❌ Failed to load protocols", e)
                _isLoadingProtocols.value = false
                _protocols.value = emptyList()
            }
        }
    }

    /**
     * Refresh protocols from server (bypasses cache)
     */
    fun refreshProtocols() {
        loadProtocols(forceRefresh = true)
    }

    override fun onCleared() {
        super.onCleared()
        // Clean up resources
        csvKeypointRecorder.cleanup()
        currentRecording?.stop()
        currentRecording = null
    }
}

data class RecordingDetailUiState(
    val recordingId: String = "",
    val status: String = "",
    val patientName: String = "",
    val files: List<RecordingFile> = emptyList(),
    val totalAvailable: Int = 0,
    val downloadingFile: String? = null, // Currently downloading file type
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): RecordingDetailUiState {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

@HiltViewModel
class RecordingDetailViewModel @Inject constructor(
    private val recordingService: RecordingService,
    @ApplicationContext private val context: Context
) : BaseViewModel<RecordingDetailUiState>() {

    override val initialState = RecordingDetailUiState()

    fun loadRecordingFiles(recordingId: String) {
        launchInViewModel {
            updateState { it.copy(recordingId = recordingId) }
            setLoading()

            try {
                val response = recordingService.getRecordingFiles(recordingId)

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null) {
                        setSuccess()
                        updateState {
                            it.copy(
                                status = data.status,
                                patientName = data.patientName,
                                files = data.files,
                                totalAvailable = data.totalAvailable
                            )
                        }
                    } else {
                        setError("No files found for this recording")
                    }
                } else {
                    val errorMsg = response.body()?.message ?: response.message() ?: "Failed to load files"
                    setError(errorMsg)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading recording files", e)
                setError(e.message ?: "Network error")
            }
        }
    }

    fun downloadFile(file: RecordingFile) {
        if (file.url == null || !file.available) {
            setError("File is not available for download")
            return
        }

        launchInViewModel {
            updateState { it.copy(downloadingFile = file.type) }

            try {
                // Use Android DownloadManager for downloading files
                val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

                // Generate filename from file type
                val filename = generateFilename(file)

                val request = DownloadManager.Request(Uri.parse(file.url))
                    .setTitle(file.name)
                    .setDescription("Downloading ${file.name}")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "SynaptiHand/$filename")
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)

                downloadManager.enqueue(request)

                updateState { it.copy(downloadingFile = null) }
                clearError()

                Log.i(TAG, "Started download for ${file.name}")
            } catch (e: Exception) {
                Log.e(TAG, "Error downloading file", e)
                updateState { it.copy(downloadingFile = null) }
                setError("Failed to download: ${e.message}")
            }
        }
    }

    private fun generateFilename(file: RecordingFile): String {
        val recordingId = currentState.recordingId.take(8)
        return when (file.type) {
            "video" -> "recording_${recordingId}_original.mp4"
            "labelled_video" -> "recording_${recordingId}_labeled.mp4"
            "keypoints" -> "recording_${recordingId}_keypoints.csv"
            "analysis_xlsx" -> "recording_${recordingId}_analysis.xlsx"
            "report_pdf" -> "recording_${recordingId}_report.pdf"
            "chart_image" -> "recording_${recordingId}_chart.png"
            else -> "recording_${recordingId}_file"
        }
    }

    companion object {
        private const val TAG = "RecordingDetailVM"
    }
}

/**
 * REFACTORED: RecordingDetailViewModel using BaseViewModel
 *
 * BEFORE: 147 lines with manual StateFlow management
 * AFTER: ~90 lines (39% reduction)
 *
 * Eliminated boilerplate:
 * - Manual StateFlow initialization
 * - Repetitive loading state transitions
 * - Error handling patterns
 * - clearError() implementation
 */

data class RecordingDetailUiStateRefactored(
    val recordingId: String = "",
    val status: String = "",
    val patientName: String = "",
    val files: List<RecordingFile> = emptyList(),
    val totalAvailable: Int = 0,
    val downloadingFile: String? = null,
    override val loadingState: LoadingState = LoadingState.Idle,
    override val errorMessage: String? = null
) : BaseUiState {
    override fun copyWith(
        loadingState: LoadingState,
        errorMessage: String?
    ): RecordingDetailUiStateRefactored {
        return copy(loadingState = loadingState, errorMessage = errorMessage)
    }
}

@HiltViewModel
class RecordingDetailViewModelRefactored @Inject constructor(
    private val recordingService: RecordingService,
    @ApplicationContext private val context: Context
) : BaseViewModel<RecordingDetailUiStateRefactored>() {

    override val initialState = RecordingDetailUiStateRefactored()

    /**
     * Load recording files with automatic state management from BaseViewModel
     */
    fun loadRecordingFiles(recordingId: String) {
        // Update recording ID immediately
        updateState { it.copy(recordingId = recordingId) }

        // Use executeWithLoading from BaseViewModel - handles all state transitions
        executeWithLoading(
            operation = {
                val response = recordingService.getRecordingFiles(recordingId)

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null) {
                        Result.success(data)
                    } else {
                        Result.failure(Exception("No files found for this recording"))
                    }
                } else {
                    val errorMsg = response.body()?.message ?: response.message() ?: "Failed to load files"
                    Result.failure(Exception(errorMsg))
                }
            },
            onSuccess = { data ->
                updateState {
                    it.copy(
                        status = data.status,
                        patientName = data.patientName,
                        files = data.files,
                        totalAvailable = data.totalAvailable
                    )
                }
            },
            onError = { exception ->
                Log.e(TAG, "Error loading recording files", exception)
            }
        )
    }

    /**
     * Download a file using Android DownloadManager
     */
    fun downloadFile(file: RecordingFile) {
        if (file.url == null || !file.available) {
            setError("File is not available for download")
            return
        }

        launchInViewModel {
            updateState { it.copy(downloadingFile = file.type) }

            try {
                val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                val filename = generateFilename(file)

                val request = DownloadManager.Request(Uri.parse(file.url))
                    .setTitle(file.name)
                    .setDescription("Downloading ${file.name}")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "SynaptiHand/$filename")
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)

                downloadManager.enqueue(request)

                updateState { it.copy(downloadingFile = null, errorMessage = null) }
                Log.i(TAG, "Started download for ${file.name}")

            } catch (e: Exception) {
                Log.e(TAG, "Error downloading file", e)
                updateState { it.copy(downloadingFile = null) }
                setError("Failed to download: ${e.message}")
            }
        }
    }

    private fun generateFilename(file: RecordingFile): String {
        val recordingId = currentState.recordingId.take(8)
        return when (file.type) {
            "video" -> "recording_${recordingId}_original.mp4"
            "labelled_video" -> "recording_${recordingId}_labeled.mp4"
            "keypoints" -> "recording_${recordingId}_keypoints.csv"
            "analysis_xlsx" -> "recording_${recordingId}_analysis.xlsx"
            "report_pdf" -> "recording_${recordingId}_report.pdf"
            "chart_image" -> "recording_${recordingId}_chart.png"
            else -> "recording_${recordingId}_file"
        }
    }

    // clearError() is inherited from BaseViewModel - no implementation needed!

    companion object {
        private const val TAG = "RecordingDetailVM"
    }
}

// ============================================================================
// UI LAYER
// ============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordingDetailScreen(
    recordingId: String,
    onNavigateBack: () -> Unit,
    viewModel: RecordingDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(recordingId) {
        viewModel.loadRecordingFiles(recordingId)
    }

    Scaffold(
        containerColor = SynaptiHandTheme.Background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Recording Details",
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
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SynaptiHandTheme.Background
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = SynaptiHandTheme.Primary)
                    }
                }

                uiState.files.isEmpty() && uiState.errorMessage == null -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(32.dp)
                        ) {
                            Icon(
                                imageVector = when (uiState.status) {
                                    "processing" -> Icons.Default.HourglassEmpty
                                    "failed" -> Icons.Default.Error
                                    else -> Icons.Default.InsertDriveFile
                                },
                                contentDescription = null,
                                tint = when (uiState.status) {
                                    "processing" -> SynaptiHandTheme.Warning
                                    "failed" -> SynaptiHandTheme.Error
                                    else -> SynaptiHandTheme.TextSecondary
                                },
                                modifier = Modifier.size(64.dp)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = when (uiState.status) {
                                    "processing" -> "Processing in Progress"
                                    "failed" -> "Processing Failed"
                                    "pending" -> "Awaiting Processing"
                                    else -> "No Files Available"
                                },
                                color = SynaptiHandTheme.TextPrimary,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Medium
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = when (uiState.status) {
                                    "processing" -> "Video analysis is in progress. Files will be available once processing completes."
                                    "failed" -> "An error occurred during processing. Please try uploading the recording again."
                                    "pending" -> "This recording is queued for processing. Please check back later."
                                    "completed" -> "No output files were generated. The video or keypoints may not have been uploaded."
                                    else -> "Files have not been uploaded or processed for this recording."
                                },
                                color = SynaptiHandTheme.TextSecondary,
                                fontSize = 14.sp,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
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

                        // Recording info header
                        item {
                            RecordingInfoHeader(
                                patientName = uiState.patientName,
                                status = uiState.status,
                                totalFiles = uiState.totalAvailable
                            )
                        }

                        // Section: Videos
                        val videoFiles = uiState.files.filter {
                            it.type == "video" || it.type == "labelled_video"
                        }
                        if (videoFiles.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Videos")
                            }
                            items(videoFiles) { file ->
                                FileCard(
                                    file = file,
                                    isDownloading = uiState.downloadingFile == file.type,
                                    onDownload = { viewModel.downloadFile(file) },
                                    onPlay = {
                                        // Open video URL in browser/video player
                                        file.url?.let { url ->
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                            context.startActivity(intent)
                                        }
                                    }
                                )
                            }
                        }

                        // Section: Analysis Files
                        val analysisFiles = uiState.files.filter {
                            it.type == "keypoints" || it.type == "analysis_xlsx"
                        }
                        if (analysisFiles.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Analysis Data")
                            }
                            items(analysisFiles) { file ->
                                FileCard(
                                    file = file,
                                    isDownloading = uiState.downloadingFile == file.type,
                                    onDownload = { viewModel.downloadFile(file) },
                                    onPlay = null
                                )
                            }
                        }

                        // Section: Reports
                        val reportFiles = uiState.files.filter {
                            it.type == "report_pdf"
                        }
                        if (reportFiles.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Reports")
                            }
                            items(reportFiles) { file ->
                                FileCard(
                                    file = file,
                                    isDownloading = uiState.downloadingFile == file.type,
                                    onDownload = { viewModel.downloadFile(file) },
                                    onPlay = {
                                        // Open PDF in browser
                                        file.url?.let { url ->
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                            context.startActivity(intent)
                                        }
                                    }
                                )
                            }
                        }

                        // Section: Charts
                        val chartFiles = uiState.files.filter {
                            it.type == "chart_image"
                        }
                        if (chartFiles.isNotEmpty()) {
                            item {
                                SectionHeader(title = "Analysis Charts")
                            }
                            items(chartFiles) { file ->
                                FileCard(
                                    file = file,
                                    isDownloading = uiState.downloadingFile == file.type,
                                    onDownload = { viewModel.downloadFile(file) },
                                    onPlay = {
                                        // Open image in browser
                                        file.url?.let { url ->
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                            context.startActivity(intent)
                                        }
                                    }
                                )
                            }
                        }

                        item { Spacer(modifier = Modifier.height(24.dp)) }
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
}

@Composable
private fun RecordingInfoHeader(
    patientName: String,
    status: String,
    totalFiles: Int
) {
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
                // Status icon
                val (statusIcon, statusColor) = when (status) {
                    "completed" -> Icons.Default.CheckCircle to SynaptiHandTheme.StatusCompleted
                    "processing" -> Icons.Default.HourglassEmpty to SynaptiHandTheme.Warning
                    "failed" -> Icons.Default.Error to SynaptiHandTheme.Error
                    else -> Icons.Default.Assessment to SynaptiHandTheme.TextSecondary
                }

                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(statusColor.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = statusIcon,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column {
                    Text(
                        text = patientName,
                        color = SynaptiHandTheme.TextPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "Status: ${status.replaceFirstChar { it.uppercase() }}",
                        color = statusColor,
                        fontSize = 14.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Files available count
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Available Files",
                    color = SynaptiHandTheme.TextSecondary,
                    fontSize = 14.sp
                )
                Text(
                    text = "$totalFiles files",
                    color = SynaptiHandTheme.TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        color = SynaptiHandTheme.TextPrimary,
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
    )
}

@Composable
private fun FileCard(
    file: RecordingFile,
    isDownloading: Boolean,
    onDownload: () -> Unit,
    onPlay: (() -> Unit)?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
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
            // File type icon
            val (icon, iconColor) = getFileIcon(file.type, file.available)

            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(22.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // File info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    color = if (file.available) SynaptiHandTheme.TextPrimary else SynaptiHandTheme.TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = if (file.available) "Ready to download" else "Not available",
                    color = SynaptiHandTheme.TextSecondary,
                    fontSize = 12.sp
                )
            }

            // Action buttons
            if (file.available && file.url != null) {
                // Play/View button for videos, PDFs, images
                if (onPlay != null) {
                    IconButton(onClick = onPlay) {
                        Icon(
                            imageVector = if (file.type.contains("video")) Icons.Default.PlayCircle else Icons.Default.OpenInNew,
                            contentDescription = "Open",
                            tint = SynaptiHandTheme.Primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                // Download button
                IconButton(
                    onClick = onDownload,
                    enabled = !isDownloading
                ) {
                    if (isDownloading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = SynaptiHandTheme.Primary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.CloudDownload,
                            contentDescription = "Download",
                            tint = SynaptiHandTheme.StatusCompleted,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }
        }
    }
}

private fun getFileIcon(type: String, available: Boolean): Pair<ImageVector, Color> {
    val color = if (available) {
        when (type) {
            "video", "labelled_video" -> SynaptiHandTheme.Primary
            "keypoints" -> SynaptiHandTheme.Warning
            "analysis_xlsx" -> SynaptiHandTheme.StatusCompleted
            "report_pdf" -> SynaptiHandTheme.Error
            "chart_image" -> SynaptiHandTheme.Primary
            else -> SynaptiHandTheme.TextSecondary
        }
    } else {
        SynaptiHandTheme.TextSecondary
    }

    val icon = when (type) {
        "video" -> Icons.Default.Videocam
        "labelled_video" -> Icons.Default.PlayCircle
        "keypoints" -> Icons.Default.TableChart
        "analysis_xlsx" -> Icons.Default.Assessment
        "report_pdf" -> Icons.Default.Description
        "chart_image" -> Icons.Default.Image
        else -> Icons.Default.InsertDriveFile
    }

    return icon to color
}
