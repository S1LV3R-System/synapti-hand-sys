"""
Main Analysis Orchestrator
Handles LSTM inference, report generation, video generation, and backend integration

Consolidated from: main_enhanced.py, lstm_engine.py, report_generator_enhanced.py,
labeled_video_generator_fixed.py, labeled_frame_generator.py, backend_integration.py
"""

# Standard library imports
import argparse
import json
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

# Third-party imports
import cv2
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages

# Local imports
from config import (
    DEFAULT_FPS,
    EVENT_CATEGORIES,
    FINGER_CLASSES,
    FINGERTIP_INDICES,
    LABEL_ENCODERS_PATH,
    LANDMARK_NAMES,
    MODEL_PATH,
    POSTURE_CLASSES,
    STATE_CLASSES,
    TRAINING_CONFIG_PATH,
    WRIST_CLASSES,
)
from data_handling import AdaptiveNormalizer, DataNormalizer
from protocol_system import EventAnalyzer, ProtocolAnalyzer

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
warnings.filterwarnings('ignore')


# =============================================================================
# LSTM ENGINE
# =============================================================================

@dataclass
class ModelInfo:
    """Information about loaded LSTM model."""
    framework: str  # 'tensorflow' or 'pytorch'
    device: str  # 'CPU' or 'GPU'
    model_path: str
    sequence_length: int = 30
    num_features: int = 63  # 21 landmarks × 3 coordinates


