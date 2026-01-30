"""
Data Handling and Processing
Handles filtering, normalization, outlier detection, and dynamic thresholding
Consolidated from: filters.py, filters_adaptive.py, normalizer.py, outlier_detection.py, thresholds.py, thresholds_dynamic.py
"""

# Standard library imports
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

# Third-party imports
import numpy as np
import pandas as pd
import pywt
from scipy import ndimage, signal, stats
from scipy.ndimage import gaussian_filter1d, median_filter
from scipy.stats import median_abs_deviation
from statsmodels.nonparametric.smoothers_lowess import lowess

# Local imports
from config import FilterConfig, ThresholdConfig, DEFAULT_FPS


# =============================================================================
# FILTERS.PY
# =============================================================================





# =============================================================================
# BASE FILTER CLASSES
# =============================================================================

class BaseFilter(ABC):
    """Abstract base class for all filters"""

    @abstractmethod
    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply filter to data"""
        pass

    @abstractmethod
    def get_params(self) -> Dict:
        """Get filter parameters"""
        pass


# =============================================================================
# FREQUENCY-DOMAIN FILTERS
# =============================================================================

class ButterworthFilter(BaseFilter):
    """
    Butterworth low-pass filter for smoothing.
    Maximally flat frequency response in the passband.
    """

    def __init__(
        self,
        cutoff: float = 6.0,
        fs: float = 30.0,
        order: int = 4,
        filter_type: str = 'low'
    ):
        self.cutoff = cutoff
        self.fs = fs
        self.order = order
        self.filter_type = filter_type
        self._design_filter()

    def _design_filter(self):
        """Design the Butterworth filter"""
        nyq = 0.5 * self.fs
        normalized_cutoff = self.cutoff / nyq
        self.b, self.a = signal.butter(
            self.order,
            normalized_cutoff,
            btype=self.filter_type
        )

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply zero-phase filtering (filtfilt)"""
        if len(data) < 3 * max(len(self.a), len(self.b)):
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {
            'type': 'butterworth',
            'cutoff': self.cutoff,
            'fs': self.fs,
            'order': self.order,
            'filter_type': self.filter_type
        }


class ChebyshevFilter(BaseFilter):
    """
    Chebyshev Type I filter.
    Steeper rolloff than Butterworth but with passband ripple.
    """

    def __init__(
        self,
        cutoff: float = 6.0,
        fs: float = 30.0,
        order: int = 4,
        ripple: float = 0.5
    ):
        self.cutoff = cutoff
        self.fs = fs
        self.order = order
        self.ripple = ripple
        self._design_filter()

    def _design_filter(self):
        nyq = 0.5 * self.fs
        normalized_cutoff = self.cutoff / nyq
        self.b, self.a = signal.cheby1(
            self.order,
            self.ripple,
            normalized_cutoff,
            btype='low'
        )

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < 3 * max(len(self.a), len(self.b)):
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {
            'type': 'chebyshev1',
            'cutoff': self.cutoff,
            'order': self.order,
            'ripple': self.ripple
        }


class BesselFilter(BaseFilter):
    """
    Bessel filter for maximally linear phase response.
    Best for preserving wave shape in the time domain.
    """

    def __init__(
        self,
        cutoff: float = 6.0,
        fs: float = 30.0,
        order: int = 4
    ):
        self.cutoff = cutoff
        self.fs = fs
        self.order = order
        self._design_filter()

    def _design_filter(self):
        nyq = 0.5 * self.fs
        normalized_cutoff = self.cutoff / nyq
        self.b, self.a = signal.bessel(
            self.order,
            normalized_cutoff,
            btype='low',
            norm='phase'
        )

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < 3 * max(len(self.a), len(self.b)):
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {'type': 'bessel', 'cutoff': self.cutoff, 'order': self.order}


class EllipticFilter(BaseFilter):
    """
    Elliptic (Cauer) filter.
    Steepest rolloff for given order, but with ripple in both bands.
    """

    def __init__(
        self,
        cutoff: float = 6.0,
        fs: float = 30.0,
        order: int = 4,
        rp: float = 0.5,  # Passband ripple (dB)
        rs: float = 40.0  # Stopband attenuation (dB)
    ):
        self.cutoff = cutoff
        self.fs = fs
        self.order = order
        self.rp = rp
        self.rs = rs
        self._design_filter()

    def _design_filter(self):
        nyq = 0.5 * self.fs
        normalized_cutoff = self.cutoff / nyq
        self.b, self.a = signal.ellip(
            self.order,
            self.rp,
            self.rs,
            normalized_cutoff,
            btype='low'
        )

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < 3 * max(len(self.a), len(self.b)):
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {
            'type': 'elliptic',
            'cutoff': self.cutoff,
            'order': self.order,
            'rp': self.rp,
            'rs': self.rs
        }


class NotchFilter(BaseFilter):
    """
    Notch (band-stop) filter to remove specific frequency.
    Useful for removing power line interference (50/60 Hz).
    """

    def __init__(
        self,
        freq: float = 50.0,
        fs: float = 30.0,
        quality: float = 30.0
    ):
        self.freq = freq
        self.fs = fs
        self.quality = quality
        self._design_filter()

    def _design_filter(self):
        nyq = 0.5 * self.fs
        if self.freq >= nyq:
            # Frequency too high for sampling rate
            self.b, self.a = [1], [1]
            return
        self.b, self.a = signal.iirnotch(self.freq / nyq, self.quality)

    def apply(self, data: np.ndarray) -> np.ndarray:
        if self.b == [1]:
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {'type': 'notch', 'freq': self.freq, 'quality': self.quality}


class BandpassFilter(BaseFilter):
    """
    Bandpass filter for isolating specific frequency range.
    Useful for tremor analysis (4-12 Hz typically).
    """

    def __init__(
        self,
        low_cutoff: float = 4.0,
        high_cutoff: float = 12.0,
        fs: float = 30.0,
        order: int = 4
    ):
        self.low_cutoff = low_cutoff
        self.high_cutoff = high_cutoff
        self.fs = fs
        self.order = order
        self._design_filter()

    def _design_filter(self):
        nyq = 0.5 * self.fs
        low = self.low_cutoff / nyq
        high = min(self.high_cutoff / nyq, 0.99)
        self.b, self.a = signal.butter(self.order, [low, high], btype='band')

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < 3 * max(len(self.a), len(self.b)):
            return data
        return signal.filtfilt(self.b, self.a, data, axis=0)

    def get_params(self) -> Dict:
        return {
            'type': 'bandpass',
            'low': self.low_cutoff,
            'high': self.high_cutoff,
            'order': self.order
        }


# =============================================================================
# TIME-DOMAIN FILTERS
# =============================================================================

class MovingAverageFilter(BaseFilter):
    """Simple moving average filter"""

    def __init__(self, window: int = 5):
        self.window = window

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < self.window:
            return data
        kernel = np.ones(self.window) / self.window
        if data.ndim == 1:
            return np.convolve(data, kernel, mode='same')
        return ndimage.convolve1d(data, kernel, axis=0, mode='reflect')

    def get_params(self) -> Dict:
        return {'type': 'moving_average', 'window': self.window}


class ExponentialSmoothingFilter(BaseFilter):
    """
    Exponential smoothing (single exponential / simple exponential smoothing).
    More recent values have more weight.
    """

    def __init__(self, alpha: float = 0.3):
        self.alpha = alpha

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._smooth_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._smooth_1d(data[:, col])
        return result

    def _smooth_1d(self, data: np.ndarray) -> np.ndarray:
        result = np.zeros_like(data)
        result[0] = data[0]
        for i in range(1, len(data)):
            result[i] = self.alpha * data[i] + (1 - self.alpha) * result[i-1]
        return result

    def get_params(self) -> Dict:
        return {'type': 'exponential_smoothing', 'alpha': self.alpha}


class DoubleExponentialFilter(BaseFilter):
    """
    Double exponential smoothing (Holt's method).
    Accounts for trends in the data.
    """

    def __init__(self, alpha: float = 0.3, beta: float = 0.1):
        self.alpha = alpha
        self.beta = beta

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._smooth_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._smooth_1d(data[:, col])
        return result

    def _smooth_1d(self, data: np.ndarray) -> np.ndarray:
        n = len(data)
        level = np.zeros(n)
        trend = np.zeros(n)
        result = np.zeros(n)

        level[0] = data[0]
        trend[0] = data[1] - data[0] if n > 1 else 0

        for i in range(1, n):
            level[i] = self.alpha * data[i] + (1 - self.alpha) * (level[i-1] + trend[i-1])
            trend[i] = self.beta * (level[i] - level[i-1]) + (1 - self.beta) * trend[i-1]
            result[i] = level[i]

        result[0] = level[0]
        return result

    def get_params(self) -> Dict:
        return {'type': 'double_exponential', 'alpha': self.alpha, 'beta': self.beta}


class MedianFilter(BaseFilter):
    """
    Median filter for spike removal.
    Robust to outliers, preserves edges.
    """

    def __init__(self, kernel_size: int = 5):
        self.kernel_size = kernel_size

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return signal.medfilt(data, kernel_size=self.kernel_size)
        return ndimage.median_filter(data, size=(self.kernel_size, 1))

    def get_params(self) -> Dict:
        return {'type': 'median', 'kernel_size': self.kernel_size}


class SavitzkyGolayFilter(BaseFilter):
    """
    Savitzky-Golay filter for smoothing while preserving peaks.
    Uses polynomial fitting in a moving window.
    """

    def __init__(self, window_length: int = 11, polyorder: int = 3):
        self.window_length = window_length
        self.polyorder = polyorder

    def apply(self, data: np.ndarray) -> np.ndarray:
        if len(data) < self.window_length:
            return data
        return signal.savgol_filter(data, self.window_length, self.polyorder, axis=0)

    def get_params(self) -> Dict:
        return {
            'type': 'savitzky_golay',
            'window': self.window_length,
            'polyorder': self.polyorder
        }


class GaussianFilter(BaseFilter):
    """
    Gaussian smoothing filter.
    Controlled by sigma parameter.
    """

    def __init__(self, sigma: float = 1.0):
        self.sigma = sigma

    def apply(self, data: np.ndarray) -> np.ndarray:
        return ndimage.gaussian_filter1d(data, sigma=self.sigma, axis=0)

    def get_params(self) -> Dict:
        return {'type': 'gaussian', 'sigma': self.sigma}


# =============================================================================
# ADAPTIVE FILTERS
# =============================================================================

class KalmanFilter(BaseFilter):
    """
    Kalman filter for optimal state estimation.
    Balances between measurement and prediction.
    """

    def __init__(
        self,
        process_noise: float = 0.01,
        measurement_noise: float = 0.1
    ):
        self.process_noise = process_noise
        self.measurement_noise = measurement_noise

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        n = len(data)
        Q = self.process_noise
        R = self.measurement_noise

        # Initialize state estimate and error covariance
        x_est = data[0]
        P = 1.0

        result = np.zeros(n)
        result[0] = x_est

        for i in range(1, n):
            # Prediction step
            x_pred = x_est
            P_pred = P + Q

            # Update step
            K = P_pred / (P_pred + R)  # Kalman gain
            x_est = x_pred + K * (data[i] - x_pred)
            P = (1 - K) * P_pred

            result[i] = x_est

        return result

    def get_params(self) -> Dict:
        return {
            'type': 'kalman',
            'process_noise': self.process_noise,
            'measurement_noise': self.measurement_noise
        }


class LMSAdaptiveFilter(BaseFilter):
    """
    Least Mean Squares (LMS) adaptive filter.
    Self-adjusting filter that learns from the signal.
    """

    def __init__(self, mu: float = 0.01, filter_order: int = 16):
        self.mu = mu
        self.filter_order = filter_order

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        n = len(data)
        M = self.filter_order

        if n < M:
            return data

        # Initialize filter weights
        w = np.zeros(M)
        result = np.zeros(n)

        for i in range(M, n):
            x = data[i-M:i][::-1]  # Input vector (reversed)
            y = np.dot(w, x)  # Filter output
            e = data[i] - y  # Error signal

            # Update weights
            w = w + self.mu * e * x

            result[i] = y

        # Fill initial values
        result[:M] = data[:M]

        return result

    def get_params(self) -> Dict:
        return {'type': 'lms', 'mu': self.mu, 'order': self.filter_order}


class RLSAdaptiveFilter(BaseFilter):
    """
    Recursive Least Squares (RLS) adaptive filter.
    Faster convergence than LMS but more computationally intensive.
    """

    def __init__(
        self,
        lambda_: float = 0.99,
        delta: float = 1.0,
        filter_order: int = 16
    ):
        self.lambda_ = lambda_
        self.delta = delta
        self.filter_order = filter_order

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        n = len(data)
        M = self.filter_order

        if n < M:
            return data

        # Initialize
        w = np.zeros(M)
        P = np.eye(M) * self.delta
        result = np.zeros(n)

        for i in range(M, n):
            x = data[i-M:i][::-1].reshape(-1, 1)
            y = float(np.dot(w, x.flatten()))
            e = data[i] - y

            # RLS update
            k = P @ x / (self.lambda_ + float(x.T @ P @ x))
            w = w + (k.flatten() * e)
            P = (P - k @ x.T @ P) / self.lambda_

            result[i] = y

        result[:M] = data[:M]
        return result

    def get_params(self) -> Dict:
        return {
            'type': 'rls',
            'lambda': self.lambda_,
            'delta': self.delta,
            'order': self.filter_order
        }


# =============================================================================
# WAVELET FILTERS
# =============================================================================

class WaveletDenoiseFilter(BaseFilter):
    """
    Wavelet-based denoising using thresholding.
    Effective for non-stationary signals.
    """

    def __init__(
        self,
        wavelet: str = 'db4',
        level: int = 4,
        threshold_type: str = 'soft'
    ):
        self.wavelet = wavelet
        self.level = level
        self.threshold_type = threshold_type

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._denoise_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._denoise_1d(data[:, col])
        return result

    def _denoise_1d(self, data: np.ndarray) -> np.ndarray:
        # Decompose
        coeffs = pywt.wavedec(data, self.wavelet, level=self.level)

        # Estimate noise level from finest detail coefficients
        sigma = median_abs_deviation(coeffs[-1]) / 0.6745

        # Universal threshold
        threshold = sigma * np.sqrt(2 * np.log(len(data)))

        # Apply thresholding to detail coefficients
        denoised_coeffs = [coeffs[0]]  # Keep approximation
        for c in coeffs[1:]:
            if self.threshold_type == 'soft':
                denoised_coeffs.append(pywt.threshold(c, threshold, mode='soft'))
            else:
                denoised_coeffs.append(pywt.threshold(c, threshold, mode='hard'))

        # Reconstruct
        return pywt.waverec(denoised_coeffs, self.wavelet)[:len(data)]

    def get_params(self) -> Dict:
        return {
            'type': 'wavelet_denoise',
            'wavelet': self.wavelet,
            'level': self.level,
            'threshold_type': self.threshold_type
        }


