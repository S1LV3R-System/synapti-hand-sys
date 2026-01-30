package com.handpose.app.video

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.GLUtils
import android.opengl.Matrix
import android.util.Log
import android.view.Surface
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import com.handpose.app.ml.HandPoseResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

// ================================================================================================
// DATA CLASSES
// ================================================================================================

/**
 * Keypoint data parsed from Excel file
 */
data class KeypointData(
    val frames: List<KeypointFrame>,
    val startTimestampMs: Long
)

/**
 * Keypoint frame containing landmarks for all detected hands
 */
data class KeypointFrame(
    val timestampMs: Long,
    val frameNumber: Long,
    val landmarks: List<List<FloatArray>>,  // Per-hand landmark lists
    val handednesses: List<String>
)

/**
 * Hand frame data for a single hand
 */
data class HandFrameData(
    val timestampMs: Long,
    val frameNumber: Long,
    val landmarks: List<FloatArray>  // 21 landmarks × [x, y, z]
)

/**
 * Video metadata extracted from video file
 */
data class VideoMetadata(
    val width: Int,
    val height: Int,
    val durationMs: Long,
    val frameCount: Int,
    val rotation: Int
)

// ================================================================================================
// EGL CORE - OpenGL ES Context Management
// ================================================================================================

/**
 * EGL Core - Manages OpenGL ES context for off-screen rendering
 *
 * Used for video labeling: renders hand skeleton overlay onto video frames
 * before encoding to video_labeled.mp4
 */
class EglCore(sharedContext: EGLContext = EGL14.EGL_NO_CONTEXT) {

    private var eglDisplay: EGLDisplay = EGL14.EGL_NO_DISPLAY
    private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
    private var eglConfig: EGLConfig? = null

    companion object {
        private const val TAG = "EglCore"

        // EGL14 config attributes for recording surface
        private const val EGL_RECORDABLE_ANDROID = 0x3142
    }

    init {
        // Get default display
        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        if (eglDisplay == EGL14.EGL_NO_DISPLAY) {
            throw RuntimeException("Unable to get EGL14 display")
        }

        // Initialize EGL
        val version = IntArray(2)
        if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) {
            eglDisplay = EGL14.EGL_NO_DISPLAY
            throw RuntimeException("Unable to initialize EGL14")
        }
        Log.i(TAG, "EGL initialized: version ${version[0]}.${version[1]}")

        // Choose config that supports recording
        val configAttribs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL_RECORDABLE_ANDROID, 1,  // Required for MediaCodec surface
            EGL14.EGL_NONE
        )

        val configs = arrayOfNulls<EGLConfig>(1)
        val numConfigs = IntArray(1)
        if (!EGL14.eglChooseConfig(eglDisplay, configAttribs, 0, configs, 0, 1, numConfigs, 0)) {
            throw RuntimeException("Unable to find suitable EGLConfig")
        }
        eglConfig = configs[0]

        // Create EGL context
        val contextAttribs = intArrayOf(
            EGL14.EGL_CONTEXT_CLIENT_VERSION, 2,  // OpenGL ES 2.0
            EGL14.EGL_NONE
        )

        eglContext = EGL14.eglCreateContext(
            eglDisplay, eglConfig, sharedContext, contextAttribs, 0
        )
        if (eglContext == EGL14.EGL_NO_CONTEXT) {
            throw RuntimeException("Unable to create EGL context")
        }

        Log.i(TAG, "EGL context created successfully")
    }

    /**
     * Create a window surface from a native Surface (MediaCodec input surface)
     */
    fun createWindowSurface(surface: Surface): EGLSurface {
        val surfaceAttribs = intArrayOf(EGL14.EGL_NONE)
        val eglSurface = EGL14.eglCreateWindowSurface(
            eglDisplay, eglConfig, surface, surfaceAttribs, 0
        )
        if (eglSurface == EGL14.EGL_NO_SURFACE) {
            throw RuntimeException("Unable to create EGL window surface")
        }
        return eglSurface
    }

    /**
     * Create an off-screen pbuffer surface
     */
    fun createOffscreenSurface(width: Int, height: Int): EGLSurface {
        val surfaceAttribs = intArrayOf(
            EGL14.EGL_WIDTH, width,
            EGL14.EGL_HEIGHT, height,
            EGL14.EGL_NONE
        )
        val eglSurface = EGL14.eglCreatePbufferSurface(eglDisplay, eglConfig, surfaceAttribs, 0)
        if (eglSurface == EGL14.EGL_NO_SURFACE) {
            throw RuntimeException("Unable to create offscreen surface")
        }
        return eglSurface
    }

    /**
     * Make the EGL context current with the given surface
     */
    fun makeCurrent(eglSurface: EGLSurface) {
        if (!EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)) {
            throw RuntimeException("eglMakeCurrent failed")
        }
    }

    /**
     * Make nothing current (release context from current thread)
     */
    fun makeNothingCurrent() {
        if (!EGL14.eglMakeCurrent(
                eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT
            )
        ) {
            throw RuntimeException("eglMakeCurrent(nothing) failed")
        }
    }

    /**
     * Swap buffers (present the rendered frame)
     */
    fun swapBuffers(eglSurface: EGLSurface): Boolean {
        return EGL14.eglSwapBuffers(eglDisplay, eglSurface)
    }

    /**
     * Set presentation time for the current frame (for MediaCodec)
     */
    fun setPresentationTime(eglSurface: EGLSurface, nsecs: Long) {
        EGLExt.eglPresentationTimeANDROID(eglDisplay, eglSurface, nsecs)
    }

    /**
     * Release an EGL surface
     */
    fun releaseSurface(eglSurface: EGLSurface) {
        EGL14.eglDestroySurface(eglDisplay, eglSurface)
    }

    /**
     * Release all EGL resources
     */
    fun release() {
        if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
            EGL14.eglMakeCurrent(
                eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT
            )
            EGL14.eglDestroyContext(eglDisplay, eglContext)
            EGL14.eglTerminate(eglDisplay)
        }
        eglDisplay = EGL14.EGL_NO_DISPLAY
        eglContext = EGL14.EGL_NO_CONTEXT
        eglConfig = null
        Log.i(TAG, "EGL resources released")
    }
}

