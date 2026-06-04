"""
Signal Processing Core: Photon TOA Generation and Epoch Folding

Implements Non-Homogeneous Poisson Process (NHPP) modeling of photon arrivals
and epoch folding for pulse profile reconstruction.

Mathematical References:
- Emadzadeh & Speyer (2011), Chapters 3-4
- Section 3.4: X-ray pulsar signal models (constant and time-dependent frequency)
- Section 3.6-3.8: Epoch folding algorithm and TOA generation
- Section 4.2-4.3: Pulse delay estimation and CRLB

Author: PulsarNav AI Research Platform
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd


SPEED_OF_LIGHT_KM_S = 299_792.458


@dataclass(frozen=True)
class PulsarProfile:
    """
    Represents the baseline pulse profile of a pulsar.
    
    A pulse profile is the averaged intensity pattern over one rotation period.
    In practice, this is extracted from timing data (e.g., NANOGrav TOA database).
    
    Attributes:
        phase: numpy array of phase values [0, 1), normalized to pulsar period
        intensity: numpy array of intensity values matching phase array
        frequency_hz: pulsar spin frequency at reference epoch (Hz)
        frequency_derivative_hz_s: first time derivative of frequency (Hz/s)
        reference_epoch_mjd: reference time for frequency model (Modified Julian Date)
    """
    
    phase: np.ndarray
    intensity: np.ndarray
    frequency_hz: float
    frequency_derivative_hz_s: float = 0.0
    reference_epoch_mjd: float = 0.0
    
    def __post_init__(self) -> None:
        """Validate profile parameters."""
        if len(self.phase) != len(self.intensity):
            raise ValueError("phase and intensity must have same length")
        if not np.all((self.phase >= 0.0) & (self.phase <= 1.0)):
            raise ValueError("phase values must be in [0, 1)")
        if not np.all(self.intensity >= 0.0):
            raise ValueError("intensity values must be non-negative")
        if self.frequency_hz <= 0.0:
            raise ValueError("frequency_hz must be positive")


def pulsar_rotation_phase(
    time_array_mjd: np.ndarray,
    f0_hz: float,
    f1_hz_s: float,
    pepoch_mjd: float,
) -> np.ndarray:
    """
    Compute pulsar rotation phase at given times.
    
    Implements the standard pulsar timing model for constant and time-dependent frequency:
    
        φ(t) = φ₀ + 2π·f₀·(t - t_epoch) + (π/2)·ḟ·(t - t_epoch)²
        
    where:
    - φ₀ = initial phase at reference epoch
    - f₀ = spin frequency (Hz)
    - ḟ = frequency derivative (Hz/s)
    - t_epoch = reference epoch (MJD)
    
    Reference: Emadzadeh & Speyer (2011), Section 3.4
    
    Args:
        time_array_mjd: times at which to compute phase (MJD)
        f0_hz: pulsar spin frequency (Hz)
        f1_hz_s: frequency derivative (Hz/s)
        pepoch_mjd: reference epoch for timing model (MJD)
        
    Returns:
        phase_rad: rotation phase in radians, unwrapped
    """
    dt = (time_array_mjd - pepoch_mjd) * 86400.0  # convert MJD diff to seconds
    
    # Phase evolution: φ(t) = 2π·[f₀·t + (1/2)·ḟ·t²]
    phase_rad = 2.0 * np.pi * (f0_hz * dt + 0.5 * f1_hz_s * dt**2)
    
    return phase_rad


def pulsar_intensity_at_time(
    time_array_mjd: np.ndarray,
    profile: PulsarProfile,
) -> np.ndarray:
    """
    Evaluate pulsar intensity profile at given times.
    
    Uses the rotation phase to look up intensity from the normalized profile.
    Performs bilinear interpolation for accurate intensity between sample points.
    
    Reference: Emadzadeh & Speyer (2011), Section 3.4
    
    Args:
        time_array_mjd: times at which to evaluate intensity (MJD)
        profile: PulsarProfile containing phase/intensity mapping
        
    Returns:
        intensity: intensity values at specified times
    """
    phase_rad = pulsar_rotation_phase(
        time_array_mjd,
        profile.frequency_hz,
        profile.frequency_derivative_hz_s,
        profile.reference_epoch_mjd,
    )
    
    # Normalize phase to [0, 2π)
    phase_norm = np.mod(phase_rad, 2.0 * np.pi) / (2.0 * np.pi)
    
    # Interpolate intensity at computed phases
    intensity = np.interp(phase_norm, profile.phase, profile.intensity, period=1.0)
    
    return intensity


def generate_photon_toas_nhpp(
    profile: PulsarProfile,
    observation_time_s: float,
    mean_count_rate_hz: float,
    start_mjd: float = 0.0,
    spacecraft_velocity_km_s: np.ndarray | None = None,
    doppler_velocity_component_km_s: float | None = None,
    seed: int | None = None,
) -> np.ndarray:
    """
    Generate photon arrival times (TOAs) using Non-Homogeneous Poisson Process (NHPP).
    
    Models photon arrivals from an X-ray pulsar as an NHPP with time-varying rate
    determined by the pulsar intensity profile. Optionally includes Doppler shift
    due to spacecraft velocity.
    
    Theory:
    --------
    An NHPP with rate function λ(t) produces random arrival times with probability:
    
        P(N(t) = n) = [Λ(t)]ⁿ / n! · exp(-Λ(t))
        
    where Λ(t) = ∫₀ᵗ λ(τ) dτ is the cumulative rate.
    
    For pulsar TOAs, λ(t) = rate_base · intensity_profile(t).
    
    Doppler effect (radial velocity):
    - Observed frequency: f_obs = f_true · (1 - v_r/c) for v_r << c
    - Observed period: P_obs = P_true · (1 + v_r/c)
    - Time delay accumulates: τ_Doppler = (v_r/c) · t
    
    Reference: Emadzadeh & Speyer (2011), Section 3.8
    
    Args:
        profile: PulsarProfile defining the pulse intensity modulation
        observation_time_s: duration of observation window (seconds)
        mean_count_rate_hz: average photon arrival rate (Hz)
        start_mjd: start time of observation (Modified Julian Date)
        spacecraft_velocity_km_s: full 3D velocity vector (optional, for Doppler)
        doppler_velocity_component_km_s: radial velocity component along line-of-sight (optional)
        seed: random seed for reproducibility
        
    Returns:
        toa_array_mjd: photon arrival times (MJD)
        
    Raises:
        ValueError: if parameters are out of physically valid ranges
    """
    rng = np.random.default_rng(seed)
    
    # Validate inputs
    if observation_time_s <= 0.0:
        raise ValueError("observation_time_s must be positive")
    if mean_count_rate_hz < 0.0:
        raise ValueError("mean_count_rate_hz must be non-negative")
    if mean_count_rate_hz == 0.0:
        return np.array([], dtype=float)
    
    # Estimate total number of photons from average rate
    expected_count = int(np.ceil(mean_count_rate_hz * observation_time_s))
    if expected_count == 0:
        return np.array([], dtype=float)
    
    # Over-sample to account for profile modulation
    # (actual count from NHPP will be ~mean_rate * observation_time)
    max_count = int(2.0 * expected_count + 10)
    
    # Generate candidate arrival times uniformly
    u = rng.uniform(0.0, 1.0, size=max_count)
    times_uniform_s = -np.log(u) / mean_count_rate_hz
    
    # Accumulate to get arrival times
    toa_uniform_s = np.cumsum(times_uniform_s)
    
    # Keep only those within observation window
    valid_mask = toa_uniform_s < observation_time_s
    toa_uniform_s = toa_uniform_s[valid_mask]
    
    if len(toa_uniform_s) == 0:
        return np.array([], dtype=float)
    
    # Apply acceptance-rejection: keep photon if u < intensity(t) / intensity_max
    intensities = pulsar_intensity_at_time(
        toa_uniform_s / 86400.0 + start_mjd,
        profile,
    )
    intensity_max = np.max(profile.intensity)
    accept_probs = intensities / intensity_max
    
    u_accept = rng.uniform(0.0, 1.0, size=len(toa_uniform_s))
    accepted_mask = u_accept < accept_probs
    toa_uniform_s = toa_uniform_s[accepted_mask]
    
    if len(toa_uniform_s) == 0:
        return np.array([], dtype=float)
    
    # Convert to MJD
    toa_mjd = toa_uniform_s / 86400.0 + start_mjd
    
    # Apply Doppler shift if specified
    if doppler_velocity_component_km_s is not None and doppler_velocity_component_km_s != 0.0:
        # Doppler effect: τ_obs = τ_true * (1 + v_r/c)
        # For small velocities: Δτ ≈ (v_r/c) · τ
        doppler_factor = doppler_velocity_component_km_s / SPEED_OF_LIGHT_KM_S
        toa_mjd = toa_mjd * (1.0 + doppler_factor)
    
    return np.sort(toa_mjd)


def epoch_fold_toas(
    toa_array_mjd: np.ndarray,
    period_s: float,
    reference_epoch_mjd: float,
    n_bins: int = 64,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Perform epoch folding on a TOA array to reconstruct the pulse profile.
    
    Epoch folding is a fundamental technique in pulsar data analysis that:
    1. Computes the rotation phase of each photon relative to a reference epoch
    2. Bins photons by phase
    3. Reconstructs the time-averaged intensity profile
    
    The reconstructed profile can then be used for:
    - Pulse delay estimation via cross-correlation
    - Assessment of data quality
    - Periodic signal detection
    
    Theory:
    -------
    For each TOA, compute phase:
        φᵢ = 2π · (tᵢ - t_ref) mod P / P
        
    Bin into histogram by phase, then normalize by bin width to get intensity.
    
    Reference: Emadzadeh & Speyer (2011), Section 3.6
    
    Args:
        toa_array_mjd: photon arrival times (MJD)
        period_s: pulsar rotation period (seconds)
        reference_epoch_mjd: reference epoch for phase calculation (MJD)
        n_bins: number of phase bins in reconstructed profile
        
    Returns:
        phase_array: normalized phase values [0, 1)
        intensity_array: binned intensity profile (photon count per bin)
    """
    if len(toa_array_mjd) == 0:
        return np.array([]), np.array([])
    
    # Compute phase for each TOA
    dt_s = (toa_array_mjd - reference_epoch_mjd) * 86400.0
    phase = np.mod(dt_s / period_s, 1.0)
    
    # Bin by phase
    intensity, bin_edges = np.histogram(phase, bins=n_bins, range=(0.0, 1.0))
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2.0
    
    return bin_centers, intensity.astype(float)


