from __future__ import annotations

import unittest
import numpy as np
import pandas as pd

from pulsar_nav.config import SPEED_OF_LIGHT_KM_S
from pulsar_nav.timing_model import (
    dispersion_delay_s,
    earth_position_ssb_km,
    roemer_delay_ssb_s,
    compute_total_delay_s,
)
from pulsar_nav.navigation_engine import (
    estimate_position_least_squares,
    expected_delays_s,
    run_single_trial,
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
            "dm": [10.0, 20.0, 30.0, 40.0, 15.0, 25.0, 35.0, 5.0],
            "median_freq_mhz": [1400.0, 820.0, 1400.0, 600.0, 1400.0, 820.0, 1400.0, 600.0],
        }
    )


class TimingModelTests(unittest.TestCase):
    def test_dispersion_delay_quadratic_frequency_scaling(self) -> None:
        dm = 10.0
        delay_1 = dispersion_delay_s(dm, 1400.0)
        delay_2 = dispersion_delay_s(dm, 700.0)
        # Quadruple the delay when frequency is halved
        self.assertAlmostEqual(delay_2, 4.0 * delay_1, places=5)
        
        # Reference exact calculation
        expected = 4.148808e3 * 10.0 / (1400.0 ** 2)
        self.assertAlmostEqual(delay_1, expected, places=7)

    def test_earth_position_shape_and_epoch_vectorization(self) -> None:
        pos = earth_position_ssb_km(51544.5)
        self.assertEqual(pos.shape, (3,))
        self.assertTrue(np.all(np.isfinite(pos)))
        
        # Test vectorization
        epochs = np.array([51544.5, 52000.0, 53000.0])
        pos_matrix = earth_position_ssb_km(epochs)
        self.assertEqual(pos_matrix.shape, (3, 3))
        self.assertTrue(np.all(np.isfinite(pos_matrix)))

    def test_roemer_delay_vectorization(self) -> None:
        pos_sc = np.array([10000.0, 20000.0, -5000.0])
        pulsar_dir = np.array([0.0, 0.0, 1.0])
        epoch = 51544.5
        
        earth_pos = earth_position_ssb_km(epoch)
        expected_roemer = (earth_pos[2] + pos_sc[2]) / SPEED_OF_LIGHT_KM_S
        
        delay = roemer_delay_ssb_s(pos_sc, pulsar_dir, epoch)
        self.assertAlmostEqual(float(delay), expected_roemer, places=8)

    def test_4d_estimator_recovers_position_and_clock_bias(self) -> None:
        vectors = tetrahedral_vectors().head(4)
        true_position = np.array([120_000.0, 210_000.0, -80_000.0])
        epoch_mjd = 58000.0
        
        # Simulate ideal delays with clock bias
        clock_bias_s = 5.2345e-6  # ~5.2 microseconds
        ideal_delays = expected_delays_s(true_position, vectors, epoch_mjd=epoch_mjd)
        measured_delays = ideal_delays + clock_bias_s
        
        # Recover position
        estimated = estimate_position_least_squares(vectors, measured_delays)
        error = np.linalg.norm(estimated - true_position)
        
        # Error must be extremely small (noiseless recovery)
        self.assertLess(error, 1e-5)


if __name__ == "__main__":
    unittest.main()
