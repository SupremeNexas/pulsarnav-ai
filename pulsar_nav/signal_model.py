"""
Signal Modeling — Non-Homogeneous Poisson Process (NHPP)
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 3, Sections 3.1–3.5, 3.8

Implements:
    - Periodic pulsar profile h(φ) with normalization
    - Overall rate function λ(t) = λ_b + λ_s · h(φ_det(t))  (Eq 3.18)
    - Constant-frequency model (Eq 3.25–3.27)
    - Time-dependent-frequency model (Eq 3.28–3.30)
    - Accumulated rate Λ(t) (Eq 3.8) and its inverse Λ⁻¹
    - Photon TOA generation via Algorithm 3.1 (Eq 3.86)
"""

from __future__ import annotations

import numpy as np
from scipy.interpolate import interp1d

from .pulsar_catalog import SPEED_OF_LIGHT_M_S


# =====================================================================
# 1. Pulsar Profile h(φ)
# =====================================================================

class PulsarProfile:
    """
    Periodic pulsar intensity profile h(φ) defined on φ ∈ [0, 1).

    Properties (from book §3.4, below Eq 3.18):
        - h(φ) ≥ 0 for all φ
        - ∫₀¹ h(φ) dφ = 1
        - min_φ h(φ) = 0
        - h(φ + n) = h(φ) for integer n
    """

    def __init__(
        self,
        peaks: list[dict] | None = None,
        tabulated_phi: np.ndarray | None = None,
        tabulated_h: np.ndarray | None = None,
        n_grid: int = 4096,
    ):
        """
        Create profile from either Gaussian peaks or tabulated data.

        Args:
            peaks: List of {"amp", "center", "sigma"} dicts for Gaussian sum.
            tabulated_phi: Phase values in [0, 1).
            tabulated_h: Corresponding profile values (will be normalized).
            n_grid: Internal grid resolution.
        """
        self.n_grid = n_grid
        self._phi_grid = np.linspace(0, 1, n_grid, endpoint=False)

        if tabulated_phi is not None and tabulated_h is not None:
            # Interpolate tabulated profile onto uniform grid
            interp = interp1d(tabulated_phi, tabulated_h, kind='linear',
                              fill_value='extrapolate')
            raw = interp(self._phi_grid)
        elif peaks is not None:
            raw = self._evaluate_gaussian_sum(self._phi_grid, peaks)
            self._peaks = peaks
        else:
            # Default: Crab-like double-peak profile
            self._peaks = [
                {"amp": 0.8, "center": 0.2, "sigma": 0.03},
                {"amp": 0.5, "center": 0.65, "sigma": 0.05},
            ]
            raw = self._evaluate_gaussian_sum(self._phi_grid, self._peaks)

        # Enforce min h(φ) = 0
        raw = np.maximum(raw, 0.0)
        raw -= raw.min()

        # Normalize so ∫₀¹ h(φ) dφ = 1
        integral = float(np.mean(raw))
        if integral <= 0:
            raise ValueError("Profile is identically zero — cannot normalize")
        self._h_grid = raw / integral

        # Precompute cumulative integral H(θ) = ∫₀^θ h(θ') dθ'
        dphi = 1.0 / n_grid
        self._H_grid = np.zeros(n_grid + 1)
        for i in range(n_grid):
            self._H_grid[i + 1] = self._H_grid[i] + self._h_grid[i] * dphi

        # Precompute derivative h'(φ) using central differences
        self._h_deriv_grid = np.zeros(n_grid)
        for i in range(n_grid):
            ip = (i + 1) % n_grid
            im = (i - 1) % n_grid
            self._h_deriv_grid[i] = (self._h_grid[ip] - self._h_grid[im]) / (2 * dphi)

    @staticmethod
    def _evaluate_gaussian_sum(phi: np.ndarray, peaks: list[dict]) -> np.ndarray:
        """Sum of Gaussians with periodic boundary."""
        val = np.zeros_like(phi, dtype=float)
        for p in peaks:
            amp, center, sigma = p["amp"], p["center"], p["sigma"]
            for shift in [-1.0, 0.0, 1.0]:
                val += amp * np.exp(-0.5 * ((phi - center - shift) / sigma) ** 2)
        return val

    def h(self, phi: float | np.ndarray) -> float | np.ndarray:
        """
        Evaluate normalized profile h(φ).
        Periodic: h(φ + n) = h(φ).
        """
        phi_arr = np.asarray(phi, dtype=float)
        idx = ((phi_arr % 1.0) * self.n_grid).astype(int) % self.n_grid
        result = self._h_grid[idx]
        return float(result) if np.ndim(phi) == 0 else result

    def h_derivative(self, phi: float | np.ndarray) -> float | np.ndarray:
        """
        Evaluate dh/dφ.
        Used in Fisher integral (Eq 4.11) and estimator variance formulas.
        """
        phi_arr = np.asarray(phi, dtype=float)
        idx = ((phi_arr % 1.0) * self.n_grid).astype(int) % self.n_grid
        result = self._h_deriv_grid[idx]
        return float(result) if np.ndim(phi) == 0 else result

    def H_cumulative(self, theta: float | np.ndarray) -> float | np.ndarray:
        """
        Evaluate H(θ) = ∫₀^θ h(θ') dθ'.
        By periodicity: H(θ) = floor(θ) + H_grid(θ mod 1).
        """
        t = np.asarray(theta, dtype=float)
        floor_t = np.floor(t)
        rem = t % 1.0
        idx = np.clip((rem * self.n_grid).astype(int), 0, self.n_grid)
        result = floor_t + self._H_grid[idx]
        return float(result) if np.ndim(theta) == 0 else result

    @property
    def phi_grid(self) -> np.ndarray:
        return self._phi_grid.copy()

    @property
    def h_values(self) -> np.ndarray:
        return self._h_grid.copy()


