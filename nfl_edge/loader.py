"""Raw data loading. No transformation happens here beyond reading the file."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
GAMES_FILE = RAW_DIR / "games.csv"
SOURCE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"


@dataclass(frozen=True)
class RawFile:
    path: Path
    rows: int
    columns: int
    size_kb: float
    modified: pd.Timestamp


def read_games(path: Path = GAMES_FILE) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Run `python scripts/fetch_data.py` to download it."
        )
    return pd.read_csv(path, low_memory=False)


def describe_files() -> list[RawFile]:
    out = []
    for p in sorted(RAW_DIR.glob("*.csv")):
        df = pd.read_csv(p, low_memory=False)
        out.append(
            RawFile(
                path=p,
                rows=len(df),
                columns=df.shape[1],
                size_kb=p.stat().st_size / 1024,
                modified=pd.Timestamp(p.stat().st_mtime, unit="s"),
            )
        )
    return out
