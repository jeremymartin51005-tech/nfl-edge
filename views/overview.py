from __future__ import annotations

import pandas as pd
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.ui import charts as C
from nfl_edge.ui import theme as T
from nfl_edge.ui.components import KPI, empty_state, insights, kpi_grid, num, page_header, pct, section
from nfl_edge.ui.filters import get_context


def render() -> None:
    ctx = get_context()
    page_header("Overview", "How NFL scoring and closing-line outcomes have changed since 2020.", ctx)
    g, tg = ctx.games, ctx.team_games
    if g.empty:
        return empty_state()

    home = m.su(g.loc[~g["neutral_site"], "home_su"])
    fav = m.su(g["fav_su"])
    fav_ats = m.ats(g["fav_ats"])
    decided = g[g["result"] != 0]
    team_ppg = tg.groupby("team")["pts_for"].agg(["mean", "size"]).sort_values("mean", ascending=False)
    top_team = team_ppg.index[0]
    by_season = g.groupby("season")["total_pts"].mean()
    seasons = sorted(g["season"].unique())

    kpi_grid([
        KPI("Games analyzed", f"{len(g):,}", ctx.period, "Completed games matching the global filters. "
            "Scheduled games without a final score are never included."),
        KPI("Seasons covered", f"{len(seasons)}", f"{seasons[0]}–{seasons[-1]}" if len(seasons) > 1 else str(seasons[0]),
            "Distinct NFL seasons in the filtered sample. A season spans Sep–Feb."),
        KPI("Home win %", pct(home.pct), f"{home.record} · {home.n:,} games",
            "Home-team wins ÷ games played. Neutral-site games are excluded; ties count as games, not wins.",
            T.BLUE),
        KPI("Favorite win %", pct(fav.pct), f"{fav.record} straight up",
            "Games won outright by the closing-spread favorite ÷ games with an identifiable favorite.",
            T.BLUE),
        KPI("Favorite ATS cover %", pct(fav_ats.pct), f"{fav_ats.record} · push {pct(fav_ats.push_pct)}",
            "Favorite covers ÷ (covers + non-covers). Pushes are excluded from the denominator. "
            "Every graded game has exactly one ATS winner, so the underdog rate is 1 minus this.",
            T.GREEN if fav_ats.pct >= 0.5 else T.RED),
        KPI("Avg game total", num(g["total_pts"].mean()), f"Closing total avg {num(g['total_line'].mean())}",
            "Average of home score + away score (actual points). The sub-line shows the average closing total."),
        KPI("Avg winning margin", num(decided["abs_margin"].mean()),
            f"Median {num(decided['abs_margin'].median(), 0)} · ties excluded",
            "Average absolute point differential in games with a winner."),
        KPI("Highest-scoring team", f"{top_team}", f"{num(team_ppg['mean'].iloc[0])} ppg · "
            f"top season {by_season.idxmax()} ({num(by_season.max())} pts/g)",
            "Team with the most points per game in the filtered games; top season by average combined points."),
    ])

    _insights(g, ctx)

    key = ctx.trend_key
    xt = "Week" if key == "week" else "Season"
    tr = m.season_trends(g, key)

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.trend(tr, key, [("avg_total", "Actual combined pts", T.BLUE),
                                  ("avg_total_line", "Avg closing total", T.ORANGE)],
                       "Scoring trend: actual points vs. closing total", y_title="Points per game",
                       x_title=xt, n_col="games"))
    with c2:
        C.show(C.trend(tr, key, [("avg_home_pts", "Home team", T.BLUE), ("avg_away_pts", "Away team", T.ORANGE)],
                       "Average points scored per team", y_title="Points", x_title=xt, n_col="games"))

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.bars(tr, key, [("home_win_pct", "Home", T.BLUE), ("away_win_pct", "Away", T.ORANGE)],
                      "Home vs. away straight-up win %", kind="pct", x_title=xt, n_col="home_games",
                      ref=0.5, text=key == "season"))
    with c2:
        C.show(C.bars(tr, key, [("fav_win_pct", "Favorite", T.BLUE), ("dog_win_pct", "Underdog", T.ORANGE)],
                      "Favorite vs. underdog straight-up win %", kind="pct", x_title=xt, n_col="fav_games",
                      ref=0.5, text=key == "season"))

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.trend(tr, key, [("fav_cover_pct", "Favorite ATS", T.BLUE), ("home_cover_pct", "Home ATS", T.AQUA)],
                       "ATS cover % (pushes excluded)", kind="pct", x_title=xt, n_col="ats_graded",
                       ref=0.5, ref_label="50%"))
    with c2:
        C.show(C.trend(tr, key, [("avg_fav_line", "Avg favorite spread", T.BLUE),
                                  ("avg_home_spread", "Avg home-team line (+ = home favored)", T.AQUA)],
                       "Average closing point spread", y_title="Points", x_title=xt, n_col="games"))

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.trend(tr, key, [("avg_total_line", "Avg closing total", T.BLUE)],
                       "Average closing game total", y_title="Points", x_title=xt, n_col="games"))
    with c2:
        C.show(C.trend(tr, key, [("over_pct", "Over %", T.BLUE)], "Over % (pushes excluded)",
                       kind="pct", x_title=xt, n_col="ou_graded", ref=0.5, ref_label="50%"))

    section("Distribution of final scoring margins",
            "Absolute winning margin; key numbers 3 and 7 highlighted",
            "Count of games by final absolute margin (ties at 0). Orange bars mark 3, 7 and 10, the most common NFL margins.")
    C.show(C.histogram(g["abs_margin"], "", "Final margin (points)", highlight=(3, 7, 10), x_range=(-0.5, 45.5)),
           height=300)


