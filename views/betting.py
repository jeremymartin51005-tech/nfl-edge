from __future__ import annotations

import numpy as np
import pandas as pd
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.cleaning import SPREAD_LABELS, TOTAL_LABELS
from nfl_edge.ui import charts as C
from nfl_edge.ui import theme as T
from nfl_edge.ui.components import (
    KPI, csv_button, data_table, empty_state, kpi_grid, note, num, page_header, pct, pct_cols, section,
)
from nfl_edge.ui.filters import get_context

MARKETS = ["Against the spread", "Over / Under", "Favorite vs. Underdog"]
PCTF = lambda label: st.column_config.NumberColumn(label, format="%.1f%%")  # noqa: E731


def render() -> None:
    ctx = get_context()
    page_header("Betting Trends", "How games settled against the closing spread and closing total.", ctx)
    if ctx.games.empty:
        return empty_state()
    market = st.segmented_control("Market", MARKETS, default=MARKETS[0], key="bet_market",
                                  label_visibility="collapsed") or MARKETS[0]
    {MARKETS[0]: _ats, MARKETS[1]: _totals, MARKETS[2]: _fav_dog}[market](ctx)


# ---------------------------------------------------------------------------
def _ats(ctx) -> None:
    g, tg = ctx.games, ctx.team_games
    note("<b>How spreads are settled.</b> Closing spreads are graded from each side's perspective: "
         "<b>ATS margin = team margin + team line</b> (line in sportsbook notation, negative when favored). "
         "Positive = <b>cover</b>, negative = <b>no cover</b>, exactly zero = <b>push</b>. "
         "Cover % = covers ÷ (covers + non-covers); pushes are excluded from the denominator and shown as push % of all graded games. "
         "Because every graded game produces one cover and one non-cover, league-wide splits (home/away, favorite/underdog) are mirror images.")

    home = m.ats(g["home_ats"])
    fav = m.ats(g["fav_ats"])
    kpi_grid([
        KPI("Games graded", f"{home.n:,}", f"{home.push} pushes", "Completed games with a closing spread."),
        KPI("Home ATS", home.record, f"Cover {pct(home.pct)}", "Home team Cover-NoCover-Push.", T.BLUE),
        KPI("Away cover %", pct(home.loss_pct), f"{home.loss}-{home.win}-{home.push}", "Away team cover rate.", T.ORANGE),
        KPI("Favorite cover %", pct(fav.pct), fav.record, "Favorite Cover-NoCover-Push.", T.BLUE),
        KPI("Underdog cover %", pct(fav.loss_pct), f"{fav.loss}-{fav.win}-{fav.push}", "Underdog cover rate.", T.ORANGE),
        KPI("Push %", pct(home.push_pct), "Of graded games", "Final margin landed exactly on the spread."),
        KPI("Avg miss vs. spread", num((g["result"] - g["spread_line"]).abs().mean()),
            "Mean |margin − spread|", "Average absolute distance between the final margin and the closing spread."),
    ])

    key = ctx.trend_key
    xt = key.title()
    by = m.ats_by(g, key, col="home_ats")
    fav_by = m.ats_by(g, key, col="fav_ats", prefix="fav_")
    by = by.merge(fav_by, on=key)
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.outcome_stack(by, key, [("ats_cover", "Home cover", T.BLUE), ("ats_push", "Push", T.GRAY),
                                         ("ats_no_cover", "Away cover", T.ORANGE)],
                               "ATS results by " + key + " (home perspective)", x_title=xt))
    with c2:
        by["dog_pct"] = 1 - by["fav_pct"]
        C.show(C.trend(by, key, [("fav_pct", "Favorite cover %", T.BLUE), ("dog_pct", "Underdog cover %", T.ORANGE)],
                       "Favorite vs. underdog ATS by " + key, kind="pct", x_title=xt, n_col="fav_n", ref=0.5))

    # Situational: venue x role
    sit = tg[(tg["venue"] != "Neutral") & tg["role"].isin(["Favorite", "Underdog"])].copy()
    sit["situation"] = sit["venue"] + " " + sit["role"].str.lower()
    sit_t = m.ats_by(sit, "situation")
    sit_t = sit_t.set_index("situation").reindex(["Home favorite", "Home underdog", "Away favorite", "Away underdog"]).reset_index()
    sit_t["rec"] = sit_t.apply(lambda r: f"{int(r.ats_cover)}-{int(r.ats_no_cover)}-{int(r.ats_push)}", axis=1)

    bucket = _spread_bucket_table(g)
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.bars(bucket, "spread_bucket", [("fav_cover_pct", "Favorite", T.BLUE), ("dog_cover_pct", "Underdog", T.ORANGE)],
                      "ATS cover % by closing spread range", kind="pct", x_title="Favorite's closing spread (points)",
                      n_col="graded", ref=0.5))
    with c2:
        C.show(C.bars(sit_t, "situation", [("ats_pct", "Cover %", T.BLUE)], "ATS cover % by venue & role",
                      kind="pct", n_col="ats_n", hover_extra="rec", ref=0.5))
    data_table(pct_cols(bucket, ["fav_su_pct", "fav_cover_pct", "dog_cover_pct", "push_pct"]), {
        "spread_bucket": "Spread range", "games": "Games", "graded": "Graded (excl. push)",
        "fav_su_pct": PCTF("Fav SU win %"), "fav_cover_pct": PCTF("Fav cover %"), "dog_cover_pct": PCTF("Dog cover %"),
        "push_pct": PCTF("Push %"), "fav_record": "Fav ATS (C-N-P)",
        "avg_fav_margin": st.column_config.NumberColumn("Avg fav margin", format="%+.1f"),
    })

    section("ATS performance by team", "Each team's games from its own perspective (home or away)",
            "A team's ATS margin = its margin + its own line, so home and away games are graded correctly.")
    tt = m.team_table(tg)
    c1, c2 = st.columns([1, 1.15])
    with c1:
        tt["graded"] = tt["ats_cover"] + tt["ats_no_cover"]
        C.show(C.diverging_team_bars(tt, "team", "cover_pct", "Cover % by team (centered at 50%)", "graded",
                                     rec_col="ats_record"), height=700)
    with c2:
        show = tt[["team", "games", "ats_record", "cover_pct", "avg_ats_margin", "su_record", "win_pct", "avg_line"]]
        show = pct_cols(show.sort_values("cover_pct", ascending=False), ["cover_pct", "win_pct"])
        data_table(show, {
            "team": "Team", "games": "G", "ats_record": "ATS (C-N-P)", "cover_pct": PCTF("Cover %"),
            "avg_ats_margin": st.column_config.NumberColumn("Avg ATS margin", format="%+.1f"),
            "su_record": "SU", "win_pct": PCTF("Win %"),
            "avg_line": st.column_config.NumberColumn("Avg line", format="%+.1f"),
        }, height=640)
        csv_button(show, "nfl_edge_ats_by_team.csv", key="ats_team_csv")

    section("Pushes by closing spread", "Where the final margin landed exactly on the number")
    pu = g.assign(fav_line=g["fav_line"]).groupby("fav_line").agg(
        games=("game_id", "size"), pushes=("home_ats", lambda s: (s == "Push").sum())).reset_index()
    pu = pu[pu["pushes"] > 0]
    pu["push_rate"] = pu["pushes"] / pu["games"]
    if not pu.empty:
        pu["label"] = pu["fav_line"].map(lambda v: f"{v:g}")
        C.show(C.bars(pu, "label", [("push_rate", "Push rate", T.GRAY)], "", kind="pct",
                      x_title="Favorite's closing spread", n_col="games"), height=260)


