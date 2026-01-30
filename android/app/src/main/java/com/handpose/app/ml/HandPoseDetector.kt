package com.handpose.app.ml

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

import dagger.hilt.android.qualifiers.ApplicationContext

/**
 * Exception thrown when GPU is not available on the device
 */
class GpuNotSupportedException(message: String) : Exception(message)

data class HandPoseResult(
    val result: HandLandmarkerResult?,
    val inputImageWidth: Int,
    val inputImageHeight: Int,
    val imageRotation: Int  // Rotation in degrees (0, 90, 180, 270)
)

@Singleton
class HandPoseDetector @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private var handLandmarker: HandLandmarker? = null
    private var _isGpuAvailable: Boolean = false

    val isGpuAvailable: Boolean
        get() = _isGpuAvailable

    private val _results = MutableStateFlow<HandPoseResult?>(null)
    val results: StateFlow<HandPoseResult?> = _results.asStateFlow()

    private var lastImageWidth: Int = 0
    private var lastImageHeight: Int = 0
    private var lastImageRotation: Int = 0

    /**
     * Direct callback for recording - bypasses StateFlow/Compose for real-time 60 FPS recording.
     * Set this when recording is active, clear when stopped.
     */
    @Volatile
    var onResultCallback: ((HandPoseResult) -> Unit)? = null

    /**
     * Initialize the hand pose detector with GPU only.
     * @throws GpuNotSupportedException if GPU is not available
     */
    @Throws(GpuNotSupportedException::class)
    fun ensureInitialized() {
        if (handLandmarker == null) {
            setupHandLandmarker()
        }
    }

    @Throws(GpuNotSupportedException::class)
    private fun setupHandLandmarker() {
        // GPU only - no CPU fallback for performance reasons
        if (!trySetupWithDelegate(Delegate.GPU)) {
            _isGpuAvailable = false
            throw GpuNotSupportedException(
                "GPU acceleration is required for HandPose detection. " +
                "This device does not support GPU delegate. " +
                "Please use a device with GPU support."
            )
        }
        _isGpuAvailable = true
        Log.i(TAG, "GPU delegate initialization complete - monitor FPS logs to verify actual GPU usage")
    }

    private fun trySetupWithDelegate(delegate: Delegate): Boolean {
        return try {
            Log.i(TAG, "Attempting to initialize HandLandmarker with delegate: $delegate")

            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetPath("hand_landmarker.task")
                .setDelegate(delegate)

            val baseOptions = baseOptionsBuilder.build()

            val optionsBuilder = HandLandmarker.HandLandmarkerOptions.builder()
                .setBaseOptions(baseOptions)
                .setNumHands(2)  // Detect both hands
                .setMinHandDetectionConfidence(0.5f)
                .setMinHandPresenceConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setRunningMode(RunningMode.LIVE_STREAM)
                .setResultListener(this::returnLivestreamResult)
                .setErrorListener(this::returnLivestreamError)

            val options = optionsBuilder.build()
            handLandmarker = HandLandmarker.createFromOptions(context, options)
            Log.i(TAG, "SUCCESS: HandPoseDetector initialized with $delegate delegate")
            true
        } catch (e: Exception) {
            Log.e(TAG, "FAILED to initialize with $delegate: ${e.message}")
            e.printStackTrace()
            false
        }
    }

    fun detect(bitmap: Bitmap, frameTime: Long, rotation: Int = 0) {
        lastImageWidth = bitmap.width
        lastImageHeight = bitmap.height
        lastImageRotation = rotation
        val mpImage = BitmapImageBuilder(bitmap).build()
        detectAsync(mpImage, frameTime)
    }

    private fun detectAsync(mpImage: MPImage, frameTime: Long) {
        handLandmarker?.detectAsync(mpImage, frameTime)
    }

    private var frameCount = 0
    private var startTime = System.currentTimeMillis()

    @Suppress("UNUSED_PARAMETER")
    private fun returnLivestreamResult(
        result: HandLandmarkerResult,
        input: MPImage
    ) {
        val handPoseResult = HandPoseResult(
            result = result,
            inputImageWidth = lastImageWidth,
            inputImageHeight = lastImageHeight,
            imageRotation = lastImageRotation
        )

        // Update StateFlow for UI
        _results.value = handPoseResult

        // CRITICAL: Direct callback for recording at full 60 FPS rate
        // This bypasses Compose's recomposition rate limitation
        onResultCallback?.invoke(handPoseResult)

        // Log FPS every 60 frames to verify GPU performance
        frameCount++
        if (frameCount % 60 == 0) {
            val elapsed = System.currentTimeMillis() - startTime
            val fps = (60000.0 / elapsed).toInt()
            Log.i(TAG, "Detection FPS: $fps | GPU Expected: 60-80 fps")
            startTime = System.currentTimeMillis()
        }
    }

    private fun returnLivestreamError(error: RuntimeException) {
        Log.e(TAG, "HandLandmarker error: " + error.message)
    }

    fun close() {
        try {
            handLandmarker?.close()
        } catch (e: Exception) {
            // GPU delegate may throw error on close - safe to ignore
            Log.w(TAG, "Error closing HandLandmarker (safe to ignore): ${e.message}")
        }
        handLandmarker = null
    }

    companion object {
        private const val TAG = "HandPoseDetector"
    }
}
