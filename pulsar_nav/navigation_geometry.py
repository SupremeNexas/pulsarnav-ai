"""
Navigation Geometry — Pulsar Directions and Observability
=========================================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 7, Sections 7.3, 7.5, 7.7

Overview
--------
To navigate using pulsars, we need to relate the measured pulse TOAs to the
spacecraft's position, velocity, accelerometer bias, and clock error. This is
done through a linear measurement model (the Kalman filter observation equation).

This module provides:

1. **Coordinate Conversion** (galactic → Cartesian):
   Pulsar catalogs list positions in galactic coordinates (longitude l, latitude b).
   We convert these to unit vectors in the ECI (Earth-Centered Inertial) J2000 frame.

2. **Direction Matrix Γ** (Eq 7.46):
   An N×3 matrix where each row is the unit direction vector to one pulsar.
   This is the core geometric structure that links position measurements to
   the 3D spacecraft position.

3. **System Dynamics** (F and Φ matrices):
   The spacecraft state evolves according to Newton's equations (plus bias/clock).
   F is the continuous-time system matrix; Φ = expm(F·T_s) is the discrete-time
   state transition matrix.

4. **Measurement Matrix H** (Eq 7.41):
   Maps the 10-dimensional state vector to the N-dimensional measurement space.
   H = [Γ | 0 | -c·1] where the columns correspond to position, velocity,
   accelerometer bias, and clock error.

5. **Observability** (Eq 7.45, Theorem 7.1):
   A necessary condition for navigation: the observability matrix O = [H; H·F; H·F²]
   must have full column rank (rank 10). This requires at least 4 pulsars with
   linearly independent direction vectors.

6. **GDOP (Geometric Dilution of Precision)**:
   Analogous to GPS GDOP, this quantifies how pulsar geometry amplifies timing errors
   into position errors. Smaller GDOP → better geometry → more accurate navigation.

The 10-State Vector:
    X = [Δx_err(3), Δv_err(3), b_a(3), t_e(1)]
    - Δx_err: 3D position error (m)
    - Δv_err: 3D velocity error (m/s)
    - b_a:    3D accelerometer bias (m/s²)
    - t_e:    clock differential time (s)
"""

from __future__ import annotations

import math
import numpy as np

from .pulsar_catalog import (
    BOOK_PULSARS,
    SPEED_OF_LIGHT_M_S,
    PulsarEntry,
)


# =====================================================================
# 1. Coordinate Conversions
# =====================================================================

def galactic_to_cartesian(l_deg: float, b_deg: float) -> np.ndarray:
    """
    Convert galactic coordinates (l, b) to a 3D unit direction vector.

    Galactic Coordinate System:
    ---------------------------
    The galactic coordinate system is centered on the Sun, with:
      - The galactic center in the direction l=0°, b=0°
      - The galactic equator (b=0) lying in the Milky Way disk plane
      - b=+90° points toward the galactic north pole (in Coma Berenices)

    The Cartesian conversion is:
        x = cos(b) × cos(l)   ← points toward galactic center direction
        y = cos(b) × sin(l)   ← points 90° around the disk
        z = sin(b)            ← points out of the disk

    Note: The galactic frame is NOT the same as the J2000 equatorial frame.
    To use pulsar directions in the ECI frame, one would need an additional
    rotation (galactic-to-equatorial). For navigation purposes, consistency
    is what matters — all pulsars must use the same reference frame.

    Args:
        l_deg: Galactic longitude (degrees). Range: [0°, 360°).
            0° = direction toward galactic center (Sagittarius).
        b_deg: Galactic latitude (degrees). Range: [-90°, +90°].
            0° = galactic plane, ±90° = galactic poles.

    Returns:
        3D unit direction vector [x, y, z] in the galactic Cartesian frame.
        This vector is already normalized (|v| = 1).
    """
    # Convert degrees to radians for Python's math trig functions
    l_rad = math.radians(l_deg)
    b_rad = math.radians(b_deg)

    # Galactic-to-Cartesian: standard spherical coordinate formulas
    # The result is always a unit vector because cos²+sin²=1 and cos²(b)(cos²(l)+sin²(l))+sin²(b)=1
    return np.array([
        math.cos(b_rad) * math.cos(l_rad),  # x component
        math.cos(b_rad) * math.sin(l_rad),  # y component
        math.sin(b_rad),                     # z component (elevation above galactic plane)
    ])


