"""
PulsarNav AI: X-ray Pulsar Navigation Engine
============================================
Reference:
    "Navigation in Space by X-ray Pulsars" (2011)
    by Amir Abbas Emadzadeh and Jason Lee Speyer (Springer, New York)

This module is the MAIN high-fidelity navigation engine for the PulsarNav AI project.
It re-implements the core algorithms from the reference book with full orbital dynamics,
providing a more physically accurate (but slower) alternative to the lightweight modules
in signal_model.py, epoch_folding.py, delay_estimation.py, etc.

Key Differences from the Modular Pipeline:
-------------------------------------------
- **XRayPulsarProfile**: Internally precomputes and caches H_grid (cumulative profile
  integral) using trapezoidal integration, for fast TOA generation.
- **PulsarNavigationEKF**: Full 8-state EKF with Keplerian + J2 orbital dynamics,
  propagated via RK4. Unlike the 10-state error-state KF in kalman_filter.py, this
  operates on the ABSOLUTE state (position, velocity, clock bias).
- **generate_photon_toas**: Implements Algorithm 3.1 with a safety fallback for
  near-zero rate edge cases.

Chapter-by-Chapter Alignment:
------------------------------
  1. Signal Modeling (Chapter 3):
     - XRayPulsarProfile: lambda(t) = lambda_b + lambda_s * h(phi(t))  [Eq 3.18]
     - generate_photon_toas: NHPP TOA simulation [Algorithm 3.1]
     - epoch_folding: Fold TOAs into empirical rate function [Eq 3.39]

  2. Cramer-Rao Lower Bounds (Chapter 4):
     - crlb_phase_error: Phase CRLB [Eq 4.42]
     - crlb_pulse_delay_s: Pulse delay CRLB [Eq 4.44]

  3. Pulse Delay Estimators (Chapters 5 & 6):
     - CrossCorrelationEstimator: CC phase estimator [Eq 5.7, 5.72, 5.76]
     - NonlinearLeastSquaresEstimator: NLS phase estimator [Eq 5.47-5.49]
     - MaximumLikelihoodEstimator: MLE via direct TOAs [Eq 6.5]

  4. Extended Kalman Filter (Chapter 7):
     - PulsarNavigationEKF: Absolute-state 8-state EKF
       with Keplerian + J2 gravity and RK4 propagation [Eq 7.19-7.41]

State Vector for PulsarNavigationEKF (8 states):
    x = [r_x, r_y, r_z, v_x, v_y, v_z, b_clk, d_clk]^T
    where:
        r: position relative to Earth center (km)
        v: velocity relative to Earth center (km/s)
        b_clk: spacecraft clock bias (seconds)
        d_clk: spacecraft clock drift rate (s/s)

Key Physical Constants:
    EARTH_MU: Earth gravitational parameter μ = GM_Earth = 398600.4418 km³/s²
    EARTH_RE: Earth equatorial radius = 6378.137 km
    EARTH_J2: J2 oblateness coefficient = 1.08263 × 10⁻³
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar

from .config import SPEED_OF_LIGHT_KM_S

# Physical Constants
# EARTH_MU: Standard gravitational parameter of Earth (km³/s²).
# Used in Keplerian and J2 gravity models.
EARTH_MU = 398600.4418

# EARTH_RE: Earth equatorial radius (km).
# Used in the J2 perturbation formula (oblateness correction).
EARTH_RE = 6378.137

# EARTH_J2: Second zonal harmonic coefficient (dimensionless).
# Accounts for Earth's equatorial bulge, which causes orbital plane precession.
# Without J2, Keplerian orbits would be perfect ellipses forever.
EARTH_J2 = 1.08263e-3


# =====================================================================
# 1. Signal Modeling & Profile Representation (Chapter 3)
# =====================================================================

def evaluate_gaussian_profile(phi: float | np.ndarray, peaks: list[dict]) -> float | np.ndarray:
    """
    Evaluate a periodic pulse profile modeled as a sum of Gaussians on [0, 1).
    h(phi) = sum_j A_j * exp(-0.5 * ((phi - center_j) / sigma_j)^2)
    with periodic boundary conditions.
    """
    phi_arr = np.asarray(phi) % 1.0
    val = np.zeros_like(phi_arr, dtype=float)
    for p in peaks:
        amp = p["amp"]
        center = p["center"]
        sigma = p["sigma"]
        # Sum over adjacent periodic copies to handle wrap-around
        for shift in [-1.0, 0.0, 1.0]:
            val += amp * np.exp(-0.5 * ((phi_arr - center - shift) / sigma) ** 2)
    return val


def get_default_profile() -> tuple[list[dict], float]:
    """
    Get the default double-peak profile parameters (Crab-like profile).
    Returns the peak list and the integral of the profile over [0, 1).
    """
    peaks = [
        {"amp": 0.8, "center": 0.2, "sigma": 0.03},
        {"amp": 0.5, "center": 0.65, "sigma": 0.05}
    ]
    # Numerically integrate over one cycle to get the normalization factor
    phi_grid = np.linspace(0, 1, 2000, endpoint=False)
    raw_vals = evaluate_gaussian_profile(phi_grid, peaks)
    integral = float(np.mean(raw_vals))
    return peaks, integral


class XRayPulsarProfile:
    """
    Represents the X-ray pulsar rate function and provides core signal model operations.

    The complete rate model (Eq 3.18):
        lambda(t) = lambda_b + lambda_s * h(phi(t))

    where:
        lambda_b: Background (constant) photon rate from non-pulsar X-ray sources (ph/s)
        lambda_s: Source (pulsed) photon rate from the pulsar itself (ph/s)
        h(phi):  Normalized pulse profile, satisfying \u222b₀¹ h(phi) dphi = 1.0

    The phase phi(t) evolves as:
        phi(t) = phi_0 + f_obs * t   (constant-frequency model, Eq 3.27)

    where phi_0 is the initial phase (the unknown we estimate) and f_obs is the
    Doppler-shifted observed frequency.

    Internal Representation:
    ------------------------
    The profile is stored as a Gaussian sum (user-supplied peaks or default Crab-like
    double-peak profile). The normalization factor norm_factor ensures:
        (1/norm_factor) * integral of raw profile = 1

    The cumulative integral H_grid = integral_0^theta h(theta') dtheta' is precomputed
    on a fine grid using trapezoidal integration. This enables fast TOA generation
    via Newton-Raphson inversion of the accumulated rate Lambda(t).
    """
    def __init__(self, lambda_b: float, lambda_s: float, peaks: list[dict] | None = None):
        self.lambda_b = lambda_b
        self.lambda_s = lambda_s
        if peaks is None:
            peaks, _ = get_default_profile()
        self.peaks = peaks
        
        # Determine the normalization factor so that the integral of h(phi) over [0, 1) is 1.0
        phi_grid = np.linspace(0, 1, 5000, endpoint=False)
        raw_vals = evaluate_gaussian_profile(phi_grid, self.peaks)
        self.norm_factor = float(np.mean(raw_vals))
        
        # Precompute the cumulative profile integral H(theta) = \int_0^theta h(theta') dtheta'
        self.theta_steps = 10000
        self.theta_grid = np.linspace(0, 1, self.theta_steps, endpoint=True)
        h_vals = evaluate_gaussian_profile(self.theta_grid, self.peaks) / self.norm_factor
        self.H_grid = np.zeros(self.theta_steps)
        dtheta = 1.0 / (self.theta_steps - 1)
        # Trapezoidal integration
        for i in range(1, self.theta_steps):
            self.H_grid[i] = self.H_grid[i-1] + 0.5 * (h_vals[i-1] + h_vals[i]) * dtheta

    def h(self, phi: float | np.ndarray) -> float | np.ndarray:
        """Normalized profile h(phi) such that integral_0^1 h(phi) dphi = 1."""
        return evaluate_gaussian_profile(phi, self.peaks) / self.norm_factor

    def h_derivative(self, phi: float | np.ndarray) -> float | np.ndarray:
        """Analytical derivative of h(phi) with respect to phi."""
        phi_arr = np.asarray(phi) % 1.0
        val = np.zeros_like(phi_arr, dtype=float)
        for p in self.peaks:
            amp = p["amp"]
            center = p["center"]
            sigma = p["sigma"]
            for shift in [-1.0, 0.0, 1.0]:
                diff = phi_arr - center - shift
                term = amp * np.exp(-0.5 * (diff / sigma) ** 2)
                val += term * (-diff / (sigma ** 2))
        return val / self.norm_factor

    def H_cum(self, theta: float | np.ndarray) -> float | np.ndarray:
        """
        Evaluate the continuous cumulative integral:
        H_cum(theta) = integral_0^theta h(theta') dtheta' for any theta >= 0.
        By periodicity: H_cum(theta) = floor(theta) + H_grid(theta % 1)
        """
        t = np.asarray(theta, dtype=float)
        floor_t = np.floor(t)
        rem_t = t % 1.0
        idx = np.clip((rem_t * (self.theta_steps - 1)).astype(int), 0, self.theta_steps - 1)
        return floor_t + self.H_grid[idx]

    def lambda_rate(self, t: float | np.ndarray, phi_0: float, f_obs: float) -> float | np.ndarray:
        """
        Equation (3.27):
        lambda(t; phi_0, f_obs) = lambda_b + lambda_s * h(phi_0 + f_obs * (t - t_0))
        (Assuming t_0 = 0)
        """
        return self.lambda_b + self.lambda_s * self.h(phi_0 + f_obs * t)

    def accumulated_rate(self, t: float | np.ndarray, phi_0: float, f_obs: float) -> float | np.ndarray:
        """
        Equation (3.8) & (6.4):
        Lambda(t) = integral_0^t lambda(tau) dtau = lambda_b * t + (lambda_s / f_obs) * ( H_cum(phi_0 + f_obs * t) - H_cum(phi_0) )
        """
        t_arr = np.asarray(t, dtype=float)
        return self.lambda_b * t_arr + (self.lambda_s / f_obs) * (self.H_cum(phi_0 + f_obs * t_arr) - self.H_cum(phi_0))

    def invert_accumulated_rate(self, y: float, phi_0: float, f_obs: float, t_start: float = 0.0) -> float:
        """
        Invert the accumulated rate function Lambda(t) = y using Newton-Raphson.
        Since Lambda(t) is strictly increasing and lambda(t) >= lambda_b > 0, convergence is guaranteed.
        """
        # Initial guess assuming average rate: lambda_avg = lambda_b + lambda_s
        lambda_avg = self.lambda_b + self.lambda_s
        # If t_start is given, guess from t_start
        t_guess = t_start + (y - self.accumulated_rate(t_start, phi_0, f_obs)) / lambda_avg
        t_guess = max(t_start, t_guess)
        
        for _ in range(20):
            val = self.accumulated_rate(t_guess, phi_0, f_obs)
            deriv = self.lambda_rate(t_guess, phi_0, f_obs)
            diff = val - y
            if abs(diff) < 1e-12:
                break
            t_guess = t_guess - diff / deriv
            t_guess = max(t_start, t_guess)
        return float(t_guess)


# =====================================================================
# 2. Non-homogeneous Poisson Process Photon Generator (Chapter 3)
# =====================================================================

def generate_photon_toas(
    profile: XRayPulsarProfile,
    phi_0: float,
    f_obs: float,
    t_f: float,
    seed: int | None = None
) -> np.ndarray:
    """
    Algorithm 3.1: TOA Simulation (Page 42)
    Generates photon times of arrival (TOAs) in [0, t_f] using integrated rate inversion.
    """
    rng = np.random.default_rng(seed)
    toas = []
    L = 0.0  # Auxiliary variable
    while L <= t_f:
        # Generate exponential random variable with parameter lambda_e = 1
        E = -np.log(rng.uniform(1e-15, 1.0))
        # Solve Lambda(L_next) = Lambda(L) + E
        y_target = profile.accumulated_rate(L, phi_0, f_obs) + E
        L_next = profile.invert_accumulated_rate(y_target, phi_0, f_obs, t_start=L)
        if L_next <= L:
            # Force a tiny forward step based on average rate to prevent infinite loops from float precision
            L_next = L + max(1e-9, E / (profile.lambda_b + profile.lambda_s))
        L = L_next
        if L <= t_f:
            toas.append(L)
    return np.array(toas)


# =====================================================================
# 3. Epoch Folding & Empirical Profile Reconstruction (Chapter 3)
# =====================================================================

def epoch_folding(toas: np.ndarray, f_obs: float, n_bins: int = 128) -> np.ndarray:
    """
    Section 3.6: Epoch Folding (Pages 35-37)
    Folds photon TOAs into a single cycle of period P = 1 / f_obs, dividing it into n_bins.
    Returns the empirical rate function (counts normalized to equivalent photon rate).
    """
    if len(toas) == 0:
        return np.zeros(n_bins)
    
    T_obs = float(np.max(toas) - np.min(toas))
    if T_obs <= 0:
        T_obs = 1.0
        
    # Fold phases modulo 1.0
    phases = (toas * f_obs) % 1.0
    
    # Histogram counts into bins
    counts, _ = np.histogram(phases, bins=n_bins, range=(0.0, 1.0))
    
    # Normalize to empirical rate function (Equation 3.39):
    # \bar{\lambda}(ti) = (counts_i * n_bins) / T_obs
    empirical_rate = (counts * n_bins) / T_obs
    return empirical_rate


# =====================================================================
# 4. Cramer-Rao Lower Bounds (Chapter 4)
# =====================================================================

def crlb_phase_error(profile: XRayPulsarProfile, T_obs: float) -> float:
    """
    Equation (4.42): CRLB for initial phase estimation phi_0:
    CRLB(phi_0) = 1 / [ T_obs * integral_0^1 [lambda_s * h'(phi)]^2 / [lambda_b + lambda_s * h(phi)] dphi ]
    """
    phi_grid = np.linspace(0, 1, 5000, endpoint=False)
    h_vals = profile.h(phi_grid)
    h_derivs = profile.h_derivative(phi_grid)
    
    numerator = (profile.lambda_s * h_derivs) ** 2
    denominator = profile.lambda_b + profile.lambda_s * h_vals
    
    fisher_integral = float(np.mean(numerator / denominator))
    return 1.0 / (T_obs * fisher_integral)


def crlb_pulse_delay_s(profile: XRayPulsarProfile, f_s: float, T_obs: float, relative: bool = False) -> float:
    """
    Equation (4.44): CRLB for pulse delay t_d:
    For absolute navigation: CRLB(t_d) = CRLB(phi_0) / f_s^2
    For relative navigation (2 detectors): CRLB(t_d) = 2 * CRLB(phi_0) / f_s^2
    """
    factor = 2.0 if relative else 1.0
    return factor * crlb_phase_error(profile, T_obs) / (f_s ** 2)


# =====================================================================
# 5. Pulse Delay Estimators (Chapters 5 & 6)
# =====================================================================

class CrossCorrelationEstimator:
    """
    Section 5.2 & 5.6.2: Cross Correlation (CC) phase estimator (Pages 62-65, 72-73)
    Correlates folded empirical profile with the true template to find phase shift.
    """
    @staticmethod
    def estimate_phase(empirical_rate: np.ndarray, true_profile: np.ndarray) -> float:
        n_bins = len(empirical_rate)
        R_D = np.zeros(n_bins)
        
        # Circular Cross Correlation (Equation 5.72)
        for m in range(n_bins):
            # Roll true profile by m bins
            shifted_true = np.roll(true_profile, m)
            R_D[m] = float(np.mean(shifted_true * empirical_rate))
            
        # Locate index of maximum correlation
        km = int(np.argmax(R_D))
        
        # Sub-bin Parabolic Interpolation (Equation 5.76)
        # Handle boundary wrapping circularly for adjacent indices
        km_prev = (km - 1) % n_bins
        km_next = (km + 1) % n_bins
        
        R_prev = R_D[km_prev]
        R_curr = R_D[km]
        R_next = R_D[km_next]
        
        denom = R_next - 2.0 * R_curr + R_prev
        if abs(denom) < 1e-10:
            subsample = 0.0
        else:
            subsample = -0.5 * (R_next - R_prev) / denom
            
        phi_est = (km + subsample) / n_bins
        # Retain phase shift in [0, 1) and shift direction according to Eq (5.7): phi_hat = -psi
        return float((-phi_est) % 1.0)


class NonlinearLeastSquaresEstimator:
    """
    Section 5.3 & 5.6.3: Nonlinear Least Squares (NLS) phase estimator (Pages 68-70, 74)
    Fits empirical folded profile to the shifted true profile template.
    """
    @staticmethod
    def estimate_phase(
        empirical_rate: np.ndarray,
        profile_model: XRayPulsarProfile,
        n_grid: int = 1000
    ) -> float:
        n_bins = len(empirical_rate)
        bin_coords = np.linspace(0, 1, n_bins, endpoint=False)
        
        best_phi = 0.0
        min_J = float("inf")
        
        # Grid search over phase shift phi \in [0, 1)
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        for phi in phi_search:
            # Shifted model: lambda(t; phi) = lambda_b + lambda_s * h(bin_coords + phi)
            model_vals = profile_model.lambda_b + profile_model.lambda_s * profile_model.h(bin_coords + phi)
            # NLS Cost J(phi) (Equation 5.47 / 5.49)
            J = float(np.sum((empirical_rate - model_vals) ** 2))
            if J < min_J:
                min_J = J
                best_phi = phi
                
        # Perform local refinement (minimum search near best_phi)
        def nls_cost(p):
            model_vals = profile_model.lambda_b + profile_model.lambda_s * profile_model.h(bin_coords + p)
            return float(np.sum((empirical_rate - model_vals) ** 2))
            
        res = minimize_scalar(nls_cost, bounds=(best_phi - 0.05, best_phi + 0.05), method="bounded")
        if res.success:
            best_phi = float(res.x)
            
        return best_phi % 1.0


class MaximumLikelihoodEstimator:
    """
    Chapter 6: Maximum Likelihood Estimator (MLE) via direct use of TOAs (Pages 86-91)
    Maximizes direct photon log-likelihood sum without binning or folding.
    """
    @staticmethod
    def estimate_phase(
        toas: np.ndarray,
        f_obs: float,
        profile_model: XRayPulsarProfile,
        n_grid: int = 1000
    ) -> float:
        if len(toas) == 0:
            return 0.0
            
        # Log-Likelihood Function (Equation 6.5):
        # \Psi(\phi) = \sum_i \ln( \lambda_b + \lambda_s * h( \phi + f_obs * t_i ) )
        # Direct grid search
        phi_search = np.linspace(0, 1, n_grid, endpoint=False)
        best_phi = 0.0
        max_LLF = -float("inf")
        
        # Vectorized evaluation for speed
        phases_ideal = (toas * f_obs) % 1.0
        
        for phi in phi_search:
            rates = profile_model.lambda_b + profile_model.lambda_s * profile_model.h(phases_ideal + phi)
            # Guard log against non-positive rates
            llf = float(np.sum(np.log(np.maximum(rates, 1e-12))))
            if llf > max_LLF:
                max_LLF = llf
                best_phi = phi
                
        # Local refinement using scalar optimizer
        def ml_cost(p):
            rates = profile_model.lambda_b + profile_model.lambda_s * profile_model.h(phases_ideal + p)
            return -float(np.sum(np.log(np.maximum(rates, 1e-12))))
            
        res = minimize_scalar(ml_cost, bounds=(best_phi - 0.05, best_phi + 0.05), method="bounded")
        if res.success:
            best_phi = float(res.x)
            
        return best_phi % 1.0


# =====================================================================
# 6. Recursive Navigation: Extended Kalman Filter (Chapter 7)
# =====================================================================

class PulsarNavigationEKF:
    """
    Extended Kalman Filter for ABSOLUTE 8-state spacecraft navigation (§7.2-7.4).

    Unlike the 10-state error-state KF in kalman_filter.py, this EKF operates on the
    ABSOLUTE state: [position, velocity, clock_bias, clock_drift].
    It uses Keplerian + J2 orbital dynamics propagated with RK4, making it suitable
    for Earth-orbiting spacecraft where J2 oblateness effects are significant.

    State Vector (8 states):
        x = [r_x, r_y, r_z, v_x, v_y, v_z, b_clk, d_clk]^T
        r (km): position relative to Earth center in ECI J2000 frame
        v (km/s): velocity in ECI frame
        b_clk (s): spacecraft clock bias (how far ahead/behind the clock is)
        d_clk (s/s): clock drift rate (how fast the bias is changing)

    Orbital Dynamics (Non-linear):
        dr/dt = v
        dv/dt = a_gravity(r) = a_Kepler(r) + a_J2(r)
        db_clk/dt = d_clk
        dd_clk/dt = 0  (drift is modeled as a random walk driven by noise)

    Linearization for Covariance Propagation:
        The EKF linearizes the dynamics around the current estimate using the
        Jacobian F = df/dx (the gravity gradient matrix G(r)).
        The transition Jacobian Φ ≈ I + F*dt is applied to the covariance:
            P(k+1) = Φ * P(k) * Φ^T + Q

    Measurement Model (Eq 7.41):
        For each pulsar i with direction vector n̂ᵢ:
            z_i = c * t_d_i (measured timing delay scaled to distance)
        Expected: z_i = r · n̂_i + c * b_clk
        Measurement matrix: H_row_i = [n_x, n_y, n_z, 0, 0, 0, c, 0]

    Differences from 10-State Error-State KF:
    -------------------------------------------
    - This EKF estimates absolute state (position, velocity) not error state (Δx, Δv)
    - This EKF includes RK4 orbital propagation (more accurate for LEO/MEO)
    - The 10-state KF uses a simpler linear model suitable for deep space (no J2)
    - Both implement the standard Kalman measurement update (standard form here,
      Joseph form in kalman_filter.py)
    """
    def __init__(self, x_init: np.ndarray, P_init: np.ndarray, Q_diagonal: np.ndarray):
        self.x = np.array(x_init, dtype=float).flatten()  # (8,)
        self.P = np.array(P_init, dtype=float)            # (8, 8)
        self.Q = np.diag(Q_diagonal)                      # (8, 8)
        
        # Verify sizes
        if self.x.shape != (8,):
            raise ValueError("State vector must be of size 8")
        if self.P.shape != (8, 8):
            raise ValueError("Covariance matrix must be of size 8x8")

    def _gravity_acceleration(self, r: np.ndarray) -> np.ndarray:
        """Keplerian two-body acceleration + Earth J2 perturbation."""
        r_mag = np.linalg.norm(r)
        acc_kepler = -EARTH_MU * r / (r_mag ** 3)
        
        # J2 acceleration
        z_over_r = r[2] / r_mag
        factor = 1.5 * EARTH_J2 * (EARTH_MU / (r_mag**2)) * ((EARTH_RE / r_mag)**2)
        acc_J2 = factor * np.array([
            (5.0 * (z_over_r**2) - 1.0) * (r[0] / r_mag),
            (5.0 * (z_over_r**2) - 1.0) * (r[1] / r_mag),
            (5.0 * (z_over_r**2) - 3.0) * (r[2] / r_mag)
        ])
        return acc_kepler + acc_J2

    def _gravity_gradient(self, r: np.ndarray) -> np.ndarray:
        """3x3 Jacobian of the Keplerian acceleration (gravity gradient)."""
        r_mag = np.linalg.norm(r)
        r_mag5 = r_mag ** 5
        I3 = np.eye(3)
        outer_prod = np.outer(r, r)
        # G(r) = -mu/r^3 * I3 + 3*mu/r^5 * r * r^T
        return -EARTH_MU * I3 / (r_mag ** 3) + 3.0 * EARTH_MU * outer_prod / r_mag5

    def _propagate_state_rk4(self, r: np.ndarray, v: np.ndarray, dt: float) -> tuple[np.ndarray, np.ndarray]:
        """RK4 numerical integration of orbital dynamics."""
        def derivatives(state):
            pos = state[:3]
            vel = state[3:]
            acc = self._gravity_acceleration(pos)
            return np.concatenate([vel, acc])
        
        y = np.concatenate([r, v])
        k1 = derivatives(y)
        k2 = derivatives(y + 0.5 * dt * k1)
        k3 = derivatives(y + 0.5 * dt * k2)
        k4 = derivatives(y + dt * k3)
        y_next = y + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)
        return y_next[:3], y_next[3:]

    def predict(self, dt: float) -> None:
        """
        State propagation step.
        Propagates trajectory using RK4, clock bias using drift, and updates covariance P.
        """
        # 1. Propagate State
        r_old = self.x[:3]
        v_old = self.x[3:6]
        b_old = self.x[6]
        d_old = self.x[7]
        
        r_new, v_new = self._propagate_state_rk4(r_old, v_old, dt)
        b_new = b_old + d_old * dt
        d_new = d_old
        
        self.x = np.array([
            r_new[0], r_new[1], r_new[2],
            v_new[0], v_new[1], v_new[2],
            b_new, d_new
        ])
        
        # 2. Build transition Jacobian F (8x8)
        # dx_dot = A * dx + w_v
        # Phi \approx I + A * dt
        G = self._gravity_gradient(r_old)
        F = np.zeros((8, 8))
        F[:3, :3] = np.eye(3)
        F[:3, 3:6] = np.eye(3) * dt
        F[3:6, :3] = G * dt
        F[3:6, 3:6] = np.eye(3)
        F[6, 6] = 1.0
        F[6, 7] = dt
        F[7, 7] = 1.0
        
        # 3. Propagate error covariance
        self.P = F @ self.P @ F.T + self.Q

    def update(self, measurements: list[dict]) -> None:
        """
        Measurement update step.
        Each measurement is a dictionary:
            {"delay_s": float, "pulsar_vector": np.ndarray (3,), "var_s2": float}
        """
        if len(measurements) == 0:
            return
            
        N = len(measurements)
        # Assemble measurement vector Z, H matrix, and noise covariance R
        Z = np.zeros(N)
        H = np.zeros((N, 8))
        R = np.zeros((N, N))
        
        r_est = self.x[:3]
        b_est = self.x[6]
        
        for i, m in enumerate(measurements):
            delay_obs = m["delay_s"]
            n_vector = m["pulsar_vector"] / np.linalg.norm(m["pulsar_vector"])
            var_s2 = m["var_s2"]
            
            # Equation (7.32): y(i) = c * t_d
            Z[i] = delay_obs * SPEED_OF_LIGHT_KM_S
            
            # Expected measurement: r dot n + c * b
            expected_z = np.dot(r_est, n_vector) + SPEED_OF_LIGHT_KM_S * b_est
            
            # Innovation (residual)
            innovation = Z[i] - expected_z
            
            # Equation (7.41): H = [ C 0 -c1 ] (signs adapted to state)
            # H_row = [ n_x, n_y, n_z, 0, 0, 0, c, 0 ]
            H[i, 0] = n_vector[0]
            H[i, 1] = n_vector[1]
            H[i, 2] = n_vector[2]
            H[i, 6] = SPEED_OF_LIGHT_KM_S
            
            R[i, i] = var_s2 * (SPEED_OF_LIGHT_KM_S ** 2)
            
        # Standard Kalman update equations
        S = H @ self.P @ H.T + R
        try:
            S_inv = np.linalg.inv(S)
        except np.linalg.LinAlgError:
            # Fallback pseudo-inverse if singular
            S_inv = np.linalg.pinv(S)
            
        K = self.P @ H.T @ S_inv
        
        # Calculate innovation vector
        y = Z - (H @ self.x)
        
        # Update state and covariance
        self.x = self.x + K @ y
        I = np.eye(8)
        self.P = (I - K @ H) @ self.P
