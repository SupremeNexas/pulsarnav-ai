"""
Navigation Engine — Monte Carlo Spacecraft Navigation Simulation
===============================================================

This module provides the full simulation pipeline for evaluating pulsar-based
navigation performance across different mission regions, timing noise levels,
and pulsar set sizes.

Pipeline Overview:
------------------
1. Load ranked pulsar direction vectors from a CSV file.
2. Generate synthetic spacecraft positions distributed across mission regions.
3. For each trial:
   a. Compute expected pulsar timing delays (geometry + SSB corrections).
   b. Add realistic timing noise (Gaussian, sigma = noise_ns nanoseconds).
   c. Add a random clock bias (simulates imperfect onboard clock).
   d. Solve for spacecraft position using weighted least squares.
   e. Compute the position error (km) against the true position.
4. Aggregate results by noise level and pulsar count.
5. Generate SVG visualizations (error vs noise, error distribution, error vs pulsar count).

Mission Regions:
----------------
- earth_orbit:  6,700 – 42,200 km (LEO to GEO)
- earth_moon: 42,200 – 384,400 km (GEO to lunar distance)
- deep_space: 384,400 – 2,000,000 km (beyond Moon to ~ 1% of 1 AU)

Navigation Method:
------------------
The position estimator uses LINEAR LEAST SQUARES (WLS/LS) applied to the
pulsar timing delay measurements. For N pulsars with direction vectors n̂ᵢ:

    Measured delay: z_i = (r · n̂_i) / c + clock_bias + noise

Rewriting: z_i × c = r · n̂_i + c × b + noise

Stacking N measurements: Aw = b, where:
    A = [n̂₁ᵀ, 1; n̂₂ᵀ, 1; ...; n̂_Nᵀ, 1]  (N × 4 matrix)
    w = [r_x, r_y, r_z, c×b]                  (4 unknowns: position + clock)
    b = [z_1×c, z_2×c, ..., z_N×c]           (N observations)

Solving: w = A⁺ b  (pseudoinverse / least squares)

For N=4 pulsars, this is an exact solution (square system).
For N>4 pulsars, it's overdetermined and least squares provides the
best linear unbiased estimate (BLUE).

SSB Corrections:
----------------
When ssb=True, the total delay model includes:
  1. Geometric delay: r_sc · n̂ / c (Römer delay relative to Earth)
  2. Earth barycentric delay: r_earth_ssb · n̂ / c
  3. Dispersion delay: 4148.808 × DM / f²

These corrections are needed for precise timing, especially for radio pulsars.
For X-ray navigation (high frequency), the dispersion term is negligible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from .config import SPEED_OF_LIGHT_KM_S


REGIONS_KM = {
    "earth_orbit": (6_700.0, 42_200.0),
    "earth_moon": (42_200.0, 384_400.0),
    "deep_space": (384_400.0, 2_000_000.0),
}

DEFAULT_NOISE_LEVELS_NS = (10.0, 50.0, 100.0, 500.0, 1000.0)
DEFAULT_PULSAR_COUNTS = (4, 5, 6, 7, 8)


@dataclass(frozen=True)
class NavigationSimulationConfig:
    """
    Configuration for a pulsar navigation Monte Carlo simulation run.

    Frozen (immutable) dataclass — once created, all fields are read-only.
    This prevents accidental modification during long simulation runs.

    Fields:
        trials: Number of random spacecraft positions to simulate per (noise, pulsar_count) pair.
            More trials → more statistically reliable error estimates.
        noise_levels_ns: Tuple of timing noise standard deviations to test (nanoseconds).
            Real pulsar X-ray detectors have ~100–1000 ns noise. Radio has ~10–100 ns.
        pulsar_counts: Tuple of pulsar set sizes to test.
            Must be in [4, 8]: minimum 4 for 3D navigation + clock bias.
        seed: Master RNG seed. Ensures reproducibility across runs.
        region_weights: Relative probability weights for each mission region.
            {1.0, 1.0, 1.0} → equal weight across all three regions.
    """

    trials: int = 1000
    noise_levels_ns: tuple[float, ...] = DEFAULT_NOISE_LEVELS_NS
    pulsar_counts: tuple[int, ...] = DEFAULT_PULSAR_COUNTS
    seed: int = 42
    region_weights: dict[str, float] = field(
        default_factory=lambda: {"earth_orbit": 1.0, "earth_moon": 1.0, "deep_space": 1.0}
    )

    def __post_init__(self) -> None:
        if self.trials < 1:
            raise ValueError("trials must be positive")
        if any(count < 4 or count > 8 for count in self.pulsar_counts):
            raise ValueError("pulsar_counts must be between 4 and 8")
        if any(noise < 0 for noise in self.noise_levels_ns):
            raise ValueError("noise levels must be non-negative")
        invalid = set(self.region_weights) - set(REGIONS_KM)
        if invalid:
            raise ValueError(f"unknown spacecraft regions: {sorted(invalid)}")


def load_pulsar_vectors(path: Path | str = Path("output/ranked_pulsars.csv")) -> pd.DataFrame:
    """Load ranked pulsar unit vectors generated from the NANOGrav catalog."""

    df = pd.read_csv(path)
    required = {"name", "x", "y", "z"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"missing required vector columns: {sorted(missing)}")
    cols_to_keep = ["name", "x", "y", "z"]
    if "dm" in df.columns:
        cols_to_keep.append("dm")
    if "median_freq_mhz" in df.columns:
        cols_to_keep.append("median_freq_mhz")
    
    vectors = df[cols_to_keep].dropna(subset=["name", "x", "y", "z"]).copy()
    
    # Apply defaults if columns are missing or contain NaNs
    if "dm" not in vectors.columns:
        vectors["dm"] = 15.0
    else:
        vectors["dm"] = vectors["dm"].fillna(15.0)
        
    if "median_freq_mhz" not in vectors.columns:
        vectors["median_freq_mhz"] = 1400.0
    else:
        vectors["median_freq_mhz"] = vectors["median_freq_mhz"].fillna(1400.0)

    xyz = vectors[["x", "y", "z"]].to_numpy(float)
    norms = np.linalg.norm(xyz, axis=1)
    if np.any(norms == 0):
        raise ValueError("pulsar vector file contains a zero-length vector")
    vectors[["x", "y", "z"]] = xyz / norms[:, None]
    return vectors.reset_index(drop=True)


def generate_spacecraft_positions(config: NavigationSimulationConfig) -> pd.DataFrame:
    """Generate synthetic spacecraft positions across mission regions."""

    rng = np.random.default_rng(config.seed)
    region_names = list(config.region_weights)
    weights = np.array([config.region_weights[name] for name in region_names], dtype=float)
    weights = weights / weights.sum()
    selected_regions = rng.choice(region_names, size=config.trials, p=weights)
    rows = []
    for trial, region in enumerate(selected_regions):
        radius_min, radius_max = REGIONS_KM[region]
        direction = rng.normal(size=3)
        direction /= np.linalg.norm(direction)
        radius = rng.uniform(radius_min, radius_max)
        position = direction * radius
        rows.append(
            {
                "trial": trial,
                "region": region,
                "true_x_km": position[0],
                "true_y_km": position[1],
                "true_z_km": position[2],
                "radius_km": radius,
            }
        )
    return pd.DataFrame(rows)


def expected_delays_s(
    position_km: np.ndarray,
    pulsar_vectors: pd.DataFrame,
    epoch_mjd: float = 51544.5,
    ssb: bool = False,
) -> np.ndarray:
    """
    Compute the expected (noiseless) pulsar timing delays for a spacecraft position.

    For each pulsar i with direction vector n̂ᵢ, the expected timing delay is:
        Without SSB: z_i = (r_sc · n̂_i) / c   (simple geometric delay)
        With SSB:    z_i = ((r_earth_ssb + r_sc) · n̂_i) / c + Δt_DM_i
                          (includes Earth barycentric delay and dispersion)

    The SSB=False mode computes pure relative geometric delays (r_sc only).
    The SSB=True mode adds the full barycentric correction for absolute timing.

    Args:
        position_km: Spacecraft position vector (3,) in kilometers.
        pulsar_vectors: DataFrame with columns ['x', 'y', 'z'] (unit vectors),
            and optionally ['dm', 'median_freq_mhz'] for SSB corrections.
        epoch_mjd: Observation epoch as MJD (default: J2000.0 = 51544.5).
            Only matters for the Earth position in SSB mode.
        ssb: If True, include Earth barycentric and dispersion delay corrections.

    Returns:
        Array of expected delays in seconds. Shape: (N,) where N = number of pulsars.
    """
    dirs = pulsar_vectors[["x", "y", "z"]].to_numpy(float)
    if not ssb:
        return dirs @ np.asarray(position_km, dtype=float) / SPEED_OF_LIGHT_KM_S
        
    dms = pulsar_vectors["dm"].to_numpy(float) if "dm" in pulsar_vectors.columns else np.zeros(len(dirs))
    freqs = pulsar_vectors["median_freq_mhz"].to_numpy(float) if "median_freq_mhz" in pulsar_vectors.columns else np.full(len(dirs), 1400.0)
    
    from .timing_model import compute_total_delay_s
    ideal = np.zeros(len(dirs))
    for i in range(len(dirs)):
        ideal[i] = compute_total_delay_s(
            position_km,
            dirs[i],
            epoch_mjd,
            dms[i],
            freqs[i]
        )
    return ideal


def add_timing_noise(delays_s: np.ndarray, noise_ns: float, rng: np.random.Generator) -> np.ndarray:
    """
    Add Gaussian timing noise to pulsar delay measurements.

    Models the measurement noise η_i ~ N(0, σ²) where σ = noise_ns nanoseconds.
    This noise arises from photon counting statistics and detector imperfections.

    For XNAV (X-ray pulsar navigation), typical σ values are 100–1000 ns,
    corresponding to position uncertainties of σ × c ≈ 30–300 km.

    Args:
        delays_s: True (noiseless) delays in seconds. Shape: (N,).
        noise_ns: 1-sigma timing noise in nanoseconds. If 0, return exact delays.
        rng: NumPy random Generator for reproducible noise.

    Returns:
        Noisy delay measurements in seconds. Shape: (N,).
    """
    sigma_s = noise_ns * 1e-9   # Convert nanoseconds to seconds
    if sigma_s == 0:
        return delays_s.copy()   # No noise — return exact delays
    return delays_s + rng.normal(0.0, sigma_s, size=len(delays_s))


def estimate_position_least_squares(
    pulsar_vectors: pd.DataFrame,
    measured_delays_s: np.ndarray,
    epoch_mjd: float = 51544.5,
    ssb: bool = False,
) -> np.ndarray:
    """Estimate spacecraft position from pulsar delays with linear least squares."""

    if len(pulsar_vectors) < 4:
        raise ValueError("at least four pulsars are required for navigation")
    design = pulsar_vectors[["x", "y", "z"]].to_numpy(float)
    
    corrected_delays = np.asarray(measured_delays_s, dtype=float)
    if ssb:
        # Subtract dispersion delay and Earth barycentric delay
        from .timing_model import dispersion_delay_s, earth_position_ssb_km
        earth_pos = earth_position_ssb_km(epoch_mjd)
        earth_delays = np.dot(design, earth_pos) / SPEED_OF_LIGHT_KM_S
        
        dms = pulsar_vectors["dm"].to_numpy(float) if "dm" in pulsar_vectors.columns else np.zeros(len(pulsar_vectors))
        freqs = pulsar_vectors["median_freq_mhz"].to_numpy(float) if "median_freq_mhz" in pulsar_vectors.columns else np.full(len(pulsar_vectors), 1400.0)
        
        disp_delays = dispersion_delay_s(dms, freqs)
        corrected_delays = corrected_delays - earth_delays - disp_delays
        
    observed_km = corrected_delays * SPEED_OF_LIGHT_KM_S
    
    # Solve 4D system (3D position + clock bias as c * b)
    design = np.column_stack([design, np.ones(len(pulsar_vectors))])
    
    estimate, *_ = np.linalg.lstsq(design, observed_km, rcond=None)
    # Return 3D position
    return estimate[:3]


def navigation_error_km(true_position_km: np.ndarray, estimated_position_km: np.ndarray) -> float:
    """
    Compute 3D Euclidean navigation error between true and estimated positions.

    Error = |r_estimated - r_true| = √(Δx² + Δy² + Δz²)

    Args:
        true_position_km: Ground truth spacecraft position (3,) in km.
        estimated_position_km: Filter/LS estimated position (3,) in km.

    Returns:
        Scalar position error in kilometers.
    """
    return float(np.linalg.norm(np.asarray(estimated_position_km) - np.asarray(true_position_km)))


def run_single_trial(
    true_position_km: np.ndarray,
    pulsar_vectors: pd.DataFrame,
    noise_ns: float,
    rng: np.random.Generator,
    clock_bias_s: float = 0.0,
    epoch_mjd: float = 51544.5,
    ssb: bool = True,
) -> dict[str, float]:
    ideal_delays = expected_delays_s(true_position_km, pulsar_vectors, epoch_mjd=epoch_mjd, ssb=ssb)
    measured_delays = add_timing_noise(ideal_delays, noise_ns, rng) + clock_bias_s
    estimated = estimate_position_least_squares(pulsar_vectors, measured_delays, epoch_mjd=epoch_mjd, ssb=ssb)
    return {
        "true_x_km": float(true_position_km[0]),
        "true_y_km": float(true_position_km[1]),
        "true_z_km": float(true_position_km[2]),
        "estimated_x_km": float(estimated[0]),
        "estimated_y_km": float(estimated[1]),
        "estimated_z_km": float(estimated[2]),
        "position_error_km": navigation_error_km(true_position_km, estimated),
    }


def run_monte_carlo(
    pulsar_vectors: pd.DataFrame,
    config: NavigationSimulationConfig | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Run a full Monte Carlo navigation simulation across all (noise, pulsar_count) combinations.

    For each combination of (pulsar_count, noise_level):
      - Run `config.trials` independent position estimation trials
      - Each trial: generate a random spacecraft position → simulate delays → add noise
        → add random clock bias → solve for position → record error

    The random clock bias models real-world clock imperfections:
        b ~ Uniform(-10 μs, +10 μs)
    A 10 μs clock error corresponds to c × 10μs ≈ 3 km position error.

    Args:
        pulsar_vectors: DataFrame with pulsar direction vectors and optional DM/freq columns.
            Must have at least max(config.pulsar_counts) rows.
        config: Simulation configuration. None → default NavigationSimulationConfig.

    Returns:
        A 2-tuple (results, positions):
            results: DataFrame with one row per trial, columns include
                     position_error_km, noise_ns, pulsar_count, region, etc.
            positions: DataFrame with the randomly generated spacecraft positions.
    """

    config = config or NavigationSimulationConfig()
    if len(pulsar_vectors) < max(config.pulsar_counts):
        raise ValueError("not enough pulsars for requested pulsar count")

    positions = generate_spacecraft_positions(config)
    rng = np.random.default_rng(config.seed + 1)
    rows = []
    for pulsar_count in config.pulsar_counts:
        selected = pulsar_vectors.head(pulsar_count).reset_index(drop=True)
        selected_names = ";".join(selected["name"].tolist())
        for noise_ns in config.noise_levels_ns:
            for pos in positions.itertuples(index=False):
                true_position = np.array([pos.true_x_km, pos.true_y_km, pos.true_z_km], dtype=float)
                # Generate a random clock bias for each trial
                clock_bias = float(rng.uniform(-10e-6, 10e-6))  # -10 to +10 us
                result = run_single_trial(
                    true_position,
                    selected,
                    noise_ns,
                    rng,
                    clock_bias_s=clock_bias,
                    epoch_mjd=58000.0,
                    ssb=True,
                )
                result.update(
                    {
                        "trial": int(pos.trial),
                        "region": pos.region,
                        "radius_km": float(pos.radius_km),
                        "noise_ns": float(noise_ns),
                        "noise_s": float(noise_ns * 1e-9),
                        "pulsar_count": int(pulsar_count),
                        "pulsars": selected_names,
                    }
                )
                rows.append(result)
    return pd.DataFrame(rows), positions


