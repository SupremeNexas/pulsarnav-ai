"""
Timing Model — Barycentric Corrections for Pulsar Navigation
============================================================
Reference: "Navigation in Space by X-ray Pulsars" (Emadzadeh & Speyer, 2011)
    Chapter 4 (Sections 4.3–4.4), Chapter 7 (Section 7.3.2)

Background
----------
Pulsar timing is always done relative to the Solar System Barycenter (SSB) —
the center of mass of the entire solar system. This is because pulsars emit
radio/X-ray pulses with extremely regular timing, but observing from a moving
platform (a spacecraft or the Earth) introduces Doppler-like delays.

The main delay terms are:

1. **Römer Delay** (dominant term):
   The light-travel-time delay due to the finite position of the observer
   relative to the SSB.
   Δt_R = (r_sc · n̂) / c
   where r_sc is the spacecraft position relative to SSB and n̂ is the
   unit vector pointing to the pulsar.

2. **Dispersion Delay** (frequency-dependent):
   Electromagnetic waves travel more slowly through the interstellar medium
   (ISM) at lower frequencies due to free electrons. The delay scales as 1/f².
   Δt_DM = DM_coefficient × DM / f²
   where DM is the Dispersion Measure (electron column density in pc/cm³).

This module provides functions to compute both delay terms and combine them
into a total timing correction.
"""

from __future__ import annotations

import numpy as np

from .config import SPEED_OF_LIGHT_KM_S

# -----------------------------------------------------------------------
# Physical constants used in this module
# -----------------------------------------------------------------------

# 1 Astronomical Unit (AU) in kilometers.
# 1 AU = average Earth-Sun distance ≈ 149,597,870.7 km.
AU_TO_KM = 149_597_870.7

# Obliquity of the ecliptic at J2000.0 epoch (degrees converted to radians).
# This is the tilt angle between Earth's orbital plane (ecliptic) and the
# equatorial plane. It is needed to rotate ecliptic coordinates to equatorial
# (RA/Dec) coordinates. Value: 23.43929111°.
OBLIQUITY_J2000_RAD = np.radians(23.43929111)


# =====================================================================
# Function 1: Earth Position at the SSB
# =====================================================================

def earth_position_ssb_km(epoch_mjd: float | np.ndarray) -> np.ndarray:
    """
    Compute Earth (Earth-Moon Barycenter, EMB) position relative to the
    Solar System Barycenter (SSB) in Equatorial J2000 coordinates (km).

    This is needed because pulsar timing is always referred to the SSB.
    The total spacecraft position relative to the SSB is:
        r_ssb = r_earth_ssb + r_spacecraft_earth

    Uses a Keplerian analytical orbit approximation for the Earth-Moon
    Barycenter (EMB) around the Sun. This is sufficiently accurate for
    navigation purposes (errors < few hundred km over decadal timescales).

    What is J2000?
    --------------
    J2000.0 is a standard astronomical reference epoch: January 1, 2000,
    at 12:00 Terrestrial Time. Coordinates labeled "J2000" are defined
    relative to Earth's equator and equinox at this epoch. The J2000 frame
    is used because it is inertial (non-rotating) and well-defined.

    Modified Julian Date (MJD):
    ---------------------------
    MJD = JD - 2,400,000.5. The J2000 epoch corresponds to MJD = 51544.5.

    Args:
        epoch_mjd: Observation epoch as Modified Julian Date (MJD).
            Can be a scalar or an array of N epochs.

    Returns:
        Earth position vector in km, in the Equatorial J2000 frame.
        Shape: (3,) for scalar input, (N, 3) for array input.
    """
    # MJD of J2000.0 is 51544.5
    # T = Julian centuries since J2000.0 (1 Julian century = 36525 days)
    # This is the standard time variable for planetary orbit computations.
    mjd = np.asarray(epoch_mjd, dtype=float)
    T = (mjd - 51544.5) / 36525.0

    # ---- Keplerian orbital elements for Earth-Moon Barycenter ----
    # These slowly change with time (secular terms in T) due to planetary
    # perturbations from Jupiter and Saturn. These are the standard values
    # from the JPL DE series / Astronomical Almanac.

    # Semi-major axis in AU (distance between Earth and Sun center)
    a_au = 1.00000011 - 0.00000005 * T

    # Orbital eccentricity (0 = circle, 1 = parabola; Earth's is ~0.0167)
    e = 0.01671022 - 0.00003804 * T

    # Longitude of perihelion in degrees
    # Perihelion is the point in Earth's orbit closest to the Sun.
    varpi_deg = 102.94719 + 0.32327 * T

    # Mean anomaly M (degrees): how far along the orbit we'd be if it were circular.
    # M = 0 at perihelion. The large coefficient (35999.05029) is the number of
    # degrees per Julian century that Earth traverses.
    M_deg = 357.52911 + 35999.05029 * T - 0.0001559 * (T ** 2)

    # Convert mean anomaly to radians for trig functions
    M_rad = np.radians(M_deg)

    # ---- Solve Kepler's Equation: E - e·sin(E) = M ----
    # E is the "eccentric anomaly" — an intermediate angle that accounts for the
    # non-uniform speed of Earth in its elliptical orbit (Kepler's 2nd law).
    # We can't solve this algebraically, so we iterate using Newton-Raphson:
    #   E_{n+1} = E_n - (E_n - e·sin(E_n) - M) / (1 - e·cos(E_n))
    # Starting guess: E ≈ M (works well for small eccentricity like Earth's).
    E = M_rad.copy()
    for _ in range(5):
        # Newton-Raphson step; 5 iterations is more than enough for Earth's eccentricity
        E = E - (E - e * np.sin(E) - M_rad) / (1.0 - e * np.cos(E))

    # ---- Compute True Anomaly v ----
    # True anomaly v is the actual angle of Earth in its orbit relative to perihelion.
    # It differs from M because Earth speeds up near perihelion (Kepler's 2nd law).
    cos_v = (np.cos(E) - e) / (1.0 - e * np.cos(E))
    sin_v = (np.sqrt(1.0 - e**2) * np.sin(E)) / (1.0 - e * np.cos(E))
    v = np.arctan2(sin_v, cos_v)

    # ---- Radial distance in AU ----
    # For an ellipse: r = a(1 - e·cos(E))
    r_au = a_au * (1.0 - e * np.cos(E))

    # ---- Ecliptic longitude λ ----
    # The ecliptic is Earth's orbital plane. Longitude λ measured from the
    # vernal equinox (the direction where Sun appears to cross the celestial equator).
    lambda_rad = np.radians(varpi_deg) + v

    # ---- Position in Ecliptic J2000 frame ----
    # In the ecliptic frame, the z-axis is perpendicular to Earth's orbital plane.
    x_ecl = r_au * np.cos(lambda_rad)
    y_ecl = r_au * np.sin(lambda_rad)
    # z_ecl = 0 (Earth stays in the ecliptic plane by definition)

    # ---- Rotate from Ecliptic to Equatorial J2000 ----
    # The equatorial frame uses Earth's equatorial plane as z=0.
    # The angle between the ecliptic and equatorial planes is the obliquity ε.
    # Rotation about the x-axis by ε:
    #   x_eq = x_ecl
    #   y_eq = y_ecl · cos(ε)
    #   z_eq = y_ecl · sin(ε)
    x_eq = x_ecl
    y_eq = y_ecl * np.cos(OBLIQUITY_J2000_RAD)
    z_eq = y_ecl * np.sin(OBLIQUITY_J2000_RAD)

    # Convert from AU to km and package into a (3,) or (N, 3) array
    if mjd.ndim == 0:
        return np.array([x_eq, y_eq, z_eq]) * AU_TO_KM
    else:
        return np.column_stack([x_eq, y_eq, z_eq]) * AU_TO_KM