class WaveletPacketFilter(BaseFilter):
    """
    Wavelet packet decomposition for fine frequency control.
    More flexible than standard wavelet decomposition.
    """

    def __init__(
        self,
        wavelet: str = 'db4',
        level: int = 3,
        keep_nodes: Optional[List[str]] = None
    ):
        self.wavelet = wavelet
        self.level = level
        self.keep_nodes = keep_nodes or []

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        wp = pywt.WaveletPacket(data, self.wavelet, maxlevel=self.level)

        # Zero out nodes not in keep_nodes
        if self.keep_nodes:
            for node in wp.get_level(self.level):
                if node.path not in self.keep_nodes:
                    node.data[:] = 0

        return wp.reconstruct()[:len(data)]

    def get_params(self) -> Dict:
        return {
            'type': 'wavelet_packet',
            'wavelet': self.wavelet,
            'level': self.level,
            'keep_nodes': self.keep_nodes
        }


# =============================================================================
# MORPHOLOGICAL FILTERS
# =============================================================================

class MorphologicalFilter(BaseFilter):
    """
    Morphological operations for signal processing.
    Useful for baseline removal and peak detection.
    """

    def __init__(
        self,
        operation: str = 'opening',
        size: int = 10
    ):
        self.operation = operation
        self.size = size

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        structure = np.ones(self.size)

        if self.operation == 'opening':
            return ndimage.grey_opening(data, structure=structure)
        elif self.operation == 'closing':
            return ndimage.grey_closing(data, structure=structure)
        elif self.operation == 'dilation':
            return ndimage.grey_dilation(data, structure=structure)
        elif self.operation == 'erosion':
            return ndimage.grey_erosion(data, structure=structure)
        elif self.operation == 'tophat':
            # Extracts peaks
            opened = ndimage.grey_opening(data, structure=structure)
            return data - opened
        elif self.operation == 'blackhat':
            # Extracts valleys
            closed = ndimage.grey_closing(data, structure=structure)
            return closed - data
        else:
            return data

    def get_params(self) -> Dict:
        return {'type': 'morphological', 'operation': self.operation, 'size': self.size}


# =============================================================================
# ADVANCED FILTERS - TV, LOESS, JERK CLAMP, RTS, PARTICLE
# =============================================================================

class TotalVariationFilter(BaseFilter):
    """
    Total Variation (ROF) denoising filter.
    Smooths noise while preserving sharp edges/transitions.
    Uses Chambolle's algorithm for 1D TV denoising.

    Reference: Chambolle, A. (2004). An algorithm for total variation minimization.
    """

    def __init__(
        self,
        lambda_tv: float = 0.1,
        max_iter: int = 100,
        tolerance: float = 1e-4
    ):
        """
        Args:
            lambda_tv: Regularization strength (higher = smoother)
            max_iter: Maximum iterations for optimization
            tolerance: Convergence tolerance
        """
        self.lambda_tv = lambda_tv
        self.max_iter = max_iter
        self.tolerance = tolerance

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._denoise_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._denoise_1d(data[:, col])
        return result

    def _denoise_1d(self, data: np.ndarray) -> np.ndarray:
        """Chambolle's algorithm for 1D TV denoising"""
        n = len(data)
        u = data.copy()
        p = np.zeros(n - 1)

        tau = 1.0 / (4.0 * self.lambda_tv)

        for _ in range(self.max_iter):
            u_old = u.copy()

            # Gradient of u
            grad_u = np.diff(u)

            # Update dual variable p
            p = (p + tau * grad_u) / (1 + tau * np.abs(grad_u))
            p = np.clip(p, -1, 1)

            # Divergence of p
            div_p = np.zeros(n)
            div_p[0] = p[0]
            div_p[1:-1] = p[1:] - p[:-1]
            div_p[-1] = -p[-1]

            # Update primal variable u
            u = data - self.lambda_tv * div_p

            # Check convergence
            if np.linalg.norm(u - u_old) / (np.linalg.norm(u_old) + 1e-10) < self.tolerance:
                break

        return u

    def get_params(self) -> Dict:
        return {
            'type': 'total_variation',
            'lambda_tv': self.lambda_tv,
            'max_iter': self.max_iter,
            'tolerance': self.tolerance
        }


class LOESSFilter(BaseFilter):
    """
    LOESS (Locally Estimated Scatterplot Smoothing) filter.
    Non-parametric local regression for adaptive smoothing.
    Also known as LOWESS (Locally Weighted Scatterplot Smoothing).

    Reference: Cleveland, W. S. (1979). Robust locally weighted regression.
    """

    def __init__(
        self,
        frac: float = 0.1,
        it: int = 3,
        delta: float = 0.0
    ):
        """
        Args:
            frac: Fraction of data to use for local regression (0-1)
            it: Number of robustness iterations
            delta: Distance threshold for interpolation speedup
        """
        self.frac = frac
        self.it = it
        self.delta = delta

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._smooth_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._smooth_1d(data[:, col])
        return result

    def _smooth_1d(self, data: np.ndarray) -> np.ndarray:
        """Apply LOWESS smoothing to 1D signal"""
        try:
            x = np.arange(len(data))
            smoothed = lowess(data, x, frac=self.frac, it=self.it, delta=self.delta)
            return smoothed[:, 1]
        except ImportError:
            # Fallback to simple moving average if statsmodels not available
            window = max(3, int(len(data) * self.frac))
            if window % 2 == 0:
                window += 1
            return np.convolve(data, np.ones(window)/window, mode='same')

    def get_params(self) -> Dict:
        return {
            'type': 'loess',
            'frac': self.frac,
            'it': self.it,
            'delta': self.delta
        }


class JerkClampFilter(BaseFilter):
    """
    Jerk clamping filter - limits rate of acceleration change.
    Removes tracking glitches that exceed human motor capabilities.

    Physics: jerk = d³x/dt³ (rate of change of acceleration)
    Human hand jerk typically < 500 units/s³ for normal movements.
    """

    def __init__(
        self,
        max_jerk: float = 500.0,
        fs: float = 30.0,
        clamp_mode: str = 'soft'
    ):
        """
        Args:
            max_jerk: Maximum allowable jerk magnitude
            fs: Sampling frequency (Hz)
            clamp_mode: 'hard' (clip) or 'soft' (smooth transition)
        """
        self.max_jerk = max_jerk
        self.fs = fs
        self.clamp_mode = clamp_mode
        self.dt = 1.0 / fs

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._clamp_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._clamp_1d(data[:, col])
        return result

    def _clamp_1d(self, data: np.ndarray) -> np.ndarray:
        """Clamp jerk and re-integrate to get smoothed position"""
        # Compute derivatives
        velocity = np.gradient(data, self.dt)
        acceleration = np.gradient(velocity, self.dt)
        jerk = np.gradient(acceleration, self.dt)

        # Clamp jerk
        if self.clamp_mode == 'hard':
            jerk_clamped = np.clip(jerk, -self.max_jerk, self.max_jerk)
        else:  # soft clamping with smooth transition
            scale = self.max_jerk / (np.abs(jerk) + self.max_jerk)
            jerk_clamped = jerk * scale

        # Re-integrate: jerk -> acceleration -> velocity -> position
        acc_new = np.cumsum(jerk_clamped) * self.dt + acceleration[0]
        vel_new = np.cumsum(acc_new) * self.dt + velocity[0]
        pos_new = np.cumsum(vel_new) * self.dt + data[0]

        return pos_new

    def get_params(self) -> Dict:
        return {
            'type': 'jerk_clamp',
            'max_jerk': self.max_jerk,
            'fs': self.fs,
            'clamp_mode': self.clamp_mode
        }


class RTSSmoother(BaseFilter):
    """
    Rauch-Tung-Striebel (RTS) smoother - forward-backward Kalman.
    Optimal offline smoothing using all observations (past and future).

    Better than forward-only Kalman for post-hoc analysis.
    Reference: Rauch, H. E., Tung, F., & Striebel, C. T. (1965).
    """

    def __init__(
        self,
        process_noise: float = 0.01,
        measurement_noise: float = 0.1,
        state_dim: int = 2
    ):
        """
        Args:
            process_noise: Process noise variance (Q)
            measurement_noise: Measurement noise variance (R)
            state_dim: State dimension (2 = position+velocity, 3 = +acceleration)
        """
        self.process_noise = process_noise
        self.measurement_noise = measurement_noise
        self.state_dim = state_dim

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._smooth_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._smooth_1d(data[:, col])
        return result

    def _smooth_1d(self, data: np.ndarray) -> np.ndarray:
        """Apply RTS smoothing to 1D signal"""
        n = len(data)
        dim = self.state_dim

        # State transition matrix (constant velocity/acceleration model)
        dt = 1.0
        if dim == 2:
            F = np.array([[1, dt], [0, 1]])
            H = np.array([[1, 0]])
        else:  # dim == 3
            F = np.array([[1, dt, 0.5*dt**2], [0, 1, dt], [0, 0, 1]])
            H = np.array([[1, 0, 0]])

        Q = self.process_noise * np.eye(dim)
        R = np.array([[self.measurement_noise]])

        # Forward pass (Kalman filter)
        x_forward = np.zeros((n, dim))
        P_forward = np.zeros((n, dim, dim))

        x = np.zeros(dim)
        x[0] = data[0]
        P = np.eye(dim)

        for i in range(n):
            # Predict
            x_pred = F @ x
            P_pred = F @ P @ F.T + Q

            # Update
            y = data[i] - H @ x_pred
            S = H @ P_pred @ H.T + R
            K = P_pred @ H.T @ np.linalg.inv(S)
            x = x_pred + K @ y
            P = (np.eye(dim) - K @ H) @ P_pred

            x_forward[i] = x
            P_forward[i] = P

        # Backward pass (RTS smoother)
        x_smooth = np.zeros((n, dim))
        x_smooth[-1] = x_forward[-1]

        for i in range(n - 2, -1, -1):
            P_pred = F @ P_forward[i] @ F.T + Q
            G = P_forward[i] @ F.T @ np.linalg.inv(P_pred)
            x_smooth[i] = x_forward[i] + G @ (x_smooth[i + 1] - F @ x_forward[i])

        return x_smooth[:, 0]

    def get_params(self) -> Dict:
        return {
            'type': 'rts_smoother',
            'process_noise': self.process_noise,
            'measurement_noise': self.measurement_noise,
            'state_dim': self.state_dim
        }


class ParticleFilter(BaseFilter):
    """
    Bootstrap particle filter for nonlinear/non-Gaussian tracking.
    Handles multimodal uncertainties and complex dynamics.

    Uses Sequential Importance Resampling (SIR) algorithm.
    Reference: Gordon, N. J., Salmond, D. J., & Smith, A. F. (1993).
    """

    def __init__(
        self,
        n_particles: int = 100,
        process_noise: float = 0.1,
        measurement_noise: float = 0.05,
        resampling_threshold: float = 0.5
    ):
        """
        Args:
            n_particles: Number of particles
            process_noise: Process noise std deviation
            measurement_noise: Measurement noise std deviation
            resampling_threshold: Effective sample size ratio for resampling
        """
        self.n_particles = n_particles
        self.process_noise = process_noise
        self.measurement_noise = measurement_noise
        self.resampling_threshold = resampling_threshold

    def apply(self, data: np.ndarray) -> np.ndarray:
        if data.ndim == 1:
            return self._filter_1d(data)

        result = np.zeros_like(data)
        for col in range(data.shape[1]):
            result[:, col] = self._filter_1d(data[:, col])
        return result

    def _filter_1d(self, data: np.ndarray) -> np.ndarray:
        """Apply particle filter to 1D signal"""
        n = len(data)

        # Initialize particles around first observation
        particles = data[0] + np.random.randn(self.n_particles) * self.measurement_noise
        weights = np.ones(self.n_particles) / self.n_particles

        estimates = np.zeros(n)
        estimates[0] = data[0]

        for t in range(1, n):
            # Predict (state transition with noise)
            particles = particles + np.random.randn(self.n_particles) * self.process_noise

            # Update weights (likelihood)
            diff = data[t] - particles
            weights = np.exp(-0.5 * (diff / self.measurement_noise) ** 2)
            weights += 1e-300  # Avoid zero weights
            weights /= weights.sum()

            # Estimate (weighted mean)
            estimates[t] = np.sum(weights * particles)

            # Resample if effective sample size is low
            n_eff = 1.0 / np.sum(weights ** 2)
            if n_eff < self.resampling_threshold * self.n_particles:
                indices = self._systematic_resample(weights)
                particles = particles[indices]
                weights = np.ones(self.n_particles) / self.n_particles

        return estimates

    def _systematic_resample(self, weights: np.ndarray) -> np.ndarray:
        """Systematic resampling algorithm"""
        n = len(weights)
        positions = (np.arange(n) + np.random.random()) / n

        cumsum = np.cumsum(weights)
        indices = np.searchsorted(cumsum, positions)
        indices = np.clip(indices, 0, n - 1)

        return indices

    def get_params(self) -> Dict:
        return {
            'type': 'particle',
            'n_particles': self.n_particles,
            'process_noise': self.process_noise,
            'measurement_noise': self.measurement_noise,
            'resampling_threshold': self.resampling_threshold
        }


# =============================================================================
# FILTER CHAIN
# =============================================================================

