"""Reusable statistical calculations.

Every function takes already-filtered frames so the UI decides scope and the
math stays in one place.

Definitions
-----------
* Win %       = wins / games played (ties stay in the denominator).
* ATS cover % = covers / (covers + non-covers). Pushes are excluded from the
                denominator and reported separately as push % of graded games.
* Over %      = overs / (overs + unders). Pushes reported separately.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class SU:
    w: int
    l: int
    t: int

    @property
    def n(self) -> int:
        return self.w + self.l + self.t

    @property
    def pct(self) -> float:
        return self.w / self.n if self.n else np.nan

    @property
    def record(self) -> str:
        return f"{self.w}-{self.l}" + (f"-{self.t}" if self.t else "")


@dataclass(frozen=True)
class Graded:
    """Two-way market outcome (ATS or totals) with pushes."""

    win: int
    loss: int
    push: int

    @property
    def decisive(self) -> int:
        return self.win + self.loss

    @property
    def n(self) -> int:
        return self.win + self.loss + self.push

    @property
    def pct(self) -> float:
        return self.win / self.decisive if self.decisive else np.nan

    @property
    def loss_pct(self) -> float:
        return self.loss / self.decisive if self.decisive else np.nan

    @property
    def push_pct(self) -> float:
        return self.push / self.n if self.n else np.nan

    @property
    def record(self) -> str:
        return f"{self.win}-{self.loss}-{self.push}"


def su(s: pd.Series) -> SU:
    s = s.dropna()
    return SU(int((s == "W").sum()), int((s == "L").sum()), int((s == "T").sum()))


def ats(s: pd.Series) -> Graded:
    s = s.dropna()
    return Graded(int((s == "Cover").sum()), int((s == "No Cover").sum()), int((s == "Push").sum()))


def ou(s: pd.Series) -> Graded:
    s = s.dropna()
    return Graded(int((s == "Over").sum()), int((s == "Under").sum()), int((s == "Push").sum()))


def mean(s: pd.Series) -> float:
    s = pd.to_numeric(s, errors="coerce").dropna()
    return float(s.mean()) if len(s) else np.nan


# ---------------------------------------------------------------------------
# Grouped tables
# ---------------------------------------------------------------------------

def _grouped(df: pd.DataFrame, by, col: str, fn, prefix: str, win_name: str, loss_name: str) -> pd.DataFrame:
    rows = []
    for key, sub in df.groupby(by, observed=True, sort=True):
        r = fn(sub[col])
        rows.append(
            {
                **(dict(zip(by, key)) if isinstance(by, list) else {by: key}),
                f"{prefix}{win_name}": r.win,
                f"{prefix}{loss_name}": r.loss,
                f"{prefix}push": r.push,
                f"{prefix}n": r.n,
                f"{prefix}pct": r.pct,
                f"{prefix}push_pct": r.push_pct,
            }
        )
    return pd.DataFrame(rows)


def ats_by(df: pd.DataFrame, by, col: str = "ats", prefix: str = "ats_") -> pd.DataFrame:
    return _grouped(df, by, col, ats, prefix, "cover", "no_cover")


def ou_by(df: pd.DataFrame, by, col: str = "ou_result", prefix: str = "ou_") -> pd.DataFrame:
    return _grouped(df, by, col, ou, prefix, "over", "under")


def su_by(df: pd.DataFrame, by, col: str = "su", prefix: str = "su_") -> pd.DataFrame:
    rows = []
    for key, sub in df.groupby(by, observed=True, sort=True):
        r = su(sub[col])
        rows.append(
            {
                **(dict(zip(by, key)) if isinstance(by, list) else {by: key}),
                f"{prefix}w": r.w,
                f"{prefix}l": r.l,
                f"{prefix}t": r.t,
                f"{prefix}n": r.n,
                f"{prefix}pct": r.pct,
            }
        )
    return pd.DataFrame(rows)


def season_trends(g: pd.DataFrame, key: str = "season") -> pd.DataFrame:
    """League-level per-period aggregates used across the Overview page."""
    rows = []
    for k, s in g.groupby(key, sort=True):
        not_neutral = s[~s["neutral_site"]]
        home = su(not_neutral["home_su"])
        fav = su(s["fav_su"])
        fav_ats = ats(s["fav_ats"])
        home_ats = ats(s["home_ats"])
        o = ou(s["ou_result"])
        decided = s[s["result"] != 0]
        rows.append(
            {
                key: k,
                "games": len(s),
                "avg_total": s["total_pts"].mean(),
                "avg_home_pts": s["home_score"].mean(),
                "avg_away_pts": s["away_score"].mean(),
                "avg_team_pts": (s["home_score"].mean() + s["away_score"].mean()) / 2,
                "home_win_pct": home.pct,
                "away_win_pct": home.l / home.n if home.n else np.nan,
                "home_games": home.n,
                "fav_win_pct": fav.pct,
                "dog_win_pct": fav.l / fav.n if fav.n else np.nan,
                "fav_games": fav.n,
                "fav_cover_pct": fav_ats.pct,
                "dog_cover_pct": fav_ats.loss_pct,
                "home_cover_pct": home_ats.pct,
                "away_cover_pct": home_ats.loss_pct,
                "ats_push_pct": home_ats.push_pct,
                "ats_graded": home_ats.decisive,
                "avg_fav_line": s["fav_line"].mean(),
                "avg_home_spread": s["spread_line"].mean(),
                "avg_total_line": s["total_line"].mean(),
                "over_pct": o.pct,
                "ou_graded": o.decisive,
                "avg_win_margin": decided["abs_margin"].mean(),
            }
        )
    return pd.DataFrame(rows)


def team_table(tg: pd.DataFrame) -> pd.DataFrame:
    """One row per team with SU / ATS / O-U summary."""
    rows = []
    for team, s in tg.groupby("team", sort=True):
        r_su, r_ats, r_ou = su(s["su"]), ats(s["ats"]), ou(s["ou_result"])
        rows.append(
            {
                "team": team,
                "games": len(s),
                "su_record": r_su.record,
                "win_pct": r_su.pct,
                "ppg": s["pts_for"].mean(),
                "papg": s["pts_against"].mean(),
                "diff": s["margin"].mean(),
                "ats_record": r_ats.record,
                "cover_pct": r_ats.pct,
                "ats_cover": r_ats.win,
                "ats_no_cover": r_ats.loss,
                "ats_push": r_ats.push,
                "avg_ats_margin": s["ats_margin"].mean(),
                "ou_record": r_ou.record,
                "over_pct": r_ou.pct,
                "avg_line": s["team_line"].mean(),
                "avg_total_line": s["total_line"].mean(),
            }
        )
    return pd.DataFrame(rows)


def team_profile(tg_team: pd.DataFrame) -> dict:
    """Summary for one team's perspective rows."""
    s = tg_team
    out = {
        "games": len(s),
        "su": su(s["su"]),
        "ats": ats(s["ats"]),
        "ou": ou(s["ou_result"]),
        "ppg": mean(s["pts_for"]),
        "papg": mean(s["pts_against"]),
        "diff": mean(s["margin"]),
        "avg_line": mean(s["team_line"]),
        "avg_total_line": mean(s["total_line"]),
        "avg_ats_margin": mean(s["ats_margin"]),
    }
    for v in ("Home", "Away", "Neutral"):
        sub = s[s["venue"] == v]
        out[f"venue_{v}"] = (su(sub["su"]), ats(sub["ats"]), len(sub))
    for r in ("Favorite", "Underdog", "Pick'em"):
        sub = s[s["role"] == r]
        out[f"role_{r}"] = (su(sub["su"]), ats(sub["ats"]), len(sub))
    return out


