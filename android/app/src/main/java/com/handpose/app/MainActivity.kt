package com.handpose.app

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import android.app.Activity
import android.content.Intent
import com.handpose.app.ui.HandOverlayRenderer
import com.handpose.app.ui.RecordingInfoOverlay
import androidx.camera.core.ImageProxy
import androidx.camera.view.PreviewView
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import android.content.pm.ActivityInfo
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.handpose.app.auth.SupabaseAuthRepository
import com.handpose.app.auth.AuthViewModel
import com.handpose.app.auth.LoginScreen
import com.handpose.app.camera.CameraManager
import com.handpose.app.ml.HandPoseDetector
import com.handpose.app.patients.PatientDetailScreen
import com.handpose.app.patients.PatientSelectionActivity
import com.handpose.app.patients.PatientViewModel
import com.handpose.app.projects.ProjectDetailScreen
import com.handpose.app.projects.ProjectsScreen
import com.handpose.app.recording.Protocol
import com.handpose.app.recording.ProtocolRepository
import com.handpose.app.recording.RecordingDetailScreen
import com.handpose.app.recording.RecordingViewModel
import com.handpose.app.recording.UploadState
import com.handpose.app.ui.HandLandmarkOverlay
import com.handpose.app.ui.LoadingScreen
import com.handpose.app.auth.AuthState
import com.handpose.app.auth.canNavigateToProjects
import com.handpose.app.auth.shouldShowLogin
import com.handpose.app.auth.isLoading
import com.handpose.app.common.isLoading
import com.handpose.app.ui.RecordingControls
import com.handpose.app.ui.GripStrengthData
import com.handpose.app.ui.GripStrengthDialog
import com.handpose.app.ui.theme.SynaptiHandTheme
import kotlinx.coroutines.launch
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var cameraManager: CameraManager

    @Inject
    lateinit var handPoseDetector: HandPoseDetector

    @Inject
    lateinit var authRepository: SupabaseAuthRepository

    @Inject
    lateinit var protocolRepository: ProtocolRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            assets.open("hand_landmarker.task").use {
                Log.d("MainActivity", "Model file found, size: ${it.available()}")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Model file missing!", e)
            Toast.makeText(this, "CRITICAL: Model file missing!", Toast.LENGTH_LONG).show()
        }

        setContent {
            HandPoseApp(cameraManager, handPoseDetector, authRepository, protocolRepository)
        }
    }

    @OptIn(ExperimentalCamera2Interop::class)
    override fun onDestroy() {
        super.onDestroy()
        cameraManager.stopCamera()
        handPoseDetector.close()
    }
}

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

    // State-driven UI rendering - no manual navigation
    when {
        // Loading states - show loading screen
        authState.isLoading -> {
            val message = when (authState) {
                is AuthState.Validating -> (authState as AuthState.Validating).message
                else -> "Initializing..."
            }
            LoadingScreen(message = message)
        }

        // Authenticated - show main app navigation
        authState.canNavigateToProjects -> {
            // Main app navigation (projects and all authenticated screens)
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
                    // Just call logout - state change will automatically show LoginScreen
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

        // Recording detail (Files, Video player, Downloads)
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

        // Not authenticated - show login screen
        authState.shouldShowLogin -> {
            LoginScreen(
                onLoginSuccess = {
                    // No manual navigation needed - auth state change will trigger recomposition
                }
            )
        }

        // Fallback for unexpected states
        else -> {
            Log.e("MainActivity", "Unexpected auth state: $authState")
            LoadingScreen(message = "Initializing...")
        }
    }
}

