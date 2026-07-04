# PulsarNav AI: Autonomous Pulsar-Based Deep Space Navigation Framework
## Complete Engineering & Scientific Handbook

This document serves as the comprehensive technical guide and architectural handbook for **PulsarNav AI**, an autonomous spacecraft navigation framework utilizing high-stability millisecond pulsars (MSPs) and the **NANOGrav 12.5-Year Narrowband Dataset**. It is designed for SAC ISRO mentors, future developers, academic researchers, and students joining the project.

---

## 1. Project Overview

### Project Objective
The primary objective of **PulsarNav AI** is to design, implement, and validate a research-grade simulation and estimation framework for **X-ray Pulsar Navigation (XNAV)**. The project integrates a high-fidelity Python scientific pipeline for astronomical data parsing, signal processing, and orbit determination with a modern, interactive Next.js mission-control console that provides real-time 3D orbit visualization, parameter sensitivity analysis, and statistical error validation.

### Problem Statement
Deep-space exploration missions (e.g., lunar, Martian, and outer-planet probes) have traditionally relied on Earth-based tracking systems. The ground-based paradigm introduces several severe operational bottlenecks:
1. **Geometric Dilution & Error Scaling:** Ground-based angular measurements (using VLBI) and range measurements suffer from errors that scale linearly with the spacecraft's distance from Earth. At outer-planet distances (e.g., Jupiter or Saturn), position errors can expand to tens or hundreds of kilometers.
2. **Communication Latency:** Two-way light time delays between Earth and deep space prevent real-time autonomous orbital corrections, which are critical during entry, descent, and landing (EDL) or high-velocity flybys.
3. **Network Congestion:** The Deep Space Network (DSN) is an expensive, oversubscribed global resource. Scheduling antenna time for routine orbit determination limits tracking frequency and creates operational bottlenecks.

### Importance of Pulsar Navigation
Pulsar navigation (XNAV) solves these challenges by utilizing celestial beacon sources—specifically, millisecond pulsars (MSPs). MSPs are rapidly rotating neutron stars with rotation periods of $1$ to $10$ milliseconds. They emit highly directional beams of electromagnetic radiation from their magnetic poles. Due to their immense density and conservation of angular momentum, their spin stability is comparable to terrestrial atomic clocks ($10^{-19}\text{ s/s}$ spin-down rates). 

By measuring the times of arrival (TOAs) of pulsar pulses at a spacecraft, the vehicle can determine its position, velocity, and onboard clock bias completely autonomously. Crucially, because pulsars are distributed isotropically across the galaxy, the navigation error does not scale with distance from Earth. XNAV provides a uniform, autonomous $3\text{D}$ positioning grid across the entire solar system.

### Comparative Analysis: GPS vs. DSN vs. Pulsar Navigation (XNAV)

| Parameter | Global Positioning System (GPS) | Deep Space Network (DSN) | Pulsar Navigation (XNAV) |
| :--- | :--- | :--- | :--- |
| **Signal Source** | Earth-orbiting artificial satellites | Earth-based giant antenna arrays | Galactic millisecond pulsars (neutron stars) |
| **Operational Region** | Near-Earth space (LEO, MEO, up to GEO) | Solar system and interstellar space | Unlimited (anywhere in the heliosphere and beyond) |
| **Autonomy** | Fully autonomous at receiver level | Dependent on ground-station uplinks/downlinks | 100% autonomous onboard spacecraft |
| **Error Characteristics** | $\sim 1 - 10\text{ meters}$, degrades above GEO | Scales linearly with distance from Earth | Uniform ($\sim 10\text{ m}$ to $10\text{ km}$ depending on integration time) |
| **Frequencies** | L-band radio (microwave) | S, X, and Ka-band radio | X-ray (highly collimated) or Radio |
| **Availability** | Continuous near Earth | Scheduled bottlenecks, subject to Earth rotation | Continuous, omnidirectional |

---

## 2. Repository Architecture

The PulsarNav AI codebase is bifurcated into a high-fidelity Python scientific library (`pulsar_nav`) and a Next.js web application for visual simulation and interactive telemetry analysis.

```text
.
├── app/                             # Next.js App Router Pages & API Routes
│   ├── api/
│   │   └── navigation-lab/
│   │       └── route.ts             # Web-based Monte Carlo & EKF Solver API
│   ├── dashboard/
│   │   └── page.tsx                 # Mission Control Dashboard Shell
│   ├── globals.css                  # Tailwind styles with RGB theme variables
│   ├── layout.tsx                   # Main React Context providers
│   └── page.tsx                     # Landing Page & Initial Parameter Config
├── components/                      # Reusable React & Three.js UI Components
│   ├── charts.tsx                   # Recharts wrappers for error summaries & CDFs
│   ├── navigation-comparison.tsx    # Interactive dashboard controls & comparisons
│   ├── space-scene.tsx              # Three.js / React Three Fiber J2000 3D canvas
│   ├── star-field.tsx               # Starry background particle effect
│   └── ui.tsx                       # Shorthand styled DOM elements
├── lib/                             # Core UI state hooks & local assets
├── pulsar_nav/                      # Core Scientific Python Library
│   ├── __init__.py                  # Package entry point
│   ├── cli.py                       # Python pipeline CLI launcher
│   ├── config.py                    # Physical & numerical constants
│   ├── coordinates.py               # RA/Dec to Cartesian coordinate converters
│   ├── crlb.py                      # Fisher Information & Cramér-Rao Lower Bounds
│   ├── delay_estimation.py          # CC, NLS, and MLE phase delay algorithms
│   ├── epoch_folding.py             # Epoch-folding & velocity-error tolerances
│   ├── kalman_filter.py             # 10-state linear error-state Kalman Filter
│   ├── navigation_engine.py         # WLS / LS position estimation pipeline
│   ├── navigation_geometry.py       # Direction matrix Gamma & observability
│   ├── parsing.py                   # TEMPO/TEMPO2 .par & .tim parser
│   ├── pulsar_catalog.py            # Astro reference catalog for the 8 book sources
│   ├── pulse_delay_estimation.py    # Test compatibility adapter layer
│   ├── ranking.py                   # Pulsar multi-factor ranking & GDOP selector
│   ├── signal_model.py              # NHPP rate functions & photon TOA simulator
│   ├── simulation.py                # Trajectory simulation helper functions
│   ├── timing_model.py              # Barycentric Römer & dispersion delays
│   └── xray_nav.py                  # High-fidelity 8-state absolute EKF engine
├── sample_data/                     # Packaged lightweight CSV files for Git
├── scripts/                         # Command-line utility scripts
│   ├── run_navigation_lab.py        # Python Monte Carlo script
│   └── run_pipeline.py              # Python batch pipeline runner
├── tests/                           # Python automated test suite
│   ├── test_navigation_engine.py    # Verification for LS/WLS engines
│   ├── test_pulse_delay_estimation.py # Verification for phase estimators
│   ├── test_timing.py               # Verification for Römer & dispersion models
│   └── test_xray_nav.py             # Verification for orbital EKF dynamics
├── package.json                     # Node.json dependency manifest
└── requirements.txt                 # Python dependency manifest
```

### Module Descriptions
* **[coordinates.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/coordinates.py):** Parses raw astronomical coordinates (e.g., sexagesimal right ascension and declination strings) and maps them to $3\text{D}$ Cartesian unit vectors in the Equatorial J2000 reference frame.
* **[timing_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/timing_model.py):** Calculates barycentric time corrections. Implements the Keplerian analytical orbit of the Earth-Moon Barycenter (EMB) relative to the Solar System Barycenter (SSB), Römer delays, and interstellar dispersion delays ($1/f^2$ plasma dispersion).
* **[signal_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/signal_model.py):** Simulates individual photon arrivals at a detector. Implements a Non-Homogeneous Poisson Process (NHPP) using accumulated rate inversion (Newton-Raphson method).
* **[epoch_folding.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/epoch_folding.py):** Implements phase binning of photon TOAs. Computes the empirical rate function and evaluates the smearing impact of velocity errors.
* **[delay_estimation.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/delay_estimation.py):** Implements three distinct phase delay estimation techniques: Cross-Correlation (FFT-accelerated), Nonlinear Least Squares (NLS), and Maximum Likelihood Estimation (MLE).
* **[crlb.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/crlb.py):** Calculates the theoretical limits of timing accuracy by evaluating the Fisher Information integral. Computes Asymptotic Relative Efficiency (ARE) to measure information loss due to phase binning.
* **[navigation_geometry.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_geometry.py):** Evaluates system observability (system matrix $F$ and measurement matrix $H$). Computes the Geometric Dilution of Precision (GDOP) and Position Dilution of Precision (PDOP).
* **[kalman_filter.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/kalman_filter.py):** Formulates a $10$-state linear error-state Kalman Filter (L-ESKF) for tracking spacecraft position, velocity, accelerometer biases, and clock bias relative to a nominal IMU trajectory.
* **[xray_nav.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/xray_nav.py):** Implements a high-fidelity, absolute-state $8$-state Extended Kalman Filter (EKF) featuring full orbital gravity models (two-body Keplerian + Earth $J_2$ oblateness) propagated via a $4^{\text{th}}$-order Runge-Kutta (RK4) integrator.