// ================================================================================================
// OVERLAY RENDERER - OpenGL ES 2.0 Rendering
// ================================================================================================

/**
 * OpenGL ES 2.0 Renderer for hand skeleton overlay
 *
 * Renders:
 * 1. Video frame as textured quad (full screen)
 * 2. Hand landmarks as circles
 * 3. Hand connections as lines
 *
 * Used by VideoLabelingProcessor to burn overlay into video frames
 */
class OverlayRenderer {

    // Shader programs
    private var textureProgram = 0
    private var lineProgram = 0
    private var pointProgram = 0

    // Texture for video frame
    private var frameTextureId = 0

    // Viewport dimensions
    private var viewportWidth = 0
    private var viewportHeight = 0

    // MVP matrix
    private val mvpMatrix = FloatArray(16)
    private val projectionMatrix = FloatArray(16)

    // Vertex buffers
    private lateinit var quadVertexBuffer: FloatBuffer
    private lateinit var quadTexCoordBuffer: FloatBuffer

    // Hand connections (same as HandLandmarkOverlay.kt)
    private val handConnections = listOf(
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
        // Palm
        Pair(5, 9), Pair(9, 13), Pair(13, 17)
    )

    // Colors
    private val leftHandColor = floatArrayOf(0.129f, 0.588f, 0.953f, 0.9f)  // Blue #2196F3
    private val rightHandColor = floatArrayOf(0.298f, 0.686f, 0.314f, 0.9f) // Green #4CAF50

