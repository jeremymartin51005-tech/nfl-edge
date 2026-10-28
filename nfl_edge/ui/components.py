"""Reusable UI building blocks: headers, chips, KPI cards, tables, panels."""
from __future__ import annotations

import html
from dataclasses import dataclass

import numpy as np
import pandas as pd
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.ui.filters import ALL_TEAMS, GAME_TYPES, Context
from nfl_edge.ui.theme import BLUE, GREEN, ORANGE, RED

# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def pct(x: float, d: int = 1) -> str:
    return "—" if x is None or pd.isna(x) else f"{x * 100:.{d}f}%"


def num(x: float, d: int = 1, signed: bool = False) -> str:
    if x is None or pd.isna(x):
        return "—"
    return f"{x:+.{d}f}" if signed else f"{x:.{d}f}"


def line(x: float) -> str:
    """Sportsbook notation for a spread (negative = favored)."""
    if x is None or pd.isna(x):
        return "—"
    if x == 0:
        return "PK"
    return f"{x:+g}"


def odds(x: float) -> str:
    if x is None or pd.isna(x):
        return "—"
    return f"{int(x):+d}"


def esc(s) -> str:
    return html.escape(str(s))


# ---------------------------------------------------------------------------
# Page chrome
# ---------------------------------------------------------------------------

def tip(text: str) -> str:
    return f'<span class="ne-tip">i<span class="txt">{esc(text)}</span></span>'


def page_header(title: str, subtitle: str, ctx: Context | None = None) -> None:
    st.markdown(f'<div class="ne-head"><h1>{esc(title)}</h1></div>'
                f'<div class="ne-sub">{esc(subtitle)}</div>', unsafe_allow_html=True)
    if ctx is not None:
        filter_chips(ctx)


def filter_chips(ctx: Context) -> None:
    all_seasons = sorted(ctx.all_games["season"].unique())
    seasons = sorted(ctx.seasons)
    if seasons == all_seasons:
        s_txt = f"{all_seasons[0]}–{all_seasons[-1]}"
    elif seasons == list(range(seasons[0], seasons[-1] + 1)) and len(seasons) > 1:
        s_txt = f"{seasons[0]}–{seasons[-1]}"
    else:
        s_txt = ", ".join(map(str, seasons))
    chips = [
        f'<span class="ne-chip n"><b>{ctx.n:,}</b> games</span>',
        f'<span class="ne-chip">Seasons <b>{esc(s_txt)}</b></span>',
        f'<span class="ne-chip">Dates <b>{esc(ctx.period)}</b></span>',
        f'<span class="ne-chip">Team <b>{esc(ctx.team or ALL_TEAMS)}</b></span>',
        f'<span class="ne-chip">Games <b>{esc(" + ".join(ctx.game_types) if len(ctx.game_types) < len(GAME_TYPES) else "Regular + Postseason")}</b></span>',
    ]
    if not ctx.include_neutral:
        chips.append('<span class="ne-chip"><b>Neutral sites excluded</b></span>')
    st.markdown(f'<div class="ne-chips">{"".join(chips)}</div>', unsafe_allow_html=True)


def section(title: str, desc: str = "", help_text: str = "") -> None:
    t = tip(help_text) if help_text else ""
    d = f'<span class="d">{esc(desc)}</span>' if desc else ""
    st.markdown(f'<div class="ne-sec"><span class="t">{esc(title)}</span>{t}{d}</div>',
                unsafe_allow_html=True)


def note(body_html: str, kind: str = "") -> None:
    st.markdown(f'<div class="ne-note {kind}">{body_html}</div>', unsafe_allow_html=True)


def insights(items: list[tuple[str, str]]) -> None:
    cells = "".join(f'<div class="ne-insight"><div class="k">{esc(k)}</div>{v}</div>' for k, v in items)
    st.markdown(f'<div class="ne-insights">{cells}</div>', unsafe_allow_html=True)