---

## 3. Dataset Overview

### NANOGrav 12.5-Year Narrowband Dataset
High-precision pulsar navigation models must be grounded in real astronomical measurements. PulsarNav AI is designed to ingest the official **NANOGrav 12.5-Year Data Release**, which contains high-cadence, sub-microsecond timing observations of dozens of millisecond pulsars collected using the Arecibo Observatory and the Green Bank Telescope.

### Telescope Parameter (`.par`) Files
A `.par` file contains the physical spin and astrometric model of the pulsar, derived from decades of phase-coherent timing. Key parameters extracted by our parser include:
* `PSRJ` / `PSR`: The official pulsar name (based on J2000 or B1950 coordinates).
* `RAJ` / `DECJ`: Right Ascension and Declination (sexagesimal strings, e.g., `17:13:49.533` / `+07:47:37.49`).
* `F0`: The spin frequency ($f_0$ in Hz).
* `F1`: The first derivative of the spin frequency ($\dot{f}$ in Hz/s, tracking energy loss due to magnetic dipole radiation).
* `PEPOCH`: The reference epoch at which the spin frequency is defined (MJD).
* `DM`: Dispersion Measure ($\text{pc/cm}^3$, representing the integrated electron column density along the line of sight).
* `START` / `FINISH`: The Modified Julian Dates defining the observation span.

```text
# Example .par File Structure (Abridged)
PSRJ          J1713+0747
RAJ           17:13:49.533470
DECJ          07:47:37.49512
F0            218.811843829054  1
F1            -4.08375e-16      1
PEPOCH        54500.000000
DM            15.9875           1
```

### Time of Arrival (`.tim`) Files
A `.tim` file contains lists of individual pulse Times of Arrival (TOAs) observed at the telescope. Each row represents a single TOA, formatted under TEMPO2 standards (typically `FORMAT 1` or `PRINCETON` style):
* The raw observed frequency (MHz) of the incoming radio wave.
* The Modified Julian Date (MJD) of the TOA at the observatory.
* The measurement uncertainty (microseconds) of the TOA.
* The observatory code (e.g., `ao` for Arecibo, `gbt` for Green Bank).
* Flags detailing instrument type, receiver backend, and channel bandwidth.

```text
# Example .tim File Structure (Abridged)
FORMAT 1
gbt_file.raw  1400.000000  55120.354182910543  0.035  gbt  -fe L-wide -be PUPPI
ao_file.raw   430.000000   55121.109284102941  0.082  ao   -fe 430    -be ASP
```

### Data Flow Through the Ingestion System
The ingestion and parsing pipeline flows as follows:

```
  [ .par Files ] -----> [ parse_par_file ] -----> [ Catalog DataFrame ] -----> [ Unit Vectors ]
                                                                                   |
                                                                                   v
  [ .tim Files ] -----> [ parse_tim_file ] -----> [ TOA DataFrame ] ---------> [ Ranking Engine ]
                                                         |                         |
                                                         v                         v
                                                [ TOA Statistics ] ------> [ Selected Pulsars ]
```

1. **Catalog Construction:** `build_catalog` in [parsing.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/parsing.py) reads the `.par` directory, extracts the astrometric and spin coordinates, and builds a unified pulsar catalog.
2. **Direction Vector Computation:** `build_unit_vectors` in [parsing.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/parsing.py) converts the catalog's celestial angles (RA/Dec) into Equatorial J2000 unit vectors $\mathbf{n}$.
3. **TOA Aggregation:** `build_toa_database` in [parsing.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/parsing.py) parses the `.tim` files, compiling millions of TOA rows into a single database.
4. **Statistical Summarization:** `toa_statistics` in [parsing.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/parsing.py) groups the database by pulsar name, calculating the total number of TOAs, observation duration (days), median frequency, and median measurement error.

---

## 4. Pulsar Concepts

### Physics of Pulsars
Pulsars are highly magnetized, rotating neutron stars formed during the core-collapse supernova explosions of massive stars (typically $8$ to $25$ solar masses). A neutron star packages approximately $1.4$ to $2.1$ solar masses into a sphere of only $10$ to $12\text{ kilometers}$ radius. The star features an intense magnetic field ($10^8$ to $10^{12}\text{ Gauss}$). 

Relativistic particles are accelerated along the magnetic dipole axis, producing beams of synchrotron and curvature radiation. If the magnetic axis is misaligned with the rotational axis, the beam sweeps across space like a lighthouse. When the beam crosses Earth's line of sight, telescopes register a periodic pulse.

### Millisecond Pulsars (MSPs)
MSPs are a sub-class of pulsars that have been "spun up" to sub-second periods through the accretion of matter and angular momentum from a binary companion star (a process known as recycling). MSP periods range from $1.4\text{ ms}$ (e.g., PSR B1937+21 spinning at $\sim 642\text{ Hz}$) up to $\sim 10\text{ ms}$. 

Because their magnetic field strength is lower than young pulsars ($10^8\text{ Gauss}$ vs. $10^{12}\text{ Gauss}$), they experience minimal torque and spin down at extremely slow rates ($\dot{f} \sim 10^{-19}$ to $10^{-21}\text{ Hz/s}$). This long-term rotational stability makes them ideal deep-space clock beacons.

### Pulsar Timing
Pulsar timing models the rotation of the pulsar and accounts for the propagation of pulses to the solar system. The rotational phase $\phi(t)$ of the pulsar at its emission time is represented as a Taylor series:

$$\phi(t) = \phi(t_0) + f_0 \cdot (t - t_0) + \frac{1}{2} \dot{f}_0 \cdot (t - t_0)^2 + \frac{1}{6} \ddot{f}_0 \cdot (t - t_0)^3 + \dots$$

Because the spin-down terms ($\dot{f}_0, \ddot{f}_0$) are extremely small for MSPs, the linear term dominates over timescales of years, simplifying navigation calculations.

### Pulse Arrival Times & Timing Residuals
When pulses are observed, the recorded Time of Arrival (TOA) at the detector ($t_{\text{obs}}$) is compared to the expected TOA computed from the timing model ($t_{\text{pred}}$). The difference forms the **timing residual** $\mathcal{R}(t)$:

$$\mathcal{R}(t) = t_{\text{obs}} - t_{\text{pred}}$$

* If the timing model is perfect, the residuals should consist only of zero-mean white noise (representing detector measurement error).
* Systematic deviations in residuals indicate physical effects:
  * A linear slope indicates a clock drift or period error.
  * A sinusoidal curve with a period of one Earth year indicates an error in the assumed position of the observer (e.g., Earth coordinate error or spacecraft trajectory perturbation).
  * In XNAV, these residuals are the primary observables used to correct the spacecraft state.

---

## 5. Coordinate Systems

Coordinate systems are essential to translate pulsar positions into directions and to resolve spacecraft trajectories.

```
       Celestial North (+Z)
              ^
              |    . Pulsar (n)
              |   /|
              |  / |  Declination (dec)
              | /  |
              |/___|______________> Equatorial Plane (X-Y)
             / \   
            /   \ Right Ascension (ra)
           /     \
    Vernal        v
  Equinox (+X)   (+Y)
```

### Right Ascension (RA) and Declination (DEC)
The standard astronomical coordinate system is the **Geocentric Equatorial Frame (J2000.0)**.
* **Vernal Equinox ($+X$):** The direction from the Earth center to the Sun center at the moment of the vernal equinox.
* **Celestial North Pole ($+Z$):** Parallel to Earth's rotation axis.
* **Right Ascension ($\alpha$ or RA):** The angle measured eastward along the celestial equator from the vernal equinox. Expressed in hours, minutes, and seconds ($24\text{ hours} = 360^{\circ}$), or in degrees ($1\text{ hour} = 15^{\circ}$).
* **Declination ($\delta$ or DEC):** The angle measured north ($+$) or south ($-$) of the celestial equator, ranging from $-90^{\circ}$ to $+90^{\circ}$.

