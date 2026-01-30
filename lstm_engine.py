"""
Enhanced LSTM Engine with Robust Integration
Production-ready event detection with error handling and optimization
"""

import numpy as np
import logging
from typing import Dict, List, Optional, Tuple, Callable
from pathlib import Path
from dataclasses import dataclass
import pickle

from config import (
    LSTM_MODEL_PATH, LABEL_ENCODER_DIR, EVENT_CATEGORIES,
    SEQUENCE_LENGTH, DEFAULT_FPS
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EventPrediction:
    """Single event prediction result"""
    category: str
    event_type: str
    confidence: float
    frame_start: int
    frame_end: int
    duration_seconds: float


@dataclass
class ModelInfo:
    """LSTM model metadata"""
    framework: str  # 'tensorflow' or 'pytorch'
    version: str
    input_shape: Tuple[int, ...]
    output_heads: List[str]
    device: str  # 'GPU' or 'CPU'


class LSTMEngine:
    """
    Production-ready LSTM event detection engine.
    
    Features:
    - Automatic framework detection (TensorFlow/PyTorch)
    - GPU/CPU fallback with device verification
    - Batch inference with progress tracking
    - Confidence calibration and post-processing
    - Comprehensive error handling
    - Memory-efficient processing
    """
    
    def __init__(
        self,
        model_path: Optional[Path] = None,
        label_encoder_dir: Optional[Path] = None,
        use_gpu: bool = True,
        batch_size: int = 32,
        confidence_threshold: float = 0.5,
        fps: int = DEFAULT_FPS
    ):
        """
        Initialize LSTM Engine.
        
        Args:
            model_path: Path to LSTM model file
            label_encoder_dir: Directory containing label encoders
            use_gpu: Try to use GPU if available
            batch_size: Batch size for inference
            confidence_threshold: Minimum confidence for event detection
            fps: Frame rate for temporal calculations
        """
        self.model_path = Path(model_path or LSTM_MODEL_PATH)
        self.label_encoder_dir = Path(label_encoder_dir or LABEL_ENCODER_DIR)
        self.use_gpu = use_gpu
        self.batch_size = batch_size
        self.confidence_threshold = confidence_threshold
        self.fps = fps
        
        # State
        self.model = None
        self.label_encoders = {}
        self.model_info: Optional[ModelInfo] = None
        self.is_loaded = False
        
        # Load model and encoders
        self._initialize()
    
    def _initialize(self):
        """Initialize model and label encoders"""
        try:
            # Load label encoders first
            self._load_label_encoders()
            
            # Load LSTM model
            self._load_model()
            
            self.is_loaded = True
            logger.info("LSTM Engine initialized successfully")
            logger.info(f"Device: {self.model_info.device}")
            logger.info(f"Framework: {self.model_info.framework}")
            
        except Exception as e:
            logger.error(f"Failed to initialize LSTM Engine: {e}")
            logger.warning("Falling back to heuristic detection mode")
            self.is_loaded = False
    
    def _load_label_encoders(self):
        """Load label encoders for each event category"""
        encoder_files = {
            'WRIST': 'wrist_label_encoder.pkl',
            'FINGER': 'finger_label_encoder.pkl',
            'POSTURE': 'posture_label_encoder.pkl',
            'STATE': 'state_label_encoder.pkl',
        }
        
        for category, filename in encoder_files.items():
            encoder_path = self.label_encoder_dir / filename
            
            if not encoder_path.exists():
                raise FileNotFoundError(f"Label encoder not found: {encoder_path}")
            
            with open(encoder_path, 'rb') as f:
                self.label_encoders[category] = pickle.load(f)
            
            logger.debug(f"Loaded {category} encoder: {len(self.label_encoders[category].classes_)} classes")
    
    def _load_model(self):
        """Load LSTM model with framework auto-detection"""
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}")
        
        # Try TensorFlow first
        try:
            import tensorflow as tf
            self.model = self._load_tensorflow_model(tf)
            return
        except ImportError:
            logger.debug("TensorFlow not available, trying PyTorch")
        except Exception as e:
            logger.debug(f"TensorFlow load failed: {e}")
        
        # Try PyTorch
        try:
            import torch
            self.model = self._load_pytorch_model(torch)
            return
        except ImportError:
            logger.debug("PyTorch not available")
        except Exception as e:
            logger.debug(f"PyTorch load failed: {e}")
        
        raise RuntimeError("Failed to load model with TensorFlow or PyTorch")
    
    def _load_tensorflow_model(self, tf):
        """Load TensorFlow/Keras model"""
        # Configure GPU/CPU
        if self.use_gpu:
            gpus = tf.config.list_physical_devices('GPU')
            if gpus:
                try:
                    for gpu in gpus:
                        tf.config.experimental.set_memory_growth(gpu, True)
                    device = 'GPU'
                    logger.info(f"Using GPU: {len(gpus)} device(s) available")
                except RuntimeError as e:
                    logger.warning(f"GPU configuration failed: {e}")
                    device = 'CPU'
            else:
                device = 'CPU'
                logger.info("No GPU available, using CPU")
        else:
            device = 'CPU'
        
        # Load model
        model = tf.keras.models.load_model(str(self.model_path))
        
        # Extract model info
        input_shape = tuple(model.input_shape[1:])  # Skip batch dimension
        output_heads = ['WRIST', 'FINGER', 'POSTURE', 'STATE']
        
        self.model_info = ModelInfo(
            framework='tensorflow',
            version=tf.__version__,
            input_shape=input_shape,
            output_heads=output_heads,
            device=device
        )
        
        logger.info(f"Loaded TensorFlow model: input_shape={input_shape}")
        return model
    
    def _load_pytorch_model(self, torch):
        """Load PyTorch model"""
        # Configure device
        if self.use_gpu and torch.cuda.is_available():
            device = torch.device('cuda')
            logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
        else:
            device = torch.device('cpu')
            logger.info("Using CPU")
        
        # Load model
        model = torch.load(str(self.model_path), map_location=device)
        model.eval()
        
        # Extract model info (assumes standard architecture)
        input_shape = (SEQUENCE_LENGTH, 66)  # 63 landmarks + 3 derived features
        output_heads = ['WRIST', 'FINGER', 'POSTURE', 'STATE']
        
        self.model_info = ModelInfo(
            framework='pytorch',
            version=torch.__version__,
            input_shape=input_shape,
            output_heads=output_heads,
            device=str(device).upper()
        )
        
        logger.info(f"Loaded PyTorch model: input_shape={input_shape}")
        return model
    
    def predict_batch(
        self,
        sequences: np.ndarray,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List[Dict[str, np.ndarray]]:
        """
        Run batch inference on sequences.
        
        Args:
            sequences: Input sequences (n_sequences, seq_length, n_features)
            progress_callback: Optional callback(current, total) for progress
        
        Returns:
            List of prediction dictionaries, one per batch
        """
        if not self.is_loaded:
            raise RuntimeError("LSTM Engine not loaded")
        
        n_sequences = len(sequences)
        n_batches = (n_sequences + self.batch_size - 1) // self.batch_size
        
        logger.info(f"Running inference: {n_sequences} sequences, {n_batches} batches")
        
        all_predictions = []
        
        for batch_idx in range(n_batches):
            start_idx = batch_idx * self.batch_size
            end_idx = min(start_idx + self.batch_size, n_sequences)
            batch = sequences[start_idx:end_idx]
            
            # Run inference
            if self.model_info.framework == 'tensorflow':
                predictions = self._predict_tensorflow_batch(batch)
            else:
                predictions = self._predict_pytorch_batch(batch)
            
            all_predictions.append(predictions)
            
            # Progress callback
            if progress_callback:
                progress_callback(end_idx, n_sequences)
        
        return all_predictions
    
    def _predict_tensorflow_batch(self, batch: np.ndarray) -> Dict[str, np.ndarray]:
        """Run TensorFlow inference"""
        predictions = self.model.predict(batch, verbose=0)
        
        return {
            'WRIST': predictions[0],
            'FINGER': predictions[1],
            'POSTURE': predictions[2],
            'STATE': predictions[3],
        }
    
    def _predict_pytorch_batch(self, batch: np.ndarray) -> Dict[str, np.ndarray]:
        """Run PyTorch inference"""
        import torch
        
        # Convert to tensor
        batch_tensor = torch.from_numpy(batch).float()
        
        # Move to device
        if self.model_info.device == 'GPU':
            batch_tensor = batch_tensor.cuda()
        
        # Inference
        with torch.no_grad():
            outputs = self.model(batch_tensor)
        
        # Convert back to numpy
        return {
            'WRIST': outputs[0].cpu().numpy(),
            'FINGER': outputs[1].cpu().numpy(),
            'POSTURE': outputs[2].cpu().numpy(),
            'STATE': outputs[3].cpu().numpy(),
        }
    
    def detect_events(
        self,
        sequences: np.ndarray,
        frame_indices: Optional[np.ndarray] = None,
        merge_gap_frames: int = 5,
        min_duration_frames: int = 3
    ) -> Dict[str, List[EventPrediction]]:
        """
        Detect events from sequences with post-processing.
        
        Args:
            sequences: Input sequences (n_sequences, seq_length, n_features)
            frame_indices: Frame index for each sequence center
            merge_gap_frames: Merge events within this many frames
            min_duration_frames: Minimum event duration
        
        Returns:
            Dictionary of events by category
        """
        if not self.is_loaded:
            logger.warning("Model not loaded, using fallback detection")
            return self._fallback_detection(sequences, frame_indices)
        
        # Generate frame indices if not provided
        if frame_indices is None:
            frame_indices = np.arange(len(sequences)) + SEQUENCE_LENGTH // 2
        
        # Run inference
        all_predictions = self.predict_batch(sequences)
        
        # Concatenate batch predictions
        combined_predictions = {
            'WRIST': np.vstack([p['WRIST'] for p in all_predictions]),
            'FINGER': np.vstack([p['FINGER'] for p in all_predictions]),
            'POSTURE': np.vstack([p['POSTURE'] for p in all_predictions]),
            'STATE': np.vstack([p['STATE'] for p in all_predictions]),
        }
        
        # Extract events for each category
        events = {}
        
        for category in ['WRIST', 'FINGER', 'POSTURE', 'STATE']:
            probs = combined_predictions[category]
            labels = np.argmax(probs, axis=1)
            confidences = np.max(probs, axis=1)
            
            # Convert to event names
            encoder = self.label_encoders[category]
            event_names = encoder.inverse_transform(labels)
            
            # Extract events
            category_events = self._extract_events(
                category,
                event_names,
                confidences,
                frame_indices,
                merge_gap_frames,
                min_duration_frames
            )
            
            events[category] = category_events
        
        logger.info(f"Detected events: " + ", ".join([f"{k}={len(v)}" for k, v in events.items()]))
        
        return events
    
    def _extract_events(
        self,
        category: str,
        event_names: np.ndarray,
        confidences: np.ndarray,
        frame_indices: np.ndarray,
        merge_gap_frames: int,
        min_duration_frames: int
    ) -> List[EventPrediction]:
        """Extract events from predictions with post-processing"""
        events = []
        
        # Find high-confidence predictions
        high_conf_mask = confidences >= self.confidence_threshold
        
        if not np.any(high_conf_mask):
            return events
        
        # Find continuous segments
        i = 0
        while i < len(event_names):
            if not high_conf_mask[i]:
                i += 1
                continue
            
            # Start of event
            event_name = event_names[i]
            start_idx = i
            start_frame = frame_indices[i]
            confidences_segment = [confidences[i]]
            
            # Continue while same event and high confidence
            j = i + 1
            while j < len(event_names):
                if event_names[j] == event_name and high_conf_mask[j]:
                    confidences_segment.append(confidences[j])
                    j += 1
                elif event_names[j] == event_name and (j - start_idx) <= merge_gap_frames:
                    # Merge if within gap threshold
                    confidences_segment.append(confidences[j])
                    j += 1
                else:
                    break
            
            end_idx = j - 1
            end_frame = frame_indices[end_idx]
            
            # Check minimum duration
            duration_frames = end_frame - start_frame + 1
            if duration_frames >= min_duration_frames:
                avg_confidence = np.mean(confidences_segment)
                duration_seconds = duration_frames / self.fps
                
                events.append(EventPrediction(
                    category=category,
                    event_type=event_name,
                    confidence=float(avg_confidence),
                    frame_start=int(start_frame),
                    frame_end=int(end_frame),
                    duration_seconds=float(duration_seconds)
                ))
            
            i = j
        
        return events
    
    def _fallback_detection(
        self,
        sequences: np.ndarray,
        frame_indices: Optional[np.ndarray]
    ) -> Dict[str, List[EventPrediction]]:
        """Fallback heuristic detection when model unavailable"""
        logger.warning("Using fallback heuristic detection (no LSTM model)")
        
        # Simple motion-based detection
        # Extract velocity features (last 3 columns: angular_velocity, thumb_index_dist, hand_aperture)
        velocities = sequences[:, :, -3:]
        
        events = {
            'WRIST': [],
            'FINGER': [],
            'POSTURE': [],
            'STATE': [],
        }
        
        # Detect high motion events
        motion_magnitude = np.mean(np.abs(velocities), axis=(1, 2))
        high_motion = motion_magnitude > np.percentile(motion_magnitude, 75)
        
        if frame_indices is None:
            frame_indices = np.arange(len(sequences)) + SEQUENCE_LENGTH // 2
        
        # Create simple events for high motion segments
        i = 0
        while i < len(high_motion):
            if not high_motion[i]:
                i += 1
                continue
            
            start_frame = frame_indices[i]
            j = i
            while j < len(high_motion) and high_motion[j]:
                j += 1
            
            end_frame = frame_indices[j - 1]
            duration_seconds = (end_frame - start_frame + 1) / self.fps
            
            if duration_seconds >= 0.1:  # Minimum 100ms
                events['STATE'].append(EventPrediction(
                    category='STATE',
                    event_type='motion_detected',
                    confidence=0.7,
                    frame_start=int(start_frame),
                    frame_end=int(end_frame),
                    duration_seconds=float(duration_seconds)
                ))
            
            i = j
        
        return events
    
    def calibrate_confidence(
        self,
        validation_sequences: np.ndarray,
        true_labels: Dict[str, np.ndarray]
    ) -> Dict[str, float]:
        """
        Calibrate confidence thresholds using validation data.
        
        Args:
            validation_sequences: Validation sequences
            true_labels: True labels for each category
        
        Returns:
            Optimal thresholds per category
        """
        if not self.is_loaded:
            raise RuntimeError("Model not loaded")
        
        logger.info("Calibrating confidence thresholds...")
        
        # Get predictions
        all_predictions = self.predict_batch(validation_sequences)
        combined_predictions = {
            'WRIST': np.vstack([p['WRIST'] for p in all_predictions]),
            'FINGER': np.vstack([p['FINGER'] for p in all_predictions]),
            'POSTURE': np.vstack([p['POSTURE'] for p in all_predictions]),
            'STATE': np.vstack([p['STATE'] for p in all_predictions]),
        }
        
        optimal_thresholds = {}
        
        for category in ['WRIST', 'FINGER', 'POSTURE', 'STATE']:
            probs = combined_predictions[category]
            max_probs = np.max(probs, axis=1)
            predicted_labels = np.argmax(probs, axis=1)
            
            # Find threshold that maximizes F1 score
            true_labels_cat = true_labels[category]
            
            best_threshold = 0.5
            best_f1 = 0.0
            
            for threshold in np.arange(0.3, 0.9, 0.05):
                # Filter by confidence
                mask = max_probs >= threshold
                
                if not np.any(mask):
                    continue
                
                # Compute F1 score
                tp = np.sum((predicted_labels[mask] == true_labels_cat[mask]) & (true_labels_cat[mask] != 0))
                fp = np.sum((predicted_labels[mask] != true_labels_cat[mask]) & (predicted_labels[mask] != 0))
                fn = np.sum((predicted_labels[mask] != true_labels_cat[mask]) & (true_labels_cat[mask] != 0))
                
                if tp + fp == 0 or tp + fn == 0:
                    continue
                
                precision = tp / (tp + fp)
                recall = tp / (tp + fn)
                f1 = 2 * precision * recall / (precision + recall)
                
                if f1 > best_f1:
                    best_f1 = f1
                    best_threshold = threshold
            
            optimal_thresholds[category] = best_threshold
            logger.info(f"{category}: optimal_threshold={best_threshold:.2f}, F1={best_f1:.3f}")
        
        return optimal_thresholds
    
    def get_model_info(self) -> Optional[ModelInfo]:
        """Get model metadata"""
        return self.model_info
    
    def is_available(self) -> bool:
        """Check if model is loaded and ready"""
        return self.is_loaded
