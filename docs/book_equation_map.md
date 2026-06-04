# Book Equation Map — "Navigation in Space by X-ray Pulsars" (2011)

**Authors:** Amir Abbas Emadzadeh, Jason Lee Speyer  
**Publisher:** Springer, New York  
**DOI:** 10.1007/978-1-4419-8017-5

---

## Chapter 3: Signal Modeling

### 3.1 Geometric Range

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.1 | Projected distance between spacecraft | `Δd = n · Δx = c·t_d` | `n`: unit direction vector to pulsar, `Δx`: relative position, `c`: speed of light, `t_d`: time delay | m, m, m/s, s | `pulsar_nav/signal_model.py` |

### 3.2 Non-Homogeneous Poisson Process (NHPP)

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.2 | Ordered TOA sequence | `t_0 ≤ t_1 < t_2 < ⋯ < t_M ≤ t_f` | `t_i`: TOA of ith photon, `M`: total photon count | s | `pulsar_nav/signal_model.py` |
| 3.3 | Point process definition | `N_t = max{n, t_n ≤ t}` | `N_t`: number of photons in `(0,t)` | count | `pulsar_nav/signal_model.py` |
| 3.4 | Single photon probability | `P(N_{t+Δt} - N_t = 1) = λ(t)Δt` | `λ(t)`: rate function | ph/s | `pulsar_nav/signal_model.py` |
| 3.5 | No simultaneous photons | `P(N_{t+Δt} - N_t ≥ 2) = 0` | — | — | `pulsar_nav/signal_model.py` |
| 3.7 | Poisson distribution for count | `P(N_t = k) = [∫₀ᵗ λ(ξ)dξ]^k exp(-∫₀ᵗ λ(ξ)dξ) / k!` | `k`: photon count | count | `pulsar_nav/signal_model.py` |
| 3.8 | Mean and variance of N_t | `E[N_t] = var[N_t] = ∫₀ᵗ λ(ξ)dξ ≜ Λ(t)` | `Λ(t)`: integrated rate | count | `pulsar_nav/signal_model.py` |
| 3.9 | Interval Poisson distribution | `P(N_t - N_s = k) = [∫_s^t λ(ξ)dξ]^k exp(-∫_s^t λ(ξ)dξ) / k!` | — | count | `pulsar_nav/signal_model.py` |
| 3.10 | Joint TOA PDF (Theorem 3.1) | `p({t_i}, M) = e^{-Λ} ∏ᵢ λ(t_i)` for `M ≥ 1` | `Λ`: integrated rate over `[t_0, t_f]` | — | `pulsar_nav/signal_model.py` |
| 3.11 | Integrated rate | `Λ ≜ Λ(t_f) - Λ(t_0)` | — | count | `pulsar_nav/signal_model.py` |

### 3.3 X-ray Pulsar Signal (Rate Function)

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.18 | Overall rate function | `λ(t) = λ_b + λ_s · h(φ_det(t))` | `λ_b`: background rate, `λ_s`: source rate, `h(φ)`: normalized profile | ph/s | `pulsar_nav/signal_model.py` |
| 3.19 | Background rate | `λ_b = b · η · A` | `b`: background rate density, `η`: efficiency, `A`: area | ph/s | `pulsar_nav/signal_model.py` |
| 3.20 | Source rate | `λ_s = s · η · A` | `s`: source flux | ph/s | `pulsar_nav/signal_model.py` |
| 3.21 | Detected phase | `φ_det(t) = φ_0 + ∫_{t_0}^t f_o(τ) dτ` | `φ_0`: initial phase, `f_o`: observed frequency | cycle | `pulsar_nav/signal_model.py` |
| 3.22 | Observed frequency decomposition | `f_o(t) = f_s + f_d(t)` | `f_s`: source freq, `f_d`: Doppler shift | Hz | `pulsar_nav/signal_model.py` |
| 3.23 | Doppler frequency | `f_d(t) = f_s · v(t) / c` | `v(t)`: detector velocity | Hz | `pulsar_nav/signal_model.py` |
| 3.24 | Full detected phase | `φ_det(t) = φ_0 + f_s(t - t_0) + ∫_{t_0}^t f_d(τ) dτ` | — | cycle | `pulsar_nav/signal_model.py` |