@Composable
fun CameraScreen(
    cameraManager: CameraManager,
    handPoseDetector: HandPoseDetector,
    patientId: String,
    onNavigateBack: () -> Unit,
    recordingViewModel: RecordingViewModel = hiltViewModel(),
    patientViewModel: PatientViewModel = hiltViewModel(),
    protocolRepository: ProtocolRepository
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Force landscape orientation for camera/recording screen only
    // Also handle camera cleanup to prevent crashes on re-entry
    DisposableEffect(Unit) {
        val activity = context as? Activity
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE

        onDispose {
            // Reset to default orientation when leaving camera screen
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

            // Clean up camera resources to prevent "maxImages already acquired" crash
            // when re-entering the camera screen
            try {
                cameraManager.stopCamera()
                handPoseDetector.close()
                Log.i("CameraScreen", "Camera and detector resources cleaned up on dispose")
            } catch (e: Exception) {
                Log.e("CameraScreen", "Error during cleanup: ${e.message}")
            }
        }
    }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    var hasAudioPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    // Patient selection state (patientId checked later after recordingUiState is defined)
    var patientSelected by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
        onResult = { permissions ->
            hasCameraPermission = permissions[Manifest.permission.CAMERA] ?: false
            hasAudioPermission = permissions[Manifest.permission.RECORD_AUDIO] ?: false
        }
    )

    // Patient selection launcher
    val patientSelectionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val patientId = result.data!!.getStringExtra("patientId")
            val projectId = result.data!!.getStringExtra("projectId")

            if (patientId != null) {
                // Set patient context in RecordingViewModel
                recordingViewModel.setPatientContext(patientId, projectId)
                patientSelected = true
                Log.i("MainActivity", "Patient selected: ${patientId.take(8)}...")

                // ✅ PROFESSIONAL 3-SURFACE ARCHITECTURE: Start recording immediately
                // No screen capture permission needed - using direct VideoCapture
                recordingViewModel.startRecording()
            }
        } else {
            Log.d("MainActivity", "Patient selection cancelled")
        }
    }

    LaunchedEffect(Unit) {
        // Check camera/audio permissions
        val permissionsToRequest = mutableListOf<String>()
        if (!hasCameraPermission) {
            permissionsToRequest.add(Manifest.permission.CAMERA)
        }
        if (!hasAudioPermission) {
            permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
        }
        if (permissionsToRequest.isNotEmpty()) {
            permissionLauncher.launch(permissionsToRequest.toTypedArray())
        }
    }

    // Load patient info and set patient context for recording
    val patientDetailState by patientViewModel.detailUiState.collectAsState()

    LaunchedEffect(patientId) {
        Log.d("MainActivity", "🎯 Initiating patient detail load for ID: ${patientId.take(8)}...")
        patientViewModel.loadPatientDetail(patientId)
    }

    // Track if we've already shown the error to avoid repeated toasts
    var hasShownPatientError by remember { mutableStateOf(false) }

    LaunchedEffect(patientDetailState.patient, patientDetailState.isLoading) {
        // Only process when NOT loading (loading has completed or hasn't started)
        if (patientDetailState.isLoading) {
            Log.d("MainActivity", "⏳ Patient data is loading...")
            return@LaunchedEffect
        }

        patientDetailState.patient?.let { patient ->
            // Security: Validate patient ID before setting context
            if (patient.id.isNotBlank() && patient.id != "unknown") {
                recordingViewModel.setPatientContext(patient.id, patient.projectId)
                Log.i("MainActivity", "✅ Patient context set securely: patientId=${patient.id.take(8)}..., projectId=${patient.projectId?.take(8)}")
                hasShownPatientError = false // Reset error state on success
            } else {
                Log.e("MainActivity", "❌ Invalid patient ID - cannot set context")
                if (!hasShownPatientError) {
                    hasShownPatientError = true
                    Toast.makeText(
                        context,
                        "Invalid patient data. Please go back and select again.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        } ?: run {
            // Only show error if loading has actually completed (not initial state)
            // Check if there's an error message from the ViewModel indicating a real failure
            if (patientDetailState.errorMessage != null && !hasShownPatientError) {
                hasShownPatientError = true
                Log.e("MainActivity", "❌ Patient detail failed to load: ${patientDetailState.errorMessage}")
                Toast.makeText(
                    context,
                    "Failed to load patient data. Recording disabled.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    var isCameraStarted by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isGpuError by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(true) }
    var showGripStrengthDialog by remember { mutableStateOf(true) }
    val gripStrengthState = remember { mutableStateOf(GripStrengthData()) }
    var gripStrengthLoading by remember { mutableStateOf(false) }

    // Protocol state from RecordingViewModel
    val protocols by recordingViewModel.protocols.collectAsState()
    val isLoadingProtocols by recordingViewModel.isLoadingProtocols.collectAsState()

    // Refresh protocols callback
    val refreshProtocols: () -> Unit = {
        recordingViewModel.refreshProtocols()
    }

    // Initialize ML model asynchronously - GPU only
    // Protocols are loaded automatically by RecordingViewModel
    LaunchedEffect(Unit) {
        isLoading = true
        withContext(Dispatchers.IO) {
            try {
                // Initialize ML model (GPU only)
                handPoseDetector.ensureInitialized()
            } catch (e: com.handpose.app.ml.GpuNotSupportedException) {
                withContext(Dispatchers.Main) {
                    isGpuError = true
                    errorMessage = e.message
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    errorMessage = "Failed to load AI Model: ${e.message}"
                }
            } finally {
                withContext(Dispatchers.Main) {
                    isLoading = false
                }
            }
        }
    }

    // Collect hand pose results from camera
    val handPoseResult by handPoseDetector.results.collectAsState()

    // Collect recording UI state
    val recordingUiState by recordingViewModel.uiState.collectAsState()

    // Extract patient ID for patient selection check
    val currentPatientId = recordingUiState.patientId

    // Update patient selection state when patientId changes
    LaunchedEffect(currentPatientId) {
        patientSelected = currentPatientId != null
        if (currentPatientId != null) {
            Log.d("MainActivity", "Patient context active: ${currentPatientId.take(8)}...")
        }
    }

    // CRITICAL: Wire up direct callback for 60 FPS keypoint recording
    // This bypasses Compose's LaunchedEffect rate limitation (was only ~28 FPS)
    // The callback is invoked directly from MediaPipe's result callback thread
    LaunchedEffect(recordingUiState.isRecording) {
        if (recordingUiState.isRecording) {
            // Set callback when recording starts - this is called at full 60 FPS rate
            handPoseDetector.onResultCallback = recordingViewModel.getRecordingCallback()
            Log.i("CameraScreen", "60 FPS recording callback ENABLED")
        } else {
            // Clear callback when recording stops
            handPoseDetector.onResultCallback = null
            Log.i("CameraScreen", "60 FPS recording callback DISABLED")
        }
    }

    // Auto-navigate back after successful upload (saves battery)
    LaunchedEffect(recordingUiState.uploadState) {
        if (recordingUiState.uploadState is UploadState.Completed) {
            // Wait 2 seconds to show success message, then navigate back
            kotlinx.coroutines.delay(2000)
            onNavigateBack()
        }
    }

    // Show grip strength dialog first
    if (showGripStrengthDialog) {
        GripStrengthDialog(
            gripData = gripStrengthState.value,
            isLoading = gripStrengthLoading,
            protocols = protocols,
            isLoadingProtocols = isLoadingProtocols,
            onGripDataChange = { gripStrengthState.value = it },
            onDismiss = { onNavigateBack() },
            onStartRecording = {
                // Store grip strength data in view model
                recordingViewModel.setGripStrengthData(gripStrengthState.value)
                // Hide dialog and show camera - user will click white button to start recording
                showGripStrengthDialog = false
            },
            onRefreshProtocols = refreshProtocols
        )
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (isGpuError) {
            // GPU not supported - show device incompatible error
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(SynaptiHandTheme.Background)
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "Device Not Compatible",
                    color = SynaptiHandTheme.Error,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "GPU acceleration required",
                    color = SynaptiHandTheme.TextPrimary,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Text(
                    text = errorMessage ?: "This device does not support GPU delegate required for real-time hand pose detection.",
                    color = SynaptiHandTheme.TextSecondary,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 16.dp, bottom = 24.dp),
                    textAlign = TextAlign.Center
                )
                androidx.compose.material3.Button(
                    onClick = { onNavigateBack() },
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = SynaptiHandTheme.Primary
                    )
                ) {
                    Text("Go Back", color = SynaptiHandTheme.TextOnPrimary)
                }
            }
        } else if (errorMessage != null) {
            Text(text = errorMessage!!, color = SynaptiHandTheme.Error)
        } else if (isLoading) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                CircularProgressIndicator(color = SynaptiHandTheme.Primary)
                Text(text = "Loading AI Models...", color = SynaptiHandTheme.TextPrimary)
            }
        } else if (!hasCameraPermission) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Camera permission required",
                    color = SynaptiHandTheme.TextPrimary
                )
                androidx.compose.material3.Button(
                    onClick = {
                        permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.CAMERA,
                                Manifest.permission.RECORD_AUDIO
                            )
                        )
                    }
                ) {
                    Text("Grant Permissions")
                }
            }
        } else {
            // Camera Preview
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                    }
                },
                modifier = Modifier.fillMaxSize(),
                update = { previewView ->
                    if (!isCameraStarted) {
                        isCameraStarted = true
                        try {
                            cameraManager.startCamera(
                                lifecycleOwner,
                                previewView,
                                analyzer = { imageProxy ->
                                    // Process image for hand pose detection
                                    processImage(
                                        imageProxy,
                                        handPoseDetector,
                                        onVideoFrame = null  // No video recording callback needed
                                    )
                                },
                                enableVideoRecording = true,  // ✅ PROFESSIONAL 3-SURFACE ARCHITECTURE
                                onCameraReady = { videoCaptureInstance ->
                                    Log.d("MainActivity", "✅ 3-surface camera ready - VideoCapture enabled")

                                    // Pass VideoCapture instance to RecordingViewModel
                                    recordingViewModel.setVideoCapture(videoCaptureInstance)

                                    // Set pause camera callback to prevent overheating during upload
                                    recordingViewModel.setOnPauseCamera {
                                        cameraManager.pauseCamera()
                                    }
                                }
                            )
                        } catch(e: Exception) {
                            errorMessage = "Camera Error: ${e.localizedMessage}"
                        }
                    }
                }
            )

            // Hand Landmark Overlay
            handPoseResult?.let { poseResult ->
                HandLandmarkOverlay(
                    result = poseResult.result,
                    inputImageWidth = poseResult.inputImageWidth,
                    inputImageHeight = poseResult.inputImageHeight,
                    imageRotation = poseResult.imageRotation,
                    modifier = Modifier.fillMaxSize()
                )
            }


            // Recording info overlay (patient, project, timestamp) - shown during recording
            if (recordingUiState.isRecording && patientDetailState.patient != null) {
                val patient = patientDetailState.patient!!
                RecordingInfoOverlay(
                    patientName = patient.patientName,
                    projectName = "Project ${patient.projectId.take(8)}", // Use first 8 chars of project ID
                    modifier = Modifier.align(Alignment.TopStart)
                )
            }

            // Top bar with back button and detection info
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 48.dp, start = 16.dp, end = 16.dp)
                    .fillMaxSize(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                // Back button
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(SynaptiHandTheme.CameraOverlay)
                        .clickable { onNavigateBack() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.ArrowBack,
                        contentDescription = "Back",
                        tint = SynaptiHandTheme.TextOnOverlay
                    )
                }

                // Detection status and patient info
                Column(
                    modifier = Modifier
                        .background(
                            color = SynaptiHandTheme.CameraOverlay,
                            shape = RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalAlignment = Alignment.End
                ) {
                    // Patient name
                    patientDetailState.patient?.let { patient ->
                        Text(
                            text = patient.patientName,
                            color = SynaptiHandTheme.TextOnOverlay,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = "ID: ${patient.patientId}",
                            color = SynaptiHandTheme.TextOnOverlaySecondary,
                            fontSize = 12.sp
                        )
                    }

                    val handsDetected = handPoseResult?.result?.landmarks()?.size ?: 0
                    @Suppress("DEPRECATION")
                    val handednessInfo = handPoseResult?.result?.handednesses()?.mapNotNull { categories ->
                        categories.firstOrNull()?.categoryName()
                    }?.joinToString(", ") ?: ""

                    Text(
                        text = when {
                            handsDetected == 0 -> "No hands detected"
                            handsDetected == 1 -> "$handednessInfo hand"
                            else -> handednessInfo
                        },
                        color = SynaptiHandTheme.TextOnOverlay,
                        fontSize = 14.sp
                    )

                    // Show video recording indicator
                    if (recordingUiState.isVideoRecording) {
                        Text(
                            text = "Recording video",
                            color = SynaptiHandTheme.StatusCompleted,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Bottom recording controls
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 32.dp)
            ) {
                RecordingControls(
                    uiState = recordingUiState,
                    onToggleRecording = {
                        if (!recordingUiState.isRecording) {
                            // Starting recording - check patient selection first
                            if (currentPatientId == null) {
                                // No patient selected - launch patient selection activity
                                Log.i("MainActivity", "No patient selected, launching patient selection")
                                val intent = Intent(context, PatientSelectionActivity::class.java)
                                patientSelectionLauncher.launch(intent)
                            } else {
                                // ✅ PROFESSIONAL 3-SURFACE ARCHITECTURE
                                // Patient selected - start recording immediately
                                // No screen capture permission needed
                                Log.i("MainActivity", "Starting recording with 3-surface VideoCapture")
                                recordingViewModel.startRecording()
                            }
                        } else {
                            // Stopping recording
                            recordingViewModel.stopRecording()
                        }
                    },
                    onSubmitRecording = {
                        // Start upload - navigation handled after completion
                        recordingViewModel.submitRecording()
                    },
                    onRetryRecording = {
                        recordingViewModel.resetToIdle()
                    },
                    gripStrengthData = recordingUiState.gripStrengthData,
                    isSubmitting = recordingUiState.isSubmitting,
                    submissionError = recordingUiState.submissionError
                )
            }
        }

    }
}