### Ecliptic Coordinate System
In planetary navigation, the **Ecliptic Coordinate System** is centered on the Sun or Earth, but uses Earth's orbital plane as the reference equator ($Z=0$).
* **Ecliptic Longitude ($\lambda$):** Measured along the ecliptic plane eastward from the vernal equinox.
* **Ecliptic Latitude ($\beta$):** Measured perpendicular to the ecliptic plane.

The tilt between Earth's equator and the ecliptic plane is the **obliquity of the ecliptic** ($\epsilon \approx 23.43929111^{\circ}$). The transformation from ecliptic coordinates $(\lambda, \beta)$ to equatorial coordinates $(\alpha, \delta)$ is implemented in [coordinates.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/coordinates.py) via:

$$\sin(\delta) = \sin(\beta)\cos(\epsilon) + \cos(\beta)\sin(\epsilon)\sin(\lambda)$$

$$\tan(\alpha) = \frac{\sin(\lambda)\cos(\epsilon) - \tan(\beta)\sin(\epsilon)}{\cos(\lambda)}$$

### Conversion to Cartesian Unit Vectors
To compute Römer delays, we must convert RA ($\alpha$) and Dec ($\delta$) to a Cartesian unit vector $\mathbf{n}$ pointing from the origin toward the pulsar:

$$\mathbf{n} = \begin{bmatrix} n_x \\ n_y \\ n_z \end{bmatrix} = \begin{bmatrix} \cos(\delta)\cos(\alpha) \\ \cos(\delta)\sin(\alpha) \\ \sin(\delta) \end{bmatrix}$$

This conversion is implemented in `sky_to_unit_vector` in [coordinates.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/coordinates.py).

---

## 6. Navigation Geometry

### Direction and Spacecraft Position Vectors
Let $\mathbf{r}$ be the spacecraft position vector relative to the coordinate origin. Let $\mathbf{n}_i$ be the unit direction vector pointing toward pulsar $i$. Because pulsars are at interstellar distances (typically hundreds to thousands of light-years), the direction vector $\mathbf{n}_i$ is parallel at all points within the solar system.

### Timing Delay Equations (Römer Delay)
A wavefront emitted by pulsar $i$ passes the Solar System Barycenter (SSB) at time $t_{\text{ssb}}$. The arrival time of the same wavefront at the spacecraft ($t_{\text{sc}}$) is shifted due to the light-travel time across the distance separating the spacecraft and the SSB:

$$t_{\text{sc}} - t_{\text{ssb}} = \frac{\mathbf{r} \cdot \mathbf{n}_i}{c}$$

where $c$ is the speed of light. This geometric offset is the **Römer delay** $\Delta t_{R,i}$.

```
                 Incoming Plane Wavefronts
                  |   |   |   |   |
                  v   v   v   v   v   Direction vector n
                 =================== /
                      /             /
                     /             /
                    /             /
                   /             /
                  /             v
                 * Spacecraft (r)
                /
               /
              /  r . n (Projection distance)
             /
            v
      * Barycenter (SSB)
```

If we observe from a spacecraft with position $\mathbf{r}$ and an onboard clock that suffers from a bias error $b$ (seconds), the measured arrival time delay $z_i$ relative to the predicted arrival time at the origin is:

$$z_i = \frac{\mathbf{r} \cdot \mathbf{n}_i}{c} + b + \eta_i$$

where $\eta_i$ represents timing noise. Multiplying by the speed of light $c$:

$$z_i \cdot c = \mathbf{r} \cdot \mathbf{n}_i + c \cdot b + c \cdot \eta_i$$

### Geometric Interpretation
Each pulsar measurement provides the projection of the spacecraft's $3\text{D}$ position onto a $1\text{D}$ line of sight: $x_i = \mathbf{r} \cdot \mathbf{n}_i$.
* A single pulsar measurement constrains the spacecraft to a plane perpendicular to $\mathbf{n}_i$.
* Two non-parallel pulsars constrain the spacecraft to the intersection line of two planes.
* Three non-coplanar pulsars constrain the spacecraft to a single point in $3\text{D}$ space, assuming the clock is perfectly synchronized ($b=0$).
* Since the onboard atomic clock has an unknown bias $b$, we have $4$ unknowns ($r_x, r_y, r_z$, and $c \cdot b$). Therefore, we require at least **$4$ pulsars** with linearly independent direction vectors to solve for both $3\text{D}$ position and clock bias simultaneously.

---

## 7. Signal Processing Pipeline

The signal processing pipeline models the transition from physical photon arrivals to timing estimates.

### Signal Modeling
The rate of photon arrivals at an onboard detector is modeled as a time-varying Poisson process. According to Emadzadeh & Speyer (2011), the intensity rate function $\lambda(t)$ is:

$$\lambda(t) = \lambda_b + \lambda_s \cdot h(\phi(t))$$

where:
* $\lambda_b$ is the background photon flux (cosmic X-ray background, detector dark currents).
* $\lambda_s$ is the source pulse flux.
* $h(\phi)$ is the normalized pulse profile, satisfying $\int_{0}^{1} h(\phi)d\phi = 1$.
* $\phi(t)$ is the pulse phase at the detector, representing the fractional cycle of the pulsar.

### Non-Homogeneous Poisson Process (NHPP)
Because X-ray photon arrivals are discrete events, the probability of observing $k$ photons within an interval $[t_a, t_b]$ is given by:

$$P(k \text{ photons in } [t_a, t_b]) = \frac{[\Lambda(t_a, t_b)]^k e^{-\Lambda(t_a, t_b)}}{k!}$$

where $\Lambda(t_a, t_b)$ is the integrated rate function:

$$\Lambda(t_a, t_b) = \int_{t_a}^{t_b} \lambda(\tau)d\tau = \lambda_b (t_b - t_a) + \int_{t_a}^{t_b} \lambda_s h(\phi(\tau))d\tau$$

### Photon Arrival Simulation (Algorithm 3.1)
Simulating photon arrival times is critical for testing phase estimators. We generate non-homogeneous arrival times by inverting the integrated rate function. This is implemented in `generate_photon_toas` in [signal_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/signal_model.py):

$$\Lambda(t_{n+1}) = \Lambda(t_n) + E_n, \quad \text{where } E_n \sim \text{Exponential}(1)$$

To find $t_{n+1}$, we solve $\Lambda(t_{n+1}) - y_{\text{target}} = 0$ using Newton-Raphson iteration:

$$t_{n+1}^{(i+1)} = t_{n+1}^{(i)} - \frac{\Lambda(t_{n+1}^{(i)}) - y_{\text{target}}}{\lambda(t_{n+1}^{(i)})}$$

---

## 8. Epoch Folding

### Purpose
X-ray detectors typically observe very weak signals. For instance, the Crab pulsar might produce only $\lambda_s = 15\text{ ph/s}$ on a $1\text{ m}^2$ detector against a background of $\lambda_b = 5\text{ ph/s}$. With a period of $33\text{ ms}$, we receive an average of only $0.66$ photons per period. It is impossible to reconstruct the pulse shape or estimate its arrival time from a single pulse. 

**Epoch Folding** circumvents this by cutting the continuous photon arrival timeline into segments of length $P = 1/f_{\text{obs}}$ and stacking them. This accumulates signal coherently while noise averages out.

```
Continuous TOAs: ----*---*------*---*---*-------*----*--
Fold modulo P:   |   *   |   *   | * |   *   | * |  *  |
Stacked Profile: [   **  |   *   | **|   *   | * |  *  ]  --> Histogram into Bins
```

### Mathematical Intuition
For each photon TOA $t_j$, we compute its fractional phase $\phi_j \in [0, 1)$:

$$\phi_j = \left( (t_j - t_0) \cdot f_{\text{obs}} \right) \bmod 1.0$$

We partition the phase interval $[0, 1)$ into $N_b$ bins of width $\Delta \phi = 1/N_b$. The photons are histogrammed into these bins. The empirical rate function $\bar{\lambda}(t_i)$ in bin $i$ is normalized as (Eq 3.39):

$$\bar{\lambda}(t_i) = \frac{C_i \cdot N_b}{T_{\text{obs}}}$$