# =====================================================================
# Function 2: Römer Delay
# =====================================================================

def roemer_delay_ssb_s(
    spacecraft_pos_earth_km: np.ndarray,
    pulsar_direction: np.ndarray,
    epoch_mjd: float | np.ndarray,
) -> float | np.ndarray:
    """
    Compute the Römer delay (seconds) of a pulsar signal, relative to the SSB.

    What is the Römer Delay?
    -------------------------
    When you observe a pulsar from different positions in space, the pulses
    arrive at different times simply because of the different light travel times.
    If your spacecraft is 1 AU further along the direction to the pulsar, pulses
    arrive about 8.3 minutes later (since light takes ~8.3 min to travel 1 AU).

    The Römer delay is:
        Δt_R = (r_sc · n̂) / c

    where:
        r_sc = spacecraft position relative to SSB (km)
        n̂   = unit vector from SSB to pulsar
        c    = speed of light (km/s)

    This is the dominant timing correction — it can be several hundred seconds
    for a spacecraft at 1 AU from the SSB observing a pulsar in the ecliptic plane.

    Navigation Principle:
    ---------------------
    The Römer delay depends on the spacecraft position r_sc. If we measure the
    actual photon arrival time and compare it to the expected arrival time at the SSB,
    the difference is the Römer delay, and we can invert this to get the position
    along the pulsar direction: r_sc · n̂ = c × Δt_R.

    Args:
        spacecraft_pos_earth_km: Spacecraft position relative to Earth center (km).
            Shape: (3,) for a single position, or (N, 3) for N positions.
        pulsar_direction: Unit vector pointing from SSB toward the pulsar.
            Shape: (3,) for a single pulsar, or (N, 3) for N pulsars.
        epoch_mjd: Observation epoch (Modified Julian Date). Scalar or array.

    Returns:
        Römer delay in seconds. Scalar or array matching input shapes.
    """
    # Compute Earth position relative to SSB at the given epoch(s)
    earth_pos = earth_position_ssb_km(epoch_mjd)

    # Total spacecraft position relative to SSB = Earth position + spacecraft-to-Earth offset
    total_pos = earth_pos + spacecraft_pos_earth_km

    # Römer delay = (position · pulsar_direction) / c
    # This projects the position vector onto the pulsar direction and divides by c.
    # The dot product gives the component of the position along the pulsar line-of-sight.
    if total_pos.ndim == 1 and pulsar_direction.ndim == 1:
        # Both single vectors: standard dot product
        return np.dot(total_pos, pulsar_direction) / SPEED_OF_LIGHT_KM_S
    elif total_pos.ndim == 2 and pulsar_direction.ndim == 1:
        # Multiple positions, single pulsar direction: dot each row with the direction
        return np.dot(total_pos, pulsar_direction) / SPEED_OF_LIGHT_KM_S
    elif total_pos.ndim == 2 and pulsar_direction.ndim == 2:
        # Multiple positions, multiple pulsars: element-wise dot products (pairwise)
        return np.sum(total_pos * pulsar_direction, axis=1) / SPEED_OF_LIGHT_KM_S
    else:
        # General fallback using last axis reduction
        return np.sum(total_pos * pulsar_direction, axis=-1) / SPEED_OF_LIGHT_KM_S