# =====================================================================
# 2. Direction Matrix Γ (Eq 7.46)
# =====================================================================

def direction_matrix_Gamma(
    pulsars: list[PulsarEntry] | None = None,
) -> np.ndarray:
    """
    Eq (7.46): Build the N×3 pulsar direction matrix Γ.

    The direction matrix contains the unit vectors pointing to each pulsar:
        Γ = [n̂^(1)ᵀ; n̂^(2)ᵀ; ...; n̂^(N)ᵀ]

    Each row H^(i) = n̂^(i) is the unit direction vector from the spacecraft
    toward pulsar i, in the navigation coordinate frame.

    Role in Navigation:
    -------------------
    The timing delay for pulsar i depends on position r via:
        Δt_i = (r · n̂^(i)) / c

    So the measurement for N pulsars is:
        Z = Γ × r / c   (plus clock and noise terms)

    This is why Γ appears in the measurement matrix H: it's the geometric
    "projection" of the spacecraft position onto each pulsar line-of-sight.

    For position to be fully determined in 3D, we need at least 3 pulsars
    with linearly independent directions (rank(Γ) = 3). In practice, 4+ are
    used to also estimate the clock bias.

    Args:
        pulsars: List of PulsarEntry objects. Default: all 8 book pulsars
            from Table 7.1 of the reference (bright, stable X-ray pulsars).

    Returns:
        N×3 direction matrix where each row is a unit 3-vector. Shape: (N, 3).
    """
    if pulsars is None:
        pulsars = BOOK_PULSARS

    # Each pulsar entry has a direction_vector() method that returns n̂^(i)
    return np.array([p.direction_vector() for p in pulsars])


# =====================================================================
# 3. System Matrix F (Eq 7.19)
# =====================================================================

def system_matrix_F() -> np.ndarray:
    """
    Eq (7.19): 10×10 continuous-time system dynamics matrix F.

    The 10-state spacecraft model has these dynamics:
        ẋ_err = v_err + 0         (position error rate = velocity error)
        v̇_err = b_a + 0           (velocity error rate = accelerometer bias)
        ḃ_a   = noise             (accelerometer bias is a random walk)
        ṫ_e   = noise             (clock error drifts randomly)

    Written as a matrix equation ẋ = F·x + w:

        F = [0₃  I₃  0₃  0]   ← position rows
            [0₃  0₃  I₃  0]   ← velocity rows
            [0₃  0₃  0₃  0]   ← bias rows (driven by noise only)
            [0   0   0   0]   ← clock row (driven by noise only)

    Notice that F³ = 0 (the system is nilpotent of degree 3). This means
    the matrix exponential (needed for state transition) terminates exactly:
        Φ = expm(F·T_s) = I + T_s·F + (T_s²/2)·F²

    The state vector is ordered as:
        indices 0:3  → position error Δx (m)
        indices 3:6  → velocity error Δv (m/s)
        indices 6:9  → accelerometer bias b_a (m/s²)
        index 9      → clock differential time t_e (s)

    Returns:
        10×10 continuous-time system matrix F.
    """
    F = np.zeros((10, 10))

    # A block: top-right I₃×₃ (row 0:3, col 3:6)
    # This says: ẋ_position = v_velocity (position changes at rate of velocity)
    F[0:3, 3:6] = np.eye(3)

    # B block: rows 3:6, cols 6:9
    # This says: v̇_velocity = b_a (velocity changes at rate of accelerometer bias)
    F[3:6, 6:9] = np.eye(3)

    # Remaining blocks are zero (bias and clock are pure random walks — no deterministic drift)
    return F


# =====================================================================
# 4. State Transition Matrix Φ (Eq 7.25–7.26)
# =====================================================================