def split_table(tg_team: pd.DataFrame, by: str) -> pd.DataFrame:
    rows = []
    for k, sub in tg_team.groupby(by, sort=False):
        r_su, r_ats, r_ou = su(sub["su"]), ats(sub["ats"]), ou(sub["ou_result"])
        rows.append(
            {
                by: k,
                "games": len(sub),
                "su_record": r_su.record,
                "win_pct": r_su.pct,
                "ats_record": r_ats.record,
                "cover_pct": r_ats.pct,
                "ou_record": r_ou.record,
                "over_pct": r_ou.pct,
                "ppg": sub["pts_for"].mean(),
                "papg": sub["pts_against"].mean(),
                "diff": sub["margin"].mean(),
                "avg_line": sub["team_line"].mean(),
            }
        )
    return pd.DataFrame(rows)


def calibration(g: pd.DataFrame, bins: int = 10) -> pd.DataFrame:
    """Favorite no-vig implied probability vs. realized SU win rate, by bucket."""
    d = g[g["fav_side"].notna() & g["home_imp"].notna()].copy()
    d["fav_imp"] = np.where(d["fav_side"] == "home", d["home_imp"], d["away_imp"])
    edges = np.linspace(0.5, 1.0, bins + 1)
    d["bucket"] = pd.cut(d["fav_imp"], edges, include_lowest=True)
    rows = []
    for b, s in d.groupby("bucket", observed=True):
        r = su(s["fav_su"])
        rows.append(
            {
                "bucket": f"{b.left:.0%}–{b.right:.0%}",
                "mid": (b.left + b.right) / 2,
                "games": r.n,
                "avg_implied": s["fav_imp"].mean(),
                "actual_win_pct": r.pct,
            }
        )
    return pd.DataFrame(rows)
