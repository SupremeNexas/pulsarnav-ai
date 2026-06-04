# Navigation Engine

The core navigation engine lives in `pulsar_nav/navigation_engine.py`.

## Model

For a spacecraft position vector `r` and a pulsar unit direction vector `n`, the expected pulse timing delay is:

```text
delta_t = (r dot n) / c
```

where `c = 299792.458 km/s`.

The engine adds Gaussian timing noise in nanoseconds, then solves the inverse problem with linear least squares:

```text
A r = c * delta_t
```

`A` is the selected pulsar direction matrix. The solver requires at least four pulsars and supports 4-8 pulsars for the Monte Carlo study.

## Regions

Synthetic spacecraft positions are generated in three regions:

- `earth_orbit`: 6,700-42,200 km radius
- `earth_moon`: 42,200-384,400 km radius
- `deep_space`: 384,400-2,000,000 km radius

## Default Simulation

```bash
python3 scripts/run_navigation_lab.py \
  --vectors output/ranked_pulsars.csv \
  --output-dir output \
  --trials 1000
```

Default timing noise levels:

```text
10 ns, 50 ns, 100 ns, 500 ns, 1000 ns
```

Default pulsar counts:

```text
4, 5, 6, 7, 8
```

## Outputs

```text
output/navigation_lab_results.csv
output/navigation_lab_summary.csv
output/navigation_lab_positions.csv
output/position_error_vs_timing_noise.svg
output/position_error_distribution.svg
output/position_error_vs_pulsar_count.svg
```

## API

The web application exposes a simulation endpoint:

```text
GET /api/navigation-lab?trials=1000&pulsars=6&noise=100&region=earth_moon
```

The endpoint returns JSON suitable for the Navigation Lab dashboard page.
