"""Build the standalone NFL EDGE dashboard: one HTML file with the data, d3 and the app inlined.

    python dashboard/build.py            # writes dashboard/nfl_edge_dashboard.html
    python dashboard/build.py --fragment PATH   # also writes a body-only copy for hosts that add <html>/<head>

Run `python scripts/fetch_data.py` first to refresh data/raw/games.csv.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(__file__).resolve().parent / "src"
OUT = Path(__file__).resolve().parent / "nfl_edge_dashboard.html"
GAMES = ROOT / "data" / "raw" / "games.csv"
MIN_SEASON = 2020

COLS = [
    "game_id", "season", "game_type", "week", "gameday", "away_team", "away_score", "home_team",
    "home_score", "location", "overtime", "away_moneyline", "home_moneyline", "spread_line",
    "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds", "stadium",
    "away_qb_name", "home_qb_name", "away_coach", "home_coach",
]


def clean(v):
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v.is_integer():
            return int(v)
    return v


def build_data() -> dict:
    raw = pd.read_csv(GAMES, low_memory=False)
    scope = raw[raw["season"] >= MIN_SEASON]
    done = scope[scope["home_score"].notna() & scope["away_score"].notna()]
    rows = [[clean(v) for v in r] for r in done[COLS].itertuples(index=False, name=None)]
    meta = {
        "source": "https://github.com/nflverse/nfldata (data/games.csv)",
        "downloaded": datetime.fromtimestamp(GAMES.stat().st_mtime, tz=timezone.utc).strftime("%b %d, %Y"),
        "rows_2020": int(len(scope)),
        "unplayed": int(len(scope) - len(done)),
        "duplicate_ids": int(scope["game_id"].duplicated().sum()),
        "duplicate_matchups": int(scope.duplicated(["gameday", "home_team", "away_team"]).sum()),
    }
    return {"cols": COLS, "rows": rows, "meta": meta}


def build(fragment_path: Path | None = None) -> None:
    template = (SRC / "index.html").read_text()
    data = json.dumps(build_data(), separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    d3 = (SRC / "d3.v7.9.0.min.js").read_text()
    app = "\n".join((SRC / f).read_text() for f in ("core.js", "charts.js", "views.js"))
    body = (
        template.replace("<!--DATA-->", f'<script type="application/json" id="ne-data">{data}</script>')
        .replace("<!--D3-->", f"<script>/* d3 v7.9.0, ISC license, https://d3js.org */\n{d3}</script>")
        .replace("<!--APP-->", f"<script>\n{app}\n</script>")
    )
    head_end = body.index("</style>") + len("</style>")
    doc = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f"{body[:head_end]}\n</head>\n<body>\n{body[head_end:]}\n</body>\n</html>\n"
    )
    OUT.write_text(doc)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
    if fragment_path:
        fragment_path.write_text(body)
        print(f"wrote {fragment_path} ({fragment_path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fragment", type=Path, help="also write a body-only copy here")
    build(ap.parse_args().fragment)
