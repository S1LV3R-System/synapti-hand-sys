"""
Protocol Analysis System
Handles protocol-driven analysis, biomarkers, clinical scoring, and event detection
Consolidated from: protocol_analyzer.py, protocol_analyzer_adaptive.py, biomarkers.py, clinical_scoring.py, event_detector.py, event_analysis.py
"""

# Standard library imports
from collections import defaultdict
from dataclasses import dataclass
from dataclasses import dataclass, asdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any
from typing import Dict, List, Optional, Any, Tuple
from typing import Dict, List, Optional, Tuple
from typing import Dict, List, Optional, Tuple, Any
from typing import Dict, List, Tuple, Optional
import json
import warnings

# Third-party imports
from enum import Enum
from scipy import signal as sp_signal
from scipy import signal, fft
from scipy.fft import fft, fftfreq
from scipy.integrate import trapezoid
from scipy.stats import pearsonr
import numpy as np
import pandas as pd
import pickle

# Local imports
from config import DEFAULT_FPS, EVENT_CATEGORIES, FINGERTIP_INDICES, ProtocolAnalysisConfig, AnalysisOutputConfig, MODEL_PATH, LABEL_ENCODERS_PATH, TRAINING_CONFIG_PATH
from data_handling import DataNormalizer, FilterFactory, AdaptiveNormalizer


# =============================================================================
# PROTOCOL_ANALYZER.PY
# =============================================================================

from config import (
    FINGERTIP_INDICES, FINGER_LANDMARKS,
    ProtocolAnalysisConfig, AnalysisOutputConfig,
    BiomarkerConfig, CLINICAL_REFERENCE_RANGES, SEVERITY_COLORS
)


@dataclass
class AnalysisResult:
    """Container for analysis results"""
    output_type: str
    data: Any
    plots: Optional[Any] = None
    metrics: Dict = field(default_factory=dict)
    metadata: Dict = field(default_factory=dict)