def _insights(g: pd.DataFrame, ctx) -> None:
    tr = m.season_trends(g, "season")
    items = []
    if len(tr) > 1:
        a, b = tr.iloc[0], tr.iloc[-1]
        hi = tr.loc[tr["avg_total"].idxmax()]
        lo = tr.loc[tr["avg_total"].idxmin()]
        items.append(("Scoring", f"Combined points peaked in <b>{int(hi.season)}</b> ({hi.avg_total:.1f}/g) "
                      f"and bottomed in <b>{int(lo.season)}</b> ({lo.avg_total:.1f}/g). "
                      f"{int(a.season)} → {int(b.season)}: {a.avg_total:.1f} → {b.avg_total:.1f}."))
        hw = tr.loc[tr["home_win_pct"].idxmax()]
        lw = tr.loc[tr["home_win_pct"].idxmin()]
        items.append(("Home field", f"Home win % ranged from <b>{lw.home_win_pct:.1%}</b> ({int(lw.season)}) "
                      f"to <b>{hw.home_win_pct:.1%}</b> ({int(hw.season)})."))
        fc = tr.loc[tr["fav_cover_pct"].idxmax()]
        fl = tr.loc[tr["fav_cover_pct"].idxmin()]
        items.append(("Favorites ATS", f"Favorite cover rate ranged from <b>{fl.fav_cover_pct:.1%}</b> "
                      f"({int(fl.season)}) to <b>{fc.fav_cover_pct:.1%}</b> ({int(fc.season)})."))
    km = g["abs_margin"].isin([3, 7]).mean()
    items.append(("Key numbers", f"<b>{km:.1%}</b> of games were decided by exactly 3 or 7 points; "
                  f"<b>{(g['abs_margin'] <= 7).mean():.1%}</b> were one-score games (≤ 7)."))
    o = m.ou(g["ou_result"])
    items.append(("Totals", f"Overs hit <b>{o.pct:.1%}</b> of graded games ({o.record} O-U-P). "
                  f"Actual points averaged <b>{(g['total_pts'] - g['total_line']).mean():+.1f}</b> vs. the closing total."))
    latest = ctx.all_games["season"].max()
    if latest in g["season"].values:
        wk = int(ctx.all_games.loc[ctx.all_games["season"] == latest, "week"].max())
        items.append(("Sample note", f"The <b>{latest}</b> season is in progress (completed through week {wk}); "
                      "its figures rest on a smaller sample."))
    section("What stands out", "Observations from the filtered sample, worth investigating rather than acting on")
    insights(items)
