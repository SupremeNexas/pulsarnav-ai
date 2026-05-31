from pathlib import Path


SPEED_OF_LIGHT_KM_S = 299_792.458


def find_dataset_root(base: Path | str = ".") -> Path:
    base = Path(base)
    candidates = [
        base / "dataset",
        base / "NANOGrav_12yv4",
        base,
    ]
    for candidate in candidates:
        if (candidate / "narrowband" / "par").is_dir() and (candidate / "narrowband" / "tim").is_dir():
            return candidate
    raise FileNotFoundError(
        "Could not find dataset root. Expected dataset/narrowband or NANOGrav_12yv4/narrowband."
    )


def output_dir(dataset_root: Path, explicit: Path | None = None) -> Path:
    out = explicit if explicit is not None else dataset_root.parent / "output"
    out.mkdir(parents=True, exist_ok=True)
    return out