class FilterChain:
    """
    Chain multiple filters together for sequential application.
    """

    def __init__(self, filters: Optional[List[BaseFilter]] = None):
        self.filters = filters or []

    def add(self, filter_: BaseFilter) -> 'FilterChain':
        """Add a filter to the chain"""
        self.filters.append(filter_)
        return self

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply all filters in sequence"""
        result = data.copy()
        for f in self.filters:
            result = f.apply(result)
        return result

    def get_params(self) -> List[Dict]:
        """Get parameters of all filters"""
        return [f.get_params() for f in self.filters]


# =============================================================================
# FILTER FACTORY
# =============================================================================

class FilterFactory:
    """Factory for creating filters from configuration"""

    FILTER_MAP = {
        'butterworth': ButterworthFilter,
        'chebyshev': ChebyshevFilter,
        'bessel': BesselFilter,
        'elliptic': EllipticFilter,
        'notch': NotchFilter,
        'bandpass': BandpassFilter,
        'moving_average': MovingAverageFilter,
        'exponential': ExponentialSmoothingFilter,
        'double_exponential': DoubleExponentialFilter,
        'median': MedianFilter,
        'savitzky_golay': SavitzkyGolayFilter,
        'gaussian': GaussianFilter,
        'kalman': KalmanFilter,
        'lms': LMSAdaptiveFilter,
        'rls': RLSAdaptiveFilter,
        'wavelet': WaveletDenoiseFilter,
        'wavelet_packet': WaveletPacketFilter,
        'morphological': MorphologicalFilter,
        # New advanced filters
        'total_variation': TotalVariationFilter,
        'loess': LOESSFilter,
        'jerk_clamp': JerkClampFilter,
        'rts_smoother': RTSSmoother,
        'particle': ParticleFilter,
    }

    @classmethod
    def create(cls, filter_type: str, **kwargs) -> BaseFilter:
        """Create a filter by type name"""
        if filter_type not in cls.FILTER_MAP:
            raise ValueError(f"Unknown filter type: {filter_type}")
        return cls.FILTER_MAP[filter_type](**kwargs)

    @classmethod
    def create_chain(cls, configs: List[Dict]) -> FilterChain:
        """Create a filter chain from list of configurations"""
        chain = FilterChain()
        for config in configs:
            filter_type = config['type']
            filter_kwargs = {k: v for k, v in config.items() if k != 'type'}
            chain.add(cls.create(filter_type, **filter_kwargs))
        return chain

    @classmethod
    def create_default_chain(cls, fs: float = 30.0) -> FilterChain:
        """Create a default filter chain for hand motion data"""
        return FilterChain([
            MedianFilter(kernel_size=3),  # Remove spikes first
            ButterworthFilter(cutoff=6.0, fs=fs, order=4),  # Low-pass smooth
            KalmanFilter(process_noise=0.01, measurement_noise=0.1),  # State estimation
        ])

    @classmethod
    def create_tremor_chain(cls, fs: float = 30.0) -> FilterChain:
        """Create filter chain optimized for tremor analysis"""
        return FilterChain([
            BandpassFilter(low_cutoff=3.0, high_cutoff=12.0, fs=fs),  # Tremor band
            WaveletDenoiseFilter(wavelet='db4', level=3),  # Denoise
        ])


# =============================================================================
# FILTERS_ADAPTIVE.PY
# =============================================================================





@dataclass
class FilterCalibration:
    """Calibration results for adaptive filtering"""
    noise_std: float
    motion_frequency: float
    motion_speed: float
    signal_std: float
    snr: float
    recommended_filters: List[str]


class FilterCalibrator:
    """
    Analyzes signal characteristics to recommend optimal filter parameters.

    Computes:
    - Noise level (high-frequency component)
    - Motion frequency (dominant frequency)
    - Motion speed (average velocity)
    - Signal-to-noise ratio
    """

    def __init__(self, fs: float = 30.0):
        self.fs = fs

    def calibrate(self, signal_data: np.ndarray) -> FilterCalibration:
        """
        Calibrate filter parameters from signal characteristics.

        Args:
            signal_data: Input signal (n_samples, n_features) or (n_samples,)

        Returns:
            FilterCalibration with recommended parameters
        """
        if signal_data.ndim == 1:
            signal_data = signal_data.reshape(-1, 1)

        # Use first feature for calibration
        sig = signal_data[:, 0]

        # Estimate noise level (high-frequency component)
        noise_std = self._estimate_noise(sig)

        # Estimate motion frequency (dominant frequency in signal)
        motion_freq = self._estimate_motion_frequency(sig)

        # Estimate motion speed (average velocity)
        motion_speed = self._estimate_motion_speed(sig)

        # Estimate signal standard deviation
        signal_std = np.std(sig)

        # Compute SNR
        snr = signal_std / (noise_std + 1e-10)

        # Recommend filters based on characteristics
        recommended = self._recommend_filters(snr, motion_freq, motion_speed)

        return FilterCalibration(
            noise_std=float(noise_std),
            motion_frequency=float(motion_freq),
            motion_speed=float(motion_speed),
            signal_std=float(signal_std),
            snr=float(snr),
            recommended_filters=recommended
        )

    def _estimate_noise(self, sig: np.ndarray) -> float:
        """Estimate noise level using high-frequency component"""
        # High-pass filter to get noise
        sos = signal.butter(4, 10.0, 'high', fs=self.fs, output='sos')
        noise = signal.sosfilt(sos, sig)
        return np.std(noise)

    def _estimate_motion_frequency(self, sig: np.ndarray) -> float:
        """Estimate dominant motion frequency using FFT"""
        # Compute power spectrum
        freqs = np.fft.rfftfreq(len(sig), 1/self.fs)
        fft = np.fft.rfft(sig)
        power = np.abs(fft) ** 2

        # Find dominant frequency (exclude DC component)
        dominant_idx = np.argmax(power[1:]) + 1
        return freqs[dominant_idx]

    def _estimate_motion_speed(self, sig: np.ndarray) -> float:
        """Estimate motion speed (average velocity magnitude)"""
        velocity = np.diff(sig) * self.fs
        return np.mean(np.abs(velocity))

    def _recommend_filters(
        self, snr: float, motion_freq: float, motion_speed: float
    ) -> List[str]:
        """Recommend filters based on signal characteristics"""
        recommended = []

        # Always start with outlier removal
        recommended.append('hampel')

        if snr < 5.0:
            # Very noisy - aggressive filtering
            recommended.extend(['adaptive_kalman', 'wiener'])
        elif snr < 10.0:
            # Moderately noisy
            recommended.extend(['adaptive_kalman', 'adaptive_savgol'])
        else:
            # Clean signal - light filtering
            recommended.extend(['adaptive_ema', 'adaptive_gaussian'])

        if motion_freq > 2.0:
            # High frequency motion - preserve bandwidth
            recommended.append('adaptive_butterworth')

        return recommended


class AdaptiveGaussianFilter(BaseFilter):
    """
    Adaptive Gaussian smoothing - kernel width adapts to local noise/motion.

    Features:
    - Wider kernel in noisy regions (more smoothing)
    - Narrower kernel in high-motion regions (preserve dynamics)
    """

    def __init__(
        self,
        min_sigma: float = 0.5,
        max_sigma: float = 3.0,
        window_size: int = 30
    ):
        self.min_sigma = min_sigma
        self.max_sigma = max_sigma
        self.window_size = window_size

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'min_sigma': self.min_sigma,
            'max_sigma': self.max_sigma,
            'window_size': self.window_size
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive Gaussian smoothing"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            # Compute local noise level
            local_noise = self._compute_local_noise(data[:, i])

            # Compute local motion speed
            local_speed = self._compute_local_speed(data[:, i])

            # Adaptive sigma: high noise → high sigma, high speed → low sigma
            noise_normalized = (local_noise - local_noise.min()) / (local_noise.max() - local_noise.min() + 1e-10)
            speed_normalized = (local_speed - local_speed.min()) / (local_speed.max() - local_speed.min() + 1e-10)

            # Combine: more smoothing where noisy AND slow
            adaptive_factor = noise_normalized * (1 - speed_normalized)
            sigma = self.min_sigma + adaptive_factor * (self.max_sigma - self.min_sigma)

            # Apply Gaussian with varying sigma (approximate with piecewise constant)
            filtered[:, i] = self._apply_varying_gaussian(data[:, i], sigma)

        return filtered

    def _compute_local_noise(self, sig: np.ndarray) -> np.ndarray:
        """Compute local noise level using rolling window"""
        local_noise = np.zeros(len(sig))
        half_window = self.window_size // 2

        for i in range(len(sig)):
            start = max(0, i - half_window)
            end = min(len(sig), i + half_window)
            window = sig[start:end]

            # Noise = std of high-frequency component
            if len(window) > 4:
                detrended = window - np.median(window)
                local_noise[i] = np.std(detrended)
            else:
                local_noise[i] = 0.0

        return local_noise

    def _compute_local_speed(self, sig: np.ndarray) -> np.ndarray:
        """Compute local motion speed"""
        velocity = np.abs(np.diff(sig, prepend=sig[0]))

        # Smooth velocity to get local speed trend
        if len(velocity) > 5:
            local_speed = gaussian_filter1d(velocity, sigma=2.0)
        else:
            local_speed = velocity

        return local_speed

    def _apply_varying_gaussian(self, sig: np.ndarray, sigma: np.ndarray) -> np.ndarray:
        """Apply Gaussian filter with spatially-varying sigma"""
        # Piecewise constant approximation
        filtered = sig.copy()
        n_segments = 10
        segment_size = len(sig) // n_segments

        for i in range(n_segments):
            start = i * segment_size
            end = (i + 1) * segment_size if i < n_segments - 1 else len(sig)

            if end > start:
                avg_sigma = np.mean(sigma[start:end])
                filtered[start:end] = gaussian_filter1d(sig[start:end], sigma=avg_sigma)

        return filtered


class AdaptiveEMAFilter(BaseFilter):
    """
    Adaptive Exponential Moving Average - alpha adapts to motion speed.

    Features:
    - Low alpha (more smoothing) when slow/noisy
    - High alpha (fast response) when fast motion detected
    """

    def __init__(
        self,
        min_alpha: float = 0.1,
        max_alpha: float = 0.9,
        speed_threshold: float = 0.01
    ):
        self.min_alpha = min_alpha
        self.max_alpha = max_alpha
        self.speed_threshold = speed_threshold

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'min_alpha': self.min_alpha,
            'max_alpha': self.max_alpha,
            'speed_threshold': self.speed_threshold
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive EMA"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            sig = data[:, i]

            # Compute instantaneous speed (velocity magnitude)
            velocity = np.abs(np.diff(sig, prepend=sig[0]))

            # Normalize speed
            speed_norm = velocity / (self.speed_threshold + 1e-10)
            speed_norm = np.clip(speed_norm, 0, 1)

            # Adaptive alpha: high speed → high alpha (fast response)
            alpha = self.min_alpha + speed_norm * (self.max_alpha - self.min_alpha)

            # Apply EMA with varying alpha
            filtered[0, i] = sig[0]
            for t in range(1, n_samples):
                filtered[t, i] = alpha[t] * sig[t] + (1 - alpha[t]) * filtered[t-1, i]

        return filtered


class AdaptiveSavitzkyGolayFilter(BaseFilter):
    """
    Adaptive Savitzky-Golay filter - window size adapts to signal frequency.

    Features:
    - Smaller window when high-frequency events present
    - Larger window when signal is smooth/slow
    """

    def __init__(
        self,
        min_window: int = 5,
        max_window: int = 21,
        polyorder: int = 3,
        fs: float = 30.0
    ):
        self.min_window = min_window
        self.max_window = max_window
        self.polyorder = polyorder
        self.fs = fs

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'min_window': self.min_window,
            'max_window': self.max_window,
            'polyorder': self.polyorder,
            'fs': self.fs
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive Savitzky-Golay"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            sig = data[:, i]

            # Estimate dominant frequency
            dominant_freq = self._estimate_frequency(sig)

            # Adaptive window: high frequency → small window
            # Target ~1-2 cycles in window
            cycles_per_window = 1.5
            optimal_window = int(cycles_per_window * self.fs / (dominant_freq + 0.1))
            window_length = np.clip(optimal_window, self.min_window, self.max_window)

            # Ensure odd window length
            if window_length % 2 == 0:
                window_length += 1

            # Ensure window length > polyorder
            window_length = max(window_length, self.polyorder + 2)

            # Apply Savitzky-Golay
            try:
                filtered[:, i] = signal.savgol_filter(sig, window_length, self.polyorder)
            except:
                # Fallback to simple moving average
                filtered[:, i] = np.convolve(sig, np.ones(window_length)/window_length, mode='same')

        return filtered

    def _estimate_frequency(self, sig: np.ndarray) -> float:
        """Estimate dominant frequency"""
        if len(sig) < 10:
            return 1.0

        freqs = np.fft.rfftfreq(len(sig), 1/self.fs)
        fft = np.fft.rfft(sig)
        power = np.abs(fft) ** 2

        # Find peak in power spectrum (exclude DC)
        dominant_idx = np.argmax(power[1:]) + 1
        return freqs[dominant_idx]


class AdaptiveKalmanFilter(BaseFilter):
    """
    Adaptive Kalman filter - process/measurement noise adapts from innovation.

    Features:
    - Automatically tunes noise parameters from residuals
    - Self-calibrating per trial
    - Handles short dropouts
    """

    def __init__(
        self,
        initial_process_noise: float = 0.01,
        initial_measurement_noise: float = 0.1,
        adaptation_rate: float = 0.1
    ):
        self.initial_Q = initial_process_noise
        self.initial_R = initial_measurement_noise
        self.adaptation_rate = adaptation_rate

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'initial_process_noise': self.initial_Q,
            'initial_measurement_noise': self.initial_R,
            'adaptation_rate': self.adaptation_rate
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive Kalman filtering"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            filtered[:, i] = self._apply_1d(data[:, i])

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply adaptive Kalman to 1D signal"""
        n = len(sig)

        # State: [position, velocity]
        x = np.array([sig[0], 0.0])
        P = np.eye(2) * 1.0  # Initial covariance

        # Process noise (adapts)
        Q = np.eye(2) * self.initial_Q

        # Measurement noise (adapts)
        R = self.initial_R

        # State transition (constant velocity model)
        F = np.array([[1, 1], [0, 1]])

        # Measurement matrix (observe position)
        H = np.array([[1, 0]])

        filtered = np.zeros(n)

        for t in range(n):
            # Predict
            x = F @ x
            P = F @ P @ F.T + Q

            # Update
            z = sig[t]  # Measurement
            y = z - H @ x  # Innovation
            S = H @ P @ H.T + R  # Innovation covariance
            K = P @ H.T / S  # Kalman gain

            x = x + K.flatten() * y
            P = (np.eye(2) - np.outer(K, H)) @ P

            filtered[t] = x[0]

            # Adapt noise parameters based on innovation
            innovation_sq = y ** 2

            # Increase R if innovation is large (measurement noise high)
            if innovation_sq > 3 * R:
                R = R + self.adaptation_rate * (innovation_sq - R)
            else:
                R = R - self.adaptation_rate * R * 0.01  # Slowly decrease

            # Ensure R stays positive and bounded
            R = np.clip(R, 0.001, 1.0)

        return filtered


class AdaptiveButterworthFilter(BaseFilter):
    """
    Adaptive Butterworth low-pass - cutoff adapts to motion frequency.

    Features:
    - Sets cutoff = motion_freq * margin
    - Preserves signal bandwidth while removing high-frequency noise
    """

    def __init__(
        self,
        order: int = 4,
        margin: float = 2.0,
        fs: float = 30.0,
        min_cutoff: float = 1.0,
        max_cutoff: float = 12.0
    ):
        self.order = order
        self.margin = margin
        self.fs = fs
        self.min_cutoff = min_cutoff
        self.max_cutoff = max_cutoff

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'min_cutoff': self.min_cutoff,
            'max_cutoff': self.max_cutoff,
            'order': self.order
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive Butterworth"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            sig = data[:, i]

            # Estimate motion frequency
            motion_freq = self._estimate_motion_frequency(sig)

            # Adaptive cutoff
            cutoff = motion_freq * self.margin
            cutoff = np.clip(cutoff, self.min_cutoff, self.max_cutoff)

            # Apply Butterworth
            if cutoff < self.fs / 2:
                sos = signal.butter(self.order, cutoff, 'low', fs=self.fs, output='sos')
                filtered[:, i] = signal.sosfiltfilt(sos, sig)
            else:
                # Cutoff too high, don't filter
                filtered[:, i] = sig

        return filtered

    def _estimate_motion_frequency(self, sig: np.ndarray) -> float:
        """Estimate dominant motion frequency"""
        if len(sig) < 10:
            return 2.0

        freqs = np.fft.rfftfreq(len(sig), 1/self.fs)
        fft = np.fft.rfft(sig)
        power = np.abs(fft) ** 2

        # Find peak (exclude DC and very low frequencies)
        start_idx = int(0.5 * len(freqs) / (self.fs / 2))  # Start at 0.5 Hz
        dominant_idx = start_idx + np.argmax(power[start_idx:])

        return freqs[dominant_idx]