class ProtocolAnalyzer:
    """
    Main analysis executor that processes data based on protocol configuration.

    Coordinates:
    - Data normalization
    - Event detection
    - Analysis outputs generation
    - Metrics computation
    """

    def __init__(
        self,
        protocol_config: Dict,
        fps: int = 30
    ):
        """
        Args:
            protocol_config: Protocol configuration dict from database
            fps: Frames per second of recording
        """
        self.protocol_config = protocol_config
        self.fps = fps

        # Parse analysis outputs config
        self.analysis_outputs = self._parse_analysis_outputs(
            protocol_config.get('analysisOutputs', {})
        )

        # Initialize components
        self.normalizer = DataNormalizer(fps=fps)
        self.filter_chain = FilterFactory.create_default_chain(fs=fps)
        self.event_detector = EventDetector()
        self.peak_detector = PeakDetector()
        self.thresholder = AdaptiveThresholder()

        # Storage for intermediate results
        self.normalized_data: Optional[pd.DataFrame] = None
        self.filtered_data: Optional[np.ndarray] = None
        self.events: Optional[Dict[str, List[DetectedEvent]]] = None
        self.analysis_results: List[AnalysisResult] = []

    def _parse_analysis_outputs(self, outputs_dict: Dict) -> Dict[str, AnalysisOutputConfig]:
        """Parse analysis outputs configuration"""
        parsed = {}

        for key, config in outputs_dict.items():
            if isinstance(config, dict):
                parsed[key] = AnalysisOutputConfig(
                    enabled=config.get('enabled', False),
                    parameters=config.get('parameters', {})
                )
            else:
                parsed[key] = config

        return parsed

    def analyze(self, raw_data: pd.DataFrame) -> Dict[str, Any]:
        """
        Main analysis pipeline.

        Args:
            raw_data: Raw landmark DataFrame

        Returns:
            Dictionary with all analysis results
        """
        print(f"\n{'='*70}")
        print(" PROTOCOL-DRIVEN ANALYSIS")
        print(f"{'='*70}\n")

        # Step 1: Normalize data
        print("Step 1: Normalizing data...")
        self.normalized_data = self.normalizer.normalize(raw_data)
        print(f"  ✓ Normalized {len(self.normalized_data)} frames")

        # Step 2: Apply filters
        print("\nStep 2: Applying filters...")
        landmark_cols = [col for col in self.normalized_data.columns
                        if any(lm in col for lm in ['WRIST', 'THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'])]
        landmark_data = self.normalized_data[landmark_cols].values
        self.filtered_data = self.filter_chain.apply(landmark_data)
        print(f"  ✓ Applied {len(self.filter_chain.filters)} filters")

        # Step 3: Event detection
        print("\nStep 3: Detecting events...")
        sequences = self.normalizer.normalize_for_lstm(raw_data)
        self.events = self.event_detector.detect_events(sequences)
        event_summary = self.event_detector.get_event_summary(self.events)
        print(f"  ✓ Detected events:")
        for category, summary in event_summary.items():
            if summary['count'] > 0:
                print(f"    - {category}: {summary['count']} events")

        # Step 4: Generate analysis outputs based on protocol
        print("\nStep 4: Generating analysis outputs...")
        self.analysis_results = []

        for output_name, config in self.analysis_outputs.items():
            if config.enabled:
                print(f"  - Generating {output_name}...")
                result = self._generate_output(output_name, config)
                if result:
                    self.analysis_results.append(result)

        print(f"  ✓ Generated {len(self.analysis_results)} outputs")

        # Step 5: Compile results
        return self._compile_results()

    def _generate_output(
        self,
        output_name: str,
        config: AnalysisOutputConfig
    ) -> Optional[AnalysisResult]:
        """Generate specific analysis output"""
        generators = {
            'handAperture': self._generate_hand_aperture,
            'cyclogram3D': self._generate_cyclogram_3d,
            'trajectory3D': self._generate_trajectory_3d,
            'romPlot': self._generate_rom_plot,
            'tremorSpectrogram': self._generate_tremor_spectrogram,
            'openingClosingVelocity': self._generate_opening_closing_velocity,
            'cycleFrequency': self._generate_cycle_frequency,
            'cycleVariability': self._generate_cycle_variability,
            'interFingerCoordination': self._generate_inter_finger_coordination,
            'cycleSymmetry': self._generate_cycle_symmetry,
            'geometricCurvature': self._generate_geometric_curvature,
            # New biomarker generators
            'sparcSmoothness': self._generate_sparc_smoothness,
            'ldljvSmoothness': self._generate_ldljv_smoothness,
            'bradykinesiaMetrics': self._generate_bradykinesia_metrics,
            'fatigueAnalysis': self._generate_fatigue_analysis,
            'tremorRegularity': self._generate_tremor_regularity,
            'clinicalSummary': self._generate_clinical_summary,
        }

        generator = generators.get(output_name)
        if generator:
            try:
                return generator(config.parameters)
            except Exception as e:
                print(f"    Warning: Failed to generate {output_name}: {e}")
                return None
        else:
            print(f"    Warning: Unknown output type: {output_name}")
            return None

    def _generate_hand_aperture(self, params: Dict) -> AnalysisResult:
        """Generate hand aperture analysis"""
        finger_pair = params.get('fingerPair', 'thumb_index')
        hand = params.get('hand', 'right')

        # Extract fingertip positions
        if finger_pair == 'thumb_index':
            finger1_idx = FINGERTIP_INDICES['thumb_tip']
            finger2_idx = FINGERTIP_INDICES['index_tip']
        else:  # thumb_middle
            finger1_idx = FINGERTIP_INDICES['thumb_tip']
            finger2_idx = FINGERTIP_INDICES['middle_tip']

        # Get positions from normalized data
        finger1_cols = [f"L{finger1_idx}_X", f"L{finger1_idx}_Y", f"L{finger1_idx}_Z"]
        finger2_cols = [f"L{finger2_idx}_X", f"L{finger2_idx}_Y", f"L{finger2_idx}_Z"]

        # Try alternative column naming
        if not all(col in self.normalized_data.columns for col in finger1_cols):
            # Use landmark name based columns
            landmarks = ['THUMB_TIP', 'INDEX_TIP', 'MIDDLE_TIP']
            finger1_name = landmarks[0] if 'thumb' in finger_pair else landmarks[finger1_idx]
            finger2_name = landmarks[1] if 'index' in finger_pair else landmarks[2]
            finger1_cols = [f"{finger1_name}_X", f"{finger1_name}_Y", f"{finger1_name}_Z"]
            finger2_cols = [f"{finger2_name}_X", f"{finger2_name}_Y", f"{finger2_name}_Z"]

        pos1 = self.normalized_data[[c for c in finger1_cols if c in self.normalized_data.columns]].values
        pos2 = self.normalized_data[[c for c in finger2_cols if c in self.normalized_data.columns]].values

        # Compute aperture distance
        if pos1.shape[1] == 3 and pos2.shape[1] == 3:
            aperture = np.linalg.norm(pos1 - pos2, axis=1)
        else:
            # Fallback: use precomputed column
            if 'Thumb_Index_Distance' in self.normalized_data.columns:
                aperture = self.normalized_data['Thumb_Index_Distance'].values
            else:
                aperture = np.zeros(len(self.normalized_data))

        # Compute metrics
        max_aperture = float(np.max(aperture))
        min_aperture = float(np.min(aperture))
        mean_aperture = float(np.mean(aperture))
        std_aperture = float(np.std(aperture))

        # Detect aperture/closure cycles
        peaks, _ = self.peak_detector.find_peaks_adaptive(aperture)
        valleys, _ = self.peak_detector.find_peaks_adaptive(-aperture)

        n_cycles = min(len(peaks), len(valleys))

        return AnalysisResult(
            output_type='hand_aperture',
            data={
                'aperture_timeseries': aperture.tolist(),
                'frames': self.normalized_data['Frame'].tolist() if 'Frame' in self.normalized_data.columns else list(range(len(aperture))),
                'peaks': peaks.tolist(),
                'valleys': valleys.tolist(),
            },
            metrics={
                'max_aperture': max_aperture,
                'min_aperture': min_aperture,
                'mean_aperture': mean_aperture,
                'std_aperture': std_aperture,
                'range_aperture': max_aperture - min_aperture,
                'n_cycles': n_cycles,
            },
            metadata={'finger_pair': finger_pair, 'hand': hand}
        )

    def _generate_cyclogram_3d(self, params: Dict) -> AnalysisResult:
        """Generate 3D cyclogram (velocity-position phase plot)"""
        fingertip = params.get('fingertip', 'index_tip')
        hand = params.get('hand', 'right')

        # Get fingertip index
        tip_idx = FINGERTIP_INDICES[fingertip]

        # Extract position
        pos_cols = [f"L{tip_idx}_X", f"L{tip_idx}_Y", f"L{tip_idx}_Z"]

        # Try alternative naming
        if not all(col in self.normalized_data.columns for col in pos_cols):
            tip_name = fingertip.upper().replace('_', '')
            pos_cols = [f"{tip_name}_X", f"{tip_name}_Y", f"{tip_name}_Z"]

        position = self.normalized_data[[c for c in pos_cols if c in self.normalized_data.columns]].values

        # Compute velocity
        velocity = np.diff(position, axis=0, prepend=position[0:1])

        return AnalysisResult(
            output_type='cyclogram_3d',
            data={
                'position_x': position[:, 0].tolist() if position.shape[1] > 0 else [],
                'position_y': position[:, 1].tolist() if position.shape[1] > 1 else [],
                'position_z': position[:, 2].tolist() if position.shape[1] > 2 else [],
                'velocity_x': velocity[:, 0].tolist() if velocity.shape[1] > 0 else [],
                'velocity_y': velocity[:, 1].tolist() if velocity.shape[1] > 1 else [],
                'velocity_z': velocity[:, 2].tolist() if velocity.shape[1] > 2 else [],
            },
            metrics={
                'max_velocity': float(np.max(np.linalg.norm(velocity, axis=1))) if velocity.shape[1] == 3 else 0.0,
                'mean_velocity': float(np.mean(np.linalg.norm(velocity, axis=1))) if velocity.shape[1] == 3 else 0.0,
            },
            metadata={'fingertip': fingertip, 'hand': hand}
        )

    def _generate_trajectory_3d(self, params: Dict) -> AnalysisResult:
        """Generate 3D trajectory plot"""
        fingertip = params.get('fingertip', 'index_tip')
        hand = params.get('hand', 'right')

        tip_idx = FINGERTIP_INDICES[fingertip]
        pos_cols = [f"L{tip_idx}_X", f"L{tip_idx}_Y", f"L{tip_idx}_Z"]

        position = self.normalized_data[[c for c in pos_cols if c in self.normalized_data.columns]].values

        # Compute path length
        if position.shape[1] == 3:
            distances = np.linalg.norm(np.diff(position, axis=0), axis=1)
            total_length = float(np.sum(distances))
        else:
            total_length = 0.0

        return AnalysisResult(
            output_type='trajectory_3d',
            data={
                'x': position[:, 0].tolist() if position.shape[1] > 0 else [],
                'y': position[:, 1].tolist() if position.shape[1] > 1 else [],
                'z': position[:, 2].tolist() if position.shape[1] > 2 else [],
            },
            metrics={
                'path_length': total_length,
                'n_points': len(position),
            },
            metadata={'fingertip': fingertip, 'hand': hand}
        )

    def _generate_rom_plot(self, params: Dict) -> AnalysisResult:
        """Generate Range of Motion (ROM) plot"""
        plot_type = params.get('plotType', 'violin')
        measurement = params.get('measurement', 'flexion')
        fingers = params.get('fingers', {'index': True})
        hand = params.get('hand', 'right')

        # Compute finger joint angles for selected fingers
        rom_data = {}

        for finger_name, enabled in fingers.items():
            if not enabled:
                continue

            if finger_name not in FINGER_LANDMARKS:
                continue

            landmark_indices = FINGER_LANDMARKS[finger_name]

            # Compute angles for MCP, PIP, DIP joints
            angles = self._compute_finger_angles(landmark_indices)

            rom_data[finger_name] = {
                'angles': angles.tolist(),
                'max': float(np.max(angles)),
                'min': float(np.min(angles)),
                'mean': float(np.mean(angles)),
                'range': float(np.max(angles) - np.min(angles)),
            }

        return AnalysisResult(
            output_type='rom_plot',
            data=rom_data,
            metrics={
                'n_fingers': len(rom_data),
                'measurement': measurement,
            },
            metadata={'plot_type': plot_type, 'hand': hand}
        )

    def _compute_finger_angles(self, landmark_indices: List[int]) -> np.ndarray:
        """Compute joint angles for a finger"""
        # landmark_indices: [MCP, PIP, DIP, TIP]
        if len(landmark_indices) < 3:
            return np.array([])

        angles = []

        for idx in range(len(landmark_indices) - 2):
            p1_idx = landmark_indices[idx]
            p2_idx = landmark_indices[idx + 1]
            p3_idx = landmark_indices[idx + 2]

            # Get positions
            p1_cols = [f"L{p1_idx}_X", f"L{p1_idx}_Y", f"L{p1_idx}_Z"]
            p2_cols = [f"L{p2_idx}_X", f"L{p2_idx}_Y", f"L{p2_idx}_Z"]
            p3_cols = [f"L{p3_idx}_X", f"L{p3_idx}_Y", f"L{p3_idx}_Z"]

            # Check if columns exist
            if not all(c in self.normalized_data.columns for c in p1_cols + p2_cols + p3_cols):
                continue

            p1 = self.normalized_data[p1_cols].values
            p2 = self.normalized_data[p2_cols].values
            p3 = self.normalized_data[p3_cols].values

            # Compute angle at p2
            v1 = p1 - p2
            v2 = p3 - p2

            # Angle between vectors
            cos_angle = np.sum(v1 * v2, axis=1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-10)
            cos_angle = np.clip(cos_angle, -1, 1)
            angle = np.arccos(cos_angle) * 180 / np.pi

            angles.append(angle)

        if angles:
            return np.mean(angles, axis=0)
        return np.array([])

    def _generate_tremor_spectrogram(self, params: Dict) -> AnalysisResult:
        """Generate tremor wavelet spectrogram"""
        hand = params.get('hand', 'both')

        # Use INDEX_TIP for tremor analysis (wrist is always 0,0,0 after wrist-centering)
        # INDEX_TIP (landmark 8) captures hand tremor more accurately
        tip_cols = ['INDEX_TIP_X', 'INDEX_TIP_Y', 'INDEX_TIP_Z']
        if not all(c in self.normalized_data.columns for c in tip_cols):
            tip_cols = ['L8_X', 'L8_Y', 'L8_Z']
            if not all(c in self.normalized_data.columns for c in tip_cols):
                # Fallback to wrist if available (non-wrist-centered data)
                tip_cols = ['WRIST_X', 'WRIST_Y', 'WRIST_Z']

        position = self.normalized_data[[c for c in tip_cols if c in self.normalized_data.columns]].values

        # Compute tremor magnitude
        if position.shape[1] == 3:
            velocity = np.diff(position, axis=0, prepend=position[0:1])
            tremor_mag = np.linalg.norm(velocity, axis=1)
        else:
            tremor_mag = np.zeros(len(self.normalized_data))

        # Simple FFT for frequency analysis

        fft_vals = fft(tremor_mag)
        freqs = fftfreq(len(tremor_mag), 1/self.fps)

        # Focus on tremor band (3-12 Hz)
        tremor_band = (freqs >= 3) & (freqs <= 12)
        power = np.abs(fft_vals[tremor_band])
        tremor_freqs = freqs[tremor_band]

        # Dominant frequency
        if len(power) > 0:
            dominant_freq = float(tremor_freqs[np.argmax(power)])
            max_power = float(np.max(power))
        else:
            dominant_freq = 0.0
            max_power = 0.0

        return AnalysisResult(
            output_type='tremor_spectrogram',
            data={
                'tremor_magnitude': tremor_mag.tolist(),
                'frequencies': tremor_freqs.tolist(),
                'power': power.tolist(),
            },
            metrics={
                'dominant_frequency': dominant_freq,
                'max_power': max_power,
                'tremor_severity': float(np.mean(tremor_mag)),
            },
            metadata={'hand': hand}
        )

    def _generate_opening_closing_velocity(self, params: Dict) -> AnalysisResult:
        """Generate opening/closing velocity analysis"""
        hand = params.get('hand', 'right')

        # Use hand aperture for opening/closing
        if 'Hand_Aperture_Distance' in self.normalized_data.columns:
            aperture = self.normalized_data['Hand_Aperture_Distance'].values
        else:
            aperture = np.zeros(len(self.normalized_data))

        # Compute velocity
        velocity = np.diff(aperture, prepend=aperture[0]) * self.fps

        # Separate opening (positive) and closing (negative) velocities
        opening_vel = velocity[velocity > 0]
        closing_vel = np.abs(velocity[velocity < 0])

        return AnalysisResult(
            output_type='opening_closing_velocity',
            data={
                'velocity': velocity.tolist(),
                'opening_velocities': opening_vel.tolist(),
                'closing_velocities': closing_vel.tolist(),
            },
            metrics={
                'mean_opening_velocity': float(np.mean(opening_vel)) if len(opening_vel) > 0 else 0.0,
                'mean_closing_velocity': float(np.mean(closing_vel)) if len(closing_vel) > 0 else 0.0,
                'std_opening_velocity': float(np.std(opening_vel)) if len(opening_vel) > 0 else 0.0,
                'std_closing_velocity': float(np.std(closing_vel)) if len(closing_vel) > 0 else 0.0,
            },
            metadata={'hand': hand}
        )

    def _generate_cycle_frequency(self, params: Dict) -> AnalysisResult:
        """Generate cycle frequency analysis"""
        hand = params.get('hand', 'right')

        # Use aperture cycles
        if 'Hand_Aperture_Distance' in self.normalized_data.columns:
            aperture = self.normalized_data['Hand_Aperture_Distance'].values
        else:
            aperture = np.zeros(len(self.normalized_data))

        # Detect peaks (cycles)
        peaks, _ = self.peak_detector.find_peaks_adaptive(aperture)

        if len(peaks) > 1:
            # Compute inter-peak intervals
            intervals = np.diff(peaks) / self.fps  # Convert to seconds
            frequency = 1.0 / np.mean(intervals) if len(intervals) > 0 else 0.0
        else:
            intervals = np.array([])
            frequency = 0.0

        return AnalysisResult(
            output_type='cycle_frequency',
            data={
                'peak_indices': peaks.tolist(),
                'intervals': intervals.tolist(),
            },
            metrics={
                'frequency_hz': float(frequency),
                'n_cycles': len(peaks),
                'mean_interval': float(np.mean(intervals)) if len(intervals) > 0 else 0.0,
            },
            metadata={'hand': hand}
        )

    def _generate_cycle_variability(self, params: Dict) -> AnalysisResult:
        """Generate cycle variability analysis"""
        hand = params.get('hand', 'right')

        # Use aperture cycles
        if 'Hand_Aperture_Distance' in self.normalized_data.columns:
            aperture = self.normalized_data['Hand_Aperture_Distance'].values
        else:
            aperture = np.zeros(len(self.normalized_data))

        peaks, _ = self.peak_detector.find_peaks_adaptive(aperture)

        if len(peaks) > 2:
            intervals = np.diff(peaks) / self.fps
            variability = np.std(intervals) / np.mean(intervals) if np.mean(intervals) > 0 else 0.0
        else:
            variability = 0.0

        return AnalysisResult(
            output_type='cycle_variability',
            data={'peak_indices': peaks.tolist()},
            metrics={
                'coefficient_of_variation': float(variability),
                'n_cycles': len(peaks),
            },
            metadata={'hand': hand}
        )

    def _generate_inter_finger_coordination(self, params: Dict) -> AnalysisResult:
        """Generate inter-finger coordination analysis"""
        finger1 = params.get('finger1', 'thumb')
        finger2 = params.get('finger2', 'index')
        hand = params.get('hand', 'right')

        # Get fingertip trajectories
        tip1_idx = FINGERTIP_INDICES[f"{finger1}_tip"]
        tip2_idx = FINGERTIP_INDICES[f"{finger2}_tip"]

        pos1 = self._get_landmark_position(tip1_idx)
        pos2 = self._get_landmark_position(tip2_idx)

        # Compute cross-correlation
        if len(pos1) > 0 and len(pos2) > 0:
            correlation = sp_signal.correlate(pos1[:, 0], pos2[:, 0], mode='same')
            max_corr = float(np.max(correlation) / (len(pos1) * np.std(pos1[:, 0]) * np.std(pos2[:, 0]) + 1e-10))
        else:
            max_corr = 0.0

        return AnalysisResult(
            output_type='inter_finger_coordination',
            data={'correlation': correlation.tolist() if len(pos1) > 0 else []},
            metrics={'max_correlation': max_corr},
            metadata={'finger1': finger1, 'finger2': finger2, 'hand': hand}
        )

    def _generate_cycle_symmetry(self, params: Dict) -> AnalysisResult:
        """Generate cycle symmetry analysis"""
        # Compare left vs right hand cycles
        # Placeholder implementation
        return AnalysisResult(
            output_type='cycle_symmetry',
            data={},
            metrics={'symmetry_index': 0.85},
            metadata={}
        )

    def _generate_geometric_curvature(self, params: Dict) -> AnalysisResult:
        """Generate geometric curvature analysis"""
        hand = params.get('hand', 'right')

        # Use index fingertip trajectory
        tip_idx = FINGERTIP_INDICES['index_tip']
        pos = self._get_landmark_position(tip_idx)

        if len(pos) > 2 and pos.shape[1] == 3:
            # Compute curvature from trajectory
            velocity = np.diff(pos, axis=0)
            acceleration = np.diff(velocity, axis=0)

            # Curvature = |v × a| / |v|^3
            cross = np.cross(velocity[:-1], acceleration)
            v_mag = np.linalg.norm(velocity[:-1], axis=1)
            curvature = np.linalg.norm(cross, axis=1) / (v_mag**3 + 1e-10)

            mean_curvature = float(np.mean(curvature))
        else:
            curvature = np.array([])
            mean_curvature = 0.0

        return AnalysisResult(
            output_type='geometric_curvature',
            data={'curvature': curvature.tolist()},
            metrics={'mean_curvature': mean_curvature},
            metadata={'hand': hand}
        )

    def _get_landmark_position(self, landmark_idx: int) -> np.ndarray:
        """Helper to get landmark position by index or name"""
        # Mapping from landmark index to name
        LANDMARK_NAMES_MAP = {
            0: 'WRIST',
            1: 'THUMB_CMC', 2: 'THUMB_MCP', 3: 'THUMB_IP', 4: 'THUMB_TIP',
            5: 'INDEX_MCP', 6: 'INDEX_PIP', 7: 'INDEX_DIP', 8: 'INDEX_TIP',
            9: 'MIDDLE_MCP', 10: 'MIDDLE_PIP', 11: 'MIDDLE_DIP', 12: 'MIDDLE_TIP',
            13: 'RING_MCP', 14: 'RING_PIP', 15: 'RING_DIP', 16: 'RING_TIP',
            17: 'PINKY_MCP', 18: 'PINKY_PIP', 19: 'PINKY_DIP', 20: 'PINKY_TIP',
        }
        
        # Try L-prefixed columns first
        cols = [f"L{landmark_idx}_X", f"L{landmark_idx}_Y", f"L{landmark_idx}_Z"]
        available_cols = [c for c in cols if c in self.normalized_data.columns]
        if len(available_cols) == 3:
            return self.normalized_data[available_cols].values
        
        # Try named columns
        if landmark_idx in LANDMARK_NAMES_MAP:
            name = LANDMARK_NAMES_MAP[landmark_idx]
            cols = [f"{name}_X", f"{name}_Y", f"{name}_Z"]
            available_cols = [c for c in cols if c in self.normalized_data.columns]
            if len(available_cols) == 3:
                return self.normalized_data[available_cols].values
        
        return np.array([])

    def _compile_results(self) -> Dict[str, Any]:
        """Compile all results into final output dictionary"""
        return {
            'events': {
                category: [e.to_dict() for e in events]
                for category, events in (self.events or {}).items()
            },
            'event_summary': self.event_detector.get_event_summary(self.events or {}),
            'analysis_outputs': [
                self._format_output_for_report(result)
                for result in self.analysis_results
            ],
            'protocol': {
                'movements': self.protocol_config.get('movements', []),
                'instructions': self.protocol_config.get('instructions', ''),
            },
            'stats': {
                'n_frames': len(self.normalized_data) if self.normalized_data is not None else 0,
                'duration_seconds': len(self.normalized_data) / self.fps if self.normalized_data is not None else 0.0,
                'fps': self.fps,
            }
        }

    def _format_output_for_report(self, result: AnalysisResult) -> Dict:
        """Format an AnalysisResult for the report generator"""
        # Human-readable names for output types
        OUTPUT_NAMES = {
            'hand_aperture': 'Hand Aperture',
            'cyclogram_3d': '3D Cyclogram',
            'trajectory_3d': '3D Trajectory',
            'rom_plot': 'Range of Motion',
            'tremor_spectrogram': 'Tremor Spectrogram',
            'opening_closing_velocity': 'Opening/Closing Velocity',
            'cycle_frequency': 'Cycle Frequency',
            'cycle_variability': 'Cycle Variability',
            'inter_finger_coordination': 'Inter-Finger Coordination',
            'cycle_symmetry': 'Cycle Symmetry',
            'geometric_curvature': 'Geometric Curvature',
            'sparc_smoothness': 'SPARC Smoothness',
            'ldljv_smoothness': 'LDLJ-V Smoothness',
            'bradykinesia_metrics': 'Bradykinesia Metrics',
            'fatigue_analysis': 'Fatigue Analysis',
            'tremor_regularity': 'Tremor Regularity',
            'clinical_summary': 'Clinical Summary',
        }

        name = OUTPUT_NAMES.get(result.output_type, result.output_type.replace('_', ' ').title())

        # Create plot_data based on output type
        plot_data = self._create_plot_data(result)

        return {
            'name': name,
            'type': result.output_type,
            'data': result.data,
            'plot_data': plot_data,
            'metrics': result.metrics,
            'metadata': result.metadata,
        }

    def _create_plot_data(self, result: AnalysisResult) -> Dict:
        """Create plot_data structure for visualization"""
        data = result.data
        output_type = result.output_type
        n_frames = len(self.normalized_data) if self.normalized_data is not None else 0

        # Generate time axis
        time = np.arange(n_frames) / self.fps if n_frames > 0 else []
        if isinstance(time, np.ndarray):
            time = time.tolist()

        if output_type == 'hand_aperture':
            return {
                'type': 'time_series',
                'x': data.get('frames', list(range(len(data.get('aperture_timeseries', []))))),
                'y': data.get('aperture_timeseries', []),
                'peaks': data.get('peaks', []),
                'xlabel': 'Frame',
                'ylabel': 'Aperture (normalized)',
            }

        elif output_type == 'cyclogram_3d':
            return {
                'type': 'scatter',
                'x': data.get('position', []),
                'y': data.get('velocity', []),
                'xlabel': 'Position (normalized)',
                'ylabel': 'Velocity',
            }

        elif output_type == 'trajectory_3d':
            return {
                'type': 'scatter',
                'x': data.get('x', []),
                'y': data.get('y', []),
                'xlabel': 'X Position',
                'ylabel': 'Y Position',
            }

        elif output_type == 'rom_plot':
            finger_roms = data.get('finger_roms', {})
            return {
                'type': 'bar',
                'categories': list(finger_roms.keys()) if finger_roms else [],
                'values': list(finger_roms.values()) if finger_roms else [],
                'xlabel': 'Finger',
                'ylabel': 'ROM (normalized)',
            }

        elif output_type == 'tremor_spectrogram':
            return {
                'type': 'spectrogram',
                'data': data.get('spectrum', []),
                'frequencies': data.get('frequencies', []),
                'xlabel': 'Time',
                'ylabel': 'Frequency (Hz)',
            }

        elif output_type == 'opening_closing_velocity':
            return {
                'type': 'time_series',
                'x': time[:len(data.get('velocity', []))],
                'y': data.get('velocity', []),
                'peaks': data.get('peaks', []),
                'xlabel': 'Time (s)',
                'ylabel': 'Velocity',
            }

        elif output_type == 'cycle_frequency':
            return {
                'type': 'time_series',
                'x': list(range(len(data.get('frequencies', [])))),
                'y': data.get('frequencies', []),
                'xlabel': 'Cycle',
                'ylabel': 'Frequency (Hz)',
            }

        elif output_type == 'cycle_variability':
            return {
                'type': 'bar',
                'categories': ['CV Amplitude', 'CV Frequency', 'CV Duration'],
                'values': [
                    data.get('cv_amplitude', 0),
                    data.get('cv_frequency', 0),
                    data.get('cv_duration', 0),
                ],
                'xlabel': 'Metric',
                'ylabel': 'Coefficient of Variation',
            }

        elif output_type == 'inter_finger_coordination':
            return {
                'type': 'time_series',
                'x': time[:len(data.get('correlation_timeseries', []))],
                'y': data.get('correlation_timeseries', []),
                'xlabel': 'Time (s)',
                'ylabel': 'Correlation',
            }

        elif output_type == 'sparc_smoothness':
            # Show spectrum arc length visualization
            spectrum = data.get('spectrum', [])
            frequencies = data.get('frequencies', [])
            return {
                'type': 'time_series',
                'x': frequencies if frequencies else list(range(len(spectrum))),
                'y': spectrum,
                'xlabel': 'Frequency (Hz)',
                'ylabel': 'Power Spectrum',
            }

        elif output_type == 'ldljv_smoothness':
            jerk = data.get('jerk_profile', [])
            return {
                'type': 'time_series',
                'x': time[:len(jerk)],
                'y': jerk,
                'xlabel': 'Time (s)',
                'ylabel': 'Jerk Magnitude',
            }

        elif output_type == 'bradykinesia_metrics':
            metrics = result.metrics
            return {
                'type': 'bar',
                'categories': ['Amplitude\nDecrement', 'Velocity\nReduction', 'Slowness\nScore', 'Hesitation\nIndex'],
                'values': [
                    metrics.get('amplitude_decrement', 0),
                    metrics.get('velocity_reduction', 0),
                    metrics.get('slowness_score', 0),
                    metrics.get('hesitation_index', 0),
                ],
                'xlabel': 'Metric',
                'ylabel': 'Value',
            }

        elif output_type == 'fatigue_analysis':
            metrics = result.metrics
            return {
                'type': 'bar',
                'categories': ['Performance\nDegradation', 'Velocity\nDecay', 'Rest Pause\nFrequency'],
                'values': [
                    metrics.get('performance_degradation_rate', 0),
                    metrics.get('velocity_decay', 0),
                    metrics.get('rest_pause_frequency', 0),
                ],
                'xlabel': 'Metric',
                'ylabel': 'Value',
            }

        elif output_type == 'tremor_regularity':
            return {
                'type': 'bar',
                'categories': ['Q-Factor', 'Tremor\nStability', 'Amplitude\nVariability'],
                'values': [
                    data.get('q_factor', 0) / 10,  # Scale down for visualization
                    data.get('tremor_stability', 0),
                    data.get('amplitude_variability', 0),
                ],
                'xlabel': 'Metric',
                'ylabel': 'Value (scaled)',
            }

        elif output_type == 'clinical_summary':
            scored = data.get('scored_biomarkers', [])
            return {
                'type': 'bar',
                'categories': [b.get('name', '')[:15] for b in scored[:8]],
                'values': [b.get('percentile', 0) for b in scored[:8]],
                'xlabel': 'Biomarker',
                'ylabel': 'Percentile Score',
            }

        # Default empty plot
        return {}

    # =========================================================================
    # BIOMARKER GENERATORS
    # =========================================================================

    def _generate_sparc_smoothness(self, params: Dict) -> AnalysisResult:
        """Generate SPARC smoothness analysis"""
        hand = params.get('hand', 'right')
        
        # Initialize biomarker calculator
        calc = BiomarkerCalculator(fs=self.fps)
        
        # Get index tip position for analysis
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) < 10 or position.shape[1] != 3:
            return AnalysisResult(
                output_type='sparc_smoothness',
                data={},
                metrics={'sparc': float('nan'), 'error': 'Insufficient data'},
                metadata={'hand': hand}
            )
        
        # Compute velocity
        velocity = np.gradient(position, 1.0/self.fps, axis=0)
        velocity_mag = np.linalg.norm(velocity, axis=1)
        
        # Compute SPARC
        sparc = calc.compute_sparc(velocity_mag)
        
        # Compute smoothness metrics
        smoothness = calc.compute_smoothness_metrics(position)
        
        return AnalysisResult(
            output_type='sparc_smoothness',
            data={
                'velocity_profile': velocity_mag.tolist(),
                'position_x': position[:, 0].tolist(),
                'position_y': position[:, 1].tolist(),
                'position_z': position[:, 2].tolist(),
            },
            metrics={
                'sparc': float(sparc) if not np.isnan(sparc) else None,
                'movement_duration': smoothness.movement_duration,
                'path_length': smoothness.path_length,
            },
            metadata={'hand': hand, 'landmark': 'index_tip'}
        )

    def _generate_ldljv_smoothness(self, params: Dict) -> AnalysisResult:
        """Generate LDLJ-V (Log Dimensionless Jerk) analysis"""
        hand = params.get('hand', 'right')
        
        calc = BiomarkerCalculator(fs=self.fps)
        
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) < 10 or position.shape[1] != 3:
            return AnalysisResult(
                output_type='ldljv_smoothness',
                data={},
                metrics={'ldljv': float('nan'), 'error': 'Insufficient data'},
                metadata={'hand': hand}
            )
        
        # Compute full smoothness metrics
        smoothness = calc.compute_smoothness_metrics(position)
        
        return AnalysisResult(
            output_type='ldljv_smoothness',
            data={
                'duration': smoothness.movement_duration,
                'path_length': smoothness.path_length,
            },
            metrics={
                'ldljv': float(smoothness.ldljv) if not np.isnan(smoothness.ldljv) else None,
                'ldlja': float(smoothness.ldlja) if not np.isnan(smoothness.ldlja) else None,
                'normalized_jerk': float(smoothness.normalized_jerk) if not np.isnan(smoothness.normalized_jerk) else None,
                'sparc': float(smoothness.sparc) if not np.isnan(smoothness.sparc) else None,
            },
            metadata={'hand': hand, 'landmark': 'index_tip'}
        )

    def _generate_bradykinesia_metrics(self, params: Dict) -> AnalysisResult:
        """Generate bradykinesia assessment metrics"""
        hand = params.get('hand', 'right')
        
        calc = BiomarkerCalculator(fs=self.fps)
        
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) < 20 or position.shape[1] != 3:
            return AnalysisResult(
                output_type='bradykinesia_metrics',
                data={},
                metrics={'error': 'Insufficient data'},
                metadata={'hand': hand}
            )
        
        # Compute position magnitude for cycle detection
        pos_mag = np.linalg.norm(position, axis=1)
        
        # Compute bradykinesia metrics
        brady = calc.compute_bradykinesia_metrics(pos_mag)
        
        return AnalysisResult(
            output_type='bradykinesia_metrics',
            data={
                'inter_movement_intervals': brady.inter_movement_intervals,
            },
            metrics={
                'amplitude_decrement': float(brady.amplitude_decrement) if not np.isnan(brady.amplitude_decrement) else None,
                'velocity_reduction': float(brady.velocity_reduction) if not np.isnan(brady.velocity_reduction) else None,
                'slowness_score': float(brady.slowness_score) if not np.isnan(brady.slowness_score) else None,
                'hesitation_index': float(brady.hesitation_index) if not np.isnan(brady.hesitation_index) else None,
                'movement_blocks': brady.movement_blocks,
            },
            metadata={'hand': hand, 'landmark': 'index_tip'}
        )

    def _generate_fatigue_analysis(self, params: Dict) -> AnalysisResult:
        """Generate fatigue indicator analysis"""
        hand = params.get('hand', 'right')
        
        calc = BiomarkerCalculator(fs=self.fps)
        
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) < 30 or position.shape[1] != 3:
            return AnalysisResult(
                output_type='fatigue_analysis',
                data={},
                metrics={'error': 'Insufficient data for fatigue analysis'},
                metadata={'hand': hand}
            )
        
        pos_mag = np.linalg.norm(position, axis=1)
        
        # Compute fatigue metrics
        fatigue = calc.compute_fatigue_metrics(pos_mag)
        
        return AnalysisResult(
            output_type='fatigue_analysis',
            data={},
            metrics={
                'performance_degradation_rate': float(fatigue.performance_degradation_rate) if not np.isnan(fatigue.performance_degradation_rate) else None,
                'velocity_decay': float(fatigue.velocity_decay) if not np.isnan(fatigue.velocity_decay) else None,
                'amplitude_decay': float(fatigue.amplitude_decay) if not np.isnan(fatigue.amplitude_decay) else None,
                'rest_pause_frequency': float(fatigue.rest_pause_frequency),
                'consistency_decline': float(fatigue.consistency_decline) if not np.isnan(fatigue.consistency_decline) else None,
            },
            metadata={'hand': hand, 'landmark': 'index_tip'}
        )

    def _generate_tremor_regularity(self, params: Dict) -> AnalysisResult:
        """Generate tremor regularity assessment"""
        hand = params.get('hand', 'both')
        freq_band = params.get('freq_band', (3.0, 12.0))
        
        calc = BiomarkerCalculator(fs=self.fps)
        
        # Use index tip for tremor analysis
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) < 30 or position.shape[1] != 3:
            return AnalysisResult(
                output_type='tremor_regularity',
                data={},
                metrics={'error': 'Insufficient data for tremor regularity'},
                metadata={'hand': hand}
            )
        
        # Use velocity for tremor analysis
        velocity = np.gradient(position, 1.0/self.fps, axis=0)
        vel_mag = np.linalg.norm(velocity, axis=1)
        
        # Compute tremor regularity metrics
        tremor_reg = calc.compute_tremor_regularity_metrics(vel_mag, freq_band=freq_band)
        
        return AnalysisResult(
            output_type='tremor_regularity',
            data={},
            metrics={
                'q_factor': float(tremor_reg.q_factor) if not np.isnan(tremor_reg.q_factor) else None,
                'tremor_stability': float(tremor_reg.tremor_stability) if not np.isnan(tremor_reg.tremor_stability) else None,
                'amplitude_variability': float(tremor_reg.amplitude_variability) if not np.isnan(tremor_reg.amplitude_variability) else None,
                'frequency_drift': float(tremor_reg.frequency_drift) if not np.isnan(tremor_reg.frequency_drift) else None,
            },
            metadata={'hand': hand, 'freq_band': freq_band}
        )

    def _generate_clinical_summary(self, params: Dict) -> AnalysisResult:
        """Generate comprehensive clinical summary with severity scoring"""
        
        # Collect all biomarkers from analysis
        biomarkers = {}
        
        # Get smoothness metrics
        tip_idx = FINGERTIP_INDICES['index_tip']
        position = self._get_landmark_position(tip_idx)
        
        if len(position) >= 10 and position.shape[1] == 3:
            calc = BiomarkerCalculator(fs=self.fps)
            
            # Smoothness
            smoothness = calc.compute_smoothness_metrics(position)
            biomarkers['sparc'] = smoothness.sparc
            biomarkers['ldljv'] = smoothness.ldljv
            biomarkers['normalized_jerk'] = smoothness.normalized_jerk
            
            # Bradykinesia
            pos_mag = np.linalg.norm(position, axis=1)
            if len(pos_mag) >= 20:
                brady = calc.compute_bradykinesia_metrics(pos_mag)
                biomarkers['amplitude_decrement'] = brady.amplitude_decrement
                biomarkers['velocity_reduction'] = brady.velocity_reduction
                biomarkers['slowness_score'] = brady.slowness_score
                biomarkers['hesitation_index'] = brady.hesitation_index
            
            # Fatigue
            if len(pos_mag) >= 30:
                fatigue = calc.compute_fatigue_metrics(pos_mag)
                biomarkers['performance_degradation_rate'] = fatigue.performance_degradation_rate
                biomarkers['velocity_decay'] = fatigue.velocity_decay
                biomarkers['rest_pause_frequency'] = fatigue.rest_pause_frequency
            
            # Tremor regularity
            velocity = np.gradient(position, 1.0/self.fps, axis=0)
            vel_mag = np.linalg.norm(velocity, axis=1)
            if len(vel_mag) >= 30:
                tremor_reg = calc.compute_tremor_regularity_metrics(vel_mag)
                biomarkers['q_factor'] = tremor_reg.q_factor
                biomarkers['tremor_stability'] = tremor_reg.tremor_stability
        
        # Clinical scoring
        engine = ClinicalScoringEngine()
        summary = engine.score_all(biomarkers)
        
        # Convert scored biomarkers to serializable format
        scored_list = []
        for sb in summary.scored_biomarkers:
            scored_list.append({
                'name': sb.name,
                'value': float(sb.value) if not np.isnan(sb.value) else None,
                'unit': sb.unit,
                'severity': str(sb.severity),
                'percentile_score': float(sb.percentile_score),
                'interpretation': sb.interpretation,
            })
        
        return AnalysisResult(
            output_type='clinical_summary',
            data={
                'scored_biomarkers': scored_list,
                'domain_scores': summary.domain_scores,
            },
            metrics={
                'overall_score': float(summary.overall_score),
                'overall_severity': str(summary.overall_severity),
            },
            metadata={
                'clinical_summary': summary.clinical_summary,
                'recommendations': summary.recommendations,
            }
        )


