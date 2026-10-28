from __future__ import annotations

import pandas as pd
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.ui import charts as C
from nfl_edge.ui import theme as T
from nfl_edge.ui.components import (
    KPI, PCT, csv_button, data_table, empty_state, kpi_grid, line, note, num, page_header, pct,
    pct_cols, section, team_selector,
)
from nfl_edge.ui.filters import get_context

DISCLAIMER = ("Historical records describe what happened under past rosters, coaches and schedules. "
              "They do not predict or guarantee future results.")


def render() -> None:
    ctx = get_context()
    page_header("Team Analytics", "Straight-up, against-the-spread and totals performance from each team's perspective.", ctx)
    if ctx.scope_games.empty:
        return empty_state()
    tab1, tab2 = st.tabs(["Team profile", "Compare two teams"])
    with tab1:
        _profile(ctx)
    with tab2:
        _compare(ctx)


def _season_scope(ctx, key: str) -> pd.DataFrame:
    seasons = sorted(ctx.scope_games["season"].unique())
    opts = ["All filtered seasons"] + [str(s) for s in reversed(seasons)]
    pick = st.selectbox("Season", opts, key=key, help="Narrows within the global season filter.")
    tg = ctx.scope_team_games
    return tg if pick == opts[0] else tg[tg["season"] == int(pick)]


