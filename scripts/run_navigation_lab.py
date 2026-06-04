#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pulsar_nav.navigation_engine import (  # noqa: E402
    DEFAULT_NOISE_LEVELS_NS,
    DEFAULT_PULSAR_COUNTS,
    NavigationSimulationConfig,
    parse_float_tuple,
    parse_int_tuple,
    run_navigation_lab,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the PulsarNav AI navigation lab Monte Carlo engine")
    parser.add_argument("--vectors", type=Path, default=Path("output/ranked_pulsars.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    parser.add_argument("--trials", type=int, default=1000)
    parser.add_argument("--noise-ns", nargs="*", default=None, help="Timing noise levels in nanoseconds")
    parser.add_argument("--pulsar-counts", nargs="*", default=None, help="Pulsar counts, valid range 4-8")
    parser.add_argument("--seed", type=int, default=42)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = NavigationSimulationConfig(
        trials=args.trials,
        noise_levels_ns=parse_float_tuple(args.noise_ns, DEFAULT_NOISE_LEVELS_NS),
        pulsar_counts=parse_int_tuple(args.pulsar_counts, DEFAULT_PULSAR_COUNTS),
        seed=args.seed,
    )
    paths = run_navigation_lab(args.vectors, args.output_dir, config)
    print("Navigation Lab outputs:")
    for name, path in paths.items():
        print(f"  {name}: {path}")


if __name__ == "__main__":
    main()