where $C_i$ is the photon count in bin $i$, and $T_{\text{obs}}$ is the total observation duration.
According to Theorem 3.2, the variance of this empirical rate estimator is (Eq 3.42):

$$\text{Var}[\bar{\lambda}(t_i)] = \frac{N_b}{T_{\text{obs}}} \lambda(t_i)$$

This shows that the noise variance decreases as $1/T_{\text{obs}}$, improving the signal-to-noise ratio.

### Velocity Error Smearing
If the spacecraft's velocity relative to the pulsar is wrong by $\Delta v$, the assumed folding frequency is wrong by $\Delta f_{\text{obs}} = f_s \frac{\Delta v}{c}$. This causes a progressive phase drift per period:

$$\Delta \phi = -\frac{\Delta v}{c}$$

Across $N_p$ periods, the cumulative phase drift is $N_p \Delta \phi$. If this drift exceeds half a bin width ($1/(2N_b)$), the peak of the folded profile becomes smeared, degrading timing accuracy. The velocity error tolerance to prevent smearing is (Eq 3.72):

$$|\Delta v| < \frac{c}{N_b \cdot N_p}$$

---

## 9. Delay Estimation

After folding, we estimate the initial phase shift $\phi_0$ that aligns the observed profile with the template. The delay is then computed as $t_d = \phi_0 / f_s$.

### Cross-Correlation (CC)
The Cross-Correlation estimator correlates the empirical rate $\bar{\lambda}$ with the true template $h(\phi)$ to find the phase shift that maximizes the correlation. The CC cost function is:

$$R_D(\psi) = \frac{1}{N_b} \sum_{k=0}^{N_b-1} \left( \bar{\lambda}(t_k) - \langle\bar{\lambda}\rangle \right) \left( h(\phi_k + \psi) - \langle h \rangle \right)$$

We compute this correlation using the Fast Fourier Transform (FFT) in $O(N_b \log N_b)$ time:

$$R_D = \text{Real}\left( \text{IFFT}\{ \text{FFT}(\bar{\lambda}) \cdot \text{conj}(\text{FFT}(h)) \} \right)$$

The peak index $k_m$ is refined to sub-bin resolution using parabolic interpolation:

$$\delta = -0.5 \frac{R_D(k_m+1) - R_D(k_m-1)}{R_D(k_m+1) - 2R_D(k_m) + R_D(k_m-1)}$$

The final phase estimate is:

$$\hat{\phi}_0 = -\frac{k_m + \delta}{N_b} \bmod 1.0$$

### Nonlinear Least Squares (NLS)
The NLS estimator finds the phase shift $\phi$ that minimizes the squared residuals between the empirical profile and the scaled template:

$$J(\phi) = \sum_{i=1}^{N_b} \left( \bar{\lambda}(t_i) - \left( \lambda_b + \lambda_s h(bin_i + \phi) \right) \right)^2$$

In [delay_estimation.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/delay_estimation.py), this is solved by performing a grid search over $[0, 1)$ to find the global minimum, followed by local refinement using Brent's method.

### Maximum Likelihood Estimation (MLE)
The MLE operates directly on raw photon TOAs ($t_1, t_2, \dots, t_{N_p}$) without binning or folding. The log-likelihood function $\Psi(\phi)$ is (Eq 6.5):

$$\Psi(\phi) = \sum_{j=1}^{N_{photons}} \ln\left( \lambda_b + \lambda_s h(f_{\text{obs}} t_j + \phi) \right) - \Lambda(T_{\text{obs}})$$

Since $\Lambda(T_{\text{obs}}) \approx T_{\text{obs}}(\lambda_b + \lambda_s)$ is nearly independent of $\phi$ for long observations, we maximize the sum. This estimator is statistically optimal and asymptotically efficient (achieving the CRLB), but it is more computationally intensive.

---

## 10. Navigation Engine

### Least Squares Formulation
For $N \ge 4$ pulsars, the relationship between spacecraft position $\mathbf{r}$, clock bias $b$, and measured delays $z_i$ can be written as:

$$\mathbf{A} \mathbf{w} = \mathbf{b}$$

$$\begin{bmatrix} n_{1,x} & n_{1,y} & n_{1,z} & 1 \\ n_{2,x} & n_{2,y} & n_{2,z} & 1 \\ \vdots & \vdots & \vdots & \vdots \\ n_{N,x} & n_{N,y} & n_{N,z} & 1 \end{bmatrix} \begin{bmatrix} r_x \\ r_y \\ r_z \\ c \cdot b \end{bmatrix} = \begin{bmatrix} z_1 \cdot c \\ z_2 \cdot c \\ \vdots \\ z_N \cdot c \end{bmatrix}$$

This is solved via the pseudoinverse:

$$\mathbf{w} = (\mathbf{A}^T \mathbf{A})^{-1} \mathbf{A}^T \mathbf{b}$$

### Weighted Least Squares (WLS)
Since different pulsars have different timing accuracies (e.g., Crab is bright but has high timing noise, while MSPs are quiet but stable), we weight the measurements by their inverse variances:

$$\mathbf{W} = \text{diag}\left( \frac{1}{\sigma_{1}^2}, \frac{1}{\sigma_{2}^2}, \dots, \frac{1}{\sigma_{N}^2} \right)$$

where $\sigma_i = c \cdot \sqrt{\text{CRLB}(t_{d,i})}$ is the position uncertainty (meters) along the line of sight to pulsar $i$. The weighted least squares solution is:

$$\mathbf{w}_{\text{wls}} = (\mathbf{A}^T \mathbf{W} \mathbf{A})^{-1} \mathbf{A}^T \mathbf{W} \mathbf{b}$$

---

## 11. Kalman Filtering

PulsarNav AI contains two Kalman Filter implementations: a $10$-state linear error-state filter and an $8$-state absolute Extended Kalman Filter.

### 10-State Linear Error-State Kalman Filter (L-ESKF)
Implemented in [kalman_filter.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/kalman_filter.py), this filter tracks the deviations between the true spacecraft trajectory and a nominal reference trajectory (e.g., dead-reckoning from an Inertial Measurement Unit):

$$\mathbf{X} = \begin{bmatrix} \Delta\mathbf{x}_{3\times 1} & \Delta\mathbf{v}_{3\times 1} & \mathbf{b}_{a, 3\times 1} & t_{e, 1\times 1} \end{bmatrix}^T$$

where:
* $\Delta\mathbf{x}, \Delta\mathbf{v}$ are position and velocity errors.
* $\mathbf{b}_a$ is the $3\text{D}$ accelerometer bias.
* $t_e$ is the clock bias.

#### Continuous-Time System Dynamics
$$\dot{\mathbf{X}}(t) = \mathbf{F} \mathbf{X}(t) + \mathbf{w}(t)$$

$$\mathbf{F} = \begin{bmatrix} \mathbf{0}_{3\times 3} & \mathbf{I}_{3\times 3} & \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 1} \\ \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 3} & \mathbf{I}_{3\times 3} & \mathbf{0}_{3\times 1} \\ \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 1} \\ \mathbf{0}_{1\times 3} & \mathbf{0}_{1\times 3} & \mathbf{0}_{1\times 3} & 0 \end{bmatrix}$$

Because $\mathbf{F}^3 = \mathbf{0}$ (nilpotent), the discrete state transition matrix $\mathbf{\Phi} = e^{\mathbf{F} T_s}$ simplifies to:

$$\mathbf{\Phi} = \begin{bmatrix} \mathbf{I} & T_s \mathbf{I} & \frac{1}{2} T_s^2 \mathbf{I} & \mathbf{0} \\ \mathbf{0} & \mathbf{I} & T_s \mathbf{I} & \mathbf{0} \\ \mathbf{0} & \mathbf{0} & \mathbf{I} & \mathbf{0} \\ \mathbf{0} & \mathbf{0} & \mathbf{0} & 1 \end{bmatrix}$$

#### Process Noise Covariance $Q$
The discrete-time process noise covariance $\mathbf{Q}$ is obtained by integrating the continuous-time noise spectral density matrix $\mathbf{Q}_c = \text{diag}(\mathbf{W}_v, \mathbf{W}_a, \mathbf{W}_b, W_e)$:

$$\mathbf{Q} = \int_{0}^{T_s} \mathbf{\Phi}(\tau) \mathbf{Q}_c \mathbf{\Phi}^T(\tau) d\tau$$