def state_transition_Phi(T_s: float) -> np.ndarray:
    """
    Eq (7.25–7.26): 10×10 discrete-time state transition matrix Φ.

    The state transition matrix propagates the filter state one time step forward:
        X̂(k+1) = Φ × X̂(k)

    Since F³ = 0 for our system, the Taylor series of expm(F·T_s) terminates:
        Φ = I + T_s·F + (T_s²/2)·F²

    This gives the exact closed-form result (Eq 7.26):

        Φ = [I    T_s·I   ½T_s²·I   0]   ← position block
            [0    I       T_s·I     0]   ← velocity block
            [0    0       I         0]   ← bias block
            [0    0       0         1]   ← clock block

    Physical Interpretation:
    ------------------------
    This is the discrete version of Newton's kinematic equations:
        x(k+1) = x(k) + T_s·v(k) + ½T_s²·a(k)  (position update)
        v(k+1) = v(k) + T_s·a(k)                 (velocity update)
        a(k+1) = a(k)                             (bias held constant between steps)
        t_e(k+1) = t_e(k)                         (clock error held constant)

    The clock error is modeled separately from the bias since it enters
    the measurement equation differently (Eq 7.40).

    Args:
        T_s: Sampling period (seconds). Typical value: 1 second.

    Returns:
        10×10 state transition matrix Φ.
    """
    # Start from the identity matrix (zero-th order term in the Taylor expansion)
    Phi = np.eye(10)

    # First-order term: position block gets a T_s contribution from velocity
    # Φ[0:3, 3:6] = T_s·I₃  (position ← velocity propagation over T_s seconds)
    Phi[0:3, 3:6] = T_s * np.eye(3)

    # First + second-order terms combined for position ← bias:
    # Φ[0:3, 6:9] = ½T_s²·I₃  (position ← bias × ½T_s²)
    Phi[0:3, 6:9] = 0.5 * T_s**2 * np.eye(3)

    # First-order term: velocity block gets a T_s contribution from bias
    # Φ[3:6, 6:9] = T_s·I₃  (velocity ← bias propagation)
    Phi[3:6, 6:9] = T_s * np.eye(3)

    # Bias (rows 6-8) and clock (row 9) propagate as identity (no deterministic change)
    return Phi


# =====================================================================
# 5. Measurement Matrix H (Eq 7.41)
# =====================================================================

def measurement_matrix_H(
    pulsars: list[PulsarEntry] | None = None,
    c: float = SPEED_OF_LIGHT_M_S,
) -> np.ndarray:
    """
    Eq (7.41): Full N×10 measurement matrix H for the Kalman filter.

    Measurement Model:
    ------------------
    For each pulsar i, the timing measurement z^(i) is (Eq 7.40):
        z^(i) = n̂^(i)ᵀ · Δx_err - c · t_e + noise

    In matrix form for N pulsars: Z = H · X + η

    The structure of H is:
        H = [Γ | 0_{N×3} | -c·1_{N×1}]
              ↑             ↑
          N×3 position   N×1 clock column
          (direction matrix)

    Breaking this down column by column:
      - cols 0:3 = Γ (direction vectors): relates position error → timing delay
      - cols 3:6 = 0 (velocity): velocity doesn't directly appear in timing (it's
                  already included in f_o via the Doppler correction)
      - cols 6:9 = 0 (bias): accelerometer bias doesn't appear in timing measurements
      - col 9 = -c·1: clock error t_e contributes -c × t_e to each timing measurement
                       (negative because t_e is the clock delay, which subtracts
                        from the measured timing)

    Why Only Position and Clock?
    ----------------------------
    The pulsar timing measurement is essentially:
        t_measured = (r · n̂) / c + t_clock_error + noise

    The velocity and bias appear only indirectly (through the state propagation),
    not in the instantaneous measurement. This is why velocity columns are zero.

    Args:
        pulsars: List of pulsars. Default: 8 book pulsars.
        c: Speed of light in m/s. Default: 299,792,458 m/s.

    Returns:
        N×10 measurement matrix H. Shape: (N, 10).
    """
    if pulsars is None:
        pulsars = BOOK_PULSARS

    N = len(pulsars)
    Gamma = direction_matrix_Gamma(pulsars)  # N×3 direction matrix

    # Initialize H as all zeros
    H = np.zeros((N, 10))

    # C block: [Γ, 0_{N×3}] → first 3 columns are direction vectors
    # These project position error onto each pulsar's line of sight
    H[:, 0:3] = Gamma

    # Velocity block (cols 3:6) remains zero: velocity doesn't affect timing directly

    # Bias block (cols 6:9) remains zero: bias doesn't affect timing directly

    # Clock column: last column (index 9) = -c for all N pulsars
    # A positive clock error t_e makes all measured delays appear larger by c × t_e
    H[:, 9] = -c

    return H