### 3.4 Constant-Frequency Model

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.25 | Constant-frequency phase | `φ_det(t) = φ_0 + (t - t_0) · f_o` | `f_o`: observed constant freq | cycle | `pulsar_nav/signal_model.py` |
| 3.26 | Observed frequency | `f_o = (1 + v/c) · f_s` | `v`: constant velocity | Hz | `pulsar_nav/signal_model.py` |
| 3.27 | Constant-frequency rate function | `λ(t; φ_0, f_o) = λ_b + λ_s · h(φ_0 + (t - t_0) · f_o)` | — | ph/s | `pulsar_nav/signal_model.py` |

### 3.5 Time-Dependent-Frequency Model

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.28 | Doppler phase | `φ_d(t) = ∫_{t_0}^t f_d(τ) dτ` | — | cycle | `pulsar_nav/signal_model.py` |
| 3.29 | Time-dependent detected phase | `φ_det(t) = φ_0 + (t - t_0)·f_s + φ_d(t)` | — | cycle | `pulsar_nav/signal_model.py` |
| 3.30 | Time-dependent rate function | `λ(t; φ_0, v(t)) = λ_b + λ_s · h(φ_0 + (t - t_0)·f_s + φ_d(t))` | — | ph/s | `pulsar_nav/signal_model.py` |

### 3.6 Epoch Folding

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.38 | Poisson bin count statistics | `E[c(t_i)] = var[c(t_i)] = λ(t_i)·T_b` | `c(t_i)`: count in ith bin, `T_b`: bin width | count | `pulsar_nav/epoch_folding.py` |
| 3.39 | Empirical rate function | `λ̆(t_i) = (1/(N_p·T_b)) · Σⱼ cⱼ(t_i)` | `N_p`: number of periods | ph/s | `pulsar_nav/epoch_folding.py` |
| 3.40 | Empirical = true + noise (Thm 3.2) | `λ̆(t_i) = λ(t_i) + n̆(t_i)` | `n̆`: epoch folding noise | ph/s | `pulsar_nav/epoch_folding.py` |
| 3.41 | Noise mean | `E[n̆(t_i)] = 0` | — | — | `pulsar_nav/epoch_folding.py` |
| 3.42 | Noise variance | `var[n̆(t_i)] = (N_b / T_obs) · λ(t_i)` | `N_b`: num bins, `T_obs`: obs time | (ph/s)² | `pulsar_nav/epoch_folding.py` |

### 3.7 Epoch Folding with Velocity Errors

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.59 | Frequency shift from velocity error | `Δf_o = f_s · Δv / c` | `Δv`: velocity error | Hz | `pulsar_nav/epoch_folding.py` |
| 3.60 | Period change | `ΔP = -Δf_o / f_o²` | — | s | `pulsar_nav/epoch_folding.py` |
| 3.61 | Period change simplified | `ΔP = -(f_s / (c·f_o²)) · Δv` | — | s | `pulsar_nav/epoch_folding.py` |
| 3.66 | Phase change | `Δφ ≈ -(1/c)·Δv` | — | cycle | `pulsar_nav/epoch_folding.py` |
| 3.68 | Empirical rate with velocity error | `λ̆(t_i) = (1/Ňp) Σⱼ λ(t_i; φ_0 + (j-1)Δφ) + n̆(t_i)` | `Ňp`: perturbed period count | ph/s | `pulsar_nav/epoch_folding.py` |
| 3.72 | Velocity error tolerance bound | `Δv < c / (N_b · Ňp)` | — | m/s | `pulsar_nav/epoch_folding.py` |

