"""
Pulse Delay Estimation — CC, NLS, and MLE
==========================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 5: CC and NLS via Epoch Folding
    Chapter 6: MLE via Direct Use of TOAs

Overview
--------
To navigate with pulsars, we need to accurately estimate the PULSE DELAY t_d —
the difference in pulse arrival times between two detectors (or between one
detector and the Solar System Barycenter).

The pulse delay relates to spacecraft position via (Eq 4.43):
    t_d = (r₁ - r₂) · n̂ / c

where r₁, r₂ are the positions of the two detectors and n̂ is the pulsar direction.

All estimation methods first estimate the INITIAL PHASE φ₀ independently for
each detector, then compute the pulse delay from the phase difference:
    t̂_d = (φ̂₁ - φ̂₂) / f₂   (Eq 4.43/5.1)

Three Estimators are Implemented:
----------------------------------

1. **CC (Cross Correlation)** [Chapter 5, §5.2]:
   - Folds photon TOAs into a histogram (epoch folding)
   - Finds the phase shift that maximizes cross-correlation with the true template
   - Fast: uses FFT for O(N log N) computation
   - Works well for sharp, high-SNR profiles

2. **NLS (Nonlinear Least Squares)** [Chapter 5, §5.3]:
   - Folds photon TOAs into a histogram (epoch folding)
   - Finds the phase shift that minimizes squared residuals vs. true template
   - Grid search followed by local scalar minimization
   - More robust than CC for asymmetric or noisy profiles

3. **MLE (Maximum Likelihood Estimator)** [Chapter 6]:
   - Uses raw photon TOAs directly — no epoch folding needed
   - Maximizes the log-likelihood function over the phase grid
   - Achieves the CRLB asymptotically (optimal for large N)
   - More computationally intensive than CC/NLS

Key Principle:
--------------
All estimators share the same underlying idea: the true phase φ₀ is the value
that makes the OBSERVED photon arrival pattern most consistent with the KNOWN
pulsar profile h(φ). The methods differ in HOW they measure consistency:
  - CC: maximize correlation (inner product)
  - NLS: minimize squared residuals (L² distance)
  - MLE: maximize log-likelihood (statistically optimal)
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize_scalar

from .signal_model import PulsarProfile, RateFunction
from .epoch_folding import epoch_fold


# =====================================================================
# Result Data Containers
# =====================================================================

@dataclass
class PhaseEstimateResult:
    """
    Result from a phase estimator (CC, NLS, or MLE).

    Contains the estimated phase and optional diagnostic information
    about the cost function, for visualization and validation.
    """
    phi_hat: float                     # Estimated initial phase φ̂₀ (cycles, in [0, 1))
    cost_function: np.ndarray | None = None   # Values of cost function at each grid point
    cost_grid: np.ndarray | None = None       # Phase grid where cost was evaluated
    cpu_time_s: float = 0.0                   # Computation time in seconds


@dataclass
class DelayEstimateResult:
    """
    Result from a full pulse delay estimation pipeline.

    Contains the estimated pulse delay t̂_d and the individual phase
    estimates for each detector.
    """
    td_hat: float         # Estimated pulse delay t̂_d (seconds)
    phi1_hat: float       # Phase estimate from detector 1 (cycles)
    phi2_hat: float       # Phase estimate from detector 2 (cycles)
    cpu_time_s: float = 0.0    # Total computation time (seconds)


# =====================================================================
# 1. Cross Correlation (CC) Estimator — §5.2
# =====================================================================

class CrossCorrelationEstimator:
    """
    Cross Correlation (CC) phase estimator (§5.2, §5.6.2).

    Principle:
    ----------
    The cross-correlation between the empirical rate function λ̆(φ) and the
    true template λ(φ; ψ) is maximized when the template phase ψ matches
    the true initial phase φ₀. The estimator is therefore:

        φ̂ = -argmax_{ψ} R_D(ψ)    (Eq 5.7)

    where R_D(ψ) is the cross-correlation function (Eq 5.72):
        R_D(ψ) = (1/N_b) Σₖ x₁(k) · x₂(k; ψ)

    with x₁ = true template (shifted by ψ) and x₂ = empirical rate (mean-subtracted).

    FFT Implementation (Eq 5.73):
    -----------------------------
    Cross-correlation in the time domain is equivalent to multiplication in the
    frequency domain (Convolution Theorem):
        R_D(ψ) = F⁻¹{X₁(fₖ) · X₂*(fₖ)} / N_b

    This makes CC computation O(N_b log N_b) using the FFT — much faster than
    the O(N_b²) naive implementation.

    Sub-bin Resolution (Eq 5.76):
    ------------------------------
    The discrete CC function peaks at the nearest bin. Parabolic interpolation
    around the peak gives sub-bin phase resolution without a finer grid:
        subsample = -0.5 × (R_next - R_prev) / (R_next - 2R_curr + R_prev)

    This is the standard "parabolic peak interpolation" technique.
    """

    @staticmethod
    def estimate_phase(
        empirical_rate: np.ndarray,
        profile: PulsarProfile,
        lambda_b: float,
        lambda_s: float,
        return_cost: bool = False,
    ) -> PhaseEstimateResult:
        """
        Estimate initial phase φ̂₀ via cross-correlation with the true template.

        Args:
            empirical_rate: Empirical rate function λ̆(φ) from epoch folding.
                Shape: (n_bins,). Values in ph/s.
            profile: True pulsar profile h(φ).
            lambda_b: Background rate (ph/s).
            lambda_s: Source rate (ph/s).
            return_cost: If True, return the full CC function R_D(ψ) for plotting.

        Returns:
            PhaseEstimateResult with φ̂₀ in [0, 1) cycles.
        """
        t_start = time.perf_counter()
        n_bins = len(empirical_rate)

        # ---- Build True Template at Bin Centers ----
        # The template is the expected rate function λ(φ; ψ=0) for initial phase 0
        # (we will find ψ that matches the observed profile, then φ̂ = -ψ)
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False)
        true_template = lambda_b + lambda_s * profile.h(bin_centers)

        # ---- Remove DC Component (Mean Subtraction) ----
        # Cross-correlation of zero-mean signals focuses on the SHAPE (AC component)
        # rather than the overall level. The mean of h(φ) integrated over [0,1) is 1
        # (by normalization), so the mean of the template is λ_b + λ_s.
        x1 = true_template - np.mean(true_template)
        x2 = empirical_rate - np.mean(empirical_rate)

        # ---- FFT-Based Cross-Correlation (Eq 5.73) ----
        # R_D(ψ) = IFFT{FFT(x₁) × conj(FFT(x₂))} / N_b
        # This computes the circular cross-correlation R_D for all shifts simultaneously
        X1 = np.fft.fft(x1)   # Fourier transform of true template
        X2 = np.fft.fft(x2)   # Fourier transform of empirical rate
        R_D = np.real(np.fft.ifft(X1 * np.conj(X2))) / n_bins

        # ---- Find Peak (Coarse Maximum) ----
        # The shift km that maximizes R_D is the best integer-bin phase estimate
        km = int(np.argmax(R_D))

        # ---- Sub-bin Parabolic Interpolation (Eq 5.76) ----
        # Use the three points around the maximum to fit a parabola and find
        # the fractional bin offset that maximizes the parabola
        km_prev = (km - 1) % n_bins   # Previous bin (wrap around if km=0)
        km_next = (km + 1) % n_bins   # Next bin (wrap around if km=N_b-1)

        R_prev = R_D[km_prev]
        R_curr = R_D[km]
        R_next = R_D[km_next]

        # Parabola denominator (second difference); if ~0, peak is flat and subsample=0
        denom = R_next - 2.0 * R_curr + R_prev
        if abs(denom) > 1e-12:
            # Subsample offset: how far from km is the true parabola maximum?
            subsample = -0.5 * (R_next - R_prev) / denom
        else:
            subsample = 0.0   # Peak is very flat; no sub-bin interpolation

        # ---- Convert Shift to Phase Estimate ----
        # The shift ψ that maximizes R_D gives the phase offset between template and data.
        # Eq (5.7): φ̂ = -ψ̂ (note the sign: argmax gives the shift needed to align
        # the template to the data; the initial phase is the negative of this shift)
        psi_hat = (km + subsample) / n_bins   # Fractional phase shift ψ̂ in [0, 1)
        phi_hat = float((-psi_hat) % 1.0)     # Initial phase φ̂₀ = -ψ̂ (mod 1)

        cpu_time = time.perf_counter() - t_start

        return PhaseEstimateResult(
            phi_hat=phi_hat,
            cost_function=R_D if return_cost else None,
            cost_grid=np.linspace(0, 1, n_bins, endpoint=False) if return_cost else None,
            cpu_time_s=cpu_time,
        )


# =====================================================================
# 2. Nonlinear Least Squares (NLS) Estimator — §5.3
# =====================================================================

class NLSEstimator:
    """
    Nonlinear Least Squares (NLS) phase estimator (§5.3, §5.6.3).

    Principle:
    ----------
    Find the phase shift φ̂₀ that makes the true template λ(φ + φ₀) most similar
    to the empirical rate function λ̆(φ), in the least-squares sense:

        φ̂₀ = argmin_{φ ∈ [0,1)} J(φ)   (Eq 5.48)

    where J(φ) = Σᵢ (λ̆(φᵢ) - λ(φᵢ + φ))²            (Eq 5.47)

    Implementation:
    ---------------
    1. **Grid Search**: Evaluate J(φ) at n_grid uniformly spaced phase values.
       This ensures we find the global minimum (J can have many local minima).
    2. **Local Refinement**: Use scipy's bounded scalar minimization (Brent's method)
       in a narrow interval around the grid best. This achieves sub-grid resolution.

    Comparison to CC:
    -----------------
    NLS is conceptually similar to CC but uses an L² distance instead of a
    cross-correlation. For symmetric Gaussian-like profiles, CC ≈ NLS.
    For asymmetric or multi-peaked profiles, NLS can be more robust.

    Both CC and NLS are sub-optimal compared to MLE because they operate on
    the histogrammed (epoch-folded) data rather than raw TOAs.
    """

    @staticmethod
    def estimate_phase(
        empirical_rate: np.ndarray,
        profile: PulsarProfile,
        lambda_b: float,
        lambda_s: float,
        n_grid: int = 1024,
        return_cost: bool = False,
    ) -> PhaseEstimateResult:
        """
        Estimate initial phase via nonlinear least squares.

        Args:
            empirical_rate: Empirical rate function λ̆(φ). Shape: (n_bins,).
            profile: True pulsar profile h(φ).
            lambda_b, lambda_s: Rate parameters (ph/s).
            n_grid: Number of phase grid points for the coarse search.
                Higher → less chance of missing the global minimum, but slower.
            return_cost: If True, return the full J(φ) cost function.

        Returns:
            PhaseEstimateResult with φ̂₀ in [0, 1) cycles.
        """
        t_start = time.perf_counter()
        n_bins = len(empirical_rate)

        # Bin center phases where the empirical rate is evaluated
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False)

        # ---- Grid Search Over Phase [0, 1) ----
        # Evaluate the NLS cost function J(φ) at n_grid uniformly spaced phases
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        J_values = np.zeros(n_grid)

        for k, phi in enumerate(phi_search):
            # Shift the true template by phase φ: λ(φᵢ + φ)
            model = lambda_b + lambda_s * profile.h(bin_centers + phi)
            # NLS cost: sum of squared differences between empirical and model rates
            J_values[k] = float(np.sum((empirical_rate - model) ** 2))

        # Identify the phase with the smallest cost (global minimum candidate)
        best_idx = int(np.argmin(J_values))
        best_phi = phi_search[best_idx]

        # ---- Local Refinement (Sub-grid Resolution) ----
        # Use Brent's method to find the minimum more precisely in a narrow interval
        # around the grid best. This can find the exact minimum to machine precision.
        def nls_cost(p):
            model = lambda_b + lambda_s * profile.h(bin_centers + p)
            return float(np.sum((empirical_rate - model) ** 2))

        # Search within ±1 grid step of the coarse minimum
        margin = 1.0 / n_grid
        res = minimize_scalar(
            nls_cost,
            bounds=(best_phi - margin, best_phi + margin),
            method="bounded",   # Brent's method with bounds
        )
        if res.success:
            best_phi = float(res.x) % 1.0   # Ensure result stays in [0, 1)

        cpu_time = time.perf_counter() - t_start

        return PhaseEstimateResult(
            phi_hat=best_phi,
            cost_function=J_values if return_cost else None,
            cost_grid=phi_search if return_cost else None,
            cpu_time_s=cpu_time,
        )


# =====================================================================
# 3. Maximum Likelihood Estimator (MLE) — Chapter 6
# =====================================================================

class MaximumLikelihoodEstimator:
    """
    Maximum Likelihood Estimator (MLE) via direct use of photon TOAs (§6.2).

    Principle:
    ----------
    Instead of binning the TOAs (epoch folding), the MLE works directly with
    the individual photon arrival times. For a NHPP with rate λ(t; φ₀), the
    log-likelihood function is (Eq 6.5):

        Ψ(φ₀) = Σᵢ ln(λ(tᵢ; φ₀)) - ∫₀^T_obs λ(t; φ₀) dt

    The second term (integrated rate Λ) doesn't depend strongly on φ₀ for
    long observations and can be dropped (Eq 6.4, discussed below Eq 6.4):

        Ψ(φ₀) ≈ Σᵢ ln(λ(tᵢ; φ₀))

    The MLE estimate is: φ̂₀ = argmax_{φ₀ ∈ [0,1)} Ψ(φ₀)

    Why MLE is Optimal:
    -------------------
    The MLE uses ALL the information in the data — every individual photon
    contributes. By contrast, CC/NLS aggregate photons into bins, discarding
    within-bin timing information. As N → ∞ (long observations), MLE achieves
    the Cramér-Rao Lower Bound.

    Computational Trick:
    --------------------
    Notice that ln(λ(tᵢ; φ₀)) = ln(λ_b + λ_s · h(f_o · tᵢ + φ₀))

    The phases f_o · tᵢ (mod 1) can be precomputed once, then for each candidate
    φ₀, we just shift and evaluate h. This makes the inner loop fast.

    Note: MLE is slower than CC/NLS (especially for short observations with many
    photons) but achieves better accuracy — the trade-off between compute and precision.
    """

    @staticmethod
    def estimate_phase(
        toas: np.ndarray,
        f_o: float,
        profile: PulsarProfile,
        lambda_b: float,
        lambda_s: float,
        n_grid: int = 1024,
        return_cost: bool = False,
    ) -> PhaseEstimateResult:
        """
        Estimate initial phase via maximum likelihood using raw photon TOAs.

        Grid search over [0, 1) with n_grid=1024 (§6.7.1), followed by Brent's
        method for sub-grid refinement.

        Note on the Λ(φ) term (Eq 6.3–6.4):
        The full log-likelihood includes the integrated rate Λ(T_obs; φ₀):
            full LLF = Σᵢ ln λ(tᵢ; φ₀) - Λ(T_obs; φ₀)
        For large T_obs, the integrated rate becomes approximately:
            Λ ≈ T_obs × (λ_b + λ_s)
        which is INDEPENDENT of φ₀ (because h integrates to 1 over one period).
        Therefore, the Λ term doesn't shift the argmax and can be safely dropped.

        Args:
            toas: Photon times of arrival (seconds). Shape: (n_photons,).
            f_o: Observed frequency (Hz). Used to compute photon phases.
            profile: True pulsar profile h(φ).
            lambda_b, lambda_s: Rate parameters (ph/s).
            n_grid: Phase grid size for coarse search.
            return_cost: If True, return Ψ(φ) values for plotting.

        Returns:
            PhaseEstimateResult with φ̂₀ in [0, 1) cycles.
        """
        t_start = time.perf_counter()

        # Edge case: no photons → return dummy estimate
        if len(toas) == 0:
            return PhaseEstimateResult(phi_hat=0.0, cpu_time_s=0.0)

        # ---- Precompute Photon Phases ----
        # The phase of each photon: (t_i × f_o) mod 1
        # This wraps each photon's time into the range [0, 1) (one pulse period)
        # Independent of the unknown φ₀ — precomputing saves work in the inner loop
        phases_at_toas = (toas * f_o) % 1.0

        # ---- Grid Search (§6.7.1: 1024-point grid) ----
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        psi_values = np.zeros(n_grid)

        for k, phi in enumerate(phi_search):
            # Evaluate the rate at each photon's location with candidate phase φ:
            #   λ(tᵢ; φ) = λ_b + λ_s × h(phases_at_toas + φ)
            # Note: phases_at_toas + phi might exceed 1; h() handles periodicity.
            rates = lambda_b + lambda_s * profile.h(phases_at_toas + phi)

            # Guard against log(0) which would occur if rate = 0 (physically impossible
            # for positive λ_b, but may happen due to numerical issues)
            rates = np.maximum(rates, 1e-15)

            # Log-likelihood: Ψ(φ) = Σᵢ ln(λ(tᵢ; φ))
            psi_values[k] = float(np.sum(np.log(rates)))

        # Find the phase with the HIGHEST log-likelihood (global maximum)
        best_idx = int(np.argmax(psi_values))
        best_phi = phi_search[best_idx]

        # ---- Local Refinement with Brent's Method ----
        # Minimize the NEGATIVE log-likelihood (since minimize_scalar minimizes)
        def neg_llf(p):
            rates = lambda_b + lambda_s * profile.h(phases_at_toas + p)
            rates = np.maximum(rates, 1e-15)
            return -float(np.sum(np.log(rates)))

        margin = 1.0 / n_grid   # Search within ±1 grid step
        res = minimize_scalar(
            neg_llf,
            bounds=(best_phi - margin, best_phi + margin),
            method="bounded",
        )
        if res.success:
            best_phi = float(res.x) % 1.0

        cpu_time = time.perf_counter() - t_start

        return PhaseEstimateResult(
            phi_hat=best_phi,
            cost_function=psi_values if return_cost else None,
            cost_grid=phi_search if return_cost else None,
            cpu_time_s=cpu_time,
        )


# =====================================================================
# 4. Pulse Delay Estimation (Eq 4.43 / 5.1)
# =====================================================================

def estimate_pulse_delay(
    phi1_hat: float,
    phi2_hat: float,
    f_2: float,
) -> float:
    """
    Eq (4.43) / (5.1): Estimate the pulse delay from two phase estimates.

    Navigation Geometry:
    --------------------
    For two detectors at positions r₁ and r₂, the pulse from a distant pulsar
    arrives with a time delay:
        t_d = (r₁ - r₂) · n̂ / c

    This delay corresponds to a phase difference:
        Δφ = t_d × f₂     (fractional cycles)

    So inversely:
        t̂_d = (φ̂₁ - φ̂₂) / f₂

    Phase Ambiguity (The Wrapping Problem):
    ----------------------------------------
    Phases are only known modulo 1 cycle. The true delay t_d could be
    N + Δφ cycles for any integer N. Without additional information,
    only the fractional cycle portion of the delay is directly recoverable.

    For navigation purposes, we assume the delay is in the range (-P/2, P/2)
    (where P = 1/f₂ is the pulse period), so |t_d| < P/2. This is valid
    when the position error is smaller than c/2 × P (the half-wavelength).

    Phase Difference Handling:
    ---------------------------
    (φ̂₁ - φ̂₂) mod 1 gives a value in [0, 1).
    If this is > 0.5, the shortest path around the circle is negative:
        subtract 1 to get a value in [-0.5, 0)
    This gives the signed phase difference in (-0.5, 0.5].

    Args:
        phi1_hat: Estimated initial phase at detector 1 (cycles, in [0, 1)).
        phi2_hat: Estimated initial phase at detector 2 (cycles, in [0, 1)).
        f_2: Observed frequency at detector 2 (Hz).

    Returns:
        Estimated pulse delay t̂_d in seconds. Range: approximately (-P/2, P/2).
    """
    # Compute phase difference, taking the short path around the [0,1) circle
    delta_phi = (phi1_hat - phi2_hat) % 1.0

    # If delta_phi > 0.5, the true shift is "going the other way" around the circle
    # (e.g., a shift of 0.8 cycles is equivalent to -0.2 cycles)
    if delta_phi > 0.5:
        delta_phi -= 1.0   # Map [0.5, 1) → [-0.5, 0)

    # Convert from phase (cycles) to time (seconds): t_d = Δφ / f₂
    return delta_phi / f_2


# =====================================================================
# 5. Full Delay Estimation Pipeline
# =====================================================================

def run_delay_estimation(
    toas_1: np.ndarray,
    toas_2: np.ndarray,
    f_o_1: float,
    f_o_2: float,
    profile: PulsarProfile,
    lambda_b: float,
    lambda_s: float,
    n_bins: int = 1024,
    n_grid: int = 1024,
    method: str = "cc",
) -> DelayEstimateResult:
    """
    Full pulse delay estimation pipeline: TOAs → phases → delay.

    Pipeline Steps:
    ---------------
    For CC and NLS:
      1. Epoch fold detector 1 TOAs → empirical rate λ̆₁(φ)
      2. Epoch fold detector 2 TOAs → empirical rate λ̆₂(φ)
      3. Estimate phase φ̂₁ from λ̆₁ using CC or NLS
      4. Estimate phase φ̂₂ from λ̆₂ using CC or NLS
      5. Compute t̂_d = (φ̂₁ - φ̂₂) / f₂

    For MLE:
      1. Estimate phase φ̂₁ directly from toas_1 (no folding!)
      2. Estimate phase φ̂₂ directly from toas_2
      3. Compute t̂_d = (φ̂₁ - φ̂₂) / f₂

    Why Different Frequencies (f_o_1 vs f_o_2)?
    --------------------------------------------
    If the two detectors have different velocities relative to the pulsar,
    they see different Doppler-shifted frequencies. The folding frequency
    must match the observed frequency at each detector to avoid phase drift.

    Args:
        toas_1, toas_2: Photon TOAs from detectors 1 and 2.
        f_o_1, f_o_2: Observed frequencies at detectors 1 and 2 (Hz).
        profile: True pulsar profile h(φ).
        lambda_b, lambda_s: Rate parameters (ph/s).
        n_bins: Number of epoch folding bins (for CC/NLS).
        n_grid: Number of grid points for phase search.
        method: "cc" (cross-correlation), "nls" (nonlinear least squares),
                or "mle" (maximum likelihood via direct TOAs).

    Returns:
        DelayEstimateResult with pulse delay, phases, and timing info.

    Raises:
        ValueError: If method is not one of "cc", "nls", "mle".
    """
    t_start = time.perf_counter()

    if method.lower() == "mle":
        # MLE uses raw TOAs directly — no epoch folding step needed
        r1 = MaximumLikelihoodEstimator.estimate_phase(
            toas_1, f_o_1, profile, lambda_b, lambda_s, n_grid
        )
        r2 = MaximumLikelihoodEstimator.estimate_phase(
            toas_2, f_o_2, profile, lambda_b, lambda_s, n_grid
        )
    else:
        # CC and NLS both start with epoch folding to create binned profiles
        _, emp_rate_1 = epoch_fold(toas_1, f_o_1, n_bins)
        _, emp_rate_2 = epoch_fold(toas_2, f_o_2, n_bins)

        if method.lower() == "cc":
            # Cross-correlation phase estimator
            r1 = CrossCorrelationEstimator.estimate_phase(
                emp_rate_1, profile, lambda_b, lambda_s
            )
            r2 = CrossCorrelationEstimator.estimate_phase(
                emp_rate_2, profile, lambda_b, lambda_s
            )
        elif method.lower() == "nls":
            # Nonlinear least squares phase estimator
            r1 = NLSEstimator.estimate_phase(
                emp_rate_1, profile, lambda_b, lambda_s, n_grid
            )
            r2 = NLSEstimator.estimate_phase(
                emp_rate_2, profile, lambda_b, lambda_s, n_grid
            )
        else:
            raise ValueError(f"Unknown method '{method}'. Use 'cc', 'nls', or 'mle'.")

    # Compute the pulse delay from the two phase estimates
    td_hat = estimate_pulse_delay(r1.phi_hat, r2.phi_hat, f_o_2)
    cpu_time = time.perf_counter() - t_start

    return DelayEstimateResult(
        td_hat=td_hat,
        phi1_hat=r1.phi_hat,
        phi2_hat=r2.phi_hat,
        cpu_time_s=cpu_time,
    )


# =====================================================================
# 6. Monte Carlo Estimation (for validation)
# =====================================================================

def monte_carlo_phase_rms(
    rate_func: RateFunction,
    f_o: float,
    T_obs: float,
    true_phi: float,
    method: str = "cc",
    n_realizations: int = 500,
    n_bins: int = 1024,
    n_grid: int = 1024,
    seed: int = 42,
) -> float:
    """
    Monte Carlo RMS phase estimation error for a given estimator.

    Runs n_realizations independent photon-generation + estimation experiments.
    For each:
      1. Generate random photon TOAs using the NHPP simulator
      2. Estimate the initial phase with the chosen method
      3. Compute the phase error (true_phi - phi_hat), handling wrapping

    Then computes the Root Mean Squared Error (RMSE) across all realizations.

    Purpose:
    --------
    Monte Carlo RMSE can be compared to:
      - CRLB: Is the estimator efficient? (RMSE ≈ √CRLB means YES)
      - Analytical CC/NLS variance: Does the closed-form formula predict the MC result?

    This is the numerical validation procedure described in §5.6.4 of the book.

    Phase Error Calculation (Eq 5.77):
    ------------------------------------
    Phase errors must account for wrapping (periodicity of the phase circle).
    The shortest signed distance between two phases is:
        |e| = min(|φ₀ - φ̂₀| mod 1,  |φ̂₀ - φ₀| mod 1)

    E.g., if true φ₀ = 0.95 and φ̂₀ = 0.02, the raw difference is 0.93,
    but the shorter path around the circle is 0.07. The error is 0.07.

    Args:
        rate_func: RateFunction defining λ_b, λ_s, f_s, and the profile.
        f_o: Observed frequency (Hz) for folding and estimation.
        T_obs: Observation duration (seconds). Longer → more photons → smaller error.
        true_phi: True initial phase φ₀ (cycles, in [0, 1)).
        method: "cc", "nls", or "mle".
        n_realizations: Number of Monte Carlo trials. More → more accurate RMSE estimate.
        n_bins: Number of epoch folding bins (for CC/NLS).
        n_grid: Number of phase search grid points.
        seed: Master RNG seed.

    Returns:
        RMSE in cycles. Multiply by c/f_s to convert to meters for Table 4.1 comparison.
    """
    from .signal_model import generate_photon_toas

    errors_sq = []   # Squared phase errors across all realizations
    rng = np.random.default_rng(seed)

    # Extract signal parameters from the RateFunction
    profile = rate_func.profile
    lambda_b = rate_func.lambda_b
    lambda_s = rate_func.lambda_s

    for i in range(n_realizations):
        # ---- Generate Random Photon TOAs ----
        # Each realization uses a different RNG seed (derived from the master seed)
        # to ensure statistically independent trials
        toas = generate_photon_toas(rate_func, f_o, T_obs, seed=rng.integers(0, 2**31))

        # Skip realizations with no photons (very low rate, short observation)
        if len(toas) == 0:
            continue

        # ---- Estimate Phase ----
        if method.lower() == "mle":
            result = MaximumLikelihoodEstimator.estimate_phase(
                toas, f_o, profile, lambda_b, lambda_s, n_grid
            )
        else:
            # Epoch fold the TOAs into a binned profile
            _, emp_rate = epoch_fold(toas, f_o, n_bins)
            if method.lower() == "cc":
                result = CrossCorrelationEstimator.estimate_phase(
                    emp_rate, profile, lambda_b, lambda_s
                )
            elif method.lower() == "nls":
                result = NLSEstimator.estimate_phase(
                    emp_rate, profile, lambda_b, lambda_s, n_grid
                )
            else:
                raise ValueError(f"Unknown method: {method}")

        # ---- Compute Phase Error with Wraparound Correction (Eq 5.77) ----
        # Two ways to measure the distance on the phase circle:
        e1 = (true_phi - result.phi_hat) % 1.0   # Forward distance
        e2 = (result.phi_hat - true_phi) % 1.0   # Backward distance
        error = min(e1, e2)    # Take the shorter arc length

        errors_sq.append(error ** 2)   # Accumulate squared error for RMSE

    # If no valid realizations (all had zero photons), return infinity
    if not errors_sq:
        return float('inf')

    # RMSE = √(mean of squared errors)
    return float(np.sqrt(np.mean(errors_sq)))
