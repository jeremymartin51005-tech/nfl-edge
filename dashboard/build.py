"""Build the standalone NFL EDGE dashboard: one HTML file with the data, d3 and the app inlined.

    python dashboard/build.py                     # writes dashboard/nfl_edge_dashboard.html
    python dashboard/build.py --fragment PATH     # also writes a body-only copy for hosts that add <html>/<head>

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

# Source columns embedded in the page (completed games, 2020 on).
COLS = [
    "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
    "away_team", "away_score", "home_team", "home_score", "location", "result", "total", "overtime",
    "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line",
    "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds",
    "div_game", "roof", "surface", "temp", "wind", "away_qb_name", "home_qb_name",
    "away_coach", "home_coach", "referee", "stadium",
]
JS_FILES = [
    "core.js", "charts.js", "ui.js",
    "tab_overview.js", "tab_story.js", "tab_teams.js", "tab_betting.js",
    "tab_lab.js", "tab_games.js", "tab_market.js", "tab_data.js", "shell.js",
]

# What each source column is and how the dashboard uses it (shown in the Data explorer).
ROLES = {
    "game_id": ("Identifier", "Unique game key; duplicate check"),
    "season": ("Schedule", "Season filter, trends"),
    "game_type": ("Schedule", "Regular season vs. playoffs"),
    "week": ("Schedule", "Week-level trends, explorer"),
    "gameday": ("Schedule", "Date filter, ordering"),
    "weekday": ("Schedule", "Game details"),
    "gametime": ("Schedule", "Game details"),
    "away_team": ("Teams", "Team views, filters"),
    "home_team": ("Teams", "Team views, filters"),
    "away_score": ("Result", "Scores, margins, settlement"),
    "home_score": ("Result", "Scores, margins, settlement"),
    "location": ("Context", "Neutral-site flag"),
    "result": ("Result", "Cross-check of home margin"),
    "total": ("Result", "Cross-check of combined points"),
    "overtime": ("Result", "Game details"),
    "away_rest": ("Context", "Rest-edge filter (trend lab)"),
    "home_rest": ("Context", "Rest-edge filter (trend lab)"),
    "away_moneyline": ("Moneyline", "Favorite fallback, implied chance, margin"),
    "home_moneyline": ("Moneyline", "Favorite fallback, implied chance, margin"),
    "spread_line": ("Spread", "Closing spread: points the home team was favored by"),
    "away_spread_odds": ("Spread", "Spread price, break-even, margin"),
    "home_spread_odds": ("Spread", "Spread price, break-even, margin"),
    "total_line": ("Total", "Closing over/under"),
    "under_odds": ("Total", "Total price, margin"),
    "over_odds": ("Total", "Total price, break-even, margin"),
    "div_game": ("Context", "Division-game filter"),
    "roof": ("Context", "Game details"),
    "surface": ("Context", "Game details"),
    "temp": ("Context", "Game details"),
    "wind": ("Context", "Game details"),
    "away_qb_name": ("Context", "Search, game details"),
    "home_qb_name": ("Context", "Search, game details"),
    "away_coach": ("Context", "Search"),
    "home_coach": ("Context", "Search"),
    "referee": ("Context", "Game details"),
    "stadium": ("Context", "Search, game details"),
    "old_game_id": ("External ID", "Not used"),
    "gsis": ("External ID", "Not used"),
    "nfl_detail_id": ("External ID", "Not used"),
    "pfr": ("External ID", "Not used"),
    "pff": ("External ID", "Not used"),
    "espn": ("External ID", "Not used"),
    "ftn": ("External ID", "Not used"),
    "away_qb_id": ("External ID", "Not used"),
    "home_qb_id": ("External ID", "Not used"),
    "stadium_id": ("External ID", "Not used"),
}


def clean(v):
    if isinstance(v, float):
        if math.isnan(v):
            return None
        if v.is_integer():
            return int(v)
    return v


def dtype_label(s: pd.Series) -> str:
    if pd.api.types.is_integer_dtype(s):
        return "integer"
    if pd.api.types.is_float_dtype(s):
        nonnull = s.dropna()
        return "integer" if len(nonnull) and (nonnull % 1 == 0).all() else "decimal"
    return "text"


def build_data() -> dict:
    raw = pd.read_csv(GAMES, low_memory=False)
    scope = raw[raw["season"] >= MIN_SEASON]
    done = scope[scope["home_score"].notna() & scope["away_score"].notna()]
    rows = [[clean(v) for v in r] for r in done[COLS].itertuples(index=False, name=None)]
    columns = []
    for c in raw.columns:
        example = next((clean(v) for v in done[c] if not (isinstance(v, float) and math.isnan(v))), None)
        cat, use = ROLES.get(c, ("Other", "Not used"))
        columns.append({
            "name": c,
            "type": dtype_label(raw[c]),
            "missing_completed": int(done[c].isna().sum()),
            "missing_2020": int(scope[c].isna().sum()),
            "example": None if example is None else str(example),
            "embedded": c in COLS,
            "category": cat,
            "use": use,
        })
    meta = {
        "source": "https://github.com/nflverse/nfldata (data/games.csv)",
        "downloaded": datetime.fromtimestamp(GAMES.stat().st_mtime, tz=timezone.utc).strftime("%b %d, %Y"),
        "file": {
            "name": GAMES.name,
            "rows": int(len(raw)),
            "columns": int(raw.shape[1]),
            "size_kb": round(GAMES.stat().st_size / 1024),
            "seasons": [int(raw["season"].min()), int(raw["season"].max())],
        },
        "rows_2020": int(len(scope)),
        "completed_2020": int(len(done)),
        "unplayed": int(len(scope) - len(done)),
        "duplicate_ids": int(scope["game_id"].duplicated().sum()),
        "duplicate_matchups": int(scope.duplicated(["gameday", "home_team", "away_team"]).sum()),
        "columns": columns,
    }
    return {"cols": COLS, "rows": rows, "meta": meta}


def build(fragment_path: Path | None = None) -> None:
    template = (SRC / "index.html").read_text()
    data = json.dumps(build_data(), separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    d3 = (SRC / "d3.v7.9.0.min.js").read_text()
    app = "\n".join(f"// ---- {f} ----\n" + (SRC / f).read_text() for f in JS_FILES)
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