def _profile(ctx) -> None:
    c1, c2, _ = st.columns([1, 1, 3])
    with c1:
        team = team_selector(ctx, "Team", "team_pick", default=ctx.team or "KC")
    with c2:
        tg_scope = _season_scope(ctx, "team_season")
    tg = tg_scope[tg_scope["team"] == team]
    if tg.empty:
        return empty_state(f"{team} has no games in this selection.")

    p = m.team_profile(tg)
    su, ats, ou = p["su"], p["ats"], p["ou"]
    kpi_grid([
        KPI("Record", su.record, f"{p['games']} games", "Straight-up wins-losses(-ties)."),
        KPI("Win %", pct(su.pct), "Wins ÷ games played", "Ties count as games played, not wins.",
            T.GREEN if su.pct >= 0.5 else T.RED),
        KPI("Points / game", num(p["ppg"]), f"Allowed {num(p['papg'])}", "Average points scored and allowed."),
        KPI("Avg differential", num(p["diff"], 1, True), "Team score − opponent score",
            "Average scoring margin from this team's perspective.", T.GREEN if p["diff"] >= 0 else T.RED),
        KPI("ATS record", ats.record, f"Cover {pct(ats.pct)} · push {pct(ats.push_pct)}",
            "Cover-NoCover-Push against the closing spread. Cover % excludes pushes.",
            T.GREEN if ats.pct >= 0.5 else T.RED),
        KPI("Avg ATS margin", num(p["avg_ats_margin"], 1, True), "Margin + team line",
            "Average amount by which the team beat (+) or missed (−) the closing spread."),
        KPI("Over / Under", ou.record, f"Over {pct(ou.pct)} of graded",
            "Over-Under-Push in this team's games versus the closing total."),
        KPI("Avg closing spread", line(round(p["avg_line"], 1)), f"Avg closing total {num(p['avg_total_line'])}",
            "Team's average closing spread in sportsbook notation (negative = favored)."),
    ])
    note(DISCLAIMER)

    # Splits
    venue = m.split_table(tg, "venue")
    role = m.split_table(tg[tg["role"].notna()], "role")
    order_v = {"Home": 0, "Away": 1, "Neutral": 2}
    venue = venue.sort_values("venue", key=lambda s: s.map(order_v))
    role = role.sort_values("role")

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.bars(venue, "venue", [("win_pct", "Win %", T.BLUE), ("cover_pct", "ATS cover %", T.AQUA)],
                      f"{team}: home vs. away", kind="pct", n_col="games", ref=0.5), height=300)
    with c2:
        C.show(C.bars(role, "role", [("win_pct", "Win %", T.BLUE), ("cover_pct", "ATS cover %", T.AQUA)],
                      f"{team}: as favorite vs. underdog", kind="pct", n_col="games", ref=0.5), height=300)

    split = pd.concat([venue.rename(columns={"venue": "split"}), role.rename(columns={"role": "split"})])
    data_table(pct_cols(split, ["win_pct", "cover_pct", "over_pct"]), {
        "split": "Split", "games": "G", "su_record": "SU", "win_pct": st.column_config.NumberColumn("Win %", format="%.1f%%"),
        "ats_record": "ATS (C-N-P)", "cover_pct": st.column_config.NumberColumn("Cover %", format="%.1f%%"),
        "ou_record": "O-U-P", "over_pct": st.column_config.NumberColumn("Over %", format="%.1f%%"),
        "ppg": st.column_config.NumberColumn("PF/G", format="%.1f"),
        "papg": st.column_config.NumberColumn("PA/G", format="%.1f"),
        "diff": st.column_config.NumberColumn("Diff", format="%+.1f"),
        "avg_line": st.column_config.NumberColumn("Avg line", format="%+.1f"),
    })

    # Trends
    single = tg["season"].nunique() == 1
    key = "week" if single else "season"
    by = tg.groupby(key).agg(games=("game_id", "size"), ppg=("pts_for", "mean"), papg=("pts_against", "mean")).reset_index()
    ats_s = m.ats_by(tg, key)
    ou_s = m.ou_by(tg, key)

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.trend(by, key, [("ppg", "Points scored", T.BLUE), ("papg", "Points allowed", T.ORANGE)],
                       f"{team} scoring by {key}", y_title="Points" + ("" if single else " per game"),
                       x_title=key.title(), n_col="games"))
    with c2:
        C.show(C.outcome_stack(ats_s, key, [("ats_cover", "Cover", T.GREEN), ("ats_push", "Push", T.GRAY),
                                            ("ats_no_cover", "No cover", T.RED)],
                               f"{team} ATS results by {key}", x_title=key.title(), pct=not single))
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.outcome_stack(ou_s, key, [("ou_over", "Over", T.BLUE), ("ou_push", "Push", T.GRAY),
                                           ("ou_under", "Under", T.ORANGE)],
                               f"{team} over/under results by {key}", x_title=key.title(), pct=not single))
    with c2:
        tl = tg.groupby(key).agg(avg_line=("team_line", "mean"), avg_ats=("ats_margin", "mean"),
                                 games=("game_id", "size")).reset_index()
        C.show(C.trend(tl, key, [("avg_line", "Avg closing spread", T.BLUE), ("avg_ats", "Avg ATS margin", T.AQUA)],
                       f"{team} closing spread & ATS margin", y_title="Points (negative spread = favored)",
                       x_title=key.title(), n_col="games", ref=0))

    section("Season-by-season", "Each row is one season from the team's perspective")
    seasons = m.split_table(tg.sort_values("season", ascending=False), "season")
    data_table(pct_cols(seasons, ["win_pct", "cover_pct", "over_pct"]), {
        "season": st.column_config.NumberColumn("Season", format="%d"), "games": "G", "su_record": "SU",
        "win_pct": st.column_config.NumberColumn("Win %", format="%.1f%%"), "ats_record": "ATS (C-N-P)",
        "cover_pct": st.column_config.NumberColumn("Cover %", format="%.1f%%"), "ou_record": "O-U-P",
        "over_pct": st.column_config.NumberColumn("Over %", format="%.1f%%"),
        "ppg": st.column_config.NumberColumn("PF/G", format="%.1f"),
        "papg": st.column_config.NumberColumn("PA/G", format="%.1f"),
        "diff": st.column_config.NumberColumn("Diff", format="%+.1f"),
        "avg_line": st.column_config.NumberColumn("Avg line", format="%+.1f"),
    })

    section("Game log", "Most recent first")
    log = tg.sort_values("date", ascending=False)[[
        "date", "season", "week", "venue", "opponent", "pts_for", "pts_against", "su", "team_line", "role",
        "ats", "ats_margin", "total_line", "total_pts", "ou_result", "ml",
    ]]
    data_table(log, {
        "date": st.column_config.DateColumn("Date", format="YYYY-MM-DD"), "season": st.column_config.NumberColumn("Season", format="%d"),
        "week": "Wk", "venue": "Venue", "opponent": "Opp", "pts_for": "PF", "pts_against": "PA", "su": "SU",
        "team_line": st.column_config.NumberColumn("Line", format="%+.1f"), "role": "Role", "ats": "ATS",
        "ats_margin": st.column_config.NumberColumn("ATS margin", format="%+.1f"),
        "total_line": st.column_config.NumberColumn("Total", format="%.1f"), "total_pts": "Pts", "ou_result": "O/U",
        "ml": st.column_config.NumberColumn("ML", format="%+d"),
    }, height=320)
    csv_button(log, f"nfl_edge_{team}_games.csv", key="team_log_csv")


