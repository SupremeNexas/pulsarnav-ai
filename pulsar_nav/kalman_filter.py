"""
Recursive Estimation — Extended Kalman Filter
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 7, Sections 7.2–7.4

Implements the book-faithful 10-state Kalman filter for relative/absolute
spacecraft navigation using X-ray pulsar measurements.

State vector (Eq 7.17): X = [X_e(6); b_a(3); t_e(1)]
    X_e = [Δx_err(3); Δv_err(3)]  — position/velocity error
    b_a(3)  — relative accelerometer bias
    t_e(1)  — clock differential time

System dynamics (Eq 7.22): X(k+1) = Φ·X(k) + w_d(k)
Measurements (Eq 7.40): Z(k) = H·X(k) + η(k)
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .pulsar_catalog import BOOK_PULSARS, SPEED_OF_LIGHT_M_S, PulsarEntry
from .navigation_geometry import (
    state_transition_Phi,
    measurement_matrix_H,
    process_noise_Q,
    measurement_noise_R,
    check_observability,
)


# =====================================================================
# 1. Filter Configuration
# =====================================================================

@dataclass
class KalmanFilterConfig:
    """
    Configuration for the 10-state Kalman filter.
    Default values from Eq (7.54)–(7.56).
    """
    # Initial covariance P₀ (Eq 7.54–7.55)
    P0_x: np.ndarray = field(default_factory=lambda: np.diag([1e6, 1e6, 1e6])**2)    # (m²)
    P0_v: np.ndarray = field(default_factory=lambda: np.diag([1e4, 1e3, 1e2])**2)     # (m/s)²
    P0_ba: np.ndarray = field(default_factory=lambda: np.diag([10**0.5]*3)**2)         # (m/s²)²
    P0_te: float = (1e3)**2                                                             # s²

    # Process noise PSDs (Eq 7.56)
    W_v: float = 1e-12     # (10⁻⁶)² = 10⁻¹² m²/s
    W_a: float = 1e-14     # (10⁻⁷)² = 10⁻¹⁴ m²/s³
    W_b: float = 1e-10     # (10⁻⁵)² = 10⁻¹⁰ m²/s⁵
    W_e: float = 1e-12     # (10⁻⁶)² = 10⁻¹² s

    # Sampling period
    T_s: float = 1.0       # seconds (for state propagation)

    # Measurement parameters
    T_obs: float = 100.0   # seconds (observation time per measurement)

    def initial_P(self) -> np.ndarray:
        """Build full 10×10 initial covariance matrix P₀ (Eq 7.54)."""
        P = np.zeros((10, 10))
        P[0:3, 0:3] = self.P0_x
        P[3:6, 3:6] = self.P0_v
        P[6:9, 6:9] = self.P0_ba
        P[9, 9] = self.P0_te
        return P


# =====================================================================
# 2. Kalman Filter State
# =====================================================================

@dataclass
class FilterState:
    """Current state of the Kalman filter."""
    x: np.ndarray          # 10-dim state estimate
    P: np.ndarray          # 10×10 error covariance
    k: int = 0             # Time step index

    def position_error(self) -> np.ndarray:
        """Extract Δx error estimate (m)."""
        return self.x[0:3].copy()

    def velocity_error(self) -> np.ndarray:
        """Extract Δv error estimate (m/s)."""
        return self.x[3:6].copy()

    def bias_estimate(self) -> np.ndarray:
        """Extract accelerometer bias estimate (m/s²)."""
        return self.x[6:9].copy()

    def clock_error(self) -> float:
        """Extract clock differential time estimate (s)."""
        return float(self.x[9])

    def position_std(self) -> np.ndarray:
        """√P diagonal for position (m)."""
        return np.sqrt(np.diag(self.P)[0:3])

    def velocity_std(self) -> np.ndarray:
        """√P diagonal for velocity (m/s)."""
        return np.sqrt(np.diag(self.P)[3:6])

    def bias_std(self) -> np.ndarray:
        """√P diagonal for bias (m/s²)."""
        return np.sqrt(np.diag(self.P)[6:9])

    def clock_std(self) -> float:
        """√P for clock (s)."""
        return float(np.sqrt(self.P[9, 9]))


# =====================================================================
# 3. History Recorder
# =====================================================================

@dataclass
class FilterHistory:
    """Records filter states over time for analysis."""
    time: list[float] = field(default_factory=list)
    x_hat: list[np.ndarray] = field(default_factory=list)
    P_diag: list[np.ndarray] = field(default_factory=list)
    x_true: list[np.ndarray] = field(default_factory=list)
    innovation: list[np.ndarray] = field(default_factory=list)

    def record(self, t: float, state: FilterState, x_true: np.ndarray | None = None,
               innov: np.ndarray | None = None):
        self.time.append(t)
        self.x_hat.append(state.x.copy())
        self.P_diag.append(np.diag(state.P).copy())
        if x_true is not None:
            self.x_true.append(x_true.copy())
        if innov is not None:
            self.innovation.append(innov.copy())

    def to_arrays(self) -> dict:
        """Convert to numpy arrays for plotting."""
        result = {
            "time": np.array(self.time),
            "x_hat": np.array(self.x_hat),
            "P_diag": np.array(self.P_diag),
        }
        if self.x_true:
            result["x_true"] = np.array(self.x_true)
        if self.innovation:
            result["innovation"] = np.array(self.innovation)
        return result


# =====================================================================
# 4. Pulsar Navigation Kalman Filter (Chapter 7)
# =====================================================================

class PulsarNavigationKF:
    """
    10-state Kalman Filter for X-ray pulsar navigation (§7.2–7.4).

    Implements the exact equations from the book:
        - State prediction (Eq 7.43d-e)
        - Measurement update (Eq 7.43a-c)
        - Joseph form covariance update (Eq 7.43c)
        - No-measurement propagation (Eq 7.44)
    """

    def __init__(
        self,
        config: KalmanFilterConfig | None = None,
        pulsars: list[PulsarEntry] | None = None,
    ):
        """
        Initialize the Kalman filter.

        Args:
            config: Filter configuration with initial conditions and PSDs.
            pulsars: List of pulsars for measurements.
        """
        self.config = config or KalmanFilterConfig()
        self.pulsars = pulsars or BOOK_PULSARS

        # Verify observability (§7.5)
        is_obs, rank = check_observability(self.pulsars)
        if not is_obs:
            import warnings
            warnings.warn(
                f"System NOT fully observable with {len(self.pulsars)} pulsars "
                f"(rank={rank}, need 10). Need ≥4 pulsars with different directions."
            )

        # Precompute matrices
        self.Phi = state_transition_Phi(self.config.T_s)
        self.Q = process_noise_Q(
            self.config.T_s,
            W_v=self.config.W_v,
            W_a=self.config.W_a,
            W_b=self.config.W_b,
            W_e=self.config.W_e,
        )
        self.H = measurement_matrix_H(self.pulsars)

        # Initialize filter state (Eq 7.42)
        self.state = FilterState(
            x=np.zeros(10),                      # X̂⁻₀ = E[X₀] = 0 (Eq 7.42a)
            P=self.config.initial_P(),            # P⁻₀ (Eq 7.42b)
        )

        self.history = FilterHistory()

    def predict(self) -> None:
        """
        State prediction step (Eq 7.43d-e).

            X̂⁻_{k+1} = Φ · X̂⁺_k           (Eq 7.43d)
            P⁻_{k+1} = Φ · P⁺_k · Φᵀ + Q   (Eq 7.43e)
        """
        self.state.x = self.Phi @ self.state.x
        self.state.P = self.Phi @ self.state.P @ self.Phi.T + self.Q

    def update(
        self,
        Z: np.ndarray,
        R: np.ndarray,
    ) -> np.ndarray:
        """
        Measurement update step (Eq 7.43a-c).

        Args:
            Z: Measurement vector (N,) in meters.
               Z(k) = -(Y(k) - C·ΔX_IMU(k))  (Eq 7.39)
            R: Measurement noise covariance (N×N) in m².

        Returns:
            Innovation vector (Z - H·X̂⁻).
        """
        H = self.H
        x_prior = self.state.x
        P_prior = self.state.P

        # Innovation
        innovation = Z - H @ x_prior

        # Kalman gain (Eq 7.43a)
        S = H @ P_prior @ H.T + R
        try:
            K = P_prior @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            K = P_prior @ H.T @ np.linalg.pinv(S)

        # State update (Eq 7.43b)
        self.state.x = x_prior + K @ innovation

        # Covariance update — Joseph form (Eq 7.43c)
        # P⁺ = [I - K·H] · P⁻ · [I - K·H]ᵀ + K · R · Kᵀ
        I_KH = np.eye(10) - K @ H
        self.state.P = I_KH @ P_prior @ I_KH.T + K @ R @ K.T

        return innovation

    def no_measurement_update(self) -> None:
        """
        Eq (7.44): When no measurement is available.
            X̂⁺_k = X̂⁻_k
        (No update — a priori and a posteriori are equal.)
        """
        pass  # State and covariance remain unchanged

    def step(
        self,
        Z: np.ndarray | None = None,
        R: np.ndarray | None = None,
        t: float | None = None,
        x_true: np.ndarray | None = None,
    ) -> np.ndarray | None:
        """
        One full predict-update cycle.

        Args:
            Z: Measurement vector (or None if no measurement available).
            R: Measurement noise covariance (or None).
            t: Current time (for history recording).
            x_true: True state (for history recording).

        Returns:
            Innovation vector if measurement was applied, None otherwise.
        """
        # Predict
        self.predict()

        # Update
        innovation = None
        if Z is not None and R is not None:
            innovation = self.update(Z, R)
        else:
            self.no_measurement_update()

        # Record
        self.state.k += 1
        if t is not None:
            self.history.record(t, self.state, x_true, innovation)

        return innovation


# =====================================================================
# 5. Simulation Framework (for §7.8 validation)
# =====================================================================

def simulate_navigation(
    pulsars: list[PulsarEntry],
    sigma_m_values: list[float] | np.ndarray,
    T_obs: float = 100.0,
    T_total: float = 1200.0,
    T_s: float = 1.0,
    config: KalmanFilterConfig | None = None,
    seed: int = 42,
    x0_true: np.ndarray | None = None,
) -> tuple[PulsarNavigationKF, FilterHistory]:
    """
    Run a full navigation simulation (§7.8).

    Simulates the Kalman filter with synthetic measurements generated
    from the true state and measurement noise.

    Args:
        pulsars: List of pulsars to use.
        sigma_m_values: Measurement noise σ_m for each pulsar (meters).
        T_obs: Measurement interval (seconds).
        T_total: Total simulation time (seconds).
        T_s: State propagation sampling period (seconds).
        config: Filter configuration (None → default from book).
        seed: RNG seed.
        x0_true: True initial state (10,). Default: random from P₀.

    Returns:
        (filter, history): The filter object and recorded history.
    """
    rng = np.random.default_rng(seed)

    if config is None:
        config = KalmanFilterConfig(T_s=T_s, T_obs=T_obs)

    # Initialize filter
    kf = PulsarNavigationKF(config=config, pulsars=pulsars)

    # True initial state (Eq 7.57: X₀ ~ N(0, P₀))
    if x0_true is None:
        P0 = config.initial_P()
        x0_true = rng.multivariate_normal(np.zeros(10), P0)

    # True state evolution
    Phi_true = state_transition_Phi(T_s)

    # Measurement matrix and noise
    H = measurement_matrix_H(pulsars)
    R = measurement_noise_R(sigma_m_values)

    # Simulation loop
    x_true = x0_true.copy()
    t = 0.0
    T_m = T_obs  # Measurement period
    next_measurement_time = 0.0
    n_steps = int(T_total / T_s)

    for step_idx in range(n_steps):
        t = step_idx * T_s

        # Propagate true state (noise-free for simplicity in validation)
        # In full simulation, add process noise w_d(k)
        Q_true = process_noise_Q(T_s, config.W_v, config.W_a, config.W_b, config.W_e)
        w_d = rng.multivariate_normal(np.zeros(10), Q_true)
        x_true = Phi_true @ x_true + w_d

        # Check if measurement is available
        if t >= next_measurement_time:
            # Generate measurement (Eq 7.40): Z = H·X_true + η
            eta = rng.multivariate_normal(np.zeros(len(pulsars)), R)
            Z = H @ x_true + eta
            kf.step(Z=Z, R=R, t=t, x_true=x_true)
            next_measurement_time += T_m
        else:
            kf.step(t=t, x_true=x_true)

    return kf, kf.history


# =====================================================================
# 6. Monte Carlo Simulation (for §7.8 validation)
# =====================================================================

def monte_carlo_navigation(
    pulsars: list[PulsarEntry],
    sigma_m_values: list[float] | np.ndarray,
    n_realizations: int = 100,
    T_obs: float = 100.0,
    T_total: float = 1200.0,
    T_s: float = 1.0,
    config: KalmanFilterConfig | None = None,
    seed: int = 42,
) -> dict:
    """
    Monte Carlo navigation simulation (§7.8).

    Runs n_realizations simulations and computes:
        - Mean estimation error
        - Monte Carlo STD (empirical)
        - Analytical STD (from filter covariance)

    Returns:
        Dictionary with arrays for time, mean error, MC STD, and analytical STD.
    """
    rng = np.random.default_rng(seed)

    if config is None:
        config = KalmanFilterConfig(T_s=T_s, T_obs=T_obs)

    n_steps = int(T_total / T_s)

    # Storage
    all_errors = np.zeros((n_realizations, n_steps, 10))
    analytical_P = None  # Will be the same for all realizations

    for r in range(n_realizations):
        r_seed = rng.integers(0, 2**31)
        kf, hist = simulate_navigation(
            pulsars=pulsars,
            sigma_m_values=sigma_m_values,
            T_obs=T_obs,
            T_total=T_total,
            T_s=T_s,
            config=config,
            seed=r_seed,
        )

        arrays = hist.to_arrays()
        if len(arrays.get("x_true", [])) == n_steps and len(arrays.get("x_hat", [])) == n_steps:
            all_errors[r] = arrays["x_hat"] - arrays["x_true"]

        if analytical_P is None and len(arrays.get("P_diag", [])) == n_steps:
            analytical_P = arrays["P_diag"]

    # Compute statistics
    time_arr = np.arange(n_steps) * T_s
    mean_error = np.mean(all_errors, axis=0)
    mc_std = np.std(all_errors, axis=0)
    analytical_std = np.sqrt(analytical_P) if analytical_P is not None else mc_std

    return {
        "time": time_arr,
        "mean_error": mean_error,
        "mc_std": mc_std,
        "analytical_std": analytical_std,
        "n_realizations": n_realizations,
    }
