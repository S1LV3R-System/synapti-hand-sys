package com.handpose.app.camera

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PointF
import android.hardware.camera2.CaptureRequest
import android.util.Log
import android.util.Range
import android.util.Size
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.core.AspectRatio
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.inject.Inject
import javax.inject.Singleton

// ═══════════════════════════════════════════════════════════════════════════════
// CAMERA MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CameraManager
 * Manages CameraX lifecycle with multi-surface architecture:
 * - Surface #1: VideoCapture (720p @ 60 FPS clean recording)
 * - Surface #2: ImageAnalysis (640x480 @ 60 FPS keypoint detection)
 * - Surface #3: Preview (user display)
 */
@Singleton
@androidx.camera.camera2.interop.ExperimentalCamera2Interop
class CameraManager @Inject constructor(
    @ApplicationContext private val context: Context
) {

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalyzer: ImageAnalysis? = null
    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    // PROFESSIONAL 3-SURFACE ARCHITECTURE
    // Surface #1: Clean video recording (720p @ 60 FPS)
    private var videoCapture: VideoCapture<Recorder>? = null

    fun startCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        analyzer: ImageAnalysis.Analyzer,
        enableVideoRecording: Boolean = false,
        onCameraReady: ((VideoCapture<Recorder>?) -> Unit)? = null  // Returns VideoCapture for recording
    ) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()

            // ═══════════════════════════════════════════════════════════
            // PROFESSIONAL 3-SURFACE CAMERAX ARCHITECTURE
            // ═══════════════════════════════════════════════════════════

            // ✅ SURFACE #3: Preview (User Display)
            // Purpose: Show camera feed to user with optional overlay
            // Resolution: Matches screen, aspect ratio 4:3
            preview = Preview.Builder()
                .setTargetAspectRatio(AspectRatio.RATIO_4_3)
                .build()
                .also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

            // ✅ SURFACE #2: ImageAnalysis (60 FPS MediaPipe Keypoints)
            // Purpose: Real-time hand pose detection → CSV
            // Resolution: 640x480 (lightweight for 60 FPS)
            // Format: RGBA_8888 (no YUV conversion overhead)
            // Strategy: KEEP_ONLY_LATEST (low latency, drop old frames)
            val imageAnalysisBuilder = ImageAnalysis.Builder()
                .setTargetResolution(Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)

            // Force 60 FPS for detection using Camera2Interop
            Camera2Interop.Extender(imageAnalysisBuilder)
                .setCaptureRequestOption(
                    CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                    Range(60, 60)  // 60 FPS for keypoint detection
                )

            imageAnalyzer = imageAnalysisBuilder.build()
                .also {
                    it.setAnalyzer(cameraExecutor, analyzer)
                }

            // ✅ SURFACE #1: VideoCapture (60 FPS Clean MP4 Recording)
            // Purpose: Record clean video WITHOUT overlay → Ground truth dataset
            // Resolution: 720p (1280x720) for quality
            // Codec: H.264 hardware encoding
            // Frame Rate: 60 FPS (matches detection)
            // NO screen recording, NO UI garbage, CLEAN video
            if (enableVideoRecording) {
                val recorder = Recorder.Builder()
                    .setQualitySelector(
                        androidx.camera.video.QualitySelector.from(
                            androidx.camera.video.Quality.HD,  // 720p
                            androidx.camera.video.FallbackStrategy.lowerQualityOrHigherThan(
                                androidx.camera.video.Quality.SD
                            )
                        )
                    )
                    .build()

                val videoCaptureBuilder = VideoCapture.Builder(recorder)

                // Force 60 FPS for video recording using Camera2Interop
                Camera2Interop.Extender(videoCaptureBuilder)
                    .setCaptureRequestOption(
                        CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                        Range(60, 60)  // 60 FPS for video
                    )

                videoCapture = videoCaptureBuilder.build()

                Log.i(TAG, "VideoCapture configured: 720p @ 60 FPS (clean recording)")
            } else {
                videoCapture = null
            }

            // Select back camera for hand pose detection
            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                // Unbind use cases before rebinding
                cameraProvider?.unbindAll()

                // ═══════════════════════════════════════════════════════════
                // BIND ALL 3 SURFACES TO CAMERA
                // ═══════════════════════════════════════════════════════════

                // Create ViewPort based on PreviewView to sync all surfaces
                val viewPort = previewView.viewPort

                if (viewPort != null) {
                    // Use UseCaseGroup to bind with shared ViewPort
                    // This ensures all 3 surfaces share the same crop region
                    val useCaseGroupBuilder = UseCaseGroup.Builder()
                        .setViewPort(viewPort)
                        .addUseCase(preview!!)           // Surface #3: Preview
                        .addUseCase(imageAnalyzer!!)     // Surface #2: Analysis

                    // Add Surface #1: VideoCapture if enabled
                    if (enableVideoRecording && videoCapture != null) {
                        useCaseGroupBuilder.addUseCase(videoCapture!!)
                        Log.i(TAG, "Binding 3 surfaces: Preview + ImageAnalysis + VideoCapture")
                    } else {
                        Log.i(TAG, "Binding 2 surfaces: Preview + ImageAnalysis (no recording)")
                    }

                    val useCaseGroup = useCaseGroupBuilder.build()

                    cameraProvider?.bindToLifecycle(
                        lifecycleOwner,
                        cameraSelector,
                        useCaseGroup
                    )
                } else {
                    // Fallback: bind without ViewPort (rare case)
                    if (enableVideoRecording && videoCapture != null) {
                        cameraProvider?.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            imageAnalyzer,
                            videoCapture
                        )
                        Log.i(TAG, "Bound 3 surfaces without ViewPort")
                    } else {
                        cameraProvider?.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            imageAnalyzer
                        )
                        Log.i(TAG, "Bound 2 surfaces without ViewPort")
                    }
                }

                Log.i(TAG, "✅ Camera started successfully with multi-surface architecture")
                Log.i(TAG, "   - Surface #1: VideoCapture (720p @ 60 FPS clean recording)")
                Log.i(TAG, "   - Surface #2: ImageAnalysis (640x480 @ 60 FPS keypoints)")
                Log.i(TAG, "   - Surface #3: Preview (user display)")

                // Return VideoCapture instance for recording control
                onCameraReady?.invoke(videoCapture)

            } catch (exc: Exception) {
                Log.e(TAG, "Use case binding failed", exc)
                onCameraReady?.invoke(null)
            }

        }, ContextCompat.getMainExecutor(context))
    }

    /**
     * Temporarily pause camera (unbind use cases) to save battery/GPU
     * Used during upload to prevent overheating
     */
    fun pauseCamera() {
        Log.i(TAG, "Pausing camera to save battery during upload")
        cameraProvider?.unbindAll()
    }

    /**
     * Resume camera after pause (requires full restart)
     */
    fun resumeCamera(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        analyzer: ImageAnalysis.Analyzer,
        enableVideoRecording: Boolean = false,
        onCameraReady: ((Any?) -> Unit)? = null
    ) {
        Log.i(TAG, "Resuming camera")
        startCamera(lifecycleOwner, previewView, analyzer, enableVideoRecording, onCameraReady)
    }

    fun stopCamera() {
        Log.i(TAG, "Stopping camera and releasing resources")
        // Unbind all use cases first
        cameraProvider?.unbindAll()

        // Shutdown the executor to release any pending images
        try {
            cameraExecutor.shutdown()
            // Wait briefly for pending tasks to complete
            if (!cameraExecutor.awaitTermination(500, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                cameraExecutor.shutdownNow()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error shutting down camera executor: ${e.message}")
            cameraExecutor.shutdownNow()
        }

        // Create a new executor for the next camera session
        // This prevents "maxImages already acquired" crash on re-entry
        cameraExecutor = Executors.newSingleThreadExecutor()

        // Clear references to allow garbage collection
        imageAnalyzer = null
        preview = null
        videoCapture = null

        Log.i(TAG, "Camera resources released, new executor created for next session")
    }

    companion object {
        private const val TAG = "CameraManager"
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT & VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ScreenshotManager
 * Captures labeled frames with hand landmarks overlaid during recording
 */
class ScreenshotManager(private val context: Context) {

    companion object {
        private const val TAG = "ScreenshotManager"
        private const val SCREENSHOT_WIDTH = 1280
        private const val SCREENSHOT_HEIGHT = 720
        private const val LANDMARK_RADIUS = 8f
        private const val CONNECTION_STROKE_WIDTH = 4f
        private const val LABEL_TEXT_SIZE = 24f

        // Hand skeleton connections (MediaPipe format)
        private val HAND_CONNECTIONS = listOf(
            // Thumb
            Pair(0, 1), Pair(1, 2), Pair(2, 3), Pair(3, 4),
            // Index finger
            Pair(0, 5), Pair(5, 6), Pair(6, 7), Pair(7, 8),
            // Middle finger
            Pair(0, 9), Pair(9, 10), Pair(10, 11), Pair(11, 12),
            // Ring finger
            Pair(0, 13), Pair(13, 14), Pair(14, 15), Pair(15, 16),
            // Pinky
            Pair(0, 17), Pair(17, 18), Pair(18, 19), Pair(19, 20),
            // Palm connections
            Pair(5, 9), Pair(9, 13), Pair(13, 17)
        )

        // Landmark names for labels
        private val LANDMARK_NAMES = listOf(
            "WRIST",
            "THUMB_CMC", "THUMB_MCP", "THUMB_IP", "THUMB_TIP",
            "INDEX_MCP", "INDEX_PIP", "INDEX_DIP", "INDEX_TIP",
            "MIDDLE_MCP", "MIDDLE_PIP", "MIDDLE_DIP", "MIDDLE_TIP",
            "RING_MCP", "RING_PIP", "RING_DIP", "RING_TIP",
            "PINKY_MCP", "PINKY_PIP", "PINKY_DIP", "PINKY_TIP"
        )

        // Fingertip indices
        private val FINGERTIP_INDICES = setOf(4, 8, 12, 16, 20)
    }

    // Paint objects for drawing
    private val landmarkPaint = Paint().apply {
        color = android.graphics.Color.GREEN
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val fingertipPaint = Paint().apply {
        color = android.graphics.Color.RED
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val wristPaint = Paint().apply {
        color = android.graphics.Color.CYAN
        style = Paint.Style.FILL
        isAntiAlias = true
    }

    private val connectionPaint = Paint().apply {
        color = android.graphics.Color.BLUE
        style = Paint.Style.STROKE
        strokeWidth = CONNECTION_STROKE_WIDTH
        isAntiAlias = true
    }

    private val outlinePaint = Paint().apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 2f
        isAntiAlias = true
    }

    private val labelPaint = Paint().apply {
        color = android.graphics.Color.WHITE
        textSize = LABEL_TEXT_SIZE
        isAntiAlias = true
        textAlign = Paint.Align.LEFT
    }

    private val infoPaint = Paint().apply {
        color = android.graphics.Color.WHITE
        textSize = 32f
        isAntiAlias = true
        textAlign = Paint.Align.LEFT
        isFakeBoldText = true
    }

    /**
     * Capture a labeled screenshot with hand landmarks
     * @param handLandmarkerResult MediaPipe detection result
     * @param frameNumber Current frame number in recording
     * @param timestamp Timestamp in seconds
     * @param sessionDir Session directory to save screenshot
     * @param showLabels Whether to show landmark labels
     * @param showSkeleton Whether to show skeleton connections
     * @return Screenshot file or null if failed
     */
    suspend fun captureScreenshot(
        handLandmarkerResult: HandLandmarkerResult?,
        frameNumber: Int,
        timestamp: Float,
        sessionDir: File,
        showLabels: Boolean = true,
        showSkeleton: Boolean = true
    ): File? = withContext(Dispatchers.IO) {
        try {
            if (handLandmarkerResult == null || handLandmarkerResult.landmarks().isEmpty()) {
                Log.w(TAG, "No hand landmarks to capture")
                return@withContext null
            }

            // Create bitmap
            val bitmap = Bitmap.createBitmap(
                SCREENSHOT_WIDTH,
                SCREENSHOT_HEIGHT,
                Bitmap.Config.ARGB_8888
            )

            val canvas = Canvas(bitmap)
            canvas.drawColor(android.graphics.Color.BLACK)

            // Get first detected hand
            val landmarks = handLandmarkerResult.landmarks()[0]

            // Convert normalized landmarks to pixel coordinates
            val pixelLandmarks = landmarks.map { landmark ->
                PointF(
                    landmark.x() * SCREENSHOT_WIDTH,
                    landmark.y() * SCREENSHOT_HEIGHT
                )
            }

            // Draw skeleton connections first (so landmarks appear on top)
            if (showSkeleton) {
                drawSkeleton(canvas, pixelLandmarks)
            }

            // Draw landmarks
            pixelLandmarks.forEachIndexed { index, point ->
                drawLandmark(canvas, point, index)
            }

            // Draw labels if enabled
            if (showLabels) {
                drawLabels(canvas, pixelLandmarks)
            }

            // Draw frame info overlay
            drawFrameInfo(canvas, frameNumber, timestamp)

            // Save screenshot to file
            val filename = "screenshot_frame_${frameNumber.toString().padStart(4, '0')}.png"
            val screenshotFile = File(sessionDir, filename)

            FileOutputStream(screenshotFile).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }

            Log.d(TAG, "Screenshot saved: ${screenshotFile.absolutePath}")
            screenshotFile

        } catch (e: Exception) {
            Log.e(TAG, "Failed to capture screenshot", e)
            null
        }
    }

    /**
     * Capture multiple screenshots at specified frame intervals
     * @param intervalFrames Capture every N frames
     */
    suspend fun captureScreenshotAtInterval(
        handLandmarkerResult: HandLandmarkerResult?,
        frameNumber: Int,
        timestamp: Float,
        sessionDir: File,
        intervalFrames: Int = 30, // Default: every 30 frames (1 second at 30 FPS)
        showLabels: Boolean = true,
        showSkeleton: Boolean = true
    ): File? {
        return if (frameNumber % intervalFrames == 0) {
            captureScreenshot(
                handLandmarkerResult,
                frameNumber,
                timestamp,
                sessionDir,
                showLabels,
                showSkeleton
            )
        } else {
            null
        }
    }

    /**
     * Draw a single landmark
     */
    private fun drawLandmark(canvas: Canvas, point: PointF, index: Int) {
        // Select paint based on landmark type
        val paint = when {
            index == 0 -> wristPaint
            index in FINGERTIP_INDICES -> fingertipPaint
            else -> landmarkPaint
        }

        // Draw filled circle
        canvas.drawCircle(point.x, point.y, LANDMARK_RADIUS, paint)

        // Draw white outline
        canvas.drawCircle(point.x, point.y, LANDMARK_RADIUS + 2f, outlinePaint)
    }

    /**
     * Draw skeleton connections
     */
    private fun drawSkeleton(canvas: Canvas, landmarks: List<PointF>) {
        HAND_CONNECTIONS.forEach { (startIdx, endIdx) ->
            if (startIdx < landmarks.size && endIdx < landmarks.size) {
                val start = landmarks[startIdx]
                val end = landmarks[endIdx]
                canvas.drawLine(start.x, start.y, end.x, end.y, connectionPaint)
            }
        }
    }

    /**
     * Draw landmark labels
     */
    private fun drawLabels(canvas: Canvas, landmarks: List<PointF>) {
        landmarks.forEachIndexed { index, point ->
            if (index < LANDMARK_NAMES.size) {
                val label = LANDMARK_NAMES[index]
                canvas.drawText(
                    label,
                    point.x + 12f,
                    point.y - 12f,
                    labelPaint
                )
            }
        }
    }

    /**
     * Draw frame information overlay
     */
    private fun drawFrameInfo(canvas: Canvas, frameNumber: Int, timestamp: Float) {
        val infoLines = listOf(
            "Frame: $frameNumber",
            "Time: ${String.format("%.3f", timestamp)}s"
        )

        var y = 50f
        infoLines.forEach { line ->
            canvas.drawText(line, 20f, y, infoPaint)
            y += 45f
        }
    }

    /**
     * Get landmarks data as JSON string for storage
     */
    fun getLandmarksJson(handLandmarkerResult: HandLandmarkerResult?): String? {
        if (handLandmarkerResult == null || handLandmarkerResult.landmarks().isEmpty()) {
            return null
        }

        val landmarks = handLandmarkerResult.landmarks()[0]
        val landmarksData = landmarks.mapIndexed { index, landmark ->
            """
            {
              "id": $index,
              "name": "${LANDMARK_NAMES.getOrElse(index) { "Landmark_$index" }}",
              "x": ${landmark.x()},
              "y": ${landmark.y()},
              "z": ${landmark.z()},
              "visibility": ${if (handLandmarkerResult.landmarks().size > 0) 1.0f else 0.0f}
            }
            """.trimIndent()
        }

        return "[${landmarksData.joinToString(",")}]"
    }

    /**
     * Create screenshots directory for session
     */
    fun createScreenshotsDir(sessionDir: File): File {
        val screenshotsDir = File(sessionDir, "screenshots")
        screenshotsDir.mkdirs()
        return screenshotsDir
    }

    /**
     * Get all screenshots for a session
     */
    fun getScreenshots(sessionDir: File): List<File> {
        val screenshotsDir = File(sessionDir, "screenshots")
        if (!screenshotsDir.exists()) {
            return emptyList()
        }

        return screenshotsDir.listFiles()
            ?.filter { it.extension == "png" && it.name.startsWith("screenshot_") }
            ?.sortedBy { it.name }
            ?: emptyList()
    }

    /**
     * Clean up screenshots after upload
     */
    fun cleanupScreenshots(sessionDir: File) {
        val screenshotsDir = File(sessionDir, "screenshots")
        if (screenshotsDir.exists()) {
            screenshotsDir.deleteRecursively()
            Log.d(TAG, "Screenshots cleaned up")
        }
    }
}
