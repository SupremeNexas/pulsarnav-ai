"""
Pulse Delay Estimation — CC, NLS, and MLE
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 5: CC and NLS via Epoch Folding
    Chapter 6: MLE via Direct Use of TOAs

Implements:
    - Cross Correlation (CC) estimator (§5.2, Eq 5.7–5.76)
    - Nonlinear Least Squares (NLS) estimator (§5.3, Eq 5.47–5.48)
    - Maximum Likelihood Estimator (MLE) (§6.2, Eq 6.5–6.18)
    - Pulse delay estimation (Eq 4.43/5.1)
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize_scalar

from .signal_model import PulsarProfile, RateFunction
from .epoch_folding import epoch_fold


# =====================================================================
# Result container
# =====================================================================

@dataclass
class PhaseEstimateResult:
    """Result from a phase estimator."""
    phi_hat: float        # Estimated initial phase (cycle)
    cost_function: np.ndarray | None = None  # Cost function values
    cost_grid: np.ndarray | None = None      # Phase grid
    cpu_time_s: float = 0.0                  # Computation time


@dataclass
class DelayEstimateResult:
    """Result from a pulse delay estimator."""
    td_hat: float         # Estimated pulse delay (seconds)
    phi1_hat: float       # Phase estimate on detector 1
    phi2_hat: float       # Phase estimate on detector 2
    cpu_time_s: float = 0.0


# =====================================================================
# 1. Cross Correlation (CC) Estimator — §5.2
# =====================================================================

class CrossCorrelationEstimator:
    """
    Cross Correlation (CC) phase estimator (§5.2, §5.6.2).

    Estimates initial phase by maximizing the cross-correlation between
    the empirical rate function and the true template.

    Eq (5.7): φ̂_j = -argmax_ψ R_j(ψ)
    Eq (5.72): R_D(ψ) = (1/N_b) Σₖ x₁(kT_b)·x₂(kT_b;ψ)
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
        Estimate phase using cross-correlation.

        Args:
            empirical_rate: Empirical rate function from epoch folding.
            profile: True pulsar profile.
            lambda_b, lambda_s: Rate parameters.
            return_cost: If True, return the full CC function.

        Returns:
            PhaseEstimateResult with estimated phase.
        """
        t_start = time.perf_counter()
        n_bins = len(empirical_rate)

        # Build true template at bin centers
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False)
        true_template = lambda_b + lambda_s * profile.h(bin_centers)

        # Remove means for zero-mean cross-correlation
        x1 = true_template - np.mean(true_template)
        x2 = empirical_rate - np.mean(empirical_rate)

        # Fourier-domain cross-correlation (Eq 5.73)
        # R_D(ψ) = F⁻¹{X₁(f_k) · X₂*(f_k)}
        X1 = np.fft.fft(x1)
        X2 = np.fft.fft(x2)
        R_D = np.real(np.fft.ifft(X1 * np.conj(X2))) / n_bins

        # Locate coarse maximum (Eq 5.76, step 1)
        km = int(np.argmax(R_D))

        # Parabolic interpolation for sub-bin resolution (Eq 5.76, step 2)
        km_prev = (km - 1) % n_bins
        km_next = (km + 1) % n_bins

        R_prev = R_D[km_prev]
        R_curr = R_D[km]
        R_next = R_D[km_next]

        denom = R_next - 2.0 * R_curr + R_prev
        if abs(denom) > 1e-12:
            subsample = -0.5 * (R_next - R_prev) / denom
        else:
            subsample = 0.0

        # Phase estimate (Eq 5.7: φ̂ = -ψ̂)
        psi_hat = (km + subsample) / n_bins
        phi_hat = float((-psi_hat) % 1.0)

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

    Estimates initial phase by minimizing the squared difference between
    the empirical rate function and the true template.

    Eq (5.47): J(φ_j) = Σᵢ (λ̆_j(t_i) - λ(t_i; φ_j))²
    Eq (5.48): φ̂_j = argmin_{φ_j∈(0,1)} J(φ_j)
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
        Estimate phase using nonlinear least squares.

        Grid search over [0, 1) cycle, followed by local refinement.
        """
        t_start = time.perf_counter()
        n_bins = len(empirical_rate)
        bin_centers = np.linspace(0, 1, n_bins, endpoint=False)

        # Grid search (§5.6.3: interval divided into N_g grids)
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        J_values = np.zeros(n_grid)

        for k, phi in enumerate(phi_search):
            model = lambda_b + lambda_s * profile.h(bin_centers + phi)
            J_values[k] = float(np.sum((empirical_rate - model) ** 2))

        # Find global minimum
        best_idx = int(np.argmin(J_values))
        best_phi = phi_search[best_idx]

        # Local refinement using scipy bounded minimization
        def nls_cost(p):
            model = lambda_b + lambda_s * profile.h(bin_centers + p)
            return float(np.sum((empirical_rate - model) ** 2))

        margin = 1.0 / n_grid
        res = minimize_scalar(
            nls_cost,
            bounds=(best_phi - margin, best_phi + margin),
            method="bounded",
        )
        if res.success:
            best_phi = float(res.x) % 1.0

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
    Maximum Likelihood Estimator (MLE) via direct use of TOAs (§6.2).

    Maximizes the log-likelihood function directly from photon TOAs,
    without epoch folding.

    Eq (6.5): Ψ(φ_k) = Σᵢ ln(λ_k(t_i; φ_k))
    Eq (6.18): φ̂_k = argmax_{φ_k∈(0,1)} Ψ(φ_k)
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
        Estimate phase using maximum likelihood.

        Direct grid search over [0, 1) cycle with 1024 grids (§6.7.1),
        followed by local refinement.

        The Λ(φ_k) term in the full LLF (Eq 6.3) can be safely dropped
        for long observation times (discussed below Eq 6.4).
        """
        t_start = time.perf_counter()

        if len(toas) == 0:
            return PhaseEstimateResult(phi_hat=0.0, cpu_time_s=0.0)

        # Precompute phases at TOAs: (t_i · f_o) mod 1
        phases_at_toas = (toas * f_o) % 1.0

        # Grid search
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        psi_values = np.zeros(n_grid)

        for k, phi in enumerate(phi_search):
            # Eq (6.5): Ψ(φ) = Σᵢ ln(λ(t_i; φ))
            #         = Σᵢ ln(λ_b + λ_s · h(phases_at_toas + φ))
            rates = lambda_b + lambda_s * profile.h(phases_at_toas + phi)
            rates = np.maximum(rates, 1e-15)  # Guard against log(0)
            psi_values[k] = float(np.sum(np.log(rates)))

        # Find global maximum
        best_idx = int(np.argmax(psi_values))
        best_phi = phi_search[best_idx]

        # Local refinement
        def neg_llf(p):
            rates = lambda_b + lambda_s * profile.h(phases_at_toas + p)
            rates = np.maximum(rates, 1e-15)
            return -float(np.sum(np.log(rates)))

        margin = 1.0 / n_grid
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
    Eq (4.43) / (5.1): Estimate pulse delay from phase estimates.

        t̂_d = (φ̂₁ - φ̂₂) / f₂

    The phase difference is taken modulo 1 to handle wrapping.

    Args:
        phi1_hat: Estimated phase on detector 1 (cycle).
        phi2_hat: Estimated phase on detector 2 (cycle).
        f_2: Observed frequency at detector 2 (Hz).

    Returns:
        Estimated pulse delay t̂_d (seconds).
    """
    delta_phi = (phi1_hat - phi2_hat) % 1.0
    # Handle wrapping: if delta_phi > 0.5, subtract 1
    if delta_phi > 0.5:
        delta_phi -= 1.0
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
    Full pipeline: epoch fold + estimate phases + compute delay.

    Args:
        toas_1, toas_2: Photon TOAs from detectors 1 and 2.
        f_o_1, f_o_2: Observed frequencies at each detector.
        profile: Pulsar profile.
        lambda_b, lambda_s: Rate parameters.
        n_bins: Number of epoch folding bins.
        n_grid: Number of grid points for estimator search.
        method: "cc", "nls", or "mle".

    Returns:
        DelayEstimateResult with estimated delay and phases.
    """
    t_start = time.perf_counter()

    if method.lower() == "mle":
        # MLE uses TOAs directly — no epoch folding needed
        r1 = MaximumLikelihoodEstimator.estimate_phase(
            toas_1, f_o_1, profile, lambda_b, lambda_s, n_grid
        )
        r2 = MaximumLikelihoodEstimator.estimate_phase(
            toas_2, f_o_2, profile, lambda_b, lambda_s, n_grid
        )
    else:
        # CC and NLS use epoch folding first
        _, emp_rate_1 = epoch_fold(toas_1, f_o_1, n_bins)
        _, emp_rate_2 = epoch_fold(toas_2, f_o_2, n_bins)

        if method.lower() == "cc":
            r1 = CrossCorrelationEstimator.estimate_phase(
                emp_rate_1, profile, lambda_b, lambda_s
            )
            r2 = CrossCorrelationEstimator.estimate_phase(
                emp_rate_2, profile, lambda_b, lambda_s
            )
        elif method.lower() == "nls":
            r1 = NLSEstimator.estimate_phase(
                emp_rate_1, profile, lambda_b, lambda_s, n_grid
            )
            r2 = NLSEstimator.estimate_phase(
                emp_rate_2, profile, lambda_b, lambda_s, n_grid
            )
        else:
            raise ValueError(f"Unknown method '{method}'. Use 'cc', 'nls', or 'mle'.")

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
    Monte Carlo RMS error of a phase estimator.

    Generates n_realizations sets of photon TOAs, estimates phase for each,
    and computes the RMS error.

    The error is computed modulo 1 cycle (Eq 5.77):
        |e| = min{mod(φ₀ - φ̂₀, 1), mod(φ̂₀ - φ₀, 1)}

    Returns:
        RMS phase error (cycle).
    """
    from .signal_model import generate_photon_toas

    errors_sq = []
    rng = np.random.default_rng(seed)
    profile = rate_func.profile
    lambda_b = rate_func.lambda_b
    lambda_s = rate_func.lambda_s

    for i in range(n_realizations):
        # Generate TOAs
        toas = generate_photon_toas(rate_func, f_o, T_obs, seed=rng.integers(0, 2**31))

        if len(toas) == 0:
            continue

        if method.lower() == "mle":
            result = MaximumLikelihoodEstimator.estimate_phase(
                toas, f_o, profile, lambda_b, lambda_s, n_grid
            )
        else:
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

        # Phase error modulo 1 (Eq 5.77)
        e1 = (true_phi - result.phi_hat) % 1.0
        e2 = (result.phi_hat - true_phi) % 1.0
        error = min(e1, e2)
        errors_sq.append(error ** 2)

    if not errors_sq:
        return float('inf')

    return float(np.sqrt(np.mean(errors_sq)))