# =====================================================================
# 2. Rate Function λ(t)
# =====================================================================

class RateFunction:
    """
    Overall X-ray pulsar rate function (Eq 3.18):
        λ(t) = λ_b + λ_s · h(φ_det(t))

    Supports two models:
        1. Constant-frequency (Eq 3.27): φ_det(t) = φ₀ + (t - t₀)·f_o
        2. Time-dependent-frequency (Eq 3.30): φ_det(t) = φ₀ + (t - t₀)·f_s + φ_d(t)
    """

    def __init__(
        self,
        profile: PulsarProfile,
        lambda_b: float,
        lambda_s: float,
        f_s: float,
        phi_0: float = 0.0,
        t_0: float = 0.0,
    ):
        self.profile = profile
        self.lambda_b = lambda_b
        self.lambda_s = lambda_s
        self.f_s = f_s
        self.phi_0 = phi_0
        self.t_0 = t_0

    def observed_frequency(self, v: float) -> float:
        """
        Eq (3.26): f_o = (1 + v/c) · f_s
        Args:
            v: Detector velocity (m/s) along pulsar direction.
        """
        return (1.0 + v / SPEED_OF_LIGHT_M_S) * self.f_s

    def doppler_frequency(self, v: float) -> float:
        """Eq (3.23): f_d = f_s · v / c"""
        return self.f_s * v / SPEED_OF_LIGHT_M_S

    # --- Constant-frequency model ---

    def lambda_const(
        self,
        t: float | np.ndarray,
        f_o: float,
    ) -> float | np.ndarray:
        """
        Eq (3.27): λ(t; φ₀, f_o) = λ_b + λ_s · h(φ₀ + (t - t₀)·f_o)
        """
        t_arr = np.asarray(t, dtype=float)
        phase = self.phi_0 + (t_arr - self.t_0) * f_o
        return self.lambda_b + self.lambda_s * self.profile.h(phase)

    # --- Time-dependent-frequency model ---

    def lambda_varying(
        self,
        t: float | np.ndarray,
        v_func,
    ) -> float | np.ndarray:
        """
        Eq (3.30): λ(t; φ₀, v(t)) = λ_b + λ_s · h(φ₀ + (t-t₀)·f_s + φ_d(t))

        Args:
            v_func: callable v(t) → velocity in m/s
        """
        t_arr = np.asarray(t, dtype=float)
        # Compute Doppler phase by numerical integration
        # φ_d(t) = ∫_{t₀}^{t} f_d(τ) dτ = (f_s / c) ∫_{t₀}^{t} v(τ) dτ
        if np.ndim(t) == 0:
            phi_d = self._integrate_doppler_phase(float(t_arr), v_func)
            phase = self.phi_0 + (float(t_arr) - self.t_0) * self.f_s + phi_d
        else:
            phi_d = np.array([self._integrate_doppler_phase(ti, v_func) for ti in t_arr])
            phase = self.phi_0 + (t_arr - self.t_0) * self.f_s + phi_d
        return self.lambda_b + self.lambda_s * self.profile.h(phase)

    def _integrate_doppler_phase(self, t: float, v_func, n_steps: int = 100) -> float:
        """
        Eq (3.28): φ_d(t) = ∫_{t₀}^{t} f_d(τ) dτ = (f_s/c) · ∫_{t₀}^{t} v(τ) dτ
        Trapezoidal integration.
        """
        if t <= self.t_0:
            return 0.0
        tau = np.linspace(self.t_0, t, n_steps)
        v_vals = np.array([v_func(ti) for ti in tau])
        integral = float(np.trapz(v_vals, tau))
        return (self.f_s / SPEED_OF_LIGHT_M_S) * integral

    # --- Accumulated rate Λ(t) ---

    def accumulated_rate(
        self,
        t: float | np.ndarray,
        f_o: float,
    ) -> float | np.ndarray:
        """
        Eq (3.8): Λ(t) = ∫₀ᵗ λ(τ) dτ = λ_b·t + (λ_s/f_o)·[H(φ₀+f_o·t) - H(φ₀)]
        (Assuming t₀ = 0 for simplicity in TOA generation.)
        """
        t_arr = np.asarray(t, dtype=float)
        delta_t = t_arr - self.t_0
        H_end = self.profile.H_cumulative(self.phi_0 + f_o * delta_t)
        H_start = self.profile.H_cumulative(self.phi_0)
        result = self.lambda_b * delta_t + (self.lambda_s / f_o) * (H_end - H_start)
        return float(result) if np.ndim(t) == 0 else result

    def invert_accumulated_rate(
        self,
        y: float,
        f_o: float,
        t_start: float | None = None,
    ) -> float:
        """
        Find t such that Λ(t) = y using Newton-Raphson.
        Since Λ(t) is strictly increasing (λ(t) > 0), convergence is guaranteed.
        Used in Algorithm 3.1 for TOA generation.
        """
        if t_start is None:
            t_start = self.t_0

        lambda_avg = self.lambda_b + self.lambda_s * 0.5  # rough average
        t_guess = t_start + max(0, (y - self.accumulated_rate(t_start, f_o)) / lambda_avg)

        for _ in range(50):  # Newton-Raphson iterations
            val = self.accumulated_rate(t_guess, f_o)
            deriv = self.lambda_const(t_guess, f_o)
            if isinstance(deriv, np.ndarray):
                deriv = float(deriv)
            diff = val - y
            if abs(diff) < 1e-14:
                break
            t_guess = t_guess - diff / max(deriv, 1e-15)
        return t_guess


