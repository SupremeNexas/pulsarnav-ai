"""
PulsarNav — AI-Assisted Autonomous Deep Space Navigation

Mathematical framework based on:
    "Navigation in Space by X-ray Pulsars"
    Amir Abbas Emadzadeh, Jason Lee Speyer (2011, Springer)

Modules:
    pulsar_catalog       — Book pulsar data (Tables 7.1, 7.2)
    signal_model         — NHPP, profiles, TOA generation (Chapter 3)
    epoch_folding        — Epoch folding and noise analysis (Chapter 3)
    crlb                 — Fisher matrix, CRLB, ARE (Chapter 4)
    delay_estimation     — CC, NLS, MLE estimators (Chapters 5–6)
    navigation_geometry  — Direction vectors, observability (Chapter 7)
    kalman_filter        — 10-state recursive estimation (Chapter 7)
"""

__version__ = "0.2.0"

from .pulsar_catalog import (
    BOOK_PULSARS,
    PULSAR_BY_NAME,
    PulsarEntry,
    get_crab,
    get_pulsar,
)
from .signal_model import (
    PulsarProfile,
    RateFunction,
    generate_photon_toas,
    make_crab_rate_function,
    make_rate_function,
)
from .epoch_folding import (
    epoch_fold,
    epoch_folding_noise_variance,
    velocity_error_tolerance,
)
from .crlb import (
    asymptotic_relative_efficiency,
    crlb_distance_sigma,
    crlb_phase,
    crlb_pulse_delay,
    fisher_integral_Ip,
    fisher_matrix,
)
from .delay_estimation import (
    CrossCorrelationEstimator,
    MaximumLikelihoodEstimator,
    NLSEstimator,
    estimate_pulse_delay,
    run_delay_estimation,
)
from .navigation_geometry import (
    check_observability,
    direction_matrix_Gamma,
    measurement_matrix_H,
    process_noise_Q,
    state_transition_Phi,
)
from .kalman_filter import (
    KalmanFilterConfig,
    PulsarNavigationKF,
    simulate_navigation,
)
