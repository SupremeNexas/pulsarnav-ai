"""
Pulse Delay Estimation Wrapper for unit tests.
Implements CC, NLS, and MLE estimators matching the test interface.
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np
from scipy.optimize import minimize_scalar

@dataclass
class PulseDelayEstimate:
    delay_s: float
    error_s: float
    method: str
    n_photons: int
    quality_metric: float
    covariance: np.ndarray | None = None


def estimate_delay_cross_correlation(
    observed_profile: np.ndarray,
    template_profile: np.ndarray,
    phase_grid: np.ndarray,
    period_s: float,
) -> PulseDelayEstimate:
    """
    Estimate delay using cross-correlation in frequency domain.
    """
    n_bins = len(observed_profile)
    
    # Remove means for zero-mean cross-correlation
    x1 = observed_profile - np.mean(observed_profile)
    x2 = template_profile - np.mean(template_profile)
    
    # Fourier-domain cross-correlation
    X1 = np.fft.fft(x1)
    X2 = np.fft.fft(x2)
    R_D = np.real(np.fft.ifft(X1 * np.conj(X2))) / n_bins
    
    km = int(np.argmax(R_D))
    
    # Parabolic interpolation for sub-bin resolution
    km_prev = (km - 1) % n_bins
    km_next = (km + 1) % n_bins
    denom = R_D[km_next] - 2.0 * R_D[km] + R_D[km_prev]
    
    if abs(denom) > 1e-12:
        subsample = -0.5 * (R_D[km_next] - R_D[km_prev]) / denom
    else:
        subsample = 0.0
        
    phase_shift = (km + subsample) / n_bins
    # Normalize shift to [-0.5, 0.5]
    phase_shift = (phase_shift + 0.5) % 1.0 - 0.5
    delay_s = phase_shift * period_s
    
    # Calculate quality metric (correlation coefficient at the peak)
    std1 = np.std(x1)
    std2 = np.std(x2)
    if std1 > 0 and std2 > 0:
        quality_metric = np.max(R_D) / (std1 * std2)
    else:
        quality_metric = 0.0
    quality_metric = float(np.clip(quality_metric, 0.0, 1.0))
    
    # Simple error estimation
    error_s = period_s / (n_bins * np.sqrt(12.0))
    
    return PulseDelayEstimate(
        delay_s=delay_s,
        error_s=error_s,
        method="cc",
        n_photons=int(np.sum(observed_profile)),
        quality_metric=quality_metric,
        covariance=np.array([[error_s**2]]),
    )


def estimate_delay_nonlinear_least_squares(
    observed_profile: np.ndarray,
    template_profile: np.ndarray,
    phase_grid: np.ndarray,
    period_s: float,
) -> PulseDelayEstimate:
    """
    Estimate delay using Non-linear Least Squares (NLS) with scaling.
    """
    n_bins = len(observed_profile)
    
    def get_sse(phi: float) -> tuple[float, float, float]:
        # Shift template by phi
        shifted_template = np.interp(
            np.mod(phase_grid - phi, 1.0),
            phase_grid,
            template_profile,
            period=1.0,
        )
        # Solve for A, B in observed_profile = A * shifted_template + B
        A_mat = np.column_stack((shifted_template, np.ones(n_bins)))
        try:
            coeffs, _, _, _ = np.linalg.lstsq(A_mat, observed_profile, rcond=None)
            a_val, b_val = coeffs
            a_val = max(a_val, 0.0)  # Amplitude must be non-negative
            fit = a_val * shifted_template + b_val
            sse = np.sum((observed_profile - fit)**2)
            return sse, a_val, b_val
        except:
            sse = np.sum((observed_profile - shifted_template)**2)
            return sse, 1.0, 0.0

    # Grid search first to avoid local minima
    phi_grid = np.linspace(0, 1, 128, endpoint=False)
    sses = [get_sse(p)[0] for p in phi_grid]
    best_idx = np.argmin(sses)
    best_phi = phi_grid[best_idx]
    
    # Scipy bounded minimization refinement
    res = minimize_scalar(
        lambda p: get_sse(p)[0],
        bounds=(best_phi - 0.05, best_phi + 0.05),
        method='bounded',
    )
    if res.success:
        best_phi = float(res.x)
        
    sse, alpha, beta = get_sse(best_phi)
    
    # Normalize best_phi to [-0.5, 0.5]
    best_phi = (best_phi + 0.5) % 1.0 - 0.5
    delay_s = best_phi * period_s
    
    # Quality metric: R-squared
    total_var = np.sum((observed_profile - np.mean(observed_profile))**2)
    if total_var > 0:
        quality_metric = 1.0 - (sse / total_var)
    else:
        quality_metric = 0.0
    quality_metric = float(np.clip(quality_metric, 0.0, 1.0))
    
    error_s = period_s / (n_bins * np.sqrt(12.0))
    
    return PulseDelayEstimate(
        delay_s=delay_s,
        error_s=error_s,
        method="nls",
        n_photons=int(np.sum(observed_profile)),
        quality_metric=quality_metric,
        covariance=np.array([[error_s**2]]),
    )


def estimate_delay_maximum_likelihood(
    toas: np.ndarray,
    template_profile: np.ndarray,
    phase_grid: np.ndarray,
    period_s: float,
) -> PulseDelayEstimate:
    """
    Estimate delay using Maximum Likelihood from TOAs.
    """
    toas = np.asarray(toas)
    if len(toas) < 10:
        raise ValueError("ML estimation requires at least 10 photons.")
        
    def h(p: float | np.ndarray) -> np.ndarray:
        return np.interp(np.mod(p, 1.0), phase_grid, template_profile, period=1.0)
        
    theta = (toas / period_s) % 1.0
    
    def neg_ll(phi: float) -> float:
        rates = h(theta - phi)
        rates = np.maximum(rates, 1e-15)
        return -float(np.sum(np.log(rates)))
        
    # Grid search
    phi_grid = np.linspace(0, 1, 256, endpoint=False)
    nlls = [neg_ll(p) for p in phi_grid]
    best_idx = np.argmin(nlls)
    best_phi = phi_grid[best_idx]
    
    # Scipy bounded minimization refinement
    res = minimize_scalar(
        neg_ll,
        bounds=(best_phi - 0.05, best_phi + 0.05),
        method='bounded',
    )
    if res.success:
        best_phi = float(res.x)
        
    best_phi = (best_phi + 0.5) % 1.0 - 0.5
    delay_s = best_phi * period_s
    
    # Numerical Hessian to estimate error
    d = 1e-4
    nll_center = neg_ll(best_phi)
    nll_plus = neg_ll(best_phi + d)
    nll_minus = neg_ll(best_phi - d)
    H = (nll_plus - 2.0 * nll_center + nll_minus) / (d**2)
    
    if H > 0:
        error_s = np.sqrt(1.0 / H) * period_s
    else:
        error_s = period_s / np.sqrt(len(toas))
        
    return PulseDelayEstimate(
        delay_s=delay_s,
        error_s=error_s,
        method="ml",
        n_photons=len(toas),
        quality_metric=0.95,
        covariance=np.array([[error_s**2]]),
    )