private var lastFrameTime = 0L
private var frameCounter = 0

/**
 * Process camera frame for hand pose detection and optionally record video with overlay
 *
 * @param imageProxy Camera frame from CameraX
 * @param detector Hand pose detector
 * @param onVideoFrame Callback for overlay video recording (receives bitmap copy)
 */
fun processImage(
    imageProxy: ImageProxy,
    detector: HandPoseDetector,
    onVideoFrame: ((Bitmap, Int) -> Unit)? = null
) {
    try {
        val startTime = System.currentTimeMillis()

        // Log camera FPS every 60 frames
        frameCounter++
        if (frameCounter % 60 == 0) {
            val now = System.currentTimeMillis()
            if (lastFrameTime > 0) {
                val elapsed = now - lastFrameTime
                val cameraFps = (60000.0 / elapsed).toInt()
                Log.i("CameraFPS", "Camera delivering: $cameraFps fps")
            }
            lastFrameTime = now
        }

        // RGBA_8888 format - direct bitmap conversion without color space transform
        val bitmap = imageProxy.toBitmap()
        val conversionTime = System.currentTimeMillis() - startTime

        val rotation = imageProxy.imageInfo.rotationDegrees
        detector.detect(bitmap, imageProxy.imageInfo.timestamp / 1000000, rotation)

        // For overlay video recording, pass bitmap and rotation to recording callback
        // The callback handles copying/recording before bitmap is potentially reused
        onVideoFrame?.invoke(bitmap, rotation)

        if (frameCounter % 60 == 0) {
            Log.i("ProcessingTime", "Bitmap conversion: ${conversionTime}ms")
        }
    } catch (e: Exception) {
        Log.e("HandPose", "Error processing image", e)
    } finally {
        imageProxy.close()
    }
}

/**
 * Screen Capture Permission Explanation Dialog
 *
 * Explains to the user why screen recording permission is needed
 * before showing the system permission dialog.
 */
@Composable
fun ScreenCaptureExplanationDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Screen Recording Permission",
                style = MaterialTheme.typography.titleLarge
            )
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "To record your hand movements, this app needs permission to record your screen.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "Why is this needed?",
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = "• Captures hand skeleton overlay + video\n" +
                          "• Records frame counter for analysis\n" +
                          "• Creates complete recording for clinician review",
                    style = MaterialTheme.typography.bodySmall
                )
                Text(
                    text = "Your Privacy:",
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = "• Only records when you press Record\n" +
                          "• You'll grant this permission ONCE\n" +
                          "• Recordings uploaded securely to your clinic",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Text("Continue")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