### 3.8 TOA Simulation (Algorithm 3.1)

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 3.76 | Inter-arrival CDF | `P(Z > z | t_n = t) = exp(-(Λ(t+z) - Λ(t)))` | `Z`: inter-arrival time | — | `pulsar_nav/signal_model.py` |
| 3.80 | TOA generation via inversion | `Z = -t + Λ⁻¹(Λ(t) - ln U)` | `U ~ Uniform(0,1)` | s | `pulsar_nav/signal_model.py` |
| 3.86 | Recursive TOA generation | `t_{n+1} = Λ⁻¹(Λ(t_n) + E)`, `E ~ Exp(1)` | — | s | `pulsar_nav/signal_model.py` |
| Alg 3.1 | TOA Simulation Algorithm | See book p. 42 | — | — | `pulsar_nav/signal_model.py` |

---

## Chapter 4: Pulse Delay Estimation

### 4.1 Pulse Delay Formulation

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 4.1 | Rate function on detector 1 | `λ₁(t; φ₁) = λ_b + λ_s · h(φ₁ + (t - t_0)·f₁)` | `f₁`: observed freq at det 1 | ph/s | `pulsar_nav/delay_estimation.py` |
| 4.2 | Rate function on detector 2 | `λ₂(t; φ₁) = λ_b + λ_s · h(φ₁ + (t - t_0 - t_e - t_x)·f₂)` | `t_e`: clock differential, `t_x`: true time delay | ph/s | `pulsar_nav/delay_estimation.py` |
| 4.3 | Phase-delay relation | `φ₂ ≜ φ₁ - f₂·t_d`, where `t_d = t_e + t_x` | `t_d`: pulse delay | s | `pulsar_nav/delay_estimation.py` |
| 4.43 | Pulse delay estimate | `t̂_d = (φ̂₁ - φ̂₂) / f̂₂` | — | s | `pulsar_nav/delay_estimation.py` |

### 4.2 Cramér–Rao Lower Bound (CRLB)

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 4.6 | CRLB inequality | `cov(θ̂) ≥ I⁻¹(θ)` | `I(θ)`: Fisher matrix | — | `pulsar_nav/crlb.py` |
| 4.7 | Fisher matrix element | `[I(θ)]ᵢⱼ = -E[∂²/∂θᵢ∂θⱼ ln p(x;θ)]` | — | — | `pulsar_nav/crlb.py` |
| 4.10 | Fisher matrix for (φ₀, f_o) | `I(θ) = I_p/6 · [[6T_obs, 3T²_obs], [3T²_obs, 2T³_obs]]` | — | — | `pulsar_nav/crlb.py` |
| 4.11 | Fisher integral I_p | `I_p = ∫₀¹ [λ_s·h'(φ)]² / [λ_b + λ_s·h(φ)] dφ` | — | — | `pulsar_nav/crlb.py` |
| 4.12 | CRLB matrix | `CRLB(θ) = (2/I_p)·[[2/T_obs, -3/T²_obs], [-3/T²_obs, 6/T³_obs]]` | — | — | `pulsar_nav/crlb.py` |
| 4.22 | Fisher element integral form | `I_ij = ∫_{t_0}^{t_f} (∂λ/∂θᵢ)(∂λ/∂θⱼ)/λ dt` | — | — | `pulsar_nav/crlb.py` |
| 4.42 | CRLB for φ₀ (known f_o) | `CRLB(φ₀) = 1/(T_obs · I_p)` | — | cycle² | `pulsar_nav/crlb.py` |
| 4.44 | CRLB for pulse delay t_d | `CRLB(t_d) = 2/(f₂² · T_obs · I_p)` | — | s² | `pulsar_nav/crlb.py` |

---

## Chapter 5: Pulse Delay Estimation Using Epoch Folding

### 5.1 Pulse Delay from Phase Estimates

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 5.1 | Pulse delay from phases | `t̂_d = (φ̂₁ - φ̂₂) / f₂` (same as 4.43) | — | s | `pulsar_nav/delay_estimation.py` |

