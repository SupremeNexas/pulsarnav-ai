"""
Cramér–Rao Lower Bound (CRLB) Analysis
=======================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 4, Sections 4.2–4.4; Chapter 5, Section 5.4

What Is the CRLB?
-----------------
The Cramér–Rao Lower Bound (CRLB) is a fundamental theorem in statistics
that gives the MINIMUM variance any unbiased estimator can achieve.

Formally, for estimating a parameter θ from observations:
    Var[θ̂] ≥ CRLB(θ) = 1 / I(θ)

where I(θ) is the Fisher Information. No unbiased estimator can do better than this.

In pulsar navigation, we want to estimate:
  - The initial phase φ₀ (fractional pulse period at t=0)
  - The pulse time delay t_d (how much the pulse is delayed vs. a reference)
  - The spacecraft position r (derived from t_d via r = c × t_d / n̂)

The CRLB tells us: given a certain observation time T_obs and a certain
pulsar brightness, what is the BEST POSSIBLE accuracy for our estimate?

Why Is CRLB Important for Navigation?
--------------------------------------
1. **Design Trade-offs**: CRLB shows how T_obs, λ_s, λ_b, and profile shape
   trade off against position accuracy. E.g., doubling T_obs halves the variance.

2. **Performance Benchmark**: We can compare actual estimator performance
   (from Monte Carlo) to CRLB to measure estimator efficiency.
   An efficient estimator achieves: Var[θ̂] = CRLB(θ).

3. **Table 4.1 Reproduction**: The book's Table 4.1 shows position accuracy
   σ = c × √CRLB(t_d) for each of the 8 book pulsars vs. observation time.

Fisher Integral I_p:
--------------------
All CRLB formulas in this module depend on a single key integral:

    I_p = ∫₀¹ [λ_s · h'(φ)]² / [λ_b + λ_s · h(φ)] dφ    (Eq 4.11)

This is the Fisher information from one second of observation. It captures:
  - h'(φ)²: The steepness of the pulse profile — sharper edges → higher I_p
  - λ_s²:   Signal strength squared — brighter source → higher I_p
  - 1/λ: Inverse of the total rate — more background → lower I_p (more noise)

The CRLB for phase estimation (1 second of observation) is then 1/I_p.
For T_obs seconds: CRLB(φ₀) = 1/(T_obs × I_p).

Asymptotic Relative Efficiency (ARE):
--------------------------------------
The CC/NLS estimators operate on epoch-folded profiles (bins), not raw TOAs.
This introduces additional inefficiency compared to MLE (which uses raw TOAs).

    ARE = Var[t̂_d (CC/NLS)] / CRLB(t_d) ≥ 1     (Eq 5.39)

ARE = 1 would mean CC/NLS is as good as MLE. In practice ARE > 1, meaning
CC/NLS requires longer observation or brighter pulsars to match MLE accuracy.
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
    Eq (4.11): Compute the Fisher integral I_p for phase estimation.

    I_p = ∫₀¹ [λ_s · h'(φ)]² / [λ_b + λ_s · h(φ)] dφ

    This integral is the key building block for all CRLB formulas in this module.
    It measures how much information about the initial phase φ₀ is contained
    in a one-second observation of the pulsar.

    Derivation Sketch:
    ------------------
    For a Poisson process with rate λ(φ), the log-likelihood of observing a
    photon is log λ(φ). The Fisher information about the phase shift φ₀ is:

        I(φ₀) = ∫ [∂ log λ / ∂φ₀]² · λ dφ
               = ∫ [λ_s · h'(φ) / λ(φ)]² · λ dφ
               = ∫ [λ_s · h'(φ)]² / λ(φ) dφ

    This is Eq (4.11) from the book.

    Physical Interpretation:
    ------------------------
    - h'(φ)² term: How rapidly the profile changes — a sharper pulse has a
      steeper slope, making it easier to pinpoint the exact pulse timing.
      A flat (constant) profile has h'=0 everywhere → I_p=0 → no timing info.

    - λ_s² term: Signal photons carry the timing information. More source
      photons → more timing information.

    - 1/λ(φ) = 1/(λ_b + λ_s·h(φ)): The photon noise level at each phase.
      More background noise dilutes the signal.

    Numerical Method:
    -----------------
    The integral is approximated as a Riemann sum over a fine grid of n_grid
    uniformly spaced phase values in [0, 1). For n_grid=5000, the quadrature
    error is negligible for typical smooth profiles.

    Args:
        profile: PulsarProfile object providing h(φ) and h'(φ) = dh/dφ.
        lambda_b: Background photon rate (ph/s). Constant across all phases.
        lambda_s: Source photon rate (ph/s). Modulated by h(φ).
        n_grid: Number of integration grid points. Default: 5000.

    Returns:
        I_p value (dimensionless). Larger → smaller CRLB → better achievable accuracy.
        I_p = 0 would mean the profile carries no timing information (impossible for
        a non-trivial periodic profile).
    """
    # Uniformly spaced phase values in [0, 1)
    phi = np.linspace(0, 1, n_grid, endpoint=False)

    # Evaluate normalized profile h(φ) and its derivative h'(φ) on the grid
    h_vals = profile.h(phi)         # Shape: (n_grid,), values in [0, ~large]
    h_deriv = profile.h_derivative(phi)  # Shape: (n_grid,)

    # Numerator: [λ_s · h'(φ)]² — squared signal gradient
    numerator = (lambda_s * h_deriv) ** 2

    # Denominator: λ_b + λ_s · h(φ) = total rate at each phase
    denominator = lambda_b + lambda_s * h_vals

    # Avoid division by zero (rate should always be > 0, but guard for safety)
    denominator = np.maximum(denominator, 1e-15)

    # Numerical integration via mean (equivalent to 1/n_grid × sum, which approximates
    # ∫₀¹ f(φ) dφ ≈ (1/n_grid) × Σ f(φᵢ) for uniform spacing)
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

    When we observe for T_obs seconds, we estimate both the initial phase φ₀
    AND the observed frequency f_o simultaneously. The joint Fisher information
    matrix captures how well each can be estimated and their correlation.

    The full Fisher matrix (for estimating both φ₀ and f_o) is (Eq 4.10):

        I(θ) = (I_p / 6) × [[6·T_obs,     3·T_obs²],
                              [3·T_obs²,   2·T_obs³]]

    Key Observations:
    -----------------
    1. Both diagonal elements grow with T_obs (more time → more information).
    2. The off-diagonal terms are non-zero → φ₀ and f_o are correlated estimators.
    3. The matrix structure arises from the polynomial phase model:
       φ(t) = φ₀ + f_o · t. The products of time-varying terms generate the
       T_obs², T_obs³ factors through integration.

    This matrix is the inverse of the CRLB matrix (Eq 4.12):
        CRLB(θ) = I(θ)⁻¹

    Args:
        profile: PulsarProfile for computing I_p.
        lambda_b, lambda_s: Rate parameters (ph/s).
        T_obs: Observation time (seconds).
        n_grid: Integration grid size.

    Returns:
        2×2 Fisher information matrix. Shape: (2, 2).
        Units: [1/cycle²] for the (0,0) element, [s/cycle²] and [s²/cycle²] for others.
    """
    # Compute the Fisher integral (the fundamental building block)
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)

    # Construct the 2×2 Fisher matrix from Eq (4.10)
    # The structure comes from integrating the squared gradient of log λ(t)
    # with respect to φ₀ and f_o over [0, T_obs]
    return (Ip / 6.0) * np.array([
        [6.0 * T_obs,     3.0 * T_obs**2],   # Row for φ₀
        [3.0 * T_obs**2,  2.0 * T_obs**3],   # Row for f_o
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
    Eq (4.42): CRLB for initial phase estimation when f_o is KNOWN.

    If the observed frequency f_o is known exactly (e.g., corrected for
    Doppler using precise velocity), the CRLB for estimating only φ₀ is:

        CRLB(φ₀) = 1 / (T_obs · I_p)

    This is simpler than the 2-parameter case because knowing f_o removes
    the uncertainty from the estimation problem — we only need to find φ₀.

    How CRLB Scales:
    ----------------
    - CRLB ∝ 1/T_obs: Doubling observation time halves variance (halves σ²)
    - CRLB ∝ 1/I_p: Brighter pulsars (more λ_s), sharper profiles (more |h'|),
      lower backgrounds (less λ_b) all increase I_p and decrease CRLB.

    Example for Crab Pulsar (from Table 4.1):
        λ_s = 15 ph/s, λ_b = 5 ph/s, T_obs = 1000 s
        I_p ≈ 0.3 (approximate value)
        CRLB(φ₀) = 1/(1000 × 0.3) ≈ 3.3 × 10⁻³ cycle²
        σ_φ = √CRLB ≈ 0.058 cycles
        σ_distance = c/(f_s) × σ_φ ≈ 3×10⁸/(30) × 0.058 ≈ 580 km

    Args:
        profile: PulsarProfile.
        lambda_b, lambda_s: Rate parameters (ph/s).
        T_obs: Observation time (seconds).
        n_grid: Integration grid size.

    Returns:
        CRLB in cycle² (variance of the optimal phase estimator).
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return float('inf')   # No timing information → infinite variance
    return 1.0 / (T_obs * Ip)


def crlb_matrix(
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    T_obs: float,
    n_grid: int = 5000,
) -> np.ndarray:
    """
    Eq (4.12): Full CRLB matrix for joint estimation of (φ₀, f_o)ᵀ.

    This is the inverse of the Fisher matrix (Eq 4.10):

        CRLB(θ) = I(θ)⁻¹ = (2/I_p) × [[2/T_obs,    -3/T_obs²],
                                          [-3/T_obs²,  6/T_obs³]]

    The off-diagonal elements are NEGATIVE: this means φ₀ and f_o estimates are
    negatively correlated. If you think the frequency is higher than it is, you
    tend to estimate the initial phase as lower.

    Args:
        profile, lambda_b, lambda_s, T_obs, n_grid: See crlb_phase().

    Returns:
        2×2 CRLB matrix. CRLB[0,0] = var(φ₀), CRLB[1,1] = var(f_o).
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return np.full((2, 2), float('inf'))
    return (2.0 / Ip) * np.array([
        [2.0 / T_obs,      -3.0 / T_obs**2],   # φ₀ row
        [-3.0 / T_obs**2,   6.0 / T_obs**3],   # f_o row
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
    Eq (4.44): CRLB for pulse time delay estimation t_d.

    The pulse delay t_d is related to the phase difference by:
        t_d = (φ₁ - φ₂) / f₂

    For RELATIVE navigation (2 detectors):
        CRLB(t_d) = 2 × CRLB(φ₀) / f₂²
                  = 2 / (f₂² × T_obs × I_p)

    The factor of 2 arises because t_d is estimated from the DIFFERENCE of
    two independent phase estimates (one per detector), each with variance 1/(T_obs·I_p).
    Adding independent variances: Var[φ₁ - φ₂] = 2 × Var[φ₁].

    Navigation Accuracy:
    --------------------
    The position accuracy along the pulsar direction is:
        σ_x = c × σ_t_d = c × √CRLB(t_d)

    For f_s ≈ 30 Hz (Crab) and T_obs = 1000 s:
        CRLB(t_d) = 2 / (30² × 1000 × 0.3) ≈ 7.4 × 10⁻⁶ s²
        σ_t_d = 2.7 ms
        σ_x = 3×10⁵ km/s × 2.7×10⁻³ s ≈ 810 km

    For Absolute Navigation (1 detector vs. SSB):
        CRLB(t_d) = 1 / (f₂² × T_obs × I_p)
        (factor of 1 instead of 2)

    Args:
        profile: PulsarProfile.
        lambda_b, lambda_s: Rate parameters (ph/s).
        f_2: Observed frequency at detector 2 (Hz). For relative navigation.
        T_obs: Observation time per detector (seconds).
        n_grid: Integration grid size.

    Returns:
        CRLB value in s² (variance of the optimal pulse delay estimator).
    """
    Ip = fisher_integral_Ip(profile, lambda_b, lambda_s, n_grid)
    if Ip <= 0:
        return float('inf')
    # Factor of 2 for relative navigation (two independent phase estimates are combined)
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
    Distance estimation accuracy σ = c × √CRLB(t_d) (meters).

    This converts the pulse delay CRLB into position accuracy along the
    pulsar direction, which is the quantity tabulated in Table 4.1.

    Example values from Table 4.1:
        Crab (f_s ≈ 30 Hz, T_obs = 1000 s): σ ≈ 700–1500 km
        B0531+21 millisecond pulsar: σ much smaller due to higher f_s

    For X-ray navigation:
        - Faster pulsars (larger f_s) → smaller CRLB → better accuracy
        - Brighter pulsars (larger λ_s) → better accuracy
        - Sharper profiles (more structured h(φ)) → better accuracy

    Args:
        profile, lambda_b, lambda_s: Pulsar model.
        f_s: Source frequency (Hz). Used as f_2 ≈ f_s for small velocities.
        T_obs: Observation time (seconds).
        n_grid: Integration grid size.

    Returns:
        Position accuracy σ in meters (1-sigma, along pulsar direction).
    """
    # Get the CRLB for pulse delay timing
    crlb_td = crlb_pulse_delay(profile, lambda_b, lambda_s, f_s, T_obs, n_grid)

    # Convert from timing variance (s²) to distance (m) using σ_x = c × σ_t
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
    Eq (5.39): Asymptotic Relative Efficiency (ARE) for CC/NLS estimators.

    The MLE achieves the CRLB asymptotically. The CC/NLS estimators operate
    on binned (epoch-folded) data and are sub-optimal relative to MLE.

    ARE is defined as:
        ARE = Var[t̂_d (CC/NLS)] / CRLB(t_d)

    ARE ≥ 1 always (by the Cauchy-Schwarz inequality).
    ARE = 1 would mean CC/NLS is as efficient as MLE.

    Analytical Formula (Eq 5.39):
    -----------------------------
    ARE = (∫g₁ dφ × ∫g₃ dφ) / (∫g₂ dφ)²

    where the integrands are (Eq 5.40–5.42):
        g₁(φ) = (λ_b + λ_s·h(φ)) × [λ_s·h'(φ)]²   — signal weighted by rate
        g₂(φ) = [λ_s·h'(φ)]²                         — pure signal gradient squared
        g₃(φ) = [λ_s·h'(φ)]² / (λ_b + λ_s·h(φ))   — Fisher integrand = I_p integrand

    This expression follows from the general formula for the ARE of an estimator
    based on a sufficient statistic vs. the MLE.

    Mathematical Insight:
    ---------------------
    By the Cauchy-Schwarz inequality:
        (∫g₁)(∫g₃) ≥ (∫g₂)²    (always)

    Equality holds iff g₁ ∝ g₃, i.e., λ_b + λ_s·h(φ) = constant.
    This only happens if h(φ) is constant (flat profile) — which means no
    timing information at all! So for any non-trivial h(φ), ARE > 1.

    Interpretation:
    ---------------
    If ARE = 1.5, then CC/NLS needs 1.5× more observation time than MLE
    to achieve the same position accuracy. This is the "cost" of using
    binned profiles instead of raw TOAs.

    Args:
        profile: PulsarProfile.
        lambda_b, lambda_s: Rate parameters (ph/s).
        n_grid: Integration grid size.

    Returns:
        ARE value ≥ 1. Closer to 1 → CC/NLS is more efficient.
    """
    phi = np.linspace(0, 1, n_grid, endpoint=False)
    h_vals = profile.h(phi)
    h_deriv = profile.h_derivative(phi)

    # Total rate λ(φ) = λ_b + λ_s × h(φ), clamped to avoid division by zero
    lambda_total = lambda_b + lambda_s * h_vals
    lambda_total = np.maximum(lambda_total, 1e-15)

    # [λ_s × h'(φ)]²: squared signal gradient (appears in all three integrands)
    ls_hp_sq = (lambda_s * h_deriv) ** 2

    # Compute the three integrands (Eq 5.40–5.42)
    g1 = lambda_total * ls_hp_sq          # Eq (5.40): rate × squared gradient
    g2 = ls_hp_sq                          # Eq (5.41): pure squared gradient
    g3 = ls_hp_sq / lambda_total          # Eq (5.42): Fisher integrand I_p

    # Numerical integration via mean (1/n_grid × sum ≈ ∫₀¹ g dφ)
    int_g1 = float(np.mean(g1))
    int_g2 = float(np.mean(g2))
    int_g3 = float(np.mean(g3))

    # Guard against pathological profiles where int_g2 = 0 (flat h'=0)
    if int_g2 <= 0:
        return float('inf')

    # ARE formula (Eq 5.39): Cauchy-Schwarz ratio
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
    Eq (5.66): Asymptotic variance of the CC/NLS phase estimator.

    The variance of the CC/NLS phase estimate (for large T_obs, many photons)
    converges to:

        Var[φ̂] = ∫₀¹ (λ_b + λ_s·h(φ)) × [λ_s·h'(φ)]² dφ
                  / [T_obs × (∫₀¹ [λ_s·h'(φ)]² dφ)²]

    Derivation:
    -----------
    This comes from the delta method applied to the CC/NLS cost function.
    The numerator ∫g₁ dφ is the noise variance in the cross-correlation,
    and the denominator (∫g₂ dφ)² is the "signal strength" — how sharply
    the cost function peaks at the true phase.

    Equivalently: Var[φ̂] = ARE × CRLB(φ₀) = ARE / (T_obs × I_p)

    So the CC/NLS variance is always ≥ CRLB, with the ARE factor quantifying
    the sub-optimality of using binned rather than raw photon data.

    Args:
        profile, lambda_b, lambda_s, T_obs, n_grid: See other functions.

    Returns:
        Phase variance in cycle² (standard deviation is √Var[φ̂] in cycles).
    """
    phi = np.linspace(0, 1, n_grid, endpoint=False)
    h_vals = profile.h(phi)
    h_deriv = profile.h_derivative(phi)

    # Total rate λ(φ) at each phase point
    lambda_total = lambda_b + lambda_s * h_vals

    # [λ_s × h'(φ)]²: the squared signal gradient
    ls_hp_sq = (lambda_s * h_deriv) ** 2

    # Numerator: ∫ λ(φ) × [λ_s·h'(φ)]² dφ (integral of rate × signal gradient)
    numerator = float(np.mean(lambda_total * ls_hp_sq))

    # Denominator integrand: ∫ [λ_s·h'(φ)]² dφ
    denominator_integral = float(np.mean(ls_hp_sq))

    if denominator_integral <= 0:
        return float('inf')  # Flat profile → no timing information

    # Final formula: Var[φ̂] = numerator / [T_obs × (denominator_integral)²]
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
    Eq (5.9): Asymptotic variance of the CC/NLS pulse delay estimator.

    The pulse delay is estimated from the phase difference of two independent
    phase estimates:
        t̂_d = (φ̂₁ - φ̂₂) / f₂

    Since φ₁ and φ₂ are independent with identical variance Var[φ̂]:
        Var[t̂_d] = Var[φ̂₁ - φ̂₂] / f₂²
                  = 2 × Var[φ̂] / f₂²

    The factor of 2 reflects that subtracting two independent uncertain
    quantities doubles the variance.

    Args:
        profile, lambda_b, lambda_s, T_obs, n_grid: See cc_nls_variance_phase().
        f_2: Observed frequency at detector 2 (Hz).

    Returns:
        Delay variance in s². Standard deviation σ_t_d = √Var[t̂_d] in seconds.
    """
    # Get the phase variance from the CC/NLS formula
    var_phi = cc_nls_variance_phase(profile, lambda_b, lambda_s, T_obs, n_grid)

    # Convert from cycle² to s²: factor of 2 for two detectors, divide by f₂²
    return 2.0 * var_phi / f_2**2