def epoch_fold_with_velocity_error(
    toa_array_mjd: np.ndarray,
    nominal_period_s: float,
    reference_epoch_mjd: float,
    velocity_error_km_s: float,
    observation_duration_s: float,
    n_bins: int = 64,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Epoch fold with velocity error: compute profile degradation due to imprecise velocity.
    
    When spacecraft velocity is not known precisely (e.g., ±50 km/s error), the folded
    profile becomes smeared. This method quantifies that degradation.
    
    Physical mechanism:
    - Observed frequency: f_obs ≈ f_true · (1 - v_r/c)
    - If v_r is unknown, used period P_nominal = 1/f_true but true is P_true = P_nominal/(1 - v_r/c)
    - Accumulated phase error over time T: Δφ ≈ 2π · (v_r/c) · T
    - After observation, profile is "stretched" or "compressed" by this amount
    
    Reference: Emadzadeh & Speyer (2011), Section 3.7
    
    Args:
        toa_array_mjd: photon arrival times (MJD)
        nominal_period_s: assumed pulsar period (seconds)
        reference_epoch_mjd: reference epoch (MJD)
        velocity_error_km_s: magnitude of velocity error (km/s)
        observation_duration_s: total observation span (seconds)
        n_bins: number of phase bins
        
    Returns:
        phase_array: phase bin centers [0, 1)
        nominal_profile: profile assuming perfect velocity knowledge
        smeared_profile: profile degraded by velocity error
    """
    
    # Nominal epoch fold (perfect velocity)
    phase_nom, intensity_nom = epoch_fold_toas(
        toa_array_mjd,
        nominal_period_s,
        reference_epoch_mjd,
        n_bins,
    )
    
    # True period due to velocity error
    true_period_s = nominal_period_s / (1.0 + velocity_error_km_s / SPEED_OF_LIGHT_KM_S)
    
    # Accumulated phase error over observation
    max_phase_error = (velocity_error_km_s / SPEED_OF_LIGHT_KM_S) * observation_duration_s / nominal_period_s
    
    # Apply phase error to smearing
    dt_s = (toa_array_mjd - reference_epoch_mjd) * 86400.0
    phase_true = np.mod(dt_s / true_period_s, 1.0)
    
    # Smear by accumulating phase error linearly with time
    phase_error_per_photon = max_phase_error * (dt_s / observation_duration_s)
    phase_smeared = np.mod(phase_true + phase_error_per_photon, 1.0)
    
    intensity_smeared, _ = np.histogram(phase_smeared, bins=n_bins, range=(0.0, 1.0))
    
    return phase_nom, intensity_nom.astype(float), intensity_smeared.astype(float)


def compute_time_to_arrival_model(
    position_km: np.ndarray,
    pulsar_direction: np.ndarray,
    spacecraft_velocity_km_s: np.ndarray | None = None,
) -> float:
    """
    Compute time-of-arrival (TOA) delay due to propagation geometry.
    
    The light travel time from a distant pulsar to the spacecraft depends on:
    1. Spacecraft position component along pulsar direction: r·n̂
    2. Constant-speed light propagation: τ = (r·n̂) / c
    3. Optionally, Doppler effect from radial velocity
    
    This is the core measurement model for pulsar-based navigation.
    
    Theory:
    -------
    Exact time delay:
        τ = |r⃗| cos(θ) / c = (r⃗ · n̂) / c
        
    where θ is angle between position and pulsar direction.
    
    With velocity:
    - Observed frequency: f_obs = f_true · (1 - v_r/c)
    - Frequency derivative: ḟ_obs = ḟ_true · (1 - v_r/c)
    - These create frequency-dependent TOA biases for wideband observations
    
    Reference: Emadzadeh & Speyer (2011), Section 3.2, Chapter 4
    
    Args:
        position_km: spacecraft position [x, y, z] (km)
        pulsar_direction: unit vector pointing to pulsar (assumed normalized)
        spacecraft_velocity_km_s: spacecraft velocity [vx, vy, vz] (km/s, optional)
        
    Returns:
        toa_s: time-of-arrival delay (seconds)
    """
    # Geometric delay
    position_km = np.asarray(position_km, dtype=float)
    pulsar_direction = np.asarray(pulsar_direction, dtype=float)
    
    # Ensure direction is normalized
    pulsar_direction = pulsar_direction / np.linalg.norm(pulsar_direction)
    
    geometric_delay_s = np.dot(position_km, pulsar_direction) / SPEED_OF_LIGHT_KM_S
    
    # Doppler correction (if velocity provided)
    if spacecraft_velocity_km_s is not None:
        spacecraft_velocity_km_s = np.asarray(spacecraft_velocity_km_s, dtype=float)
        radial_velocity_km_s = np.dot(spacecraft_velocity_km_s, pulsar_direction)
        doppler_correction_s = radial_velocity_km_s / SPEED_OF_LIGHT_KM_S**2
        return geometric_delay_s - doppler_correction_s
    
    return geometric_delay_s