### 5.2 Cross Correlation (CC) Estimator

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 5.7 | CC phase estimator | `φ̂_j = -argmax_ψ R_j(ψ)` | — | cycle | `pulsar_nav/delay_estimation.py` |
| 5.8 | CC function (continuous) | `R_j(ψ) = ∫ λ*(t)·λ̆_j(t;ψ) dt` | — | — | `pulsar_nav/delay_estimation.py` |
| 5.9 | CC estimator variance | `var[t̂_d] = 2·∫₀¹(λ_b+λ_s·h(φ))·[λ_s·h'(φ)]²dφ / [f₂²·T_obs·(∫₀¹[λ_s·h'(φ)]²dφ)²]` | — | s² | `pulsar_nav/delay_estimation.py` |
| 5.72 | Discrete CC function | `R_D(ψ) = (1/N_b) Σₖ x₁(kT_b)·x₂(kT_b;ψ)` | — | — | `pulsar_nav/delay_estimation.py` |
| 5.73 | Fourier-domain CC | `R_D(ψ) = F⁻¹{X₁(f_k)·X₂*(f_k)}` | — | — | `pulsar_nav/delay_estimation.py` |
| 5.76 | Parabolic interpolation | `φ̂ = k_m·T_s - ½·[R_D(k_m·T_s+T_s) - R_D(k_m·T_s-T_s)] / [R_D(k_m·T_s+T_s) - 2R_D(k_m·T_s) + R_D(k_m·T_s-T_s)]` | — | cycle | `pulsar_nav/delay_estimation.py` |

### 5.3 Nonlinear Least Squares (NLS) Estimator

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 5.47 | NLS cost function | `J(φ_j) = Σᵢ (λ̆_j(t_i) - λ(t_i; φ_j))²` | — | — | `pulsar_nav/delay_estimation.py` |
| 5.48 | NLS estimator | `φ̂_j = argmin_{φ_j∈(0,1)} J(φ_j)` | — | cycle | `pulsar_nav/delay_estimation.py` |
| 5.65 | NLS variance (discrete) | `var[φ̂_j] = (N_b/T_obs)·Σ λ(t_i;φ_o)·λ'²(t_i;φ_o) / (Σ λ'²(t_i;φ_o))²` | — | cycle² | `pulsar_nav/delay_estimation.py` |
| 5.66 | NLS variance (continuous) | `var[φ̂_j] = ∫₀¹(λ_b+λ_s·h(φ))·[λ_s·h'(φ)]²dφ / [T_obs·(∫₀¹[λ_s·h'(φ)]²dφ)²]` | — | cycle² | `pulsar_nav/delay_estimation.py` |

### 5.4 Asymptotic Relative Efficiency

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 5.39 | ARE (CC/NLS vs CRLB) | `var[t̂_d]/CRLB(t_d) = ∫g₁·∫g₃ / (∫g₂)²` | `g₁,g₂,g₃`: see 5.40-5.42 | — | `pulsar_nav/crlb.py` |
| 5.40 | g₁ definition | `g₁(φ) = (λ_b+λ_s·h(φ))·[λ_s·h'(φ)]²` | — | — | `pulsar_nav/crlb.py` |
| 5.41 | g₂ definition | `g₂(φ) = [λ_s·h'(φ)]²` | — | — | `pulsar_nav/crlb.py` |
| 5.42 | g₃ definition | `g₃(φ) = [λ_s·h'(φ)]² / (λ_b+λ_s·h(φ))` | — | — | `pulsar_nav/crlb.py` |

---

## Chapter 6: Pulse Delay Estimation via Direct Use of TOAs