    companion object {
        private const val TAG = "OverlayRenderer"
        private const val NUM_LANDMARKS = 21

        // Vertex shader for textured quad (video frame)
        private const val TEXTURE_VERTEX_SHADER = """
            attribute vec4 aPosition;
            attribute vec2 aTexCoord;
            varying vec2 vTexCoord;
            uniform mat4 uMVPMatrix;
            void main() {
                gl_Position = uMVPMatrix * aPosition;
                vTexCoord = aTexCoord;
            }
        """

        // Fragment shader for textured quad
        private const val TEXTURE_FRAGMENT_SHADER = """
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexture;
            void main() {
                gl_FragColor = texture2D(uTexture, vTexCoord);
            }
        """

        // Vertex shader for lines (connections)
        private const val LINE_VERTEX_SHADER = """
            attribute vec4 aPosition;
            uniform mat4 uMVPMatrix;
            void main() {
                gl_Position = uMVPMatrix * aPosition;
            }
        """

        // Fragment shader for lines
        private const val LINE_FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec4 uColor;
            void main() {
                gl_FragColor = uColor;
            }
        """

        // Vertex shader for points (landmarks)
        private const val POINT_VERTEX_SHADER = """
            attribute vec4 aPosition;
            uniform mat4 uMVPMatrix;
            uniform float uPointSize;
            void main() {
                gl_Position = uMVPMatrix * aPosition;
                gl_PointSize = uPointSize;
            }
        """

        // Fragment shader for points (circular)
        private const val POINT_FRAGMENT_SHADER = """
            precision mediump float;
            uniform vec4 uColor;
            void main() {
                // Create circular point
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) {
                    discard;
                }
                // Anti-aliased edge
                float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                gl_FragColor = vec4(uColor.rgb, uColor.a * alpha);
            }
        """
    }

    /**
     * Initialize OpenGL resources
     * Must be called with valid OpenGL context
     */
    fun initialize(width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height

        // Setup viewport
        GLES20.glViewport(0, 0, width, height)

        // Create shader programs
        textureProgram = createProgram(TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER)
        lineProgram = createProgram(LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER)
        pointProgram = createProgram(POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER)

        // Create frame texture
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        frameTextureId = textures[0]

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, frameTextureId)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        // Setup orthographic projection for 2D rendering
        Matrix.orthoM(projectionMatrix, 0, 0f, width.toFloat(), height.toFloat(), 0f, -1f, 1f)
        Matrix.setIdentityM(mvpMatrix, 0)
        Matrix.multiplyMM(mvpMatrix, 0, projectionMatrix, 0, mvpMatrix, 0)

        // Create quad vertices (full screen)
        val quadVertices = floatArrayOf(
            0f, 0f,                          // Bottom-left
            width.toFloat(), 0f,             // Bottom-right
            0f, height.toFloat(),            // Top-left
            width.toFloat(), height.toFloat() // Top-right
        )
        quadVertexBuffer = createFloatBuffer(quadVertices)

        // Texture coordinates (flip Y for video frames)
        val texCoords = floatArrayOf(
            0f, 0f,  // Bottom-left
            1f, 0f,  // Bottom-right
            0f, 1f,  // Top-left
            1f, 1f   // Top-right
        )
        quadTexCoordBuffer = createFloatBuffer(texCoords)

        // Enable blending for transparency
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        Log.i(TAG, "OverlayRenderer initialized: ${width}x${height}")
    }

    /**
     * Render a video frame with hand overlay
     *
     * @param frameBitmap The video frame bitmap
     * @param landmarks List of hand landmarks (each hand is a list of 21 normalized [x,y,z] points)
     * @param handednesses List of handedness ("Left" or "Right") for each hand
     * @param videoWidth Original video width (for coordinate transformation)
     * @param videoHeight Original video height (for coordinate transformation)
     * @param videoRotation Video rotation in degrees (0, 90, 180, 270)
     */
    fun renderFrame(
        frameBitmap: Bitmap,
        landmarks: List<List<FloatArray>>,
        handednesses: List<String>,
        videoWidth: Int,
        videoHeight: Int,
        videoRotation: Int = 0
    ) {
        // Clear screen
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        // 1. Draw video frame
        drawVideoFrame(frameBitmap)

        // 2. Draw hand overlays
        for (i in landmarks.indices) {
            val handLandmarks = landmarks[i]
            val handedness = if (i < handednesses.size) handednesses[i] else "Unknown"
            val color = if (handedness == "Left") leftHandColor else rightHandColor

            // Transform normalized coordinates to viewport coordinates
            // Note: Landmarks from detection are already in camera coordinate space
            // Video frames from MediaMetadataRetriever are already rotated correctly
            val transformedLandmarks = transformLandmarks(
                handLandmarks, videoWidth, videoHeight, videoRotation
            )

            // Draw connections (lines)
            drawConnections(transformedLandmarks, color)

            // Draw landmarks (points)
            drawLandmarks(transformedLandmarks, color)
        }
    }

    /**
     * Transform normalized [0,1] landmark coordinates to viewport coordinates
     * Handles orientation correctly for post-processing
     *
     * IMPORTANT: The keypoints are captured in ImageAnalysis coordinate space (640x480)
     * The video is captured at 720p and may have rotation metadata.
     * When MediaMetadataRetriever extracts frames, it applies rotation automatically.
     * However, the normalized keypoint coordinates need to match the extracted frame orientation.
     *
     * @param landmarks List of normalized [x, y, z] coordinates
     * @param videoWidth Original video width before rotation
     * @param videoHeight Original video height before rotation
     * @param rotation Video rotation in degrees (0, 90, 180, 270)
     */
    private fun transformLandmarks(
        landmarks: List<FloatArray>,
        videoWidth: Int,
        videoHeight: Int,
        rotation: Int = 0
    ): List<FloatArray> {
        // After rotation, determine effective dimensions
        val effectiveWidth: Int
        val effectiveHeight: Int
        if (rotation == 90 || rotation == 270) {
            effectiveWidth = videoHeight
            effectiveHeight = videoWidth
        } else {
            effectiveWidth = videoWidth
            effectiveHeight = videoHeight
        }

        // Calculate scale to fill viewport (match video aspect ratio to viewport)
        val videoAspect = effectiveWidth.toFloat() / effectiveHeight
        val viewportAspect = viewportWidth.toFloat() / viewportHeight

        val scaleX: Float
        val scaleY: Float
        val offsetX: Float
        val offsetY: Float

        if (videoAspect > viewportAspect) {
            // Video is wider - fit to width
            scaleX = viewportWidth.toFloat()
            scaleY = viewportWidth / videoAspect
            offsetX = 0f
            offsetY = (viewportHeight - scaleY) / 2f
        } else {
            // Video is taller - fit to height
            scaleX = viewportHeight * videoAspect
            scaleY = viewportHeight.toFloat()
            offsetX = (viewportWidth - scaleX) / 2f
            offsetY = 0f
        }

        return landmarks.map { landmark ->
            // Apply rotation transformation to normalized coordinates
            // This matches the rotation applied by MediaMetadataRetriever to frames
            val (rotatedX, rotatedY) = when (rotation) {
                90 -> Pair(1f - landmark[1], landmark[0])   // 90° CW
                180 -> Pair(1f - landmark[0], 1f - landmark[1])  // 180°
                270 -> Pair(landmark[1], 1f - landmark[0])  // 270° CW (90° CCW)
                else -> Pair(landmark[0], landmark[1])  // No rotation
            }

            // Scale to viewport coordinates
            val x = rotatedX * scaleX + offsetX
            val y = rotatedY * scaleY + offsetY
            floatArrayOf(x, y, landmark[2])
        }
    }

    /**
     * Draw video frame as textured quad
     */
    private fun drawVideoFrame(bitmap: Bitmap) {
        GLES20.glUseProgram(textureProgram)

        // Bind texture and upload bitmap
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, frameTextureId)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)

        // Set uniforms
        val mvpLocation = GLES20.glGetUniformLocation(textureProgram, "uMVPMatrix")
        GLES20.glUniformMatrix4fv(mvpLocation, 1, false, mvpMatrix, 0)

        val textureLocation = GLES20.glGetUniformLocation(textureProgram, "uTexture")
        GLES20.glUniform1i(textureLocation, 0)

        // Set vertex attributes
        val positionLocation = GLES20.glGetAttribLocation(textureProgram, "aPosition")
        GLES20.glEnableVertexAttribArray(positionLocation)
        GLES20.glVertexAttribPointer(positionLocation, 2, GLES20.GL_FLOAT, false, 0, quadVertexBuffer)

        val texCoordLocation = GLES20.glGetAttribLocation(textureProgram, "aTexCoord")
        GLES20.glEnableVertexAttribArray(texCoordLocation)
        GLES20.glVertexAttribPointer(texCoordLocation, 2, GLES20.GL_FLOAT, false, 0, quadTexCoordBuffer)

        // Draw quad
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

        GLES20.glDisableVertexAttribArray(positionLocation)
        GLES20.glDisableVertexAttribArray(texCoordLocation)
    }

    /**
     * Draw hand connections as lines
     */
    private fun drawConnections(landmarks: List<FloatArray>, color: FloatArray) {
        if (landmarks.size < NUM_LANDMARKS) return

        GLES20.glUseProgram(lineProgram)

        // Set uniforms
        val mvpLocation = GLES20.glGetUniformLocation(lineProgram, "uMVPMatrix")
        GLES20.glUniformMatrix4fv(mvpLocation, 1, false, mvpMatrix, 0)

        val colorLocation = GLES20.glGetUniformLocation(lineProgram, "uColor")
        GLES20.glUniform4fv(colorLocation, 1, color, 0)

        // Set line width
        GLES20.glLineWidth(5f)

        val positionLocation = GLES20.glGetAttribLocation(lineProgram, "aPosition")
        GLES20.glEnableVertexAttribArray(positionLocation)

        // Draw each connection
        for ((startIdx, endIdx) in handConnections) {
            if (startIdx >= landmarks.size || endIdx >= landmarks.size) continue

            val start = landmarks[startIdx]
            val end = landmarks[endIdx]

            val lineVertices = floatArrayOf(
                start[0], start[1],
                end[0], end[1]
            )
            val lineBuffer = createFloatBuffer(lineVertices)

            GLES20.glVertexAttribPointer(positionLocation, 2, GLES20.GL_FLOAT, false, 0, lineBuffer)
            GLES20.glDrawArrays(GLES20.GL_LINES, 0, 2)
        }

        GLES20.glDisableVertexAttribArray(positionLocation)
    }

    /**
     * Draw hand landmarks as circular points
     */
    private fun drawLandmarks(landmarks: List<FloatArray>, color: FloatArray) {
        GLES20.glUseProgram(pointProgram)

        // Set uniforms
        val mvpLocation = GLES20.glGetUniformLocation(pointProgram, "uMVPMatrix")
        GLES20.glUniformMatrix4fv(mvpLocation, 1, false, mvpMatrix, 0)

        // White border first (larger point)
        val colorLocation = GLES20.glGetUniformLocation(pointProgram, "uColor")
        GLES20.glUniform4f(colorLocation, 1f, 1f, 1f, 1f)

        val pointSizeLocation = GLES20.glGetUniformLocation(pointProgram, "uPointSize")
        GLES20.glUniform1f(pointSizeLocation, 20f)

        val positionLocation = GLES20.glGetAttribLocation(pointProgram, "aPosition")
        GLES20.glEnableVertexAttribArray(positionLocation)

        // Prepare vertex data for all points
        val pointVertices = FloatArray(landmarks.size * 2)
        for (i in landmarks.indices) {
            pointVertices[i * 2] = landmarks[i][0]
            pointVertices[i * 2 + 1] = landmarks[i][1]
        }
        val pointBuffer = createFloatBuffer(pointVertices)

        GLES20.glVertexAttribPointer(positionLocation, 2, GLES20.GL_FLOAT, false, 0, pointBuffer)
        GLES20.glDrawArrays(GLES20.GL_POINTS, 0, landmarks.size)

        // Colored inner circle (smaller point)
        GLES20.glUniform4fv(colorLocation, 1, color, 0)
        GLES20.glUniform1f(pointSizeLocation, 14f)
        GLES20.glDrawArrays(GLES20.GL_POINTS, 0, landmarks.size)

        GLES20.glDisableVertexAttribArray(positionLocation)
    }

    /**
     * Create and compile a shader program
     */
    private fun createProgram(vertexSource: String, fragmentSource: String): Int {
        val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource)
        val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource)

        val program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertexShader)
        GLES20.glAttachShader(program, fragmentShader)
        GLES20.glLinkProgram(program)

        val linkStatus = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linkStatus, 0)
        if (linkStatus[0] == 0) {
            val error = GLES20.glGetProgramInfoLog(program)
            GLES20.glDeleteProgram(program)
            throw RuntimeException("Program link failed: $error")
        }

        return program
    }

    /**
     * Load and compile a shader
     */
    private fun loadShader(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)

        val compileStatus = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compileStatus, 0)
        if (compileStatus[0] == 0) {
            val error = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            throw RuntimeException("Shader compile failed: $error")
        }

        return shader
    }

    /**
     * Create a FloatBuffer from a float array
     */
    private fun createFloatBuffer(data: FloatArray): FloatBuffer {
        val buffer = ByteBuffer.allocateDirect(data.size * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
        buffer.put(data)
        buffer.position(0)
        return buffer
    }

    /**
     * Release OpenGL resources
     */
    fun release() {
        if (textureProgram != 0) {
            GLES20.glDeleteProgram(textureProgram)
            textureProgram = 0
        }
        if (lineProgram != 0) {
            GLES20.glDeleteProgram(lineProgram)
            lineProgram = 0
        }
        if (pointProgram != 0) {
            GLES20.glDeleteProgram(pointProgram)
            pointProgram = 0
        }
        if (frameTextureId != 0) {
            val textures = intArrayOf(frameTextureId)
            GLES20.glDeleteTextures(1, textures, 0)
            frameTextureId = 0
        }
        Log.i(TAG, "OverlayRenderer released")
    }
}

// ================================================================================================
// VIDEO LABELING PROCESSOR - Post-Processing Pipeline
// ================================================================================================

/**
 * VideoLabelingProcessor - Burns hand skeleton overlay into video frames
 *
 * Flow:
 * 1. Read keypoints.xlsx to get landmark data with timestamps
 * 2. Extract video frames from video.mp4
 * 3. Render overlay onto each frame using OpenGL
 * 4. Encode frames to video_labeled.mp4
 *
 * Called after recording stops, before upload.
 * Progress is reported via callback for UI updates.
 */
@Singleton
class VideoLabelingProcessor @Inject constructor(
    private val context: Context
) {

    private var eglCore: EglCore? = null
    private var overlayRenderer: OverlayRenderer? = null

    companion object {
        private const val TAG = "VideoLabelingProcessor"
        private const val MIME_TYPE = "video/avc"
        private const val FRAME_RATE = 30
        private const val I_FRAME_INTERVAL = 1
        private const val BIT_RATE = 4_000_000  // 4 Mbps
        private const val TIMEOUT_US = 10000L
    }

    /**
     * Process video with overlay
     *
     * @param sessionDir Directory containing video.mp4 and keypoints.xlsx
     * @param onProgress Callback for progress updates (0.0 - 1.0)
     * @return File reference to video_labeled.mp4
     */
    suspend fun processVideo(
        sessionDir: File,
        onProgress: (Float) -> Unit
    ): File = withContext(Dispatchers.Default) {
        val videoFile = File(sessionDir, "video.mp4")
        val keypointsFile = File(sessionDir, "keypoints.xlsx")
        val outputFile = File(sessionDir, "video_labeled.mp4")

        require(videoFile.exists()) { "Video file not found: ${videoFile.absolutePath}" }
        require(keypointsFile.exists()) { "Keypoints file not found: ${keypointsFile.absolutePath}" }

        Log.i(TAG, "Starting video labeling: ${videoFile.name} + ${keypointsFile.name}")
        val startTime = System.currentTimeMillis()

        try {
            // 1. Parse keypoints from Excel
            onProgress(0.05f)
            val keypointData = parseKeypointsExcel(keypointsFile)
            Log.i(TAG, "Parsed ${keypointData.frames.size} keypoint frames")

            // 2. Get video metadata
            val videoMetadata = getVideoMetadata(videoFile)
            Log.i(TAG, "Video: ${videoMetadata.width}x${videoMetadata.height}, " +
                    "${videoMetadata.frameCount} frames, ${videoMetadata.durationMs}ms")

            onProgress(0.1f)

            // 3. Process frames with overlay
            processFramesWithOverlay(
                videoFile = videoFile,
                outputFile = outputFile,
                keypointData = keypointData,
                videoMetadata = videoMetadata,
                onProgress = { frameProgress ->
                    // Scale progress from 0.1 to 0.95
                    onProgress(0.1f + frameProgress * 0.85f)
                }
            )

            onProgress(1.0f)

            val duration = System.currentTimeMillis() - startTime
            val outputSize = outputFile.length() / 1024
            Log.i(TAG, "✅ Video labeling complete: ${outputSize}KB in ${duration}ms")

            outputFile

        } catch (e: Exception) {
            Log.e(TAG, "Video labeling failed", e)
            // Clean up partial output
            if (outputFile.exists()) {
                outputFile.delete()
            }
            throw e
        }
    }

    /**
     * Parse keypoints from Excel file
     * Returns frame data with timestamps and landmarks for each hand
     */
    private fun parseKeypointsExcel(keypointsFile: File): KeypointData {
        val frames = mutableListOf<KeypointFrame>()

        FileInputStream(keypointsFile).use { fis ->
            val workbook = XSSFWorkbook(fis)

            // Parse both Left Hand and Right Hand sheets
            val leftHandData = parseSheet(workbook.getSheet("Left Hand"))
            val rightHandData = parseSheet(workbook.getSheet("Right Hand"))

            // Merge frames by timestamp
            val allTimestamps = (leftHandData.map { it.timestampMs } +
                    rightHandData.map { it.timestampMs }).distinct().sorted()

            for (timestamp in allTimestamps) {
                val leftHand = leftHandData.find { it.timestampMs == timestamp }
                val rightHand = rightHandData.find { it.timestampMs == timestamp }

                val landmarks = mutableListOf<List<FloatArray>>()
                val handednesses = mutableListOf<String>()

                if (leftHand != null) {
                    landmarks.add(leftHand.landmarks)
                    handednesses.add("Left")
                }
                if (rightHand != null) {
                    landmarks.add(rightHand.landmarks)
                    handednesses.add("Right")
                }

                if (landmarks.isNotEmpty()) {
                    frames.add(KeypointFrame(
                        timestampMs = timestamp,
                        frameNumber = leftHand?.frameNumber ?: rightHand?.frameNumber ?: 0,
                        landmarks = landmarks,
                        handednesses = handednesses
                    ))
                }
            }

            workbook.close()
        }

        // Calculate start timestamp for normalization
        val startTimestamp = frames.minOfOrNull { it.timestampMs } ?: 0L

        return KeypointData(
            frames = frames,
            startTimestampMs = startTimestamp
        )
    }

    /**
     * Parse a single sheet (Left Hand or Right Hand)
     */
    private fun parseSheet(sheet: org.apache.poi.ss.usermodel.Sheet?): List<HandFrameData> {
        if (sheet == null) return emptyList()

        val result = mutableListOf<HandFrameData>()

        // Skip header row (row 0)
        for (rowNum in 1..sheet.lastRowNum) {
            val row = sheet.getRow(rowNum) ?: continue

            try {
                val timestampMs = row.getCell(0)?.numericCellValue?.toLong() ?: continue
                val frameNumber = row.getCell(1)?.numericCellValue?.toLong() ?: 0L
                // Column 2 is handedness (already known from sheet name)
                // Column 3 is confidence

                // Read 21 landmarks (columns 4 onwards, 3 values each: x, y, z)
                val landmarks = mutableListOf<FloatArray>()
                for (landmarkIdx in 0 until 21) {
                    val baseCol = 4 + landmarkIdx * 3
                    val x = row.getCell(baseCol)?.numericCellValue?.toFloat() ?: 0f
                    val y = row.getCell(baseCol + 1)?.numericCellValue?.toFloat() ?: 0f
                    val z = row.getCell(baseCol + 2)?.numericCellValue?.toFloat() ?: 0f
                    landmarks.add(floatArrayOf(x, y, z))
                }

                result.add(HandFrameData(
                    timestampMs = timestampMs,
                    frameNumber = frameNumber,
                    landmarks = landmarks
                ))

            } catch (e: Exception) {
                Log.w(TAG, "Error parsing row $rowNum", e)
            }
        }

        return result
    }

    /**
     * Get video metadata
     */
    private fun getVideoMetadata(videoFile: File): VideoMetadata {
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(videoFile.absolutePath)

        val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 1280
        val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 720
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0

        // Estimate frame count based on duration and frame rate
        val frameCount = (durationMs * FRAME_RATE / 1000).toInt()

        retriever.release()

        return VideoMetadata(
            width = width,
            height = height,
            durationMs = durationMs,
            frameCount = frameCount,
            rotation = rotation
        )
    }

    /**
     * Main processing loop: extract frames, overlay, encode
     */
    private fun processFramesWithOverlay(
        videoFile: File,
        outputFile: File,
        keypointData: KeypointData,
        videoMetadata: VideoMetadata,
        onProgress: (Float) -> Unit
    ) {
        // Determine output dimensions (handle rotation)
        val outputWidth: Int
        val outputHeight: Int
        if (videoMetadata.rotation == 90 || videoMetadata.rotation == 270) {
            outputWidth = videoMetadata.height
            outputHeight = videoMetadata.width
        } else {
            outputWidth = videoMetadata.width
            outputHeight = videoMetadata.height
        }

        // Initialize EGL and renderer
        eglCore = EglCore()
        val offscreenSurface = eglCore!!.createOffscreenSurface(outputWidth, outputHeight)
        eglCore!!.makeCurrent(offscreenSurface)

        overlayRenderer = OverlayRenderer()
        overlayRenderer!!.initialize(outputWidth, outputHeight)

        // Setup MediaCodec encoder
        val format = MediaFormat.createVideoFormat(MIME_TYPE, outputWidth, outputHeight).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, FRAME_RATE)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL)
        }

        val encoder = MediaCodec.createEncoderByType(MIME_TYPE)
        encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

        // Create encoder input surface
        val encoderSurface = encoder.createInputSurface()
        val encoderEglSurface = eglCore!!.createWindowSurface(encoderSurface)

        encoder.start()

        // Setup muxer
        val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        var videoTrackIndex = -1
        var muxerStarted = false

        // Frame extraction using MediaMetadataRetriever
        val retriever = MediaMetadataRetriever()
        retriever.setDataSource(videoFile.absolutePath)

        try {
            val frameIntervalUs = 1_000_000L / FRAME_RATE  // Frame interval in microseconds
            var frameIndex = 0
            var presentationTimeUs = 0L

            while (presentationTimeUs < videoMetadata.durationMs * 1000) {
                // Extract frame at current time
                val frameBitmap = retriever.getFrameAtTime(
                    presentationTimeUs,
                    MediaMetadataRetriever.OPTION_CLOSEST
                )

                if (frameBitmap != null) {
                    // Find matching keypoint data for this frame time
                    val frameTimeMs = presentationTimeUs / 1000
                    val keypointFrame = findClosestKeypointFrame(keypointData, frameTimeMs)

                    // Make encoder surface current
                    eglCore!!.makeCurrent(encoderEglSurface)

                    // Render frame with overlay (pass rotation for coordinate transformation)
                    if (keypointFrame != null) {
                        overlayRenderer!!.renderFrame(
                            frameBitmap = frameBitmap,
                            landmarks = keypointFrame.landmarks,
                            handednesses = keypointFrame.handednesses,
                            videoWidth = videoMetadata.width,
                            videoHeight = videoMetadata.height,
                            videoRotation = videoMetadata.rotation
                        )
                    } else {
                        // No keypoints - just render video frame
                        overlayRenderer!!.renderFrame(
                            frameBitmap = frameBitmap,
                            landmarks = emptyList(),
                            handednesses = emptyList(),
                            videoWidth = videoMetadata.width,
                            videoHeight = videoMetadata.height,
                            videoRotation = videoMetadata.rotation
                        )
                    }

                    // Set presentation time and swap buffers
                    eglCore!!.setPresentationTime(encoderEglSurface, presentationTimeUs * 1000)  // Convert to nanoseconds
                    eglCore!!.swapBuffers(encoderEglSurface)

                    frameBitmap.recycle()

                    // Drain encoder
                    drainEncoder(encoder, muxer, videoTrackIndex, muxerStarted) { trackIdx, started ->
                        videoTrackIndex = trackIdx
                        muxerStarted = started
                    }
                }

                frameIndex++
                presentationTimeUs += frameIntervalUs

                // Report progress
                val progress = frameIndex.toFloat() / videoMetadata.frameCount.coerceAtLeast(1)
                onProgress(progress.coerceIn(0f, 1f))
            }

            // Signal end of stream
            encoder.signalEndOfInputStream()

            // Drain remaining frames
            drainEncoder(encoder, muxer, videoTrackIndex, muxerStarted, endOfStream = true) { _, _ -> }

        } finally {
            // Cleanup
            retriever.release()
            encoder.stop()
            encoder.release()
            if (muxerStarted) {
                muxer.stop()
            }
            muxer.release()

            eglCore?.releaseSurface(encoderEglSurface)
            eglCore?.releaseSurface(offscreenSurface)
            overlayRenderer?.release()
            overlayRenderer = null
            eglCore?.release()
            eglCore = null
        }
    }

    /**
     * Find the closest keypoint frame to the given video time
     */
    private fun findClosestKeypointFrame(keypointData: KeypointData, videoTimeMs: Long): KeypointFrame? {
        if (keypointData.frames.isEmpty()) return null

        // Calculate relative time in the recording
        val relativeTimeMs = videoTimeMs

        // Find closest frame (within 50ms tolerance)
        val tolerance = 50L

        return keypointData.frames.minByOrNull {
            val keypointRelativeTime = it.timestampMs - keypointData.startTimestampMs
            kotlin.math.abs(keypointRelativeTime - relativeTimeMs)
        }?.let { closest ->
            val keypointRelativeTime = closest.timestampMs - keypointData.startTimestampMs
            if (kotlin.math.abs(keypointRelativeTime - relativeTimeMs) <= tolerance) {
                closest
            } else {
                null
            }
        }
    }

    /**
     * Drain encoder output buffers
     */
    private fun drainEncoder(
        encoder: MediaCodec,
        muxer: MediaMuxer,
        trackIndex: Int,
        muxerStarted: Boolean,
        endOfStream: Boolean = false,
        onTrackAdded: (Int, Boolean) -> Unit
    ) {
        var currentTrackIndex = trackIndex
        var isMuxerStarted = muxerStarted
        val bufferInfo = MediaCodec.BufferInfo()

        while (true) {
            val outputBufferIndex = encoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)

            when {
                outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!endOfStream) break
                }
                outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (isMuxerStarted) {
                        Log.w(TAG, "Format changed after muxer started")
                    } else {
                        val newFormat = encoder.outputFormat
                        currentTrackIndex = muxer.addTrack(newFormat)
                        muxer.start()
                        isMuxerStarted = true
                        onTrackAdded(currentTrackIndex, isMuxerStarted)
                        Log.i(TAG, "Muxer started with track $currentTrackIndex")
                    }
                }
                outputBufferIndex >= 0 -> {
                    val outputBuffer = encoder.getOutputBuffer(outputBufferIndex)
                        ?: throw RuntimeException("Encoder output buffer null")

                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                        bufferInfo.size = 0
                    }

                    if (bufferInfo.size > 0 && isMuxerStarted) {
                        outputBuffer.position(bufferInfo.offset)
                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSampleData(currentTrackIndex, outputBuffer, bufferInfo)
                    }

                    encoder.releaseOutputBuffer(outputBufferIndex, false)

                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        Log.i(TAG, "End of stream reached")
                        break
                    }
                }
            }
        }
    }

    /**
     * Check if labeling is supported (OpenGL ES 2.0 required)
     */
    fun isSupported(): Boolean {
        return try {
            // Try to create EGL context
            val testEgl = EglCore()
            testEgl.release()
            true
        } catch (e: Exception) {
            Log.w(TAG, "Video labeling not supported", e)
            false
        }
    }
}

// ================================================================================================
// VIDEO OVERLAY COMPOSITOR - Real-time Recording Manager
// ================================================================================================

/**
 * SIMPLIFIED Video Recording Manager
 *
 * CRITICAL REALIZATION:
 * After analyzing CameraX VideoCapture architecture, the overlay must be rendered
 * on the PREVIEW VIEW itself, not on the video frames directly.
 *
 * WHY THIS APPROACH:
 * 1. CameraX VideoCapture DOES NOT provide frame-level access for overlay injection
 * 2. MediaCodec surface-based approach requires complex OpenGL setup
 * 3. The CORRECT solution: Overlay is ALREADY DRAWN on screen by HandOverlayRenderer
 * 4. We just need to capture the PREVIEW VIEW (which has overlay) instead of screen
 *
 * NEW ARCHITECTURE:
 * - Preview shows camera + overlay (HandOverlayRenderer draws on Canvas)
 * - VideoCapture records the SAME camera feed (no overlay yet)
 * - SOLUTION: Record preview TextureView/SurfaceView as video source
 *
 * This manager will coordinate with CameraX VideoCapture to record
 * the camera feed while landmarks are tracked separately for CSV.
 *
 * PERFORMANCE:
 * - Camera: 30 FPS video recording
 * - Detection: 60 FPS landmark tracking
 * - CPU usage: <10% (CameraX handles encoding)
 * - NO screen recording (no MediaProjection permission)
 *
 * @param context Application context
 */
@Singleton
class VideoOverlayCompositor @Inject constructor(
    private val context: Context
) {
    private var currentRecording: Recording? = null
    private val lastLandmark = AtomicReference<HandPoseResult?>(null)

    private val _recordingState = MutableStateFlow<RecordingState>(RecordingState.Idle)
    val recordingState: StateFlow<RecordingState> = _recordingState

    companion object {
        private const val TAG = "VideoOverlayCompositor"
    }

    /**
     * Update hand landmarks from 60 FPS detection stream
     *
     * NOTE: Landmarks are used for CSV recording, not burned into video yet.
     * Video will show the camera feed without overlay until we implement
     * a proper overlay surface renderer.
     *
     * @param handPoseResult Latest hand pose detection result
     */
    fun updateLandmarks(handPoseResult: HandPoseResult) {
        lastLandmark.set(handPoseResult)
    }

    /**
     * Get latest landmark data
     *
     * Used by CSV recording to save keypoints at 60 FPS
     */
    fun getLatestLandmarks(): HandPoseResult? {
        return lastLandmark.get()
    }

    /**
     * Start video recording
     *
     * IMPORTANT: This records the RAW camera feed (no overlay yet)
     * The overlay is currently only visible on screen preview.
     *
     * TODO: Implement overlay surface renderer to burn landmarks into video
     *
     * @param outputFile File to save video
     * @param videoCapture CameraX VideoCapture instance
     * @param onEvent Callback for recording events
     */
    fun startRecording(
        outputFile: File,
        videoCapture: androidx.camera.video.VideoCapture<androidx.camera.video.Recorder>,
        onEvent: (VideoRecordEvent) -> Unit
    ) {
        Log.i(TAG, "Starting CameraX video recording: ${outputFile.absolutePath}")
        Log.w(TAG, "NOTE: Video will NOT have overlay burned in (screen preview only)")

        val outputOptions = FileOutputOptions.Builder(outputFile).build()

        // Start recording with CameraX VideoCapture
        currentRecording = videoCapture.output
            .prepareRecording(context, outputOptions)
            .start(context.mainExecutor) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        _recordingState.value = RecordingState.Recording(outputFile)
                        Log.i(TAG, "VideoCapture recording started - 30 FPS")
                    }
                    is VideoRecordEvent.Finalize -> {
                        if (event.hasError()) {
                            val error = "VideoCapture error: ${event.error}"
                            _recordingState.value = RecordingState.Error(error)
                            Log.e(TAG, error)
                        } else {
                            _recordingState.value = RecordingState.Completed(outputFile)
                            Log.i(TAG, "VideoCapture finalized: ${outputFile.length()} bytes")
                        }
                    }
                    is VideoRecordEvent.Status -> {
                        val stats = event.recordingStats
                        if (stats.numBytesRecorded % (1024 * 1024) == 0L) { // Log every 1MB
                            Log.d(TAG, "Recording: ${stats.numBytesRecorded / 1024}KB")
                        }
                    }
                }
                onEvent(event)
            }
    }

    /**
     * Stop video recording
     */
    fun stopRecording() {
        currentRecording?.stop()
        currentRecording = null
        Log.i(TAG, "VideoCapture recording stopped")

        // Clear landmark data
        lastLandmark.set(null)
    }

    /**
     * Check if currently recording
     */
    fun isRecording(): Boolean {
        return currentRecording != null
    }

    /**
     * Release resources
     */
    fun release() {
        stopRecording()
    }

    /**
     * Recording state
     */
    sealed class RecordingState {
        object Idle : RecordingState()
        data class Recording(val outputFile: File) : RecordingState()
        data class Completed(val outputFile: File) : RecordingState()
        data class Error(val message: String) : RecordingState()
    }
}
