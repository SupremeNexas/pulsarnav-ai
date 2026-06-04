from __future__ import annotations

import unittest

import numpy as np
import pandas as pd

from pulsar_nav.config import SPEED_OF_LIGHT_KM_S
from pulsar_nav.navigation_engine import (
    NavigationSimulationConfig,
    add_timing_noise,
    estimate_position_least_squares,
    expected_delays_s,
    generate_spacecraft_positions,
    navigation_error_km,
    run_monte_carlo,
)


def tetrahedral_vectors() -> pd.DataFrame:
    raw = np.array(
        [
            [1.0, 1.0, 1.0],
            [1.0, -1.0, -1.0],
            [-1.0, 1.0, -1.0],
            [-1.0, -1.0, 1.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
            [-1.0, 0.0, 0.0],
        ],
        dtype=float,
    )
    raw = raw / np.linalg.norm(raw, axis=1)[:, None]
    return pd.DataFrame(
        {
            "name": [f"P{i}" for i in range(len(raw))],
            "x": raw[:, 0],
            "y": raw[:, 1],
            "z": raw[:, 2],
        }
    )


class NavigationEngineTests(unittest.TestCase):
    def test_expected_delays_follow_dot_product_model(self) -> None:
        vectors = tetrahedral_vectors().head(4)
        position = np.array([100_000.0, -50_000.0, 25_000.0])
        delays = expected_delays_s(position, vectors)
        expected = vectors[["x", "y", "z"]].to_numpy(float) @ position / SPEED_OF_LIGHT_KM_S
        np.testing.assert_allclose(delays, expected)

    def test_least_squares_recovers_position_without_noise(self) -> None:
        vectors = tetrahedral_vectors().head(4)
        true_position = np.array([120_000.0, 210_000.0, -80_000.0])
        delays = expected_delays_s(true_position, vectors)
        estimated = estimate_position_least_squares(vectors, delays)
        self.assertLess(navigation_error_km(true_position, estimated), 1e-6)

    def test_noise_is_configurable_in_nanoseconds(self) -> None:
        rng = np.random.default_rng(123)
        delays = np.zeros(1000)
        noisy = add_timing_noise(delays, noise_ns=100.0, rng=rng)
        self.assertGreater(float(np.std(noisy)), 50e-9)
        self.assertLess(float(np.std(noisy)), 150e-9)

    def test_generated_positions_stay_inside_declared_regions(self) -> None:
        config = NavigationSimulationConfig(trials=120, seed=3)
        positions = generate_spacecraft_positions(config)
        bounds = {
            "earth_orbit": (6_700.0, 42_200.0),
            "earth_moon": (42_200.0, 384_400.0),
            "deep_space": (384_400.0, 2_000_000.0),
        }
        for row in positions.itertuples(index=False):
            low, high = bounds[row.region]
            self.assertGreaterEqual(row.radius_km, low)
            self.assertLessEqual(row.radius_km, high)

    def test_monte_carlo_result_dimensions(self) -> None:
        vectors = tetrahedral_vectors()
        config = NavigationSimulationConfig(trials=5, noise_levels_ns=(10.0, 100.0), pulsar_counts=(4, 6), seed=9)
        results, positions = run_monte_carlo(vectors, config)
        self.assertEqual(len(positions), 5)
        self.assertEqual(len(results), 5 * 2 * 2)
        self.assertIn("position_error_km", results.columns)
        self.assertTrue((results["pulsar_count"].isin([4, 6])).all())


if __name__ == "__main__":
    unittest.main()