class LSTMEngine:
    """
    LSTM Engine for hand motion event detection.

    Handles multi-head LSTM model for detecting:
    - Wrist movements (rotation in/out)
    - Finger movements (tap/lift for each finger)
    - Posture (pronation/supination/neutral)
    - State (aperture/closure)
    """

    def __init__(
        self,
        batch_size: int = 32,
        confidence_threshold: float = 0.5,
        fps: int = DEFAULT_FPS
    ):
        """
        Args:
            batch_size: Batch size for inference
            confidence_threshold: Minimum confidence for event detection
            fps: Frames per second
        """
        self.batch_size = batch_size
        self.confidence_threshold = confidence_threshold
        self.fps = fps
        self.model = None
        self.label_encoders = None
        self.model_info = None

        # Try to load model
        self._load_model()

    def _load_model(self):
        """Load LSTM model and label encoders."""
        try:
            import tensorflow as tf
            import pickle

            if not MODEL_PATH.exists():
                print(f"  ⚠ Model not found at {MODEL_PATH}")
                return

            # Load model
            self.model = tf.keras.models.load_model(MODEL_PATH, compile=False)

            # Load label encoders
            if LABEL_ENCODERS_PATH.exists():
                with open(LABEL_ENCODERS_PATH, 'rb') as f:
                    self.label_encoders = pickle.load(f)

            # Determine device
            device = 'GPU' if tf.config.list_physical_devices('GPU') else 'CPU'

            self.model_info = ModelInfo(
                framework='tensorflow',
                device=device,
                model_path=str(MODEL_PATH)
            )

        except Exception as e:
            print(f"  ⚠ Failed to load LSTM model: {e}")
            self.model = None

    def is_available(self) -> bool:
        """Check if LSTM model is loaded and ready."""
        return self.model is not None

    def predict(self, landmark_data: pd.DataFrame) -> Dict:
        """
        Run LSTM inference on landmark data.

        Args:
            landmark_data: DataFrame with landmark columns (x0, y0, z0, ...)

        Returns:
            Dictionary with detected events per head (wrist, finger, posture, state)
        """
        if not self.is_available():
            return self._fallback_detection(landmark_data)

        # Prepare sequences
        sequences = self._prepare_sequences(landmark_data)

        # Run inference
        predictions = self.model.predict(sequences, batch_size=self.batch_size, verbose=0)

        # Decode predictions
        events = self._decode_predictions(predictions, landmark_data)

        return events

    def _prepare_sequences(self, df: pd.DataFrame) -> np.ndarray:
        """Prepare sequences for LSTM model."""
        seq_length = self.model_info.sequence_length

        # Extract landmark coordinates
        coords = []
        for i in range(21):
            coords.extend([f'x{i}', f'y{i}', f'z{i}'])

        data = df[coords].values

        # Create sliding windows
        sequences = []
        for i in range(len(data) - seq_length + 1):
            sequences.append(data[i:i+seq_length])

        return np.array(sequences)

    def _decode_predictions(self, predictions: Tuple, df: pd.DataFrame) -> Dict:
        """Decode LSTM predictions into events."""
        wrist_pred, finger_pred, posture_pred, state_pred = predictions

        events = {
            'wrist': [],
            'finger': [],
            'posture': [],
            'state': []
        }

        seq_length = self.model_info.sequence_length

        for i in range(len(wrist_pred)):
            frame_idx = i + seq_length - 1

            # Wrist events
            wrist_class = np.argmax(wrist_pred[i])
            wrist_conf = wrist_pred[i][wrist_class]
            if wrist_conf > self.confidence_threshold and wrist_class > 0:
                events['wrist'].append({
                    'frame': frame_idx,
                    'event': WRIST_CLASSES[wrist_class],
                    'confidence': float(wrist_conf)
                })

            # Finger events
            finger_class = np.argmax(finger_pred[i])
            finger_conf = finger_pred[i][finger_class]
            if finger_conf > self.confidence_threshold and finger_class != FINGER_CLASSES.index('None'):
                events['finger'].append({
                    'frame': frame_idx,
                    'event': FINGER_CLASSES[finger_class],
                    'confidence': float(finger_conf)
                })

            # Posture
            posture_class = np.argmax(posture_pred[i])
            posture_conf = posture_pred[i][posture_class]
            if posture_conf > self.confidence_threshold and posture_class != POSTURE_CLASSES.index('None'):
                events['posture'].append({
                    'frame': frame_idx,
                    'event': POSTURE_CLASSES[posture_class],
                    'confidence': float(posture_conf)
                })

            # State
            state_class = np.argmax(state_pred[i])
            state_conf = state_pred[i][state_class]
            if state_conf > self.confidence_threshold and state_class != STATE_CLASSES.index('None'):
                events['state'].append({
                    'frame': frame_idx,
                    'event': STATE_CLASSES[state_class],
                    'confidence': float(state_conf)
                })

        return events

    def _fallback_detection(self, df: pd.DataFrame) -> Dict:
        """Fallback event detection without LSTM."""
        return {
            'wrist': [],
            'finger': [],
            'posture': [],
            'state': []
        }


# =============================================================================
# ENHANCED REPORT GENERATOR
# =============================================================================