def empty_state(msg: str = "No games match the current filters.") -> None:
    note(f"<b>No data.</b> {esc(msg)} Adjust or reset the global filters in the sidebar.", "warn")


# ---------------------------------------------------------------------------
# KPI cards
# ---------------------------------------------------------------------------

@dataclass
class KPI:
    label: str
    value: str
    sub: str = ""
    help: str = ""
    accent: str | None = None


def kpi_grid(items: list[KPI]) -> None:
    cells = []
    for k in items:
        bar = f'<span class="bar" style="background:{k.accent}"></span>' if k.accent else ""
        t = tip(k.help) if k.help else ""
        cells.append(
            f'<div class="ne-kpi">{bar}<div class="lab">{esc(k.label)}{t}</div>'
            f'<div class="val">{esc(k.value)}</div><div class="sub">{k.sub}</div></div>'
        )
    cols = min(len(items), 8)
    st.markdown(f'<div class="ne-kpis" style="--cols:{cols}">{"".join(cells)}</div>', unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Tables & export
# ---------------------------------------------------------------------------

PCT = st.column_config.NumberColumn(format="%.1f%%")


def pct_cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Scale 0-1 fractions to 0-100 for display with a % format."""
    out = df.copy()
    for c in cols:
        if c in out:
            out[c] = out[c] * 100
    return out


def data_table(df: pd.DataFrame, config: dict | None = None, height: int | None = None, **kw):
    return st.dataframe(
        df, hide_index=True, width="stretch", column_config=config or {},
        height=height or "auto", **kw,
    )


def csv_button(df: pd.DataFrame, filename: str, label: str = "Export CSV", key: str | None = None) -> None:
    st.download_button(
        f"⤓  {label} ({len(df):,} rows)", df.to_csv(index=False).encode("utf-8"),
        file_name=filename, mime="text/csv", key=key,
    )


# ---------------------------------------------------------------------------
# Selectors
# ---------------------------------------------------------------------------

def team_selector(ctx: Context, label: str, key: str, default: str | None = None, exclude: str | None = None) -> str:
    options = [t for t in ctx.teams if t != exclude]
    pick = default if default in options else options[0]
    if key in st.session_state and st.session_state[key] not in options:
        del st.session_state[key]
    return st.selectbox(label, options, index=options.index(pick), key=key)


# ---------------------------------------------------------------------------
# Game detail panel
# ---------------------------------------------------------------------------

def _pill(text: str, kind: str) -> str:
    return f'<span class="ne-pill {kind}">{esc(text)}</span>'


def _ats_pill(v) -> str:
    if v is None or pd.isna(v):
        return _pill("No line", "n")
    return _pill(v, {"Cover": "g", "No Cover": "r"}.get(v, "n"))


def _ou_pill(v) -> str:
    if v is None or pd.isna(v):
        return _pill("No line", "n")
    return _pill(v, {"Over": "b", "Under": "b"}.get(v, "n"))


def _kv(rows: list[tuple[str, str]]) -> str:
    return '<div class="ne-kv">' + "".join(
        f'<span class="k">{esc(k)}</span><span class="v">{v}</span>' for k, v in rows
    ) + "</div>"


def game_detail(game: pd.Series, all_games: pd.DataFrame, all_team_games: pd.DataFrame) -> None:
    h, a = game["home_team"], game["away_team"]
    hw, aw = game["result"] > 0, game["result"] < 0
    venue = "Neutral site" if game["neutral_site"] else "Home field"
    ot = " · OT" if game["overtime"] else ""

    fav = game["favorite"]
    fav_line_txt = f"{fav} {line(-game['fav_line'])}" if pd.notna(fav) else "—"
    winner_txt = "Tie" if game["winner"] == "TIE" else game["winner"]

    lines = _kv([
        ("Closing spread", f"{esc(h)} {line(game['home_spread'])}"),
        ("Favorite", esc(fav_line_txt)),
        ("Spread juice (H / A)", f"{odds(game['home_spread_odds'])} / {odds(game['away_spread_odds'])}"),
        ("Closing total", num(game["total_line"])),
        ("Over / Under juice", f"{odds(game['over_odds'])} / {odds(game['under_odds'])}"),
        ("Moneyline (H / A)", f"{odds(game['home_ml'])} / {odds(game['away_ml'])}"),
        ("No-vig win prob (H / A)", f"{pct(game['home_imp'], 0)} / {pct(game['away_imp'], 0)}"),
    ])
    outcome = _kv([
        ("Winner (straight up)", esc(winner_txt)),
        ("Margin", f"{esc(h)} {num(game['result'], 0, signed=True)}"),
        ("Favorite ATS", f"{_ats_pill(game['fav_ats'])} ({num(game['fav_ats_margin'], 1, True)})"),
        (f"{h} ATS", _ats_pill(game["home_ats"])),
        ("Combined points", f"{int(game['total_pts'])}"),
        ("Total result", f"{_ou_pill(game['ou_result'])} ({num(game['ou_margin'], 1, True)})"),
    ])

    # Context: head-to-head since 2020 and season-to-date entering the game
    h2h = all_games[
        ((all_games["home_team"] == h) & (all_games["away_team"] == a))
        | ((all_games["home_team"] == a) & (all_games["away_team"] == h))
    ]
    h2h_team = all_team_games[(all_team_games["game_id"].isin(h2h["game_id"])) & (all_team_games["team"] == h)]
    h_su, h_ats = m.su(h2h_team["su"]), m.ats(h2h_team["ats"])
    o = m.ou(h2h["ou_result"])

    def entering(team: str) -> str:
        prior = all_team_games[
            (all_team_games["team"] == team)
            & (all_team_games["season"] == game["season"])
            & (all_team_games["date"] < game["date"])
        ]
        if prior.empty:
            return "First game of season"
        return f"{m.su(prior['su']).record} SU · {m.ats(prior['ats']).record} ATS"

    context = _kv([
        (f"H2H since 2020 ({esc(h)} view)", f"{h_su.record} SU · {h_ats.record} ATS"),
        ("H2H totals (O-U-P)", o.record),
        ("H2H avg combined pts", num(h2h["total_pts"].mean())),
        (f"{h} entering game", entering(h)),
        (f"{a} entering game", entering(a)),
    ])

    st.markdown(
        f'''<div class="ne-panel">
        <div class="meta">{game["season"]} · Week {game["week"]} · {esc(game["game_type_label"])} · {game["date"]:%a %b %d, %Y}</div>
        <div class="ne-score">
          <span class="tm {'w' if aw else ''}">{esc(a)} <span style="color:#6c727d;font-size:.8rem">away</span></span><span class="pts {'w' if aw else ''}">{game["away_score"]}</span>
          <span class="tm {'w' if hw else ''}">{esc(h)} <span style="color:#6c727d;font-size:.8rem">home</span></span><span class="pts {'w' if hw else ''}">{game["home_score"]}</span>
        </div>
        <div class="meta" style="margin-bottom:8px">{esc(venue)}{ot} · {esc(game["stadium"] if pd.notna(game["stadium"]) else "")}</div>
        <div class="ne-hr"></div><div class="meta" style="margin-bottom:6px">Closing lines</div>{lines}
        <div class="ne-hr"></div><div class="meta" style="margin-bottom:6px">Outcome</div>{outcome}
        <div class="ne-hr"></div><div class="meta" style="margin-bottom:6px">Historical context</div>{context}
        </div>''',
        unsafe_allow_html=True,
    )


ATS_COLORS = {"Cover": GREEN, "No Cover": RED, "Push": "#5b616b"}
OU_COLORS = {"Over": BLUE, "Under": ORANGE, "Push": "#5b616b"}
