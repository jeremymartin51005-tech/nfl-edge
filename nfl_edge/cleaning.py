"""Cleaning, validation and derivation of betting outcomes.

Conventions (documented in README and the Data Explorer page):

* ``spread_line`` (nflverse source) is the closing line expressed as the number of
  points the HOME team is expected to win by. Positive => home team favored.
* ``home_spread`` is the same line in sportsbook notation for the home team
  (``-spread_line``): negative => home favored, e.g. KC -3.5.
* ``result`` = home score - away score.
* Home ATS margin = result - spread_line. > 0 cover, = 0 push, < 0 no cover.
* Team ATS margin = team margin + team_line, where team_line is the team's
  sportsbook-notation spread (negative when favored).
* Over/under margin = (home + away) - total_line.
* Favorite = side the closing spread favors; if the spread is exactly 0
  (pick'em) the side with the shorter moneyline is used; otherwise no favorite.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

MIN_SEASON = 2020

GAME_TYPE_LABELS = {
    "REG": "Regular season",
    "WC": "Wild Card",
    "DIV": "Divisional",
    "CON": "Conference",
    "SB": "Super Bowl",
}

SPREAD_BINS = [-0.01, 3.25, 6.75, 10.25, np.inf]
SPREAD_LABELS = ["Pick–3", "3.5–6.5", "7–10", "10.5+"]

TOTAL_BINS = [-np.inf, 40.25, 43.75, 46.75, 49.75, np.inf]
TOTAL_LABELS = ["≤40", "40.5–43.5", "44–46.5", "47–49.5", "50+"]


@dataclass
class CleaningReport:
    raw_rows: int = 0
    raw_seasons: tuple[int, int] = (0, 0)
    in_scope_rows: int = 0
    duplicate_game_ids: int = 0
    duplicate_matchups: int = 0
    unplayed_excluded: int = 0
    completed_games: int = 0
    missing_spread: int = 0
    missing_total: int = 0
    missing_moneyline: int = 0
    neutral_site: int = 0
    pickem_games: int = 0
    no_favorite: int = 0
    ties: int = 0
    ats_pushes: int = 0
    ou_pushes: int = 0
    warnings: list[str] = field(default_factory=list)


def american_to_prob(ml: pd.Series) -> pd.Series:
    """Implied probability from American odds (includes the bookmaker's vig)."""
    ml = pd.to_numeric(ml, errors="coerce")
    neg = -ml / (-ml + 100)
    pos = 100 / (ml + 100)
    return pd.Series(np.where(ml < 0, neg, pos), index=ml.index).where(ml.notna())


def _settle(margin: pd.Series, labels: tuple[str, str, str]) -> pd.Series:
    win, push, loss = labels
    out = np.select([margin > 0, margin == 0, margin < 0], [win, push, loss], default=None)
    return pd.Series(out, index=margin.index, dtype="object").where(margin.notna())


def _su(margin: pd.Series) -> pd.Series:
    return _settle(margin, ("W", "T", "L"))


def build_games(raw: pd.DataFrame, min_season: int = MIN_SEASON) -> tuple[pd.DataFrame, CleaningReport]:
    rep = CleaningReport(
        raw_rows=len(raw),
        raw_seasons=(int(raw["season"].min()), int(raw["season"].max())),
    )
    df = raw[raw["season"] >= min_season].copy()
    rep.in_scope_rows = len(df)

    rep.duplicate_game_ids = int(df["game_id"].duplicated().sum())
    df = df.drop_duplicates("game_id", keep="first")
    key = ["gameday", "home_team", "away_team"]
    rep.duplicate_matchups = int(df.duplicated(key).sum())
    df = df.drop_duplicates(key, keep="first")

    played = df["home_score"].notna() & df["away_score"].notna()
    rep.unplayed_excluded = int((~played).sum())
    df = df[played].copy()
    rep.completed_games = len(df)

    g = pd.DataFrame(
        {
            "game_id": df["game_id"],
            "season": df["season"].astype(int),
            "game_type": df["game_type"],
            "game_type_label": df["game_type"].map(GAME_TYPE_LABELS),
            "is_postseason": df["game_type"] != "REG",
            "week": df["week"].astype(int),
            "date": pd.to_datetime(df["gameday"]),
            "weekday": df["weekday"],
            "kickoff": df["gametime"],
            "home_team": df["home_team"],
            "away_team": df["away_team"],
            "home_score": df["home_score"].astype(int),
            "away_score": df["away_score"].astype(int),
            "neutral_site": df["location"].eq("Neutral"),
            "overtime": df["overtime"].fillna(0).astype(int).astype(bool),
            "spread_line": pd.to_numeric(df["spread_line"], errors="coerce"),
            "total_line": pd.to_numeric(df["total_line"], errors="coerce"),
            "home_ml": pd.to_numeric(df["home_moneyline"], errors="coerce"),
            "away_ml": pd.to_numeric(df["away_moneyline"], errors="coerce"),
            "home_spread_odds": pd.to_numeric(df["home_spread_odds"], errors="coerce"),
            "away_spread_odds": pd.to_numeric(df["away_spread_odds"], errors="coerce"),
            "over_odds": pd.to_numeric(df["over_odds"], errors="coerce"),
            "under_odds": pd.to_numeric(df["under_odds"], errors="coerce"),
            "div_game": df["div_game"].fillna(0).astype(bool),
            "roof": df["roof"],
            "surface": df["surface"],
            "temp": df["temp"],
            "wind": df["wind"],
            "stadium": df["stadium"],
            "home_qb": df["home_qb_name"],
            "away_qb": df["away_qb_name"],
            "home_coach": df["home_coach"],
            "away_coach": df["away_coach"],
            "referee": df["referee"],
        }
    )

    g["result"] = g["home_score"] - g["away_score"]
    g["total_pts"] = g["home_score"] + g["away_score"]
    g["abs_margin"] = g["result"].abs()
    g["winner"] = np.select(
        [g["result"] > 0, g["result"] < 0], [g["home_team"], g["away_team"]], default="TIE"
    )
    g["home_su"] = _su(g["result"])
    g["home_spread"] = -g["spread_line"]

    # --- Favorite identification ---------------------------------------------
    sl = g["spread_line"]
    fav_side = np.select(
        [
            sl > 0,
            sl < 0,
            (sl == 0) & (g["home_ml"] < g["away_ml"]),
            (sl == 0) & (g["away_ml"] < g["home_ml"]),
        ],
        ["home", "away", "home", "away"],
        default=None,
    )
    g["fav_side"] = pd.Series(fav_side, index=g.index, dtype="object")
    g["fav_basis"] = np.where(
        sl.isna() | g["fav_side"].isna(), None, np.where(sl == 0, "moneyline", "spread")
    )
    is_home_fav = g["fav_side"].eq("home")
    has_fav = g["fav_side"].notna()
    g["favorite"] = np.where(is_home_fav, g["home_team"], g["away_team"])
    g["underdog"] = np.where(is_home_fav, g["away_team"], g["home_team"])
    g.loc[~has_fav, ["favorite", "underdog"]] = None
    g["fav_line"] = sl.abs().where(has_fav)
    g["fav_margin"] = np.where(is_home_fav, g["result"], -g["result"])
    g["fav_margin"] = g["fav_margin"].where(has_fav)
    g["fav_su"] = _su(g["fav_margin"])
    g["fav_ats_margin"] = g["fav_margin"] - g["fav_line"]
    g["fav_ats"] = _settle(g["fav_ats_margin"], ("Cover", "Push", "No Cover"))
    g["fav_ml"] = np.where(is_home_fav, g["home_ml"], g["away_ml"])
    g["dog_ml"] = np.where(is_home_fav, g["away_ml"], g["home_ml"])
    g.loc[~has_fav, ["fav_ml", "dog_ml"]] = np.nan

    # --- ATS (home perspective) ----------------------------------------------
    g["home_ats_margin"] = g["result"] - g["spread_line"]
    g["home_ats"] = _settle(g["home_ats_margin"], ("Cover", "Push", "No Cover"))
    g["ats_winner"] = np.select(
        [g["home_ats_margin"] > 0, g["home_ats_margin"] < 0],
        [g["home_team"], g["away_team"]],
        default=None,
    )
    g.loc[g["home_ats_margin"] == 0, "ats_winner"] = "PUSH"
    g.loc[g["home_ats_margin"].isna(), "ats_winner"] = None

    # --- Totals --------------------------------------------------------------
    g["ou_margin"] = g["total_pts"] - g["total_line"]
    g["ou_result"] = _settle(g["ou_margin"], ("Over", "Push", "Under"))

    # --- Moneyline implied probabilities ------------------------------------
    hp, ap = american_to_prob(g["home_ml"]), american_to_prob(g["away_ml"])
    g["home_imp_raw"], g["away_imp_raw"] = hp, ap
    g["ml_hold"] = hp + ap - 1
    g["home_imp"] = hp / (hp + ap)  # vig removed (proportional normalization)
    g["away_imp"] = ap / (hp + ap)
    g["spread_hold"] = (
        american_to_prob(g["home_spread_odds"]) + american_to_prob(g["away_spread_odds"]) - 1
    )
    g["total_hold"] = american_to_prob(g["over_odds"]) + american_to_prob(g["under_odds"]) - 1

    # --- Buckets --------------------------------------------------------------
    g["spread_bucket"] = pd.cut(g["fav_line"], SPREAD_BINS, labels=SPREAD_LABELS)
    g["total_bucket"] = pd.cut(g["total_line"], TOTAL_BINS, labels=TOTAL_LABELS)

    g["matchup"] = g["away_team"] + " @ " + g["home_team"]
    g = g.sort_values(["date", "game_id"]).reset_index(drop=True)

    # --- Report --------------------------------------------------------------
    rep.missing_spread = int(g["spread_line"].isna().sum())
    rep.missing_total = int(g["total_line"].isna().sum())
    rep.missing_moneyline = int((g["home_ml"].isna() | g["away_ml"].isna()).sum())
    rep.neutral_site = int(g["neutral_site"].sum())
    rep.pickem_games = int((g["spread_line"] == 0).sum())
    rep.no_favorite = int((~has_fav).sum())
    rep.ties = int((g["result"] == 0).sum())
    rep.ats_pushes = int((g["home_ats"] == "Push").sum())
    rep.ou_pushes = int((g["ou_result"] == "Push").sum())
    rep.warnings = _warnings(rep, g)
    return g, rep


def _warnings(rep: CleaningReport, g: pd.DataFrame) -> list[str]:
    w = [
        "Lines are a single consensus closing snapshot per game. No opening lines, "
        "timestamps, or sportsbook identities are present, so line movement and "
        "book-to-book comparisons cannot be calculated.",
    ]
    if rep.unplayed_excluded:
        w.append(
            f"{rep.unplayed_excluded} scheduled games without final scores were excluded "
            "(future games are never shown)."
        )
    if rep.neutral_site:
        w.append(
            f"{rep.neutral_site} games were played at a neutral site (international games, "
            "Super Bowls). The listed home team is the designated home team; these games "
            "are excluded from home-field win rates and labelled 'Neutral' in team splits."
        )
    if rep.ties:
        w.append(f"{rep.ties} games ended in a tie. Ties count as games played (not wins).")
    if rep.duplicate_game_ids or rep.duplicate_matchups:
        w.append(
            f"Removed {rep.duplicate_game_ids} duplicate game IDs and "
            f"{rep.duplicate_matchups} duplicate date/matchup rows."
        )
    else:
        w.append("No duplicate games found (checked game_id and date + home + away).")
    if rep.missing_spread or rep.missing_total or rep.missing_moneyline:
        w.append(
            f"Missing lines among completed games — spread: {rep.missing_spread}, "
            f"total: {rep.missing_total}, moneyline: {rep.missing_moneyline}. "
            "Games missing a line are excluded from that market's statistics only."
        )
    hold = g.groupby("season")["ml_hold"].mean()
    if len(hold) > 1 and hold.max() - hold.min() > 0.01:
        jump = hold.diff().idxmax()
        w.append(
            f"Average moneyline hold shifts from {hold[hold.index < jump].mean():.1%} before {jump} to "
            f"{hold[hold.index >= jump].mean():.1%} from {jump} on. This step change most likely reflects a "
            "change in the source's odds provider, so compare prices and hold across that boundary with care. "
            "Spreads and totals are unaffected as lines."
        )
    temp_missing = int(g["temp"].isna().sum())
    if temp_missing:
        w.append(
            f"Weather (temp/wind) is missing for {temp_missing} games, mostly domes and "
            "recent seasons; weather is not used in any statistic."
        )
    return w


def build_team_games(g: pd.DataFrame) -> pd.DataFrame:
    """Two rows per game: one from each team's perspective."""
    common = [
        "game_id", "season", "week", "date", "game_type", "game_type_label",
        "is_postseason", "neutral_site", "total_line", "total_pts", "ou_result",
        "ou_margin", "spread_line", "matchup", "div_game", "overtime",
    ]
    frames = []
    for side, other, sign in (("home", "away", 1), ("away", "home", -1)):
        t = g[common].copy()
        t["team"] = g[f"{side}_team"]
        t["opponent"] = g[f"{other}_team"]
        t["is_home"] = side == "home"
        t["venue"] = np.where(g["neutral_site"], "Neutral", side.capitalize())
        t["pts_for"] = g[f"{side}_score"]
        t["pts_against"] = g[f"{other}_score"]
        t["margin"] = t["pts_for"] - t["pts_against"]
        t["su"] = _su(t["margin"])
        # sportsbook notation: negative when favored
        t["team_line"] = -sign * g["spread_line"]
        t["role"] = np.select(
            [g["favorite"] == t["team"], g["underdog"] == t["team"]],
            ["Favorite", "Underdog"],
            default="Pick'em",
        )
        t.loc[g["spread_line"].isna(), "role"] = None
        t["ats_margin"] = t["margin"] + t["team_line"]
        t["ats"] = _settle(t["ats_margin"], ("Cover", "Push", "No Cover"))
        t["ml"] = g[f"{side}_ml"]
        t["imp_prob"] = g[f"{side}_imp"]
        t["spread_bucket"] = g["spread_bucket"]
        t["total_bucket"] = g["total_bucket"]
        frames.append(t)
    return pd.concat(frames, ignore_index=True).sort_values(["date", "game_id", "is_home"])
