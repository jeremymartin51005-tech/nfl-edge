"""Independent check of numbers shown on the dashboard.

Recomputes a set of displayed values straight from data/raw/games.csv with
plain pandas. It deliberately does NOT import nfl_edge.cleaning or reuse the
dashboard's JavaScript, so agreement means two separate implementations match.

    python scripts/verify_dashboard.py
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
AFC_NORTH = {"BAL", "CIN", "CLE", "PIT"}

d = pd.read_csv(ROOT / "data" / "raw" / "games.csv", low_memory=False)
d = d[(d.season >= 2020) & d.home_score.notna() & d.away_score.notna()].copy()
d["margin_home"] = d.home_score - d.away_score          # home score minus away score
d["pts"] = d.home_score + d.away_score
d["home_ats"] = d.margin_home - d.spread_line           # spread_line = points home is favored by
d["fav_ats"] = d.home_ats.where(d.spread_line > 0, -d.home_ats).where(d.spread_line != 0)
d["ou"] = d.pts - d.total_line
d["indoor"] = d.roof.isin(["dome", "closed"])
nn = d[d.location != "Neutral"]


def rate(s):
    """Win % with pushes excluded, plus the W-L-P record."""
    s = s.dropna()
    w, l, p = int((s > 0).sum()), int((s < 0).sum()), int((s == 0).sum())
    return {"pct": round(100 * w / (w + l), 1), "record": f"{w}-{l}-{p}"}


def team_ats(df, t):
    return rate(pd.concat([df[df.home_team == t].home_ats, -df[df.away_team == t].home_ats]))


f1 = d[d.season.between(2023, 2024) & (d.game_type == "REG") & (d.home_team.isin(AFC_NORTH) | d.away_team.isin(AFC_NORTH))]
f2 = d[(d.game_type != "REG") & ((d.home_team == "KC") | (d.away_team == "KC"))]
f3 = d[d.season == 2025]

out = {
    "1 games (no filters)": len(d),
    "2 points per game": round(d.pts.mean(), 1),
    "3 favorite cover": rate(d.fav_ats),
    "4 home cover (non-neutral)": rate(nn.home_ats),
    "5 over": rate(d.ou),
    "6 avg margin of victory": round(d.margin_home.abs().mean(), 1),
    "7 home win % (non-neutral)": round(100 * (nn.margin_home > 0).mean(), 1),
    "8 DET ATS": team_ats(d, "DET"),
    "9 indoor avg points": round(d[d.indoor & d.roof.notna()].pts.mean(), 1),
    "10 outdoor avg points": round(d[~d.indoor & d.roof.notna()].pts.mean(), 1),
    "11 favorites laying exactly 3": rate(d[d.spread_line.abs() == 3].fav_ats),
    "F1 2023-24, regular season, AFC North: games": len(f1),
    "F1 favorite cover": rate(f1.fav_ats),
    "F1 points per game": round(f1.pts.mean(), 1),
    "F2 playoffs, KC: games": len(f2),
    "F2 over": rate(f2.ou),
    "F3 2025 only: games": len(f3),
    "F3 home cover": rate(f3[f3.location != "Neutral"].home_ats),
    "F3 avg margin": round(f3.margin_home.abs().mean(), 1),
}
print(json.dumps(out, indent=1))
