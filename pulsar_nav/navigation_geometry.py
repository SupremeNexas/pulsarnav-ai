"""
Navigation Geometry — Pulsar Directions and Observability
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 7, Sections 7.3, 7.5, 7.7

Implements:
    - Galactic to Cartesian coordinate conversion
    - Pulsar direction matrix Γ (Eq 7.46)
    - Measurement matrix H (Eq 7.41)
    - Observability analysis (Eq 7.45, Theorem 7.1)
    - Geometric dilution of precision
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
    Convert galactic coordinates (l, b) to a unit direction vector.

    The galactic coordinate system uses:
        x = cos(b)·cos(l)
        y = cos(b)·sin(l)
        z = sin(b)

    Args:
        l_deg: Galactic longitude (degrees).
        b_deg: Galactic latitude (degrees).

    Returns:
        3D unit direction vector.
    """
    l_rad = math.radians(l_deg)
    b_rad = math.radians(b_deg)
    return np.array([
        math.cos(b_rad) * math.cos(l_rad),
        math.cos(b_rad) * math.sin(l_rad),
        math.sin(b_rad),
    ])


# =====================================================================
# 2. Direction Matrix Γ (Eq 7.46)
# =====================================================================

def direction_matrix_Gamma(
    pulsars: list[PulsarEntry] | None = None,
) -> np.ndarray:
    """
    Eq (7.46): Build the N×3 pulsar direction matrix:
        Γ = [H^(1); H^(2); ...; H^(N)]

    Each row H^(i) is the unit direction vector pointing to pulsar i.

    Args:
        pulsars: List of pulsars. Default: all 8 book pulsars.

    Returns:
        N×3 direction matrix.
    """
    if pulsars is None:
        pulsars = BOOK_PULSARS
    return np.array([p.direction_vector() for p in pulsars])


# =====================================================================
# 3. System Matrix F (Eq 7.19)
# =====================================================================

def system_matrix_F() -> np.ndarray:
    """
    Eq (7.19): 10×10 continuous-time system matrix F.

        F = [[A, B, 0],
             [0, 0, 0],
             [0, 0, 0]]

    where A = [[0_{3×3}, I_{3×3}], [0_{3×3}, 0_{3×3}]], B = [[0_{3×3}], [I_{3×3}]]
    """
    F = np.zeros((10, 10))
    # A block: top-right I_{3×3}
    F[0:3, 3:6] = np.eye(3)
    # B block: rows 0:6, cols 6:9
    F[3:6, 6:9] = np.eye(3)
    return F


# =====================================================================
# 4. State Transition Matrix Φ (Eq 7.25–7.26)
# =====================================================================

def state_transition_Phi(T_s: float) -> np.ndarray:
    """
    Eq (7.25–7.26): 10×10 discrete-time state transition matrix.

    Since F³ = 0, the matrix exponential is exact:
        Φ = I + T_s·F + (T_s²/2)·F²

    Explicit form (Eq 7.26):
        Φ = [[I, T_s·I, ½T_s²·I, 0],
             [0,   I,    T_s·I,   0],
             [0,   0,      I,     0],
             [0,   0,      0,     1]]

    Args:
        T_s: Sampling period (seconds).

    Returns:
        10×10 state transition matrix.
    """
    Phi = np.eye(10)
    # Row 0-2: position from velocity and bias
    Phi[0:3, 3:6] = T_s * np.eye(3)
    Phi[0:3, 6:9] = 0.5 * T_s**2 * np.eye(3)
    # Row 3-5: velocity from bias
    Phi[3:6, 6:9] = T_s * np.eye(3)
    # Rows 6-8 (bias) and row 9 (clock) remain identity
    return Phi


# =====================================================================
# 5. Measurement Matrix H (Eq 7.41)
# =====================================================================