# =====================================================================
# 6. Observability Matrix (Eq 7.45)
# =====================================================================

def observability_matrix(
    pulsars: list[PulsarEntry] | None = None,
    c: float = SPEED_OF_LIGHT_M_S,
) -> np.ndarray:
    """
    Eq (7.45): Observability matrix for the discrete navigation system.

    Definition:
    -----------
    A linear system X(k+1) = Φ·X(k), Z(k) = H·X(k) is OBSERVABLE if and only
    if the observability matrix:
        O = [H; H·Φ; H·Φ²; ...; H·Φ^{n-1}]
    has full column rank (rank = n = state dimension = 10).

    For the pulsar navigation system (nilpotent F³=0), it suffices to include
    three block rows (Eq 7.45):
        O = [H; H·F; H·F²]

    This gives a 3N×10 matrix. For rank 10, we need at least N=4 pulsars with
    3 linearly independent direction vectors.

    Why Does Observability Matter?
    --------------------------------
    If the system is NOT observable, some states cannot be estimated at all —
    measurements simply don't carry information about them. For instance, with only
    1 pulsar, we can only determine position along that pulsar's direction, not in
    the full 3D space.

    Theorem 7.1 (Book): The navigation system is fully observable if and only if:
        rank(Γ) = 3  (i.e., N ≥ 3 pulsars with non-coplanar directions)

    In practice, we need N ≥ 4 to also observe the clock bias (the 10th state).

    Args:
        pulsars: List of pulsars. Default: 8 book pulsars.
        c: Speed of light (m/s).

    Returns:
        3N×10 observability matrix O. Shape: (3*N, 10).
    """
    F = system_matrix_F()   # 10×10 continuous-time system matrix
    H = measurement_matrix_H(pulsars, c)   # N×10 measurement matrix

    # Stack three block rows: H, H·F, H·F² (Eq 7.45)
    O = np.vstack([
        H,           # How directly do measurements observe the state?
        H @ F,       # How do measurements observe the state one step in the future?
        H @ F @ F,   # Two steps in the future?
    ])
    return O


def check_observability(
    pulsars: list[PulsarEntry] | None = None,
    c: float = SPEED_OF_LIGHT_M_S,
) -> tuple[bool, int]:
    """
    Check if the navigation system is fully observable with the given pulsars.

    Computes the rank of the observability matrix O. For a 10-state system,
    full observability requires rank(O) = 10.

    Args:
        pulsars: List of PulsarEntry objects to use.
        c: Speed of light (m/s).

    Returns:
        A 2-tuple (is_observable, rank):
            is_observable: True if rank(O) ≥ 10 (fully observable).
            rank: The actual numerical rank of the observability matrix.
                  Values < 10 indicate which states are unobservable.
    """
    O = observability_matrix(pulsars, c)
    rank = int(np.linalg.matrix_rank(O))
    return rank >= 10, rank


# =====================================================================
# 7. Process Noise Covariance Q (Eq 7.29)
# =====================================================================

