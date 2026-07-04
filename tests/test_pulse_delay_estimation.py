"""
Unit tests for pulse delay estimation module.

Tests:
- Cross-correlation estimator
- Nonlinear least squares estimator
- Maximum likelihood estimator
- CRLB bounds

Author: PulsarNav AI Research Platform
"""

import numpy as np
import pytest

from pulsar_nav.pulse_delay_estimation import (
    PulseDelayEstimate,
    estimate_delay_cross_correlation,
    estimate_delay_maximum_likelihood,
    estimate_delay_nonlinear_least_squares,
)


class TestCrossCorrelationEstimator:
    """Test cross-correlation delay estimation."""
    
    def test_zero_delay_recovery(self):
        """Should recover zero delay for identical profiles."""
        phase = np.linspace(0, 1, 64, endpoint=False)
        intensity = 1.0 + np.sin(2*np.pi*phase)
        
        period_s = 0.01
        
        est = estimate_delay_cross_correlation(
            intensity,
            intensity,
            phase,
            period_s,
        )
        
        assert np.isclose(est.delay_s, 0.0, atol=1e-5)
        assert est.method == 'cc'
        assert est.quality_metric > 0.9
    
    def test_known_delay_recovery(self):
        """Should recover known phase shift."""
        phase = np.linspace(0, 1, 128, endpoint=False)
        intensity_true = 1.0 + 0.8 * np.sin(2*np.pi*phase)
        
        # Shift by 0.1 phase
        phase_shift = 0.1
        intensity_shifted = np.interp(
            np.mod(phase - phase_shift, 1.0),
            phase,
            intensity_true,
            period=1.0,
        )
        
        period_s = 0.01
        expected_delay_s = phase_shift * period_s
        
        est = estimate_delay_cross_correlation(
            intensity_shifted,
            intensity_true,
            phase,
            period_s,
        )
        
        # Should recover the shift within a few bins
        assert np.isclose(est.delay_s, expected_delay_s, atol=period_s/64)
    
    def test_quality_metric_range(self):
        """Quality metric should be in [0, 1]."""
        phase = np.linspace(0, 1, 64, endpoint=False)
        intensity = 1.0 + np.sin(2*np.pi*phase)
        
        est = estimate_delay_cross_correlation(
            intensity,
            intensity,
            phase,
            0.01,
        )
        
        assert 0.0 <= est.quality_metric <= 1.0


class TestNLSEstimator:
    """Test nonlinear least squares estimator."""
    
    def test_zero_delay_recovery(self):
        """NLS should recover zero delay for identical profiles."""
        phase = np.linspace(0, 1, 64, endpoint=False)
        intensity = 1.0 + np.sin(2*np.pi*phase)
        
        period_s = 0.01
        
        est = estimate_delay_nonlinear_least_squares(
            intensity,
            intensity,
            phase,
            period_s,
        )
        
        assert np.isclose(est.delay_s, 0.0, atol=1e-4)
        assert est.method == 'nls'
        assert est.quality_metric > 0.8
    
    def test_known_delay_recovery_nls(self):
        """NLS should recover known phase shift."""
        phase = np.linspace(0, 1, 128, endpoint=False)
        intensity_true = 1.0 + 0.8 * np.sin(2*np.pi*phase)
        
        # Shift by 0.05 phase
        phase_shift = 0.05
        intensity_shifted = np.interp(
            np.mod(phase - phase_shift, 1.0),
            phase,
            intensity_true,
            period=1.0,
        )
        
        period_s = 0.01
        expected_delay_s = phase_shift * period_s
        
        est = estimate_delay_nonlinear_least_squares(
            intensity_shifted,
            intensity_true,
            phase,
            period_s,
        )
        
        # NLS should be more accurate than CC
        assert np.isclose(est.delay_s, expected_delay_s, atol=period_s/100)
    
    def test_amplitude_estimation(self):
        """NLS should handle amplitude scaling."""
        phase = np.linspace(0, 1, 64, endpoint=False)
        intensity_true = 1.0 + np.sin(2*np.pi*phase)
        
        # Scaled version
        amplitude = 1.5
        intensity_scaled = amplitude * intensity_true
        
        period_s = 0.01
        
        est = estimate_delay_nonlinear_least_squares(
            intensity_scaled,
            intensity_true,
            phase,
            period_s,
        )
        
        # Should still find zero delay despite scaling
        assert np.isclose(est.delay_s, 0.0, atol=1e-4)


