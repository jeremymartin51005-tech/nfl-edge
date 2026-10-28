from __future__ import annotations

import pandas as pd
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.ui.components import (
    csv_button, data_table, empty_state, game_detail, note, page_header, pct,
)
from nfl_edge.ui.filters import get_context

ANY = "Any"


def render() -> None:
    ctx = get_context()
    page_header("Game Explorer", "Every completed game with its closing lines and how it settled. Click a row for details.", ctx)
    g = ctx.games
    if g.empty:
        return empty_state()

    teams = sorted(set(g["home_team"]) | set(g["away_team"]))
    with st.container(border=True):
        r1 = st.columns([1.1, 1.1, 1, 1, 1.2, 1.2])
        default_team = ctx.team if ctx.team in teams else ANY
        team = r1[0].selectbox("Team", [ANY] + teams, index=([ANY] + teams).index(default_team), key="gx_team",
                               help="Team perspective for venue, role and ATS filters.")
        opp = r1[1].selectbox("Opponent", [ANY] + [t for t in teams if t != team], key="gx_opp")
        has_team = team != ANY
        venue = r1[2].selectbox("Home / away", [ANY, "Home", "Away", "Neutral"], key="gx_venue", disabled=not has_team,
                                help="Relative to the selected team.")
        role = r1[3].selectbox("Fav / dog", [ANY, "Favorite", "Underdog"], key="gx_role", disabled=not has_team,
                               help="Relative to the selected team (closing spread).")
        ats_opts = [ANY, "Cover", "No Cover", "Push"] if has_team else [ANY, "Favorite covered", "Underdog covered", "Push"]
        ats_pick = r1[4].selectbox("ATS outcome", ats_opts, key=f"gx_ats_{has_team}",
                                   help="Team's result when a team is selected; otherwise which side covered.")
        ou_pick = r1[5].selectbox("Over / under", [ANY, "Over", "Under", "Push"], key="gx_ou")

        r2 = st.columns([1.6, 1.6, 2])
        smax = float(g["fav_line"].max())
        spread = r2[0].slider("Favorite's closing spread", 0.0, smax, (0.0, smax), 0.5, key="gx_spread")
        tmin, tmax = float(g["total_line"].min()), float(g["total_line"].max())
        total = r2[1].slider("Closing total", tmin, tmax, (tmin, tmax), 0.5, key="gx_total")
        q = r2[2].text_input("Search", placeholder="Team, QB, coach, stadium…", key="gx_q")

    d = g.copy()
    if has_team:
        d = d[(d["home_team"] == team) | (d["away_team"] == team)]
        is_home = d["home_team"] == team
        d["team_venue"] = d["neutral_site"].map({True: "Neutral"}).fillna(is_home.map({True: "Home", False: "Away"}))
        d["team_role"] = d["favorite"].eq(team).map({True: "Favorite", False: "Underdog"})
        d["team_ats"] = d["home_ats"].where(is_home, d["home_ats"].map({"Cover": "No Cover", "No Cover": "Cover", "Push": "Push"}))
        if venue != ANY:
            d = d[d["team_venue"] == venue]
        if role != ANY:
            d = d[d["team_role"] == role]
        if ats_pick != ANY:
            d = d[d["team_ats"] == ats_pick]
    elif ats_pick != ANY:
        d = d[d["fav_ats"] == {"Favorite covered": "Cover", "Underdog covered": "No Cover", "Push": "Push"}[ats_pick]]
    if opp != ANY:
        d = d[(d["home_team"] == opp) | (d["away_team"] == opp)]
    if ou_pick != ANY:
        d = d[d["ou_result"] == ou_pick]
    d = d[d["fav_line"].between(*spread) & d["total_line"].between(*total)]
    if q:
        cols = ["home_team", "away_team", "home_qb", "away_qb", "home_coach", "away_coach", "stadium", "referee", "game_id"]
        hay = d[cols].fillna("").astype(str).agg(" ".join, axis=1).str.lower()
        d = d[hay.str.contains(q.lower(), regex=False)]

    d = d.sort_values("date", ascending=False).reset_index(drop=True)
    if d.empty:
        return empty_state("No games match these explorer filters.")

    # Summary line for the filtered set
    if has_team:
        tg = ctx.team_games[(ctx.team_games["team"] == team) & ctx.team_games["game_id"].isin(d["game_id"])]
        su, at = m.su(tg["su"]), m.ats(tg["ats"])
        summary = f"<b>{team}</b> in these games: {su.record} SU ({pct(su.pct)}) · {at.record} ATS ({pct(at.pct)} cover)"
    else:
        at = m.ats(d["fav_ats"])
        summary = f"Favorites in these games: {at.record} ATS ({pct(at.pct)} cover)"
    o = m.ou(d["ou_result"])
    note(f"<b>{len(d):,}</b> games · {summary} · Totals {o.record} O-U-P ({pct(o.pct)} over)")

    cols = ["date", "season", "week", "game_type", "away_team", "away_score", "home_team", "home_score", "winner",
            "home_spread", "favorite", "underdog", "fav_ats", "ats_winner", "total_line", "total_pts", "ou_result",
            "home_ml", "away_ml"]
    if has_team:
        cols[cols.index("fav_ats"):cols.index("fav_ats")] = ["team_venue", "team_role", "team_ats"]
    view = d[cols + ["game_id"]]

    left, right = st.columns([2.7, 1], gap="medium")
    with left:
        ev = data_table(view, {
            "date": st.column_config.DateColumn("Date", format="YYYY-MM-DD"),
            "season": st.column_config.NumberColumn("Season", format="%d"), "week": "Wk", "game_type": "Type",
            "away_team": "Away", "away_score": "A pts", "home_team": "Home", "home_score": "H pts", "winner": "Winner",
            "home_spread": st.column_config.NumberColumn("Home line", format="%+.1f",
                                                         help="Home team's closing spread; negative = home favored"),
            "favorite": "Fav", "underdog": "Dog",
            "team_venue": f"{team} venue", "team_role": f"{team} role", "team_ats": f"{team} ATS",
            "fav_ats": "Fav ATS", "ats_winner": "ATS winner",
            "total_line": st.column_config.NumberColumn("Total", format="%.1f"), "total_pts": "Pts", "ou_result": "O/U",
            "home_ml": st.column_config.NumberColumn("Home ML", format="%+d"),
            "away_ml": st.column_config.NumberColumn("Away ML", format="%+d"),
            "game_id": None,
        }, height=620, on_select="rerun", selection_mode="single-row", key="gx_table")
        export = d.drop(columns=["spread_bucket", "total_bucket"]).copy()
        csv_button(export, "nfl_edge_games_filtered.csv", key="gx_csv")
    with right:
        rows = ev.selection.rows if ev is not None else []
        if rows:
            game = d.iloc[rows[0]]
            game_detail(game, ctx.all_games, ctx.all_team_games)
        else:
            note("Select a row to see the final score, closing lines, settlement and head-to-head context.")