def measurement_matrix_H(
    pulsars: list[PulsarEntry] | None = None,
    c: float = SPEED_OF_LIGHT_M_S,
) -> np.ndarray:
    """
    Eq (7.41): Full measurement matrix for Kalman filter.

        H = [C, 0_{N×3}, -c·1]

    where C = [[H^(1), 0_{1×3}], ..., [H^(N), 0_{1×3}]]  (N×6)

    The measurement model (Eq 7.40):
        Z(k) = H · X(k) + η(k)

    Args:
        pulsars: List of pulsars.
        c: Speed of light (m/s).

    Returns:
        N×10 measurement matrix.
    """
    if pulsars is None:
        pulsars = BOOK_PULSARS

    N = len(pulsars)
    Gamma = direction_matrix_Gamma(pulsars)  # N×3

    H = np.zeros((N, 10))
    # C block: [Γ, 0_{N×3}] → cols 0:3 = direction vectors, cols 3:6 = 0
    H[:, 0:3] = Gamma
    # Last column: -c · 1
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
    Eq (7.45): Observability matrix for the discrete system.

        O = [H; H·F; H·F²]

    The system is observable iff O has full column rank (rank 10).
    This requires N ≥ 4 pulsars with no two having the same direction vector.

    Returns:
        3N×10 observability matrix.
    """
    F = system_matrix_F()
    H = measurement_matrix_H(pulsars, c)

    O = np.vstack([
        H,
        H @ F,
        H @ F @ F,
    ])
    return O


def check_observability(
    pulsars: list[PulsarEntry] | None = None,
    c: float = SPEED_OF_LIGHT_M_S,
) -> tuple[bool, int]:
    """
    Check if the system is observable with the given pulsar set.

    Args:
        pulsars: List of pulsars.

    Returns:
        (is_observable, rank): Whether system is fully observable (rank 10)
        and the actual rank of the observability matrix.
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
    Eq (7.29): 10×10 discrete-time process noise covariance matrix.

    Full matrix with cross-terms arising from discretization of the
    continuous dynamics with correlated noise.

    Default PSD values from Eq (7.56):
        √W_v = 10⁻⁶ I (m/√s)  → W_v = 10⁻¹² I
        √W_a = 10⁻⁷ I (m/√s³) → W_a = 10⁻¹⁴ I
        √W_b = 10⁻⁵ I (m/√s⁵) → W_b = 10⁻¹⁰ I
        √W_e = 10⁻⁶ (√s)      → W_e = 10⁻¹² I

    Args:
        T_s: Sampling period (seconds).
        W_v: Velocity process noise PSD (scalar or 3×3 diagonal).
        W_a: Acceleration noise PSD.
        W_b: Bias drift noise PSD.
        W_e: Clock noise PSD (scalar).

    Returns:
        10×10 process noise covariance.
    """
    # Convert scalars to 3×3 diagonal matrices
    if np.ndim(W_v) == 0:
        W_v = float(W_v) * np.eye(3)
    if np.ndim(W_a) == 0:
        W_a = float(W_a) * np.eye(3)
    if np.ndim(W_b) == 0:
        W_b = float(W_b) * np.eye(3)

    Q = np.zeros((10, 10))

    # Position-Position block (0:3, 0:3)
    Q[0:3, 0:3] = T_s * W_v + (T_s**3 / 3) * W_a + (T_s**5 / 20) * W_b

    # Position-Velocity block (0:3, 3:6) and transpose
    pv = (T_s**2 / 2) * W_a + (T_s**4 / 8) * W_b
    Q[0:3, 3:6] = pv
    Q[3:6, 0:3] = pv

    # Position-Bias block (0:3, 6:9) and transpose
    pb = (T_s**3 / 6) * W_b
    Q[0:3, 6:9] = pb
    Q[6:9, 0:3] = pb

    # Velocity-Velocity block (3:6, 3:6)
    Q[3:6, 3:6] = T_s * W_a + (T_s**3 / 3) * W_b

    # Velocity-Bias block (3:6, 6:9) and transpose
    vb = (T_s**2 / 2) * W_b
    Q[3:6, 6:9] = vb
    Q[6:9, 3:6] = vb

    # Bias-Bias block (6:9, 6:9)
    Q[6:9, 6:9] = T_s * W_b

    # Clock block (9, 9)
    Q[9, 9] = T_s * float(W_e)

    return Q


# =====================================================================
# 8. Measurement Noise Covariance R (Eq 7.38)
# =====================================================================

def measurement_noise_R(
    sigma_m_values: list[float] | np.ndarray,
) -> np.ndarray:
    """
    Eq (7.38): Measurement noise covariance matrix.
        R = diag(R^(i))
    where R^(i) = σ_m^(i)² (already in meters²).

    Note: σ_m = c · √var[t̂_d]  (Eq 7.31)

    Args:
        sigma_m_values: List of measurement noise standard deviations (meters).

    Returns:
        N×N diagonal measurement noise covariance.
    """
    sigmas = np.asarray(sigma_m_values, dtype=float)
    return np.diag(sigmas ** 2)


# =====================================================================
# 9. Geometric Dilution of Precision
# =====================================================================

def geometric_dilution(
    pulsars: list[PulsarEntry] | None = None,
) -> np.ndarray:
    """
    Compute the geometric dilution of precision (GDOP) matrix.

    GDOP = (Γᵀ Γ)⁻¹

    The diagonal elements indicate the amplification of measurement noise
    along each axis due to pulsar geometry.

    Returns:
        3×3 GDOP matrix.
    """
    Gamma = direction_matrix_Gamma(pulsars)
    GtG = Gamma.T @ Gamma
    return np.linalg.inv(GtG)


def position_dilution(pulsars: list[PulsarEntry] | None = None) -> float:
    """
    Position DOP = √trace(GDOP).
    Smaller PDOP → better geometry → more accurate navigation.
    """
    gdop = geometric_dilution(pulsars)
    return float(np.sqrt(np.trace(gdop)))
