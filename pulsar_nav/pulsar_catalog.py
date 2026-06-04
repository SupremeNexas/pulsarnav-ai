"""
Pulsar Catalog — Book Reference Data
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Tables 7.1, 7.2, and 4.1

Contains the eight X-ray pulsars used throughout the book for navigation
simulation, along with their physical parameters and computed detector rates.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
SPEED_OF_LIGHT_M_S = 299_792_458.0      # m/s  (exact)
SPEED_OF_LIGHT_KM_S = 299_792.458       # km/s


@dataclass(frozen=True)
class PulsarEntry:
    """One row from the book's pulsar tables."""
    name: str
    period_s: float                 # Pulsar period P (seconds)
    galactic_longitude_deg: float   # Galactic longitude l (degrees)
    galactic_latitude_deg: float    # Galactic latitude b (degrees)
    flux_ph_cm2_s: float            # X-ray flux in 2–10 keV (ph/cm²/s)

    # --- Derived quantities (computed for detector area A) ---

    def frequency_hz(self) -> float:
        """Source frequency f_s = 1/P."""
        return 1.0 / self.period_s

    def lambda_s(self, detector_area_cm2: float = 1e4) -> float:
        """Effective source rate λ_s = flux × A  (ph/s).  Eq (3.20)."""
        return self.flux_ph_cm2_s * detector_area_cm2

    def lambda_b(self, detector_area_cm2: float = 1e4) -> float:
        """
        Effective background rate λ_b (ph/s).
        Book convention (Table 7.2): λ_b = ceil(λ_s / 10), min 1.
        """
        ls = self.lambda_s(detector_area_cm2)
        return max(1.0, math.ceil(ls / 10.0))

    def direction_vector(self) -> np.ndarray:
        """
        Unit direction vector H^(i) from galactic coordinates (l, b).
        Converts galactic longitude/latitude to Cartesian unit vector.
        """
        l_rad = math.radians(self.galactic_longitude_deg)
        b_rad = math.radians(self.galactic_latitude_deg)
        return np.array([
            math.cos(b_rad) * math.cos(l_rad),
            math.cos(b_rad) * math.sin(l_rad),
            math.sin(b_rad),
        ])

    def sigma_distance_m(
        self,
        T_obs: float,
        detector_area_cm2: float = 1e4,
        Ip: float | None = None,
    ) -> float:
        """
        Distance estimation accuracy σ = c√CRLB(t_d).
        If Ip is not provided, it must be supplied externally.
        Eq (4.44): CRLB(t_d) = 2 / (f₂² · T_obs · I_p)
        """
        if Ip is None:
            raise ValueError("Fisher integral Ip must be provided")
        f_s = self.frequency_hz()
        crlb_td = 2.0 / (f_s**2 * T_obs * Ip)
        return SPEED_OF_LIGHT_M_S * math.sqrt(crlb_td)


# ---------------------------------------------------------------------------
# Table 7.1 — The eight pulsars from the book
# ---------------------------------------------------------------------------
BOOK_PULSARS: list[PulsarEntry] = [
    PulsarEntry("B0531+21",  0.0335, 184.56,  -5.78,  1.54e+00),
    PulsarEntry("B0540-69",  0.0504, 279.72, -31.52,  5.15e-03),
    PulsarEntry("B0833-45",  0.0893, 263.55,  -2.79,  1.59e-03),
    PulsarEntry("B1509-58",  0.1502, 320.32,  -1.16,  1.62e-02),
    PulsarEntry("B1821-24",  0.0031,   7.80,  -5.58,  1.93e-04),
    PulsarEntry("B1937+21",  0.0016,  57.51,  -0.29,  4.99e-05),
    PulsarEntry("B1055-52",  0.1971, 164.50, -52.45,  1.64e-06),
    PulsarEntry("J0437-47",  0.0057, 253.39, -41.96,  6.65e-05),
]

PULSAR_BY_NAME: dict[str, PulsarEntry] = {p.name: p for p in BOOK_PULSARS}


def get_pulsar(name: str) -> PulsarEntry:
    """Look up a pulsar by name."""
    if name not in PULSAR_BY_NAME:
        raise KeyError(f"Unknown pulsar '{name}'. Available: {list(PULSAR_BY_NAME)}")
    return PULSAR_BY_NAME[name]


def get_crab() -> PulsarEntry:
    """Convenience: the Crab pulsar (B0531+21), used in most book examples."""
    return PULSAR_BY_NAME["B0531+21"]


def direction_matrix(pulsars: list[PulsarEntry] | None = None) -> np.ndarray:
    """
    Build the N×3 direction matrix Γ (Eq 7.46):
        Γ = [H^(1); H^(2); ...; H^(N)]
    """
    if pulsars is None:
        pulsars = BOOK_PULSARS
    return np.array([p.direction_vector() for p in pulsars])


# ---------------------------------------------------------------------------
# Table 7.2 — Measurement noise σ_m for different T_obs
# ---------------------------------------------------------------------------
def measurement_sigma_m(
    pulsar: PulsarEntry,
    T_obs: float,
    Ip: float,
    detector_area_cm2: float = 1e4,
) -> float:
    """
    Measurement noise standard deviation σ_m^(i) = √R^(i) in meters.
    R^(i) = c² · var[t̂_d]^(i)  (Eq 7.31)
    var[t̂_d] ≈ CRLB(t_d) = 2/(f_s² · T_obs · I_p)  (Eq 4.44)
    """
    return pulsar.sigma_distance_m(T_obs, detector_area_cm2, Ip)
