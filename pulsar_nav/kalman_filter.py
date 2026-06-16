"""
Recursive Estimation — Extended Kalman Filter (EKF/KF)
=======================================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 7, Sections 7.2–7.4

Overview
--------
The Kalman Filter (KF) is an optimal recursive state estimator for linear
systems with Gaussian noise. It combines two sources of information:
  1. **Prediction** (from dynamics): Where should the spacecraft be based on
     its last known state and the laws of physics?
  2. **Update** (from measurements): Where do the pulsar timing measurements
     say the spacecraft actually is?

The filter optimally weights these two estimates based on their respective
uncertainties (covariances).

For pulsar navigation, the filter operates in "error state" form — it estimates
the DIFFERENCE between the IMU (Inertial Measurement Unit) trajectory and the
true trajectory, rather than the absolute state. This is because:
  - The IMU provides a good initial trajectory estimate
  - Pulsar measurements correct accumulated IMU drift
  - The error states are small and linear (enabling the standard KF)

10-State Vector (Eq 7.17):
    X = [Δx_err(3), Δv_err(3), b_a(3), t_e(1)]

    Δx_err : 3D position error (m)        — how far is IMU trajectory from truth
    Δv_err : 3D velocity error (m/s)      — how fast is the error growing
    b_a    : 3D accelerometer bias (m/s²) — systematic error in IMU acceleration
    t_e    : clock differential time (s) — spacecraft clock offset from atomic ref

Filter Equations (from Eq 7.43):
    Prediction:
        X̂⁻(k+1) = Φ · X̂⁺(k)                          (state prediction)
        P⁻(k+1) = Φ · P⁺(k) · Φᵀ + Q                 (covariance prediction)

    Update (when measurements Z are available):
        K(k) = P⁻(k) · Hᵀ · [H · P⁻(k) · Hᵀ + R]⁻¹  (Kalman gain)
        X̂⁺(k) = X̂⁻(k) + K(k) · [Z(k) - H · X̂⁻(k)]  (state update)
        P⁺(k) = [I - K·H] · P⁻(k) · [I - K·H]ᵀ + K·R·Kᵀ  (Joseph form)

    No-measurement step:
        X̂⁺(k) = X̂⁻(k)   (state unchanged, covariance already predicted)

Joseph Form for Numerical Stability:
    The standard update P⁺ = (I-KH)P⁻ can become asymmetric due to floating-point
    errors. The Joseph form P⁺ = (I-KH)P⁻(I-KH)ᵀ + KRKᵀ is always symmetric
    and positive definite, making it numerically robust.
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
    Configuration parameters for the 10-state Kalman Filter.

    Contains the initial covariance estimates (how uncertain we are about
    the initial state) and the process noise PSDs (how noisy the dynamics are).
    Default values from Table 7.1 and Eq (7.54)–(7.56) of the reference book.

    Initial Covariance (P₀):
    ------------------------
    P₀ quantifies our initial uncertainty about the spacecraft state.
    Large P₀ means we know very little about the initial conditions.
    The filter will quickly converge toward the truth if measurements are good.

    For example, P0_x = diag(10⁶, 10⁶, 10⁶)² m² means the initial position
    uncertainty is ±10⁶ m (±1000 km) in each direction — consistent with not
    knowing the spacecraft's position at all.

    Process Noise PSDs (W):
    -----------------------
    These represent the spectral density of the random disturbances that drive
    each state component. Smaller values → more trust in the dynamics model.

    Note on units: W_v has units of m²/s (velocity variance per unit time),
    W_a has m²/s³, W_b has m²/s⁵, and W_e has s (clock variance per unit time).
    """

    # --- Initial covariance P₀ (Eq 7.54–7.55) ---

    # Position uncertainty: ±10⁶ m = ±1000 km in each axis.
    # Using np.diag(...)**2 creates a diagonal covariance matrix.
    P0_x: np.ndarray = field(default_factory=lambda: np.diag([1e6, 1e6, 1e6])**2)    # m²

    # Velocity uncertainty: different values per axis (Eq 7.55)
    # Reflects anisotropic knowledge of initial velocity.
    P0_v: np.ndarray = field(default_factory=lambda: np.diag([1e4, 1e3, 1e2])**2)     # (m/s)²

    # Accelerometer bias uncertainty: ±√10 m/s² per axis
    P0_ba: np.ndarray = field(default_factory=lambda: np.diag([10**0.5]*3)**2)         # (m/s²)²

    # Clock time uncertainty: ±1000 seconds (very large, effectively unknown)
    P0_te: float = (1e3)**2                                                             # s²

    # --- Process noise PSDs (Eq 7.56) ---

    W_v: float = 1e-12   # Velocity noise PSD: √W_v = 10⁻⁶ m/√s → very small random forces
    W_a: float = 1e-14   # Acceleration noise PSD: √W_a = 10⁻⁷ m/√s³
    W_b: float = 1e-10   # Accelerometer bias drift: √W_b = 10⁻⁵ m/√s⁵ → slow bias changes
    W_e: float = 1e-12   # Clock noise PSD: √W_e = 10⁻⁶ √s → excellent atomic clock

    # Sampling period for state propagation (seconds)
    T_s: float = 1.0

    # Observation time per pulsar measurement cycle (seconds)
    # The filter accumulates photons for T_obs seconds before making one timing measurement.
    T_obs: float = 100.0

    def initial_P(self) -> np.ndarray:
        """
        Build the full 10×10 initial error covariance matrix P₀ (Eq 7.54).

        P₀ = block_diag(P0_x, P0_v, P0_ba, P0_te)

        This is the prior covariance — our uncertainty BEFORE any measurements.
        The Kalman filter will reduce these uncertainties as measurements arrive.

        Returns:
            10×10 symmetric, positive definite initial covariance P₀.
        """
        P = np.zeros((10, 10))
        P[0:3, 0:3] = self.P0_x    # Position error covariance (top-left 3×3 block)
        P[3:6, 3:6] = self.P0_v    # Velocity error covariance (middle 3×3 block)
        P[6:9, 6:9] = self.P0_ba   # Accelerometer bias covariance (lower 3×3 block)
        P[9, 9] = self.P0_te        # Clock error covariance (bottom-right scalar)
        return P


