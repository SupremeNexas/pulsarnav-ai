from __future__ import annotations

from pathlib import Path

import pandas as pd


def _scale(value: float, src_min: float, src_max: float, dst_min: float, dst_max: float) -> float:
    if src_max == src_min:
        return (dst_min + dst_max) / 2.0
    return dst_min + (value - src_min) * (dst_max - dst_min) / (src_max - src_min)


def _sky_svg(catalog: pd.DataFrame, ranked: pd.DataFrame) -> str:
    top = set(ranked.head(10)["name"])
    labels = ranked.head(10).set_index("name")
    points = []
    for row in catalog.dropna(subset=["ra_deg", "dec_deg"]).itertuples(index=False):
        x = _scale(row.ra_deg, 0.0, 360.0, 40.0, 760.0)
        y = _scale(row.dec_deg, -90.0, 90.0, 360.0, 30.0)
        color = "#d1495b" if row.name in top else "#247ba0"
        radius = 5 if row.name in top else 3
        points.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{radius}" fill="{color}"><title>{row.name}</title></circle>')
        if row.name in top:
            score = labels.loc[row.name, "score"]
            points.append(f'<text x="{x + 7:.1f}" y="{y - 5:.1f}" font-size="10">{row.name} ({score:.2f})</text>')
    grid = []
    for ra in range(0, 361, 60):
        x = _scale(ra, 0.0, 360.0, 40.0, 760.0)
        grid.append(f'<line x1="{x:.1f}" y1="30" x2="{x:.1f}" y2="360" stroke="#d9e2ec"/>')
    for dec in range(-60, 90, 30):
        y = _scale(dec, -90.0, 90.0, 360.0, 30.0)
        grid.append(f'<line x1="40" y1="{y:.1f}" x2="760" y2="{y:.1f}" stroke="#d9e2ec"/>')
    return f'<svg viewBox="0 0 800 390" role="img">{"".join(grid)}{"".join(points)}<text x="360" y="385" font-size="12">Right Ascension</text><text x="4" y="195" font-size="12" transform="rotate(-90 12,195)">Declination</text></svg>'


def _line_svg(df: pd.DataFrame, x_col: str, y_col: str, x_label: str, y_label: str, log_x: bool = False) -> str:
    data = df[[x_col, y_col]].dropna().sort_values(x_col)
    if log_x:
        data = data.assign(**{x_col: data[x_col].clip(lower=1e-12).map(lambda v: __import__("math").log10(v))})
    x_min, x_max = float(data[x_col].min()), float(data[x_col].max())
    y_min, y_max = float(data[y_col].min()), float(data[y_col].max())
    coords = []
    circles = []
    for row in data.itertuples(index=False):
        x_val, y_val = float(row[0]), float(row[1])
        x = _scale(x_val, x_min, x_max, 55.0, 740.0)
        y = _scale(y_val, y_min, y_max, 330.0, 30.0)
        coords.append(f"{x:.1f},{y:.1f}")
        circles.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#247ba0"><title>{y_val:.3f} km</title></circle>')
    return f"""<svg viewBox="0 0 800 370" role="img">
<line x1="55" y1="330" x2="740" y2="330" stroke="#52606d"/>
<line x1="55" y1="30" x2="55" y2="330" stroke="#52606d"/>
<polyline points="{' '.join(coords)}" fill="none" stroke="#247ba0" stroke-width="2"/>
{''.join(circles)}
<text x="350" y="360" font-size="12">{x_label}</text>
<text x="10" y="190" font-size="12" transform="rotate(-90 12,190)">{y_label}</text>
</svg>"""


