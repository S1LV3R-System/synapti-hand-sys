// ============================================================================
// PROCESSING TYPES FOR SYNAPTIHAND BACKEND
// ============================================================================

export interface ProcessingJobData {
  recordingId: string;
  patientId: string;
  // Parallel upload: keypoints or video path (one required)
  keypointsGcsPath?: string;  // For parallel upload - keypoints first
  videoGcsPath?: string;      // For legacy unified upload or video-only processing
  // Protocol-based analysis
  protocolId?: string;        // If present, triggers movementAnalysisOrchestrator
  configuration?: ProcessingConfiguration;
}

export interface ProcessingConfiguration {
  // Hand detection settings (optional for keypoints-only analysis)
  handDetection?: {
    confidence: number;
    maxHands: number;
  };
  filters?: string[];
  analysisTypes: string[];
  outputFormats?: string[];
  // Priority for queue processing: 'high' for parallel keypoints, 'normal' for unified
  priority?: 'high' | 'normal' | 'low';
}

export interface ProcessingResult {
  recordingId: string;
  status: 'success' | 'failed' | 'partial';
  outputs: ProcessingOutputs;
  metrics: ProcessingMetrics;
  error?: string;
}

export interface ProcessingOutputs {
  videoLabeledPath?: string;
  rawDataPath?: string;
  dashboardPath?: string;
  apertureDashboardPath?: string;
  landmarksData: LandmarkData[];
  analysisResults: AnalysisResults;
}

export interface LandmarkData {
  frame: number;
  timestamp: number;
  landmarks: Landmark[];
  confidence: number;
}

export interface Landmark {
  id: number;
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface AnalysisResults {
  tremor?: TremorAnalysis;
  rom?: ROMAnalysis;
  coordination?: CoordinationAnalysis;
  smoothness?: SmoothnessAnalysis;
  quality?: QualityMetrics;
}

export interface TremorAnalysis {
  frequency: number;
  amplitude: number;
  regularity: number;
  dominantFrequency: number;
  frequencySpectrum: {
    frequencies: number[];
    power: number[];
    peaks: number[];
  };
}

export interface ROMAnalysis {
  wrist: {
    flexion: number;
    extension: number;
    ulnarDeviation: number;
    radialDeviation: number;
  };
  fingers: {
    [key: string]: {
      mcp: number;
      pip: number;
      dip: number;
    };
  };
}

export interface CoordinationAnalysis {
  coordinationScore: number;
  reactionTime: number;
  movementAccuracy: number;
  asymmetryIndex: number;
}

export interface SmoothnessAnalysis {
  sparc: number;
  ldljv: number;
  normalizedJerk: number;
}

export interface QualityMetrics {
  averageConfidence: number;
  dropoutRate: number;
  jitter: number;
  completeness: number;
}

export interface ProcessingMetrics {
  processingTime: number;
  frameCount: number;
  fps: number;
  duration: number;
}

// Job status tracking
export interface JobStatus {
  jobId: string;
  recordingId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
}

// Upload types
export interface UploadMetadata {
  patientId: string;
  clinicianId?: string;
  protocolId?: string;
  deviceInfo?: {
    deviceType: string;
    model?: string;
    resolution?: string;
  };
  clinicalNotes?: string;
}

export interface UploadResponse {
  success: boolean;
  recordingId: string;
  uploadedAt: Date;
  status: string;
  gcsPath: string;
}

// GCS path generation
export interface GCSPathConfig {
  organization: string;
  patientId: string;
  recordingId: string;
  fileType: 'input' | 'output';
  fileName: string;
}

// Python service communication
export interface PythonProcessRequest {
  videoPath: string;
  outputDir: string;
  configuration: ProcessingConfiguration;
}

export interface PythonProcessResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message: string;
}

export interface PythonStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  error?: string;
}

export interface PythonResultsResponse {
  jobId: string;
  recordingId: string;
  outputs: {
    videoLabeledPath: string;
    rawDataPath: string;
    dashboardPath: string;
    apertureDashboardPath: string;
  };
  landmarks: LandmarkData[];
  analysis: AnalysisResults;
  metrics: ProcessingMetrics;
}