# =====================================================================
# 2. Kalman Filter State
# =====================================================================

@dataclass
class FilterState:
    """
    Snapshot of the Kalman filter state at a single time step.

    Stores the current state estimate vector x̂ and the associated
    error covariance matrix P. The covariance P quantifies our remaining
    uncertainty about each state component after processing all available
    measurements up to this time step.

    The posterior (updated) state is denoted X̂⁺; the prior (predicted) is X̂⁻.
    After the update step, this object stores X̂⁺ and P⁺.
    """
    x: np.ndarray   # 10-dimensional state estimate vector X̂
    P: np.ndarray   # 10×10 error covariance matrix P
    k: int = 0      # Time step index (number of predict-update cycles completed)

    def position_error(self) -> np.ndarray:
        """
        Extract the 3D position error estimate Δx_err (m).

        This is the estimated deviation of the spacecraft's position from
        the IMU (dead-reckoning) trajectory. Adding this to the IMU position
        gives the best-estimate true position.

        Returns:
            3-element array [Δx, Δy, Δz] in meters.
        """
        return self.x[0:3].copy()

    def velocity_error(self) -> np.ndarray:
        """
        Extract the 3D velocity error estimate Δv_err (m/s).

        The estimated drift in velocity relative to the IMU trajectory.

        Returns:
            3-element array [Δv_x, Δv_y, Δv_z] in m/s.
        """
        return self.x[3:6].copy()

    def bias_estimate(self) -> np.ndarray:
        """
        Extract the 3D accelerometer bias estimate b_a (m/s²).

        The accelerometer bias causes the IMU to systematically over- or
        under-report acceleration, leading to growing position errors.
        The Kalman filter estimates this bias and can be used to correct it.

        Returns:
            3-element array [b_x, b_y, b_z] in m/s².
        """
        return self.x[6:9].copy()

    def clock_error(self) -> float:
        """
        Extract the clock differential time estimate t_e (s).

        The spacecraft clock may run slightly fast or slow relative to an
        ideal atomic clock. This error appears directly in timing measurements
        and must be estimated alongside position.

        Returns:
            Scalar clock error in seconds. Positive means spacecraft clock is ahead.
        """
        return float(self.x[9])

    def position_std(self) -> np.ndarray:
        """
        1σ uncertainty in position estimate, from the diagonal of P (m).

        √P[0:3, 0:3] diagonal gives the standard deviation of the position error.
        This tells us the "confidence interval" of the position estimate.

        Returns:
            3-element array [σ_x, σ_y, σ_z] in meters.
        """
        return np.sqrt(np.diag(self.P)[0:3])

    def velocity_std(self) -> np.ndarray:
        """
        1σ uncertainty in velocity estimate (m/s).

        Returns:
            3-element array [σ_vx, σ_vy, σ_vz] in m/s.
        """
        return np.sqrt(np.diag(self.P)[3:6])

    def bias_std(self) -> np.ndarray:
        """
        1σ uncertainty in accelerometer bias estimate (m/s²).

        Returns:
            3-element array [σ_bx, σ_by, σ_bz] in m/s².
        """
        return np.sqrt(np.diag(self.P)[6:9])

    def clock_std(self) -> float:
        """
        1σ uncertainty in clock error estimate (s).

        Returns:
            Scalar clock uncertainty in seconds.
        """
        return float(np.sqrt(self.P[9, 9]))