# =============================================================================
# PROTOCOL_ANALYZER_ADAPTIVE.PY
# =============================================================================




# Import original protocol analyzer for base functionality


class AdaptiveProtocolAnalyzer(ProtocolAnalyzer):
    """
    Enhanced protocol analyzer with adaptive filtering.

    Enhancements:
    - Automatic filter calibration from signal characteristics
    - Robust outlier detection and removal
    - Dynamic thresholding for peak detection
    - Filter effectiveness reporting
    """

    def __init__(
        self,
        protocol_config: Dict,
        fps: int = 30,
        enable_adaptive: bool = True,
        outlier_detection_aggressive: bool = False
    ):
        """
        Args:
            protocol_config: Protocol configuration dict from database
            fps: Frames per second of recording
            enable_adaptive: Enable adaptive filtering (vs fixed filters)
            outlier_detection_aggressive: Use aggressive outlier removal
        """
        # Initialize base class
        super().__init__(protocol_config, fps)

        self.enable_adaptive = enable_adaptive
        self.outlier_detection_aggressive = outlier_detection_aggressive

        # Replace fixed filters with adaptive components
        if enable_adaptive:
            print("🎯 Adaptive filtering enabled")

            # Adaptive filter chain with auto-calibration
            self.adaptive_chain = AdaptiveFilterChain(fs=fps, auto_calibrate=True)

            # Outlier detection pipeline
            self.outlier_pipeline = OutlierDetectionPipeline(
                aggressive=outlier_detection_aggressive
            )

            # Dynamic threshold engine for peak detection
            self.dynamic_threshold_engine = DynamicThresholdEngine(
                fs=fps,
                enable_drift_correction=True,
                enable_hysteresis=True
            )

            # Filter calibrator for reporting
            self.calibrator = FilterCalibrator(fs=fps)

        # Storage for adaptive results
        self.calibration_report: Optional[Dict] = None
        self.outlier_report: Optional[Dict] = None

    def analyze(self, raw_data: pd.DataFrame) -> Dict[str, Any]:
        """
        Enhanced analysis pipeline with adaptive filtering.

        Args:
            raw_data: Raw landmark DataFrame

        Returns:
            Dictionary with all analysis results + adaptive reports
        """
        print(f"\n{'='*70}")
        print(" ADAPTIVE PROTOCOL-DRIVEN ANALYSIS")
        print(f"{'='*70}\n")

        # Step 1: Normalize data
        print("Step 1: Normalizing data...")
        self.normalized_data = self.normalizer.normalize(raw_data)
        print(f"  ✓ Normalized {len(self.normalized_data)} frames")

        # Extract landmark data for filtering
        landmark_cols = [col for col in self.normalized_data.columns
                        if any(lm in col for lm in ['WRIST', 'THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'])]
        landmark_data = self.normalized_data[landmark_cols].values

        if self.enable_adaptive:
            # Step 2a: Calibrate filters from signal characteristics
            print("\nStep 2a: Calibrating adaptive filters...")
            calibration = self.calibrator.calibrate(landmark_data)
            print(f"  ✓ Signal characteristics:")
            print(f"    - SNR: {calibration.snr:.2f}")
            print(f"    - Motion frequency: {calibration.motion_frequency:.2f} Hz")
            print(f"    - Noise level: {calibration.noise_std:.3f}")
            print(f"  ✓ Recommended filters: {', '.join(calibration.recommended_filters)}")

            self.calibration_report = {
                'snr': float(calibration.snr),
                'motion_frequency_hz': float(calibration.motion_frequency),
                'noise_std': float(calibration.noise_std),
                'motion_speed': float(calibration.motion_speed),
                'signal_std': float(calibration.signal_std),
                'recommended_filters': calibration.recommended_filters
            }

            # Step 2b: Remove outliers
            print("\nStep 2b: Removing outliers...")
            clean_data, outlier_report = self.outlier_pipeline.apply(landmark_data)
            print(f"  ✓ Outlier removal applied:")
            print(f"    - Hampel filter: {'✓' if outlier_report.get('hampel_applied') else '✗'}")
            print(f"    - MAD gating: {'✓' if outlier_report.get('mad_gating_applied') else '✗'}")
            print(f"    - Velocity clamping: {'✓' if outlier_report.get('velocity_clamp_applied') else '✗'}")

            self.outlier_report = outlier_report

            # Step 2c: Apply adaptive filters
            print("\nStep 2c: Applying adaptive filters...")
            self.adaptive_chain.calibrate(clean_data)
            self.filtered_data = self.adaptive_chain.apply(clean_data)

            calibration_summary = self.adaptive_chain.get_calibration_summary()
            print(f"  ✓ Applied adaptive filter chain:")
            for filter_name in calibration_summary.get('filters_applied', []):
                print(f"    - {filter_name}")

        else:
            # Standard fixed filtering
            print("\nStep 2: Applying standard filters...")
            self.filtered_data = self.filter_chain.apply(landmark_data)
            print(f"  ✓ Applied {len(self.filter_chain.filters)} filters")

        # Step 3: Event detection (unchanged from base class)
        print("\nStep 3: Detecting events...")
        sequences = self.normalizer.normalize_for_lstm(raw_data)
        self.events = self.event_detector.detect_events(sequences)
        event_summary = self.event_detector.get_event_summary(self.events)
        print(f"  ✓ Detected events:")
        for category, summary in event_summary.items():
            if summary['count'] > 0:
                print(f"    - {category}: {summary['count']} events")

        # Step 4: Generate analysis outputs with adaptive peak detection
        print("\nStep 4: Generating analysis outputs...")
        self.analysis_results = []

        for output_name, config in self.analysis_outputs.items():
            if config.enabled:
                print(f"  - Generating {output_name}...")
                result = self._generate_output_adaptive(output_name, config)
                if result:
                    self.analysis_results.append(result)

        print(f"  ✓ Generated {len(self.analysis_results)} outputs")

        # Step 5: Compile results with adaptive reports
        return self._compile_results_adaptive()

    def _generate_output_adaptive(
        self,
        output_name: str,
        config: AnalysisOutputConfig
    ) -> Optional[AnalysisResult]:
        """Generate output using adaptive techniques where applicable"""

        # Use base class implementation, but override for specific outputs
        # that benefit from adaptive thresholding

        if output_name == 'handAperture' and self.enable_adaptive:
            return self._generate_hand_aperture_adaptive(config)
        elif output_name == 'cycleFrequency' and self.enable_adaptive:
            return self._generate_cycle_frequency_adaptive(config)
        else:
            # Use base class method
            return self._generate_output(output_name, config)

    def _generate_hand_aperture_adaptive(
        self, config: AnalysisOutputConfig
    ) -> Optional[AnalysisResult]:
        """Hand aperture with adaptive peak detection"""

        params = config.parameters
        finger_pair = params.get('fingerPair', 'thumb_index')

        # Get fingertip indices
        if finger_pair == 'thumb_index':
            tip1_idx = FINGERTIP_INDICES['thumb_tip']
            tip2_idx = FINGERTIP_INDICES['index_tip']
        elif finger_pair == 'thumb_middle':
            tip1_idx = FINGERTIP_INDICES['thumb_tip']
            tip2_idx = FINGERTIP_INDICES['middle_tip']
        else:
            tip1_idx = FINGERTIP_INDICES['thumb_tip']
            tip2_idx = FINGERTIP_INDICES['index_tip']

        # Compute aperture distance
        tip1 = self.filtered_data[:, tip1_idx*3:(tip1_idx+1)*3]
        tip2 = self.filtered_data[:, tip2_idx*3:(tip2_idx+1)*3]
        aperture = np.linalg.norm(tip1 - tip2, axis=1)

        # Adaptive peak detection
        peak_result = self.dynamic_threshold_engine.detect_peaks_comprehensive(
            aperture, method='dynamic_prominence'
        )

        # Compute metrics
        metrics = {
            'max_aperture': float(np.max(aperture)),
            'min_aperture': float(np.min(aperture)),
            'mean_aperture': float(np.mean(aperture)),
            'std_aperture': float(np.std(aperture)),
            'range_aperture': float(np.max(aperture) - np.min(aperture)),
            'n_cycles': len(peak_result.peak_indices),
            'peak_detection_threshold': float(peak_result.threshold_used)
        }

        # Plot data
        plot_data = {
            'type': 'time_series',
            'x': np.arange(len(aperture)) / self.fps,
            'y': aperture.tolist(),
            'peaks': peak_result.peak_indices.tolist(),
            'xlabel': 'Time (s)',
            'ylabel': 'Aperture Distance'
        }

        return AnalysisResult(
            output_type='handAperture',
            data=aperture,
            metrics=metrics,
            plots=plot_data,
            metadata={'adaptive_peak_detection': True}
        )

    def _generate_cycle_frequency_adaptive(
        self, config: AnalysisOutputConfig
    ) -> Optional[AnalysisResult]:
        """Cycle frequency with adaptive peak spacing"""

        # Get hand aperture
        tip1_idx = FINGERTIP_INDICES['thumb_tip']
        tip2_idx = FINGERTIP_INDICES['index_tip']

        tip1 = self.filtered_data[:, tip1_idx*3:(tip1_idx+1)*3]
        tip2 = self.filtered_data[:, tip2_idx*3:(tip2_idx+1)*3]
        aperture = np.linalg.norm(tip1 - tip2, axis=1)

        # Adaptive peak detection with period-based minimum distance
        peak_result = self.dynamic_threshold_engine.detect_peaks_comprehensive(
            aperture, method='adaptive_distance'
        )

        peaks = peak_result.peak_indices

        if len(peaks) < 2:
            return None

        # Compute cycle frequency
        inter_peak_intervals = np.diff(peaks) / self.fps  # seconds
        mean_period = np.mean(inter_peak_intervals)
        frequency = 1.0 / mean_period if mean_period > 0 else 0.0

        metrics = {
            'frequency_hz': float(frequency),
            'mean_period_s': float(mean_period),
            'std_period_s': float(np.std(inter_peak_intervals)),
            'n_cycles': len(peaks),
            'adaptive_min_distance': True
        }

        plot_data = {
            'type': 'bar',
            'categories': ['Frequency (Hz)'],
            'values': [frequency],
            'xlabel': 'Metric',
            'ylabel': 'Frequency (Hz)'
        }

        return AnalysisResult(
            output_type='cycleFrequency',
            data=peaks,
            metrics=metrics,
            plots=plot_data,
            metadata={'adaptive_peak_spacing': True}
        )

    def _compile_results_adaptive(self) -> Dict[str, Any]:
        """Compile results with adaptive filtering reports"""
        # Get base results
        base_results = self._compile_results()

        # Add adaptive filtering information
        if self.enable_adaptive:
            base_results['adaptive_filtering'] = {
                'enabled': True,
                'calibration': self.calibration_report,
                'outlier_removal': self.outlier_report,
                'filter_chain': self.adaptive_chain.get_calibration_summary()
            }
        else:
            base_results['adaptive_filtering'] = {
                'enabled': False
            }

        return base_results

    def get_filtering_report(self) -> Dict[str, Any]:
        """Get detailed filtering effectiveness report"""
        if not self.enable_adaptive:
            return {'adaptive_filtering_enabled': False}

        report = {
            'adaptive_filtering_enabled': True,
            'signal_characteristics': self.calibration_report,
            'outlier_removal': self.outlier_report,
            'filters_applied': self.adaptive_chain.get_calibration_summary(),
        }

        # Compute before/after metrics if possible
        if hasattr(self, 'normalized_data') and hasattr(self, 'filtered_data'):
            landmark_cols = [col for col in self.normalized_data.columns
                            if any(lm in col for lm in ['WRIST', 'THUMB', 'INDEX'])]
            original_data = self.normalized_data[landmark_cols].values

            # Smoothness improvement
            smoothness_before = np.mean(np.abs(np.diff(original_data, axis=0)))
            smoothness_after = np.mean(np.abs(np.diff(self.filtered_data, axis=0)))
            smoothness_improvement = (smoothness_before - smoothness_after) / smoothness_before * 100

            report['effectiveness'] = {
                'smoothness_improvement_percent': float(smoothness_improvement),
                'noise_reduction_achieved': smoothness_improvement > 10
            }

        return report


def create_protocol_analyzer(
    protocol_config: Dict,
    fps: int = 30,
    use_adaptive: bool = True,
    **kwargs
) -> ProtocolAnalyzer:
    """
    Factory function to create protocol analyzer.

    Args:
        protocol_config: Protocol configuration
        fps: Frame rate
        use_adaptive: Use adaptive filtering
        **kwargs: Additional parameters for AdaptiveProtocolAnalyzer

    Returns:
        ProtocolAnalyzer instance (adaptive or standard)
    """
    if use_adaptive:
        return AdaptiveProtocolAnalyzer(
            protocol_config, fps, enable_adaptive=True, **kwargs
        )
    else:
        return ProtocolAnalyzer(protocol_config, fps)


# =============================================================================
# BIOMARKERS.PY
# =============================================================================




@dataclass
class SmoothnessMetrics:
    """Container for movement smoothness metrics"""
    sparc: float  # Spectral Arc Length
    ldljv: float  # Log Dimensionless Jerk (velocity-based)
    ldlja: float  # Log Dimensionless Jerk (acceleration-based)
    normalized_jerk: float  # Normalized integrated jerk
    movement_duration: float  # Movement duration in seconds
    path_length: float  # Total path length


@dataclass
class BradykinesiaMetrics:
    """Container for bradykinesia assessment metrics"""
    amplitude_decrement: float  # Ratio of late to early movement amplitude
    velocity_reduction: float  # Ratio of late to early peak velocity
    slowness_score: float  # Inverse of cycle frequency (seconds per cycle)
    hesitation_index: float  # Time to first significant movement
    movement_blocks: int  # Number of movement interruptions
    inter_movement_intervals: List[float]  # Pauses between movements


@dataclass
class FatigueMetrics:
    """Container for fatigue indicator metrics"""
    performance_degradation_rate: float  # Slope of performance over time
    velocity_decay: float  # Rate of velocity decrease
    amplitude_decay: float  # Rate of amplitude decrease
    rest_pause_frequency: float  # Frequency of rest pauses
    consistency_decline: float  # Increase in movement variability


@dataclass
class AsymmetryMetrics:
    """Container for bilateral asymmetry indices"""
    amplitude_asymmetry: float  # (R-L)/(R+L) for amplitude
    velocity_asymmetry: float  # (R-L)/(R+L) for velocity
    coordination_lag: float  # Temporal offset between hands
    phase_coherence: float  # Phase synchronization between hands


