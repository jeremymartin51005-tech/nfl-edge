"""Build the standalone interactive HTML dashboard.

Reads data/raw/games.csv, cleans it with nfl_edge.cleaning (same rules as the
Streamlit app), and embeds a compact game table into dashboard/template.html,
writing dashboard/nfl_dashboard.html. Open that file in any browser.

    python scripts/build_dashboard.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from nfl_edge.cleaning import build_games  # noqa: E402
from nfl_edge.loader import GAMES_FILE  # noqa: E402

import pandas as pd  # noqa: E402

TEMPLATE = ROOT / "dashboard" / "template.html"
OUT = ROOT / "dashboard" / "nfl_dashboard.html"
CHARTJS = ROOT / "dashboard" / "vendor" / "chart.umd.js"  # Chart.js 4.4.1 (MIT), inlined so the file works offline

# Current NFL alignment (stable since 2002, covers the full 2020+ scope).
DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"],
    "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAX", "TEN"],
    "AFC West": ["DEN", "KC", "LAC", "LV"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"],
    "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"],
    "NFC West": ["ARI", "LA", "SEA", "SF"],
}
TEAM_NAMES = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons", "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears", "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos", "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts", "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers", "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots", "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles", "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers", "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
COLUMNS = ["season", "week", "type", "date", "day", "kick", "home", "away", "hs", "as",
           "spread", "total", "div", "roof", "stadium", "neutral", "fav", "ot"]


def _num(x):
    if pd.isna(x):
        return None
    f = float(x)
    return int(f) if f.is_integer() else f


def main() -> None:
    raw = pd.read_csv(GAMES_FILE, low_memory=False)
    g, rep = build_games(raw)
    rows = []
    for r in g.itertuples(index=False):
        fav = 1 if r.fav_side == "home" else -1 if r.fav_side == "away" else 0
        rows.append([
            int(r.season), int(r.week), r.game_type, r.date.strftime("%Y-%m-%d"), r.weekday,
            r.kickoff if isinstance(r.kickoff, str) else "", r.home_team, r.away_team,
            int(r.home_score), int(r.away_score), _num(r.spread_line), _num(r.total_line),
            int(r.div_game), r.roof if isinstance(r.roof, str) else "", r.stadium if isinstance(r.stadium, str) else "",
            int(r.neutral_site), fav, int(r.overtime),
        ])
    teams = {t for ts in DIVISIONS.values() for t in ts}
    unknown = (set(g["home_team"]) | set(g["away_team"])) - teams
    if unknown:
        raise SystemExit(f"Teams missing from DIVISIONS: {sorted(unknown)}")
    payload = {
        "columns": COLUMNS,
        "games": rows,
        "divisions": DIVISIONS,
        "teamNames": TEAM_NAMES,
        "meta": {
            "source": "nflverse games.csv (data/raw/games.csv)",
            "built": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "unplayedExcluded": rep.unplayed_excluded,
            "lastGame": g["date"].max().strftime("%Y-%m-%d"),
        },
    }
    data = json.dumps(payload, separators=(",", ":"))
    html = TEMPLATE.read_text(encoding="utf-8").replace("/*__DATA__*/null", data)
    html = html.replace("/*__CHARTJS__*/", CHARTJS.read_text(encoding="utf-8").replace("</script>", "<\\/script>"))
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(rows):,} games, {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
