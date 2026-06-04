"""
Epoch Folding — Empirical Profile Reconstruction
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 3, Sections 3.6–3.7

Implements:
    - Epoch folding procedure (Eq 3.39)
    - Noise statistics (Theorem 3.2, Eq 3.40–3.42)
    - Velocity error analysis (Eq 3.59–3.72)
    - Velocity error tolerance bound (Eq 3.72)
"""

from __future__ import annotations

import numpy as np

from .pulsar_catalog import SPEED_OF_LIGHT_M_S
from .signal_model import PulsarProfile, RateFunction


# =====================================================================
# 1. Core Epoch Folding (§3.6)
# =====================================================================

def epoch_fold(
    toas: np.ndarray,
    f_o: float,
    n_bins: int = 1024,
    t_0: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Epoch Folding (§3.6, Eq 3.39).

    All TOAs are folded back into a single pulsar cycle [0, P), divided
    into n_bins equal-length bins. The empirical rate function λ̆(t_i) is
    computed as the normalized bin counts.

    Eq (3.39):
        λ̆(t_i) = (1 / (N_p · T_b)) · Σⱼ cⱼ(t_i)

    Since T_b = P/N_b and N_p = T_obs/P:
        λ̆(t_i) = (N_b / T_obs) · total_counts_in_bin_i

    Args:
        toas: Array of photon times of arrival (seconds).
        f_o: Observed pulsar frequency (Hz). Period P = 1/f_o.
        n_bins: Number of bins N_b per period.
        t_0: Start time (seconds).

    Returns:
        (bin_centers, empirical_rate):
            bin_centers: Phase centers of each bin, in [0, 1).
            empirical_rate: Empirical rate function λ̆(t_i) (ph/s).
    """
    if len(toas) == 0:
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins
        return bin_centers, np.zeros(n_bins)

    T_obs = float(np.max(toas) - t_0)
    if T_obs <= 0:
        T_obs = 1.0

    # Fold phases modulo 1.0 (one pulsar cycle)
    phases = ((toas - t_0) * f_o) % 1.0

    # Histogram into bins
    counts, edges = np.histogram(phases, bins=n_bins, range=(0.0, 1.0))

    # Bin centers in phase
    bin_centers = 0.5 * (edges[:-1] + edges[1:])

    # Normalize to empirical rate function (Eq 3.39)
    # λ̆(t_i) = counts_i · N_b / T_obs
    empirical_rate = counts.astype(float) * n_bins / T_obs

    return bin_centers, empirical_rate


# =====================================================================
# 2. Epoch Folding Noise Statistics (Theorem 3.2)
# =====================================================================

def epoch_folding_noise_variance(
    lambda_values: np.ndarray,
    T_obs: float,
    n_bins: int,
) -> np.ndarray:
    """
    Analytical noise variance of epoch folding (Eq 3.42):
        var[n̆(t_i)] = (N_b / T_obs) · λ(t_i)

    Args:
        lambda_values: True rate function values λ(t_i) at bin centers (ph/s).
        T_obs: Total observation time (seconds).
        n_bins: Number of bins N_b.

    Returns:
        Array of noise variances at each bin center.
    """
    return (n_bins / T_obs) * np.asarray(lambda_values, dtype=float)


def compute_empirical_noise_variance(
    toas_sets: list[np.ndarray],
    f_o: float,
    n_bins: int = 1024,
    t_0: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute empirical noise variance via Monte Carlo.

    For each realization, compute λ̆(t_i), then compute sample variance
    across all realizations.

    Args:
        toas_sets: List of TOA arrays (one per Monte Carlo realization).
        f_o: Observed frequency.
        n_bins: Number of bins.
        t_0: Start time.

    Returns:
        (bin_centers, empirical_variance)
    """
    n_realizations = len(toas_sets)
    all_rates = np.zeros((n_realizations, n_bins))

    for i, toas in enumerate(toas_sets):
        _, emp_rate = epoch_fold(toas, f_o, n_bins, t_0)
        all_rates[i] = emp_rate

    bin_centers = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins
    empirical_var = np.var(all_rates, axis=0)

    return bin_centers, empirical_var


# =====================================================================
# 3. Velocity Error Analysis (§3.7)
# =====================================================================

def frequency_shift_from_velocity_error(
    f_s: float,
    delta_v: float,
) -> float:
    """
    Eq (3.59): Δf_o = f_s · Δv / c

    Args:
        f_s: Source frequency (Hz).
        delta_v: Velocity error (m/s).

    Returns:
        Frequency shift Δf_o (Hz).
    """
    return f_s * delta_v / SPEED_OF_LIGHT_M_S


def period_change_from_velocity_error(
    f_s: float,
    f_o: float,
    delta_v: float,
) -> float:
    """
    Eq (3.61): ΔP = -(f_s / (c · f_o²)) · Δv

    Args:
        f_s: Source frequency (Hz).
        f_o: Observed frequency (Hz).
        delta_v: Velocity error (m/s).

    Returns:
        Period change ΔP (seconds).
    """
    return -(f_s / (SPEED_OF_LIGHT_M_S * f_o**2)) * delta_v


def phase_change_from_velocity_error(delta_v: float) -> float:
    """
    Eq (3.66): Δφ ≈ -(1/c) · Δv

    Args:
        delta_v: Velocity error (m/s).

    Returns:
        Phase change Δφ (cycle).
    """
    return -delta_v / SPEED_OF_LIGHT_M_S


def velocity_error_tolerance(
    n_bins: int,
    n_p: int,
) -> float:
    """
    Eq (3.72): Upper bound on tolerable velocity error:
        Δv < c / (N_b · Ň_p)

    Args:
        n_bins: Number of bins N_b.
        n_p: Number of periods Ň_p = T_obs / P̌.

    Returns:
        Maximum tolerable velocity error (m/s).
    """
    return SPEED_OF_LIGHT_M_S / (n_bins * n_p)


# =====================================================================
# 4. Epoch Folding with Velocity Error (Eq 3.68)
# =====================================================================

def epoch_fold_with_velocity_error(
    rate_func: RateFunction,
    f_o: float,
    T_obs: float,
    delta_v: float,
    n_bins: int = 1024,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Epoch folding in the presence of velocity error (Eq 3.68).

    The velocity error causes a phase drift of Δφ per period, so the
    empirical rate function becomes a deteriorated version of the true one:

        λ̆(t_i) = (1/Ň_p) · Σⱼ λ(t_i; φ₀ + (j-1)·Δφ) + n̆(t_i)

    Args:
        rate_func: RateFunction with true parameters.
        f_o: True observed frequency (Hz).
        T_obs: Observation time (seconds).
        delta_v: Velocity error (m/s).
        n_bins: Number of bins.

    Returns:
        (bin_centers, deteriorated_rate): The noise-free deteriorated rate function.
    """
    P = 1.0 / f_o  # True period
    delta_phi = phase_change_from_velocity_error(delta_v)

    # Perturbed period and number of epochs
    f_s = rate_func.f_s
    delta_f_o = frequency_shift_from_velocity_error(f_s, delta_v)
    f_o_perturbed = f_o + delta_f_o
    P_perturbed = 1.0 / f_o_perturbed
    N_p_perturbed = int(T_obs / P_perturbed)

    if N_p_perturbed <= 0:
        N_p_perturbed = 1

    # Bin centers in time within one perturbed period
    T_b = P_perturbed / n_bins
    bin_centers_phase = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins
    bin_centers_time = bin_centers_phase * P_perturbed

    # Average rate function over all epochs with phase drift (Eq 3.68)
    deteriorated = np.zeros(n_bins)
    for j in range(1, N_p_perturbed + 1):
        shifted_phi_0 = rate_func.phi_0 + (j - 1) * delta_phi
        for i in range(n_bins):
            phase = shifted_phi_0 + bin_centers_phase[i]
            deteriorated[i] += rate_func.lambda_b + rate_func.lambda_s * rate_func.profile.h(phase)

    deteriorated /= N_p_perturbed

    return bin_centers_phase, deteriorated


def noise_variance_with_velocity_error(
    rate_func: RateFunction,
    f_o: float,
    T_obs: float,
    delta_v: float,
    n_bins: int = 1024,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Noise variance with velocity error (Eq 3.70):
        var[n̆(t_i)] = (1/(Ň_p²·Ť_b)) · Σⱼ λ(t_i; φ₀ + (j-1)·Δφ)

    Returns:
        (bin_centers_phase, noise_variance)
    """
    delta_phi = phase_change_from_velocity_error(delta_v)
    delta_f_o = frequency_shift_from_velocity_error(rate_func.f_s, delta_v)
    f_o_perturbed = f_o + delta_f_o
    P_perturbed = 1.0 / f_o_perturbed
    N_p = int(T_obs / P_perturbed)
    if N_p <= 0:
        N_p = 1
    T_b = P_perturbed / n_bins

    bin_centers_phase = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins

    var_n = np.zeros(n_bins)
    for j in range(1, N_p + 1):
        shifted_phi_0 = rate_func.phi_0 + (j - 1) * delta_phi
        for i in range(n_bins):
            phase = shifted_phi_0 + bin_centers_phase[i]
            var_n[i] += rate_func.lambda_b + rate_func.lambda_s * rate_func.profile.h(phase)

    var_n /= (N_p**2 * T_b)

    return bin_centers_phase, var_n
