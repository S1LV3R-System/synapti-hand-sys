"""
Analysis Service Configuration
Defines constants, paths, and default configurations
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional
from pathlib import Path
import os

# =============================================================================
# PATHS
# =============================================================================

BASE_DIR = Path(__file__).parent
PROJECT_ROOT = BASE_DIR.parent.parent

# LSTM Model paths - check Docker path first, then development path
DOCKER_LSTM_DIR = Path("/app/LSTM-model")
DEV_LSTM_DIR = PROJECT_ROOT / "LSTM-model"

# Use Docker path if it exists, otherwise use development path
LSTM_MODEL_DIR = DOCKER_LSTM_DIR if DOCKER_LSTM_DIR.exists() else DEV_LSTM_DIR
MODEL_PATH = LSTM_MODEL_DIR / "multihead_trained" / "multihead_lstm_final.h5"
LABEL_ENCODERS_PATH = LSTM_MODEL_DIR / "multihead_trained" / "label_encoders.pkl"
TRAINING_CONFIG_PATH = LSTM_MODEL_DIR / "multihead_trained" / "training_config.pkl"

# =============================================================================
# LANDMARK DEFINITIONS
# =============================================================================

# MediaPipe 21 hand landmarks
LANDMARK_NAMES = [
    "WRIST",
    "THUMB_CMC", "THUMB_MCP", "THUMB_IP", "THUMB_TIP",
    "INDEX_MCP", "INDEX_PIP", "INDEX_DIP", "INDEX_TIP",
    "MIDDLE_MCP", "MIDDLE_PIP", "MIDDLE_DIP", "MIDDLE_TIP",
    "RING_MCP", "RING_PIP", "RING_DIP", "RING_TIP",
    "PINKY_MCP", "PINKY_PIP", "PINKY_DIP", "PINKY_TIP",
]

# Fingertip indices for analysis
FINGERTIP_INDICES = {
    "thumb_tip": 4,
    "index_tip": 8,
    "middle_tip": 12,
    "ring_tip": 16,
    "pinky_tip": 20,
}

# Finger landmark groups
FINGER_LANDMARKS = {
    "thumb": [1, 2, 3, 4],    # CMC, MCP, IP, TIP
    "index": [5, 6, 7, 8],    # MCP, PIP, DIP, TIP
    "middle": [9, 10, 11, 12],
    "ring": [13, 14, 15, 16],
    "pinky": [17, 18, 19, 20],
}

# =============================================================================
# LSTM MODEL CLASSES
# =============================================================================

WRIST_CLASSES = ['None', 'Rotation-In', 'Rotation-Out']
FINGER_CLASSES = [
    'Index Lift', 'Index Tap', 'Middle Lift', 'Middle Tap', 'None',
    'Pinky Lift', 'Pinky Tap', 'Ring Lift', 'Ring Tap', 'Thumb Lift', 'Thumb Tap'
]
POSTURE_CLASSES = ['Neutral', 'None', 'Pronation', 'Supination']
STATE_CLASSES = ['Aperture', 'Closure', 'None']

# Event type groupings
EVENT_CATEGORIES = {
    "WRIST": {
        "Rotation-Out": "wrist_rotation_out",
        "Rotation-In": "wrist_rotation_in",
    },
    "FINGER": {
        "Thumb Tap": "thumb_tap", "Thumb Lift": "thumb_lift",
        "Index Tap": "index_tap", "Index Lift": "index_lift",
        "Middle Tap": "middle_tap", "Middle Lift": "middle_lift",
        "Ring Tap": "ring_tap", "Ring Lift": "ring_lift",
        "Pinky Tap": "pinky_tap", "Pinky Lift": "pinky_lift",
    },
    "POSTURE": {
        "Pronation": "pronation",
        "Supination": "supination",
        "Neutral": "neutral",
    },
    "STATE": {
        "Aperture": "aperture",
        "Closure": "closure",
    }
}

# =============================================================================
# FILTER CONFIGURATIONS
# =============================================================================

@dataclass
class FilterConfig:
    """Configuration for signal filtering"""
    # Butterworth filter
    butterworth_order: int = 4
    butterworth_cutoff: float = 6.0  # Hz

    # Kalman filter
    kalman_process_noise: float = 0.01
    kalman_measurement_noise: float = 0.1

    # Savitzky-Golay filter
    savgol_window: int = 11
    savgol_polyorder: int = 3

    # Gaussian filter
    gaussian_sigma: float = 1.0

    # Median filter
    median_kernel: int = 5

    # Wavelet denoising
    wavelet_type: str = "db4"
    wavelet_level: int = 4
    wavelet_threshold: str = "soft"

    # Adaptive filter (LMS)
    lms_mu: float = 0.01
    lms_filter_order: int = 16

    # RLS filter
    rls_lambda: float = 0.99
    rls_delta: float = 1.0

    # Moving average
    moving_avg_window: int = 5

    # Exponential smoothing
    exp_smoothing_alpha: float = 0.3

# =============================================================================
# THRESHOLD CONFIGURATIONS
# =============================================================================

@dataclass
class ThresholdConfig:
    """Configuration for adaptive thresholds"""
    # MAD-based threshold
    mad_scale: float = 1.4826  # Constant for normal distribution
    mad_multiplier: float = 3.0

    # IQR-based threshold
    iqr_multiplier: float = 1.5

    # Z-score threshold
    zscore_threshold: float = 3.0

    # Quantile thresholds
    lower_quantile: float = 0.01
    upper_quantile: float = 0.99

    # Hysteresis threshold
    hysteresis_high: float = 0.7
    hysteresis_low: float = 0.3

    # CUSUM control
    cusum_h: float = 5.0  # Decision threshold
    cusum_k: float = 0.5  # Allowance parameter

    # Peak detection
    peak_prominence: float = 0.1
    peak_distance: int = 10  # Minimum distance between peaks
    peak_width: int = 3

    # Event detection
    event_min_duration: int = 5  # Minimum frames for event
    event_merge_gap: int = 3  # Frames to merge events

# =============================================================================
# ANALYSIS OUTPUT CONFIGURATIONS
# =============================================================================

@dataclass
class AnalysisOutputConfig:
    """Configuration for each analysis output type"""
    enabled: bool = False
    parameters: Dict = field(default_factory=dict)

@dataclass
class ProtocolAnalysisConfig:
    """Full protocol analysis configuration"""
    # Hand aperture
    hand_aperture: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"finger_pair": "thumb_index", "hand": "right"}
        )
    )

    # 3D Cyclogram
    cyclogram_3d: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"fingertip": "index_tip", "hand": "right"}
        )
    )

    # 3D Trajectory
    trajectory_3d: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"fingertip": "index_tip", "hand": "right"}
        )
    )

    # ROM Plot
    rom_plot: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={
                "plot_type": "violin",
                "measurement": "flexion",
                "fingers": {"index": True},
                "hand": "right"
            }
        )
    )

    # Tremor Spectrogram
    tremor_spectrogram: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"hand": "both"}
        )
    )

    # Opening-Closing Velocity
    opening_closing_velocity: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"hand": "right"}
        )
    )

    # Cycle Frequency
    cycle_frequency: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"hand": "right"}
        )
    )

    # Cycle Variability
    cycle_variability: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"hand": "right"}
        )
    )

    # Inter-finger Coordination
    inter_finger_coordination: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"finger1": "thumb", "finger2": "index", "hand": "right"}
        )
    )

    # Cycle Symmetry
    cycle_symmetry: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(enabled=False)
    )

    # Geometric Curvature
    geometric_curvature: AnalysisOutputConfig = field(
        default_factory=lambda: AnalysisOutputConfig(
            enabled=False,
            parameters={"hand": "right"}
        )
    )

# =============================================================================
# SAMPLING AND TIMING
# =============================================================================

DEFAULT_FPS = 30
SEQUENCE_LENGTH = 30  # LSTM sequence length
MIN_RECORDING_DURATION = 5  # seconds
MAX_RECORDING_DURATION = 300  # seconds

# =============================================================================
# OUTPUT FILE NAMES
# =============================================================================

OUTPUT_FILES = {
    "analysis_report": "Analysis_report.xlsx",
    "plots": "Plots.png",
    "pdf_report": "Report.pdf",
    "events_json": "events.json",
    "metrics_json": "metrics.json",
}

# Sheet names for Analysis_report.xlsx
REPORT_SHEETS = {
    "summary": "Summary",
    "events": "Detected Events",
    "metrics": "Analysis Metrics",
}

# =============================================================================
# BIOMARKER CONFIGURATION
# =============================================================================

@dataclass
class BiomarkerConfig:
    """Configuration for digital biomarker calculations"""
    # Sampling settings
    default_fs: float = 30.0  # Default sampling frequency (Hz)
    
    # Smoothness metric parameters
    sparc_freq_cutoff: float = 10.0  # Upper frequency limit for SPARC (Hz)
    sparc_amplitude_threshold: float = 0.05  # Amplitude threshold for spectrum normalization
    
    # Movement detection
    movement_velocity_threshold: float = 0.01  # Minimum velocity for movement detection
    min_movement_duration: float = 0.1  # Minimum duration to consider as valid movement (s)
    
    # Bradykinesia assessment
    early_cycle_fraction: float = 0.33  # Fraction of cycles considered "early"
    late_cycle_fraction: float = 0.33  # Fraction of cycles considered "late"
    min_pause_duration: float = 0.1  # Minimum pause duration for block detection (s)
    
    # Tremor analysis
    tremor_freq_band: tuple = (3.0, 12.0)  # Frequency band for tremor detection (Hz)
    tremor_window_duration: float = 1.0  # Window size for tremor stability analysis (s)
    
    # Fatigue assessment
    fatigue_window_size: int = 5  # Number of cycles for local variability computation
    
    # Asymmetry analysis
    max_lag_fraction: float = 0.25  # Maximum lag as fraction of signal length
    coherence_freq_band: tuple = (0.5, 5.0)  # Frequency band for coherence analysis (Hz)


# Clinical reference ranges for severity scoring
CLINICAL_REFERENCE_RANGES = {
    # Smoothness metrics (more negative SPARC/LDLJV = worse)
    'sparc': {'normal': (-2.5, -1.5), 'mild': -3.0, 'moderate': -4.0, 'severe': -5.0},
    'ldljv': {'normal': (-6.0, -4.0), 'mild': -6.5, 'moderate': -7.5, 'severe': -9.0},
    'ldlja': {'normal': (-6.0, -4.0), 'mild': -6.5, 'moderate': -7.5, 'severe': -9.0},
    'normalized_jerk': {'normal': (0.0, 50.0), 'mild': 100.0, 'moderate': 200.0, 'severe': 400.0},
    
    # Tremor metrics (higher = worse)
    'tremor_frequency': {'normal': (0.0, 3.0), 'mild': 5.0, 'moderate': 7.0, 'severe': 10.0},
    'tremor_amplitude': {'normal': (0.0, 0.005), 'mild': 0.015, 'moderate': 0.03, 'severe': 0.05},
    'tremor_severity': {'normal': (0.0, 0.1), 'mild': 0.3, 'moderate': 0.5, 'severe': 0.8},
    'q_factor': {'normal': (0.0, 2.0), 'mild': 5.0, 'moderate': 10.0, 'severe': 20.0},
    
    # Bradykinesia metrics (lower ratios = worse)
    'amplitude_decrement': {'normal': (0.8, 1.2), 'mild': 0.6, 'moderate': 0.4, 'severe': 0.2},
    'velocity_reduction': {'normal': (0.8, 1.2), 'mild': 0.6, 'moderate': 0.4, 'severe': 0.2},
    'slowness_score': {'normal': (0.0, 0.5), 'mild': 1.0, 'moderate': 2.0, 'severe': 4.0},
    'hesitation_index': {'normal': (0.0, 0.2), 'mild': 0.5, 'moderate': 1.0, 'severe': 2.0},
    
    # Fatigue metrics (more negative = worse)
    'performance_degradation': {'normal': (-0.1, 0.1), 'mild': -0.3, 'moderate': -0.5, 'severe': -0.7},
    'velocity_decay': {'normal': (-0.1, 0.1), 'mild': -0.3, 'moderate': -0.5, 'severe': -0.7},
    'rest_pause_frequency': {'normal': (0.0, 0.2), 'mild': 0.5, 'moderate': 1.0, 'severe': 2.0},
    
    # Asymmetry metrics (absolute values, higher = worse)
    'amplitude_asymmetry': {'normal': (0.0, 0.1), 'mild': 0.2, 'moderate': 0.4, 'severe': 0.6},
    'velocity_asymmetry': {'normal': (0.0, 0.1), 'mild': 0.2, 'moderate': 0.4, 'severe': 0.6},
    'coordination_lag': {'normal': (0.0, 0.05), 'mild': 0.1, 'moderate': 0.2, 'severe': 0.4},
    
    # Range of motion (higher = better)
    'rom_index_finger': {'normal': (0.8, 1.5), 'mild': 0.6, 'moderate': 0.4, 'severe': 0.2},
    'rom_thumb': {'normal': (0.6, 1.2), 'mild': 0.4, 'moderate': 0.3, 'severe': 0.15},
}

# Severity level definitions
SEVERITY_LEVELS = {
    0: 'NORMAL',
    1: 'MILD',
    2: 'MODERATE',
    3: 'SEVERE',
}

# Severity score thresholds
SEVERITY_SCORE_THRESHOLDS = {
    'normal': 85,  # Score >= 85 = Normal
    'mild': 65,    # Score 65-84 = Mild
    'moderate': 40,  # Score 40-64 = Moderate
    # Score < 40 = Severe
}

# Domain weights for composite scoring
DOMAIN_WEIGHTS = {
    'smoothness': 1.5,
    'tremor': 2.0,
    'bradykinesia': 2.0,
    'fatigue': 1.0,
    'asymmetry': 1.5,
    'range_of_motion': 1.0,
}

# =============================================================================
# ADVANCED FILTER CONFIGURATIONS
# =============================================================================

# New filter defaults
ADVANCED_FILTER_DEFAULTS = {
    # Total Variation denoising
    'total_variation': {
        'weight': 0.1,  # Regularization weight
        'max_iter': 200,
        'eps': 1e-4,
    },
    
    # LOESS/LOWESS smoothing
    'loess': {
        'frac': 0.1,  # Fraction of data for local regression
        'it': 0,  # Robustness iterations (0 for standard)
    },
    
    # Jerk clamp filter
    'jerk_clamp': {
        'max_jerk': 100.0,  # Maximum allowed jerk (units/s³)
        'method': 'clip',  # 'clip' or 'smooth'
    },
    
    # RTS Smoother (Rauch-Tung-Striebel)
    'rts_smoother': {
        'process_noise': 0.01,
        'measurement_noise': 0.1,
    },
    
    # Particle filter
    'particle_filter': {
        'n_particles': 100,
        'process_noise': 0.01,
        'measurement_noise': 0.1,
        'resample_threshold': 0.5,
    },
}

# =============================================================================
# VISUALIZATION SETTINGS
# =============================================================================

PLOT_SETTINGS = {
    'dpi': 300,  # High resolution for publication
    'figure_size': (12, 8),
    'font_size': 10,
    'title_size': 12,
    'label_size': 10,
    'tick_size': 8,
    'legend_size': 9,
    'line_width': 1.5,
    'marker_size': 4,
    'color_palette': 'viridis',
    'grid_alpha': 0.3,
}

# Severity colors for clinical dashboards
SEVERITY_COLORS = {
    'NORMAL': '#2ECC71',   # Green
    'MILD': '#F1C40F',     # Yellow
    'MODERATE': '#E67E22', # Orange
    'SEVERE': '#E74C3C',   # Red
    'UNKNOWN': '#95A5A6',  # Gray
}

# Domain colors for radar/spider charts
DOMAIN_COLORS = {
    'smoothness': '#3498DB',    # Blue
    'tremor': '#E74C3C',        # Red
    'bradykinesia': '#9B59B6',  # Purple
    'fatigue': '#F39C12',       # Orange
    'asymmetry': '#1ABC9C',     # Teal
    'range_of_motion': '#2ECC71', # Green
}

# Finger colors for multi-finger plots
FINGER_COLORS = {
    'thumb': '#E74C3C',   # Red
    'index': '#3498DB',   # Blue
    'middle': '#2ECC71',  # Green
    'ring': '#F39C12',    # Orange
    'pinky': '#9B59B6',   # Purple
}

# =============================================================================
# GROUPINGS FOR ANALYSIS
# =============================================================================

groupings = {
    # Joint type groupings
    "MCP": [5, 9, 13, 17],     # Metacarpophalangeal joints
    "PIP": [6, 10, 14, 18],    # Proximal interphalangeal joints
    "DIP": [7, 11, 15, 19],    # Distal interphalangeal joints
    "TIP": [8, 12, 16, 20],    # Fingertips
    "IP": [3],                  # Thumb interphalangeal
}
