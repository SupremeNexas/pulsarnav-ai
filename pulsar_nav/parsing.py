from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .coordinates import ecliptic_to_equatorial, parse_angle, sky_to_unit_vector


CATALOG_COLUMNS = [
    "name",
    "ra",
    "dec",
    "ra_deg",
    "dec_deg",
    "f0",
    "f1",
    "pepoch",
    "dm",
    "start_mjd",
    "finish_mjd",
    "par_file",
]


def _tempo_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace("D", "E").replace("d", "e"))
    except ValueError:
        return None


def _read_par_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "C ")):
            continue
        parts = line.split()
        if len(parts) >= 2:
            values[parts[0].upper()] = parts[1]
    return values


def pulsar_name_from_path(path: Path) -> str:
    return path.name.split("_NANOGrav")[0].replace(".par", "")


def parse_par_file(path: Path) -> dict:
    values = _read_par_values(path)
    name = values.get("PSRJ") or values.get("PSR") or pulsar_name_from_path(path)
    ra_raw = values.get("RAJ")
    dec_raw = values.get("DECJ")
    ra_deg = parse_angle(ra_raw, hours=True)
    dec_deg = parse_angle(dec_raw, hours=False)
    if (ra_deg is None or dec_deg is None) and "LAMBDA" in values and "BETA" in values:
        coord = ecliptic_to_equatorial(float(values["LAMBDA"]), float(values["BETA"]))
        ra_deg = coord.ra_deg
        dec_deg = coord.dec_deg
    return {
        "name": name,
        "ra": ra_raw,
        "dec": dec_raw,
        "ra_deg": ra_deg,
        "dec_deg": dec_deg,
        "f0": _tempo_float(values.get("F0")),
        "f1": _tempo_float(values.get("F1")),
        "pepoch": _tempo_float(values.get("PEPOCH")),
        "dm": _tempo_float(values.get("DM")),
        "start_mjd": _tempo_float(values.get("START")),
        "finish_mjd": _tempo_float(values.get("FINISH")),
        "par_file": str(path),
    }


def build_catalog(par_dir: Path) -> pd.DataFrame:
    rows = [parse_par_file(path) for path in sorted(par_dir.glob("*.par"))]
    df = pd.DataFrame(rows, columns=CATALOG_COLUMNS)
    df = df.drop_duplicates(subset=["name"], keep="first").sort_values("name").reset_index(drop=True)
    return df


def build_unit_vectors(catalog: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for row in catalog.dropna(subset=["ra_deg", "dec_deg"]).itertuples(index=False):
        vector = sky_to_unit_vector(row.ra_deg, row.dec_deg)
        rows.append({"name": row.name, "x": vector[0], "y": vector[1], "z": vector[2]})
    return pd.DataFrame(rows)


def parse_tim_file(path: Path) -> pd.DataFrame:
    rows = []
    pulsar = pulsar_name_from_path(path).replace(".tim", "")
    with path.open(errors="replace") as handle:
        for line_no, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line or line.startswith(("C", "#")) or line.upper().startswith(("MODE", "FORMAT")):
                continue
            parts = line.split()
            if len(parts) < 5:
                continue
            freq = _tempo_float(parts[1])
            mjd = _tempo_float(parts[2])
            error = _tempo_float(parts[3])
            if freq is None or mjd is None or error is None:
                continue
            rows.append(
                {
                    "pulsar": pulsar,
                    "mjd": mjd,
                    "error": error,
                    "freq": freq,
                    "observatory": parts[4],
                    "tim_file": str(path),
                    "line": line_no,
                }
            )
    return pd.DataFrame(rows)


def build_toa_database(tim_dir: Path) -> pd.DataFrame:
    frames = [parse_tim_file(path) for path in sorted(tim_dir.glob("*.tim"))]
    if not frames:
        return pd.DataFrame(columns=["pulsar", "mjd", "error", "freq", "observatory", "tim_file", "line"])
    return pd.concat(frames, ignore_index=True)


def toa_statistics(toa: pd.DataFrame) -> pd.DataFrame:
    stats = (
        toa.groupby("pulsar")
        .agg(
            n_toas=("mjd", "size"),
            first_mjd=("mjd", "min"),
            last_mjd=("mjd", "max"),
            median_error_us=("error", "median"),
            mean_error_us=("error", "mean"),
            median_freq_mhz=("freq", "median"),
        )
        .reset_index()
    )
    stats["duration_days"] = stats["last_mjd"] - stats["first_mjd"]
    return stats