class EnhancedReportGenerator:
    """
    Generate comprehensive analysis reports in multiple formats.

    Outputs:
    - XLSX with 6 sheets (Summary, Events, Biomarkers, Metrics, Raw Data, Metadata)
    - High-resolution PNG charts (300 DPI)
    - PDF report
    - JSON results
    """

    def __init__(self, output_dir: Union[str, Path]):
        """
        Args:
            output_dir: Directory for output files
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_all(
        self,
        analysis_results: Dict,
        protocol_config: Dict,
        recording_metadata: Optional[Dict] = None
    ) -> Dict[str, str]:
        """
        Generate all report formats.

        Returns:
            Dictionary mapping format to file path
        """
        report_files = {}

        # Generate XLSX report
        xlsx_path = self.output_dir / "analysis_report.xlsx"
        self._generate_xlsx(xlsx_path, analysis_results, protocol_config, recording_metadata)
        report_files['xlsx'] = str(xlsx_path)

        # Generate PNG charts
        png_path = self.output_dir / "analysis_charts.png"
        self._generate_charts(png_path, analysis_results)
        report_files['png'] = str(png_path)

        # Generate PDF report
        pdf_path = self.output_dir / "analysis_report.pdf"
        self._generate_pdf(pdf_path, analysis_results, protocol_config)
        report_files['pdf'] = str(pdf_path)

        # Save JSON results
        json_path = self.output_dir / "analysis_results.json"
        with open(json_path, 'w') as f:
            json.dump(analysis_results, f, indent=2)
        report_files['json'] = str(json_path)

        return report_files

    def _generate_xlsx(self, path: Path, results: Dict, protocol: Dict, metadata: Optional[Dict]):
        """Generate XLSX report with multiple sheets."""
        with pd.ExcelWriter(path, engine='openpyxl') as writer:
            # Sheet 1: Summary
            summary_data = {
                'Protocol': [protocol.get('name', 'Unknown')],
                'Duration': [results.get('duration_seconds', 0)],
                'Total Events': [len(results.get('events', []))],
                'Average Confidence': [results.get('avg_confidence', 0)],
            }
            pd.DataFrame(summary_data).to_excel(writer, sheet_name='Summary', index=False)

            # Sheet 2: Events
            if 'events' in results:
                events_df = pd.DataFrame(results['events'])
                events_df.to_excel(writer, sheet_name='Events', index=False)

            # Sheet 3: Biomarkers
            if 'biomarkers' in results:
                bio_df = pd.DataFrame([results['biomarkers']])
                bio_df.to_excel(writer, sheet_name='Biomarkers', index=False)

            # Sheet 4: Metrics
            if 'metrics' in results:
                metrics_df = pd.DataFrame([results['metrics']])
                metrics_df.to_excel(writer, sheet_name='Metrics', index=False)

            # Sheet 5: Raw Data (if available)
            if 'normalized_data_path' in results:
                # Load normalized data from CSV
                normalized_df = pd.read_csv(results['normalized_data_path'])
                normalized_df.to_excel(writer, sheet_name='Raw Data', index=False)

            # Sheet 6: Metadata
            if metadata:
                meta_df = pd.DataFrame([metadata])
                meta_df.to_excel(writer, sheet_name='Metadata', index=False)

    def _generate_charts(self, path: Path, results: Dict):
        """Generate high-resolution charts."""
        fig, axes = plt.subplots(2, 2, figsize=(12, 10), dpi=300)
        fig.suptitle('Analysis Results', fontsize=16, fontweight='bold')

        # Chart 1: Event timeline
        if 'events' in results and results['events']:
            events_df = pd.DataFrame(results['events'])
            axes[0, 0].scatter(events_df['frame'], events_df['confidence'], alpha=0.6)
            axes[0, 0].set_title('Event Detection Timeline')
            axes[0, 0].set_xlabel('Frame')
            axes[0, 0].set_ylabel('Confidence')

        # Chart 2: Event distribution
        if 'events' in results and results['events']:
            event_counts = pd.DataFrame(results['events'])['event'].value_counts()
            axes[0, 1].bar(range(len(event_counts)), event_counts.values)
            axes[0, 1].set_title('Event Distribution')
            axes[0, 1].set_xticks(range(len(event_counts)))
            axes[0, 1].set_xticklabels(event_counts.index, rotation=45, ha='right')

        # Chart 3: Confidence distribution
        if 'events' in results and results['events']:
            confidences = [e['confidence'] for e in results['events']]
            axes[1, 0].hist(confidences, bins=20, alpha=0.7)
            axes[1, 0].set_title('Confidence Distribution')
            axes[1, 0].set_xlabel('Confidence')
            axes[1, 0].set_ylabel('Count')

        # Chart 4: Summary metrics
        if 'biomarkers' in results:
            metrics = results['biomarkers']
            metric_names = list(metrics.keys())[:5]
            metric_values = [metrics[k] for k in metric_names]
            axes[1, 1].barh(metric_names, metric_values)
            axes[1, 1].set_title('Top Biomarkers')

        plt.tight_layout()
        plt.savefig(path, dpi=300, bbox_inches='tight')
        plt.close()

    def _generate_pdf(self, path: Path, results: Dict, protocol: Dict):
        """Generate PDF report."""
        with PdfPages(path) as pdf:
            # Page 1: Summary
            fig = plt.figure(figsize=(8.5, 11))
            plt.axis('off')
            summary_text = f"""
            ANALYSIS REPORT

            Protocol: {protocol.get('name', 'Unknown')}
            Duration: {results.get('duration_seconds', 0):.2f} seconds
            Total Events: {len(results.get('events', []))}
            Average Confidence: {results.get('avg_confidence', 0):.3f}
            """
            plt.text(0.1, 0.5, summary_text, fontsize=12, verticalalignment='center')
            pdf.savefig(fig)
            plt.close()


# =============================================================================
# LABELED VIDEO GENERATOR
# =============================================================================

class LabeledVideoGenerator:
    """Generate labeled video with detected events overlaid."""

    def __init__(self, fps: int = DEFAULT_FPS):
        self.fps = fps

    def generate(
        self,
        video_path: Union[str, Path],
        events: Dict,
        output_path: Union[str, Path]
    ):
        """
        Generate labeled video.

        Args:
            video_path: Input video path
            events: Detected events
            output_path: Output video path
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")

        # Get video properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, self.fps, (width, height))

        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # Draw events for this frame
            self._draw_events(frame, frame_idx, events)

            out.write(frame)
            frame_idx += 1

        cap.release()
        out.release()

    def _draw_events(self, frame: np.ndarray, frame_idx: int, events: Dict):
        """Draw event labels on frame."""
        y_offset = 30
        for event_type, event_list in events.items():
            for event in event_list:
                if event['frame'] == frame_idx:
                    text = f"{event_type}: {event['event']} ({event['confidence']:.2f})"
                    cv2.putText(
                        frame, text, (10, y_offset),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2
                    )
                    y_offset += 25