The blocks along the diagonal grow with powers of the time step $T_s$:
* Position error variance: $T_s \mathbf{W}_v + \frac{1}{3} T_s^3 \mathbf{W}_a + \frac{1}{20} T_s^5 \mathbf{W}_b$.
* Velocity error variance: $T_s \mathbf{W}_a + \frac{1}{3} T_s^3 \mathbf{W}_b$.
* Accelerometer bias variance: $T_s \mathbf{W}_b$.
* Clock error variance: $T_s W_e$.

### 8-State Absolute Extended Kalman Filter (EKF)
Implemented in [xray_nav.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/xray_nav.py) and [route.ts](file:///Users/supryo/Desktop/pulsar/app/api/navigation-lab/route.ts), this filter tracks the spacecraft's absolute coordinates relative to Earth's center:

$$\mathbf{x} = \begin{bmatrix} r_x & r_y & r_z & v_x & v_y & v_z & b_{clk} & d_{clk} \end{bmatrix}^T$$

#### Absolute Orbital Dynamics
$$\frac{d\mathbf{r}}{dt} = \mathbf{v}, \quad \frac{d\mathbf{v}}{dt} = \mathbf{a}_{\text{gravity}}(\mathbf{r}) + \mathbf{w}_v, \quad \frac{db_{clk}}{dt} = d_{clk}, \quad \frac{dd_{clk}}{dt} = w_d$$

We model the gravity acceleration $\mathbf{a}_{\text{gravity}}$ by combining Keplerian two-body dynamics with the Earth's $J_2$ oblateness perturbation:

$$\mathbf{a}_{\text{Kepler}} = -\frac{\mu \mathbf{r}}{r^3}$$

$$\mathbf{a}_{J_2} = \frac{3}{2} J_2 \frac{\mu R_E^2}{r^4} \begin{bmatrix} \left( 5\frac{z^2}{r^2} - 1 \right) \frac{x}{r} \\ \left( 5\frac{z^2}{r^2} - 1 \right) \frac{y}{r} \\ \left( 5\frac{z^2}{r^2} - 3 \right) \frac{z}{r} \end{bmatrix}$$

We propagate these non-linear equations forward using $4^{\text{th}}$-order Runge-Kutta (RK4) integration:

$$\mathbf{k}_1 = \mathbf{f}(\mathbf{x}_n), \quad \mathbf{k}_2 = \mathbf{f}(\mathbf{x}_n + \frac{\Delta t}{2}\mathbf{k}_1), \quad \mathbf{k}_3 = \mathbf{f}(\mathbf{x}_n + \frac{\Delta t}{2}\mathbf{k}_2), \quad \mathbf{k}_4 = \mathbf{f}(\mathbf{x}_n + \Delta t \mathbf{k}_3)$$

$$\mathbf{x}_{n+1} = \mathbf{x}_n + \frac{\Delta t}{6} (\mathbf{k}_1 + 2\mathbf{k}_2 + 2\mathbf{k}_3 + \mathbf{k}_4)$$

#### Linearized Jacobians
To propagate the covariance matrix $\mathbf{P}$, we calculate the Jacobian $\mathbf{F} = \frac{\partial \mathbf{f}}{\partial \mathbf{x}}$ of the dynamics at each step. This requires the $3\times 3$ gravity gradient matrix $\mathbf{G}(\mathbf{r})$:

$$\mathbf{G}(\mathbf{r}) = -\frac{\mu}{r^3} \mathbf{I}_{3\times 3} + \frac{3\mu}{r^5} \mathbf{r} \mathbf{r}^T$$

$$\mathbf{F} = \begin{bmatrix} \mathbf{0}_{3\times 3} & \mathbf{I}_{3\times 3} & \mathbf{0}_{3\times 1} & \mathbf{0}_{3\times 1} \\ \mathbf{G}(\mathbf{r}) & \mathbf{0}_{3\times 3} & \mathbf{0}_{3\times 1} & \mathbf{0}_{3\times 1} \\ \mathbf{0}_{1\times 3} & \mathbf{0}_{1\times 3} & 0 & 1 \\ \mathbf{0}_{1\times 3} & \mathbf{0}_{1\times 3} & 0 & 0 \end{bmatrix}$$

The state transition matrix is approximated as $\mathbf{\Phi} \approx \mathbf{I} + \mathbf{F} \Delta t$, which is used to update the covariance:

$$\mathbf{P}_{n+1} = \mathbf{\Phi} \mathbf{P}_n \mathbf{\Phi}^T + \mathbf{Q}$$

### Standard Update vs. Joseph Form
In [kalman_filter.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/kalman_filter.py), we implement the **Joseph form** of the covariance update to ensure numerical stability:

$$\mathbf{P}^+ = (\mathbf{I} - \mathbf{K}\mathbf{H}) \mathbf{P}^- (\mathbf{I} - \mathbf{K}\mathbf{H})^T + \mathbf{K} \mathbf{R} \mathbf{K}^T$$

This formulation preserves the symmetry and positive-definiteness of the covariance matrix, even in the presence of floating-point rounding errors.

---

## 12. Monte Carlo Simulation

### Why It Is Used
Kalman filters and least-squares estimators rely on linear approximations of non-linear geometry and orbital mechanics. To verify that these estimators are unbiased and consistent under realistic operating conditions, we use **Monte Carlo (MC) Simulation**. 

By running hundreds of independent trials with randomized initial states, sensor noise, and clock errors, we can analyze the statistical behavior of the navigation solution.

### Noise Modeling
In our MC engine:
1. **Initial Position Error:** Sampled from the initial covariance: $\mathbf{r}_0 \sim \mathcal{N}(\mathbf{r}_{\text{true}}, \mathbf{P}_0)$.
2. **Timing Noise:** Added to each pulsar delay measurement. The noise is modeled as zero-mean Gaussian: $\eta_i \sim \mathcal{N}(0, \sigma_i^2)$, where the standard deviation $\sigma_i$ is derived from the Cramér-Rao Lower Bound.
3. **Clock Bias:** Sampled from a uniform distribution: $b \sim \text{Uniform}(-10\ \mu\text{s}, +10\ \mu\text{s})$, representing a realistic range of initial onboard clock errors.

### Statistical Validation (Filter Consistency)
A filter is consistent if its estimated state covariance matrix $\mathbf{P}$ accurately reflects the actual errors. To evaluate this, we compare:
* **Monte Carlo Standard Deviation ($\sigma_{\text{mc}}$):** The empirical standard deviation of the navigation error across all MC runs:
  $$\sigma_{\text{mc}, i}(t) = \sqrt{\frac{1}{M-1} \sum_{m=1}^{M} \left( x_{\text{est}, i}^{(m)}(t) - x_{\text{true}, i}^{(m)}(t) \right)^2}$$
* **Analytical Standard Deviation ($\sigma_{\text{filter}}$):** The standard deviation computed by the filter:
  $$\sigma_{\text{filter}, i}(t) = \sqrt{P_{ii}(t)}$$

If the filter is correctly tuned, the empirical error envelope $\sigma_{\text{mc}}$ will match the analytical envelope $\sigma_{\text{filter}}$ over time.

---

## 13. CRLB Analysis

### Theoretical Background
The **Cramér-Rao Lower Bound (CRLB)** defines the absolute minimum variance that any unbiased estimator can achieve. For estimating a parameter vector $\boldsymbol{\theta}$, the estimator variance is bounded by the inverse of the **Fisher Information Matrix** $\mathbf{I}(\boldsymbol{\theta})$:

$$\text{Cov}(\hat{\boldsymbol{\theta}}) \ge \mathbf{I}(\boldsymbol{\theta})^{-1}$$

### Fisher Information Integral $I_p$ (Eq 4.11)
For pulsar phase estimation, the Fisher Information obtained from $1\text{ second}$ of observation depends on the pulse shape:

$$I_p = \int_0^1 \frac{[\lambda_s \cdot h'(\phi)]^2}{\lambda_b + \lambda_s \cdot h(\phi)} d\phi$$

* **Pulse Sharpness ($h'(\phi)^2$):** Steeper profiles (e.g., Crab or millisecond pulsars with sharp peaks) yield larger $I_p$, which reduces the timing bound.
* **Signal strength ($\lambda_s^2$):** Brighter pulsars yield higher information.
* **Noise background ($\lambda$):** High backgrounds ($\lambda_b$) dilute the signal and decrease $I_p$.

### Timing and Distance Bounds
For absolute timing, the CRLB on the variance of the pulse delay $t_d$ is:

$$\text{CRLB}(t_d) = \frac{\text{CRLB}(\phi_0)}{f_s^2} = \frac{1}{f_s^2 \cdot T_{\text{obs}} \cdot I_p}$$

For relative navigation (measuring the delay between two detectors), the variance doubles because we subtract two independent phase estimates:

$$\text{CRLB}(t_d)_{\text{relative}} = \frac{2}{f_s^2 \cdot T_{\text{obs}} \cdot I_p}$$

The lower bound on the position error standard deviation along the line of sight is:

$$\sigma_{x} = c \cdot \sqrt{\text{CRLB}(t_d)}$$

---

## 14. Dashboard and Navigation Lab

The Next.js frontend is a responsive, dark-mode web console designed for flight dynamics engineers and researchers.

```
+---------------------------------------------------------------------------------+
|  [PulsarNav AI Console]   [Region: Earth-Moon]   [Pulsars: 6]   [Solver: EKF]   |
+-------------------------------------------------+-------------------------------+
|                                                 |  Mission Telemetry            |
|                                                 |  --------------------         |
|                  3D Space Scene                 |  True Pos:  [ 2.3k, 0.4k, 1k] |
|                     (Three.js)                  |  Est. Pos:  [ 2.2k, 0.4k, 1k] |
|                                                 |  3D Error:  0.084 km (Success)|
|                  * Spacecraft                   |  Clock Bias: 1.25 us          |
|                 /                               +-------------------------------+
|                /                                |  Active Pulsars               |
|               /   * Earth                       |  --------------------         |
|              /                                  |  [x] J0613-0200   [x] J1713    |
|             * Pulsar                            |  [x] J1909-3744   [x] J1744    |
+-------------------------------------------------+-------------------------------+
|    Error CDF Plot      |    Sensitivity Heatmap  |   Execution Log & CSV Export  |
+------------------------+-------------------------+-------------------------------+
```

### Core Features
1. **Interactive Controls:** Users can configure simulation parameters (number of trials, active pulsars, timing noise level, mission region, and solver algorithm) via a control panel.
2. **3D Space Scene Visualizer:** Renders Earth, the Moon, targeted pulsars, and the spacecraft trajectory.
   * Constructed using **Three.js** and **React Three Fiber**.
   * Integrates a **2D label projector** with a priority-based box collision avoidance algorithm to prevent overlapping screen labels.
   * Hides secondary pulsar labels automatically when zoomed out ($r > 11.5\text{ units}$) to reduce visual clutter.
   * Includes real-time toggles to display or hide labels, reference axes, grids, and line-of-sight vectors.
3. **Analytical Charts:**
   * **Error Summary:** Displays median, mean, and $95^{\text{th}}$-percentile position errors.
   * **Cumulative Distribution Function (CDF):** Plots the probability distribution of position errors.
   * **Sensitivity Heatmap:** Displays position error as a function of timing noise and the number of active pulsars.
   * **Histogram:** Bins the 3D position errors to illustrate the shape of the error distribution.
4. **Data Export:** Provides one-click CSV download of the raw trial telemetry (true position, estimated position, timing delays, and coordinate errors).

---

## 15. Current Project Status

### Completed Components
* **Astronomical Parsers:** Fully functional `.par` and `.tim` parsers in [parsing.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/parsing.py) that process TEMPO/TEMPO2 data and export catalog statistics.
* **Coordinate Systems:** Coordinate transformations between equatorial, ecliptic, and galactic frames, and unit-vector conversions.
* **Barycentric Timing Model:** Roemer delay models and $1/f^2$ plasma dispersion corrections.
* **Photon Generator:** Non-Homogeneous Poisson Process (NHPP) simulation using Newton-Raphson accumulated rate inversion.
* **Epoch-Folding Engine:** Phase binning, rate normalization, and velocity-error smearing analysis.
* **Phase Delay Estimators:** Cross-Correlation (FFT), Nonlinear Least Squares (NLS), and Maximum Likelihood (MLE) algorithms.
* **Linear Solvers:** Least Squares (LS) and Weighted Least Squares (WLS) coordinate estimation engines.
* **Cramér-Rao Bounds:** Fisher Information integrals, CRLB covariance limits, and Asymptotic Relative Efficiency (ARE) calculations.
* **Linear Kalman Filter:** $10$-state error-state Kalman filter with Joseph-form updates.
* **Web UI Dashboard:** Fully responsive Next.js frontend with dark-mode styling, Three.js 3D space scene, and Recharts analytical plots.

### Partially Completed Components
* **High-Fidelity EKF Integration:** Absolute-state $8$-state EKF with gravity perturbation ($J_2$) and RK4 propagation. It is fully implemented and operational in the Next.js API route (`app/api/navigation-lab/route.ts`) and prototype script ([xray_nav.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/xray_nav.py)), but it is not yet integrated into the main command-line pipeline launcher script (`run_pipeline.py`).
* **Real-time Timing Residuals:** The dashboard UI contains a visual placeholder for streaming timing residuals, but it is currently fed by static mocked files rather than a live SSE (Server-Sent Events) or WebSocket data stream.

### Pending Components
* **Covariance Ellipsoids:** Rendering of $3\text{D}$ error covariance ellipsoids around the spacecraft position in the Three.js scene.
* **Parallel Simulation Loop:** Optimizing the Monte Carlo engine to run trials in parallel using Python thread pools or Web Workers.

---

## 16. Future Roadmap

### 1. Navigation Lab Stabilization
Optimize the execution speed of larger Monte Carlo simulations (e.g., $5,000+$ trials) on the Next.js backend by moving the simulation loop to a Web Worker thread, preventing main-thread blocking during interactive slider adjustments.

### 2. ATNF Catalog Integration
Integrate client-side API calls to query the Australia Telescope National Facility (ATNF) database in real time. This will allow users to dynamically add new pulsars to the simulation catalog and query their parameters.

### 3. High-Precision Ephemerides
Replace the Keplerian analytical Earth orbit model with the **JPL DE440/DE441 Planetary Ephemeris**, using barycentric positions computed from Chebyshev polynomials to reduce positioning errors from hundreds of meters to sub-meter levels.

### 4. Advanced EKF Formulations
Extend the $8$-state absolute EKF to support range-rate measurements from inter-satellite links, enabling cooperative multi-spacecraft navigation (swarm navigation) around Mars or the Moon.

### 5. DSN vs. Pulsar Comparative Studies
Develop a simulation dashboard that models DSN performance alongside XNAV, illustrating how XNAV outperforms DSN as the spacecraft travels further from Earth.

### 6. Hybrid Navigation Systems
Implement a hybrid EKF that fuses radio tracking (from DSN/ground tracking) with X-ray pulsar observations. Fusing these measurements utilizes the strengths of both systems: DSN provides high accuracy near Earth, while XNAV bounds error growth during long cruises.

---

## 17. End-to-End Data Flow

The complete PulsarNav AI data pipeline maps raw astronomical data to user-facing dashboard telemetry:

```
  +-----------------------------------------------------------------+
  | 1. RAW DATA INGESTION                                           |
  |    Reads NANOGrav 12.5-Year Data Release (.par & .tim files)    |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 2. PULSAR CATALOG BUILDER (parsing.py)                          |
  |    Extracts name, spin parameters (f0, f1) and DM               |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 3. TIMING RESIDUAL STATISTICS (parsing.py)                      |
  |    Calculates median error, observation duration, TOA count     |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 4. COORDINATE CONVERSION (coordinates.py)                       |
  |    Converts RA/Dec J2000 to Cartesian unit direction vectors n  |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 5. PULSAR RANKING ENGINE (ranking.py)                           |
  |    Sorts pulsars using multi-factor scores and GDOP limits      |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 6. SPACE STATE SIMULATOR (simulation.py)                        |
  |    Generates true position r_true & velocity v_true trajectories |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 7. MEASUREMENT DELAY MODELER (timing_model.py)                  |
  |    Calculates expected delays including Römer & dispersion terms|
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 8. PHOTON SIMULATOR (signal_model.py)                           |
  |    Generates individual photon TOAs via NHPP rate inversion     |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 9. EPOCH FOLDING ENGINE (epoch_folding.py)                      |
  |    Folds photon TOAs into phase bins to reconstruct pulse shape  |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 10. DELAY ESTIMATION (delay_estimation.py)                      |
  |     Extracts arrival phase shift using CC, NLS, or MLE          |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 11. RECURSIVE KALMAN FILTER (kalman_filter.py / xray_nav.py)    |
  |     Recursively updates spacecraft position & velocity state    |
  +-----------------------------------------------------------------+
                                  |
                                  v
  +-----------------------------------------------------------------+
  | 12. DASHBOARD VISUALIZATION (components/)                       |
  |     Renders 3D orbital trajectory, error curves, and CDF plots  |
  +-----------------------------------------------------------------+
```

### Detailed Pipeline Stages
1. **Raw Data Ingestion:** Reads the raw narrowband `.par` and `.tim` ASCII files from the NANOGrav dataset.
2. **Pulsar Catalog Builder:** Parses coordinates, spin frequency, and dispersion parameters into a catalog DataFrame.
3. **Timing Residual Statistics:** Analyzes raw TOA timings to determine measurement errors and observation periods.
4. **Coordinate Conversion:** Converts Right Ascension and Declination angles into 3D unit vectors.
5. **Pulsar Ranking Engine:** Ranks pulsars based on signal stability, measurement count, and spatial separation to select the best navigation beacons.
6. **Space State Simulator:** Simulates orbital trajectories across Earth orbit, Earth-Moon, and deep space regions.
7. **Measurement Delay Modeler:** Computes expected delays relative to the SSB, incorporating solar system geometry and dispersion.
8. **Photon Simulator:** Generates realistic photon arrival times at the spacecraft using a Poisson rate model.
9. **Epoch Folding Engine:** Phase-folds the simulated photon TOAs to reconstruct the observed pulse profile.
10. **Delay Estimation:** Matches the folded profile to the template using CC, NLS, or MLE to determine the timing offset.
11. **Recursive Kalman Filter:** Fuses the timing offsets into the Kalman Filter state to estimate position, velocity, and clock bias.
12. **Dashboard Visualization:** Renders the true and estimated trajectories in the 3D space scene, alongside performance plots.

---

## 18. Mathematical Concepts Summary

This section consolidates all key mathematical equations implemented in the framework.

| Equation Description | Formula | Variables & Meanings | Units | Implementing Module |
| :--- | :--- | :--- | :--- | :--- |
| **Galactic to Cartesian** | $x = \cos(b)\cos(l)$<br>$y = \cos(b)\sin(l)$<br>$z = \sin(b)$ | $l$: Galactic longitude<br>$b$: Galactic latitude | $l, b$: radians<br>$x, y, z$: unitless | `galactic_to_cartesian` in [navigation_geometry.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_geometry.py) |
| **Equatorial to Cartesian** | $x = \cos(\delta)\cos(\alpha)$<br>$y = \cos(\delta)\sin(\alpha)$<br>$z = \sin(\delta)$ | $\alpha$: Right Ascension<br>$\delta$: Declination | $\alpha, \delta$: radians<br>$x, y, z$: unitless | `sky_to_unit_vector` in [coordinates.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/coordinates.py) |
| **Römer Delay** | $\Delta t_R = \frac{\mathbf{r} \cdot \mathbf{n}}{c}$ | $\mathbf{r}$: Position relative to origin<br>$\mathbf{n}$: Pulsar unit direction vector<br>$c$: Speed of light | $\mathbf{r}$: km<br>$\mathbf{n}$: unitless<br>$\Delta t_R$: seconds | `roemer_delay_ssb_s` in [timing_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/timing_model.py) |
| **Dispersion Delay** | $\Delta t_{DM} = \frac{4.148808 \times 10^3 \cdot DM}{f^2}$ | $DM$: Dispersion Measure<br>$f$: Observing frequency | $DM$: $\text{pc/cm}^3$<br>$f$: MHz<br>$\Delta t_{DM}$: seconds | `dispersion_delay_s` in [timing_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/timing_model.py) |
| **Poisson Pulse Rate** | $\lambda(t) = \lambda_b + \lambda_s h(\phi(t))$ | $\lambda_b$: Background photon rate<br>$\lambda_s$: Source photon rate<br>$h$: Normalized profile | rates: ph/s<br>$\phi$: cycles | `lambda_const` in [signal_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/signal_model.py) |
| **Epoch-Folding Rate** | $\bar{\lambda}(t_i) = \frac{C_i \cdot N_b}{T_{\text{obs}}}$ | $C_i$: Count in bin $i$<br>$N_b$: Total number of bins<br>$T_{\text{obs}}$: Observation time | rates: ph/s<br>$T_{\text{obs}}$: seconds | `epoch_fold` in [epoch_folding.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/epoch_folding.py) |
| **Velocity Limit** | $\Delta v_{\text{max}} = \frac{c}{N_b \cdot N_p}$ | $N_b$: Bins per period<br>$N_p$: Number of folded periods | $v$: m/s<br>$c$: m/s | `velocity_error_tolerance` in [epoch_folding.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/epoch_folding.py) |
| **Fisher Information** | $I_p = \int_0^1 \frac{[\lambda_s h'(\phi)]^2}{\lambda_b + \lambda_s h(\phi)} d\phi$ | $h'$: Pulse profile derivative | $I_p$: unitless | `fisher_integral_Ip` in [crlb.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/crlb.py) |
| **Delay CRLB** | $\text{CRLB}(t_d) = \frac{2}{f_s^2 T_{\text{obs}} I_p}$ | $f_s$: Pulsar spin frequency | variance: $\text{s}^2$ | `crlb_pulse_delay` in [crlb.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/crlb.py) |
| **NLS Cost Function** | $J(\phi) = \sum_{i=1}^{N_b} \left( \bar{\lambda}_i - \lambda_i(\phi) \right)^2$ | $\bar{\lambda}$: Empirical rate<br>$\lambda(\phi)$: Shifted template | $J$: $(\text{ph/s})^2$ | `estimate_phase` in [delay_estimation.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/delay_estimation.py#L225-L324) |
| **MLE Log-Likelihood** | $\Psi(\phi) = \sum_{i=1}^{N_{ph}} \ln(\lambda_b + \lambda_s h(f_o t_i + \phi))$ | $t_i$: Raw photon arrival times | $\Psi$: unitless | `estimate_phase` in [delay_estimation.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/delay_estimation.py#L327-L459) |
| **Linearized Dynamics** | $\mathbf{\Phi} \approx \mathbf{I} + \mathbf{F} \Delta t$ | $\mathbf{F}$: Dynamics Jacobian | matrices: unitless | `state_transition_Phi` in [navigation_geometry.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_geometry.py) |
| **Covariance Update** | $\mathbf{P}^+ = (\mathbf{I} - \mathbf{K}\mathbf{H}) \mathbf{P}^- (\mathbf{I} - \mathbf{K}\mathbf{H})^T + \mathbf{K} \mathbf{R} \mathbf{K}^T$ | $\mathbf{K}$: Kalman gain<br>$\mathbf{H}$: Measurement matrix<br>$\mathbf{R}$: Noise covariance | matrices: standard SI units | `update` in [kalman_filter.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/kalman_filter.py#L449-L526) |
| **Gravity Gradient** | $\mathbf{G}(\mathbf{r}) = -\frac{\mu}{r^3}\mathbf{I} + \frac{3\mu}{r^5}\mathbf{r}\mathbf{r}^T$ | $\mu$: Earth gravity parameter<br>$\mathbf{r}$: Position vector | $\mathbf{G}$: $\text{s}^{-2}$ | `_gravity_gradient` in [xray_nav.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/xray_nav.py#L528-L535) |
| **PDOP** | $\text{PDOP} = \sqrt{\text{Tr}( (\mathbf{\Gamma}^T \mathbf{\Gamma})^{-1} )}$ | $\mathbf{\Gamma}$: Pulsar direction matrix | DOP: unitless | `position_dilution` in [navigation_geometry.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_geometry.py) |

---

## 19. File-by-File Mapping

This catalog defines the purpose, inputs, outputs, concepts, and dependencies of the core Python scientific files:

### 1. [coordinates.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/coordinates.py)
* **Purpose:** Handles transformations between astronomical coordinate systems and unit vector generation.
* **Inputs:** Sexagesimal Right Ascension and Declination strings, or ecliptic angles (degrees).
* **Outputs:** 3D Cartesian unit vectors $[x, y, z]$ and `SkyCoord` dataclasses.
* **Concepts Implemented:** Ecliptic-to-equatorial coordinate rotation, sexagesimal angle parsing (conversion of hours/minutes/seconds to degrees), and sphere-to-Cartesian mappings.
* **Dependencies:** `numpy`, `math`, `re`, `dataclasses`.

### 2. [timing_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/timing_model.py)
* **Purpose:** Implements time propagation models and relativistic/medium corrections.
* **Inputs:** Spacecraft coordinates (km), pulsar line-of-sight unit vectors, Modified Julian Date (MJD), Dispersion Measure ($DM$), and frequency (MHz).
* **Outputs:** Timing delays (seconds).
* **Concepts Implemented:** Earth-Moon Barycenter analytical orbital dynamics, relative Römer delay ($\Delta t_R = \mathbf{r}\cdot\mathbf{n}/c$), and interstellar plasma dispersion delay ($1/f^2$).
* **Dependencies:** `numpy`.

### 3. [signal_model.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/signal_model.py)
* **Purpose:** Models X-ray photon arrivals at a detector using a Poisson model.
* **Inputs:** Background flux $\lambda_b$, source flux $\lambda_s$, spin frequency $f_s$, initial phase $\phi_0$, and observation time $T_{\text{obs}}$.
* **Outputs:** Non-Homogeneous Poisson Process (NHPP) simulated photon Times of Arrival (TOAs) and evaluated rates.
* **Concepts Implemented:** Period-folded Gaussian-sum templates, time-varying observed frequencies (Doppler shifting), accumulated rate integration ($\Lambda(t)$), and Newton-Raphson inversion.
* **Dependencies:** `numpy`, `scipy.interpolate.interp1d`, `pulsar_nav/pulsar_catalog.py`.

### 4. [epoch_folding.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/epoch_folding.py)
* **Purpose:** Implements phase folding and velocity-error smearing analysis.
* **Inputs:** Photon TOA arrays (seconds), folding frequency $f_o$ (Hz), bin resolution $N_b$, and velocity error $\Delta v$ (m/s).
* **Outputs:** Empirical profile rates and noise variances.
* **Concepts Implemented:** Phase folding, histogram normalization, Poisson bin variance, and phase-smearing limits.
* **Dependencies:** `numpy`, `pulsar_nav/pulsar_catalog.py`, `pulsar_nav/signal_model.py`.

### 5. [delay_estimation.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/delay_estimation.py)
* **Purpose:** Estimates the arrival phase difference of a pulse at a detector.
* **Inputs:** Folded empirical rates, true profile templates, raw photon TOAs, background/source rates, and grid sizes.
* **Outputs:** Phase estimates $\hat{\phi}_0$ (cycles), timing delays (seconds), and cost functions.
* **Concepts Implemented:** Circular Cross-Correlation (FFT), parabolic peak interpolation, Nonlinear Least Squares (NLS) grid search, and Maximum Likelihood Estimation (MLE) on raw TOAs.
* **Dependencies:** `numpy`, `scipy.optimize.minimize_scalar`, `pulsar_nav/signal_model.py`, `pulsar_nav/epoch_folding.py`.

### 6. [crlb.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/crlb.py)
* **Purpose:** Computes the fundamental statistical limits of XNAV timing accuracy.
* **Inputs:** Profile templates, background/source rates, observation duration $T_{\text{obs}}$, and observing frequencies.
* **Outputs:** Fisher Information integrals, CRLB variance bounds, and Asymptotic Relative Efficiency (ARE) ratios.
* **Concepts Implemented:** Numerical quadrature of Fisher integrals, joint parameter CRLB matrices (phase + frequency), and Asymptotic Relative Efficiency (information loss due to binning).
* **Dependencies:** `numpy`, `pulsar_nav/pulsar_catalog.py`, `pulsar_nav/signal_model.py`.

### 7. [navigation_geometry.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_geometry.py)
* **Purpose:** Implements state-space structures, dynamics matrices, and observability checks.
* **Inputs:** Selected pulsar lists and sampling intervals.
* **Outputs:** System dynamics matrix $\mathbf{F}$, state transition matrix $\mathbf{\Phi}$, measurement matrix $\mathbf{H}$, and process noise covariance $\mathbf{Q}$.
* **Concepts Implemented:** State-space modeling, nilpotent matrix transitions ($F^3=0$), discrete covariance integration, rank-based system observability checks, and GDOP/PDOP.
* **Dependencies:** `numpy`, `math`, `pulsar_nav/pulsar_catalog.py`.

### 8. [kalman_filter.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/kalman_filter.py)
* **Purpose:** Implements the $10$-state linear error-state Kalman Filter (L-ESKF).
* **Inputs:** Simulated or real measurement delays, measurement variances, sampling intervals, and true states.
* **Outputs:** Estimated state corrections (position error, velocity error, accelerometer bias, clock bias), state covariances, and innovation records.
* **Concepts Implemented:** Linear Kalman Filter prediction and update cycles, Joseph-form covariance updates, and Monte Carlo filter consistency verification.
* **Dependencies:** `numpy`, `pulsar_nav/pulsar_catalog.py`, `pulsar_nav/navigation_geometry.py`.

### 9. [xray_nav.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/xray_nav.py)
* **Purpose:** High-fidelity absolute Extended Kalman Filter (EKF) engine for Earth orbiters.
* **Inputs:** Trajectory steps, initial states, process/measurement noise levels, and pulsar line-of-sight parameters.
* **Outputs:** Absolute position, velocity, and clock bias estimates, and covariances.
* **Concepts Implemented:** Absolute EKF, Keplerian orbit dynamics, Earth $J_2$ oblateness gravity perturbations, gravity gradient matrices, and $4^{\text{th}}$-order Runge-Kutta numerical integration.
* **Dependencies:** `numpy`, `pandas`, `scipy.optimize.minimize_scalar`, `pulsar_nav/config.py`.

### 10. [navigation_engine.py](file:///Users/supryo/Desktop/pulsar/pulsar_nav/navigation_engine.py)
* **Purpose:** Runs batch least-squares Monte Carlo simulations.
* **Inputs:** Ranked pulsar CSV paths, noise levels, pulsar counts, and trial quantities.
* **Outputs:** Computed positions, coordinate errors, statistical summaries, and SVG error plots.
* **Concepts Implemented:** Trajectory simulation, Gaussian timing noise injection, clock bias simulation, WLS solvers, error percentiles, and SVG plotting.
* **Dependencies:** `numpy`, `pandas`, `pathlib`, `pulsar_nav/config.py`, `pulsar_nav/timing_model.py`.

---

## 20. Research Contribution

The PulsarNav AI framework contributes to deep-space navigation research in several ways:

### Scientific Contribution
The framework provides an independent validation platform for the mathematical models of X-ray pulsar emission and propagation delay. By implementing Cross-Correlation, Nonlinear Least Squares, and Maximum Likelihood estimators, the codebase allows researchers to analyze the trade-off between timing accuracy and computational complexity under realistic noise profiles. 

Furthermore, the Asymptotic Relative Efficiency (ARE) analysis quantifies the information loss that occurs when continuous photon times of arrival are binned into discrete phase histograms.

### Engineering Contribution
Integrating high-fidelity Python scientific calculations with a Next.js web application demonstrates a modern approach to mission-control design. The Next.js API route (`route.ts`) implements equivalent mathematical formulations of coordinate rotations, Keplerian orbital dynamics, $J_2$ gravity perturbations, and EKF algorithms in TypeScript, enabling real-time interactive simulations in the web visualizer. 

The $60\text{ fps}$ Three.js rendering engine features a priority-based label projection loop, showing that complex scientific visualizers can run smoothly in standard web browsers.

### Autonomous Navigation Significance
By demonstrating that a spacecraft can determine its position and velocity using millisecond pulsars, this framework supports the transition toward fully autonomous deep-space probes. An onboard XNAV system enables:
1. **Self-Governing Cruise Phases:** Spacecraft can cruise through interplanetary space and calculate their trajectories without requiring routine ground stations support.
2. **Autonomous Trajectory Corrections:** Real-time onboard state estimation enables immediate orbital corrections, reducing risk during critical mission phases such as outer-planet insertions or flybys.
3. **Emergency Navigation Fallbacks:** If communication with Earth is lost, the spacecraft can use XNAV as a fail-safe navigation system to maintain its course.

### Relevance to SAC ISRO
As the **Space Applications Centre (SAC) ISRO** plans ambitious future missions—including cislunar orbiters, Martian landing platforms, and deep-space probes to the outer solar system—autonomous navigation is critical. Researching XNAV algorithms supports ISRO's goals of developing self-reliant space technologies. 

Fusing timing measurements from onboard X-ray spectrometers with terrestrial tracking systems will help secure spacecraft autonomy and ensure the success of India's future deep-space exploration programs.