def process_noise_Q(
    T_s: float,
    W_v: np.ndarray | float = 1e-12,
    W_a: np.ndarray | float = 1e-14,
    W_b: np.ndarray | float = 1e-10,
    W_e: float = 1e-12,
) -> np.ndarray:
    """
    Eq (7.29): 10×10 discrete-time process noise covariance matrix Q.

    What is Process Noise?
    ----------------------
    The state transition model X(k+1) = Φ·X(k) assumes perfect dynamics.
    In reality, unmodeled forces, measurement quantization, and random disturbances
    add noise to each state. This noise is captured by the process noise covariance Q.

    Physical Sources of Process Noise:
      - W_v: Velocity noise — unmodeled forces (atmospheric drag, solar pressure,
             gravitational variations) cause random velocity perturbations.
             Units: m²/s (power spectral density of velocity noise)
      - W_a: Acceleration noise — the spacecraft dynamics model is imperfect,
             and real acceleration has random components.
             Units: m²/s³
      - W_b: Accelerometer bias drift — the accelerometer bias isn't perfectly
             constant; it drifts randomly over time.
             Units: m²/s⁵
      - W_e: Clock noise — the atomic clock has small random frequency fluctuations.
             Units: s (power spectral density of clock error)

    Derivation of Q:
    ----------------
    Starting from the continuous-time process noise covariance:
        Q_c = diag(W_v, W_a, W_b, W_e)
    The discrete-time Q is obtained by integrating: Q_d = ∫₀^{T_s} Φ(τ)·Q_c·Φ(τ)ᵀ dτ

    The resulting cross-terms arise from the coupling between position, velocity,
    and bias in the state transition matrix Φ. For example, bias noise directly
    corrupts velocity (via the v̇ = b_a term), and then velocity noise corrupts position.

    Default values (Eq 7.56 in book):
        √W_v = 10⁻⁶ m/√s  → W_v = 10⁻¹² m²/s
        √W_a = 10⁻⁷ m/√s³ → W_a = 10⁻¹⁴ m²/s³
        √W_b = 10⁻⁵ m/√s⁵ → W_b = 10⁻¹⁰ m²/s⁵
        √W_e = 10⁻⁶ √s    → W_e = 10⁻¹² s

    Args:
        T_s: Sampling period (seconds).
        W_v: Velocity process noise PSD. Scalar → 3×3 diagonal matrix.
        W_a: Acceleration noise PSD. Scalar → 3×3 diagonal matrix.
        W_b: Accelerometer bias drift PSD. Scalar → 3×3 diagonal matrix.
        W_e: Clock noise PSD (scalar).

    Returns:
        10×10 symmetric, positive semi-definite process noise covariance Q.
    """
    # Convert scalar PSDs to 3×3 diagonal matrices for 3D consistency
    if np.ndim(W_v) == 0:
        W_v = float(W_v) * np.eye(3)   # Isotropic velocity noise
    if np.ndim(W_a) == 0:
        W_a = float(W_a) * np.eye(3)   # Isotropic acceleration noise
    if np.ndim(W_b) == 0:
        W_b = float(W_b) * np.eye(3)   # Isotropic bias drift noise

    Q = np.zeros((10, 10))

    # ---- Position-Position block (0:3, 0:3) ----
    # Uncertainty in position grows due to: velocity noise (T_s), acceleration noise (T_s³/3),
    # and bias noise (T_s⁵/20). Higher powers of T_s because bias → acceleration → velocity → position.
    Q[0:3, 0:3] = T_s * W_v + (T_s**3 / 3) * W_a + (T_s**5 / 20) * W_b

    # ---- Position-Velocity cross block (0:3, 3:6) and its transpose ----
    # Correlation between position and velocity errors (they share common noise sources)
    pv = (T_s**2 / 2) * W_a + (T_s**4 / 8) * W_b
    Q[0:3, 3:6] = pv
    Q[3:6, 0:3] = pv   # Q must be symmetric

    # ---- Position-Bias cross block (0:3, 6:9) and its transpose ----
    # Position is correlated with bias through double integration
    pb = (T_s**3 / 6) * W_b
    Q[0:3, 6:9] = pb
    Q[6:9, 0:3] = pb   # Q must be symmetric

    # ---- Velocity-Velocity block (3:6, 3:6) ----
    # Velocity uncertainty grows due to acceleration noise (T_s) and bias noise (T_s³/3)
    Q[3:6, 3:6] = T_s * W_a + (T_s**3 / 3) * W_b

    # ---- Velocity-Bias cross block (3:6, 6:9) and its transpose ----
    # Velocity is correlated with bias through single integration
    vb = (T_s**2 / 2) * W_b
    Q[3:6, 6:9] = vb
    Q[6:9, 3:6] = vb   # Q must be symmetric

    # ---- Bias-Bias block (6:9, 6:9) ----
    # Bias uncertainty grows linearly with time (random walk)
    Q[6:9, 6:9] = T_s * W_b

    # ---- Clock block (9, 9) ----
    # Clock error uncertainty grows linearly with time
    Q[9, 9] = T_s * float(W_e)

    return Q