@dataclass
class TremorRegularityMetrics:
    """Container for tremor regularity assessment"""
    q_factor: float  # Resonance quality factor (bandwidth/center_freq)
    spectral_coherence: float  # Coherence of tremor signal
    tremor_stability: float  # Coefficient of variation of tremor frequency
    amplitude_variability: float  # CV of tremor amplitude
    frequency_drift: float  # Change in dominant frequency over time


class BiomarkerCalculator:
    """
    Calculator for clinical digital biomarkers from hand movement data.
    
    This class provides methods to compute various clinically-relevant metrics
    for assessing motor function, including movement smoothness, bradykinesia,
    fatigue, asymmetry, and tremor characteristics.
    """
    
    def __init__(self, fs: float = 30.0, 
                 movement_threshold: float = 0.01,
                 min_movement_duration: float = 0.1):
        """
        Initialize BiomarkerCalculator.
        
        Args:
            fs: Sampling frequency in Hz
            movement_threshold: Minimum velocity to consider as movement
            min_movement_duration: Minimum duration (s) to consider as valid movement
        """
        self.fs = fs
        self.movement_threshold = movement_threshold
        self.min_movement_duration = min_movement_duration
        self._dt = 1.0 / fs
    
    # =========================================================================
    # SMOOTHNESS METRICS
    # =========================================================================
    
    def compute_sparc(self, velocity: np.ndarray, 
                      freq_cutoff: float = 10.0,
                      amplitude_threshold: float = 0.05) -> float:
        """
        Compute Spectral Arc Length (SPARC) - a dimensionless smoothness metric.
        
        SPARC measures movement smoothness based on the arc length of the
        normalized magnitude spectrum. More negative values indicate less smooth
        (more jerky) movements.
        
        Reference: Balasubramanian et al. (2012)
        
        Args:
            velocity: Velocity signal (can be 1D or magnitude)
            freq_cutoff: Upper frequency limit for analysis (Hz)
            amplitude_threshold: Fraction of max for spectrum normalization
            
        Returns:
            SPARC value (typically -6 to -1, more negative = less smooth)
        """
        if len(velocity) < 4:
            return np.nan
        
        # Ensure 1D
        if velocity.ndim > 1:
            velocity = np.linalg.norm(velocity, axis=-1)
        
        # Compute FFT
        n = len(velocity)
        freq = fft.rfftfreq(n, d=self._dt)
        spectrum = np.abs(fft.rfft(velocity))
        
        # Normalize spectrum
        spectrum_norm = spectrum / (np.max(spectrum) + 1e-10)
        
        # Find cutoff index
        cutoff_idx = np.searchsorted(freq, freq_cutoff)
        if cutoff_idx < 2:
            return np.nan
        
        # Select valid frequency range (above amplitude threshold)
        valid_mask = spectrum_norm[:cutoff_idx] > amplitude_threshold
        if np.sum(valid_mask) < 2:
            # Fall back to all frequencies up to cutoff
            valid_mask = np.ones(cutoff_idx, dtype=bool)
        
        freq_valid = freq[:cutoff_idx][valid_mask]
        spectrum_valid = spectrum_norm[:cutoff_idx][valid_mask]
        
        if len(freq_valid) < 2:
            return np.nan
        
        # Compute arc length of normalized spectrum
        # Normalize frequency to [0, 1]
        freq_norm = freq_valid / freq_cutoff
        
        # Compute arc length: sum of sqrt((df)^2 + (dS)^2)
        df = np.diff(freq_norm)
        ds = np.diff(spectrum_valid)
        arc_length = np.sum(np.sqrt(df**2 + ds**2))
        
        # SPARC is negative arc length (so more negative = less smooth)
        sparc = -arc_length
        
        return sparc
    
    def compute_ldljv(self, velocity: np.ndarray, 
                      movement_duration: Optional[float] = None,
                      path_length: Optional[float] = None) -> float:
        """
        Compute Log Dimensionless Jerk (velocity-based) - LDLJ-V.
        
        This metric normalizes jerk by movement duration and path length,
        making it comparable across different movements.
        
        Reference: Hogan & Sternad (2009)
        
        Args:
            velocity: Velocity signal
            movement_duration: Duration in seconds (auto-computed if None)
            path_length: Total path length (auto-computed if None)
            
        Returns:
            LDLJ-V value (typically -9 to -4, more negative = less smooth)
        """
        if len(velocity) < 4:
            return np.nan
        
        # Ensure 1D (magnitude)
        if velocity.ndim > 1:
            velocity = np.linalg.norm(velocity, axis=-1)
        
        # Auto-compute duration and path length if not provided
        if movement_duration is None:
            movement_duration = len(velocity) * self._dt
        
        if path_length is None:
            path_length = np.sum(np.abs(velocity)) * self._dt
        
        if movement_duration < 1e-6 or path_length < 1e-6:
            return np.nan
        
        # Compute jerk (derivative of acceleration = 2nd derivative of velocity)
        # velocity -> acceleration -> jerk
        acceleration = np.gradient(velocity, self._dt)
        jerk = np.gradient(acceleration, self._dt)
        
        # Integrated squared jerk
        jerk_squared_integral = trapezoid(jerk**2, dx=self._dt)
        
        # Dimensionless jerk
        # DJ = sqrt(T^5 / L^2 * integral(jerk^2))
        dimensionless_jerk = np.sqrt(
            (movement_duration**5 / (path_length**2 + 1e-10)) * jerk_squared_integral
        )
        
        # Log transform (add small value to avoid log(0))
        ldljv = -np.log(dimensionless_jerk + 1e-10)
        
        return ldljv
    
    def compute_ldlja(self, position: np.ndarray,
                      movement_duration: Optional[float] = None,
                      amplitude: Optional[float] = None) -> float:
        """
        Compute Log Dimensionless Jerk (acceleration-based) - LDLJ-A.
        
        Alternative formulation using position amplitude for normalization.
        
        Args:
            position: Position signal
            movement_duration: Duration in seconds (auto-computed if None)
            amplitude: Movement amplitude (auto-computed if None)
            
        Returns:
            LDLJ-A value
        """
        if len(position) < 4:
            return np.nan
        
        # Ensure 1D
        if position.ndim > 1:
            position = np.linalg.norm(position, axis=-1)
        
        if movement_duration is None:
            movement_duration = len(position) * self._dt
        
        if amplitude is None:
            amplitude = np.ptp(position)  # Peak-to-peak amplitude
        
        if movement_duration < 1e-6 or amplitude < 1e-6:
            return np.nan
        
        # Compute jerk from position (3rd derivative)
        velocity = np.gradient(position, self._dt)
        acceleration = np.gradient(velocity, self._dt)
        jerk = np.gradient(acceleration, self._dt)
        
        # Integrated squared jerk
        jerk_squared_integral = trapezoid(jerk**2, dx=self._dt)
        
        # Dimensionless jerk (amplitude-based normalization)
        # DJ = sqrt(T^5 / A^2 * integral(jerk^2)) where A is amplitude
        dimensionless_jerk = np.sqrt(
            (movement_duration**5 / (amplitude**2 + 1e-10)) * jerk_squared_integral
        )
        
        ldlja = -np.log(dimensionless_jerk + 1e-10)
        
        return ldlja
    
    def compute_normalized_jerk(self, velocity: np.ndarray) -> float:
        """
        Compute simple normalized jerk metric.
        
        This is a more straightforward metric that computes the RMS jerk
        normalized by the RMS velocity.
        
        Args:
            velocity: Velocity signal
            
        Returns:
            Normalized jerk value (lower = smoother)
        """
        if len(velocity) < 4:
            return np.nan
        
        if velocity.ndim > 1:
            velocity = np.linalg.norm(velocity, axis=-1)
        
        acceleration = np.gradient(velocity, self._dt)
        jerk = np.gradient(acceleration, self._dt)
        
        rms_jerk = np.sqrt(np.mean(jerk**2))
        rms_velocity = np.sqrt(np.mean(velocity**2))
        
        if rms_velocity < 1e-10:
            return np.nan
        
        return rms_jerk / rms_velocity
    
    def compute_smoothness_metrics(self, position: np.ndarray,
                                   velocity: Optional[np.ndarray] = None) -> SmoothnessMetrics:
        """
        Compute all smoothness metrics for a movement.
        
        Args:
            position: Position signal (N,) or (N, D) for D dimensions
            velocity: Optional velocity signal (computed if not provided)
            
        Returns:
            SmoothnessMetrics dataclass with all smoothness values
        """
        if velocity is None:
            if position.ndim == 1:
                velocity = np.gradient(position, self._dt)
            else:
                velocity = np.gradient(position, self._dt, axis=0)
        
        # Compute magnitude if multi-dimensional
        if position.ndim > 1:
            pos_mag = np.linalg.norm(position, axis=-1)
            vel_mag = np.linalg.norm(velocity, axis=-1)
        else:
            pos_mag = position
            vel_mag = velocity
        
        movement_duration = len(position) * self._dt
        path_length = np.sum(np.abs(vel_mag)) * self._dt
        
        return SmoothnessMetrics(
            sparc=self.compute_sparc(vel_mag),
            ldljv=self.compute_ldljv(vel_mag, movement_duration, path_length),
            ldlja=self.compute_ldlja(pos_mag, movement_duration),
            normalized_jerk=self.compute_normalized_jerk(vel_mag),
            movement_duration=movement_duration,
            path_length=path_length
        )
    
    # =========================================================================
    # BRADYKINESIA METRICS
    # =========================================================================
    
    def compute_amplitude_decrement(self, amplitudes: np.ndarray,
                                    early_fraction: float = 0.33,
                                    late_fraction: float = 0.33) -> float:
        """
        Compute amplitude decrement ratio (late/early amplitude).
        
        This metric captures the progressive reduction in movement amplitude
        characteristic of bradykinesia.
        
        Args:
            amplitudes: Array of movement amplitudes for each cycle
            early_fraction: Fraction of cycles to consider as "early"
            late_fraction: Fraction of cycles to consider as "late"
            
        Returns:
            Amplitude decrement ratio (< 1.0 indicates decrement)
        """
        if len(amplitudes) < 3:
            return np.nan
        
        n = len(amplitudes)
        early_n = max(1, int(n * early_fraction))
        late_n = max(1, int(n * late_fraction))
        
        early_mean = np.mean(amplitudes[:early_n])
        late_mean = np.mean(amplitudes[-late_n:])
        
        if early_mean < 1e-10:
            return np.nan
        
        return late_mean / early_mean
    
    def compute_velocity_reduction(self, peak_velocities: np.ndarray,
                                   early_fraction: float = 0.33,
                                   late_fraction: float = 0.33) -> float:
        """
        Compute velocity reduction ratio (late/early peak velocity).
        
        Args:
            peak_velocities: Array of peak velocities for each cycle
            early_fraction: Fraction of cycles to consider as "early"
            late_fraction: Fraction of cycles to consider as "late"
            
        Returns:
            Velocity reduction ratio (< 1.0 indicates reduction)
        """
        if len(peak_velocities) < 3:
            return np.nan
        
        n = len(peak_velocities)
        early_n = max(1, int(n * early_fraction))
        late_n = max(1, int(n * late_fraction))
        
        early_mean = np.mean(peak_velocities[:early_n])
        late_mean = np.mean(peak_velocities[-late_n:])
        
        if early_mean < 1e-10:
            return np.nan
        
        return late_mean / early_mean
    
    def compute_hesitation_index(self, velocity: np.ndarray,
                                 threshold_fraction: float = 0.1) -> float:
        """
        Compute hesitation index - time to first significant movement.
        
        Args:
            velocity: Velocity signal
            threshold_fraction: Fraction of max velocity to consider "significant"
            
        Returns:
            Time (seconds) to first significant movement
        """
        if len(velocity) < 2:
            return np.nan
        
        if velocity.ndim > 1:
            velocity = np.linalg.norm(velocity, axis=-1)
        
        max_vel = np.max(np.abs(velocity))
        threshold = max_vel * threshold_fraction
        
        # Find first index where velocity exceeds threshold
        above_threshold = np.where(np.abs(velocity) > threshold)[0]
        
        if len(above_threshold) == 0:
            return len(velocity) * self._dt  # Never exceeded threshold
        
        return above_threshold[0] * self._dt
    
    def detect_movement_blocks(self, velocity: np.ndarray,
                               min_pause_duration: float = 0.1) -> Tuple[int, List[float]]:
        """
        Detect movement blocks (interruptions/pauses during movement).
        
        Args:
            velocity: Velocity signal
            min_pause_duration: Minimum pause duration to count (seconds)
            
        Returns:
            Tuple of (number of blocks, list of inter-movement intervals)
        """
        if len(velocity) < 2:
            return 0, []
        
        if velocity.ndim > 1:
            velocity = np.linalg.norm(velocity, axis=-1)
        
        # Binary movement mask
        is_moving = np.abs(velocity) > self.movement_threshold
        
        # Find transitions
        transitions = np.diff(is_moving.astype(int))
        movement_starts = np.where(transitions == 1)[0] + 1
        movement_ends = np.where(transitions == -1)[0] + 1
        
        if len(movement_starts) == 0 or len(movement_ends) == 0:
            return 0, []
        
        # Ensure we start with a movement start
        if movement_ends[0] < movement_starts[0]:
            movement_ends = movement_ends[1:]
        
        # Match starts and ends
        n_segments = min(len(movement_starts), len(movement_ends))
        
        # Compute inter-movement intervals
        intervals = []
        min_samples = int(min_pause_duration * self.fs)
        
        for i in range(n_segments - 1):
            pause_duration = (movement_starts[i + 1] - movement_ends[i]) * self._dt
            if (movement_starts[i + 1] - movement_ends[i]) >= min_samples:
                intervals.append(pause_duration)
        
        return len(intervals), intervals
    
    def compute_bradykinesia_metrics(self, position: np.ndarray,
                                     velocity: Optional[np.ndarray] = None,
                                     cycle_boundaries: Optional[List[int]] = None) -> BradykinesiaMetrics:
        """
        Compute comprehensive bradykinesia metrics.
        
        Args:
            position: Position signal
            velocity: Optional velocity signal
            cycle_boundaries: Optional list of cycle boundary indices
            
        Returns:
            BradykinesiaMetrics dataclass
        """
        if velocity is None:
            if position.ndim == 1:
                velocity = np.gradient(position, self._dt)
            else:
                velocity = np.gradient(position, self._dt, axis=0)
        
        if position.ndim > 1:
            pos_mag = np.linalg.norm(position, axis=-1)
            vel_mag = np.linalg.norm(velocity, axis=-1)
        else:
            pos_mag = position
            vel_mag = velocity
        
        # If no cycle boundaries provided, detect them from velocity sign changes
        if cycle_boundaries is None:
            # Find peaks as cycle markers
            peaks, _ = signal.find_peaks(pos_mag, distance=int(0.2 * self.fs))
            if len(peaks) < 2:
                peaks = np.array([0, len(pos_mag) - 1])
            cycle_boundaries = peaks.tolist()
        
        # Extract per-cycle metrics
        amplitudes = []
        peak_velocities = []
        
        for i in range(len(cycle_boundaries) - 1):
            start = cycle_boundaries[i]
            end = cycle_boundaries[i + 1]
            
            if end <= start:
                continue
            
            segment_pos = pos_mag[start:end]
            segment_vel = vel_mag[start:end]
            
            amplitudes.append(np.ptp(segment_pos))
            peak_velocities.append(np.max(np.abs(segment_vel)))
        
        amplitudes = np.array(amplitudes)
        peak_velocities = np.array(peak_velocities)
        
        # Compute metrics
        n_blocks, intervals = self.detect_movement_blocks(vel_mag)
        
        # Slowness score (average cycle duration)
        if len(cycle_boundaries) > 1:
            cycle_durations = np.diff(cycle_boundaries) * self._dt
            slowness = np.mean(cycle_durations)
        else:
            slowness = len(position) * self._dt
        
        return BradykinesiaMetrics(
            amplitude_decrement=self.compute_amplitude_decrement(amplitudes),
            velocity_reduction=self.compute_velocity_reduction(peak_velocities),
            slowness_score=slowness,
            hesitation_index=self.compute_hesitation_index(vel_mag),
            movement_blocks=n_blocks,
            inter_movement_intervals=intervals
        )
    
    # =========================================================================
    # FATIGUE METRICS
    # =========================================================================
    
    def compute_performance_degradation(self, metric_values: np.ndarray,
                                        timestamps: Optional[np.ndarray] = None) -> float:
        """
        Compute rate of performance degradation over time.
        
        Uses linear regression to estimate the slope of metric decline.
        
        Args:
            metric_values: Time series of performance metric values
            timestamps: Optional timestamps (uses indices if not provided)
            
        Returns:
            Degradation rate (negative = declining performance)
        """
        if len(metric_values) < 3:
            return np.nan
        
        if timestamps is None:
            timestamps = np.arange(len(metric_values))
        
        # Normalize timestamps to [0, 1]
        t_norm = (timestamps - timestamps[0]) / (timestamps[-1] - timestamps[0] + 1e-10)
        
        # Linear regression
        slope, _ = np.polyfit(t_norm, metric_values, 1)
        
        # Normalize by initial value
        initial_value = metric_values[0] if metric_values[0] != 0 else 1.0
        
        return slope / initial_value
    
    def compute_consistency_decline(self, metric_values: np.ndarray,
                                    window_size: int = 5) -> float:
        """
        Compute increase in movement variability (consistency decline).
        
        Args:
            metric_values: Time series of metric values
            window_size: Size of sliding window for local CV computation
            
        Returns:
            Rate of consistency decline (positive = increasing variability)
        """
        if len(metric_values) < window_size * 2:
            return np.nan
        
        # Compute local coefficient of variation
        n_windows = len(metric_values) - window_size + 1
        local_cv = np.zeros(n_windows)
        
        for i in range(n_windows):
            window = metric_values[i:i + window_size]
            mean_val = np.mean(window)
            if mean_val > 1e-10:
                local_cv[i] = np.std(window) / mean_val
            else:
                local_cv[i] = 0
        
        # Compute slope of CV over time
        slope, _ = np.polyfit(np.arange(n_windows), local_cv, 1)
        
        return slope
    
    def compute_fatigue_metrics(self, position: np.ndarray,
                                velocity: Optional[np.ndarray] = None,
                                cycle_boundaries: Optional[List[int]] = None) -> FatigueMetrics:
        """
        Compute comprehensive fatigue indicator metrics.
        
        Args:
            position: Position signal
            velocity: Optional velocity signal
            cycle_boundaries: Optional cycle boundary indices
            
        Returns:
            FatigueMetrics dataclass
        """
        if velocity is None:
            if position.ndim == 1:
                velocity = np.gradient(position, self._dt)
            else:
                velocity = np.gradient(position, self._dt, axis=0)
        
        if position.ndim > 1:
            pos_mag = np.linalg.norm(position, axis=-1)
            vel_mag = np.linalg.norm(velocity, axis=-1)
        else:
            pos_mag = position
            vel_mag = velocity
        
        # Auto-detect cycles if not provided
        if cycle_boundaries is None:
            peaks, _ = signal.find_peaks(pos_mag, distance=int(0.2 * self.fs))
            if len(peaks) < 2:
                peaks = np.array([0, len(pos_mag) - 1])
            cycle_boundaries = peaks.tolist()
        
        # Extract per-cycle metrics
        amplitudes = []
        peak_velocities = []
        
        for i in range(len(cycle_boundaries) - 1):
            start = cycle_boundaries[i]
            end = cycle_boundaries[i + 1]
            
            if end <= start:
                continue
            
            segment_pos = pos_mag[start:end]
            segment_vel = vel_mag[start:end]
            
            amplitudes.append(np.ptp(segment_pos))
            peak_velocities.append(np.max(np.abs(segment_vel)))
        
        amplitudes = np.array(amplitudes)
        peak_velocities = np.array(peak_velocities)
        
        # Compute degradation rates
        vel_decay = self.compute_performance_degradation(peak_velocities)
        amp_decay = self.compute_performance_degradation(amplitudes)
        
        # Combined performance degradation
        perf_degradation = (vel_decay + amp_decay) / 2 if not (np.isnan(vel_decay) or np.isnan(amp_decay)) else np.nan
        
        # Consistency decline
        consistency = self.compute_consistency_decline(amplitudes)
        
        # Rest pause frequency
        n_blocks, intervals = self.detect_movement_blocks(vel_mag)
        total_duration = len(position) * self._dt
        rest_freq = n_blocks / total_duration if total_duration > 0 else 0
        
        return FatigueMetrics(
            performance_degradation_rate=perf_degradation,
            velocity_decay=vel_decay,
            amplitude_decay=amp_decay,
            rest_pause_frequency=rest_freq,
            consistency_decline=consistency
        )
    
    # =========================================================================
    # ASYMMETRY METRICS (for bilateral movements)
    # =========================================================================
    
    def compute_asymmetry_index(self, left_values: np.ndarray,
                                right_values: np.ndarray) -> float:
        """
        Compute asymmetry index: (R - L) / (R + L).
        
        Args:
            left_values: Metric values for left side
            right_values: Metric values for right side
            
        Returns:
            Asymmetry index (-1 to +1, 0 = symmetric)
        """
        left_mean = np.mean(left_values)
        right_mean = np.mean(right_values)
        
        denominator = right_mean + left_mean
        if np.abs(denominator) < 1e-10:
            return 0.0
        
        return (right_mean - left_mean) / denominator
    
    def compute_coordination_lag(self, left_signal: np.ndarray,
                                 right_signal: np.ndarray,
                                 max_lag_samples: Optional[int] = None) -> float:
        """
        Compute temporal coordination lag between left and right signals.
        
        Uses cross-correlation to find the optimal lag.
        
        Args:
            left_signal: Left side signal
            right_signal: Right side signal
            max_lag_samples: Maximum lag to search (samples)
            
        Returns:
            Coordination lag in seconds (positive = right leads)
        """
        if len(left_signal) < 10 or len(right_signal) < 10:
            return np.nan
        
        if max_lag_samples is None:
            max_lag_samples = min(len(left_signal) // 4, int(0.5 * self.fs))
        
        # Cross-correlation
        correlation = signal.correlate(right_signal, left_signal, mode='full')
        lags = signal.correlation_lags(len(right_signal), len(left_signal), mode='full')
        
        # Find peak within allowed lag range
        valid_mask = np.abs(lags) <= max_lag_samples
        valid_correlation = correlation.copy()
        valid_correlation[~valid_mask] = -np.inf
        
        peak_idx = np.argmax(valid_correlation)
        lag_samples = lags[peak_idx]
        
        return lag_samples * self._dt
    
    def compute_phase_coherence(self, left_signal: np.ndarray,
                                right_signal: np.ndarray,
                                freq_band: Tuple[float, float] = (0.5, 5.0)) -> float:
        """
        Compute phase coherence between left and right signals.
        
        Args:
            left_signal: Left side signal
            right_signal: Right side signal
            freq_band: Frequency band of interest (Hz)
            
        Returns:
            Phase coherence (0 to 1, 1 = perfectly coherent)
        """
        if len(left_signal) < 10 or len(right_signal) < 10:
            return np.nan
        
        # Ensure same length
        min_len = min(len(left_signal), len(right_signal))
        left_signal = left_signal[:min_len]
        right_signal = right_signal[:min_len]
        
        # Compute coherence
        f, coh = signal.coherence(left_signal, right_signal, fs=self.fs, nperseg=min(256, min_len // 2))
        
        # Average coherence in frequency band
        band_mask = (f >= freq_band[0]) & (f <= freq_band[1])
        
        if np.sum(band_mask) == 0:
            return np.nan
        
        return np.mean(coh[band_mask])
    
    def compute_asymmetry_metrics(self, left_position: np.ndarray,
                                  right_position: np.ndarray,
                                  left_velocity: Optional[np.ndarray] = None,
                                  right_velocity: Optional[np.ndarray] = None) -> AsymmetryMetrics:
        """
        Compute comprehensive bilateral asymmetry metrics.
        
        Args:
            left_position: Left hand position signal
            right_position: Right hand position signal
            left_velocity: Optional left hand velocity
            right_velocity: Optional right hand velocity
            
        Returns:
            AsymmetryMetrics dataclass
        """
        # Compute velocities if not provided
        if left_velocity is None:
            left_velocity = np.gradient(left_position, self._dt, axis=0 if left_position.ndim > 1 else None)
        if right_velocity is None:
            right_velocity = np.gradient(right_position, self._dt, axis=0 if right_position.ndim > 1 else None)
        
        # Get magnitudes
        if left_position.ndim > 1:
            left_pos_mag = np.linalg.norm(left_position, axis=-1)
            left_vel_mag = np.linalg.norm(left_velocity, axis=-1)
        else:
            left_pos_mag = np.abs(left_position)
            left_vel_mag = np.abs(left_velocity)
        
        if right_position.ndim > 1:
            right_pos_mag = np.linalg.norm(right_position, axis=-1)
            right_vel_mag = np.linalg.norm(right_velocity, axis=-1)
        else:
            right_pos_mag = np.abs(right_position)
            right_vel_mag = np.abs(right_velocity)
        
        # Amplitude asymmetry
        left_amplitude = np.ptp(left_pos_mag)
        right_amplitude = np.ptp(right_pos_mag)
        amp_asymmetry = self.compute_asymmetry_index(
            np.array([left_amplitude]),
            np.array([right_amplitude])
        )
        
        # Velocity asymmetry
        left_peak_vel = np.max(left_vel_mag)
        right_peak_vel = np.max(right_vel_mag)
        vel_asymmetry = self.compute_asymmetry_index(
            np.array([left_peak_vel]),
            np.array([right_peak_vel])
        )
        
        # Coordination lag
        coord_lag = self.compute_coordination_lag(left_pos_mag, right_pos_mag)
        
        # Phase coherence
        coherence = self.compute_phase_coherence(left_pos_mag, right_pos_mag)
        
        return AsymmetryMetrics(
            amplitude_asymmetry=amp_asymmetry,
            velocity_asymmetry=vel_asymmetry,
            coordination_lag=coord_lag,
            phase_coherence=coherence
        )
    
    # =========================================================================
    # TREMOR REGULARITY METRICS
    # =========================================================================
    
    def compute_q_factor(self, signal_data: np.ndarray,
                         freq_band: Tuple[float, float] = (3.0, 12.0)) -> float:
        """
        Compute Q-factor (quality factor) of tremor resonance.
        
        Q = center_frequency / bandwidth (at -3dB)
        Higher Q indicates more regular, narrowband tremor.
        
        Args:
            signal_data: Tremor signal
            freq_band: Frequency band to search for tremor peak
            
        Returns:
            Q-factor (higher = more regular tremor)
        """
        if len(signal_data) < 10:
            return np.nan
        
        # Compute power spectrum
        f, psd = signal.welch(signal_data, fs=self.fs, nperseg=min(256, len(signal_data) // 2))
        
        # Find peak in tremor band
        band_mask = (f >= freq_band[0]) & (f <= freq_band[1])
        
        if np.sum(band_mask) < 3:
            return np.nan
        
        band_f = f[band_mask]
        band_psd = psd[band_mask]
        
        peak_idx = np.argmax(band_psd)
        peak_freq = band_f[peak_idx]
        peak_power = band_psd[peak_idx]
        
        # Find -3dB points (half-power points)
        half_power = peak_power / 2
        
        # Find bandwidth
        above_half = band_psd >= half_power
        
        if np.sum(above_half) < 2:
            return np.nan
        
        above_indices = np.where(above_half)[0]
        bandwidth = band_f[above_indices[-1]] - band_f[above_indices[0]]
        
        if bandwidth < 1e-6:
            return np.nan
        
        return peak_freq / bandwidth
    
    def compute_tremor_stability(self, signal_data: np.ndarray,
                                 window_duration: float = 1.0,
                                 freq_band: Tuple[float, float] = (3.0, 12.0)) -> float:
        """
        Compute tremor frequency stability (inverse of frequency drift).
        
        Args:
            signal_data: Tremor signal
            window_duration: Duration of analysis windows (seconds)
            freq_band: Frequency band for tremor detection
            
        Returns:
            Stability measure (1 - CV of frequency, higher = more stable)
        """
        window_samples = int(window_duration * self.fs)
        
        if len(signal_data) < window_samples * 2:
            return np.nan
        
        n_windows = len(signal_data) // window_samples
        dominant_freqs = []
        
        for i in range(n_windows):
            start = i * window_samples
            end = start + window_samples
            window = signal_data[start:end]
            
            f, psd = signal.welch(window, fs=self.fs, nperseg=min(64, len(window) // 2))
            
            band_mask = (f >= freq_band[0]) & (f <= freq_band[1])
            if np.sum(band_mask) > 0:
                band_f = f[band_mask]
                band_psd = psd[band_mask]
                dominant_freqs.append(band_f[np.argmax(band_psd)])
        
        if len(dominant_freqs) < 2:
            return np.nan
        
        dominant_freqs = np.array(dominant_freqs)
        cv = np.std(dominant_freqs) / (np.mean(dominant_freqs) + 1e-10)
        
        # Return stability (1 - CV, clamped to [0, 1])
        return max(0, min(1, 1 - cv))
    
    def compute_amplitude_variability(self, signal_data: np.ndarray,
                                      freq_band: Tuple[float, float] = (3.0, 12.0)) -> float:
        """
        Compute coefficient of variation of tremor amplitude.
        
        Args:
            signal_data: Tremor signal
            freq_band: Frequency band for bandpass filtering
            
        Returns:
            CV of amplitude (lower = more consistent amplitude)
        """
        if len(signal_data) < 10:
            return np.nan
        
        # Bandpass filter to isolate tremor
        nyq = self.fs / 2
        low = freq_band[0] / nyq
        high = min(freq_band[1] / nyq, 0.99)
        
        if low >= high:
            return np.nan
        
        try:
            b, a = signal.butter(2, [low, high], btype='band')
            filtered = signal.filtfilt(b, a, signal_data)
        except Exception:
            return np.nan
        
        # Compute envelope using Hilbert transform
        analytic = signal.hilbert(filtered)
        envelope = np.abs(analytic)
        
        mean_amp = np.mean(envelope)
        if mean_amp < 1e-10:
            return np.nan
        
        return np.std(envelope) / mean_amp
    
    def compute_frequency_drift(self, signal_data: np.ndarray,
                                window_duration: float = 1.0,
                                freq_band: Tuple[float, float] = (3.0, 12.0)) -> float:
        """
        Compute rate of tremor frequency drift over time.
        
        Args:
            signal_data: Tremor signal
            window_duration: Duration of analysis windows (seconds)
            freq_band: Frequency band for tremor detection
            
        Returns:
            Frequency drift rate (Hz/second)
        """
        window_samples = int(window_duration * self.fs)
        
        if len(signal_data) < window_samples * 3:
            return np.nan
        
        n_windows = len(signal_data) // window_samples
        dominant_freqs = []
        timestamps = []
        
        for i in range(n_windows):
            start = i * window_samples
            end = start + window_samples
            window = signal_data[start:end]
            
            f, psd = signal.welch(window, fs=self.fs, nperseg=min(64, len(window) // 2))
            
            band_mask = (f >= freq_band[0]) & (f <= freq_band[1])
            if np.sum(band_mask) > 0:
                band_f = f[band_mask]
                band_psd = psd[band_mask]
                dominant_freqs.append(band_f[np.argmax(band_psd)])
                timestamps.append((start + end) / 2 * self._dt)
        
        if len(dominant_freqs) < 3:
            return np.nan
        
        # Linear regression to find drift rate
        slope, _ = np.polyfit(timestamps, dominant_freqs, 1)
        
        return slope
    
    def compute_tremor_regularity_metrics(self, signal_data: np.ndarray,
                                          freq_band: Tuple[float, float] = (3.0, 12.0)) -> TremorRegularityMetrics:
        """
        Compute comprehensive tremor regularity metrics.
        
        Args:
            signal_data: Tremor signal (position or acceleration)
            freq_band: Frequency band for tremor analysis
            
        Returns:
            TremorRegularityMetrics dataclass
        """
        if signal_data.ndim > 1:
            signal_data = np.linalg.norm(signal_data, axis=-1)
        
        return TremorRegularityMetrics(
            q_factor=self.compute_q_factor(signal_data, freq_band),
            spectral_coherence=np.nan,  # Requires reference signal
            tremor_stability=self.compute_tremor_stability(signal_data, freq_band=freq_band),
            amplitude_variability=self.compute_amplitude_variability(signal_data, freq_band),
            frequency_drift=self.compute_frequency_drift(signal_data, freq_band=freq_band)
        )
    
    # =========================================================================
    # COMPREHENSIVE ANALYSIS
    # =========================================================================
    
    def compute_all_biomarkers(self, position: np.ndarray,
                               velocity: Optional[np.ndarray] = None,
                               left_position: Optional[np.ndarray] = None,
                               right_position: Optional[np.ndarray] = None) -> Dict[str, Any]:
        """
        Compute all available biomarkers from movement data.
        
        Args:
            position: Primary position signal (for single-hand analysis)
            velocity: Optional velocity signal
            left_position: Optional left hand position (for bilateral analysis)
            right_position: Optional right hand position (for bilateral analysis)
            
        Returns:
            Dictionary containing all computed biomarker metrics
        """
        results = {}
        
        # Smoothness metrics
        try:
            smoothness = self.compute_smoothness_metrics(position, velocity)
            results['smoothness'] = {
                'sparc': smoothness.sparc,
                'ldljv': smoothness.ldljv,
                'ldlja': smoothness.ldlja,
                'normalized_jerk': smoothness.normalized_jerk,
                'movement_duration': smoothness.movement_duration,
                'path_length': smoothness.path_length
            }
        except Exception as e:
            results['smoothness'] = {'error': str(e)}
        
        # Bradykinesia metrics
        try:
            brady = self.compute_bradykinesia_metrics(position, velocity)
            results['bradykinesia'] = {
                'amplitude_decrement': brady.amplitude_decrement,
                'velocity_reduction': brady.velocity_reduction,
                'slowness_score': brady.slowness_score,
                'hesitation_index': brady.hesitation_index,
                'movement_blocks': brady.movement_blocks,
                'inter_movement_intervals': brady.inter_movement_intervals
            }
        except Exception as e:
            results['bradykinesia'] = {'error': str(e)}
        
        # Fatigue metrics
        try:
            fatigue = self.compute_fatigue_metrics(position, velocity)
            results['fatigue'] = {
                'performance_degradation_rate': fatigue.performance_degradation_rate,
                'velocity_decay': fatigue.velocity_decay,
                'amplitude_decay': fatigue.amplitude_decay,
                'rest_pause_frequency': fatigue.rest_pause_frequency,
                'consistency_decline': fatigue.consistency_decline
            }
        except Exception as e:
            results['fatigue'] = {'error': str(e)}
        
        # Tremor regularity
        try:
            # Use velocity for tremor analysis (more sensitive)
            if velocity is None:
                vel = np.gradient(position, self._dt, axis=0 if position.ndim > 1 else None)
            else:
                vel = velocity
            
            tremor_reg = self.compute_tremor_regularity_metrics(vel)
            results['tremor_regularity'] = {
                'q_factor': tremor_reg.q_factor,
                'tremor_stability': tremor_reg.tremor_stability,
                'amplitude_variability': tremor_reg.amplitude_variability,
                'frequency_drift': tremor_reg.frequency_drift
            }
        except Exception as e:
            results['tremor_regularity'] = {'error': str(e)}
        
        # Asymmetry metrics (if bilateral data provided)
        if left_position is not None and right_position is not None:
            try:
                asymmetry = self.compute_asymmetry_metrics(left_position, right_position)
                results['asymmetry'] = {
                    'amplitude_asymmetry': asymmetry.amplitude_asymmetry,
                    'velocity_asymmetry': asymmetry.velocity_asymmetry,
                    'coordination_lag': asymmetry.coordination_lag,
                    'phase_coherence': asymmetry.phase_coherence
                }
            except Exception as e:
                results['asymmetry'] = {'error': str(e)}
        
        return results


# Convenience functions for quick analysis
def compute_sparc(velocity: np.ndarray, fs: float = 30.0) -> float:
    """Quick SPARC computation."""
    calc = BiomarkerCalculator(fs=fs)
    return calc.compute_sparc(velocity)


def compute_ldljv(velocity: np.ndarray, fs: float = 30.0) -> float:
    """Quick LDLJ-V computation."""
    calc = BiomarkerCalculator(fs=fs)
    return calc.compute_ldljv(velocity)


def compute_smoothness(position: np.ndarray, fs: float = 30.0) -> SmoothnessMetrics:
    """Quick smoothness metrics computation."""
    calc = BiomarkerCalculator(fs=fs)
    return calc.compute_smoothness_metrics(position)


# =============================================================================
# CLINICAL_SCORING.PY
# =============================================================================




class SeverityLevel(Enum):
    """Clinical severity classification levels"""
    NORMAL = 0
    MILD = 1
    MODERATE = 2
    SEVERE = 3
    
    def __str__(self):
        return self.name.capitalize()


@dataclass
class ReferenceRange:
    """Reference range for a biomarker"""
    normal_min: float
    normal_max: float
    mild_threshold: float
    moderate_threshold: float
    severe_threshold: float
    unit: str = ""
    higher_is_worse: bool = True  # If True, higher values indicate worse condition
    
    def classify(self, value: float) -> SeverityLevel:
        """Classify a value into severity level"""
        if np.isnan(value):
            return SeverityLevel.NORMAL  # Default for missing data
        
        if self.higher_is_worse:
            if value <= self.normal_max:
                return SeverityLevel.NORMAL
            elif value <= self.mild_threshold:
                return SeverityLevel.MILD
            elif value <= self.moderate_threshold:
                return SeverityLevel.MODERATE
            else:
                return SeverityLevel.SEVERE
        else:
            # Lower is worse (e.g., SPARC where more negative = worse)
            if value >= self.normal_min:
                return SeverityLevel.NORMAL
            elif value >= self.mild_threshold:
                return SeverityLevel.MILD
            elif value >= self.moderate_threshold:
                return SeverityLevel.MODERATE
            else:
                return SeverityLevel.SEVERE
    
    def get_percentile_score(self, value: float) -> float:
        """Get a 0-100 score based on where value falls in severity range"""
        if np.isnan(value):
            return 100.0  # Assume normal for missing data
        
        if self.higher_is_worse:
            if value <= self.normal_max:
                return 100.0
            elif value >= self.severe_threshold:
                return 0.0
            else:
                # Linear interpolation
                range_span = self.severe_threshold - self.normal_max
                return 100.0 * (1 - (value - self.normal_max) / range_span)
        else:
            if value >= self.normal_min:
                return 100.0
            elif value <= self.severe_threshold:
                return 0.0
            else:
                range_span = self.normal_min - self.severe_threshold
                return 100.0 * (value - self.severe_threshold) / range_span


# Clinical reference ranges based on published literature
CLINICAL_REFERENCE_RANGES = {
    # Smoothness Metrics
    'sparc': ReferenceRange(
        normal_min=-2.5, normal_max=-1.5,
        mild_threshold=-3.0, moderate_threshold=-4.0, severe_threshold=-5.0,
        unit='', higher_is_worse=False  # More negative = worse
    ),
    'ldljv': ReferenceRange(
        normal_min=-6.0, normal_max=-4.0,
        mild_threshold=-6.5, moderate_threshold=-7.5, severe_threshold=-9.0,
        unit='', higher_is_worse=False
    ),
    'ldlja': ReferenceRange(
        normal_min=-6.0, normal_max=-4.0,
        mild_threshold=-6.5, moderate_threshold=-7.5, severe_threshold=-9.0,
        unit='', higher_is_worse=False
    ),
    'normalized_jerk': ReferenceRange(
        normal_min=0.0, normal_max=50.0,
        mild_threshold=100.0, moderate_threshold=200.0, severe_threshold=400.0,
        unit='1/s²', higher_is_worse=True
    ),
    
    # Tremor Metrics
    'tremor_frequency': ReferenceRange(
        normal_min=0.0, normal_max=3.0,
        mild_threshold=5.0, moderate_threshold=7.0, severe_threshold=10.0,
        unit='Hz', higher_is_worse=True
    ),
    'tremor_amplitude': ReferenceRange(
        normal_min=0.0, normal_max=0.005,
        mild_threshold=0.015, moderate_threshold=0.03, severe_threshold=0.05,
        unit='normalized', higher_is_worse=True
    ),
    'tremor_severity': ReferenceRange(
        normal_min=0.0, normal_max=0.1,
        mild_threshold=0.3, moderate_threshold=0.5, severe_threshold=0.8,
        unit='', higher_is_worse=True
    ),
    'q_factor': ReferenceRange(
        normal_min=0.0, normal_max=2.0,
        mild_threshold=5.0, moderate_threshold=10.0, severe_threshold=20.0,
        unit='', higher_is_worse=True  # Higher Q = more pathological resonance
    ),
    
    # Bradykinesia Metrics
    'amplitude_decrement': ReferenceRange(
        normal_min=0.8, normal_max=1.2,
        mild_threshold=0.6, moderate_threshold=0.4, severe_threshold=0.2,
        unit='ratio', higher_is_worse=False  # Lower = worse
    ),
    'velocity_reduction': ReferenceRange(
        normal_min=0.8, normal_max=1.2,
        mild_threshold=0.6, moderate_threshold=0.4, severe_threshold=0.2,
        unit='ratio', higher_is_worse=False
    ),
    'slowness_score': ReferenceRange(
        normal_min=0.0, normal_max=0.5,
        mild_threshold=1.0, moderate_threshold=2.0, severe_threshold=4.0,
        unit='s/cycle', higher_is_worse=True
    ),
    'hesitation_index': ReferenceRange(
        normal_min=0.0, normal_max=0.2,
        mild_threshold=0.5, moderate_threshold=1.0, severe_threshold=2.0,
        unit='s', higher_is_worse=True
    ),
    
    # Fatigue Metrics
    'performance_degradation_rate': ReferenceRange(
        normal_min=-0.1, normal_max=0.1,
        mild_threshold=-0.3, moderate_threshold=-0.5, severe_threshold=-0.7,
        unit='/normalized_time', higher_is_worse=False  # More negative = worse
    ),
    'velocity_decay': ReferenceRange(
        normal_min=-0.1, normal_max=0.1,
        mild_threshold=-0.3, moderate_threshold=-0.5, severe_threshold=-0.7,
        unit='/normalized_time', higher_is_worse=False
    ),
    'rest_pause_frequency': ReferenceRange(
        normal_min=0.0, normal_max=0.2,
        mild_threshold=0.5, moderate_threshold=1.0, severe_threshold=2.0,
        unit='pauses/s', higher_is_worse=True
    ),
    
    # Asymmetry Metrics
    'amplitude_asymmetry': ReferenceRange(
        normal_min=-0.1, normal_max=0.1,
        mild_threshold=0.2, moderate_threshold=0.4, severe_threshold=0.6,
        unit='', higher_is_worse=True  # Uses absolute value
    ),
    'velocity_asymmetry': ReferenceRange(
        normal_min=-0.1, normal_max=0.1,
        mild_threshold=0.2, moderate_threshold=0.4, severe_threshold=0.6,
        unit='', higher_is_worse=True
    ),
    'coordination_lag': ReferenceRange(
        normal_min=-0.05, normal_max=0.05,
        mild_threshold=0.1, moderate_threshold=0.2, severe_threshold=0.4,
        unit='s', higher_is_worse=True  # Uses absolute value
    ),
    
    # Range of Motion
    'rom_index_finger': ReferenceRange(
        normal_min=0.8, normal_max=1.5,
        mild_threshold=0.6, moderate_threshold=0.4, severe_threshold=0.2,
        unit='normalized', higher_is_worse=False  # Lower ROM = worse
    ),
    'rom_thumb': ReferenceRange(
        normal_min=0.6, normal_max=1.2,
        mild_threshold=0.4, moderate_threshold=0.3, severe_threshold=0.15,
        unit='normalized', higher_is_worse=False
    ),
}


@dataclass
class ScoredBiomarker:
    """A biomarker with its clinical score and interpretation"""
    name: str
    value: float
    unit: str
    severity: SeverityLevel
    percentile_score: float  # 0-100, 100 = best
    interpretation: str


@dataclass
class ClinicalScoreSummary:
    """Summary of clinical scoring results"""
    overall_score: float  # 0-100 composite score
    overall_severity: SeverityLevel
    domain_scores: Dict[str, float]
    scored_biomarkers: List[ScoredBiomarker]
    clinical_summary: str
    recommendations: List[str]


class SeverityScorer:
    """
    Scorer for mapping biomarker values to clinical severity levels.
    
    This class provides methods to score individual biomarkers and compute
    composite severity scores across multiple domains.
    """
    
    def __init__(self, reference_ranges: Optional[Dict[str, ReferenceRange]] = None):
        """
        Initialize SeverityScorer.
        
        Args:
            reference_ranges: Optional custom reference ranges (uses defaults if None)
        """
        self.reference_ranges = reference_ranges or CLINICAL_REFERENCE_RANGES.copy()
    
    def score_biomarker(self, name: str, value: float) -> ScoredBiomarker:
        """
        Score a single biomarker.
        
        Args:
            name: Biomarker name (must exist in reference_ranges)
            value: Biomarker value
            
        Returns:
            ScoredBiomarker with severity classification
        """
        if name not in self.reference_ranges:
            # Unknown biomarker - return neutral score
            return ScoredBiomarker(
                name=name,
                value=value,
                unit='',
                severity=SeverityLevel.NORMAL,
                percentile_score=75.0,
                interpretation=f"No reference range available for {name}"
            )
        
        ref = self.reference_ranges[name]
        
        # For asymmetry metrics, use absolute value
        if 'asymmetry' in name.lower() or 'lag' in name.lower():
            value = np.abs(value)
        
        severity = ref.classify(value)
        percentile_score = ref.get_percentile_score(value)
        
        # Generate interpretation
        interpretation = self._interpret_biomarker(name, value, severity, ref)
        
        return ScoredBiomarker(
            name=name,
            value=value,
            unit=ref.unit,
            severity=severity,
            percentile_score=percentile_score,
            interpretation=interpretation
        )
    
    def _interpret_biomarker(self, name: str, value: float, 
                             severity: SeverityLevel, ref: ReferenceRange) -> str:
        """Generate interpretation text for a biomarker"""
        severity_text = str(severity).lower()
        
        interpretations = {
            'sparc': {
                SeverityLevel.NORMAL: "Movement smoothness is within normal range",
                SeverityLevel.MILD: "Mildly reduced movement smoothness detected",
                SeverityLevel.MODERATE: "Moderately impaired movement smoothness",
                SeverityLevel.SEVERE: "Severely impaired movement smoothness indicating significant motor dysfunction"
            },
            'ldljv': {
                SeverityLevel.NORMAL: "Jerk profile indicates smooth, well-coordinated movement",
                SeverityLevel.MILD: "Mild jerkiness in movement execution",
                SeverityLevel.MODERATE: "Moderate movement jerkiness suggesting motor control difficulty",
                SeverityLevel.SEVERE: "Severe movement jerkiness indicating significant coordination impairment"
            },
            'tremor_frequency': {
                SeverityLevel.NORMAL: "No significant tremor frequency detected",
                SeverityLevel.MILD: f"Mild tremor at {value:.1f} Hz",
                SeverityLevel.MODERATE: f"Moderate tremor at {value:.1f} Hz within pathological range",
                SeverityLevel.SEVERE: f"Severe high-frequency tremor at {value:.1f} Hz"
            },
            'tremor_amplitude': {
                SeverityLevel.NORMAL: "Tremor amplitude within physiological range",
                SeverityLevel.MILD: "Mildly elevated tremor amplitude",
                SeverityLevel.MODERATE: "Moderately elevated tremor amplitude",
                SeverityLevel.SEVERE: "Severely elevated tremor amplitude affecting function"
            },
            'amplitude_decrement': {
                SeverityLevel.NORMAL: "Movement amplitude is maintained across repetitions",
                SeverityLevel.MILD: "Mild amplitude decrement observed (fatiguability)",
                SeverityLevel.MODERATE: "Moderate amplitude decrement suggesting bradykinesia",
                SeverityLevel.SEVERE: "Severe amplitude decrement consistent with significant bradykinesia"
            },
            'velocity_reduction': {
                SeverityLevel.NORMAL: "Movement velocity is maintained throughout task",
                SeverityLevel.MILD: "Mild velocity reduction over time",
                SeverityLevel.MODERATE: "Moderate velocity reduction suggesting motor fatigue",
                SeverityLevel.SEVERE: "Severe velocity reduction indicating significant motor impairment"
            },
            'hesitation_index': {
                SeverityLevel.NORMAL: "Quick movement initiation",
                SeverityLevel.MILD: "Slightly delayed movement initiation",
                SeverityLevel.MODERATE: "Noticeable hesitation before movement",
                SeverityLevel.SEVERE: "Prolonged hesitation suggesting significant initiation difficulty"
            },
            'amplitude_asymmetry': {
                SeverityLevel.NORMAL: "Symmetric movement amplitude between sides",
                SeverityLevel.MILD: "Mild asymmetry in movement amplitude",
                SeverityLevel.MODERATE: "Moderate asymmetry suggesting unilateral involvement",
                SeverityLevel.SEVERE: "Severe asymmetry indicating significant lateralized impairment"
            },
        }
        
        # Get specific interpretation or generate generic one
        if name in interpretations:
            return interpretations[name].get(severity, f"{severity_text.capitalize()} {name.replace('_', ' ')}")
        else:
            if severity == SeverityLevel.NORMAL:
                return f"{name.replace('_', ' ').title()} is within normal limits"
            elif severity == SeverityLevel.MILD:
                return f"Mildly abnormal {name.replace('_', ' ')}"
            elif severity == SeverityLevel.MODERATE:
                return f"Moderately abnormal {name.replace('_', ' ')}"
            else:
                return f"Severely abnormal {name.replace('_', ' ')}"
    
    def score_biomarkers(self, biomarkers: Dict[str, float]) -> List[ScoredBiomarker]:
        """
        Score multiple biomarkers.
        
        Args:
            biomarkers: Dictionary of biomarker name -> value
            
        Returns:
            List of ScoredBiomarker objects
        """
        scored = []
        for name, value in biomarkers.items():
            if value is not None and not (isinstance(value, float) and np.isnan(value)):
                scored.append(self.score_biomarker(name, value))
        return scored
    
    def compute_domain_score(self, scored_biomarkers: List[ScoredBiomarker],
                            domain_biomarkers: List[str]) -> float:
        """
        Compute weighted average score for a clinical domain.
        
        Args:
            scored_biomarkers: List of scored biomarkers
            domain_biomarkers: List of biomarker names in this domain
            
        Returns:
            Domain score (0-100)
        """
        relevant = [sb for sb in scored_biomarkers if sb.name in domain_biomarkers]
        
        if not relevant:
            return 100.0  # Assume normal if no data
        
        # Weight by severity (more severe findings weighted higher)
        weights = []
        scores = []
        for sb in relevant:
            # Weight severe findings more heavily
            weight = 1.0 + (3 - sb.severity.value) * 0.5
            weights.append(weight)
            scores.append(sb.percentile_score)
        
        return np.average(scores, weights=weights)
    
    def classify_severity(self, score: float) -> SeverityLevel:
        """
        Classify overall severity from composite score.
        
        Args:
            score: Composite score (0-100)
            
        Returns:
            SeverityLevel classification
        """
        if score >= 85:
            return SeverityLevel.NORMAL
        elif score >= 65:
            return SeverityLevel.MILD
        elif score >= 40:
            return SeverityLevel.MODERATE
        else:
            return SeverityLevel.SEVERE


class ClinicalInterpreter:
    """
    Interpreter for generating clinical summaries and recommendations.
    
    This class synthesizes multiple biomarker scores into clinical narratives
    and actionable recommendations.
    """
    
    # Clinical domain definitions
    DOMAINS = {
        'smoothness': ['sparc', 'ldljv', 'ldlja', 'normalized_jerk'],
        'tremor': ['tremor_frequency', 'tremor_amplitude', 'tremor_severity', 'q_factor'],
        'bradykinesia': ['amplitude_decrement', 'velocity_reduction', 'slowness_score', 'hesitation_index'],
        'fatigue': ['performance_degradation_rate', 'velocity_decay', 'rest_pause_frequency'],
        'asymmetry': ['amplitude_asymmetry', 'velocity_asymmetry', 'coordination_lag'],
        'range_of_motion': ['rom_index_finger', 'rom_thumb'],
    }
    
    DOMAIN_LABELS = {
        'smoothness': 'Movement Smoothness',
        'tremor': 'Tremor Assessment',
        'bradykinesia': 'Bradykinesia Assessment',
        'fatigue': 'Fatigue Indicators',
        'asymmetry': 'Bilateral Asymmetry',
        'range_of_motion': 'Range of Motion',
    }
    
    def __init__(self, scorer: Optional[SeverityScorer] = None):
        """
        Initialize ClinicalInterpreter.
        
        Args:
            scorer: Optional SeverityScorer instance (creates default if None)
        """
        self.scorer = scorer or SeverityScorer()
    
    def interpret_smoothness(self, biomarkers: Dict[str, float]) -> str:
        """Generate interpretation for smoothness domain"""
        sparc = biomarkers.get('sparc', np.nan)
        ldljv = biomarkers.get('ldljv', np.nan)
        nj = biomarkers.get('normalized_jerk', np.nan)
        
        parts = []
        
        if not np.isnan(sparc):
            if sparc >= -2.5:
                parts.append("SPARC indicates excellent movement smoothness characteristic of healthy motor control")
            elif sparc >= -3.5:
                parts.append("SPARC suggests mild reduction in movement smoothness")
            elif sparc >= -4.5:
                parts.append("SPARC indicates moderately reduced smoothness with noticeable movement irregularities")
            else:
                parts.append("SPARC reveals significantly impaired movement smoothness requiring clinical attention")
        
        if not np.isnan(ldljv):
            if ldljv >= -5.5:
                parts.append("Dimensionless jerk metric confirms well-coordinated movement execution")
            elif ldljv >= -7.0:
                parts.append("Jerk profile shows mild increases in movement discontinuity")
            else:
                parts.append("Elevated jerk indicates significant coordination challenges")
        
        if not parts:
            return "Insufficient data for smoothness assessment"
        
        return ". ".join(parts) + "."
    
    def interpret_tremor(self, biomarkers: Dict[str, float]) -> str:
        """Generate interpretation for tremor domain"""
        freq = biomarkers.get('tremor_frequency', np.nan)
        amp = biomarkers.get('tremor_amplitude', np.nan)
        sev = biomarkers.get('tremor_severity', np.nan)
        
        if np.isnan(freq) and np.isnan(amp) and np.isnan(sev):
            return "Insufficient data for tremor assessment"
        
        parts = []
        
        if not np.isnan(freq):
            if freq < 3.0:
                parts.append("No significant pathological tremor frequency detected")
            elif freq < 6.0:
                parts.append(f"Tremor detected at {freq:.1f} Hz, within the range commonly seen in essential tremor or early Parkinson's disease")
            elif freq < 10.0:
                parts.append(f"Moderate-frequency tremor at {freq:.1f} Hz requiring clinical evaluation")
            else:
                parts.append(f"High-frequency tremor at {freq:.1f} Hz may indicate physiological tremor or medication effect")
        
        if not np.isnan(amp):
            if amp < 0.01:
                parts.append("Tremor amplitude is minimal and unlikely to affect function")
            elif amp < 0.03:
                parts.append("Mild tremor amplitude may cause subtle interference with fine motor tasks")
            else:
                parts.append("Significant tremor amplitude likely affecting daily activities")
        
        if not np.isnan(sev) and sev > 0.3:
            parts.append(f"Overall tremor severity index of {sev:.2f} suggests clinically significant tremor")
        
        return ". ".join(parts) + "." if parts else "Tremor parameters within normal limits."
    
    def interpret_bradykinesia(self, biomarkers: Dict[str, float]) -> str:
        """Generate interpretation for bradykinesia domain"""
        amp_dec = biomarkers.get('amplitude_decrement', np.nan)
        vel_red = biomarkers.get('velocity_reduction', np.nan)
        slow = biomarkers.get('slowness_score', np.nan)
        hes = biomarkers.get('hesitation_index', np.nan)
        
        parts = []
        
        if not np.isnan(amp_dec):
            if amp_dec >= 0.8:
                parts.append("Movement amplitude is well maintained throughout the task")
            elif amp_dec >= 0.5:
                parts.append(f"Mild amplitude decrement to {amp_dec*100:.0f}% of initial amplitude observed")
            else:
                parts.append(f"Significant amplitude decrement to {amp_dec*100:.0f}% consistent with bradykinesia")
        
        if not np.isnan(vel_red):
            if vel_red < 0.6:
                parts.append(f"Peak velocity declining to {vel_red*100:.0f}% indicates progressive slowing")
        
        if not np.isnan(hes) and hes > 0.3:
            parts.append(f"Movement initiation delay of {hes:.2f}s suggests hesitation or freezing tendency")
        
        if not parts:
            return "No significant bradykinesia indicators detected"
        
        return ". ".join(parts) + "."
    
    def interpret_fatigue(self, biomarkers: Dict[str, float]) -> str:
        """Generate interpretation for fatigue indicators"""
        perf_deg = biomarkers.get('performance_degradation_rate', np.nan)
        vel_decay = biomarkers.get('velocity_decay', np.nan)
        rest_freq = biomarkers.get('rest_pause_frequency', np.nan)
        
        parts = []
        
        if not np.isnan(perf_deg):
            if perf_deg > -0.1:
                parts.append("Performance is stable throughout the assessment")
            elif perf_deg > -0.3:
                parts.append("Mild performance decline noted over time")
            else:
                parts.append("Significant performance degradation suggesting motor fatigue")
        
        if not np.isnan(rest_freq) and rest_freq > 0.3:
            parts.append(f"Frequent rest pauses ({rest_freq:.1f}/s) may indicate compensatory strategy for fatigue")
        
        return ". ".join(parts) + "." if parts else "No significant fatigue indicators present."
    
    def generate_clinical_summary(self, scored_biomarkers: List[ScoredBiomarker],
                                  domain_scores: Dict[str, float],
                                  overall_severity: SeverityLevel) -> str:
        """
        Generate comprehensive clinical summary.
        
        Args:
            scored_biomarkers: List of scored biomarkers
            domain_scores: Dictionary of domain name -> score
            overall_severity: Overall severity classification
            
        Returns:
            Clinical summary text
        """
        # Opening statement
        if overall_severity == SeverityLevel.NORMAL:
            opening = "Motor function assessment reveals performance within normal limits across evaluated domains."
        elif overall_severity == SeverityLevel.MILD:
            opening = "Motor function assessment reveals mild abnormalities in one or more domains."
        elif overall_severity == SeverityLevel.MODERATE:
            opening = "Motor function assessment reveals moderate impairment requiring clinical attention."
        else:
            opening = "Motor function assessment reveals significant impairment across multiple domains requiring urgent clinical evaluation."
        
        # Domain-specific findings
        findings = []
        for domain, score in domain_scores.items():
            if score < 85:  # Not normal
                severity = self._score_to_severity_text(score)
                label = self.DOMAIN_LABELS.get(domain, domain.title())
                findings.append(f"{label}: {severity}")
        
        if findings:
            findings_text = "Key findings include: " + "; ".join(findings) + "."
        else:
            findings_text = "No significant abnormalities identified."
        
        # Most severe biomarkers
        severe_markers = [sb for sb in scored_biomarkers if sb.severity.value >= 2]
        if severe_markers:
            severe_text = "Biomarkers of particular concern: " + ", ".join([
                f"{sb.name.replace('_', ' ')} ({sb.interpretation})"
                for sb in severe_markers[:3]
            ]) + "."
        else:
            severe_text = ""
        
        parts = [opening, findings_text]
        if severe_text:
            parts.append(severe_text)
        
        return " ".join(parts)
    
    def _score_to_severity_text(self, score: float) -> str:
        """Convert numeric score to severity text"""
        if score >= 85:
            return "normal"
        elif score >= 65:
            return "mildly impaired"
        elif score >= 40:
            return "moderately impaired"
        else:
            return "severely impaired"
    
    def generate_recommendations(self, domain_scores: Dict[str, float],
                                 overall_severity: SeverityLevel) -> List[str]:
        """
        Generate clinical recommendations based on scores.
        
        Args:
            domain_scores: Dictionary of domain name -> score
            overall_severity: Overall severity classification
            
        Returns:
            List of recommendation strings
        """
        recommendations = []
        
        # Overall recommendations based on severity
        if overall_severity == SeverityLevel.SEVERE:
            recommendations.append("Urgent neurological consultation recommended")
            recommendations.append("Consider comprehensive movement disorder evaluation")
        elif overall_severity == SeverityLevel.MODERATE:
            recommendations.append("Neurological consultation advised within 2-4 weeks")
            recommendations.append("Follow-up assessment recommended to monitor progression")
        elif overall_severity == SeverityLevel.MILD:
            recommendations.append("Continue monitoring with periodic reassessment")
            recommendations.append("Consider referral if symptoms progress")
        
        # Domain-specific recommendations
        if domain_scores.get('tremor', 100) < 65:
            recommendations.append("Consider tremor medication review if applicable")
            recommendations.append("Assess functional impact of tremor on daily activities")
        
        if domain_scores.get('bradykinesia', 100) < 65:
            recommendations.append("Physical therapy evaluation for movement optimization")
            recommendations.append("Consider occupational therapy for adaptive strategies")
        
        if domain_scores.get('fatigue', 100) < 65:
            recommendations.append("Evaluate sleep quality and medication timing")
            recommendations.append("Consider energy conservation strategies")
        
        if domain_scores.get('smoothness', 100) < 65:
            recommendations.append("Movement quality training may be beneficial")
        
        if domain_scores.get('asymmetry', 100) < 65:
            recommendations.append("Lateralized findings warrant further investigation")
        
        return recommendations if recommendations else ["Continue standard care and monitoring"]


class ClinicalScoringEngine:
    """
    Main engine for clinical scoring and interpretation.
    
    This class combines severity scoring and clinical interpretation into
    a unified interface for generating comprehensive clinical assessments.
    """
    
    def __init__(self, reference_ranges: Optional[Dict[str, ReferenceRange]] = None):
        """
        Initialize ClinicalScoringEngine.
        
        Args:
            reference_ranges: Optional custom reference ranges
        """
        self.scorer = SeverityScorer(reference_ranges)
        self.interpreter = ClinicalInterpreter(self.scorer)
    
    def score_all(self, biomarkers: Dict[str, float]) -> ClinicalScoreSummary:
        """
        Score all biomarkers and generate comprehensive clinical summary.
        
        Args:
            biomarkers: Dictionary of biomarker name -> value
            
        Returns:
            ClinicalScoreSummary with all scores and interpretations
        """
        # Score individual biomarkers
        scored_biomarkers = self.scorer.score_biomarkers(biomarkers)
        
        # Compute domain scores
        domain_scores = {}
        for domain, markers in self.interpreter.DOMAINS.items():
            domain_scores[domain] = self.scorer.compute_domain_score(scored_biomarkers, markers)
        
        # Compute overall score (weighted average of domains)
        domain_weights = {
            'smoothness': 1.5,
            'tremor': 2.0,
            'bradykinesia': 2.0,
            'fatigue': 1.0,
            'asymmetry': 1.5,
            'range_of_motion': 1.0,
        }
        
        weighted_scores = []
        weights = []
        for domain, score in domain_scores.items():
            weights.append(domain_weights.get(domain, 1.0))
            weighted_scores.append(score)
        
        overall_score = np.average(weighted_scores, weights=weights) if weights else 100.0
        overall_severity = self.scorer.classify_severity(overall_score)
        
        # Generate clinical summary
        clinical_summary = self.interpreter.generate_clinical_summary(
            scored_biomarkers, domain_scores, overall_severity
        )
        
        # Generate recommendations
        recommendations = self.interpreter.generate_recommendations(
            domain_scores, overall_severity
        )
        
        return ClinicalScoreSummary(
            overall_score=overall_score,
            overall_severity=overall_severity,
            domain_scores=domain_scores,
            scored_biomarkers=scored_biomarkers,
            clinical_summary=clinical_summary,
            recommendations=recommendations
        )
    
    def get_severity_color(self, severity: SeverityLevel) -> str:
        """Get color code for severity level (for visualization)"""
        colors = {
            SeverityLevel.NORMAL: '#2ECC71',    # Green
            SeverityLevel.MILD: '#F1C40F',      # Yellow
            SeverityLevel.MODERATE: '#E67E22',  # Orange
            SeverityLevel.SEVERE: '#E74C3C',    # Red
        }
        return colors.get(severity, '#95A5A6')  # Gray default
    
    def get_score_color(self, score: float) -> str:
        """Get color code for numeric score (for visualization)"""
        if score >= 85:
            return '#2ECC71'  # Green
        elif score >= 65:
            return '#F1C40F'  # Yellow
        elif score >= 40:
            return '#E67E22'  # Orange
        else:
            return '#E74C3C'  # Red


# Convenience functions
def score_biomarkers(biomarkers: Dict[str, float]) -> ClinicalScoreSummary:
    """Quick scoring of biomarkers."""
    engine = ClinicalScoringEngine()
    return engine.score_all(biomarkers)


def get_severity(biomarkers: Dict[str, float]) -> SeverityLevel:
    """Quick severity classification."""
    summary = score_biomarkers(biomarkers)
    return summary.overall_severity


# =============================================================================
# EVENT_DETECTOR.PY
# =============================================================================



try:
    from tensorflow.keras.models import load_model
except ImportError:
    print("Warning: TensorFlow not available. Event detection will be limited.")
    load_model = None


@dataclass
class DetectedEvent:
    """Represents a detected event with timing and confidence"""
    category: str  # WRIST, FINGER, POSTURE, STATE
    event_type: str  # e.g., "rotation_in", "thumb_tap", "pronation"
    label: str  # Original label from model
    start_frame: int
    end_frame: int
    duration_frames: int
    confidence: float
    peak_confidence: float
    metadata: Dict = None

    @property
    def duration_seconds(self) -> float:
        """Duration in seconds (30 fps)"""
        return self.duration_frames / 30.0

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'category': self.category,
            'event_type': self.event_type,
            'label': self.label,
            'start_frame': int(self.start_frame),
            'end_frame': int(self.end_frame),
            'duration_frames': int(self.duration_frames),
            'duration_seconds': float(self.duration_seconds),
            'confidence': float(self.confidence),
            'peak_confidence': float(self.peak_confidence),
            'metadata': self.metadata or {}
        }


class EventDetector:
    """
    Detects hand motion events using LSTM model predictions.

    Event categories:
    - WRIST: Rotation-In, Rotation-Out
    - FINGER: Tap/Lift for each finger (Thumb, Index, Middle, Ring, Pinky)
    - POSTURE: Pronation, Supination, Neutral
    - STATE: Aperture, Closure
    """

    def __init__(
        self,
        model_path: Path = MODEL_PATH,
        encoders_path: Path = LABEL_ENCODERS_PATH,
        config_path: Path = TRAINING_CONFIG_PATH,
        min_event_duration: int = 5,
        merge_gap: int = 3,
        confidence_threshold: float = 0.3  # Lowered from 0.5 to detect more events
    ):
        self.model_path = model_path
        self.encoders_path = encoders_path
        self.config_path = config_path
        self.min_event_duration = min_event_duration
        self.merge_gap = merge_gap
        self.confidence_threshold = confidence_threshold

        # Load model and encoders
        self.model = None
        self.label_encoders = None
        self.training_config = None
        self._load_model()

    def _load_model(self):
        """Load LSTM model and label encoders"""
        try:
            if load_model is None:
                print("Warning: TensorFlow not available. Using fallback detection.")
                return

            # Load model
            if self.model_path.exists():
                self.model = load_model(str(self.model_path))
                print(f"✓ Loaded LSTM model from {self.model_path}")
            else:
                print(f"Warning: Model not found at {self.model_path}")

            # Load label encoders
            if self.encoders_path.exists():
                with open(self.encoders_path, 'rb') as f:
                    self.label_encoders = pickle.load(f)
                print(f"✓ Loaded label encoders")

            # Load training config
            if self.config_path.exists():
                with open(self.config_path, 'rb') as f:
                    self.training_config = pickle.load(f)
                print(f"✓ Loaded training config")

        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = None

    def detect_events(
        self,
        sequences: np.ndarray,
        frame_indices: Optional[np.ndarray] = None
    ) -> Dict[str, List[DetectedEvent]]:
        """
        Detect events from LSTM input sequences.

        Args:
            sequences: (n_sequences, SEQUENCE_LENGTH, 66) array
            frame_indices: Optional frame indices for each sequence

        Returns:
            Dictionary mapping category to list of detected events
        """
        if self.model is None:
            return self._fallback_detection(sequences)

        # Get predictions
        predictions = self.model.predict(sequences, verbose=0)

        # predictions is a list of 4 arrays: [wrist, finger, posture, state]
        # Each array: (n_sequences, n_classes) with softmax probabilities

        wrist_probs = predictions[0]
        finger_probs = predictions[1]
        posture_probs = predictions[2]
        state_probs = predictions[3]

        # Convert probabilities to labels
        wrist_labels = np.argmax(wrist_probs, axis=1)
        finger_labels = np.argmax(finger_probs, axis=1)
        posture_labels = np.argmax(posture_probs, axis=1)
        state_labels = np.argmax(state_probs, axis=1)

        # Get confidence scores
        wrist_confidence = np.max(wrist_probs, axis=1)
        finger_confidence = np.max(finger_probs, axis=1)
        posture_confidence = np.max(posture_probs, axis=1)
        state_confidence = np.max(state_probs, axis=1)

        # Decode labels
        wrist_names = self._decode_labels('wrist', wrist_labels)
        finger_names = self._decode_labels('finger', finger_labels)
        posture_names = self._decode_labels('posture', posture_labels)
        state_names = self._decode_labels('state', state_labels)

        # Generate frame indices if not provided
        if frame_indices is None:
            frame_indices = np.arange(len(sequences))

        # Extract events from each category
        events = {
            'WRIST': self._extract_events(
                'WRIST', wrist_names, wrist_confidence, frame_indices
            ),
            'FINGER': self._extract_events(
                'FINGER', finger_names, finger_confidence, frame_indices
            ),
            'POSTURE': self._extract_events(
                'POSTURE', posture_names, posture_confidence, frame_indices
            ),
            'STATE': self._extract_events(
                'STATE', state_names, state_confidence, frame_indices
            ),
        }

        return events

    def _decode_labels(self, head: str, labels: np.ndarray) -> List[str]:
        """Decode integer labels to string names"""
        if self.label_encoders and head in self.label_encoders:
            encoder = self.label_encoders[head]
            return encoder.inverse_transform(labels).tolist()
        else:
            # Fallback to default class names
            class_map = {
                'wrist': WRIST_CLASSES,
                'finger': FINGER_CLASSES,
                'posture': POSTURE_CLASSES,
                'state': STATE_CLASSES,
            }
            classes = class_map.get(head, [])
            return [classes[i] if i < len(classes) else 'Unknown' for i in labels]

    def _extract_events(
        self,
        category: str,
        labels: List[str],
        confidences: np.ndarray,
        frame_indices: np.ndarray
    ) -> List[DetectedEvent]:
        """
        Extract continuous events from label sequence.

        Applies:
        1. Filter by confidence threshold
        2. Remove "None" labels
        3. Merge events with small gaps
        4. Filter by minimum duration
        """
        events = []
        n = len(labels)

        if n == 0:
            return events

        # Track current event
        current_label = None
        current_start = None
        current_confidences = []

        for i in range(n):
            label = labels[i]
            conf = confidences[i]
            frame = frame_indices[i]

            # Skip "None" labels or low confidence
            if label in ['None', 'none', 'NONE'] or conf < self.confidence_threshold:
                # End current event if exists
                if current_label is not None:
                    # Check if gap is small enough to continue
                    if i - current_start <= self.merge_gap:
                        continue  # Keep event open
                    else:
                        # Close event
                        events.append(self._create_event(
                            category,
                            current_label,
                            frame_indices[current_start],
                            frame_indices[i - 1],
                            current_confidences
                        ))
                        current_label = None
                        current_confidences = []
                continue

            # Start new event or continue current
            if current_label is None:
                # Start new event
                current_label = label
                current_start = i
                current_confidences = [conf]
            elif label == current_label:
                # Continue event
                current_confidences.append(conf)
            else:
                # Different label - end current, start new
                events.append(self._create_event(
                    category,
                    current_label,
                    frame_indices[current_start],
                    frame_indices[i - 1],
                    current_confidences
                ))
                current_label = label
                current_start = i
                current_confidences = [conf]

        # Close final event
        if current_label is not None:
            events.append(self._create_event(
                category,
                current_label,
                frame_indices[current_start],
                frame_indices[n - 1],
                current_confidences
            ))

        # Filter by minimum duration
        events = [e for e in events if e.duration_frames >= self.min_event_duration]

        return events

    def _create_event(
        self,
        category: str,
        label: str,
        start_frame: int,
        end_frame: int,
        confidences: List[float]
    ) -> DetectedEvent:
        """Create DetectedEvent from extracted information"""
        # Map label to event type
        event_type = self._label_to_event_type(category, label)

        return DetectedEvent(
            category=category,
            event_type=event_type,
            label=label,
            start_frame=int(start_frame),
            end_frame=int(end_frame),
            duration_frames=int(end_frame - start_frame + 1),
            confidence=float(np.mean(confidences)),
            peak_confidence=float(np.max(confidences)),
            metadata={
                'confidence_std': float(np.std(confidences)),
                'confidence_min': float(np.min(confidences)),
            }
        )

    def _label_to_event_type(self, category: str, label: str) -> str:
        """Convert label to standardized event type"""
        if category in EVENT_CATEGORIES:
            category_map = EVENT_CATEGORIES[category]
            return category_map.get(label, label.lower().replace(' ', '_'))
        return label.lower().replace(' ', '_')

    def _fallback_detection(self, sequences: np.ndarray) -> Dict[str, List[DetectedEvent]]:
        """
        Fallback detection when model is not available.
        Uses heuristics based on hand motion patterns.
        """
        print("Using fallback event detection (heuristics)")

        # Extract basic features from sequences
        # sequences: (n_sequences, SEQUENCE_LENGTH, 66)

        events = {
            'WRIST': [],
            'FINGER': [],
            'POSTURE': [],
            'STATE': [],
        }

        # Simple heuristic: detect motion from velocity changes
        if len(sequences) == 0:
            return events

        # Compute velocity from position changes
        # Use wrist position (first 3 features)
        wrist_pos = sequences[:, :, 0:3]  # (n_seq, seq_len, 3)

        # Compute frame-to-frame velocity within each sequence
        velocities = np.diff(wrist_pos, axis=1)  # (n_seq, seq_len-1, 3)
        velocity_mag = np.linalg.norm(velocities, axis=2)  # (n_seq, seq_len-1)

        # Average velocity per sequence
        avg_velocity = np.mean(velocity_mag, axis=1)  # (n_seq,)

        # Detect high motion frames
        motion_threshold = np.percentile(avg_velocity, 75)
        high_motion = avg_velocity > motion_threshold

        # Create generic motion events
        if np.any(high_motion):
            motion_indices = np.where(high_motion)[0]
            start = motion_indices[0]
            end = motion_indices[-1]

            events['WRIST'].append(DetectedEvent(
                category='WRIST',
                event_type='motion_detected',
                label='Motion',
                start_frame=int(start),
                end_frame=int(end),
                duration_frames=int(end - start + 1),
                confidence=0.7,
                peak_confidence=0.7,
                metadata={'method': 'fallback_heuristic'}
            ))

        return events

    def get_event_summary(
        self,
        events: Dict[str, List[DetectedEvent]]
    ) -> Dict[str, Dict]:
        """
        Generate summary statistics for detected events.

        Returns:
            Dictionary with counts, durations, and confidence stats per category
        """
        summary = {}

        for category, event_list in events.items():
            if not event_list:
                summary[category] = {
                    'count': 0,
                    'total_duration_frames': 0,
                    'total_duration_seconds': 0.0,
                    'avg_duration_frames': 0.0,
                    'avg_confidence': 0.0,
                }
                continue

            durations = [e.duration_frames for e in event_list]
            confidences = [e.confidence for e in event_list]

            # Count by event type
            type_counts = {}
            for e in event_list:
                type_counts[e.event_type] = type_counts.get(e.event_type, 0) + 1

            summary[category] = {
                'count': len(event_list),
                'total_duration_frames': int(np.sum(durations)),
                'total_duration_seconds': float(np.sum(durations) / 30.0),
                'avg_duration_frames': float(np.mean(durations)),
                'avg_duration_seconds': float(np.mean(durations) / 30.0),
                'avg_confidence': float(np.mean(confidences)),
                'type_counts': type_counts,
            }

        return summary

    def events_to_dataframe(
        self,
        events: Dict[str, List[DetectedEvent]]
    ) -> pd.DataFrame:
        """Convert events to pandas DataFrame for analysis"""
        rows = []

        for category, event_list in events.items():
            for event in event_list:
                rows.append({
                    'category': event.category,
                    'event_type': event.event_type,
                    'label': event.label,
                    'start_frame': event.start_frame,
                    'end_frame': event.end_frame,
                    'duration_frames': event.duration_frames,
                    'duration_seconds': event.duration_seconds,
                    'confidence': event.confidence,
                    'peak_confidence': event.peak_confidence,
                })

        if not rows:
            # Return empty DataFrame with columns
            return pd.DataFrame(columns=[
                'category', 'event_type', 'label', 'start_frame', 'end_frame',
                'duration_frames', 'duration_seconds', 'confidence', 'peak_confidence'
            ])

        return pd.DataFrame(rows)


class AdaptiveEventDetector(EventDetector):
    """
    Enhanced event detector with adaptive thresholds.

    Features:
    - Per-recording confidence calibration
    - Adaptive event merging based on recording characteristics
    - Context-aware event validation
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.calibration_stats: Optional[Dict] = None

    def calibrate(self, sequences: np.ndarray):
        """
        Calibrate detector using sample sequences from recording.

        Computes baseline confidence statistics for adaptive thresholding.
        """
        if self.model is None:
            return

        # Get predictions for calibration
        predictions = self.model.predict(sequences[:100], verbose=0)

        # Compute confidence statistics
        wrist_conf = np.max(predictions[0], axis=1)
        finger_conf = np.max(predictions[1], axis=1)
        posture_conf = np.max(predictions[2], axis=1)
        state_conf = np.max(predictions[3], axis=1)

        self.calibration_stats = {
            'wrist': {
                'mean': float(np.mean(wrist_conf)),
                'std': float(np.std(wrist_conf)),
                'median': float(np.median(wrist_conf)),
            },
            'finger': {
                'mean': float(np.mean(finger_conf)),
                'std': float(np.std(finger_conf)),
            },
            'posture': {
                'mean': float(np.mean(posture_conf)),
                'std': float(np.std(posture_conf)),
            },
            'state': {
                'mean': float(np.mean(state_conf)),
                'std': float(np.std(state_conf)),
            },
        }

        print(f"✓ Calibrated event detector with {len(sequences)} sequences")

    def detect_events_adaptive(
        self,
        sequences: np.ndarray,
        frame_indices: Optional[np.ndarray] = None
    ) -> Dict[str, List[DetectedEvent]]:
        """
        Detect events with adaptive thresholds based on calibration.
        """
        if self.calibration_stats is None:
            # Auto-calibrate if not done
            self.calibrate(sequences)

        # Use adaptive confidence threshold
        # Set to mean - 0.5*std to capture more events
        if self.calibration_stats:
            avg_conf = np.mean([
                stats['mean'] for stats in self.calibration_stats.values()
            ])
            avg_std = np.mean([
                stats['std'] for stats in self.calibration_stats.values()
            ])
            adaptive_threshold = max(0.3, avg_conf - 0.5 * avg_std)

            # Temporarily override threshold
            original_threshold = self.confidence_threshold
            self.confidence_threshold = adaptive_threshold

            events = self.detect_events(sequences, frame_indices)

            # Restore original
            self.confidence_threshold = original_threshold
        else:
            events = self.detect_events(sequences, frame_indices)

        return events


# =============================================================================
# EVENT_ANALYSIS.PY
# =============================================================================





@dataclass
class EventStatistics:
    """Statistical summary for a specific event type"""
    event_type: str
    category: str
    count: int
    total_duration_seconds: float
    mean_duration_seconds: float
    std_duration_seconds: float
    min_duration_seconds: float
    max_duration_seconds: float
    mean_confidence: float
    std_confidence: float
    frequency_per_minute: float

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class WindowAnalysis:
    """Analysis of events within a sliding window"""
    window_start_frame: int
    window_end_frame: int
    window_duration_seconds: float
    event_counts_by_category: Dict[str, int]
    event_counts_by_type: Dict[str, int]
    total_events: int
    dominant_event_type: Optional[str]
    activity_level: float  # 0.0 to 1.0


@dataclass
class EventTransition:
    """Transition between two event types"""
    from_event: str
    to_event: str
    from_category: str
    to_category: str
    count: int
    mean_transition_time_seconds: float
    std_transition_time_seconds: float


@dataclass
class ComprehensiveEventReport:
    """Complete event analysis report"""
    total_frames: int
    total_duration_seconds: float
    total_events: int
    events_by_category: Dict[str, int]
    events_by_type: Dict[str, int]
    event_statistics: List[EventStatistics]
    window_analyses: List[WindowAnalysis]
    event_transitions: List[EventTransition]
    temporal_distribution: Dict[str, List[int]]  # Event counts per time bin
    summary: Dict[str, any]

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'total_frames': self.total_frames,
            'total_duration_seconds': self.total_duration_seconds,
            'total_events': self.total_events,
            'events_by_category': self.events_by_category,
            'events_by_type': self.events_by_type,
            'event_statistics': [stat.to_dict() for stat in self.event_statistics],
            'window_analyses': [asdict(wa) for wa in self.window_analyses],
            'event_transitions': [asdict(et) for et in self.event_transitions],
            'temporal_distribution': self.temporal_distribution,
            'summary': self.summary,
        }


class EventAnalyzer:
    """
    Comprehensive event analysis with statistical insights.

    Features:
    - Event counting and categorization
    - Statistical measures (mean, std, frequency)
    - Window-based analysis (sliding windows)
    - Transition analysis (event sequences)
    - Temporal distribution analysis
    - Activity level computation
    """

    def __init__(
        self,
        fps: int = DEFAULT_FPS,
        window_size_seconds: float = 10.0,
        window_stride_seconds: float = 5.0
    ):
        """
        Initialize event analyzer.

        Args:
            fps: Frame rate
            window_size_seconds: Size of sliding window for analysis
            window_stride_seconds: Stride for sliding window
        """
        self.fps = fps
        self.window_size_frames = int(window_size_seconds * fps)
        self.window_stride_frames = int(window_stride_seconds * fps)

    def analyze_events(
        self,
        events_by_category: Dict[str, List],
        total_frames: int
    ) -> ComprehensiveEventReport:
        """
        Perform comprehensive event analysis.

        Args:
            events_by_category: Detected events grouped by category (can be EventPrediction or dict)
            total_frames: Total number of frames in recording

        Returns:
            Comprehensive event report with all analyses
        """
        # Flatten all events and convert dicts to EventPrediction if needed
        all_events = []
        for category, events in events_by_category.items():
            for event in events:
                if isinstance(event, dict):
                    # Convert dict to EventPrediction
                    start_f = event.get('start_frame', 0)
                    end_f = event.get('end_frame', 0)
                    duration_f = end_f - start_f + 1
                    duration_s = event.get('duration_seconds', duration_f / self.fps)
                    event_obj = EventPrediction(
                        frame=start_f,
                        timestamp=start_f / self.fps,
                        event_type=event.get('event_type', 'unknown'),
                        category=event.get('category', category),
                        confidence=event.get('confidence', 0.0),
                        start_frame=start_f,
                        end_frame=end_f,
                        duration_seconds=duration_s
                    )
                    all_events.append(event_obj)
                else:
                    all_events.append(event)

        # Sort by start frame
        all_events.sort(key=lambda e: e.start_frame)

        total_duration_seconds = total_frames / self.fps

        # Count events
        events_by_category_count = self._count_by_category(events_by_category)
        events_by_type_count = self._count_by_type(all_events)

        # Compute statistics for each event type
        event_statistics = self._compute_event_statistics(
            all_events, total_duration_seconds
        )

        # Window-based analysis
        window_analyses = self._analyze_windows(
            all_events, total_frames
        )

        # Transition analysis
        event_transitions = self._analyze_transitions(all_events)

        # Temporal distribution
        temporal_distribution = self._compute_temporal_distribution(
            all_events, total_frames
        )

        # Summary
        summary = self._create_summary(
            all_events, events_by_category_count, total_duration_seconds
        )

        return ComprehensiveEventReport(
            total_frames=total_frames,
            total_duration_seconds=total_duration_seconds,
            total_events=len(all_events),
            events_by_category=events_by_category_count,
            events_by_type=events_by_type_count,
            event_statistics=event_statistics,
            window_analyses=window_analyses,
            event_transitions=event_transitions,
            temporal_distribution=temporal_distribution,
            summary=summary,
        )

    def analyze(
        self,
        events_by_category: Dict[str, List],
        total_frames: int
    ) -> ComprehensiveEventReport:
        """
        Alias for analyze_events to match main.py API expectations.

        Args:
            events_by_category: Detected events grouped by category
            total_frames: Total number of frames in recording

        Returns:
            Comprehensive event report with all analyses
        """
        return self.analyze_events(events_by_category, total_frames)

    def _count_by_category(
        self, events_by_category: Dict[str, List[EventPrediction]]
    ) -> Dict[str, int]:
        """Count events by category"""
        return {
            category: len(events)
            for category, events in events_by_category.items()
        }

    def _count_by_type(self, events: List[EventPrediction]) -> Dict[str, int]:
        """Count events by type"""
        counts = defaultdict(int)
        for event in events:
            counts[event.event_type] += 1
        return dict(counts)

    def _compute_event_statistics(
        self,
        all_events: List[EventPrediction],
        total_duration_seconds: float
    ) -> List[EventStatistics]:
        """Compute statistics for each event type"""
        # Group by event type
        events_by_type = defaultdict(list)
        for event in all_events:
            events_by_type[event.event_type].append(event)

        statistics = []

        for event_type, events in events_by_type.items():
            durations = [e.duration_seconds for e in events]
            confidences = [e.confidence for e in events]

            total_duration = sum(durations)
            mean_duration = np.mean(durations)
            std_duration = np.std(durations) if len(durations) > 1 else 0.0

            frequency_per_minute = (len(events) / total_duration_seconds) * 60.0

            statistics.append(EventStatistics(
                event_type=event_type,
                category=events[0].category,
                count=len(events),
                total_duration_seconds=total_duration,
                mean_duration_seconds=mean_duration,
                std_duration_seconds=std_duration,
                min_duration_seconds=min(durations),
                max_duration_seconds=max(durations),
                mean_confidence=np.mean(confidences),
                std_confidence=np.std(confidences) if len(confidences) > 1 else 0.0,
                frequency_per_minute=frequency_per_minute,
            ))

        # Sort by count descending
        statistics.sort(key=lambda s: s.count, reverse=True)

        return statistics

    def _analyze_windows(
        self,
        all_events: List[EventPrediction],
        total_frames: int
    ) -> List[WindowAnalysis]:
        """Analyze events within sliding windows"""
        window_analyses = []

        for window_start in range(0, total_frames, self.window_stride_frames):
            window_end = min(window_start + self.window_size_frames, total_frames)

            # Find events overlapping this window
            window_events = [
                e for e in all_events
                if self._event_overlaps_window(e, window_start, window_end)
            ]

            if len(window_events) == 0:
                continue

            # Count by category
            category_counts = defaultdict(int)
            for event in window_events:
                category_counts[event.category] += 1

            # Count by type
            type_counts = defaultdict(int)
            for event in window_events:
                type_counts[event.event_type] += 1

            # Dominant event type
            dominant_type = max(type_counts.items(), key=lambda x: x[1])[0] if type_counts else None

            # Activity level (0.0 to 1.0)
            # Based on proportion of window covered by events
            covered_frames = 0
            for event in window_events:
                overlap_start = max(event.start_frame, window_start)
                overlap_end = min(event.end_frame, window_end)
                covered_frames += max(0, overlap_end - overlap_start)

            activity_level = min(1.0, covered_frames / (window_end - window_start))

            window_analyses.append(WindowAnalysis(
                window_start_frame=window_start,
                window_end_frame=window_end,
                window_duration_seconds=(window_end - window_start) / self.fps,
                event_counts_by_category=dict(category_counts),
                event_counts_by_type=dict(type_counts),
                total_events=len(window_events),
                dominant_event_type=dominant_type,
                activity_level=activity_level,
            ))

        return window_analyses

    def _event_overlaps_window(
        self,
        event: EventPrediction,
        window_start: int,
        window_end: int
    ) -> bool:
        """Check if event overlaps with window"""
        return not (event.end_frame < window_start or event.start_frame >= window_end)

    def _analyze_transitions(
        self, all_events: List[EventPrediction]
    ) -> List[EventTransition]:
        """Analyze transitions between events"""
        if len(all_events) < 2:
            return []

        # Collect transitions
        transitions = defaultdict(list)

        for i in range(len(all_events) - 1):
            from_event = all_events[i]
            to_event = all_events[i + 1]

            # Transition time (gap between events)
            transition_time = (to_event.start_frame - from_event.end_frame) / self.fps

            key = (from_event.event_type, to_event.event_type,
                   from_event.category, to_event.category)
            transitions[key].append(transition_time)

        # Compute statistics
        transition_stats = []

        for (from_type, to_type, from_cat, to_cat), times in transitions.items():
            transition_stats.append(EventTransition(
                from_event=from_type,
                to_event=to_type,
                from_category=from_cat,
                to_category=to_cat,
                count=len(times),
                mean_transition_time_seconds=np.mean(times),
                std_transition_time_seconds=np.std(times) if len(times) > 1 else 0.0,
            ))

        # Sort by count descending
        transition_stats.sort(key=lambda t: t.count, reverse=True)

        return transition_stats

    def _compute_temporal_distribution(
        self,
        all_events: List[EventPrediction],
        total_frames: int,
        n_bins: int = 20
    ) -> Dict[str, List[int]]:
        """
        Compute temporal distribution of events.

        Returns:
            Event counts per time bin for each category
        """
        bin_size = total_frames // n_bins

        distribution = {
            'WRIST': [0] * n_bins,
            'FINGER': [0] * n_bins,
            'POSTURE': [0] * n_bins,
            'STATE': [0] * n_bins,
        }

        for event in all_events:
            # Find bin for event start
            bin_idx = min(event.start_frame // bin_size, n_bins - 1)
            distribution[event.category][bin_idx] += 1

        return distribution

    def _create_summary(
        self,
        all_events: List[EventPrediction],
        category_counts: Dict[str, int],
        total_duration_seconds: float
    ) -> Dict:
        """Create high-level summary"""
        if len(all_events) == 0:
            return {
                'most_frequent_event': None,
                'most_frequent_category': None,
                'average_events_per_minute': 0.0,
                'average_event_duration_seconds': 0.0,
                'total_event_time_seconds': 0.0,
                'event_coverage_percentage': 0.0,
            }

        # Most frequent event type
        type_counts = defaultdict(int)
        for event in all_events:
            type_counts[event.event_type] += 1
        most_frequent_event = max(type_counts.items(), key=lambda x: x[1])[0]

        # Most frequent category
        most_frequent_category = max(category_counts.items(), key=lambda x: x[1])[0]

        # Average events per minute
        avg_events_per_minute = (len(all_events) / total_duration_seconds) * 60.0

        # Average event duration
        avg_event_duration = np.mean([e.duration_seconds for e in all_events])

        # Total event time
        total_event_time = sum(e.duration_seconds for e in all_events)

        # Event coverage percentage
        event_coverage_pct = (total_event_time / total_duration_seconds) * 100.0

        return {
            'most_frequent_event': most_frequent_event,
            'most_frequent_category': most_frequent_category,
            'average_events_per_minute': avg_events_per_minute,
            'average_event_duration_seconds': avg_event_duration,
            'total_event_time_seconds': total_event_time,
            'event_coverage_percentage': event_coverage_pct,
        }

    def generate_event_dataframe(
        self, events_by_category: Dict[str, List]
    ) -> pd.DataFrame:
        """
        Convert events to DataFrame for Excel export.

        Returns:
            DataFrame with all event details
        """
        rows = []

        for category, events in events_by_category.items():
            for event in events:
                if isinstance(event, dict):
                    # Handle dict format
                    start_f = event.get('start_frame', 0)
                    end_f = event.get('end_frame', 0)
                    duration_s = event.get('duration_seconds', (end_f - start_f + 1) / self.fps)
                    rows.append({
                        'Category': event.get('category', category),
                        'Event Type': event.get('event_type', 'unknown'),
                        'Start Frame': start_f,
                        'End Frame': end_f,
                        'Duration (frames)': end_f - start_f + 1,
                        'Duration (seconds)': duration_s,
                        'Confidence': event.get('confidence', 0.0),
                    })
                else:
                    # Handle EventPrediction format
                    rows.append({
                        'Category': event.category,
                        'Event Type': event.event_type,
                        'Start Frame': event.start_frame,
                        'End Frame': event.end_frame,
                        'Duration (frames)': event.end_frame - event.start_frame + 1,
                        'Duration (seconds)': event.duration_seconds,
                        'Confidence': event.confidence,
                    })

        df = pd.DataFrame(rows)

        if len(df) > 0:
            # Sort by start frame
            df = df.sort_values('Start Frame').reset_index(drop=True)

        return df

    def generate_statistics_dataframe(
        self, event_report: ComprehensiveEventReport
    ) -> pd.DataFrame:
        """
        Convert event statistics to DataFrame.

        Returns:
            DataFrame with statistical measures
        """
        rows = []

        for stat in event_report.event_statistics:
            rows.append({
                'Event Type': stat.event_type,
                'Category': stat.category,
                'Count': stat.count,
                'Total Duration (s)': round(stat.total_duration_seconds, 2),
                'Mean Duration (s)': round(stat.mean_duration_seconds, 3),
                'Std Duration (s)': round(stat.std_duration_seconds, 3),
                'Min Duration (s)': round(stat.min_duration_seconds, 3),
                'Max Duration (s)': round(stat.max_duration_seconds, 3),
                'Mean Confidence': round(stat.mean_confidence, 3),
                'Frequency (per min)': round(stat.frequency_per_minute, 2),
            })

        return pd.DataFrame(rows)

    def generate_window_dataframe(
        self, event_report: ComprehensiveEventReport
    ) -> pd.DataFrame:
        """
        Convert window analyses to DataFrame.

        Returns:
            DataFrame with window-based analysis
        """
        rows = []

        for window in event_report.window_analyses:
            rows.append({
                'Window Start (frame)': window.window_start_frame,
                'Window End (frame)': window.window_end_frame,
                'Duration (s)': round(window.window_duration_seconds, 2),
                'Total Events': window.total_events,
                'WRIST Events': window.event_counts_by_category.get('WRIST', 0),
                'FINGER Events': window.event_counts_by_category.get('FINGER', 0),
                'POSTURE Events': window.event_counts_by_category.get('POSTURE', 0),
                'STATE Events': window.event_counts_by_category.get('STATE', 0),
                'Dominant Event': window.dominant_event_type or 'N/A',
                'Activity Level': round(window.activity_level, 3),
            })

        return pd.DataFrame(rows)

    def generate_transition_dataframe(
        self, event_report: ComprehensiveEventReport
    ) -> pd.DataFrame:
        """
        Convert event transitions to DataFrame.

        Returns:
            DataFrame with transition analysis
        """
        rows = []

        for transition in event_report.event_transitions:
            rows.append({
                'From Event': transition.from_event,
                'To Event': transition.to_event,
                'From Category': transition.from_category,
                'To Category': transition.to_category,
                'Count': transition.count,
                'Mean Transition Time (s)': round(transition.mean_transition_time_seconds, 3),
                'Std Transition Time (s)': round(transition.std_transition_time_seconds, 3),
            })

        return pd.DataFrame(rows)

    def save_report_json(
        self,
        event_report: ComprehensiveEventReport,
        output_path: Path
    ):
        """Save comprehensive event report as JSON"""
        with open(output_path, 'w') as f:
            json.dump(event_report.to_dict(), f, indent=2)