### 6.1 Maximum-Likelihood Estimator (MLE)

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 6.1 | TOA likelihood function | `p({t^(k)_i}; φ_k, f_k) = e^{-Λ(φ_k,f_k)} · ∏ᵢ λ_k(t^(k)_i; φ_k, f_k)` | — | — | `pulsar_nav/delay_estimation.py` |
| 6.2 | Integrated rate for MLE | `Λ(φ_k, f_k) = ∫_{t_0}^{t_f} λ_k(t; φ_k, f_k) dt` | — | count | `pulsar_nav/delay_estimation.py` |
| 6.3 | Log-likelihood function (full) | `LLF(φ_k, f_k) = Σᵢ ln(λ_k(t_i; φ_k, f_k)) - Λ(φ_k, f_k)` | — | — | `pulsar_nav/delay_estimation.py` |
| 6.5 | Simplified ML cost function | `Ψ(φ_k, f_k) = Σᵢ ln(λ_k(t_i; φ_k, f_k))` | (drops Λ for long T_obs) | — | `pulsar_nav/delay_estimation.py` |
| 6.6 | Joint MLE optimization | `(φ̂_k, f̂_k) = argmax Ψ(φ_k, f_k)` | — | — | `pulsar_nav/delay_estimation.py` |
| 6.18 | Phase-only MLE (known velocity) | `φ̂_k = argmax_{φ_k∈(0,1)} Ψ(φ_k)` | — | cycle | `pulsar_nav/delay_estimation.py` |
| 6.20 | Newton-Raphson iteration | `θ^(k+1) = θ^(k) - [∂²/∂θ∂θᵀ ln p]⁻¹ · ∂/∂θ ln p` | — | — | `pulsar_nav/delay_estimation.py` |

---

## Chapter 7: Recursive Estimation (Extended Kalman Filter)

### 7.1 System Dynamics

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.1 | Relative dynamics | `ΔẊ = A·ΔX + B·Δa + G·w_v` | `ΔX = [Δx; Δv]` | m, m/s | `pulsar_nav/kalman_filter.py` |
| 7.2 | System matrices | `A=[[0,I];[0,0]], B=[[0];[I]], G=[[I];[0]]` | 6×6, 6×3, 6×3 | — | `pulsar_nav/kalman_filter.py` |
| 7.3 | Process noise PSD (velocity) | `E[w_v(t)w_v(τ)ᵀ] = W_v·δ(t-τ)` | `W_v`: velocity PSD | m²/s | `pulsar_nav/kalman_filter.py` |
| 7.4 | IMU measurement model | `a^(i)_IMU = a^(i) + w^(i)_a + b^(i)_a` | `w_a`: noise, `b_a`: bias | m/s² | `pulsar_nav/kalman_filter.py` |
| 7.6 | Relative IMU measurement | `ΔaIMU = Δa + b_a + w_a` | — | m/s² | `pulsar_nav/kalman_filter.py` |
| 7.9 | Bias dynamics (Brownian) | `ḃ_a = w_b` | `w_b`: bias drift noise | m/s³ | `pulsar_nav/kalman_filter.py` |
| 7.14 | Error dynamics | `Ẋ_e = A·X_e + B·b_a + B·w_a + G·w_v` | `X_e = ΔX_IMU - ΔX` | — | `pulsar_nav/kalman_filter.py` |
| 7.15 | Clock differential dynamics | `ṫ_e = w_e` | `w_e`: clock noise | s/s | `pulsar_nav/kalman_filter.py` |
| 7.17 | Full state vector (10-dim) | `X = [X_e; b_a; t_e]` | — | mixed | `pulsar_nav/kalman_filter.py` |
| 7.18 | Continuous state dynamics | `Ẋ = F·X + w` | `F`: 10×10 system matrix | — | `pulsar_nav/kalman_filter.py` |
| 7.19 | System matrix F | `F = [[A,B,0];[0,0,0];[0,0,0]]` | 10×10 | — | `pulsar_nav/kalman_filter.py` |