class WienerFilter(BaseFilter):
    """
    Wiener filter - data-driven denoiser that estimates signal vs noise power.

    Features:
    - Estimates noise power automatically
    - Optimal in mean-squared-error sense
    """

    def __init__(self, noise_window: int = 10):
        self.noise_window = noise_window

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {'noise_window': self.noise_window}

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply Wiener filtering"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = np.zeros_like(data)

        for i in range(n_features):
            sig = data[:, i]

            # Estimate noise power from local variance
            noise_power = self._estimate_noise_power(sig)

            # Estimate signal power
            signal_power = np.var(sig)

            # Wiener filter in frequency domain
            fft_sig = np.fft.fft(sig)

            # Wiener gain: H = S / (S + N)
            # where S = signal power, N = noise power
            wiener_gain = signal_power / (signal_power + noise_power + 1e-10)

            # Apply gain (uniform for simplicity)
            fft_filtered = fft_sig * wiener_gain

            filtered[:, i] = np.real(np.fft.ifft(fft_filtered))

        return filtered

    def _estimate_noise_power(self, sig: np.ndarray) -> float:
        """Estimate noise power from high-frequency component"""
        # Use last noise_window samples to estimate noise
        # (assumes noise is stationary)
        if len(sig) < self.noise_window:
            return np.var(sig) * 0.1

        # Compute local variances
        local_vars = []
        for i in range(0, len(sig) - self.noise_window, self.noise_window):
            window = sig[i:i+self.noise_window]
            local_vars.append(np.var(window))

        # Noise power = minimum local variance
        # (assumes at least one region is mostly noise)
        noise_power = np.min(local_vars) if local_vars else np.var(sig) * 0.1

        return noise_power