def _position_svg(errors: pd.DataFrame) -> str:
    sample = errors.iloc[0]
    xs = [sample.true_x_km, sample.estimated_x_km]
    ys = [sample.true_y_km, sample.estimated_y_km]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    pad_x = max(1.0, abs(x_max - x_min) * 0.2)
    pad_y = max(1.0, abs(y_max - y_min) * 0.2)
    x_min, x_max = x_min - pad_x, x_max + pad_x
    y_min, y_max = y_min - pad_y, y_max + pad_y
    tx = _scale(sample.true_x_km, x_min, x_max, 70.0, 730.0)
    ty = _scale(sample.true_y_km, y_min, y_max, 320.0, 40.0)
    ex = _scale(sample.estimated_x_km, x_min, x_max, 70.0, 730.0)
    ey = _scale(sample.estimated_y_km, y_min, y_max, 320.0, 40.0)
    return f"""<svg viewBox="0 0 800 360" role="img">
<line x1="70" y1="320" x2="730" y2="320" stroke="#52606d"/>
<line x1="70" y1="40" x2="70" y2="320" stroke="#52606d"/>
<line x1="{tx:.1f}" y1="{ty:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" stroke="#9fb3c8" stroke-dasharray="4 4"/>
<circle cx="{tx:.1f}" cy="{ty:.1f}" r="7" fill="#2f855a"><title>True position</title></circle>
<circle cx="{ex:.1f}" cy="{ey:.1f}" r="7" fill="#d1495b"><title>Estimated position</title></circle>
<text x="{tx + 10:.1f}" y="{ty - 8:.1f}" font-size="12">True</text>
<text x="{ex + 10:.1f}" y="{ey - 8:.1f}" font-size="12">Estimated</text>
<text x="345" y="350" font-size="12">X position (km)</text>
<text x="12" y="190" font-size="12" transform="rotate(-90 12,190)">Y position (km)</text>
</svg>"""


def create_static_dashboard(
    catalog: pd.DataFrame,
    ranked: pd.DataFrame,
    positions: pd.DataFrame,
    errors: pd.DataFrame,
    output: Path,
) -> Path:
    output.mkdir(parents=True, exist_ok=True)
    html = output / "dashboard.html"
    top10 = ranked.head(10)[["name", "score", "median_error_us", "duration_days", "n_toas"]].to_html(index=False)
    by_noise = errors.groupby("noise_ns", as_index=False)["position_error_km"].median()
    by_count = errors.groupby("pulsar_count", as_index=False)["position_error_km"].median()
    html.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pulsar Navigation Dashboard</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 32px; color: #1f2933; background: #f8fafc; }}
    main {{ max-width: 1040px; margin: auto; }}
    section {{ margin: 24px 0; padding: 20px; background: white; border: 1px solid #d9e2ec; border-radius: 6px; }}
    h1, h2 {{ margin: 0 0 12px; }}
    table {{ border-collapse: collapse; margin-top: 12px; width: 100%; }}
    th, td {{ border-bottom: 1px solid #d9e2ec; padding: 7px 10px; text-align: right; }}
    th:first-child, td:first-child {{ text-align: left; }}
    svg {{ width: 100%; height: auto; background: #ffffff; }}
    .metric {{ display: inline-block; margin-right: 24px; color: #52606d; }}
  </style>
</head>
<body>
<main>
  <h1>AI-Assisted Pulsar Navigation Dashboard</h1>
  <p class="metric">Catalog pulsars: {len(catalog)}</p>
  <p class="metric">Simulated positions: {len(positions)}</p>
  <p class="metric">Monte Carlo rows: {len(errors)}</p>
  <section>
    <h2>Top 10 Navigation Pulsars</h2>
    {top10}
  </section>
  <section>
    <h2>Pulsar Sky Map</h2>
    {_sky_svg(catalog, ranked)}
  </section>
  <section>
    <h2>Navigation Simulation</h2>
    {_position_svg(errors)}
  </section>
  <section>
    <h2>Position Error vs Timing Error</h2>
    {_line_svg(by_noise, "noise_ns", "position_error_km", "Timing noise (ns, log scale)", "Median error (km)", log_x=True)}
  </section>
  <section>
    <h2>Position Error vs Number of Pulsars</h2>
    {_line_svg(by_count, "pulsar_count", "position_error_km", "Number of pulsars", "Median error (km)")}
  </section>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )
    return html