def _compare(ctx) -> None:
    c1, c2, c3, _ = st.columns([1, 1, 1, 2])
    with c1:
        a = team_selector(ctx, "Team A", "cmp_a", default=ctx.team or "KC")
    with c2:
        b = team_selector(ctx, "Team B", "cmp_b", default="BUF" if a != "BUF" else "PHI", exclude=a)
    with c3:
        tg_scope = _season_scope(ctx, "cmp_season")
    ta, tb = tg_scope[tg_scope["team"] == a], tg_scope[tg_scope["team"] == b]
    if ta.empty or tb.empty:
        return empty_state("One of the selected teams has no games in this selection.")
    pa, pb = m.team_profile(ta), m.team_profile(tb)

    def venue_pct(p, k, which):
        s, at, n = p[k]
        return pct(s.pct if which == "su" else at.pct) + f"  ({n})"

    rows = [
        {"Metric": "Games", a: f"{pa['games']}", b: f"{pb['games']}"},
        {"Metric": "Record (SU)", a: pa["su"].record, b: pb["su"].record},
        {"Metric": "Win %", a: pct(pa["su"].pct), b: pct(pb["su"].pct)},
        {"Metric": "Points / game", a: num(pa["ppg"]), b: num(pb["ppg"])},
        {"Metric": "Points allowed / game", a: num(pa["papg"]), b: num(pb["papg"])},
        {"Metric": "Avg differential", a: num(pa["diff"], 1, True), b: num(pb["diff"], 1, True)},
        {"Metric": "ATS record (C-N-P)", a: pa["ats"].record, b: pb["ats"].record},
        {"Metric": "ATS cover %", a: pct(pa["ats"].pct), b: pct(pb["ats"].pct)},
        {"Metric": "Avg ATS margin", a: num(pa["avg_ats_margin"], 1, True), b: num(pb["avg_ats_margin"], 1, True)},
        {"Metric": "Over-Under-Push", a: pa["ou"].record, b: pb["ou"].record},
        {"Metric": "Over %", a: pct(pa["ou"].pct), b: pct(pb["ou"].pct)},
        {"Metric": "Avg closing spread", a: line(round(pa["avg_line"], 1)), b: line(round(pb["avg_line"], 1))},
        {"Metric": "Avg closing total", a: num(pa["avg_total_line"]), b: num(pb["avg_total_line"])},
        {"Metric": "Home win % (games)", a: venue_pct(pa, "venue_Home", "su"), b: venue_pct(pb, "venue_Home", "su")},
        {"Metric": "Away win % (games)", a: venue_pct(pa, "venue_Away", "su"), b: venue_pct(pb, "venue_Away", "su")},
        {"Metric": "Win % as favorite (games)", a: venue_pct(pa, "role_Favorite", "su"), b: venue_pct(pb, "role_Favorite", "su")},
        {"Metric": "Win % as underdog (games)", a: venue_pct(pa, "role_Underdog", "su"), b: venue_pct(pb, "role_Underdog", "su")},
        {"Metric": "Cover % as favorite", a: venue_pct(pa, "role_Favorite", "ats"), b: venue_pct(pb, "role_Favorite", "ats")},
        {"Metric": "Cover % as underdog", a: venue_pct(pa, "role_Underdog", "ats"), b: venue_pct(pb, "role_Underdog", "ats")},
    ]

    c1, c2 = st.columns([1, 1.25])
    with c1:
        section(f"{a} vs. {b}", "Side-by-side, same filters")
        data_table(pd.DataFrame(rows), height=36 * (len(rows) + 1) + 4)
    with c2:
        comp = pd.DataFrame({
            "metric": ["Win %", "ATS cover %", "Over %", "Win % as fav.", "Win % as dog"],
            a: [pa["su"].pct, pa["ats"].pct, pa["ou"].pct, pa["role_Favorite"][0].pct, pa["role_Underdog"][0].pct],
            b: [pb["su"].pct, pb["ats"].pct, pb["ou"].pct, pb["role_Favorite"][0].pct, pb["role_Underdog"][0].pct],
        })
        C.show(C.bars(comp, "metric", [(a, a, T.BLUE), (b, b, T.ORANGE)], "Key rates", kind="pct", ref=0.5), height=330)
        both = tg_scope[tg_scope["team"].isin([a, b])]
        cov = m.ats_by(both, ["season", "team"]).pivot(index="season", columns="team", values="ats_pct").reset_index()
        if len(cov) > 1:
            C.show(C.trend(cov, "season", [(a, a, T.BLUE), (b, b, T.ORANGE)], "ATS cover % by season",
                           kind="pct", x_title="Season", ref=0.5), height=300)

    h2h = ta[ta["opponent"] == b]
    if not h2h.empty:
        hs, ha = m.su(h2h["su"]), m.ats(h2h["ats"])
        note(f"<b>Head-to-head ({a} perspective):</b> {hs.record} straight up, {ha.record} ATS, "
             f"avg margin {h2h['margin'].mean():+.1f} across {len(h2h)} meetings in this selection.")
    note(DISCLAIMER)