def summarize_results(results: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate Monte Carlo results into summary statistics by (noise_ns, pulsar_count).

    For each unique combination of timing noise level and pulsar count, computes:
      - mean_error_km: Average position error across all trials
      - median_error_km: Median position error (robust to outliers)
      - p95_error_km: 95th percentile error (worst-case performance)
      - max_error_km: Maximum error across all trials
      - trials: Number of trials in this group

    The median is typically more informative than the mean for navigation errors,
    since the error distribution is often right-skewed (a few large outliers).

    Args:
        results: DataFrame from run_monte_carlo() with position_error_km column.

    Returns:
        Summary DataFrame with one row per (noise_ns, pulsar_count) combination.
    """
    grouped = results.groupby(["noise_ns", "pulsar_count"], as_index=False)["position_error_km"]
    return grouped.agg(
        mean_error_km="mean",
        median_error_km="median",
        p95_error_km=lambda series: float(series.quantile(0.95)),
        max_error_km="max",
        trials="count",
    )


def save_navigation_outputs(
    results: pd.DataFrame,
    positions: pd.DataFrame,
    output_dir: Path | str,
) -> dict[str, Path]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    summary = summarize_results(results)
    paths = {
        "results": out / "navigation_lab_results.csv",
        "summary": out / "navigation_lab_summary.csv",
        "positions": out / "navigation_lab_positions.csv",
    }
    results.to_csv(paths["results"], index=False)
    summary.to_csv(paths["summary"], index=False)
    positions.to_csv(paths["positions"], index=False)
    paths.update(generate_navigation_plots(results, out))
    return paths


def generate_navigation_plots(results: pd.DataFrame, output_dir: Path | str) -> dict[str, Path]:
    """Generate dependency-light SVG navigation error plots."""

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = {
        "error_vs_noise": out / "position_error_vs_timing_noise.svg",
        "error_distribution": out / "position_error_distribution.svg",
        "error_vs_pulsars": out / "position_error_vs_pulsar_count.svg",
    }

    noise_summary = (
        results.groupby(["noise_ns", "pulsar_count"], as_index=False)["position_error_km"].median()
    )
    series = []
    for pulsar_count, frame in noise_summary.groupby("pulsar_count"):
        series.append(
            {
                "label": f"{pulsar_count} pulsars",
                "points": list(zip(frame["noise_ns"].to_numpy(float), frame["position_error_km"].to_numpy(float))),
            }
        )
    _write_line_svg(paths["error_vs_noise"], "Position Error vs Timing Noise", "Timing noise (ns)", "Median error (km)", series, log_x=True, log_y=True)

    hist_counts, hist_edges = np.histogram(results["position_error_km"].to_numpy(float), bins=50)
    _write_histogram_svg(paths["error_distribution"], "Position Error Distribution", "Position error (km)", "Count", hist_counts, hist_edges)

    count_summary = results.groupby("pulsar_count", as_index=False)["position_error_km"].median()
    count_series = [
        {
            "label": "median error",
            "points": list(zip(count_summary["pulsar_count"].to_numpy(float), count_summary["position_error_km"].to_numpy(float))),
        }
    ]
    _write_line_svg(paths["error_vs_pulsars"], "Position Error vs Number of Pulsars", "Number of pulsars", "Median error (km)", count_series)
    return paths


def _scale(value: float, src_min: float, src_max: float, dst_min: float, dst_max: float) -> float:
    if src_max == src_min:
        return (dst_min + dst_max) / 2.0
    return dst_min + (value - src_min) * (dst_max - dst_min) / (src_max - src_min)


def _write_line_svg(
    path: Path,
    title: str,
    x_label: str,
    y_label: str,
    series: list[dict],
    log_x: bool = False,
    log_y: bool = False,
) -> None:
    colors = ["#00BFFF", "#22C55E", "#F59E0B", "#38BDF8", "#EF4444"]
    transformed = []
    all_x = []
    all_y = []
    for item in series:
        points = []
        for x_raw, y_raw in item["points"]:
            x = float(np.log10(max(x_raw, 1e-12))) if log_x else float(x_raw)
            y = float(np.log10(max(y_raw, 1e-12))) if log_y else float(y_raw)
            points.append((x, y, x_raw, y_raw))
            all_x.append(x)
            all_y.append(y)
        transformed.append({**item, "points": points})
    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)
    parts = [_svg_header(title)]
    for grid in range(6):
        x = 70 + grid * 134
        y = 330 - grid * 54
        parts.append(f'<line x1="{x}" y1="40" x2="{x}" y2="330" stroke="#1E293B"/>')
        parts.append(f'<line x1="70" y1="{y}" x2="740" y2="{y}" stroke="#1E293B"/>')
    for idx, item in enumerate(transformed):
        coords = []
        for x, y, x_raw, y_raw in item["points"]:
            sx = _scale(x, x_min, x_max, 70, 740)
            sy = _scale(y, y_min, y_max, 330, 40)
            coords.append(f"{sx:.1f},{sy:.1f}")
            parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="4" fill="{colors[idx % len(colors)]}"><title>{x_raw:g}, {y_raw:.6g}</title></circle>')
        parts.append(f'<polyline points="{" ".join(coords)}" fill="none" stroke="{colors[idx % len(colors)]}" stroke-width="2.4"/>')
        parts.append(f'<text x="{580}" y="{55 + idx * 18}" fill="{colors[idx % len(colors)]}" font-size="12">{item["label"]}</text>')
    parts.append(f'<text x="330" y="380" fill="#CBD5E1" font-size="13">{x_label}</text>')
    parts.append(f'<text x="18" y="215" fill="#CBD5E1" font-size="13" transform="rotate(-90 18,215)">{y_label}</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def _write_histogram_svg(path: Path, title: str, x_label: str, y_label: str, counts: np.ndarray, edges: np.ndarray) -> None:
    max_count = max(int(counts.max()), 1)
    parts = [_svg_header(title)]
    width = 670 / len(counts)
    for idx, count in enumerate(counts):
        height = _scale(float(count), 0, max_count, 0, 285)
        x = 70 + idx * width
        y = 330 - height
        low = edges[idx]
        high = edges[idx + 1]
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(width - 1, 1):.1f}" height="{height:.1f}" fill="#00BFFF" opacity="0.82">'
            f"<title>{low:.6g}-{high:.6g} km: {int(count)}</title></rect>"
        )
    for grid in range(6):
        y = 330 - grid * 54
        parts.append(f'<line x1="70" y1="{y}" x2="740" y2="{y}" stroke="#1E293B"/>')
    parts.append(f'<text x="335" y="380" fill="#CBD5E1" font-size="13">{x_label}</text>')
    parts.append(f'<text x="18" y="215" fill="#CBD5E1" font-size="13" transform="rotate(-90 18,215)">{y_label}</text>')
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def _svg_header(title: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="820" height="400" viewBox="0 0 820 400" role="img">
<rect width="820" height="400" fill="#050816"/>
<rect x="50" y="20" width="720" height="340" rx="8" fill="#0F172A" stroke="#1E293B"/>
<text x="70" y="28" fill="#F8FAFC" font-size="18" font-family="Arial, sans-serif" dominant-baseline="hanging">{title}</text>'''


def run_navigation_lab(
    vector_path: Path | str = Path("output/ranked_pulsars.csv"),
    output_dir: Path | str = Path("output"),
    config: NavigationSimulationConfig | None = None,
) -> dict[str, Path]:
    vectors = load_pulsar_vectors(vector_path)
    results, positions = run_monte_carlo(vectors, config)
    return save_navigation_outputs(results, positions, output_dir)


def parse_float_tuple(values: Iterable[str] | None, default: tuple[float, ...]) -> tuple[float, ...]:
    if values is None:
        return default
    return tuple(float(value) for value in values)


def parse_int_tuple(values: Iterable[str] | None, default: tuple[int, ...]) -> tuple[int, ...]:
    if values is None:
        return default
    return tuple(int(value) for value in values)