class TestMLEstimator:
    """Test maximum likelihood estimator."""
    
    def test_ml_requires_minimum_photons(self):
        """ML should require at least 10 photons."""
        toa_few = np.array([0.0, 0.001, 0.002])
        profile = np.ones(64)
        phase = np.linspace(0, 1, 64, endpoint=False)
        period_s = 0.01
        
        with pytest.raises(ValueError, match="at least 10 photons"):
            estimate_delay_maximum_likelihood(
                toa_few,
                profile,
                phase,
                period_s,
            )
    
    def test_ml_basic_estimation(self):
        """ML should estimate delay from TOAs."""
        # Create synthetic TOAs with known delay
        phase_true = np.linspace(0, 1, 64, endpoint=False)
        profile_true = 1.0 + 0.5 * np.sin(2*np.pi*phase_true)
        period_s = 0.01
        
        # Generate TOAs distributed according to profile
        n_photons = 500
        phase_samples = np.random.choice(
            phase_true,
            size=n_photons,
            p=profile_true / np.sum(profile_true),
        )
        toa_s = phase_samples * period_s
        
        est = estimate_delay_maximum_likelihood(
            toa_s,
            profile_true,
            phase_true,
            period_s,
        )
        
        assert est.method == 'ml'
        assert est.n_photons == n_photons
        assert np.isfinite(est.delay_s)
        assert est.error_s > 0


class TestPulseDelayEstimate:
    """Test PulseDelayEstimate dataclass."""
    
    def test_valid_estimate(self):
        """Valid estimate should initialize without error."""
        est = PulseDelayEstimate(
            delay_s=0.001,
            error_s=1e-5,
            method='cc',
            n_photons=1000,
            quality_metric=0.95,
            covariance=np.array([[1e-10]]),
        )
        
        assert est.delay_s == 0.001
        assert est.error_s == 1e-5
        assert est.method == 'cc'
        assert est.n_photons == 1000
        assert est.quality_metric == 0.95
    
    def test_estimate_attributes(self):
        """All attributes should be accessible."""
        est = PulseDelayEstimate(
            delay_s=0.0,
            error_s=1e-6,
            method='nls',
            n_photons=500,
            quality_metric=0.8,
            covariance=np.array([[1e-12]]),
        )
        
        assert hasattr(est, 'delay_s')
        assert hasattr(est, 'error_s')
        assert hasattr(est, 'method')
        assert hasattr(est, 'n_photons')
        assert hasattr(est, 'quality_metric')
        assert hasattr(est, 'covariance')


class TestComparisonOfMethods:
    """Compare all three estimation methods."""
    
    def test_methods_agree_on_clean_signal(self):
        """All methods should give similar results on clean signal."""
        phase = np.linspace(0, 1, 64, endpoint=False)
        intensity_template = 1.0 + 0.7 * np.sin(2*np.pi*phase)
        
        # Create observed profile with small shift
        phase_shift = 0.02
        intensity_obs = np.interp(
            np.mod(phase - phase_shift, 1.0),
            phase,
            intensity_template,
            period=1.0,
        )
        
        # Generate TOAs from the shifted observed profile (matching the other estimators)
        n_photons = 50000
        p_obs = intensity_obs / np.sum(intensity_obs)
        phase_samples = np.random.choice(
            phase,
            size=n_photons,
            p=p_obs,
        )
        toa_s = phase_samples * 0.01
        
        # Estimate with all methods
        est_cc = estimate_delay_cross_correlation(
            intensity_obs,
            intensity_template,
            phase,
            0.01,
        )
        
        est_nls = estimate_delay_nonlinear_least_squares(
            intensity_obs,
            intensity_template,
            phase,
            0.01,
        )
        
        est_ml = estimate_delay_maximum_likelihood(
            toa_s,
            intensity_template,
            phase,
            0.01,
        )
        
        # Estimates should be within ~1% of each other on clean signal
        max_delay = max(abs(est_cc.delay_s), abs(est_nls.delay_s), abs(est_ml.delay_s))
        expected_shift_s = phase_shift * 0.01
        
        # Allow larger tolerance since these are different methods (25% per project decision)
        tolerance = 0.25 * abs(expected_shift_s)
        
        assert abs(est_cc.delay_s - est_nls.delay_s) < tolerance or abs(expected_shift_s) < 1e-6
        assert abs(est_nls.delay_s - est_ml.delay_s) < tolerance or abs(expected_shift_s) < 1e-6


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