# =====================================================================
# 3. History Recorder
# =====================================================================

@dataclass
class FilterHistory:
    """
    Records the full trajectory of filter states over time, for post-run analysis.

    After running the filter for many time steps, we can:
      - Plot position error vs time to see convergence
      - Compare the filter's σ (from P) with the actual error
      - Analyze the innovation sequence for filter consistency
      - Validate the filter matches the theoretical CRLB

    The innovation sequence (Z - H·X̂⁻) should be:
      - Zero-mean (filter is unbiased)
      - White (innovations are uncorrelated across time)
      - Gaussian with covariance S = H·P⁻·Hᵀ + R

    Failures of these properties indicate filter inconsistency (e.g., Q or R wrong).
    """
    time: list[float] = field(default_factory=list)             # Time stamps (s)
    x_hat: list[np.ndarray] = field(default_factory=list)       # State estimates X̂(k)
    P_diag: list[np.ndarray] = field(default_factory=list)      # Diagonal of P(k) (10,)
    x_true: list[np.ndarray] = field(default_factory=list)      # True states (for Monte Carlo)
    innovation: list[np.ndarray] = field(default_factory=list)  # Z - H·X̂⁻ (N,)

    def record(self, t: float, state: FilterState, x_true: np.ndarray | None = None,
               innov: np.ndarray | None = None):
        """
        Record the current filter state at time t.

        Args:
            t: Current time (seconds).
            state: Current FilterState (x̂, P, k).
            x_true: True state vector (optional; used in simulations where ground truth is known).
            innov: Innovation vector from the measurement update (optional).
        """
        self.time.append(t)
        self.x_hat.append(state.x.copy())          # Store a copy (not reference!)
        self.P_diag.append(np.diag(state.P).copy())
        if x_true is not None:
            self.x_true.append(x_true.copy())
        if innov is not None:
            self.innovation.append(innov.copy())

    def to_arrays(self) -> dict:
        """
        Convert all recorded lists to numpy arrays for efficient plotting and analysis.

        Returns:
            Dictionary with keys:
                "time"       → shape (K,)
                "x_hat"      → shape (K, 10) — state estimate history
                "P_diag"     → shape (K, 10) — covariance diagonal history
                "x_true"     → shape (K, 10) — true state history (if recorded)
                "innovation" → shape (K, N)  — innovation history (if recorded)
        """
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

    This is the book-faithful implementation of the Kalman filter described in
    Chapter 7 of Emadzadeh & Speyer (2011). It estimates the error state
    X = [Δx_err, Δv_err, b_a, t_e] using pulsar timing measurements.

    System Model:
    -------------
    State equation (Eq 7.22):   X(k+1) = Φ · X(k) + w_d(k)
    Measurement equation (Eq 7.40): Z(k) = H · X(k) + η(k)

    where:
        Φ = state transition matrix (see navigation_geometry.py)
        H = measurement matrix (direction vectors + clock column)
        w_d ~ N(0, Q): process noise (unmodeled forces, sensor noise)
        η   ~ N(0, R): measurement noise (timing noise from photon statistics)

    Usage:
    ------
    1. Create a KF with default or custom configuration.
    2. Call kf.step(Z=measurement, R=meas_noise_covariance) at each time step.
    3. Read kf.state.position_error() to get the position correction.
    4. Access kf.history for the full time series of states and covariances.
    """

    def __init__(
        self,
        config: KalmanFilterConfig | None = None,
        pulsars: list[PulsarEntry] | None = None,
    ):
        """
        Initialize the Kalman filter with precomputed matrices and initial state.

        Args:
            config: Filter configuration (defaults: KalmanFilterConfig()).
            pulsars: List of pulsars to use for measurements. Default: 8 book pulsars.
        """
        self.config = config or KalmanFilterConfig()
        self.pulsars = pulsars or BOOK_PULSARS

        # ---- Observability Check (§7.5) ----
        # Before running the filter, verify that the system is actually observable
        # (i.e., all 10 states can in principle be estimated). If not, warn the user.
        is_obs, rank = check_observability(self.pulsars)
        if not is_obs:
            import warnings
            warnings.warn(
                f"System NOT fully observable with {len(self.pulsars)} pulsars "
                f"(rank={rank}, need 10). Need ≥4 pulsars with different directions."
            )

        # ---- Precompute Constant Matrices ----
        # These are computed once at initialization since they don't change during the run.

        # State transition matrix Φ (Eq 7.25–7.26): how the state propagates over one T_s step
        self.Phi = state_transition_Phi(self.config.T_s)

        # Process noise covariance Q (Eq 7.29): uncertainty added per time step
        self.Q = process_noise_Q(
            self.config.T_s,
            W_v=self.config.W_v,
            W_a=self.config.W_a,
            W_b=self.config.W_b,
            W_e=self.config.W_e,
        )

        # Measurement matrix H (Eq 7.41): maps 10D state to N-dimensional measurements
        self.H = measurement_matrix_H(self.pulsars)

        # ---- Initialize Filter State (Eq 7.42) ----
        # Initial state estimate X̂⁻₀ = E[X₀] = 0 (no knowledge of errors)
        # Initial covariance P⁻₀ = large (high uncertainty about initial state)
        self.state = FilterState(
            x=np.zeros(10),             # X̂⁻₀ = 0: best guess with no information
            P=self.config.initial_P(),   # P⁻₀: high initial uncertainty
        )

        # History recorder for post-analysis
        self.history = FilterHistory()

    def predict(self) -> None:
        """
        State Prediction Step (Eq 7.43d-e).

        Uses the deterministic dynamics model to propagate the state estimate
        and covariance forward by one time step T_s:

            X̂⁻(k+1) = Φ · X̂⁺(k)           (Eq 7.43d)
            P⁻(k+1) = Φ · P⁺(k) · Φᵀ + Q   (Eq 7.43e)

        After prediction:
          - X̂⁻(k+1) is the PRIOR state estimate (before seeing the new measurement)
          - P⁻(k+1) is the PRIOR covariance (always ≥ P⁺ due to added Q)

        The covariance grows during prediction (uncertainty increases without measurements)
        and shrinks during the update step (measurements reduce uncertainty).

        Physical Meaning:
        -----------------
        Prediction says: "Based on Newton's laws and the previous state estimate,
        where should the spacecraft be now?" The Q matrix adds uncertainty because
        unmodeled forces and sensor noise have accumulated since the last measurement.
        """
        # Propagate state estimate: X̂⁻ = Φ · X̂⁺
        self.state.x = self.Phi @ self.state.x

        # Propagate covariance: P⁻ = Φ · P⁺ · Φᵀ + Q
        # The Q term adds process noise accumulated over one time step
        self.state.P = self.Phi @ self.state.P @ self.Phi.T + self.Q

    def update(
        self,
        Z: np.ndarray,
        R: np.ndarray,
    ) -> np.ndarray:
        """
        Measurement Update Step (Eq 7.43a-c).

        Uses new pulsar timing measurements to correct the predicted state.
        The Kalman gain K optimally blends the prediction and measurement.

        Step 1: Compute Innovation (the "surprise"):
            innovation = Z - H · X̂⁻
            This is how much the actual measurement differs from the prediction.
            A large innovation means the measurement brings new information.

        Step 2: Compute Kalman Gain K (Eq 7.43a):
            S = H · P⁻ · Hᵀ + R     (innovation covariance)
            K = P⁻ · Hᵀ · S⁻¹

            K tells us how much to trust the measurement vs. the prediction:
              - If R >> H·P⁻·Hᵀ: measurements are noisy → K small → trust prediction more
              - If R << H·P⁻·Hᵀ: predictions are uncertain → K large → trust measurements more

        Step 3: Update State (Eq 7.43b):
            X̂⁺ = X̂⁻ + K · innovation

        Step 4: Update Covariance — Joseph Form (Eq 7.43c):
            P⁺ = (I - K·H) · P⁻ · (I - K·H)ᵀ + K · R · Kᵀ

            The Joseph form is numerically more stable than the standard formula
            P⁺ = (I - K·H)·P⁻ because it preserves symmetry and positive-definiteness.

        Args:
            Z: Measurement vector in meters. Shape: (N,).
                Z(k) = -(Y(k) - C·ΔX_IMU(k))  as defined in Eq 7.39.
                Each element Z[i] is the timing measurement from pulsar i, scaled by c.
            R: Measurement noise covariance. Shape: (N, N). Units: m².
                Typically diagonal: R = diag(σ_m^(1)², ..., σ_m^(N)²).

        Returns:
            Innovation vector (Z - H·X̂⁻). Shape: (N,).
            Useful for filter health monitoring (should be zero-mean and white).
        """
        H = self.H                  # N×10 measurement matrix
        x_prior = self.state.x     # Prior state estimate X̂⁻
        P_prior = self.state.P     # Prior covariance P⁻

        # ---- Innovation (measurement residual) ----
        # How much does the actual measurement Z differ from what we predicted H·X̂⁻?
        innovation = Z - H @ x_prior

        # ---- Innovation Covariance S (Eq 7.43a denominator) ----
        # S = H·P⁻·Hᵀ + R  (combines prediction uncertainty and measurement noise)
        S = H @ P_prior @ H.T + R

        # ---- Kalman Gain K (Eq 7.43a) ----
        # K = P⁻·Hᵀ·S⁻¹
        # We prefer direct matrix inversion over np.linalg.solve for this form.
        # Use pseudoinverse as fallback if S is numerically singular.
        try:
            K = P_prior @ H.T @ np.linalg.inv(S)
        except np.linalg.LinAlgError:
            K = P_prior @ H.T @ np.linalg.pinv(S)

        # ---- State Update (Eq 7.43b) ----
        # X̂⁺ = X̂⁻ + K · (Z - H·X̂⁻)
        # The Kalman gain K blends the innovation into the state estimate
        self.state.x = x_prior + K @ innovation

        # ---- Covariance Update — Joseph Form (Eq 7.43c) ----
        # P⁺ = (I - K·H) · P⁻ · (I - K·H)ᵀ + K · R · Kᵀ
        # (I - K·H) is called the "information matrix" — it reduces the covariance.
        I_KH = np.eye(10) - K @ H
        self.state.P = I_KH @ P_prior @ I_KH.T + K @ R @ K.T

        return innovation

    def no_measurement_update(self) -> None:
        """
        No-Measurement Step (Eq 7.44).

        When no pulsar measurement is available (e.g., the spacecraft is in the
        wrong orientation, or T_obs seconds haven't elapsed yet), the filter
        simply keeps the prior state and covariance unchanged:

            X̂⁺(k) = X̂⁻(k)
            P⁺(k) = P⁻(k)

        In practice, the covariance has already been inflated by Q during the
        predict step, reflecting increased uncertainty due to the missing measurement.

        This is called the "coasting" mode in navigation systems.
        """
        pass  # State and covariance remain as set by the predict step

    def step(
        self,
        Z: np.ndarray | None = None,
        R: np.ndarray | None = None,
        t: float | None = None,
        x_true: np.ndarray | None = None,
    ) -> np.ndarray | None:
        """
        Execute one complete predict-update cycle.

        This is the main interface for running the filter. Call this once per
        time step T_s:
          1. Predict: propagate state and covariance forward.
          2. Update: correct with pulsar measurements (if available).
          3. Record: save the updated state to history.

        Args:
            Z: Measurement vector (N,) in meters. If None, no update is performed
               (coasting mode — filter just propagates forward).
            R: Measurement noise covariance (N×N) in m². Required if Z is provided.
            t: Current time in seconds (for history recording). Optional.
            x_true: True state vector (10,) for comparison in simulations.
               Stored in history but not used for estimation.

        Returns:
            Innovation vector (N,) if a measurement was applied, None otherwise.
        """
        # Step 1: Predict — advance the state estimate using dynamics
        self.predict()

        # Step 2: Update — incorporate new measurement (if available)
        innovation = None
        if Z is not None and R is not None:
            innovation = self.update(Z, R)   # Full measurement update
        else:
            self.no_measurement_update()     # Coasting: no measurement available

        # Step 3: Record — save for post-analysis
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
    Run a full navigation simulation (§7.8) for validation.

    Generates a synthetic trajectory (true state) with process noise, then
    simulates pulsar timing measurements at each T_obs interval and runs the
    Kalman filter. The simulation tests whether:
      1. The filter converges to the true state
      2. The filter covariance P matches the actual estimation error
      3. The filter performance meets the CRLB predictions

    Simulation Procedure:
    ---------------------
    1. Generate a random true initial state x₀ ~ N(0, P₀).
    2. Propagate the true state forward using Φ + process noise w_d(k) ~ N(0, Q).
    3. At each measurement time (every T_obs seconds), generate a simulated
       measurement Z = H · x_true + η where η ~ N(0, R).
    4. Run the Kalman filter with these simulated measurements.
    5. Record the filter history for comparison with the true trajectory.

    Args:
        pulsars: List of pulsars used for measurements.
        sigma_m_values: Measurement noise standard deviation per pulsar (meters).
            Derived from the CRLB: σ_m = c × √CRLB(t_d).
        T_obs: Time between successive pulsar measurements (seconds).
            During T_obs, the spacecraft accumulates photons; smaller T_obs
            gives more frequent but noisier measurements.
        T_total: Total simulation duration (seconds).
        T_s: State propagation step size (seconds). Must divide T_obs evenly.
        config: Kalman filter configuration. None → default from book.
        seed: Random number generator seed for reproducibility.
        x0_true: True initial state (10,). None → sampled from P₀.

    Returns:
        A 2-tuple (kf, history):
            kf: The PulsarNavigationKF object (contains final state).
            history: FilterHistory object with the full time series.
    """
    rng = np.random.default_rng(seed)

    if config is None:
        config = KalmanFilterConfig(T_s=T_s, T_obs=T_obs)

    # Create and initialize the Kalman filter
    kf = PulsarNavigationKF(config=config, pulsars=pulsars)

    # ---- True Initial State (Eq 7.57) ----
    # Draw from the initial distribution X₀ ~ N(0, P₀)
    # This simulates not knowing the true initial state — consistent with P₀.
    if x0_true is None:
        P0 = config.initial_P()
        x0_true = rng.multivariate_normal(np.zeros(10), P0)

    # Precompute constant matrices used throughout the simulation
    Phi_true = state_transition_Phi(T_s)   # Same Φ for true dynamics
    H = measurement_matrix_H(pulsars)       # N×10 measurement matrix
    R = measurement_noise_R(sigma_m_values) # N×N diagonal measurement noise

    # ---- Simulation Loop ----
    x_true = x0_true.copy()      # Track the true (ground truth) state
    t = 0.0                      # Current simulation time
    T_m = T_obs                  # Measurement interval
    next_measurement_time = 0.0  # Time of next pulsar measurement
    n_steps = int(T_total / T_s) # Total number of time steps

    for step_idx in range(n_steps):
        t = step_idx * T_s

        # ---- Propagate True State ----
        # True state evolves as: x_true(k+1) = Φ · x_true(k) + w_d(k)
        # Process noise w_d ~ N(0, Q) represents unmodeled forces
        Q_true = process_noise_Q(T_s, config.W_v, config.W_a, config.W_b, config.W_e)
        w_d = rng.multivariate_normal(np.zeros(10), Q_true)
        x_true = Phi_true @ x_true + w_d

        # ---- Generate and Apply Measurement ----
        if t >= next_measurement_time:
            # Measurement model (Eq 7.40): Z = H · x_true + η
            # η ~ N(0, R) simulates photon counting noise from pulsar timing
            eta = rng.multivariate_normal(np.zeros(len(pulsars)), R)
            Z = H @ x_true + eta

            # Run one filter step WITH measurement
            kf.step(Z=Z, R=R, t=t, x_true=x_true)
            next_measurement_time += T_m  # Schedule next measurement
        else:
            # Run one filter step WITHOUT measurement (prediction only / coasting)
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
    Monte Carlo navigation simulation for statistical validation (§7.8).

    Runs n_realizations independent simulations (each with a different random
    seed = different true initial state and noise sequence), then computes:
      - Mean estimation error: should be ≈ 0 (filter is unbiased)
      - Monte Carlo STD: empirical standard deviation of errors across realizations
      - Analytical STD: filter's own covariance prediction √P

    If the filter is consistent (correctly tuned), the Monte Carlo STD should
    match the analytical STD. This validates that:
      - Q and R are correctly specified
      - The linear approximation is valid
      - The filter is neither over-confident nor under-confident

    This is the numerical verification procedure described in Section 7.8 of the book.

    Args:
        pulsars: List of pulsars.
        sigma_m_values: Measurement noise per pulsar (meters).
        n_realizations: Number of independent Monte Carlo runs. More → better statistics
            but longer compute time. The book uses 100–1000.
        T_obs: Measurement interval (seconds).
        T_total: Total simulation time (seconds).
        T_s: State propagation step (seconds).
        config: Filter configuration. None → default from book.
        seed: Master RNG seed. Each realization gets a different derived seed.

    Returns:
        Dictionary with keys:
            "time"           → shape (K,): time array in seconds
            "mean_error"     → shape (K, 10): mean error across realizations
            "mc_std"         → shape (K, 10): empirical std deviation
            "analytical_std" → shape (K, 10): filter's predicted std (from P diagonal)
            "n_realizations" → int: number of completed realizations
    """
    rng = np.random.default_rng(seed)

    if config is None:
        config = KalmanFilterConfig(T_s=T_s, T_obs=T_obs)

    n_steps = int(T_total / T_s)

    # Storage: rows = realizations, columns = time steps, depth = state components
    all_errors = np.zeros((n_realizations, n_steps, 10))
    analytical_P = None  # P diagonal from one representative run (same for all)

    # ---- Run Each Realization ----
    for r in range(n_realizations):
        # Give each realization a different (but deterministic) seed
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

        # Store the estimation error: error(r, k) = X̂(k) - X_true(k)
        if len(arrays.get("x_true", [])) == n_steps and len(arrays.get("x_hat", [])) == n_steps:
            all_errors[r] = arrays["x_hat"] - arrays["x_true"]

        # Store the analytical P diagonal from the first successful run
        # (P is deterministic for linear systems — same for all realizations)
        if analytical_P is None and len(arrays.get("P_diag", [])) == n_steps:
            analytical_P = arrays["P_diag"]

    # ---- Compute Statistics ----
    time_arr = np.arange(n_steps) * T_s

    # Mean error across all realizations (should ≈ 0 for unbiased filter)
    mean_error = np.mean(all_errors, axis=0)

    # Monte Carlo standard deviation (empirical measure of actual error spread)
    mc_std = np.std(all_errors, axis=0)

    # Analytical standard deviation from filter covariance (the filter's self-estimate)
    # If filter is consistent: mc_std ≈ analytical_std
    analytical_std = np.sqrt(analytical_P) if analytical_P is not None else mc_std

    return {
        "time": time_arr,
        "mean_error": mean_error,
        "mc_std": mc_std,
        "analytical_std": analytical_std,
        "n_realizations": n_realizations,
    }
