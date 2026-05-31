from __future__ import annotations

import math
import re
from dataclasses import dataclass

import numpy as np


OBLIQUITY_J2000_RAD = math.radians(23.439291111)


@dataclass(frozen=True)
class SkyCoord:
    ra_deg: float
    dec_deg: float


def parse_angle(value: str | float | int | None, hours: bool = False) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) * (15.0 if hours else 1.0)
    text = str(value).strip()
    if not text:
        return None
    if ":" in text:
        parts = [float(p) for p in text.split(":")]
    else:
        fields = re.split(r"\s+", text)
        if len(fields) == 1:
            return float(fields[0]) * (15.0 if hours else 1.0)
        parts = [float(p) for p in fields[:3]]
    sign = -1.0 if str(parts[0]).startswith("-") else 1.0
    first = abs(parts[0])
    second = parts[1] if len(parts) > 1 else 0.0
    third = parts[2] if len(parts) > 2 else 0.0
    degrees = first + second / 60.0 + third / 3600.0
    if hours:
        degrees *= 15.0
    return sign * degrees


def ecliptic_to_equatorial(lambda_deg: float, beta_deg: float) -> SkyCoord:
    lam = math.radians(lambda_deg)
    beta = math.radians(beta_deg)
    eps = OBLIQUITY_J2000_RAD
    sin_dec = math.sin(beta) * math.cos(eps) + math.cos(beta) * math.sin(eps) * math.sin(lam)
    dec = math.asin(sin_dec)
    y = math.sin(lam) * math.cos(eps) - math.tan(beta) * math.sin(eps)
    x = math.cos(lam)
    ra = math.atan2(y, x) % (2.0 * math.pi)
    return SkyCoord(ra_deg=math.degrees(ra), dec_deg=math.degrees(dec))


def sky_to_unit_vector(ra_deg: float, dec_deg: float) -> np.ndarray:
    ra = math.radians(float(ra_deg))
    dec = math.radians(float(dec_deg))
    return np.array(
        [
            math.cos(dec) * math.cos(ra),
            math.cos(dec) * math.sin(ra),
            math.sin(dec),
        ],
        dtype=float,
    )
