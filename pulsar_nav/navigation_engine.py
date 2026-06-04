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
    """Configuration for a pulsar navigation Monte Carlo run."""

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
    """Compute expected pulsar timing delays."""
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
    sigma_s = noise_ns * 1e-9
    if sigma_s == 0:
        return delays_s.copy()
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
    """Run Monte Carlo navigation simulations for 4-8 pulsars and timing noise levels."""

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
