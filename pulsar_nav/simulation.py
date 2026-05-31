from __future__ import annotations

import numpy as np
import pandas as pd

from .config import SPEED_OF_LIGHT_KM_S


REGIONS = {
    "earth_orbit": (6_700.0, 42_200.0),
    "earth_moon": (42_200.0, 384_400.0),
    "deep_space": (384_400.0, 2_000_000.0),
}


def random_positions(n: int = 1000, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    per_region = int(np.ceil(n / len(REGIONS)))
    for region, (r_min, r_max) in REGIONS.items():
        directions = rng.normal(size=(per_region, 3))
        directions /= np.linalg.norm(directions, axis=1)[:, None]
        radii = rng.uniform(r_min, r_max, size=per_region)
        coords = directions * radii[:, None]
        for xyz in coords:
            rows.append({"region": region, "true_x_km": xyz[0], "true_y_km": xyz[1], "true_z_km": xyz[2]})
    return pd.DataFrame(rows[:n])


def simulate_toa_delays(
    position_km: np.ndarray,
    pulsar_vectors: pd.DataFrame,
    timing_noise_s: float = 0.0,
    seed: int | None = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dirs = pulsar_vectors[["x", "y", "z"]].to_numpy(float)
    ideal = dirs @ position_km / SPEED_OF_LIGHT_KM_S
    noise = rng.normal(0.0, timing_noise_s, size=len(ideal)) if timing_noise_s else np.zeros(len(ideal))
    return pd.DataFrame(
        {
            "name": pulsar_vectors["name"].to_numpy(),
            "delay_s": ideal + noise,
            "ideal_delay_s": ideal,
            "noise_s": noise,
            "sigma_s": timing_noise_s,
        }
    )


def estimate_position(measurements: pd.DataFrame, pulsar_vectors: pd.DataFrame, weighted: bool = True) -> np.ndarray:
    df = measurements.merge(pulsar_vectors, on="name", how="inner")
    design = df[["x", "y", "z"]].to_numpy(float)
    observed = df["delay_s"].to_numpy(float) * SPEED_OF_LIGHT_KM_S
    if weighted and "sigma_s" in df and (df["sigma_s"] > 0).any():
        sigma_km = np.maximum(df["sigma_s"].to_numpy(float) * SPEED_OF_LIGHT_KM_S, 1e-12)
        weights = 1.0 / sigma_km
        design = design * weights[:, None]
        observed = observed * weights
    position, *_ = np.linalg.lstsq(design, observed, rcond=None)
    return position


def navigation_trial(
    true_position_km: np.ndarray,
    selected_vectors: pd.DataFrame,
    timing_noise_s: float,
    seed: int | None = None,
) -> dict:
    measurements = simulate_toa_delays(true_position_km, selected_vectors, timing_noise_s, seed)
    estimated = estimate_position(measurements, selected_vectors, weighted=True)
    error = float(np.linalg.norm(estimated - true_position_km))
    return {
        "true_x_km": true_position_km[0],
        "true_y_km": true_position_km[1],
        "true_z_km": true_position_km[2],
        "estimated_x_km": estimated[0],
        "estimated_y_km": estimated[1],
        "estimated_z_km": estimated[2],
        "position_error_km": error,
    }


def monte_carlo(
    positions: pd.DataFrame,
    ranked: pd.DataFrame,
    noise_levels_s: list[float],
    pulsar_counts: list[int],
    trials_per_setting: int = 100,
    seed: int = 7,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    sample_positions = positions.sample(n=min(trials_per_setting, len(positions)), random_state=seed).reset_index(drop=True)
    for count in pulsar_counts:
        selected = ranked.head(count)[["name", "x", "y", "z"]]
        for noise in noise_levels_s:
            for idx, pos in sample_positions.iterrows():
                true = pos[["true_x_km", "true_y_km", "true_z_km"]].to_numpy(float)
                result = navigation_trial(true, selected, noise, seed=int(rng.integers(0, 2**31 - 1)))
                result.update(
                    {
                        "region": pos["region"],
                        "noise_s": noise,
                        "noise_ns": noise * 1e9,
                        "pulsar_count": count,
                        "trial": idx,
                    }
                )
                rows.append(result)
    return pd.DataFrame(rows)
