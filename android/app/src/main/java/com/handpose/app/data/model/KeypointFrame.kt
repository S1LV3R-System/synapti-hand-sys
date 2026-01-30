package com.handpose.app.data.model

/**
 * Represents a single landmark point with 3D coordinates
 */
data class Landmark(
    val x: Float,
    val y: Float,
    val z: Float
)

/**
 * Represents a single hand's keypoints at a specific timestamp
 */
data class HandKeypoints(
    val handIndex: Int,
    val handedness: String,  // "Left" or "Right"
    val landmarks: List<Landmark>  // 21 landmarks
)

/**
 * Represents a complete frame of keypoint data (can have 0-2 hands)
 */
data class KeypointFrame(
    val timestamp: Long,  // System time in milliseconds
    val frameNumber: Long,
    val hands: List<HandKeypoints>
)

/**
 * Session metadata for the recording
 */
data class SessionMetadata(
    val sessionId: String,
    val startTime: Long,
    val endTime: Long? = null,
    val deviceModel: String,
    val deviceBrand: String,
    val imageWidth: Int,
    val imageHeight: Int,
    val totalFrames: Long = 0,
    val patientId: String? = null,
    val projectId: String? = null,
    val protocolId: String? = null,
    val protocolName: String? = null,
    val gripStrengthLeft: Double? = null,
    val gripStrengthRight: Double? = null,
    val gripStrengthNotPossible: Boolean = false
)
