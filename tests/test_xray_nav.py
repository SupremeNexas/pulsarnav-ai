from __future__ import annotations

import unittest
import numpy as np

from pulsar_nav.xray_nav import (
    XRayPulsarProfile,
    generate_photon_toas,
    epoch_folding,
    crlb_phase_error,
    crlb_pulse_delay_s,
    CrossCorrelationEstimator,
    NonlinearLeastSquaresEstimator,
    MaximumLikelihoodEstimator,
    PulsarNavigationEKF,
)


class XRayNavTests(unittest.TestCase):
    def setUp(self) -> None:
        # Create a simple Crab-like pulsar model
        # Background = 5 ph/s, Source = 15 ph/s
        self.profile = XRayPulsarProfile(lambda_b=5.0, lambda_s=15.0)

    def test_profile_normalization_and_derivatives(self) -> None:
        # Check that normalized profile integrates to 1.0
        grid = np.linspace(0, 1, 1000, endpoint=False)
        h_vals = self.profile.h(grid)
        self.assertAlmostEqual(float(np.mean(h_vals)), 1.0, places=3)
        
        # Check cumulative integral values
        self.assertAlmostEqual(float(self.profile.H_cum(0.0)), 0.0, places=5)
        self.assertAlmostEqual(float(self.profile.H_cum(1.0)), 1.0, places=5)
        self.assertAlmostEqual(float(self.profile.H_cum(2.0)), 2.0, places=5)

    def test_accumulated_rate_and_inversion(self) -> None:
        phi_0 = 0.25
        f_obs = 30.0  # 30 Hz spin frequency (Crab-like)
        
        t_target = 0.05  # 50 ms
        y = self.profile.accumulated_rate(t_target, phi_0, f_obs)
        
        # Invert to recover t
        t_recovered = self.profile.invert_accumulated_rate(y, phi_0, f_obs)
        self.assertAlmostEqual(t_recovered, t_target, places=6)

    def test_nhpp_toa_generation_and_folding(self) -> None:
        phi_0 = 0.16
        f_obs = 29.97  # Spin frequency
        t_f = 2.0      # 2 seconds simulation
        
        toas = generate_photon_toas(self.profile, phi_0, f_obs, t_f, seed=42)
        
        # Check that we generated some photons
        self.assertGreater(len(toas), 0)
        self.assertTrue(np.all(toas >= 0.0))
        self.assertTrue(np.all(toas <= t_f))
        
        # Fold back into bins
        n_bins = 64
        folded = epoch_folding(toas, f_obs, n_bins=n_bins)
        self.assertEqual(len(folded), n_bins)
        self.assertTrue(np.all(folded >= 0.0))

    def test_crlb_calculations(self) -> None:
        f_s = 29.97
        T_obs = 100.0
        
        crlb_phi = crlb_phase_error(self.profile, T_obs)
        crlb_td = crlb_pulse_delay_s(self.profile, f_s, T_obs, relative=False)
        
        # Ensure CRLBs are positive and reasonable
        self.assertGreater(crlb_phi, 0.0)
        self.assertGreater(crlb_td, 0.0)
        self.assertAlmostEqual(crlb_td, crlb_phi / (f_s ** 2), places=10)

    def test_phase_estimators(self) -> None:
        # Setup a clean noiseless/high-count scenario
        phi_true = 0.4
        f_obs = 30.0
        t_f = 10.0  # 10s simulation yields enough photons for coarse convergence
        
        toas = generate_photon_toas(self.profile, phi_true, f_obs, t_f, seed=42)
        
        # 1. MLE (direct TOAs)
        phi_mle = MaximumLikelihoodEstimator.estimate_phase(toas, f_obs, self.profile, n_grid=200)
        # Check phase recovery error is small
        err_mle = min(abs(phi_mle - phi_true), 1.0 - abs(phi_mle - phi_true))
        self.assertLess(err_mle, 0.05)
        
        # 2. Folded estimators
        n_bins = 128
        empirical_rate = epoch_folding(toas, f_obs, n_bins=n_bins)
        
        # True profile reference template (Equation 5.2)
        bin_coords = np.linspace(0, 1, n_bins, endpoint=False)
        true_profile = self.profile.lambda_b + self.profile.lambda_s * self.profile.h(bin_coords)
        
        # NLS
        phi_nls = NonlinearLeastSquaresEstimator.estimate_phase(empirical_rate, self.profile, n_grid=200)
        err_nls = min(abs(phi_nls - phi_true), 1.0 - abs(phi_nls - phi_true))
        self.assertLess(err_nls, 0.05)
        
        # CC
        phi_cc = CrossCorrelationEstimator.estimate_phase(empirical_rate, true_profile)
        err_cc = min(abs(phi_cc - phi_true), 1.0 - abs(phi_cc - phi_true))
        self.assertLess(err_cc, 0.05)

    def test_ekf_propagation_and_updates(self) -> None:
        # Initialize spacecraft state: Position: [7000, 0, 0] km, Velocity: [0, 7.5, 0.1] km/s
        # Clock bias = 1e-5 s, clock drift = 1e-7 s/s
        x_init = np.array([7000.0, 0.0, 0.0, 0.0, 7.5, 0.1, 1e-5, 1e-7])
        P_init = np.eye(8) * 1.0
        # State transition process noise
        Q_diag = np.array([1e-6, 1e-6, 1e-6, 1e-8, 1e-8, 1e-8, 1e-12, 1e-14])
        
        ekf = PulsarNavigationEKF(x_init, P_init, Q_diag)
        
        # Propagate by dt = 1.0s
        ekf.predict(dt=1.0)
        
        # Check state moved under gravity
        self.assertFalse(np.array_equal(ekf.x, x_init))
        self.assertGreater(ekf.x[1], 0.0)  # Y position should increase
        
        # Perform measurement update
        # 4 pulsars measurements
        pulsars = [
            {"vector": np.array([1.0, 0.0, 0.0]), "delay": 7000.0 / 299792.458 + 1e-5},
            {"vector": np.array([0.0, 1.0, 0.0]), "delay": 0.0 / 299792.458 + 1e-5},
            {"vector": np.array([0.0, 0.0, 1.0]), "delay": 0.0 / 299792.458 + 1e-5},
            {"vector": np.array([-1.0, 0.0, 0.0]), "delay": -7000.0 / 299792.458 + 1e-5},
        ]
        
        measurements = []
        for p in pulsars:
            measurements.append({
                "delay_s": p["delay"],
                "pulsar_vector": p["vector"],
                "var_s2": 1e-14
            })
            
        old_P_trace = np.trace(ekf.P)
        ekf.update(measurements)
        new_P_trace = np.trace(ekf.P)
        
        # Covariance uncertainty should shrink after measurements update
        self.assertLess(new_P_trace, old_P_trace)


if __name__ == "__main__":
    unittest.main()