### 7.2 Discrete-Time Dynamics

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.22 | Discrete state equation | `X(k+1) = Φ·X(k) + w_d(k)` | `Φ`: state transition | — | `pulsar_nav/kalman_filter.py` |
| 7.23 | State transition matrix | `Φ = exp(F·T_s)` | `T_s`: sampling period | — | `pulsar_nav/kalman_filter.py` |
| 7.25 | Φ expansion (F³=0) | `Φ = I + T_s·F + (T_s²/2)·F²` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.26 | Explicit Φ matrix | `Φ = [[I,T_s·I,½T_s²·I,0];[0,I,T_s·I,0];[0,0,I,0];[0,0,0,1]]` | 10×10 | — | `pulsar_nav/kalman_filter.py` |
| 7.29 | Process noise covariance Q | See full matrix in book | 10×10 | mixed | `pulsar_nav/kalman_filter.py` |

### 7.3 Measurements

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.30 | Pulse delay measurement | `c·t̂_d^(i)(k) = H^(i)·Δx(k) + c·t_e(k) + η_d^(i)(k)` | `H^(i)`: pulsar direction | m | `pulsar_nav/kalman_filter.py` |
| 7.31 | Measurement noise correlation | `E[η_d^(i)(k)η_d^(i)(j)ᵀ] = R^(i)·δ_kj` | `R^(i) = c²·var[t̂_d]^(i)` | m² | `pulsar_nav/kalman_filter.py` |
| 7.32 | Measurement definition | `y^(i)(k) ≜ c·t̂_d^(i)(k)` | — | m | `pulsar_nav/kalman_filter.py` |
| 7.33 | Discrete measurement model | `y^(i)(k) = H^(i)·Δx(k) + c·t_e(k) + η_d^(i)(k)` | — | m | `pulsar_nav/kalman_filter.py` |
| 7.34 | Stacked measurements | `Y(k) = C·ΔX(k) + c·1·t_e(k) + η_d(k)` | `C`: N×6 | m | `pulsar_nav/kalman_filter.py` |
| 7.35 | Measurement matrices | `C = [[H^(1),0];...;[H^(N),0]]` | N×6 | — | `pulsar_nav/kalman_filter.py` |
| 7.38 | Measurement noise covariance | `R = diag(R^(i))` | N×N | m² | `pulsar_nav/kalman_filter.py` |
| 7.39 | Transformed measurement | `Z(k) = -(Y(k) - C·ΔX_IMU(k))` | — | m | `pulsar_nav/kalman_filter.py` |
| 7.40 | Final measurement equation | `Z(k) = H·X(k) + η(k)` | — | m | `pulsar_nav/kalman_filter.py` |
| 7.41 | Full measurement matrix H | `H = [C, 0_{N×3}, -c·1]` | N×10 | — | `pulsar_nav/kalman_filter.py` |

### 7.4 Kalman Filter Equations

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.42a | Initial state estimate | `X̂⁻₀ = E[X₀]` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.42b | Initial error covariance | `P⁻₀ = E[(X₀ - X̂⁻₀)(X₀ - X̂⁻₀)ᵀ]` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.43a | Kalman gain | `K_k = P⁻_k·Hᵀ·[H·P⁻_k·Hᵀ + R]⁻¹` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.43b | State update | `X̂⁺_k = X̂⁻_k + K_k·[Z_k - H·X̂⁻_k]` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.43c | Covariance update (Joseph) | `P⁺_k = [I - K_k·H]·P⁻_k·[I - K_k·H]ᵀ + K_k·R·K_kᵀ` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.43d | State prediction | `X̂⁻_{k+1} = Φ·X̂⁺_k` | — | — | `pulsar_nav/kalman_filter.py` |
| 7.43e | Covariance prediction | `P⁻_{k+1} = Φ·P⁺_k·Φᵀ + Q` | — | — | `pulsar_nav/kalman_filter.py` |

