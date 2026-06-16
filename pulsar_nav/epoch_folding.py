"""
Epoch Folding — Empirical Profile Reconstruction
=================================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 3, Sections 3.6–3.7

Background
----------
A pulsar emits X-ray photons in a periodic, predictable pattern. However,
when we observe from a spacecraft, we see individual photon arrivals (times of
arrival, TOAs) scattered randomly — because photon emission is a Poisson process.

**Epoch Folding** is the technique for recovering the periodic pulse profile
from individual noisy TOAs:

  1. Divide the observation into "epochs" (successive pulse periods P = 1/f_o).
  2. Within each epoch, assign each photon to a phase bin φ = (t mod P) / P ∈ [0, 1).
  3. Sum photon counts in each bin across all epochs (hence "folding" many periods
     on top of each other).
  4. Normalize by time to get an empirical rate function λ̆(φ) in photons/second.

After folding, the empirical profile resembles the true pulse profile h(φ)
(convolved with noise). This folded profile is then passed to the phase estimators
(CC, NLS) to determine the pulse arrival time.

Key Mathematical Result (Eq 3.39):
    λ̆(t_i) = (N_b / T_obs) × total_counts_in_bin_i

where:
    N_b = number of bins per period
    T_obs = total observation time (seconds)

The noise on this estimate has variance (Theorem 3.2, Eq 3.42):
    var[λ̆(t_i)] = (N_b / T_obs) × λ(t_i)

Velocity Errors (§3.7):
    If the spacecraft's velocity is imperfectly known, the assumed folding
    frequency f_o is slightly wrong. This causes a progressive phase drift
    across epochs, smearing the folded profile and degrading the estimate.
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

    Collapses all photon TOAs into a single pulse cycle [0, 1) by computing
    the fractional phase of each photon, then histogramming into n_bins bins.
    The normalized bin counts form the empirical rate function λ̆(t_i).

    Why Fold?
    ---------
    A single pulse period P is typically very short (milliseconds to seconds).
    With a typical X-ray photon rate of ~20 ph/s, a single period yields only
    a handful of photons — far too few to recover the profile shape.

    By folding N_p periods together, we effectively observe N_p × P seconds of
    data in a single period's worth of bins. This dramatically reduces noise
    (noise variance ∝ 1/N_p).

    Phase Calculation:
    ------------------
    The phase of photon i is:
        φ_i = ((t_i - t_0) × f_o) mod 1.0  ∈ [0, 1)

    This maps the arrival time into a fractional position within one period.
    A photon at phase 0.2 arrived at 20% of the way through a pulse period.

    Normalization (Eq 3.39):
    ------------------------
    The raw bin counts C_i are converted to an empirical rate by:
        λ̆(t_i) = C_i × N_b / T_obs

    The factor N_b converts from "counts per bin" to "counts per period",
    and dividing by T_obs gives the equivalent continuous rate in ph/s.

    This is equivalent to Eq 3.39 in the reference:
        λ̆(t_i) = (1 / (N_p · T_b)) · Σⱼ cⱼ(t_i)
    since T_b = P/N_b and N_p = T_obs/P, so N_p · T_b = T_obs/N_b.

    Args:
        toas: Array of photon times of arrival (seconds).
        f_o: Observed pulsar frequency (Hz). Period P = 1/f_o.
            Note: This is the OBSERVED frequency (Doppler-shifted), not the
            source frequency f_s. The Doppler shift accounts for spacecraft velocity.
        n_bins: Number of phase bins N_b per period (resolution of the folded profile).
            Typical values: 128–4096. More bins → finer resolution but more noise
            per bin. The book uses 1024 for numerical experiments.
        t_0: Start time (seconds) used as phase reference. Default: 0.

    Returns:
        A 2-tuple (bin_centers, empirical_rate):
            bin_centers: Phase centers of each bin, uniformly spaced in [0, 1).
                         Shape: (n_bins,). Values: 0.5/N_b, 1.5/N_b, ..., (N_b-0.5)/N_b.
            empirical_rate: Empirical rate function λ̆(t_i) in ph/s.
                            Shape: (n_bins,).
    """
    # Edge case: no photons → return zero profile
    if len(toas) == 0:
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins
        return bin_centers, np.zeros(n_bins)

    # Total observation time from first photon arrival to t_0.
    # Used in the normalization denominator.
    T_obs = float(np.max(toas) - t_0)
    if T_obs <= 0:
        T_obs = 1.0  # Fallback to avoid division by zero

    # ---- Phase Folding ----
    # Compute the fractional phase of each photon in [0, 1)
    # (t_i - t_0) * f_o gives the total number of cycles elapsed since t_0
    # The modulo operation extracts just the fractional cycle (the "phase")
    phases = ((toas - t_0) * f_o) % 1.0

    # ---- Histogram ----
    # Count how many photons fall into each of the n_bins phase bins
    counts, edges = np.histogram(phases, bins=n_bins, range=(0.0, 1.0))

    # Compute the center of each phase bin (midpoint of each bin edge pair)
    bin_centers = 0.5 * (edges[:-1] + edges[1:])

    # ---- Normalization (Eq 3.39) ----
    # Convert raw counts to empirical rate function λ̆(t_i) in ph/s:
    # λ̆(t_i) = C_i × N_b / T_obs
    # Explanation:
    #   - C_i × N_b = "how many photons per period equivalent"
    #   - dividing by T_obs converts to a rate (per second)
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
    Analytical noise variance of the epoch folding estimator (Eq 3.42).

    Since photon arrivals follow a Poisson process, the count in each bin C_i
    has variance equal to its mean: Var[C_i] = E[C_i].

    After the normalization λ̆(t_i) = C_i × N_b / T_obs, the variance becomes:
        var[λ̆(t_i)] = (N_b / T_obs)² × Var[C_i]
                     = (N_b / T_obs)² × (T_obs/N_b) × λ(t_i)
                     = (N_b / T_obs) × λ(t_i)

    This is Eq (3.42) in the book. It shows that:
      - Larger N_b (more bins) → more variance (bins are narrower, fewer photons each)
      - Longer T_obs → less variance (more photons per bin)
      - Higher λ(t_i) → more variance (noisier bins)

    Args:
        lambda_values: True rate function values λ(t_i) at bin centers (ph/s).
            Shape: (n_bins,).
        T_obs: Total observation time (seconds).
        n_bins: Number of bins N_b.

    Returns:
        Array of noise variances (ph/s)² at each bin center. Shape: (n_bins,).
    """
    # Direct application of Eq (3.42): var = (N_b / T_obs) × λ(t_i)
    return (n_bins / T_obs) * np.asarray(lambda_values, dtype=float)


def compute_empirical_noise_variance(
    toas_sets: list[np.ndarray],
    f_o: float,
    n_bins: int = 1024,
    t_0: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute empirical noise variance via Monte Carlo simulation.

    For each Monte Carlo realization (set of simulated TOAs), compute the
    folded profile λ̆(t_i). The sample variance across all realizations gives
    the empirical estimate of the noise variance.

    This is used to VALIDATE the analytical formula (Eq 3.42) — if the
    Monte Carlo variance matches the theoretical prediction, the model is correct.

    Monte Carlo Principle:
    ----------------------
    If we run the experiment N times (N realizations) and get profiles
    λ̆^(1)(t_i), λ̆^(2)(t_i), ..., λ̆^(N)(t_i), then:
        var_empirical[t_i] = (1/N) × Σₙ (λ̆^(n)(t_i) - mean)²

    Args:
        toas_sets: List of TOA arrays. Each entry is one Monte Carlo realization.
        f_o: Observed pulsar frequency (Hz).
        n_bins: Number of phase bins.
        t_0: Start time (seconds).

    Returns:
        A 2-tuple (bin_centers, empirical_variance):
            bin_centers: Phase centers in [0, 1). Shape: (n_bins,).
            empirical_variance: Sample variance of the rate function. Shape: (n_bins,).
    """
    n_realizations = len(toas_sets)

    # Matrix to store folded profiles: rows = realizations, cols = bins
    all_rates = np.zeros((n_realizations, n_bins))

    # Fold each set of TOAs and store the resulting empirical rate function
    for i, toas in enumerate(toas_sets):
        _, emp_rate = epoch_fold(toas, f_o, n_bins, t_0)
        all_rates[i] = emp_rate

    # Compute bin centers uniformly spaced in (0, 1)
    bin_centers = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins

    # Sample variance across all Monte Carlo realizations (axis=0 = across realizations)
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
    Eq (3.59): Frequency shift due to velocity error Δv.

    When epoch folding, we use the OBSERVED frequency f_o = (1 + v/c) × f_s
    to compute the phase of each photon. If our velocity estimate v is wrong
    by Δv, the folding frequency is also wrong by:

        Δf_o = f_s × Δv / c

    This is just the Doppler formula applied to the frequency error.

    Why Does This Matter?
    ---------------------
    If the folding frequency is wrong, the phase assignment for each photon drifts
    further and further as we go through successive periods. After N_p periods, a
    photon is misassigned by N_p × ΔP / P = N_p × Δv × T_obs / (c × P) cycles.
    This "smears" the folded profile and degrades phase estimation.

    Args:
        f_s: Source pulsar frequency at emission (Hz). NOT Doppler-shifted.
        delta_v: Velocity error in spacecraft velocity estimate (m/s).

    Returns:
        Frequency shift Δf_o (Hz). A velocity error of 1 m/s for the Crab pulsar
        (f_s ≈ 30 Hz) gives Δf_o ≈ 30 / 3×10⁸ ≈ 10⁻⁷ Hz.
    """
    # Δf_o = f_s · (Δv / c)
    # This is the linear (first-order) Doppler relationship
    return f_s * delta_v / SPEED_OF_LIGHT_M_S


def period_change_from_velocity_error(
    f_s: float,
    f_o: float,
    delta_v: float,
) -> float:
    """
    Eq (3.61): Period change ΔP due to velocity error.

    Since P = 1/f_o and f_o changes by Δf_o, the assumed period changes by:
        ΔP = -Δf_o / f_o² = -(f_s / (c × f_o²)) × Δv

    The minus sign means a positive velocity error (thinking you're moving
    faster toward the pulsar) gives a smaller assumed period (higher frequency).

    Args:
        f_s: Source frequency (Hz).
        f_o: True observed frequency (Hz).
        delta_v: Velocity error (m/s).

    Returns:
        Period change ΔP (seconds).
    """
    # ΔP = -(f_s / (c · f_o²)) · Δv
    return -(f_s / (SPEED_OF_LIGHT_M_S * f_o**2)) * delta_v


def phase_change_from_velocity_error(delta_v: float) -> float:
    """
    Eq (3.66): Phase drift per epoch due to velocity error.

    The phase drift per period due to a velocity error is (Eq 3.66):
        Δφ = -(1/c) × Δv

    This is derived by showing that after each period, the phase reference
    shifts by Δφ = f_o × ΔP ≈ -Δv/c (using P ≈ P_perturbed for small Δv).

    Physical Meaning:
    -----------------
    If Δv = 3 m/s and c = 3×10⁸ m/s:
        Δφ = -3 / 3×10⁸ = -10⁻⁸ cycles per period

    After 10⁶ periods (~ 10⁴ seconds for a 100 ms pulsar):
        Total phase drift = 10⁻² cycles = 1% of the profile

    This is why velocity must be known to better than ~1 m/s for accurate folding.

    Args:
        delta_v: Velocity error (m/s).

    Returns:
        Phase change Δφ per epoch (cycles). Negative for positive velocity error.
    """
    # Δφ ≈ -(1/c) · Δv
    return -delta_v / SPEED_OF_LIGHT_M_S


def velocity_error_tolerance(
    n_bins: int,
    n_p: int,
) -> float:
    """
    Eq (3.72): Upper bound on tolerable velocity error for epoch folding.

    For epoch folding to work correctly, the total accumulated phase drift
    across all Ň_p periods must be less than half a bin width (1/N_b cycles):

        |Ň_p × Δφ| < 1/N_b
        Ň_p × |Δv| / c < 1/N_b
        |Δv| < c / (N_b × Ň_p)

    This gives the maximum tolerable velocity error. If exceeded, the folded
    profile becomes smeared beyond recovery.

    Example:
    --------
    With N_b = 1024 bins and Ň_p = 1000 periods:
        |Δv| < 3×10⁸ / (1024 × 1000) ≈ 293 m/s

    For longer observations (more periods), the tolerance becomes tighter.

    Args:
        n_bins: Number of bins N_b. More bins → tighter tolerance.
        n_p: Number of complete pulse periods Ň_p in the observation.

    Returns:
        Maximum tolerable velocity error in m/s.
    """
    # Δv_max = c / (N_b × Ň_p)
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
    Noise-free deteriorated folded profile under velocity error (Eq 3.68).

    When velocity error Δv exists, the folding frequency is wrong by Δf_o.
    The spacecraft folds using the PERTURBED frequency f_o' = f_o + Δf_o.
    In each successive epoch j, the profile is shifted by an additional Δφ:

        λ̆(t_i) = (1/Ň_p) × Σⱼ λ(t_i; φ₀ + (j-1)×Δφ) + noise

    This averages the rate function at progressively shifted starting phases.
    If Δφ is small, successive shifts blend neighboring parts of the profile,
    causing broadening/smearing.

    This function computes the NOISE-FREE deteriorated profile (the expectation
    of the folded profile under velocity error), for analytical study of how
    profile smearing depends on velocity error magnitude.

    Args:
        rate_func: RateFunction containing the true pulsar profile and rate parameters.
        f_o: True observed frequency (Hz). The perturbed frequency is derived internally.
        T_obs: Total observation time (seconds).
        delta_v: Velocity error (m/s). Positive = we think we're moving faster toward the pulsar.
        n_bins: Number of phase bins.

    Returns:
        A 2-tuple (bin_centers_phase, deteriorated_rate):
            bin_centers_phase: Phase bin centers in [0, 1). Shape: (n_bins,).
            deteriorated_rate: Noise-free deteriorated empirical rate. Shape: (n_bins,).
    """
    # True period P = 1/f_o
    P = 1.0 / f_o

    # Phase drift per period due to velocity error (Eq 3.66)
    delta_phi = phase_change_from_velocity_error(delta_v)

    # Compute perturbed (wrong) folding frequency and period
    f_s = rate_func.f_s                             # Source frequency
    delta_f_o = frequency_shift_from_velocity_error(f_s, delta_v)  # Frequency error
    f_o_perturbed = f_o + delta_f_o                 # Incorrectly assumed frequency
    P_perturbed = 1.0 / f_o_perturbed               # Incorrectly assumed period

    # Number of perturbed periods that fit in T_obs
    N_p_perturbed = int(T_obs / P_perturbed)
    if N_p_perturbed <= 0:
        N_p_perturbed = 1  # Need at least one period

    # Bin centers in phase [0, 1) and corresponding times within one perturbed period
    T_b = P_perturbed / n_bins                      # Duration of each bin in the perturbed folding
    bin_centers_phase = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins
    bin_centers_time = bin_centers_phase * P_perturbed  # Not used directly but conceptually helpful

    # ---- Compute deteriorated profile (Eq 3.68) ----
    # For each epoch j (1 to N_p_perturbed):
    #   The starting phase is shifted from the true φ₀ by (j-1) × Δφ
    #   Evaluate the true rate function at this shifted phase and accumulate
    deteriorated = np.zeros(n_bins)
    for j in range(1, N_p_perturbed + 1):
        # Shifted starting phase for epoch j
        shifted_phi_0 = rate_func.phi_0 + (j - 1) * delta_phi
        for i in range(n_bins):
            # Evaluate rate at bin i with the shifted starting phase
            phase = shifted_phi_0 + bin_centers_phase[i]
            deteriorated[i] += rate_func.lambda_b + rate_func.lambda_s * rate_func.profile.h(phase)

    # Average across all epochs to get the deteriorated (smeared) mean profile
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
    Noise variance of the epoch folding estimator with velocity error (Eq 3.70).

    With velocity error, the noise variance in each bin is still determined by
    the Poisson statistics of photon counts, but now each epoch j uses a shifted
    profile. The variance per bin integrates these shifted contributions:

        var[n̆(t_i)] = (1 / (Ň_p² × Ť_b)) × Σⱼ λ(t_i; φ₀ + (j-1)×Δφ)

    This shows that velocity error doesn't change the noise CHARACTER (still
    Poisson), but the noise LEVEL is still determined by the true rate, averaged
    across the epochs.

    Args:
        rate_func: True RateFunction.
        f_o: True observed frequency (Hz).
        T_obs: Observation time (seconds).
        delta_v: Velocity error (m/s).
        n_bins: Number of phase bins.

    Returns:
        A 2-tuple (bin_centers_phase, noise_variance):
            bin_centers_phase: Phase bin centers in [0, 1). Shape: (n_bins,).
            noise_variance: Variance of the folded rate function per bin. Shape: (n_bins,).
    """
    # Compute velocity-error-related frequency and period perturbations
    delta_phi = phase_change_from_velocity_error(delta_v)
    delta_f_o = frequency_shift_from_velocity_error(rate_func.f_s, delta_v)
    f_o_perturbed = f_o + delta_f_o
    P_perturbed = 1.0 / f_o_perturbed

    # Number of periods and bin duration with perturbed frequency
    N_p = int(T_obs / P_perturbed)
    if N_p <= 0:
        N_p = 1
    T_b = P_perturbed / n_bins  # Bin duration in the perturbed folding

    bin_centers_phase = np.linspace(0, 1, n_bins, endpoint=False) + 0.5 / n_bins

    # ---- Compute noise variance (Eq 3.70) ----
    # Numerator: sum of λ(t_i; shifted phase) across all epochs
    # Denominator: N_p² × T_b (from the normalization of the rate estimator)
    var_n = np.zeros(n_bins)
    for j in range(1, N_p + 1):
        shifted_phi_0 = rate_func.phi_0 + (j - 1) * delta_phi
        for i in range(n_bins):
            phase = shifted_phi_0 + bin_centers_phase[i]
            # True rate at this phase (from the actual pulsar, not the folding model)
            var_n[i] += rate_func.lambda_b + rate_func.lambda_s * rate_func.profile.h(phase)

    # Divide by (N_p)² × T_b to get the variance per bin
    var_n /= (N_p**2 * T_b)

    return bin_centers_phase, var_n
