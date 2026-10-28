"""Global filters: rendered once in the sidebar, read by every page."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd
import streamlit as st

from nfl_edge.cleaning import CleaningReport, build_games, build_team_games
from nfl_edge.loader import read_games

ALL_TEAMS = "All teams"
GAME_TYPES = ["Regular season", "Postseason"]


@st.cache_data(show_spinner="Loading NFL games…")
def load_data() -> tuple[pd.DataFrame, pd.DataFrame, CleaningReport, pd.DataFrame]:
    raw = read_games()
    games, report = build_games(raw)
    team_games = build_team_games(games)
    return games, team_games, report, raw


@dataclass
class Context:
    games: pd.DataFrame          # filtered, one row per game
    team_games: pd.DataFrame     # filtered, two rows per game (team perspective)
    all_games: pd.DataFrame      # unfiltered (2020+ completed)
    all_team_games: pd.DataFrame
    scope_games: pd.DataFrame        # filtered by everything except the team filter
    scope_team_games: pd.DataFrame
    report: CleaningReport
    raw: pd.DataFrame
    seasons: list[int]
    team: str | None
    date_range: tuple[date, date]
    game_types: list[str]
    include_neutral: bool
    teams: list[str]

    @property
    def n(self) -> int:
        return len(self.games)

    @property
    def period(self) -> str:
        if self.games.empty:
            return "—"
        a, b = self.games["date"].min(), self.games["date"].max()
        return f"{a:%b %d, %Y} – {b:%b %d, %Y}"

    @property
    def trend_key(self) -> str:
        """Season-level trends normally; week-level when a single season is selected."""
        return "week" if self.games["season"].nunique() == 1 else "season"


def _defaults(games: pd.DataFrame) -> dict:
    return {
        "f_seasons": (int(games["season"].min()), int(games["season"].max())),
        "f_dates": (games["date"].min().date(), games["date"].max().date()),
        "f_types": GAME_TYPES.copy(),
        "f_team": ALL_TEAMS,
        "f_neutral": True,
    }


def reset_filters() -> None:
    # Widgets are seeded with value=/default= rather than through session state
    # (a range select_slider seeded via session state collapses to one value on
    # rerun), so resetting means dropping the keys.
    for k in FILTER_KEYS:
        st.session_state.pop(k, None)


FILTER_KEYS = ("f_seasons", "f_dates", "f_types", "f_team", "f_neutral")


def render_sidebar() -> None:
    games, *_ = load_data()
    d = _defaults(games)
    all_seasons = sorted(games["season"].unique().tolist())
    teams = [ALL_TEAMS] + sorted(set(games["home_team"]) | set(games["away_team"]))
    dmin, dmax = d["f_dates"]

    with st.sidebar:
        st.markdown(
            '<div style="font-size:.7rem;letter-spacing:.08em;color:#6c727d;'
            'text-transform:uppercase;margin:6px 0 4px">Global filters</div>',
            unsafe_allow_html=True,
        )
        st.select_slider(
            "Seasons", all_seasons, value=d["f_seasons"], key="f_seasons",
            help="Season range to include (a season runs September–February).",
        )
        st.date_input(
            "Date range", value=d["f_dates"], key="f_dates", min_value=dmin, max_value=dmax,
            format="YYYY-MM-DD", help="Applied together with the season filter.",
        )
        st.selectbox(
            "Team", teams, index=0, key="f_team",
            help="Restrict every page to games involving this team. "
                 "Team Analytics also uses it as the default selection.",
        )
        st.pills(
            "Game type", GAME_TYPES, default=d["f_types"], key="f_types", selection_mode="multi",
            help="Regular season and/or postseason (Wild Card through Super Bowl).",
        )
        st.toggle(
            "Include neutral-site games", value=d["f_neutral"], key="f_neutral",
            help="International games and Super Bowls. Even when included, they never count "
                 "toward home-field win rates.",
        )
        st.button("Reset filters", on_click=reset_filters, width="stretch", type="secondary")
        st.markdown(
            '<div style="font-size:.72rem;color:#6c727d;margin-top:14px;line-height:1.45">'
            "Historical analysis only. Past results do not predict or guarantee future outcomes. "
            "No predictions or betting recommendations are made.</div>",
            unsafe_allow_html=True,
        )


@st.cache_data(show_spinner=False)
def _apply(seasons: tuple, d0: date, d1: date, types: tuple, team: str | None, neutral: bool):
    games, team_games, *_ = load_data()
    m = games["season"].isin(seasons) if seasons else pd.Series(True, index=games.index)
    m &= games["date"].dt.date.between(d0, d1)
    want_reg, want_post = "Regular season" in types, "Postseason" in types
    if not want_reg:
        m &= games["is_postseason"]
    if not want_post:
        m &= ~games["is_postseason"]
    if not neutral:
        m &= ~games["neutral_site"]
    if team:
        m &= (games["home_team"] == team) | (games["away_team"] == team)
    g = games[m]
    tg = team_games[team_games["game_id"].isin(g["game_id"])]
    return g, tg


def get_context() -> Context:
    games, team_games, report, raw = load_data()
    ss = st.session_state
    sv = ss.get("f_seasons") or (games["season"].min(), games["season"].max())
    lo, hi = sv if isinstance(sv, (list, tuple)) else (sv, sv)
    seasons = list(range(int(lo), int(hi) + 1))
    dates = ss.get("f_dates") or ()
    dmin, dmax = games["date"].min().date(), games["date"].max().date()
    if isinstance(dates, (list, tuple)) and len(dates) == 2:
        d0, d1 = dates
    elif isinstance(dates, (list, tuple)) and len(dates) == 1:
        d0, d1 = dates[0], dmax
    else:
        d0, d1 = dmin, dmax
    types = list(ss.get("f_types") or GAME_TYPES)
    team = ss.get("f_team")
    team = None if team in (None, ALL_TEAMS) else team
    neutral = bool(ss.get("f_neutral", True))
    args = (tuple(sorted(seasons)), d0, d1, tuple(types))
    g, tg = _apply(*args, team, neutral)
    sg, stg = _apply(*args, None, neutral)
    return Context(
        games=g, team_games=tg, all_games=games, all_team_games=team_games,
        scope_games=sg, scope_team_games=stg,
        report=report, raw=raw,
        seasons=seasons or sorted(games["season"].unique().tolist()),
        team=team, date_range=(d0, d1), game_types=types, include_neutral=neutral,
        teams=sorted(set(games["home_team"]) | set(games["away_team"])),
    )