# =====================================================================
# 3. Photon TOA Generation — Algorithm 3.1
# =====================================================================

def generate_photon_toas(
    rate_func: RateFunction,
    f_o: float,
    t_f: float,
    seed: int | None = None,
) -> np.ndarray:
    """
    Algorithm 3.1 (p. 42): TOA Simulation using integrated rate inversion.

    Generates photon times of arrival in [t₀, t_f] as realizations of
    a Non-Homogeneous Poisson Process (NHPP) with rate λ(t).

    Method (Eq 3.86):
        t_{n+1} = Λ⁻¹(Λ(t_n) + E),  where E ~ Exp(1)

    Args:
        rate_func: RateFunction instance (contains φ₀, λ_b, λ_s, profile)
        f_o: Observed frequency (Hz) — constant-frequency model
        t_f: End of observation window (seconds)
        seed: RNG seed for reproducibility

    Returns:
        Sorted array of photon TOAs
    """
    rng = np.random.default_rng(seed)
    toas: list[float] = []
    L = rate_func.t_0   # Auxiliary variable (Algorithm 3.1)

    while L <= t_f:
        # Generate exponential random variable E with parameter λ_e = 1
        E = rng.exponential(1.0)

        # Compute target: Λ(L_next) = Λ(L) + E
        Lambda_L = rate_func.accumulated_rate(L, f_o)
        y_target = Lambda_L + E

        # Invert: L_next = Λ⁻¹(y_target)
        L = rate_func.invert_accumulated_rate(y_target, f_o, t_start=L)

        if L <= t_f:
            toas.append(L)

    return np.array(toas, dtype=float)


# =====================================================================
# 4. Convenience Factory
# =====================================================================

def make_rate_function(
    lambda_b: float,
    lambda_s: float,
    f_s: float,
    phi_0: float = 0.0,
    velocity_m_s: float = 0.0,
    profile: PulsarProfile | None = None,
    t_0: float = 0.0,
) -> tuple[RateFunction, float]:
    """
    Create a RateFunction and compute the observed frequency.

    Args:
        lambda_b: Background rate (ph/s)
        lambda_s: Source rate (ph/s)
        f_s: Source frequency (Hz)
        phi_0: Initial phase (cycle)
        velocity_m_s: Detector velocity along pulsar direction (m/s)
        profile: PulsarProfile (default: Crab-like)
        t_0: Start time (s)

    Returns:
        (rate_function, f_o) where f_o = (1 + v/c) · f_s
    """
    if profile is None:
        profile = PulsarProfile()

    rf = RateFunction(
        profile=profile,
        lambda_b=lambda_b,
        lambda_s=lambda_s,
        f_s=f_s,
        phi_0=phi_0,
        t_0=t_0,
    )
    f_o = rf.observed_frequency(velocity_m_s)
    return rf, f_o


def make_crab_rate_function(
    phi_0: float = 0.2,
    velocity_m_s: float = 3000.0,
    lambda_b: float = 5.0,
    lambda_s: float = 15.0,
) -> tuple[RateFunction, float]:
    """
    Convenience: Create rate function for the Crab pulsar with book-default
    parameters (§3.9, §5.7: λ_b=5, λ_s=15, v=3 km/s, φ₀=0.2).
    """
    from .pulsar_catalog import get_crab
    crab = get_crab()
    return make_rate_function(
        lambda_b=lambda_b,
        lambda_s=lambda_s,
        f_s=crab.frequency_hz(),
        phi_0=phi_0,
        velocity_m_s=velocity_m_s,
    )
