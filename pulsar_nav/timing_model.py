from __future__ import annotations

import numpy as np

from .config import SPEED_OF_LIGHT_KM_S

AU_TO_KM = 149_597_870.7
OBLIQUITY_J2000_RAD = np.radians(23.43929111)


def earth_position_ssb_km(epoch_mjd: float | np.ndarray) -> np.ndarray:
    """
    Compute Earth (EMB) position relative to the Solar System Barycenter (SSB)
    in Equatorial J2000 coordinates (kilometers).
    
    Uses Keplerian analytical orbit approximations.
    Supports scalar or array-like epoch_mjd.
    """
    # MJD of J2000.0 is 51544.5
    mjd = np.asarray(epoch_mjd, dtype=float)
    T = (mjd - 51544.5) / 36525.0
    
    # Keplerian elements for Earth-Moon Barycenter relative to Sun/SSB
    a_au = 1.00000011 - 0.00000005 * T
    e = 0.01671022 - 0.00003804 * T
    varpi_deg = 102.94719 + 0.32327 * T
    M_deg = 357.52911 + 35999.05029 * T - 0.0001559 * (T ** 2)
    
    M_rad = np.radians(M_deg)
    
    # Solve Kepler's equation: E - e sin(E) = M
    # For arrays, run a few Newton-Raphson steps
    E = M_rad.copy()
    for _ in range(5):
        E = E - (E - e * np.sin(E) - M_rad) / (1.0 - e * np.cos(E))
        
    # True anomaly v
    cos_v = (np.cos(E) - e) / (1.0 - e * np.cos(E))
    sin_v = (np.sqrt(1.0 - e**2) * np.sin(E)) / (1.0 - e * np.cos(E))
    v = np.arctan2(sin_v, cos_v)
    
    # Radial distance in AU
    r_au = a_au * (1.0 - e * np.cos(E))
    
    # Ecliptic longitude
    lambda_rad = np.radians(varpi_deg) + v
    
    # Position in Ecliptic J2000
    x_ecl = r_au * np.cos(lambda_rad)
    y_ecl = r_au * np.sin(lambda_rad)
    
    # Rotate to Equatorial J2000
    x_eq = x_ecl
    y_eq = y_ecl * np.cos(OBLIQUITY_J2000_RAD)
    z_eq = y_ecl * np.sin(OBLIQUITY_J2000_RAD)
    
    # Pack into array of shape (3,) or (N, 3)
    if mjd.ndim == 0:
        return np.array([x_eq, y_eq, z_eq]) * AU_TO_KM
    else:
        return np.column_stack([x_eq, y_eq, z_eq]) * AU_TO_KM


def roemer_delay_ssb_s(
    spacecraft_pos_earth_km: np.ndarray,
    pulsar_direction: np.ndarray,
    epoch_mjd: float | np.ndarray,
) -> float | np.ndarray:
    """
    Compute Roemer delay (seconds) relative to the Solar System Barycenter.
    
    spacecraft_pos_earth_km: (3,) or (N, 3) array of spacecraft coordinates relative to Earth.
    pulsar_direction: (3,) or (N, 3) unit vector pointing to the pulsar.
    epoch_mjd: Julian Date epoch, scalar or array.
    """
    earth_pos = earth_position_ssb_km(epoch_mjd)
    # Total position relative to SSB
    total_pos = earth_pos + spacecraft_pos_earth_km
    
    # Dot product of position and direction vector, divided by speed of light
    # We want: (total_pos dot pulsar_direction) / c
    if total_pos.ndim == 1 and pulsar_direction.ndim == 1:
        return np.dot(total_pos, pulsar_direction) / SPEED_OF_LIGHT_KM_S
    elif total_pos.ndim == 2 and pulsar_direction.ndim == 1:
        return np.dot(total_pos, pulsar_direction) / SPEED_OF_LIGHT_KM_S
    elif total_pos.ndim == 2 and pulsar_direction.ndim == 2:
        # Pairwise or element-wise dot product
        return np.sum(total_pos * pulsar_direction, axis=1) / SPEED_OF_LIGHT_KM_S
    else:
        # Fallback element-wise multiplication
        return np.sum(total_pos * pulsar_direction, axis=-1) / SPEED_OF_LIGHT_KM_S


def dispersion_delay_s(dm: float | np.ndarray, freq_mhz: float | np.ndarray) -> float | np.ndarray:
    """
    Compute interstellar medium dispersion delay (seconds).
    dm: Dispersion Measure (pc / cm^3).
    freq_mhz: Observing frequency (MHz).
    """
    # Constant coefficient in timing standard: 4.148808 * 10^3 s MHz^2 cm^3 / pc
    # Standard approximation is 4.15 * 10^3
    coefficient = 4.148808e3
    # Guard division by zero
    freq = np.maximum(freq_mhz, 1.0)
    return coefficient * dm * (freq ** -2)


def compute_total_delay_s(
    spacecraft_pos_earth_km: np.ndarray,
    pulsar_direction: np.ndarray,
    epoch_mjd: float | np.ndarray,
    dm: float | np.ndarray,
    freq_mhz: float | np.ndarray,
) -> float | np.ndarray:
    """
    Compute total timing delay combining Roemer delay and Dispersion delay.
    """
    roemer = roemer_delay_ssb_s(spacecraft_pos_earth_km, pulsar_direction, epoch_mjd)
    disp = dispersion_delay_s(dm, freq_mhz)
    return roemer + disp
