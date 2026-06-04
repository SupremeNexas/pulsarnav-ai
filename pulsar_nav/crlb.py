"""
Cramér–Rao Lower Bound (CRLB) Analysis
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 4, Sections 4.2–4.4; Chapter 5, Section 5.4

Implements:
    - Fisher integral I_p (Eq 4.11)
    - Fisher information matrix for (φ₀, f_o) (Eq 4.10)
    - CRLB for phase estimation (Eq 4.42)
    - CRLB for pulse delay estimation (Eq 4.44)
    - Asymptotic Relative Efficiency (ARE) of CC/NLS estimators (Eq 5.39)
    - Distance accuracy σ (Table 4.1)
"""

from __future__ import annotations

import numpy as np

from .pulsar_catalog import SPEED_OF_LIGHT_M_S
from .signal_model import PulsarProfile


# =====================================================================
# 1. Fisher Integral I_p (Eq 4.11)
# =====================================================================

def fisher_integral_Ip(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (4.11): Fisher integral for phase estimation.

        I_p = ∫₀¹ [λ_s · h'(φ)]² / [λ_b + λ_s · h(φ)] dφ

    This integral determines the achievable accuracy for phase and delay
    estimation. Larger I_p → smaller CRLB → more accurate estimation.

    Args:
        profile: Pulsar profile h(φ).
        lambda_b: Background rate (ph/s).
        lambda_s: Source rate (ph/s).
        n_grid: Numerical integration grid size.

    Returns:
        I_p value.
    """
    phi = np.linspace(0, 1, n_grid, endpoint=False)
    h_vals = profile.h(phi)
    h_deriv = profile.h_derivative(phi)

    numerator = (lambda_s * h_deriv) ** 2
    denominator = lambda_b + lambda_s * h_vals

    # Avoid division by zero
    denominator = np.maximum(denominator, 1e-15)

    return float(np.mean(numerator / denominator))


# =====================================================================
# 2. Fisher Information Matrix (Eq 4.10)
# =====================================================================

def fisher_matrix(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> np.ndarray:
    """
    Eq (4.10): Fisher information matrix for θ = (φ₀, f_o)ᵀ.

        I(θ) = (I_p / 6) · [[6·T_obs, 3·T_obs²],
                              [3·T_obs², 2·T_obs³]]

    Args:
        profile: Pulsar profile.
        lambda_b, lambda_s: Rate parameters.
        T_obs: Observation time (seconds).

    Returns:
        2×2 Fisher matrix.
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    return (Ip / 6.0) * np.array([
        [6.0 * T_obs,     3.0 * T_obs**2],
        [3.0 * T_obs**2,  2.0 * T_obs**3],
    ])


# =====================================================================
# 3. CRLB for Phase Estimation (Eq 4.42)
# =====================================================================

def crlb_phase(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (4.42): CRLB for initial phase φ₀ when f_o is known:

        CRLB(φ₀) = 1 / (T_obs · I_p)

    Returns:
        CRLB value in cycle².
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return float('inf')
    return 1.0 / (T_obs * Ip)


def crlb_matrix(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> np.ndarray:
    """
    Eq (4.12): Full CRLB matrix (inverse of Fisher matrix).

        CRLB(θ) = (2/I_p) · [[2/T_obs, -3/T_obs²],
                               [-3/T_obs², 6/T_obs³]]

    Returns:
        2×2 CRLB matrix.
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return np.full((2, 2), float('inf'))
    return (2.0 / Ip) * np.array([
        [2.0 / T_obs,      -3.0 / T_obs**2],
        [-3.0 / T_obs**2,   6.0 / T_obs**3],
    ])


# =====================================================================
# 4. CRLB for Pulse Delay (Eq 4.44)
# =====================================================================

def crlb_pulse_delay(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    f_2: float,
    T_obs: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (4.44): CRLB for pulse delay t_d (relative navigation, 2 detectors):

        CRLB(t_d) = 2 / (f₂² · T_obs · I_p)

    For absolute navigation (1 detector), the factor is 1 instead of 2.

    Args:
        f_2: Observed frequency at detector 2 (Hz).
        T_obs: Observation time per detector (seconds).

    Returns:
        CRLB value in s².
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return float('inf')
    return 2.0 / (f_2**2 * T_obs * Ip)


def crlb_distance_sigma(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    f_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> float:
    """
    Distance estimation accuracy σ = c · √CRLB(t_d).

    Used for Table 4.1 reproduction.

    Args:
        f_s: Source frequency (Hz). (Assuming f₂ ≈ f_s for small velocities.)
        T_obs: Observation time (seconds).

    Returns:
        σ in meters.
    """
    crlb_td = crlb_pulse_delay(profile, lambda_b, lambda_s, f_s, T_obs, n_grid)
    return SPEED_OF_LIGHT_M_S * np.sqrt(crlb_td)


# =====================================================================
# 5. Asymptotic Relative Efficiency (Eq 5.39–5.42)
# =====================================================================

def asymptotic_relative_efficiency(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (5.39): ARE = var[t̂_d] / CRLB(t_d) for CC/NLS estimators.

        ARE = (∫g₁ · ∫g₃) / (∫g₂)²

    where (Eq 5.40-5.42):
        g₁(φ) = (λ_b + λ_s·h(φ)) · [λ_s·h'(φ)]²
        g₂(φ) = [λ_s·h'(φ)]²
        g₃(φ) = [λ_s·h'(φ)]² / (λ_b + λ_s·h(φ))

    ARE ≥ 1 always (by Cauchy–Schwarz). Equality iff λ_b + λ_s·h(φ) ≡ const,
    which never holds for a non-trivial h(φ).

    Returns:
        ARE value (≥ 1).
    """
    phi = np.linspace(0, 1, n_grid, endpoint=False)
    h_vals = profile.h(phi)
    h_deriv = profile.h_derivative(phi)

    lambda_total = lambda_b + lambda_s * h_vals
    lambda_total = np.maximum(lambda_total, 1e-15)

    ls_hp_sq = (lambda_s * h_deriv) ** 2

    g1 = lambda_total * ls_hp_sq         # Eq 5.40
    g2 = ls_hp_sq                        # Eq 5.41
    g3 = ls_hp_sq / lambda_total         # Eq 5.42

    int_g1 = float(np.mean(g1))
    int_g2 = float(np.mean(g2))
    int_g3 = float(np.mean(g3))

    if int_g2 <= 0:
        return float('inf')

    return (int_g1 * int_g3) / (int_g2 ** 2)


# =====================================================================
# 6. CC/NLS Estimator Variance (Eq 5.9, 5.66)
# =====================================================================

def cc_nls_variance_phase(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (5.66): Asymptotic variance of CC/NLS phase estimator:

        var[φ̂_j] = ∫₀¹ (λ_b+λ_s·h(φ))·[λ_s·h'(φ)]² dφ
                    / [T_obs · (∫₀¹ [λ_s·h'(φ)]² dφ)²]

    Returns:
        Phase variance in cycle².
    """
    phi = np.linspace(0, 1, n_grid, endpoint=False)
    h_vals = profile.h(phi)
    h_deriv = profile.h_derivative(phi)

    lambda_total = lambda_b + lambda_s * h_vals
    ls_hp_sq = (lambda_s * h_deriv) ** 2

    numerator = float(np.mean(lambda_total * ls_hp_sq))
    denominator_integral = float(np.mean(ls_hp_sq))

    if denominator_integral <= 0:
        return float('inf')

    return numerator / (T_obs * denominator_integral**2)


def cc_nls_variance_delay(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    f_2: float,
    T_obs: float,
    n_grid: int = 5000,
) -> float:
    """
    Eq (5.9): Asymptotic variance of CC/NLS pulse delay estimator:

        var[t̂_d] = 2·var[φ̂_j] / f₂²

    Returns:
        Delay variance in s².
    """
    var_phi = cc_nls_variance_phase(profile, lambda_b, lambda_s, T_obs, n_grid)
    return 2.0 * var_phi / f_2**2