### 7.5 Observability

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.45 | Observability matrix | `O = [H; H·F; H·F²]` | 3N×10 | — | `pulsar_nav/kalman_filter.py` |
| 7.46 | Pulsar direction matrix | `Γ = [H^(1); H^(2); ...; H^(N)]` | N×3 | — | `pulsar_nav/kalman_filter.py` |

### 7.6 Absolute Navigation

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| — | SSB as reference | Place one spacecraft at SSB → absolute navigation | — | — | `pulsar_nav/kalman_filter.py` |

### 7.7 Geometric Velocity Estimation

| Eq. | Description | Formula | Variables | Units | Implementation |
|-----|-------------|---------|-----------|-------|----------------|
| 7.48 | Estimated time delay expansion | `t̂_d^(i) ≈ (Δφ̂^(i) + n^(i)) / f_s^(i) · (1 - V_j·cosθ_i/c)` | — | s | `pulsar_nav/kalman_filter.py` |
| 7.52 | Velocity estimation measurement | `z^(i) = H^(i)·Δx/c + t_e + z^(i)·V_j·cosθ_i/c + η^(i)` | — | s | `pulsar_nav/kalman_filter.py` |

### 7.8 Numerical Simulation Parameters

| Parameter | Value | Description | Implementation |
|-----------|-------|-------------|----------------|
| P₀ₓ | diag(10⁶, 10⁶, 10⁶) m | Initial position uncertainty | `pulsar_nav/kalman_filter.py` |
| P₀ᵥ | diag(10⁴, 10³, 10²) m/s | Initial velocity uncertainty | `pulsar_nav/kalman_filter.py` |
| P₀ᵦ | diag(10⁰·⁵, 10⁰·⁵, 10⁰·⁵) m/s² | Initial bias uncertainty | `pulsar_nav/kalman_filter.py` |
| P₀ₜ | 10³ s | Initial clock uncertainty | `pulsar_nav/kalman_filter.py` |
| √W_v | 10⁻⁶·I m/√s | Velocity process noise | `pulsar_nav/kalman_filter.py` |
| √W_a | 10⁻⁷·I m/√s³ | Acceleration noise | `pulsar_nav/kalman_filter.py` |
| √W_b | 10⁻⁵·I m/√s⁵ | Bias drift noise | `pulsar_nav/kalman_filter.py` |
| √W_e | 10⁻⁶ √s | Clock noise | `pulsar_nav/kalman_filter.py` |

---

## Pulsar Data (Tables 7.1, 7.2)

| Pulsar | Period (s) | Gal. Long. (°) | Gal. Lat. (°) | Flux (ph/cm²/s) |
|--------|-----------|-----------------|----------------|------------------|
| B0531+21 | 0.0335 | 184.56 | -5.78 | 1.54E+00 |
| B0540-69 | 0.0504 | 279.72 | -31.52 | 5.15E-03 |
| B0833-45 | 0.0893 | 263.55 | -2.79 | 1.59E-03 |
| B1509-58 | 0.1502 | 320.32 | -1.16 | 1.62E-02 |
| B1821-24 | 0.0031 | 7.80 | -5.58 | 1.93E-04 |
| B1937+21 | 0.0016 | 57.51 | -0.29 | 4.99E-05 |
| B1055-52 | 0.1971 | 164.50 | -52.45 | 1.64E-06 |
| J0437-47 | 0.0057 | 253.39 | -41.96 | 6.65E-05 |

---

## Legend

- **ph/s** = photons per second  
- **cycle** = one full rotation of pulsar phase  
- **SSB** = Solar System Barycenter  
- **TOA** = Time of Arrival  
- **NHPP** = Non-Homogeneous Poisson Process  
- **CRLB** = Cramér–Rao Lower Bound  
- **CC** = Cross Correlation  
- **NLS** = Nonlinear Least Squares  
- **MLE** = Maximum Likelihood Estimator  
- **EKF** = Extended Kalman Filter  
- **IMU** = Inertial Measurement Unit  
- **PSD** = Power Spectral Density