class AdaptiveFilterChain:
    """
    Adaptive filter chain that automatically selects and tunes filters.

    Features:
    - Auto-calibrates from signal characteristics
    - Selects optimal filter combination
    - Configurable per analysis output type
    """

    def __init__(
        self,
        fs: float = 30.0,
        auto_calibrate: bool = True
    ):
        self.fs = fs
        self.auto_calibrate = auto_calibrate
        self.calibrator = FilterCalibrator(fs=fs)
        self.calibration: Optional[FilterCalibration] = None
        self.filters: List[BaseFilter] = []

    def calibrate(self, signal_data: np.ndarray):
        """Calibrate filter chain from signal"""
        self.calibration = self.calibrator.calibrate(signal_data)

        # Build filter chain based on recommendations
        self.filters = self._build_filter_chain(self.calibration)

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply adaptive filter chain"""
        # Auto-calibrate if enabled and not yet calibrated
        if self.auto_calibrate and self.calibration is None:
            self.calibrate(data)

        # If no filters, return original
        if len(self.filters) == 0:
            return data

        # Apply filters sequentially
        filtered = data.copy()
        for f in self.filters:
            filtered = f.apply(filtered)

        return filtered

    def _build_filter_chain(self, calib: FilterCalibration) -> List[BaseFilter]:
        """Build filter chain from calibration"""
        filters = []

        for filter_name in calib.recommended_filters:
            if filter_name == 'hampel':
                filters.append(HampelFilter())
            elif filter_name == 'adaptive_kalman':
                filters.append(AdaptiveKalmanFilter())
            elif filter_name == 'adaptive_ema':
                filters.append(AdaptiveEMAFilter())
            elif filter_name == 'adaptive_gaussian':
                filters.append(AdaptiveGaussianFilter())
            elif filter_name == 'adaptive_savgol':
                filters.append(AdaptiveSavitzkyGolayFilter(fs=self.fs))
            elif filter_name == 'adaptive_butterworth':
                filters.append(AdaptiveButterworthFilter(fs=self.fs))
            elif filter_name == 'wiener':
                filters.append(WienerFilter())

        return filters

    def get_calibration_summary(self) -> Dict:
        """Get calibration summary for reporting"""
        if self.calibration is None:
            return {}

        return {
            'noise_std': self.calibration.noise_std,
            'motion_frequency_hz': self.calibration.motion_frequency,
            'motion_speed': self.calibration.motion_speed,
            'snr': self.calibration.snr,
            'filters_applied': self.calibration.recommended_filters,
        }


# =============================================================================
# NORMALIZER.PY
# =============================================================================




@dataclass
class NormalizationStats:
    """Statistics from normalization process"""
    original_shape: Tuple[int, int]
    normalized_shape: Tuple[int, int]
    wrist_centered: bool
    scale_normalized: bool
    confidence_mean: float
    confidence_std: float
    frames_processed: int
    frames_dropped: int


class DataNormalizer:
    """
    Normalizes hand landmark data for LSTM processing.

    Normalization steps:
    1. Wrist centering - Translate all landmarks relative to wrist
    2. Scale normalization - Normalize by hand size (palm width)
    3. Temporal alignment - Ensure consistent frame rate
    4. Feature extraction - Compute derived features
    """

    def __init__(
        self,
        center_on_wrist: bool = True,
        scale_normalize: bool = True,
        min_confidence: float = 0.5,
        fps: int = DEFAULT_FPS
    ):
        self.center_on_wrist = center_on_wrist
        self.scale_normalize = scale_normalize
        self.min_confidence = min_confidence
        self.fps = fps
        self.stats: Optional[NormalizationStats] = None

    def normalize(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Main normalization pipeline.

        Args:
            df: DataFrame with raw landmark columns (LANDMARK_X/Y/Z format)

        Returns:
            Normalized DataFrame ready for LSTM processing
        """
        original_shape = df.shape

        # Step 1: Extract landmark arrays
        landmarks = self._extract_landmarks(df)  # (frames, 21, 3)
        # Handle different confidence column naming: 'Confidence', 'confidence'
        confidence_col = next((col for col in df.columns if col.lower() == 'confidence'), None)
        confidence = df[confidence_col].values if confidence_col else np.ones(len(df))

        # Step 2: Filter by confidence
        valid_mask = confidence >= self.min_confidence
        landmarks_filtered = landmarks[valid_mask]
        confidence_filtered = confidence[valid_mask]

        frames_dropped = original_shape[0] - len(landmarks_filtered)

        # Step 3: Wrist centering
        if self.center_on_wrist:
            landmarks_filtered = self._center_on_wrist(landmarks_filtered)

        # Step 4: Scale normalization
        if self.scale_normalize:
            landmarks_filtered = self._normalize_scale(landmarks_filtered)

        # Step 5: Compute derived features
        angular_velocity = self._compute_angular_velocity(landmarks_filtered)
        thumb_index_dist = self._compute_finger_distance(landmarks_filtered, "thumb_tip", "index_tip")
        hand_aperture = self._compute_hand_aperture(landmarks_filtered)

        # Step 6: Build normalized DataFrame
        normalized_df = self._build_dataframe(
            landmarks_filtered,
            confidence_filtered,
            angular_velocity,
            thumb_index_dist,
            hand_aperture
        )

        # Store stats
        self.stats = NormalizationStats(
            original_shape=original_shape,
            normalized_shape=normalized_df.shape,
            wrist_centered=self.center_on_wrist,
            scale_normalized=self.scale_normalize,
            confidence_mean=float(np.mean(confidence)),
            confidence_std=float(np.std(confidence)),
            frames_processed=len(normalized_df),
            frames_dropped=frames_dropped
        )

        return normalized_df

    def _extract_landmarks(self, df: pd.DataFrame) -> np.ndarray:
        """Extract landmarks from DataFrame to (frames, 21, 3) array

        Supports multiple column naming formats:
        1. Named format: WRIST_X, THUMB_CMC_X, etc.
        2. L-prefixed: L0_X, L1_X, etc.
        3. Android format: landmark_0_x, landmark_0_y, landmark_0_z
        """
        frames = len(df)
        landmarks = np.zeros((frames, 21, 3))

        for i, name in enumerate(LANDMARK_NAMES):
            for j, axis in enumerate(['X', 'Y', 'Z']):
                col = f"{name}_{axis}"
                if col in df.columns:
                    landmarks[:, i, j] = df[col].values
                else:
                    # Try L-prefixed format: L0_X, L1_X, etc.
                    alt_col = f"L{i}_{axis}"
                    if alt_col in df.columns:
                        landmarks[:, i, j] = df[alt_col].values
                    else:
                        # Try Android format: landmark_0_x, landmark_0_y, landmark_0_z
                        android_col = f"landmark_{i}_{axis.lower()}"
                        if android_col in df.columns:
                            landmarks[:, i, j] = df[android_col].values

        return landmarks

    def _center_on_wrist(self, landmarks: np.ndarray) -> np.ndarray:
        """Center all landmarks relative to wrist position"""
        wrist = landmarks[:, 0:1, :]  # (frames, 1, 3)
        return landmarks - wrist

    def _normalize_scale(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Normalize by hand size using palm width.
        Palm width = distance between INDEX_MCP and PINKY_MCP
        """
        index_mcp = landmarks[:, 5, :]  # INDEX_MCP
        pinky_mcp = landmarks[:, 17, :]  # PINKY_MCP

        palm_width = np.linalg.norm(index_mcp - pinky_mcp, axis=1, keepdims=True)
        palm_width = np.clip(palm_width, 0.01, None)  # Avoid division by zero

        # Expand dims for broadcasting
        palm_width = palm_width[:, :, np.newaxis]  # (frames, 1, 1)

        return landmarks / palm_width

    def _compute_angular_velocity(self, landmarks: np.ndarray) -> np.ndarray:
        """Compute wrist angular velocity from landmark changes"""
        # Use WRIST and MIDDLE_MCP to define hand orientation
        wrist = landmarks[:, 0, :]
        middle_mcp = landmarks[:, 9, :]

        # Compute orientation vector
        orientation = middle_mcp - wrist
        orientation = orientation / (np.linalg.norm(orientation, axis=1, keepdims=True) + 1e-8)

        # Compute angular change between frames
        angular_velocity = np.zeros(len(landmarks))
        for i in range(1, len(landmarks)):
            dot = np.clip(np.dot(orientation[i], orientation[i-1]), -1, 1)
            angular_velocity[i] = np.arccos(dot) * self.fps  # rad/s

        return angular_velocity

    def _compute_finger_distance(
        self,
        landmarks: np.ndarray,
        finger1: str,
        finger2: str
    ) -> np.ndarray:
        """Compute distance between two fingertips"""
        idx1 = FINGERTIP_INDICES[finger1]
        idx2 = FINGERTIP_INDICES[finger2]

        diff = landmarks[:, idx1, :] - landmarks[:, idx2, :]
        return np.linalg.norm(diff, axis=1)

    def _compute_hand_aperture(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute hand aperture - maximum spread of the hand.
        Uses thumb tip to pinky tip distance.
        """
        thumb_tip = landmarks[:, FINGERTIP_INDICES["thumb_tip"], :]
        pinky_tip = landmarks[:, FINGERTIP_INDICES["pinky_tip"], :]

        return np.linalg.norm(thumb_tip - pinky_tip, axis=1)

    def _build_dataframe(
        self,
        landmarks: np.ndarray,
        confidence: np.ndarray,
        angular_velocity: np.ndarray,
        thumb_index_dist: np.ndarray,
        hand_aperture: np.ndarray
    ) -> pd.DataFrame:
        """Build normalized DataFrame with all features"""
        frames = len(landmarks)

        # Initialize DataFrame with metadata
        data = {
            'Frame': np.arange(frames),
            'Timestamp': np.arange(frames) / self.fps,
            'Confidence': confidence,
        }

        # Add landmark coordinates
        for i, name in enumerate(LANDMARK_NAMES):
            for j, axis in enumerate(['X', 'Y', 'Z']):
                data[f"{name}_{axis}"] = landmarks[:, i, j]

        # Add derived features
        data['Angular_Velocity'] = angular_velocity
        data['Thumb_Index_Distance'] = thumb_index_dist
        data['Hand_Aperture_Distance'] = hand_aperture

        return pd.DataFrame(data)

    def _compute_all_joint_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute all 25 joint angle features for LSTM model.

        Args:
            landmarks: Shape (n_frames, 21, 3)

        Returns:
            angles: Shape (n_frames, 25)
                - Finger joint angles: 14 features (thumb=2, others=3 each)
                - Finger spread angles: 4 features (adjacent finger pairs)
                - Palm orientation angles: 3 features
                - Wrist flexion/extension: 2 features
                - Hand openness: 2 features
        """
        n_frames = len(landmarks)
        all_angles = []

        # 1. Finger Joint Angles (14 features)
        # Thumb (2 angles): CMC-MCP, MCP-IP
        thumb_angles = self._compute_finger_joint_angles(landmarks, FINGER_LANDMARKS['thumb'])
        all_angles.append(thumb_angles)

        # Index, Middle, Ring, Pinky (3 angles each = 12 total)
        for finger in ['index', 'middle', 'ring', 'pinky']:
            finger_angles = self._compute_finger_joint_angles(landmarks, FINGER_LANDMARKS[finger])
            all_angles.append(finger_angles)

        # 2. Finger Spread Angles (4 features)
        # Angle between adjacent fingers
        spread_angles = self._compute_finger_spread_angles(landmarks)
        all_angles.append(spread_angles)

        # 3. Palm Orientation Angles (3 features)
        palm_angles = self._compute_palm_orientation(landmarks)
        all_angles.append(palm_angles)

        # 4. Wrist Flexion/Extension (2 features)
        wrist_angles = self._compute_wrist_angles(landmarks)
        all_angles.append(wrist_angles)

        # 5. Hand Openness (2 features)
        openness_angles = self._compute_hand_openness_angles(landmarks)
        all_angles.append(openness_angles)

        # 6. Additional Composite Angles (4 features) to reach 25 total
        # These capture inter-finger relationships and hand shape
        composite_angles = self._compute_composite_angles(landmarks)
        all_angles.append(composite_angles)

        # Concatenate all angles: should be 25 total
        angles = np.concatenate(all_angles, axis=1)

        return angles

    def _compute_finger_joint_angles(self, landmarks: np.ndarray, landmark_indices: List[int]) -> np.ndarray:
        """
        Compute joint angles for a single finger.

        Args:
            landmarks: (n_frames, 21, 3)
            landmark_indices: List of landmark indices for finger [base, joint1, joint2, tip]

        Returns:
            angles: (n_frames, n_angles) where n_angles = len(landmark_indices) - 2
        """
        n_frames = len(landmarks)
        angles_list = []

        for i in range(len(landmark_indices) - 2):
            p1_idx = landmark_indices[i]
            p2_idx = landmark_indices[i + 1]
            p3_idx = landmark_indices[i + 2]

            p1 = landmarks[:, p1_idx, :]  # (n_frames, 3)
            p2 = landmarks[:, p2_idx, :]
            p3 = landmarks[:, p3_idx, :]

            # Compute angle at p2 (joint)
            v1 = p1 - p2
            v2 = p3 - p2

            # Normalize vectors
            v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
            v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10
            v1 = v1 / v1_norm
            v2 = v2 / v2_norm

            # Compute angle
            cos_angle = np.sum(v1 * v2, axis=1)
            cos_angle = np.clip(cos_angle, -1, 1)
            angle = np.arccos(cos_angle) * 180 / np.pi

            angles_list.append(angle.reshape(-1, 1))

        if angles_list:
            return np.concatenate(angles_list, axis=1)
        else:
            return np.zeros((n_frames, 1))

    def _compute_finger_spread_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute angles between adjacent fingers (finger spread).

        Returns: (n_frames, 4) - angles between thumb-index, index-middle, middle-ring, ring-pinky
        """
        n_frames = len(landmarks)

        # Use MCP joints for spread measurement
        thumb_mcp = landmarks[:, FINGER_LANDMARKS['thumb'][1], :]  # Thumb MCP
        index_mcp = landmarks[:, FINGER_LANDMARKS['index'][0], :]
        middle_mcp = landmarks[:, FINGER_LANDMARKS['middle'][0], :]
        ring_mcp = landmarks[:, FINGER_LANDMARKS['ring'][0], :]
        pinky_mcp = landmarks[:, FINGER_LANDMARKS['pinky'][0], :]

        wrist = landmarks[:, 0, :]  # Reference point

        spreads = []
        for f1, f2 in [(thumb_mcp, index_mcp), (index_mcp, middle_mcp),
                       (middle_mcp, ring_mcp), (ring_mcp, pinky_mcp)]:
            v1 = f1 - wrist
            v2 = f2 - wrist

            v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
            v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10
            v1 = v1 / v1_norm
            v2 = v2 / v2_norm

            cos_angle = np.sum(v1 * v2, axis=1)
            cos_angle = np.clip(cos_angle, -1, 1)
            angle = np.arccos(cos_angle) * 180 / np.pi

            spreads.append(angle.reshape(-1, 1))

        return np.concatenate(spreads, axis=1)

    def _compute_palm_orientation(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute palm orientation angles (3 features): roll, pitch, yaw.
        """
        n_frames = len(landmarks)

        wrist = landmarks[:, 0, :]
        index_mcp = landmarks[:, FINGER_LANDMARKS['index'][0], :]
        pinky_mcp = landmarks[:, FINGER_LANDMARKS['pinky'][0], :]
        middle_mcp = landmarks[:, FINGER_LANDMARKS['middle'][0], :]

        # Palm plane vectors
        palm_width = pinky_mcp - index_mcp  # Left-right
        palm_length = middle_mcp - wrist    # Front-back

        # Palm normal (perpendicular to palm)
        palm_normal = np.cross(palm_width, palm_length)

        # Compute orientation angles relative to world axes
        # Roll: rotation around x-axis
        roll = np.arctan2(palm_normal[:, 1], palm_normal[:, 2]) * 180 / np.pi

        # Pitch: rotation around y-axis
        pitch = np.arctan2(-palm_normal[:, 0],
                          np.sqrt(palm_normal[:, 1]**2 + palm_normal[:, 2]**2)) * 180 / np.pi

        # Yaw: rotation around z-axis (palm width angle)
        yaw = np.arctan2(palm_width[:, 1], palm_width[:, 0]) * 180 / np.pi

        return np.column_stack([roll, pitch, yaw])

    def _compute_wrist_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute wrist flexion/extension angles (2 features).
        """
        n_frames = len(landmarks)

        wrist = landmarks[:, 0, :]
        middle_mcp = landmarks[:, FINGER_LANDMARKS['middle'][0], :]
        middle_tip = landmarks[:, FINGER_LANDMARKS['middle'][3], :]

        # Wrist to middle MCP (forearm direction)
        forearm_vec = middle_mcp - wrist

        # Middle MCP to tip (finger direction)
        finger_vec = middle_tip - middle_mcp

        # Project onto XY plane (flexion/extension)
        forearm_xy = forearm_vec[:, :2]
        finger_xy = finger_vec[:, :2]

        forearm_xy_norm = np.linalg.norm(forearm_xy, axis=1, keepdims=True) + 1e-10
        finger_xy_norm = np.linalg.norm(finger_xy, axis=1, keepdims=True) + 1e-10

        cos_angle_xy = np.sum(forearm_xy * finger_xy, axis=1) / (forearm_xy_norm.squeeze() * finger_xy_norm.squeeze())
        cos_angle_xy = np.clip(cos_angle_xy, -1, 1)
        flexion_angle = np.arccos(cos_angle_xy) * 180 / np.pi

        # Project onto XZ plane (radial/ulnar deviation)
        forearm_xz = forearm_vec[:, [0, 2]]
        finger_xz = finger_vec[:, [0, 2]]

        forearm_xz_norm = np.linalg.norm(forearm_xz, axis=1, keepdims=True) + 1e-10
        finger_xz_norm = np.linalg.norm(finger_xz, axis=1, keepdims=True) + 1e-10

        cos_angle_xz = np.sum(forearm_xz * finger_xz, axis=1) / (forearm_xz_norm.squeeze() * finger_xz_norm.squeeze())
        cos_angle_xz = np.clip(cos_angle_xz, -1, 1)
        deviation_angle = np.arccos(cos_angle_xz) * 180 / np.pi

        return np.column_stack([flexion_angle, deviation_angle])

    def _compute_hand_openness_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute hand openness/closure angles (2 features).
        """
        n_frames = len(landmarks)

        # Thumb tip to index tip angle
        thumb_tip = landmarks[:, FINGER_LANDMARKS['thumb'][3], :]
        index_tip = landmarks[:, FINGER_LANDMARKS['index'][3], :]
        wrist = landmarks[:, 0, :]

        v1 = thumb_tip - wrist
        v2 = index_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        thumb_index_angle = np.arccos(cos_angle) * 180 / np.pi

        # Index tip to pinky tip angle
        pinky_tip = landmarks[:, FINGER_LANDMARKS['pinky'][3], :]

        v1 = index_tip - wrist
        v2 = pinky_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        index_pinky_angle = np.arccos(cos_angle) * 180 / np.pi

        return np.column_stack([thumb_index_angle, index_pinky_angle])

    def _compute_composite_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute composite angles capturing overall hand shape (4 features).

        These angles capture inter-finger relationships and global hand configuration.
        """
        n_frames = len(landmarks)

        wrist = landmarks[:, 0, :]

        # 1. Thumb-to-middle angle (pinch closure)
        thumb_tip = landmarks[:, FINGER_LANDMARKS['thumb'][3], :]
        middle_tip = landmarks[:, FINGER_LANDMARKS['middle'][3], :]

        v1 = thumb_tip - wrist
        v2 = middle_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        thumb_middle_angle = np.arccos(cos_angle) * 180 / np.pi

        # 2. Ring-to-pinky closure (ulnar side)
        ring_tip = landmarks[:, FINGER_LANDMARKS['ring'][3], :]
        pinky_tip = landmarks[:, FINGER_LANDMARKS['pinky'][3], :]

        v1 = ring_tip - wrist
        v2 = pinky_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        ring_pinky_angle = np.arccos(cos_angle) * 180 / np.pi

        # 3. Index-to-middle parallelism
        index_tip = landmarks[:, FINGER_LANDMARKS['index'][3], :]

        v1 = index_tip - wrist
        v2 = middle_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        index_middle_angle = np.arccos(cos_angle) * 180 / np.pi

        # 4. Middle-to-ring alignment
        v1 = middle_tip - wrist
        v2 = ring_tip - wrist

        v1_norm = np.linalg.norm(v1, axis=1, keepdims=True) + 1e-10
        v2_norm = np.linalg.norm(v2, axis=1, keepdims=True) + 1e-10

        cos_angle = np.sum(v1 * v2, axis=1) / (v1_norm.squeeze() * v2_norm.squeeze())
        cos_angle = np.clip(cos_angle, -1, 1)
        middle_ring_angle = np.arccos(cos_angle) * 180 / np.pi

        return np.column_stack([thumb_middle_angle, ring_pinky_angle,
                                index_middle_angle, middle_ring_angle])

    def normalize_for_lstm(self, df: pd.DataFrame) -> np.ndarray:
        """
        Prepare data specifically for LSTM model input with joint angles.

        Uses WRIST-CENTERED normalization to match training data format:
        - Landmarks are centered on wrist (wrist = 0,0,0)
        - Derived features are z-score standardized
        - Joint angles are in radians

        Returns:
            Array of shape (n_sequences, SEQUENCE_LENGTH, 91 features)
            - 63 landmark coordinates (wrist-centered)
            - 3 derived features (z-score standardized)
            - 25 joint angle features (radians)
        """
        n_frames = len(df)

        # Step 1: Extract raw landmarks (21 landmarks x 3 coords)
        landmarks = np.zeros((n_frames, 21, 3))
        for i in range(21):
            landmarks[:, i, 0] = df[f'landmark_{i}_x'].values
            landmarks[:, i, 1] = df[f'landmark_{i}_y'].values
            landmarks[:, i, 2] = df[f'landmark_{i}_z'].values

        # Step 2: WRIST-CENTER the landmarks (wrist becomes origin)
        wrist = landmarks[:, 0:1, :]  # Shape: (n_frames, 1, 3)
        landmarks_centered = landmarks - wrist

        # Step 2b: SCALE NORMALIZATION - divide by max hand span per frame
        # This ensures coordinates are in [-1, 1] range (matching training data)
        distances = np.sqrt(np.sum(landmarks_centered ** 2, axis=2))  # Shape: (n_frames, 21)
        max_dist = np.max(distances, axis=1, keepdims=True)  # Shape: (n_frames, 1)

        # Handle frames with no hand detected (all zeros)
        max_dist = np.where(max_dist == 0, 1.0, max_dist)  # Avoid division by zero

        # Scale landmarks so max distance = 1.0
        landmarks_centered = landmarks_centered / max_dist[:, :, np.newaxis]

        # Flatten to (n_frames, 63)
        landmarks_flat = landmarks_centered.reshape(n_frames, -1)

        # Step 3: Compute derived features
        thumb_tip = landmarks_centered[:, 4]   # THUMB_TIP
        index_tip = landmarks_centered[:, 8]   # INDEX_TIP
        pinky_tip = landmarks_centered[:, 20]  # PINKY_TIP

        # Thumb-index distance
        thumb_index_dist = np.linalg.norm(thumb_tip - index_tip, axis=1)

        # Hand aperture (thumb to pinky)
        hand_aperture = np.linalg.norm(thumb_tip - pinky_tip, axis=1)

        # Angular velocity (simplified - difference in wrist orientation)
        angular_velocity = np.zeros(n_frames)
        if n_frames > 1:
            # Use middle finger direction as proxy for hand orientation
            middle_tip = landmarks_centered[:, 12]
            angles = np.arctan2(middle_tip[:, 1], middle_tip[:, 0])
            angular_velocity[1:] = np.diff(angles)

        # Z-score standardize ONLY the derived features
        def zscore(x):
            return (x - np.mean(x)) / (np.std(x) + 1e-8)

        angular_velocity_std = zscore(angular_velocity)
        thumb_index_std = zscore(thumb_index_dist)
        hand_aperture_std = zscore(hand_aperture)

        # Combine 66 base features
        features_66 = np.column_stack([
            landmarks_flat,           # 63 features (wrist-centered)
            angular_velocity_std,     # 1 feature (z-score)
            thumb_index_std,          # 1 feature (z-score)
            hand_aperture_std         # 1 feature (z-score)
        ])

        # Step 4: Compute 25 joint angles
        joint_angles = self._compute_lstm_joint_angles(landmarks_centered)

        # Combine all 91 features
        features_91 = np.column_stack([features_66, joint_angles])

        # Step 5: Create sequences
        sequences = self._create_sequences(features_91, SEQUENCE_LENGTH)

        return sequences

    def _compute_lstm_joint_angles(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Compute 25 joint angles for LSTM input.

        Args:
            landmarks: Wrist-centered landmarks of shape (n_frames, 21, 3)

        Returns:
            angles: Array of shape (n_frames, 25) with joint angles in radians
        """
        def angle_between(v1, v2):
            """Compute angle between two vector arrays"""
            n1 = v1 / (np.linalg.norm(v1, axis=1, keepdims=True) + 1e-8)
            n2 = v2 / (np.linalg.norm(v2, axis=1, keepdims=True) + 1e-8)
            cos_angle = np.sum(n1 * n2, axis=1)
            return np.arccos(np.clip(cos_angle, -1, 1))

        lm = landmarks
        angles = []

        # Thumb angles (3): joints 0->1->2->3->4
        for j in range(3):
            v1 = lm[:, j+1] - lm[:, j]
            v2 = lm[:, j+2] - lm[:, j+1]
            angles.append(angle_between(v1, v2))

        # Index finger angles (3): 0->5->6->7->8
        for (a, b, c) in [(0, 5, 6), (5, 6, 7), (6, 7, 8)]:
            angles.append(angle_between(lm[:, b] - lm[:, a], lm[:, c] - lm[:, b]))

        # Middle finger angles (3): 0->9->10->11->12
        for (a, b, c) in [(0, 9, 10), (9, 10, 11), (10, 11, 12)]:
            angles.append(angle_between(lm[:, b] - lm[:, a], lm[:, c] - lm[:, b]))

        # Ring finger angles (3): 0->13->14->15->16
        for (a, b, c) in [(0, 13, 14), (13, 14, 15), (14, 15, 16)]:
            angles.append(angle_between(lm[:, b] - lm[:, a], lm[:, c] - lm[:, b]))

        # Pinky finger angles (3): 0->17->18->19->20
        for (a, b, c) in [(0, 17, 18), (17, 18, 19), (18, 19, 20)]:
            angles.append(angle_between(lm[:, b] - lm[:, a], lm[:, c] - lm[:, b]))

        # Inter-finger angles at MCP level (4)
        for (a, b) in [(1, 5), (5, 9), (9, 13), (13, 17)]:
            angles.append(angle_between(lm[:, a] - lm[:, 0], lm[:, b] - lm[:, 0]))

        # Fingertip spread angles (4)
        for (a, b) in [(4, 8), (8, 12), (12, 16), (16, 20)]:
            angles.append(angle_between(lm[:, a] - lm[:, 0], lm[:, b] - lm[:, 0]))

        # Hand spread angle (thumb tip to pinky tip) (1)
        angles.append(angle_between(lm[:, 4] - lm[:, 0], lm[:, 20] - lm[:, 0]))

        # Index-middle spread for additional discrimination (1)
        angles.append(angle_between(lm[:, 8] - lm[:, 0], lm[:, 12] - lm[:, 0]))

        # Total: 3+3+3+3+3+4+4+1+1 = 25 angles
        return np.column_stack(angles[:25])

    def _standardize(self, features: np.ndarray) -> np.ndarray:
        """Z-score standardization"""
        mean = np.mean(features, axis=0, keepdims=True)
        std = np.std(features, axis=0, keepdims=True) + 1e-8
        return (features - mean) / std

    def _create_sequences(
        self,
        features: np.ndarray,
        seq_length: int,
        stride: int = 1
    ) -> np.ndarray:
        """Create sliding window sequences for LSTM"""
        n_frames = len(features)
        n_sequences = (n_frames - seq_length) // stride + 1

        if n_sequences <= 0:
            # Pad if not enough frames
            padded = np.zeros((seq_length, features.shape[1]))
            padded[:n_frames] = features
            return padded[np.newaxis, :]

        sequences = np.zeros((n_sequences, seq_length, features.shape[1]))
        for i in range(n_sequences):
            start = i * stride
            sequences[i] = features[start:start + seq_length]

        return sequences


class AdaptiveNormalizer(DataNormalizer):
    """
    Advanced normalizer with adaptive techniques.

    Features:
    - Robust statistics (median, MAD)
    - Outlier detection and handling
    - Missing data interpolation
    - Per-recording calibration
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.calibration_stats: Optional[Dict] = None

    def calibrate(self, reference_df: pd.DataFrame):
        """
        Calibrate normalizer using reference recording.
        Useful for per-patient baseline calibration.
        """
        landmarks = self._extract_landmarks(reference_df)

        # Compute robust statistics
        self.calibration_stats = {
            'landmark_medians': np.median(landmarks, axis=0),
            'landmark_mads': stats.median_abs_deviation(landmarks, axis=0),
            'palm_width_median': np.median(self._compute_palm_width(landmarks)),
            'palm_width_mad': stats.median_abs_deviation(
                self._compute_palm_width(landmarks)
            ),
        }

    def _compute_palm_width(self, landmarks: np.ndarray) -> np.ndarray:
        """Compute palm width for each frame"""
        index_mcp = landmarks[:, 5, :]
        pinky_mcp = landmarks[:, 17, :]
        return np.linalg.norm(index_mcp - pinky_mcp, axis=1)

    def normalize_with_outlier_handling(
        self,
        df: pd.DataFrame,
        outlier_method: str = "mad"
    ) -> pd.DataFrame:
        """
        Normalize with outlier detection and interpolation.

        Args:
            df: Input DataFrame
            outlier_method: "mad", "iqr", or "zscore"

        Returns:
            Normalized DataFrame with outliers handled
        """
        landmarks = self._extract_landmarks(df)

        # Detect outliers
        if outlier_method == "mad":
            outlier_mask = self._detect_outliers_mad(landmarks)
        elif outlier_method == "iqr":
            outlier_mask = self._detect_outliers_iqr(landmarks)
        else:
            outlier_mask = self._detect_outliers_zscore(landmarks)

        # Interpolate outliers
        landmarks = self._interpolate_outliers(landmarks, outlier_mask)

        # Continue with standard normalization
        df_clean = self._landmarks_to_df(df, landmarks)
        return self.normalize(df_clean)

    def _detect_outliers_mad(
        self,
        landmarks: np.ndarray,
        threshold: float = 3.5
    ) -> np.ndarray:
        """Detect outliers using Median Absolute Deviation"""
        median = np.median(landmarks, axis=0, keepdims=True)
        mad = stats.median_abs_deviation(landmarks, axis=0)
        mad = np.where(mad == 0, 1e-8, mad)

        # MAD scale factor for normal distribution
        mad_scaled = mad * 1.4826

        deviation = np.abs(landmarks - median) / mad_scaled
        return np.any(deviation > threshold, axis=(1, 2))

    def _detect_outliers_iqr(
        self,
        landmarks: np.ndarray,
        multiplier: float = 1.5
    ) -> np.ndarray:
        """Detect outliers using Interquartile Range"""
        q1 = np.percentile(landmarks, 25, axis=0, keepdims=True)
        q3 = np.percentile(landmarks, 75, axis=0, keepdims=True)
        iqr = q3 - q1

        lower = q1 - multiplier * iqr
        upper = q3 + multiplier * iqr

        return np.any((landmarks < lower) | (landmarks > upper), axis=(1, 2))

    def _detect_outliers_zscore(
        self,
        landmarks: np.ndarray,
        threshold: float = 3.0
    ) -> np.ndarray:
        """Detect outliers using Z-score"""
        mean = np.mean(landmarks, axis=0, keepdims=True)
        std = np.std(landmarks, axis=0, keepdims=True) + 1e-8

        zscore = np.abs((landmarks - mean) / std)
        return np.any(zscore > threshold, axis=(1, 2))

    def _interpolate_outliers(
        self,
        landmarks: np.ndarray,
        outlier_mask: np.ndarray
    ) -> np.ndarray:
        """Interpolate outlier frames using neighboring frames"""
        result = landmarks.copy()
        outlier_indices = np.where(outlier_mask)[0]

        for idx in outlier_indices:
            # Find nearest valid neighbors
            before = idx - 1
            after = idx + 1

            while before >= 0 and outlier_mask[before]:
                before -= 1
            while after < len(landmarks) and outlier_mask[after]:
                after += 1

            # Interpolate
            if before >= 0 and after < len(landmarks):
                # Linear interpolation
                weight = (idx - before) / (after - before)
                result[idx] = (1 - weight) * landmarks[before] + weight * landmarks[after]
            elif before >= 0:
                result[idx] = landmarks[before]
            elif after < len(landmarks):
                result[idx] = landmarks[after]
            # else: keep original (no valid neighbors)

        return result

    def _landmarks_to_df(
        self,
        original_df: pd.DataFrame,
        landmarks: np.ndarray
    ) -> pd.DataFrame:
        """Convert landmarks array back to DataFrame format"""
        df = original_df.copy()

        for i, name in enumerate(LANDMARK_NAMES):
            for j, axis in enumerate(['X', 'Y', 'Z']):
                col = f"{name}_{axis}"
                if col in df.columns:
                    df[col] = landmarks[:, i, j]

        return df


# =============================================================================
# OUTLIER_DETECTION.PY
# =============================================================================





@dataclass
class OutlierReport:
    """Report of detected outliers"""
    n_outliers: int
    outlier_indices: np.ndarray
    outlier_percentage: float
    detection_method: str


class HampelFilter(BaseFilter):
    """
    Hampel filter - robust spike detector using rolling median + MAD.

    Features:
    - Detects outliers based on median absolute deviation
    - Replaces outliers with median value
    - Resistant to extreme values
    """

    def __init__(
        self,
        window_size: int = 7,
        n_sigma: float = 3.0,
        replace_with_median: bool = True
    ):
        self.window_size = window_size
        self.n_sigma = n_sigma
        self.replace_with_median = replace_with_median

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'window_size': self.window_size,
            'n_sigma': self.n_sigma,
            'replace_with_median': self.replace_with_median
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply Hampel filter"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i], _ = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> Tuple[np.ndarray, OutlierReport]:
        """Apply Hampel filter to 1D signal"""
        n = len(sig)
        filtered = sig.copy()
        half_window = self.window_size // 2

        outlier_mask = np.zeros(n, dtype=bool)

        for i in range(n):
            # Define window
            start = max(0, i - half_window)
            end = min(n, i + half_window + 1)
            window = sig[start:end]

            # Compute median and MAD
            median = np.median(window)
            mad = stats.median_abs_deviation(window, scale='normal')

            # Detect outlier
            if np.abs(sig[i] - median) > self.n_sigma * mad:
                outlier_mask[i] = True

                # Replace with median
                if self.replace_with_median:
                    filtered[i] = median

        report = OutlierReport(
            n_outliers=int(np.sum(outlier_mask)),
            outlier_indices=np.where(outlier_mask)[0],
            outlier_percentage=float(np.mean(outlier_mask) * 100),
            detection_method='hampel'
        )

        return filtered, report


class MADGatingFilter(BaseFilter):
    """
    MAD gating - robust z-score based outlier rejection.

    Features:
    - Uses median absolute deviation (resistant to outliers)
    - More robust than standard z-score
    - Configurable threshold
    """

    def __init__(
        self,
        threshold: float = 3.5,
        interpolate: bool = True
    ):
        self.threshold = threshold
        self.interpolate = interpolate

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'threshold': self.threshold,
            'interpolate': self.interpolate
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply MAD gating"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply MAD gating to 1D signal"""
        # Compute median and MAD
        median = np.median(sig)
        mad = stats.median_abs_deviation(sig, scale='normal')

        # Compute robust z-scores
        robust_z = np.abs(sig - median) / (mad + 1e-10)

        # Detect outliers
        outlier_mask = robust_z > self.threshold

        # Interpolate outliers
        if self.interpolate and np.any(outlier_mask):
            filtered = sig.copy()
            outlier_indices = np.where(outlier_mask)[0]

            for idx in outlier_indices:
                # Find nearest valid neighbors
                before = idx - 1
                after = idx + 1

                while before >= 0 and outlier_mask[before]:
                    before -= 1
                while after < len(sig) and outlier_mask[after]:
                    after += 1

                # Interpolate
                if before >= 0 and after < len(sig):
                    weight = (idx - before) / (after - before)
                    filtered[idx] = (1 - weight) * sig[before] + weight * sig[after]
                elif before >= 0:
                    filtered[idx] = sig[before]
                elif after < len(sig):
                    filtered[idx] = sig[after]

            return filtered
        else:
            return sig


class IQRGatingFilter(BaseFilter):
    """
    IQR gating - Tukey's fences for outlier detection.

    Features:
    - Uses interquartile range (robust to outliers)
    - Standard statistical method
    - Configurable multiplier (1.5 = standard, 3.0 = extreme outliers only)
    """

    def __init__(
        self,
        multiplier: float = 1.5,
        interpolate: bool = True
    ):
        self.multiplier = multiplier
        self.interpolate = interpolate

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'multiplier': self.multiplier,
            'interpolate': self.interpolate
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply IQR gating"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply IQR gating to 1D signal"""
        # Compute quartiles
        q1 = np.percentile(sig, 25)
        q3 = np.percentile(sig, 75)
        iqr = q3 - q1

        # Compute bounds (Tukey's fences)
        lower_bound = q1 - self.multiplier * iqr
        upper_bound = q3 + self.multiplier * iqr

        # Detect outliers
        outlier_mask = (sig < lower_bound) | (sig > upper_bound)

        # Interpolate outliers
        if self.interpolate and np.any(outlier_mask):
            filtered = sig.copy()
            outlier_indices = np.where(outlier_mask)[0]

            for idx in outlier_indices:
                # Clamp to bounds
                filtered[idx] = np.clip(sig[idx], lower_bound, upper_bound)

            return filtered
        else:
            return sig


class DerivativeZScoreFilter(BaseFilter):
    """
    Derivative z-score gating - detects outliers by abnormal velocity/acceleration.

    Features:
    - Detects teleports and spikes via velocity analysis
    - More sensitive to motion artifacts than position-based methods
    """

    def __init__(
        self,
        threshold: float = 3.0,
        use_acceleration: bool = False
    ):
        self.threshold = threshold
        self.use_acceleration = use_acceleration

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'threshold': self.threshold,
            'use_acceleration': self.use_acceleration
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply derivative z-score filtering"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply derivative z-score to 1D signal"""
        # Compute velocity
        velocity = np.diff(sig, prepend=sig[0])

        if self.use_acceleration:
            # Compute acceleration
            derivative = np.diff(velocity, prepend=velocity[0])
        else:
            derivative = velocity

        # Compute z-score of derivative
        mean_deriv = np.mean(derivative)
        std_deriv = np.std(derivative)
        z_score = np.abs(derivative - mean_deriv) / (std_deriv + 1e-10)

        # Detect outliers
        outlier_mask = z_score > self.threshold

        # Replace outliers with interpolation
        if np.any(outlier_mask):
            filtered = sig.copy()
            outlier_indices = np.where(outlier_mask)[0]

            for idx in outlier_indices:
                # Find nearest valid neighbors
                before = idx - 1
                after = idx + 1

                while before >= 0 and outlier_mask[before]:
                    before -= 1
                while after < len(sig) and outlier_mask[after]:
                    after += 1

                # Interpolate
                if before >= 0 and after < len(sig):
                    weight = (idx - before) / (after - before)
                    filtered[idx] = (1 - weight) * sig[before] + weight * sig[after]
                elif before >= 0:
                    filtered[idx] = sig[before]
                elif after < len(sig):
                    filtered[idx] = sig[after]

            return filtered
        else:
            return sig


class VelocityClampFilter(BaseFilter):
    """
    Dynamic velocity clamping - limits frame-to-frame motion based on learned bounds.

    Features:
    - Learns typical velocity range from data
    - Clamps physically impossible velocities
    - Adapts per trial
    """

    def __init__(
        self,
        percentile: float = 95.0,
        margin: float = 1.5
    ):
        self.percentile = percentile
        self.margin = margin

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'percentile': self.percentile,
            'margin': self.margin
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply velocity clamping"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply velocity clamping to 1D signal"""
        # Compute velocity
        velocity = np.diff(sig, prepend=sig[0])

        # Learn velocity bound from percentile
        velocity_bound = np.percentile(np.abs(velocity), self.percentile) * self.margin

        # Clamp velocities
        velocity_clamped = np.clip(velocity, -velocity_bound, velocity_bound)

        # Reconstruct signal by integrating clamped velocity
        filtered = np.cumsum(velocity_clamped) + sig[0] - velocity_clamped[0]

        return filtered


class AccelerationClampFilter(BaseFilter):
    """
    Dynamic acceleration clamping - limits physically impossible acceleration/jerk.

    Features:
    - Learns typical acceleration range
    - Prevents unrealistic motion changes
    - Adapts per trial
    """

    def __init__(
        self,
        percentile: float = 95.0,
        margin: float = 1.5,
        fs: float = 30.0
    ):
        self.percentile = percentile
        self.margin = margin
        self.fs = fs

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'percentile': self.percentile,
            'margin': self.margin,
            'fs': self.fs
        }

    def apply(self, data: np.ndarray) -> np.ndarray:
        """Apply acceleration clamping"""
        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig)

        return filtered

    def _apply_1d(self, sig: np.ndarray) -> np.ndarray:
        """Apply acceleration clamping to 1D signal"""
        # Compute velocity
        velocity = np.diff(sig, prepend=sig[0]) * self.fs

        # Compute acceleration
        acceleration = np.diff(velocity, prepend=velocity[0]) * self.fs

        # Learn acceleration bound
        accel_bound = np.percentile(np.abs(acceleration), self.percentile) * self.margin

        # Clamp acceleration
        accel_clamped = np.clip(acceleration, -accel_bound, accel_bound)

        # Reconstruct velocity by integrating clamped acceleration
        velocity_recon = np.cumsum(accel_clamped) / self.fs + velocity[0] - accel_clamped[0] / self.fs

        # Reconstruct position by integrating velocity
        filtered = np.cumsum(velocity_recon) / self.fs + sig[0] - velocity_recon[0] / self.fs

        return filtered


class ConfidenceWeightedFilter(BaseFilter):
    """
    Confidence-weighted filtering - trusts measurements less when visibility drops.

    Features:
    - Weights measurements by MediaPipe confidence
    - Leans on prediction when confidence is low
    - Smooth transition between measurement and prediction
    """

    def __init__(
        self,
        confidence_threshold: float = 0.5,
        prediction_weight: float = 0.8
    ):
        self.confidence_threshold = confidence_threshold
        self.prediction_weight = prediction_weight

    def get_params(self) -> dict:
        """Return filter parameters"""
        return {
            'confidence_threshold': self.confidence_threshold,
            'prediction_weight': self.prediction_weight
        }

    def apply(self, data: np.ndarray, confidence: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Apply confidence-weighted filtering.

        Args:
            data: Signal data (n_samples, n_features)
            confidence: Confidence scores (n_samples,) - if None, no weighting applied

        Returns:
            Filtered data
        """
        if confidence is None:
            return data

        if data.ndim == 1:
            data = data.reshape(-1, 1)

        n_samples, n_features = data.shape
        filtered = data.copy()

        for i in range(n_features):
            sig = data[:, i]
            filtered[:, i] = self._apply_1d(sig, confidence)

        return filtered

    def _apply_1d(self, sig: np.ndarray, confidence: np.ndarray) -> np.ndarray:
        """Apply confidence weighting to 1D signal"""
        n = len(sig)
        filtered = sig.copy()

        # Simple prediction model (constant velocity)
        velocity = 0.0

        for t in range(1, n):
            # Prediction
            prediction = filtered[t-1] + velocity

            # Measurement weight based on confidence
            if confidence[t] < self.confidence_threshold:
                # Low confidence - rely more on prediction
                measurement_weight = 1.0 - self.prediction_weight
            else:
                # High confidence - trust measurement
                measurement_weight = confidence[t]

            # Fuse prediction and measurement
            filtered[t] = measurement_weight * sig[t] + (1 - measurement_weight) * prediction

            # Update velocity estimate
            velocity = filtered[t] - filtered[t-1]

        return filtered


class OutlierDetectionPipeline:
    """
    Complete outlier detection and removal pipeline.

    Applies multiple outlier detection methods in sequence:
    1. Hampel filter (spike removal)
    2. MAD gating (robust z-score)
    3. Velocity clamping (physically plausible motion)
    """

    def __init__(self, aggressive: bool = False):
        """
        Args:
            aggressive: If True, use stricter thresholds
        """
        if aggressive:
            self.hampel = HampelFilter(window_size=5, n_sigma=2.5)
            self.mad_gating = MADGatingFilter(threshold=3.0)
            self.velocity_clamp = VelocityClampFilter(percentile=90, margin=1.2)
        else:
            self.hampel = HampelFilter(window_size=7, n_sigma=3.0)
            self.mad_gating = MADGatingFilter(threshold=3.5)
            self.velocity_clamp = VelocityClampFilter(percentile=95, margin=1.5)

    def apply(self, data: np.ndarray) -> Tuple[np.ndarray, Dict]:
        """
        Apply outlier detection pipeline.

        Returns:
            Filtered data and report dictionary
        """
        report = {}

        # Stage 1: Hampel filter
        filtered = self.hampel.apply(data)
        report['hampel_applied'] = True

        # Stage 2: MAD gating
        filtered = self.mad_gating.apply(filtered)
        report['mad_gating_applied'] = True

        # Stage 3: Velocity clamping
        filtered = self.velocity_clamp.apply(filtered)
        report['velocity_clamp_applied'] = True

        return filtered, report


# =============================================================================
# THRESHOLDS.PY
# =============================================================================





@dataclass
class ThresholdResult:
    """Result from threshold detection"""
    threshold: float
    method: str
    metadata: dict = None


class AdaptiveThresholder:
    """
    Adaptive threshold detection using multiple statistical methods.

    Methods:
    - MAD-based (Median Absolute Deviation)
    - IQR-based (Interquartile Range)
    - Z-score based
    - Quantile-based
    - Otsu's method
    - CUSUM (Cumulative Sum)
    - Hysteresis thresholding
    """

    def __init__(self, config: Optional[ThresholdConfig] = None):
        self.config = config or ThresholdConfig()

    def mad_threshold(
        self,
        data: np.ndarray,
        scale: float = None,
        multiplier: float = None
    ) -> ThresholdResult:
        """
        MAD-based threshold for robust outlier detection.

        MAD is robust to outliers unlike standard deviation.
        """
        scale = scale or self.config.mad_scale
        multiplier = multiplier or self.config.mad_multiplier

        median = np.median(data)
        mad = median_abs_deviation(data)

        # Adjust for normal distribution
        mad_scaled = mad * scale

        threshold = median + multiplier * mad_scaled

        return ThresholdResult(
            threshold=float(threshold),
            method='mad',
            metadata={
                'median': float(median),
                'mad': float(mad),
                'mad_scaled': float(mad_scaled),
                'multiplier': multiplier
            }
        )

    def iqr_threshold(
        self,
        data: np.ndarray,
        multiplier: float = None,
        use_upper: bool = True
    ) -> ThresholdResult:
        """
        IQR-based threshold (Tukey's fences).

        Standard method for outlier detection in box plots.
        """
        multiplier = multiplier or self.config.iqr_multiplier

        q1 = np.percentile(data, 25)
        q3 = np.percentile(data, 75)
        iqr = q3 - q1

        if use_upper:
            threshold = q3 + multiplier * iqr
        else:
            threshold = q1 - multiplier * iqr

        return ThresholdResult(
            threshold=float(threshold),
            method='iqr',
            metadata={
                'q1': float(q1),
                'q3': float(q3),
                'iqr': float(iqr),
                'multiplier': multiplier,
                'fence': 'upper' if use_upper else 'lower'
            }
        )

    def zscore_threshold(
        self,
        data: np.ndarray,
        threshold: float = None
    ) -> ThresholdResult:
        """
        Z-score based threshold.

        Uses mean and standard deviation.
        """
        threshold = threshold or self.config.zscore_threshold

        mean = np.mean(data)
        std = np.std(data)

        thresh_value = mean + threshold * std

        return ThresholdResult(
            threshold=float(thresh_value),
            method='zscore',
            metadata={
                'mean': float(mean),
                'std': float(std),
                'z_threshold': threshold
            }
        )

    def quantile_threshold(
        self,
        data: np.ndarray,
        quantile: float = None
    ) -> ThresholdResult:
        """
        Quantile-based threshold.

        Simple percentile thresholding.
        """
        quantile = quantile or self.config.upper_quantile

        threshold = np.quantile(data, quantile)

        return ThresholdResult(
            threshold=float(threshold),
            method='quantile',
            metadata={'quantile': quantile}
        )

    def otsu_threshold(self, data: np.ndarray, bins: int = 256) -> ThresholdResult:
        """
        Otsu's method for automatic threshold selection.

        Minimizes intra-class variance (maximizes inter-class variance).
        Originally from image processing.
        """
        # Create histogram
        hist, bin_edges = np.histogram(data, bins=bins)
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        # Normalize histogram
        hist = hist.astype(float)
        hist /= hist.sum()

        # Cumulative sums
        cumsum = np.cumsum(hist)
        cumsum_mean = np.cumsum(hist * bin_centers)

        # Global mean
        global_mean = cumsum_mean[-1]

        # Between-class variance
        variance_between = np.zeros(bins)

        for i in range(bins):
            w0 = cumsum[i]
            w1 = 1.0 - w0

            if w0 == 0 or w1 == 0:
                continue

            m0 = cumsum_mean[i] / w0 if w0 > 0 else 0
            m1 = (global_mean - cumsum_mean[i]) / w1 if w1 > 0 else 0

            variance_between[i] = w0 * w1 * (m0 - m1) ** 2

        # Find threshold that maximizes between-class variance
        optimal_idx = np.argmax(variance_between)
        threshold = bin_centers[optimal_idx]

        return ThresholdResult(
            threshold=float(threshold),
            method='otsu',
            metadata={
                'optimal_idx': int(optimal_idx),
                'max_variance': float(variance_between[optimal_idx])
            }
        )

    def triangle_threshold(self, data: np.ndarray, bins: int = 256) -> ThresholdResult:
        """
        Triangle (corner) method for threshold selection.

        Finds the point of maximum distance from a line between
        histogram peak and the furthest end.
        """
        hist, bin_edges = np.histogram(data, bins=bins)
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        # Find peak
        peak_idx = np.argmax(hist)

        # Determine which side has more data
        left_sum = np.sum(hist[:peak_idx])
        right_sum = np.sum(hist[peak_idx:])

        if right_sum > left_sum:
            # Use right side
            search_hist = hist[peak_idx:]
            search_bins = bin_centers[peak_idx:]
            end_idx = len(search_hist) - 1
        else:
            # Use left side
            search_hist = hist[:peak_idx+1]
            search_bins = bin_centers[:peak_idx+1]
            end_idx = 0

        # Line from peak to end
        x1, y1 = 0, search_hist[0]
        x2, y2 = end_idx, search_hist[end_idx]

        # Find maximum perpendicular distance
        distances = []
        for i in range(len(search_hist)):
            x0, y0 = i, search_hist[i]
            # Perpendicular distance from point to line
            d = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
            d /= np.sqrt((y2 - y1)**2 + (x2 - x1)**2) + 1e-10
            distances.append(d)

        optimal_idx = np.argmax(distances)
        threshold = search_bins[optimal_idx]

        return ThresholdResult(
            threshold=float(threshold),
            method='triangle',
            metadata={
                'peak_idx': int(peak_idx),
                'optimal_distance': float(distances[optimal_idx])
            }
        )

    def moment_threshold(self, data: np.ndarray, bins: int = 256) -> ThresholdResult:
        """
        Moment-preserving threshold.

        Threshold that preserves the first three moments of the histogram.
        """
        hist, bin_edges = np.histogram(data, bins=bins)
        bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        # Normalize
        hist = hist.astype(float)
        hist /= hist.sum()

        # Compute moments
        m0 = np.sum(hist)
        m1 = np.sum(bin_centers * hist)
        m2 = np.sum(bin_centers**2 * hist)
        m3 = np.sum(bin_centers**3 * hist)

        # Solve for threshold
        cd = m2 - m1**2
        c0 = (-m1 * m3 + m2 * m2) / cd
        c1 = (m1 * m2 - m3) / cd

        z = m0 / (1 - c1 - np.sqrt(c1**2 - 4 * c0))
        threshold = m1 + z

        return ThresholdResult(
            threshold=float(threshold),
            method='moment',
            metadata={
                'm0': float(m0), 'm1': float(m1),
                'm2': float(m2), 'm3': float(m3)
            }
        )

    def cusum_detect(
        self,
        data: np.ndarray,
        h: float = None,
        k: float = None
    ) -> Tuple[np.ndarray, ThresholdResult]:
        """
        CUSUM (Cumulative Sum) change detection.

        Returns both detection points and threshold info.

        Args:
            h: Decision threshold
            k: Allowance (slack) parameter

        Returns:
            Tuple of (change_points array, ThresholdResult)
        """
        h = h or self.config.cusum_h
        k = k or self.config.cusum_k

        n = len(data)
        mean = np.mean(data)

        # Upper CUSUM
        s_high = np.zeros(n)
        # Lower CUSUM
        s_low = np.zeros(n)

        change_points = []

        for i in range(1, n):
            s_high[i] = max(0, s_high[i-1] + data[i] - mean - k)
            s_low[i] = max(0, s_low[i-1] - data[i] + mean - k)

            if s_high[i] > h or s_low[i] > h:
                change_points.append(i)

        return (
            np.array(change_points),
            ThresholdResult(
                threshold=h,
                method='cusum',
                metadata={
                    'h': h, 'k': k,
                    'n_changes': len(change_points),
                    'mean': float(mean)
                }
            )
        )

    def hysteresis_threshold(
        self,
        data: np.ndarray,
        high_threshold: float = None,
        low_threshold: float = None
    ) -> np.ndarray:
        """
        Hysteresis thresholding for event detection.

        Uses two thresholds to reduce noise:
        - high_threshold: Start event
        - low_threshold: Continue event

        Returns:
            Boolean array indicating event regions
        """
        high = high_threshold or self.config.hysteresis_high
        low = low_threshold or self.config.hysteresis_low

        # Rescale data to [0, 1] for default thresholds
        data_norm = (data - np.min(data)) / (np.max(data) - np.min(data) + 1e-10)

        result = np.zeros(len(data), dtype=bool)
        active = False

        for i in range(len(data)):
            if not active:
                if data_norm[i] > high:
                    active = True
                    result[i] = True
            else:
                if data_norm[i] < low:
                    active = False
                else:
                    result[i] = True

        return result

    def adaptive_threshold(
        self,
        data: np.ndarray,
        method: str = 'mad',
        **kwargs
    ) -> ThresholdResult:
        """
        Adaptive threshold selection.

        Automatically choose and apply threshold method.

        Args:
            method: 'mad', 'iqr', 'zscore', 'quantile', 'otsu', 'triangle', 'moment'
            **kwargs: Method-specific parameters
        """
        methods = {
            'mad': self.mad_threshold,
            'iqr': self.iqr_threshold,
            'zscore': self.zscore_threshold,
            'quantile': self.quantile_threshold,
            'otsu': self.otsu_threshold,
            'triangle': self.triangle_threshold,
            'moment': self.moment_threshold,
        }

        if method not in methods:
            raise ValueError(f"Unknown method: {method}. Choose from {list(methods.keys())}")

        return methods[method](data, **kwargs)

    def multi_method_threshold(
        self,
        data: np.ndarray,
        methods: List[str] = None
    ) -> Tuple[float, List[ThresholdResult]]:
        """
        Compute threshold using multiple methods and return consensus.

        Returns:
            Tuple of (consensus_threshold, list of all results)
        """
        if methods is None:
            methods = ['mad', 'iqr', 'zscore', 'otsu']

        results = []
        for method in methods:
            try:
                result = self.adaptive_threshold(data, method=method)
                results.append(result)
            except Exception as e:
                print(f"Warning: {method} failed: {e}")

        if not results:
            # Fallback
            return float(np.mean(data)), []

        # Consensus: median of all thresholds
        thresholds = [r.threshold for r in results]
        consensus = np.median(thresholds)

        return float(consensus), results


class PeakDetector:
    """
    Peak detection with adaptive thresholding.

    Used for detecting discrete events like taps, peaks in tremor, etc.
    """

    def __init__(self, config: Optional[ThresholdConfig] = None):
        self.config = config or ThresholdConfig()

    def find_peaks_adaptive(
        self,
        data: np.ndarray,
        prominence: float = None,
        distance: int = None,
        width: int = None,
        threshold_method: str = 'mad'
    ) -> Tuple[np.ndarray, dict]:
        """
        Find peaks with adaptive threshold.

        Args:
            data: 1D signal data
            prominence: Minimum peak prominence
            distance: Minimum peak distance
            width: Minimum peak width
            threshold_method: Method for adaptive threshold

        Returns:
            Tuple of (peak_indices, properties_dict)
        """
        prominence = prominence or self.config.peak_prominence
        distance = distance or self.config.peak_distance
        width = width or self.config.peak_width

        # Adaptive height threshold
        thresholder = AdaptiveThresholder(self.config)
        threshold_result = thresholder.adaptive_threshold(data, method=threshold_method)
        height = threshold_result.threshold

        # Find peaks
        peaks, properties = signal.find_peaks(
            data,
            height=height,
            prominence=prominence,
            distance=distance,
            width=width
        )

        properties['threshold_info'] = threshold_result.metadata

        return peaks, properties

    def find_peaks_cwt(
        self,
        data: np.ndarray,
        widths: np.ndarray = None
    ) -> np.ndarray:
        """
        Find peaks using Continuous Wavelet Transform.

        More robust to noise than simple peak finding.
        """
        if widths is None:
            widths = np.arange(1, 20)

        peaks = signal.find_peaks_cwt(data, widths)

        return peaks

    def find_peaks_prominence(
        self,
        data: np.ndarray,
        percentile: float = 90
    ) -> Tuple[np.ndarray, dict]:
        """
        Find peaks using prominence percentile.

        Automatically determines prominence threshold from data distribution.
        """
        # Compute all peaks without prominence filter
        all_peaks, _ = signal.find_peaks(data)

        if len(all_peaks) == 0:
            return np.array([]), {}

        # Compute prominence for all peaks
        prominences = signal.peak_prominences(data, all_peaks)[0]

        # Threshold at percentile
        prom_threshold = np.percentile(prominences, percentile)

        # Filter peaks
        valid_peaks = all_peaks[prominences >= prom_threshold]

        properties = {
            'prominence_threshold': prom_threshold,
            'n_peaks_total': len(all_peaks),
            'n_peaks_selected': len(valid_peaks),
        }

        return valid_peaks, properties


class EventBoundaryDetector:
    """
    Detect boundaries of events using adaptive methods.

    Useful for precise event start/end detection.
    """

    def __init__(self, config: Optional[ThresholdConfig] = None):
        self.config = config or ThresholdConfig()

    def detect_onset_offset(
        self,
        data: np.ndarray,
        threshold_factor: float = 2.0
    ) -> List[Tuple[int, int]]:
        """
        Detect event onset and offset using adaptive threshold.

        Returns:
            List of (start, end) tuples for each event
        """
        # Compute adaptive threshold
        thresholder = AdaptiveThresholder(self.config)
        threshold = thresholder.adaptive_threshold(data, method='mad').threshold

        # Apply hysteresis
        high_thresh = threshold * threshold_factor
        low_thresh = threshold * 0.5

        active = False
        events = []
        start = None

        for i in range(len(data)):
            if not active:
                if data[i] > high_thresh:
                    active = True
                    start = i
            else:
                if data[i] < low_thresh:
                    active = False
                    events.append((start, i))

        # Close final event if still active
        if active and start is not None:
            events.append((start, len(data) - 1))

        return events

    def detect_zero_crossings(
        self,
        data: np.ndarray,
        threshold: float = 0.0
    ) -> np.ndarray:
        """
        Detect zero crossings in signal.

        Useful for detecting oscillations, cycles.
        """
        crossings = np.where(np.diff(np.sign(data - threshold)))[0]
        return crossings

    def detect_slope_changes(
        self,
        data: np.ndarray,
        threshold: float = None
    ) -> np.ndarray:
        """
        Detect significant slope changes.

        Useful for detecting transitions between movement phases.
        """
        # Compute first derivative
        velocity = np.diff(data)

        # Compute second derivative (acceleration)
        acceleration = np.diff(velocity)

        # Threshold for significant change
        if threshold is None:
            threshold = np.std(acceleration) * 2

        # Find indices where acceleration exceeds threshold
        changes = np.where(np.abs(acceleration) > threshold)[0]

        return changes + 1  # Adjust for diff offset


# =============================================================================
# THRESHOLDS_DYNAMIC.PY
# =============================================================================




@dataclass
class PeakDetectionResult:
    """Result of peak detection"""
    peak_indices: np.ndarray
    peak_values: np.ndarray
    peak_prominences: np.ndarray
    peak_widths: np.ndarray
    threshold_used: float


class DynamicProminencePeakDetector:
    """
    Dynamic prominence-based peak detection.

    Features:
    - Sets prominence as function of signal variance (adaptive to amplitude)
    - No fixed threshold - scales with each trial
    - Robust to different movement amplitudes
    """

    def __init__(
        self,
        prominence_factor: float = 0.5,
        min_peak_distance: int = 5,
        width_range: Optional[Tuple[int, int]] = None
    ):
        """
        Args:
            prominence_factor: Prominence = factor * signal_std
            min_peak_distance: Minimum frames between peaks
            width_range: (min_width, max_width) in frames
        """
        self.prominence_factor = prominence_factor
        self.min_peak_distance = min_peak_distance
        self.width_range = width_range

    def detect_peaks(self, sig: np.ndarray) -> PeakDetectionResult:
        """Detect peaks with dynamic prominence"""
        # Compute dynamic prominence threshold
        signal_std = np.std(sig)
        prominence_threshold = self.prominence_factor * signal_std

        # Detect peaks
        peaks, properties = signal.find_peaks(
            sig,
            prominence=prominence_threshold,
            distance=self.min_peak_distance,
            width=self.width_range
        )

        result = PeakDetectionResult(
            peak_indices=peaks,
            peak_values=sig[peaks] if len(peaks) > 0 else np.array([]),
            peak_prominences=properties.get('prominences', np.array([])),
            peak_widths=properties.get('widths', np.array([])),
            threshold_used=prominence_threshold
        )

        return result


class AdaptivePeakDistanceDetector:
    """
    Adaptive peak distance - enforces minimum spacing based on estimated cadence.

    Features:
    - Estimates period/cadence from signal
    - Sets minimum distance = fraction of period
    - Prevents detecting multiple peaks in single cycle
    """

    def __init__(
        self,
        fs: float = 30.0,
        period_fraction: float = 0.5,
        prominence_factor: float = 0.5
    ):
        """
        Args:
            fs: Sampling frequency
            period_fraction: min_distance = period * fraction
            prominence_factor: Dynamic prominence factor
        """
        self.fs = fs
        self.period_fraction = period_fraction
        self.prominence_factor = prominence_factor

    def detect_peaks(self, sig: np.ndarray) -> PeakDetectionResult:
        """Detect peaks with adaptive distance"""
        # Estimate period from dominant frequency
        period = self._estimate_period(sig)

        # Adaptive minimum distance
        min_distance = int(period * self.period_fraction)
        min_distance = max(min_distance, 3)  # At least 3 frames

        # Dynamic prominence
        prominence = self.prominence_factor * np.std(sig)

        # Detect peaks
        peaks, properties = signal.find_peaks(
            sig,
            prominence=prominence,
            distance=min_distance
        )

        result = PeakDetectionResult(
            peak_indices=peaks,
            peak_values=sig[peaks] if len(peaks) > 0 else np.array([]),
            peak_prominences=properties.get('prominences', np.array([])),
            peak_widths=properties.get('widths', np.array([])),
            threshold_used=prominence
        )

        return result

    def _estimate_period(self, sig: np.ndarray) -> float:
        """Estimate period from dominant frequency"""
        if len(sig) < 10:
            return 10.0  # Default

        # FFT to find dominant frequency
        freqs = np.fft.rfftfreq(len(sig), 1/self.fs)
        fft = np.fft.rfft(sig)
        power = np.abs(fft) ** 2

        # Find peak (exclude DC and very low frequencies)
        start_idx = int(0.5 * len(freqs) / (self.fs / 2))
        dominant_idx = start_idx + np.argmax(power[start_idx:])
        dominant_freq = freqs[dominant_idx]

        # Period in frames
        if dominant_freq > 0:
            period = self.fs / dominant_freq
        else:
            period = 10.0

        return period


class QuantileThreshold:
    """
    Quantile-based thresholding - scales with trial amplitude.

    Features:
    - Sets threshold at percentile (e.g., 90th)
    - Automatically adapts to different movement amplitudes
    - No fixed threshold required
    """

    def __init__(self, quantile: float = 0.9):
        """
        Args:
            quantile: Percentile for threshold (0.0 to 1.0)
        """
        self.quantile = quantile

    def compute_threshold(self, sig: np.ndarray) -> float:
        """Compute quantile-based threshold"""
        return np.quantile(sig, self.quantile)

    def apply_threshold(self, sig: np.ndarray) -> Tuple[np.ndarray, float]:
        """
        Apply quantile threshold.

        Returns:
            Binary mask (above threshold) and threshold value
        """
        threshold = self.compute_threshold(sig)
        mask = sig > threshold
        return mask, threshold


class HysteresisThreshold:
    """
    Hysteresis thresholding - dual threshold to prevent flicker.

    Features:
    - High threshold to enter ON state
    - Low threshold to exit ON state
    - Prevents rapid on/off transitions near boundary
    """

    def __init__(
        self,
        high_threshold: Optional[float] = None,
        low_threshold: Optional[float] = None,
        quantile_high: float = 0.7,
        quantile_low: float = 0.3
    ):
        """
        Args:
            high_threshold: Fixed high threshold (or None for adaptive)
            low_threshold: Fixed low threshold (or None for adaptive)
            quantile_high: Quantile for adaptive high threshold
            quantile_low: Quantile for adaptive low threshold
        """
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.quantile_high = quantile_high
        self.quantile_low = quantile_low

    def apply(self, sig: np.ndarray) -> Tuple[np.ndarray, Dict]:
        """
        Apply hysteresis thresholding.

        Returns:
            Binary state sequence and thresholds used
        """
        # Determine thresholds
        if self.high_threshold is None:
            high_thresh = np.quantile(sig, self.quantile_high)
        else:
            high_thresh = self.high_threshold

        if self.low_threshold is None:
            low_thresh = np.quantile(sig, self.quantile_low)
        else:
            low_thresh = self.low_threshold

        # Apply hysteresis
        state = np.zeros(len(sig), dtype=bool)
        current_state = False

        for i in range(len(sig)):
            if current_state:
                # Currently ON - check if drop below low threshold
                if sig[i] < low_thresh:
                    current_state = False
            else:
                # Currently OFF - check if exceed high threshold
                if sig[i] > high_thresh:
                    current_state = True

            state[i] = current_state

        thresholds = {
            'high_threshold': high_thresh,
            'low_threshold': low_thresh
        }

        return state, thresholds


class CUSUMDetector:
    """
    CUSUM (Cumulative Sum) change-point detector.

    Features:
    - Detects shifts in mean/variance
    - Finds motion phase transitions
    - Robust to gradual changes
    """

    def __init__(
        self,
        threshold: float = 5.0,
        drift: float = 0.5,
        reset_after_detection: bool = True
    ):
        """
        Args:
            threshold: Detection threshold (higher = less sensitive)
            drift: Drift parameter (allowable slack)
            reset_after_detection: Reset CUSUM after detection
        """
        self.threshold = threshold
        self.drift = drift
        self.reset_after_detection = reset_after_detection

    def detect_changes(self, sig: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Detect change points.

        Returns:
            Indices of detected changes and CUSUM values
        """
        n = len(sig)

        # Compute mean and std for normalization
        mean = np.mean(sig)
        std = np.std(sig)

        # Normalize signal
        sig_norm = (sig - mean) / (std + 1e-10)

        # CUSUM for upward shifts
        cusum_pos = np.zeros(n)
        # CUSUM for downward shifts
        cusum_neg = np.zeros(n)

        change_points = []

        for i in range(1, n):
            # Update CUSUMs
            cusum_pos[i] = max(0, cusum_pos[i-1] + sig_norm[i] - self.drift)
            cusum_neg[i] = max(0, cusum_neg[i-1] - sig_norm[i] - self.drift)

            # Check for detection
            if cusum_pos[i] > self.threshold or cusum_neg[i] > self.threshold:
                change_points.append(i)

                if self.reset_after_detection:
                    cusum_pos[i] = 0
                    cusum_neg[i] = 0

        change_indices = np.array(change_points)

        # Combine CUSUMs for visualization
        cusum_combined = cusum_pos + cusum_neg

        return change_indices, cusum_combined


class BaselineDriftCorrection:
    """
    Baseline drift correction - removes slow drift.

    Features:
    - High-pass filter or detrending
    - Prevents threshold creep over time
    - Preserves fast dynamics
    """

    def __init__(
        self,
        method: str = 'highpass',
        cutoff: float = 0.5,
        fs: float = 30.0,
        polyorder: int = 2
    ):
        """
        Args:
            method: 'highpass' or 'detrend'
            cutoff: Cutoff frequency for high-pass (Hz)
            fs: Sampling frequency
            polyorder: Polynomial order for detrending
        """
        self.method = method
        self.cutoff = cutoff
        self.fs = fs
        self.polyorder = polyorder

    def apply(self, sig: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Apply baseline correction.

        Returns:
            Corrected signal and estimated baseline
        """
        if self.method == 'highpass':
            # High-pass filter
            sos = signal.butter(2, self.cutoff, 'high', fs=self.fs, output='sos')
            corrected = signal.sosfiltfilt(sos, sig)

            # Baseline = original - corrected
            baseline = sig - corrected

        elif self.method == 'detrend':
            # Polynomial detrending
            x = np.arange(len(sig))
            coeffs = np.polyfit(x, sig, self.polyorder)
            baseline = np.polyval(coeffs, x)
            corrected = sig - baseline

        else:
            # No correction
            corrected = sig
            baseline = np.zeros_like(sig)

        return corrected, baseline


class DynamicThresholdEngine:
    """
    Complete dynamic thresholding system.

    Combines multiple adaptive techniques:
    - Dynamic prominence peak detection
    - Adaptive peak distance
    - Quantile thresholds
    - Hysteresis
    - CUSUM change detection
    - Baseline drift correction
    """

    def __init__(
        self,
        fs: float = 30.0,
        enable_drift_correction: bool = True,
        enable_hysteresis: bool = True
    ):
        self.fs = fs
        self.enable_drift_correction = enable_drift_correction
        self.enable_hysteresis = enable_hysteresis

        # Initialize components
        self.prominence_detector = DynamicProminencePeakDetector()
        self.adaptive_distance_detector = AdaptivePeakDistanceDetector(fs=fs)
        self.quantile_threshold = QuantileThreshold(quantile=0.75)
        self.hysteresis = HysteresisThreshold()
        self.cusum = CUSUMDetector()
        self.drift_corrector = BaselineDriftCorrection(fs=fs)

    def detect_peaks_comprehensive(
        self, sig: np.ndarray, method: str = 'dynamic_prominence'
    ) -> PeakDetectionResult:
        """
        Detect peaks using specified method.

        Args:
            sig: Input signal
            method: 'dynamic_prominence' or 'adaptive_distance'

        Returns:
            Peak detection result
        """
        # Baseline correction
        if self.enable_drift_correction:
            sig_corrected, _ = self.drift_corrector.apply(sig)
        else:
            sig_corrected = sig

        # Detect peaks
        if method == 'dynamic_prominence':
            result = self.prominence_detector.detect_peaks(sig_corrected)
        elif method == 'adaptive_distance':
            result = self.adaptive_distance_detector.detect_peaks(sig_corrected)
        else:
            raise ValueError(f"Unknown method: {method}")

        return result

    def segment_with_hysteresis(self, sig: np.ndarray) -> Tuple[List[Tuple[int, int]], Dict]:
        """
        Segment signal into ON/OFF regions using hysteresis.

        Returns:
            List of (start, end) tuples for ON segments and metadata
        """
        # Baseline correction
        if self.enable_drift_correction:
            sig_corrected, baseline = self.drift_corrector.apply(sig)
        else:
            sig_corrected = sig
            baseline = np.zeros_like(sig)

        # Apply hysteresis
        if self.enable_hysteresis:
            state, thresholds = self.hysteresis.apply(sig_corrected)
        else:
            # Simple threshold
            threshold, _ = self.quantile_threshold.apply_threshold(sig_corrected)
            state = threshold
            thresholds = {'threshold': self.quantile_threshold.compute_threshold(sig_corrected)}

        # Extract segments
        segments = self._extract_segments(state)

        metadata = {
            'thresholds': thresholds,
            'n_segments': len(segments),
            'baseline_drift_corrected': self.enable_drift_correction
        }

        return segments, metadata

    def detect_phase_transitions(self, sig: np.ndarray) -> Tuple[np.ndarray, Dict]:
        """
        Detect motion phase transitions using CUSUM.

        Returns:
            Change point indices and metadata
        """
        # Baseline correction
        if self.enable_drift_correction:
            sig_corrected, _ = self.drift_corrector.apply(sig)
        else:
            sig_corrected = sig

        # CUSUM detection
        change_points, cusum_values = self.cusum.detect_changes(sig_corrected)

        metadata = {
            'n_changes': len(change_points),
            'cusum_threshold': self.cusum.threshold
        }

        return change_points, metadata

    def _extract_segments(self, state: np.ndarray) -> List[Tuple[int, int]]:
        """Extract continuous ON segments from binary state"""
        segments = []
        in_segment = False
        start = 0

        for i in range(len(state)):
            if state[i] and not in_segment:
                # Start of segment
                start = i
                in_segment = True
            elif not state[i] and in_segment:
                # End of segment
                segments.append((start, i - 1))
                in_segment = False

        # Close final segment if needed
        if in_segment:
            segments.append((start, len(state) - 1))

        return segments
