from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from .config import find_dataset_root, output_dir
from .parsing import build_catalog, build_toa_database, build_unit_vectors, toa_statistics
from .ranking import rank_pulsars, select_best_geometry
from .simulation import monte_carlo, navigation_trial, random_positions


NOISE_LEVELS_S = [10e-9, 50e-9, 100e-9, 500e-9, 1e-6]


def run_pipeline(args: argparse.Namespace) -> None:
    root = find_dataset_root(args.dataset_root)
    out = output_dir(root, args.output_dir)
    narrowband = root / "narrowband"

    print("Building pulsar catalog...", flush=True)
    catalog = build_catalog(narrowband / "par")
    catalog.to_csv(out / "pulsar_catalog.csv", index=False)

    vectors = build_unit_vectors(catalog)
    vectors.to_csv(out / "pulsar_unit_vectors.csv", index=False)

    print("Parsing TOA files...", flush=True)
    toa = build_toa_database(narrowband / "tim")
    toa.to_csv(out / "toa_database.csv", index=False)

    stats = toa_statistics(toa)
    stats.to_csv(out / "toa_statistics.csv", index=False)

    print("Ranking pulsars...", flush=True)
    ranked = rank_pulsars(catalog, vectors, stats)
    ranked.to_csv(out / "ranked_pulsars.csv", index=False)

    print("Running navigation simulations...", flush=True)
    positions = random_positions(args.positions, seed=args.seed)
    positions.to_csv(out / "spacecraft_positions.csv", index=False)

    selected = ranked.head(args.pulsars)[["name", "x", "y", "z"]]
    true_position = np.array([100_000.0, 200_000.0, 300_000.0])
    trial = navigation_trial(true_position, selected, timing_noise_s=args.demo_noise_ns * 1e-9, seed=args.seed)
    pd.DataFrame([trial]).to_csv(out / "navigation_demo.csv", index=False)

    errors = monte_carlo(
        positions,
        ranked,
        noise_levels_s=NOISE_LEVELS_S,
        pulsar_counts=[4, 5, 6, 8],
        trials_per_setting=args.trials,
        seed=args.seed,
    )
    errors.to_csv(out / "error_analysis.csv", index=False)

    optimization_rows = []
    for count in [4, 5, 6]:
        names, gdop = select_best_geometry(ranked, count=count, pool_size=args.optimization_pool)
        optimization_rows.append(
            {
                "pulsar_count": count,
                "optimal_pulsar_set": ";".join(names),
                "geometry_dop": gdop,
                "expected_error_100ns_km": gdop * 299_792.458 * 100e-9,
            }
        )
    optimization = pd.DataFrame(optimization_rows)
    optimization.to_csv(out / "optimal_pulsar_sets.csv", index=False)

    per_position_rows = []
    positions_with_id = positions.reset_index().rename(columns={"index": "position_id"})
    for _, pos in positions_with_id.iterrows():
        for row in optimization_rows:
            per_position_rows.append(
                {
                    "position_id": pos["position_id"],
                    "region": pos["region"],
                    "true_x_km": pos["true_x_km"],
                    "true_y_km": pos["true_y_km"],
                    "true_z_km": pos["true_z_km"],
                    **row,
                }
            )
    pd.DataFrame(per_position_rows).to_csv(out / "position_optimal_pulsar_sets.csv", index=False)

    print("Generating dashboard...", flush=True)
    from .visualization import create_static_dashboard

    dashboard = create_static_dashboard(catalog, ranked, positions, errors, out)
    write_report(out, catalog, toa, ranked, trial, optimization, dashboard)

    print(f"Dataset root: {root}")
    print(f"Output directory: {out}")
    print("Top 10 navigation pulsars:")
    for row in ranked.head(10).itertuples(index=False):
        print(f"  {row.name:12s} score={row.score:.3f} median_error_us={row.median_error_us:.3f}")
    print(f"Dashboard: {dashboard}")


def write_report(
    out: Path,
    catalog: pd.DataFrame,
    toa: pd.DataFrame,
    ranked: pd.DataFrame,
    trial: dict,
    optimization: pd.DataFrame,
    dashboard: Path,
) -> None:
    top10 = "\n".join(
        f"| {row.name} | {row.score:.3f} | {row.median_error_us:.3f} | {row.duration_days:.1f} |"
        for row in ranked.head(10).itertuples(index=False)
    )
    opt_rows = "\n".join(
        f"| {row.pulsar_count} | {row.optimal_pulsar_set} | {row.geometry_dop:.3f} | {row.expected_error_100ns_km:.6f} |"
        for row in optimization.itertuples(index=False)
    )
    report = f"""# Final Report

## Project

AI-Assisted Pulsar Navigation Framework using NANOGrav 12.5-year narrowband timing data.

## Dataset Use

The framework reads only `narrowband/par/*.par` and `narrowband/tim/*.tim`. It ignores clock, noise, residual, template, wideband, and alternate products for Phase 1/MVP processing.

## Generated Data Products

- Pulsar catalog rows: {len(catalog)}
- TOA database rows: {len(toa)}
- Dashboard: `{dashboard}`

## Top 10 Navigation Pulsars

| Pulsar | Score | Median TOA Error (us) | Duration (days) |
|---|---:|---:|---:|
{top10}

## Navigation Demo

True spacecraft position: ({trial["true_x_km"]:.3f}, {trial["true_y_km"]:.3f}, {trial["true_z_km"]:.3f}) km

Estimated spacecraft position: ({trial["estimated_x_km"]:.3f}, {trial["estimated_y_km"]:.3f}, {trial["estimated_z_km"]:.3f}) km

Position error: {trial["position_error_km"]:.6f} km

## Optimization

Under the linear propagation model, expected timing-error sensitivity is governed by pulsar sky geometry, so the best set is position-independent for a fixed candidate pool. A per-position CSV is still generated for downstream extensions where local constraints can be added.

| Pulsar Count | Optimal Set | Geometry DOP | Expected Error at 100 ns (km) |
|---:|---|---:|---:|
{opt_rows}

## Methods

The navigation model uses unit pulsar direction vectors and simulated delays `delay = r dot n / c`. Position recovery solves the linear least-squares system formed by the selected pulsar directions. Monte Carlo analysis evaluates timing noise levels of 10 ns, 50 ns, 100 ns, 500 ns, and 1 us across 4, 5, 6, and 8 pulsar selections.
"""
    (out / "final_report.md").write_text(report, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI-assisted pulsar navigation framework")
    parser.add_argument("--dataset-root", type=Path, default=Path("."), help="Dataset root or workspace root")
    parser.add_argument("--output-dir", type=Path, default=None, help="Directory for generated CSV and dashboard files")
    parser.add_argument("--positions", type=int, default=1000, help="Number of simulated spacecraft positions")
    parser.add_argument("--trials", type=int, default=100, help="Monte Carlo trials per noise/count setting")
    parser.add_argument("--pulsars", type=int, default=6, help="Pulsars used by the navigation demo")
    parser.add_argument("--demo-noise-ns", type=float, default=100.0, help="Timing noise for navigation demo")
    parser.add_argument("--optimization-pool", type=int, default=12, help="Ranked pulsar pool searched for best geometry")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser


def main() -> None:
    run_pipeline(build_parser().parse_args())


if __name__ == "__main__":
    main()