# =====================================================================
# Function 3: Dispersion Delay
# =====================================================================

def dispersion_delay_s(dm: float | np.ndarray, freq_mhz: float | np.ndarray) -> float | np.ndarray:
    """
    Compute the interstellar medium (ISM) dispersion delay (seconds).

    What is Dispersion Delay?
    --------------------------
    The interstellar medium (ISM) contains free electrons. When electromagnetic
    radiation passes through this plasma, lower-frequency photons travel more
    slowly than higher-frequency photons. This causes pulsar pulses to arrive
    later at lower frequencies — they are "dispersed" in time.

    The dispersion delay formula (from plasma physics):
        Δt_DM = K × DM / f²

    where:
        K   = 4.148808 × 10³ s MHz² pc⁻¹ cm³  (dispersion constant)
        DM  = Dispersion Measure (pc/cm³) — the integrated electron column density
              along the line of sight to the pulsar
        f   = observing frequency in MHz

    Physical Meaning of DM:
    -------------------------
    DM = ∫ n_e dl  (integrated along the line of sight, from observer to pulsar)
    where n_e is the free electron number density in electrons/cm³ and dl is a
    path element in parsecs (1 parsec ≈ 3.086 × 10¹³ km).

    Higher DM → more electrons → larger dispersion delay.
    Higher frequency → smaller delay (because higher-energy photons are less affected).

    Example:
    --------
    For the Crab Pulsar: DM ≈ 56.8 pc/cm³, f = 1400 MHz:
        Δt_DM ≈ 4148.808 × 56.8 / 1400² ≈ 0.120 seconds

    For X-ray navigation (f ~ 10⁹ MHz), the dispersion delay is negligible,
    but for radio pulsar timing at 100-1400 MHz, it must be corrected precisely.

    Args:
        dm: Dispersion Measure in pc/cm³.
        freq_mhz: Observing frequency in MHz. Must be > 0.

    Returns:
        Dispersion delay in seconds.
    """
    # Standard dispersion constant from pulsar timing literature.
    # Full value: K = e² / (2π m_e c) ≈ 4.148808 × 10³ s MHz² pc⁻¹ cm³
    coefficient = 4.148808e3

    # Guard against division by zero at f = 0. Clamp to at least 1 MHz.
    # (A frequency of 0 MHz would imply infinite dispersion delay, which is unphysical.)
    freq = np.maximum(freq_mhz, 1.0)

    # Delay scales as 1/f² (lower frequencies arrive later)
    return coefficient * dm * (freq ** -2)


# =====================================================================
# Function 4: Total Timing Delay
# =====================================================================

def compute_total_delay_s(
    spacecraft_pos_earth_km: np.ndarray,
    pulsar_direction: np.ndarray,
    epoch_mjd: float | np.ndarray,
    dm: float | np.ndarray,
    freq_mhz: float | np.ndarray,
) -> float | np.ndarray:
    """
    Compute the total pulsar timing delay: Römer + Dispersion delays.

    In a complete pulsar timing model (like those used by radio observatories),
    there are additional terms:
      - Einstein delay: relativistic time dilation (important for binary pulsars)
      - Shapiro delay: gravitational delay near massive bodies
      - Proper motion: the pulsar's own motion across the sky

    For spacecraft navigation, the Römer delay dominates and must be included.
    The dispersion delay is important for radio observations but negligible for X-rays.
    The remaining terms are small corrections not implemented here.

    Total delay:
        Δt_total = Δt_Römer + Δt_DM

    Args:
        spacecraft_pos_earth_km: Spacecraft position relative to Earth (km).
        pulsar_direction: Unit vector toward the pulsar.
        epoch_mjd: Observation epoch (MJD).
        dm: Dispersion Measure (pc/cm³).
        freq_mhz: Observing frequency (MHz).

    Returns:
        Total timing delay in seconds.
    """
    # Compute the geometric (Römer) delay: light travel time from SSB to spacecraft
    roemer = roemer_delay_ssb_s(spacecraft_pos_earth_km, pulsar_direction, epoch_mjd)

    # Compute the frequency-dependent interstellar dispersion delay
    disp = dispersion_delay_s(dm, freq_mhz)

    # Return the sum of both correction terms
    return roemer + disp