# =====================================================================
# 8. Measurement Noise Covariance R (Eq 7.38)
# =====================================================================

def measurement_noise_R(
    sigma_m_values: list[float] | np.ndarray,
) -> np.ndarray:
    """
    Eq (7.38): Measurement noise covariance matrix R.

    For each pulsar i, the timing measurement has a noise standard deviation σ_m^(i)
    (in meters, after converting from time via σ_m = c × √CRLB(t_d)).

    The measurements are independent across pulsars, so R is diagonal:
        R = diag(σ_m^(1)², σ_m^(2)², ..., σ_m^(N)²)

    Where σ_m^(i) comes from (Eq 7.31):
        σ_m^(i) = c × √CRLB(t_d^(i))

    and CRLB(t_d) is the Cramér-Rao Lower Bound for pulse delay estimation
    (see the crlb.py module for computation details).

    The measurement noise R quantifies how precisely we can time each pulsar pulse.
    It depends on:
      - The pulsar's brightness (λ_s): brighter → less noise
      - The observation duration T_obs: longer → less noise
      - The profile shape (Fisher integral I_p): sharper peaks → less noise
      - The background rate (λ_b): more background → more noise

    Args:
        sigma_m_values: List or array of measurement noise standard deviations,
            one per pulsar, in meters. Length must equal the number of pulsars N.

    Returns:
        N×N diagonal measurement noise covariance matrix. Shape: (N, N).
        Units: m².
    """
    # Convert to numpy array and create diagonal matrix (R^(i) = σ_m^(i)²)
    sigmas = np.asarray(sigma_m_values, dtype=float)
    return np.diag(sigmas ** 2)


# =====================================================================
# 9. Geometric Dilution of Precision
# =====================================================================

def geometric_dilution(
    pulsars: list[PulsarEntry] | None = None,
) -> np.ndarray:
    """
    Compute the Geometric Dilution of Precision (GDOP) matrix.

    GDOP Concept:
    -------------
    By analogy with GPS, the GDOP matrix quantifies how the geometric
    arrangement of pulsars "dilutes" or amplifies the effect of timing noise
    on position accuracy.

    The timing noise covariance in measurement space is R (N×N diagonal).
    The corresponding position estimation covariance (for the 3D position only)
    is:
        P_pos = (ΓᵀΓ)⁻¹ × σ_m²  (for isotropic noise)

    The matrix (ΓᵀΓ)⁻¹ is the GDOP matrix.

    Diagonal elements GDOP[i,i] give the variance amplification along axis i:
        σ_pos_i² = GDOP[i,i] × σ_m²

    Good Geometry (Low GDOP):
    -------------------------
    GDOP is minimized when pulsars are spread uniformly across the sky.
    This is analogous to GPS satellites spread across the sky giving lower HDOP.
    A cluster of pulsars all in the same direction gives very high GDOP
    (you know position well along that direction but not in the perpendicular plane).

    Returns:
        3×3 GDOP matrix (ΓᵀΓ)⁻¹. Diagonal entries are the per-axis DOP values.
    """
    Gamma = direction_matrix_Gamma(pulsars)  # N×3 direction matrix
    GtG = Gamma.T @ Gamma                    # 3×3 matrix: ΓᵀΓ
    return np.linalg.inv(GtG)                # Invert for GDOP


def position_dilution(pulsars: list[PulsarEntry] | None = None) -> float:
    """
    Compute the scalar Position Dilution of Precision (PDOP).

    PDOP = √(trace(GDOP)) = √(GDOP_x + GDOP_y + GDOP_z)

    It measures overall position uncertainty relative to timing uncertainty.
    A PDOP of 1.0 means position uncertainty equals the timing noise level.
    A PDOP of 3.0 means position uncertainty is 3× the timing noise.

    Smaller PDOP → better pulsar geometry → more accurate 3D navigation.

    For a perfectly uniform sky distribution of pulsars, PDOP approaches
    √3 ≈ 1.73 (theoretical minimum for 3D position estimation).

    Returns:
        Scalar PDOP value. Lower is better.
    """
    gdop = geometric_dilution(pulsars)
    return float(np.sqrt(np.trace(gdop)))