def _spread_bucket_table(g: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for b in SPREAD_LABELS:
        s = g[g["spread_bucket"] == b]
        a, su = m.ats(s["fav_ats"]), m.su(s["fav_su"])
        rows.append({
            "spread_bucket": b, "games": len(s), "graded": a.decisive, "fav_su_pct": su.pct,
            "fav_cover_pct": a.pct, "dog_cover_pct": a.loss_pct, "push_pct": a.push_pct,
            "fav_record": a.record, "avg_fav_margin": s["fav_margin"].mean(),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
def _totals(ctx) -> None:
    g, tg = ctx.games, ctx.team_games
    note("<b>How totals are settled.</b> Combined points (home + away) are compared with the closing total. "
         "Above = <b>over</b>, below = <b>under</b>, exactly equal = <b>push</b>. "
         "Over % = overs ÷ (overs + unders); pushes are reported separately.")
    o = m.ou(g["ou_result"])
    diff = g["total_pts"] - g["total_line"]
    kpi_grid([
        KPI("Games graded", f"{o.n:,}", f"{o.push} pushes", "Completed games with a closing total."),
        KPI("Over %", pct(o.pct), f"{o.win} overs", "Overs ÷ (overs + unders).", T.BLUE),
        KPI("Under %", pct(o.loss_pct), f"{o.loss} unders", "Unders ÷ (overs + unders).", T.ORANGE),
        KPI("Push %", pct(o.push_pct), "Of graded games", "Combined points exactly equal to the total."),
        KPI("Avg closing total", num(g["total_line"].mean()), f"Median {num(g['total_line'].median())}",
            "Average closing over/under line."),
        KPI("Avg combined points", num(g["total_pts"].mean()), f"Median {num(g['total_pts'].median(), 0)}",
            "Average home + away score."),
        KPI("Avg actual − total", num(diff.mean(), 1, True), f"Mean |miss| {num(diff.abs().mean())}",
            "Positive means games averaged more points than the closing total."),
    ])

    key = ctx.trend_key
    xt = key.title()
    by = m.ou_by(g, key)
    lines = g.groupby(key).agg(avg_line=("total_line", "mean"), avg_pts=("total_pts", "mean"),
                               games=("game_id", "size")).reset_index()
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.trend(lines, key, [("avg_line", "Avg closing total", T.ORANGE), ("avg_pts", "Avg combined points", T.BLUE)],
                       "Closing total vs. actual combined points", y_title="Points", x_title=xt, n_col="games"))
    with c2:
        C.show(C.outcome_stack(by, key, [("ou_over", "Over", T.BLUE), ("ou_push", "Push", T.GRAY),
                                         ("ou_under", "Under", T.ORANGE)], "Over / under results by " + key, x_title=xt))

    tb = m.ou_by(g, "total_bucket")
    tb["total_bucket"] = pd.Categorical(tb["total_bucket"], TOTAL_LABELS, ordered=True)
    tb = tb.sort_values("total_bucket")
    avg = g.groupby("total_bucket", observed=True).agg(avg_line=("total_line", "mean"), avg_pts=("total_pts", "mean")).reset_index()
    tb = tb.merge(avg, on="total_bucket")
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.bars(tb, "total_bucket", [("ou_pct", "Over %", T.BLUE)], "Over % by closing-total range",
                      kind="pct", x_title="Closing total", n_col="ou_n", ref=0.5))
    with c2:
        sc = g.assign(label=g["matchup"] + " · " + g["season"].astype(str) + " Wk " + g["week"].astype(str))
        C.show(C.scatter_line_vs_actual(sc, "total_line", "total_pts", "ou_result",
                                        {"Over": T.BLUE, "Under": T.ORANGE, "Push": T.TEXT_2},
                                        "Closing total vs. actual combined points", "Closing total",
                                        "Combined points", "label"))
    data_table(pct_cols(tb, ["ou_pct", "ou_push_pct"]), {
        "total_bucket": "Closing total", "ou_over": "Over", "ou_under": "Under", "ou_push": "Push", "ou_n": "Games",
        "ou_pct": PCTF("Over %"), "ou_push_pct": PCTF("Push %"),
        "avg_line": st.column_config.NumberColumn("Avg total", format="%.1f"),
        "avg_pts": st.column_config.NumberColumn("Avg points", format="%.1f"),
    })

    section("Over / under by team", "All games involving each team")
    tt = m.team_table(tg)
    ou_t = m.ou_by(tg, "team")
    tt = tt.merge(ou_t[["team", "ou_over", "ou_under"]], on="team")
    tt["graded"] = tt["ou_over"] + tt["ou_under"]
    tm = tg.groupby("team").agg(avg_pts=("total_pts", "mean")).reset_index()
    tt = tt.merge(tm, on="team")
    c1, c2 = st.columns([1, 1.15])
    with c1:
        C.show(C.diverging_team_bars(tt, "team", "over_pct", "Over % by team (centered at 50%)", "graded",
                                     rec_col="ou_record"), height=700)
    with c2:
        show = pct_cols(tt[["team", "games", "ou_record", "over_pct", "avg_total_line", "avg_pts"]]
                        .sort_values("over_pct", ascending=False), ["over_pct"])
        data_table(show, {
            "team": "Team", "games": "G", "ou_record": "O-U-P", "over_pct": PCTF("Over %"),
            "avg_total_line": st.column_config.NumberColumn("Avg total", format="%.1f"),
            "avg_pts": st.column_config.NumberColumn("Avg combined pts", format="%.1f"),
        }, height=640)
        csv_button(show, "nfl_edge_ou_by_team.csv", key="ou_team_csv")


# ---------------------------------------------------------------------------
def _fav_dog(ctx) -> None:
    g = ctx.games[ctx.games["fav_side"].notna()]
    if g.empty:
        return empty_state()
    note("<b>Straight up (SU)</b> = who won the game outright. <b>Against the spread (ATS)</b> = whether the final margin "
         "beat the closing spread. A favorite can win SU and still fail to cover ATS. "
         "The favorite is the side the closing spread favors (moneyline breaks a pick'em).")
    su, a = m.su(g["fav_su"]), m.ats(g["fav_ats"])
    wins = g[g["fav_su"] == "W"]
    kpi_grid([
        KPI("Favorite SU win %", pct(su.pct), su.record, "Favorite outright wins ÷ games with a favorite.", T.BLUE),
        KPI("Underdog SU win %", pct(su.l / su.n if su.n else np.nan), f"{su.l} outright upsets",
            "Underdog outright wins ÷ games with a favorite.", T.ORANGE),
        KPI("Favorite ATS %", pct(a.pct), a.record, "Favorite covers ÷ (covers + non-covers).", T.BLUE),
        KPI("Underdog ATS %", pct(a.loss_pct), f"{a.loss}-{a.win}-{a.push}", "Underdog covers ÷ (covers + non-covers).", T.ORANGE),
        KPI("Avg favorite margin", num(g["fav_margin"].mean(), 1, True), "All games, incl. losses",
            "Favorite score − underdog score, averaged over every game."),
        KPI("Avg fav. margin of victory", num(wins["fav_margin"].mean()), f"{len(wins)} favorite wins",
            "Average margin in games the favorite won."),
        KPI("Avg closing spread", num(g["fav_line"].mean()), f"Median {num(g['fav_line'].median())}",
            "Average number of points the favorite was laying."),
    ])

    bucket = _spread_bucket_table(g)
    c1, c2 = st.columns(2)
    with c1:
        C.show(C.bars(bucket, "spread_bucket", [("fav_su_pct", "Favorite SU win %", T.BLUE),
                                                ("fav_cover_pct", "Favorite ATS cover %", T.AQUA)],
                      "Favorites: winning vs. covering by spread size", kind="pct",
                      x_title="Favorite's closing spread (points)", n_col="games", ref=0.5))
    with c2:
        key = ctx.trend_key
        tr = m.season_trends(g, key)
        C.show(C.trend(tr, key, [("fav_win_pct", "Favorite SU win %", T.BLUE), ("fav_cover_pct", "Favorite ATS cover %", T.AQUA),
                                 ("dog_cover_pct", "Underdog ATS cover %", T.ORANGE)],
                       "Favorite / underdog by " + key, kind="pct", x_title=key.title(), n_col="fav_games", ref=0.5))

    section("By exact closing spread", "Spreads with at least 15 games in the selection",
            "Each point is one closing spread value. Thin samples are hidden to avoid misleading rates.")
    ex = g.groupby("fav_line").apply(lambda s: pd.Series({
        "games": len(s), "su_pct": m.su(s["fav_su"]).pct, "ats_pct": m.ats(s["fav_ats"]).pct,
        "avg_margin": s["fav_margin"].mean(),
    }), include_groups=False).reset_index()
    ex = ex[ex["games"] >= 15]
    if not ex.empty:
        ex["spread"] = ex["fav_line"].map(lambda v: f"{v:g}")
        ex["games"] = ex["games"].astype(int)
        C.show(C.trend(ex, "spread", [("su_pct", "Favorite SU win %", T.BLUE), ("ats_pct", "Favorite ATS cover %", T.AQUA)],
                       "", kind="pct", x_title="Favorite's closing spread", n_col="games", ref=0.5), height=300)

    data_table(pct_cols(bucket, ["fav_su_pct", "fav_cover_pct", "dog_cover_pct", "push_pct"]), {
        "spread_bucket": "Spread range", "games": "Games", "graded": "ATS graded (excl. push)",
        "fav_su_pct": PCTF("Fav SU win %"), "fav_cover_pct": PCTF("Fav cover %"), "dog_cover_pct": PCTF("Dog cover %"),
        "push_pct": PCTF("Push %"), "fav_record": "Fav ATS (C-N-P)",
        "avg_fav_margin": st.column_config.NumberColumn("Avg fav margin", format="%+.1f"),
    })