# =============================================================================
# ANALYSIS ORCHESTRATOR
# =============================================================================

class EnhancedAnalysisOrchestrator:
    """
    Main orchestrator for complete analysis pipeline.

    Pipeline:
    1. Load raw data
    2. Normalize data
    3. Detect events using LSTM
    4. Perform event analysis
    5. Execute protocol-driven analysis
    6. Generate reports
    """

    def __init__(
        self,
        protocol_config: Dict,
        output_dir: Union[str, Path],
        fps: int = DEFAULT_FPS,
        adaptive: bool = True,
        use_lstm: bool = True
    ):
        """
        Args:
            protocol_config: Protocol configuration
            output_dir: Output directory
            fps: Frames per second
            adaptive: Use adaptive techniques
            use_lstm: Use LSTM for event detection
        """
        self.protocol_config = protocol_config
        self.output_dir = Path(output_dir)
        self.fps = fps
        self.use_lstm = use_lstm

        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Initialize components
        self.normalizer = AdaptiveNormalizer(fps=fps) if adaptive else DataNormalizer(fps=fps)
        self.lstm_engine = LSTMEngine(fps=fps) if use_lstm else None
        self.event_analyzer = EventAnalyzer(fps=fps)
        self.protocol_analyzer = ProtocolAnalyzer(protocol_config, fps=fps)
        self.report_generator = EnhancedReportGenerator(self.output_dir)
        self.video_generator = LabeledVideoGenerator(fps=fps)

    def analyze_file(
        self,
        input_file: Union[str, Path],
        recording_metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Analyze a recording file.

        Args:
            input_file: Path to normalized data file
            recording_metadata: Optional recording metadata

        Returns:
            Analysis results and output file paths
        """
        print(f"\n{'='*70}")
        print(f" ANALYZING: {input_file}")
        print(f"{'='*70}\n")

        # Load data
        print("Loading data...")
        df = pd.read_excel(input_file) if str(input_file).endswith('.xlsx') else pd.read_csv(input_file)
        print(f"  ✓ Loaded {len(df)} frames")

        # Normalize
        print("\nNormalizing data...")
        normalized_df = self.normalizer.normalize(df)
        print(f"  ✓ Normalized")

        # Detect events
        print("\nDetecting events...")
        if self.lstm_engine and self.lstm_engine.is_available():
            events = self.lstm_engine.predict(normalized_df)
            print(f"  ✓ LSTM detection complete")
        else:
            events = {'wrist': [], 'finger': [], 'posture': [], 'state': []}
            print(f"  ⚠ Using fallback detection")

        # Analyze events
        print("\nAnalyzing events...")
        event_stats = self.event_analyzer.analyze_events(events, len(normalized_df))

        # Protocol analysis
        print("\nRunning protocol analysis...")
        protocol_results = self.protocol_analyzer.analyze(normalized_df)

        # Save normalized data to CSV
        normalized_csv_path = self.output_dir / 'normalized.csv'
        normalized_df.to_csv(normalized_csv_path, index=False)

        # Combine results
        analysis_results = {
            'events': self._flatten_events(events),
            'event_statistics': event_stats,
            'protocol_results': protocol_results,
            'duration_seconds': len(df) / self.fps,
            'avg_confidence': self._calculate_avg_confidence(events),
            'normalized_data_path': str(normalized_csv_path),
            'normalized_columns': list(normalized_df.columns),
            'num_frames': len(normalized_df)
        }

        # Generate reports
        print("\nGenerating reports...")
        report_files = self.report_generator.generate_all(
            analysis_results,
            self.protocol_config,
            recording_metadata
        )

        print(f"\n✓ Analysis complete!")
        print(f"  Reports: {self.output_dir}")

        return {
            'success': True,
            'results': analysis_results,
            'reports': report_files
        }

    def _flatten_events(self, events: Dict) -> List[Dict]:
        """Flatten event dictionary into list."""
        flattened = []
        for event_type, event_list in events.items():
            for event in event_list:
                flattened.append({
                    'type': event_type,
                    'event': event['event'],
                    'frame': event['frame'],
                    'confidence': event['confidence']
                })
        return flattened

    def _calculate_avg_confidence(self, events: Dict) -> float:
        """Calculate average confidence across all events."""
        all_confidences = []
        for event_list in events.values():
            all_confidences.extend([e['confidence'] for e in event_list])
        return np.mean(all_confidences) if all_confidences else 0.0


# =============================================================================
# BACKEND INTEGRATION
# =============================================================================

def analyze_from_backend(
    input_file: str,
    output_dir: str,
    protocol_config: Dict,
    recording_metadata: Optional[Dict] = None,
    fps: int = DEFAULT_FPS,
    use_lstm: bool = True
) -> Dict:
    """
    Entry point for backend integration.

    Args:
        input_file: Path to input data file
        output_dir: Output directory path
        protocol_config: Protocol configuration
        recording_metadata: Recording metadata
        fps: Frames per second
        use_lstm: Use LSTM for event detection

    Returns:
        Analysis results dictionary
    """
    orchestrator = EnhancedAnalysisOrchestrator(
        protocol_config=protocol_config,
        output_dir=output_dir,
        fps=fps,
        adaptive=True,
        use_lstm=use_lstm
    )

    return orchestrator.analyze_file(input_file, recording_metadata)


# =============================================================================
# CLI ENTRY POINT
# =============================================================================

def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description='Hand Motion Analysis Service')
    parser.add_argument('input_file', help='Input data file (xlsx/csv)')
    parser.add_argument('--output-dir', required=True, help='Output directory')
    parser.add_argument('--protocol', required=True, help='Protocol config JSON file')
    parser.add_argument('--fps', type=int, default=DEFAULT_FPS, help='Frames per second')
    parser.add_argument('--no-lstm', action='store_true', help='Disable LSTM detection')

    args = parser.parse_args()

    # Load protocol config
    with open(args.protocol, 'r') as f:
        protocol_config = json.load(f)

    # Run analysis
    result = analyze_from_backend(
        input_file=args.input_file,
        output_dir=args.output_dir,
        protocol_config=protocol_config,
        fps=args.fps,
        use_lstm=not args.no_lstm
    )

    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
