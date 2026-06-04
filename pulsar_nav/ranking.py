from __future__ import annotations

import itertools

import numpy as np
import pandas as pd


def _minmax_good(values: pd.Series, higher_is_better: bool = True) -> pd.Series:
    values = pd.to_numeric(values, errors="coerce")
    lo = values.min()
    hi = values.max()
    if not np.isfinite(lo) or not np.isfinite(hi) or hi == lo:
        return pd.Series(np.ones(len(values)), index=values.index)
    scaled = (values - lo) / (hi - lo)
    return scaled if higher_is_better else 1.0 - scaled


def rank_pulsars(catalog: pd.DataFrame, vectors: pd.DataFrame, toa_stats: pd.DataFrame) -> pd.DataFrame:
    df = catalog.merge(vectors, on="name", how="inner").merge(
        toa_stats, left_on="name", right_on="pulsar", how="left"
    )
    df["duration_score"] = _minmax_good(df["duration_days"].fillna(0.0), True)
    df["measurement_score"] = _minmax_good(df["median_error_us"].fillna(df["median_error_us"].median()), False)
    df["toa_count_score"] = _minmax_good(np.log1p(df["n_toas"].fillna(0.0)), True)
    df["spin_stability_score"] = _minmax_good(df["f1"].abs().fillna(df["f1"].abs().median()), False)
    dirs = df[["x", "y", "z"]].to_numpy(float)
    sky_scores = []
    for i, vec in enumerate(dirs):
        others = np.delete(dirs, i, axis=0)
        sep = np.arccos(np.clip(others @ vec, -1.0, 1.0))
        sky_scores.append(float(np.median(sep)) if len(sep) else 1.0)
    df["sky_distribution_score"] = _minmax_good(pd.Series(sky_scores, index=df.index), True)
    weights = {
        "measurement_score": 0.35,
        "duration_score": 0.25,
        "toa_count_score": 0.15,
        "spin_stability_score": 0.10,
        "sky_distribution_score": 0.15,
    }
    df["score"] = sum(df[col] * weight for col, weight in weights.items())
    cols = [
        "name",
        "score",
        "measurement_score",
        "duration_score",
        "toa_count_score",
        "spin_stability_score",
        "sky_distribution_score",
        "n_toas",
        "duration_days",
        "median_error_us",
        "ra_deg",
        "dec_deg",
        "x",
        "y",
        "z",
        "dm",
        "median_freq_mhz",
    ]
    return df[cols].sort_values("score", ascending=False).reset_index(drop=True)


def geometry_dop(vectors: np.ndarray) -> float:
    design = np.column_stack([vectors, np.ones(len(vectors))])
    normal = design.T @ design
    try:
        covariance = np.linalg.inv(normal)
    except np.linalg.LinAlgError:
        return float("inf")
    return float(np.sqrt(np.trace(covariance[:3, :3])))


def select_best_geometry(ranked: pd.DataFrame, count: int, pool_size: int = 12) -> tuple[list[str], float]:
    pool = ranked.head(max(pool_size, count))
    best_names: list[str] = []
    best_gdop = float("inf")
    for combo in itertools.combinations(range(len(pool)), count):
        vecs = pool.iloc[list(combo)][["x", "y", "z"]].to_numpy(float)
        gdop = geometry_dop(vecs)
        if gdop < best_gdop:
            best_gdop = gdop
            best_names = pool.iloc[list(combo)]["name"].tolist()
    return best_names, best_gdop
