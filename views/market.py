from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from nfl_edge import metrics as m
from nfl_edge.ui import charts as C
from nfl_edge.ui import theme as T
from nfl_edge.ui.components import (
    KPI, csv_button, data_table, empty_state, kpi_grid, note, num, page_header, pct, pct_cols, section,
)
from nfl_edge.ui.filters import get_context

PCTF = lambda label: st.column_config.NumberColumn(label, format="%.1f%%")  # noqa: E731


def render() -> None:
    ctx = get_context()
    page_header("Odds & Market Analysis", "How closing lines and prices related to what actually happened.", ctx)
    g, tg = ctx.games, ctx.team_games
    if g.empty:
        return empty_state()

    note("<b>Data limitation.</b> The dataset holds <b>one consensus closing line per game</b> (spread, total, moneyline "
         "and their prices). It has <b>no opening lines, no timestamps and no sportsbook identities</b>. "
         "These analyses are therefore <b>not shown</b>: opening vs. closing spreads/totals, line movement "
         "(overall, by team or by season), moneyline price changes, and sportsbook-to-sportsbook comparisons. "
         "Nothing on this page is estimated or simulated; it describes closing prices only.", "warn")

    spread_err = g["result"] - g["spread_line"]
    total_err = g["total_pts"] - g["total_line"]
    std_juice = (g["home_spread_odds"].eq(-110) & g["away_spread_odds"].eq(-110)).mean()
    kpi_grid([
        KPI("Markets available", "3", "Spread · Total · Moneyline", "Each with closing prices (juice)."),
        KPI("Snapshots", "Closing", "No opening / intraday lines", "Single snapshot per game."),
        KPI("Sportsbooks", "1 consensus", "Book not identified", "Lines are a market consensus, not per-book."),
        KPI("Spread mean abs. error", num(spread_err.abs().mean()), f"Bias {num(spread_err.mean(), 2, True)} (home)",
            "Average |final home margin − closing home spread|. Bias > 0 means home teams beat the line on average."),
        KPI("Total mean abs. error", num(total_err.abs().mean()), f"Bias {num(total_err.mean(), 2, True)}",
            "Average |combined points − closing total|. Bias > 0 means more points than the total on average."),
        KPI("Avg moneyline hold", pct(g["ml_hold"].mean()), f"Spread {pct(g['spread_hold'].mean())} · Total {pct(g['total_hold'].mean())}",
            "Bookmaker margin: sum of both sides' implied probabilities minus 100%."),
        KPI("Standard −110 spreads", pct(std_juice), "Both sides priced −110",
            "Share of games where the closing spread was priced −110 on both sides."),
    ])

    key = ctx.trend_key
    xt = key.title()

    # Closing lines vs. outcomes
    c1, c2 = st.columns(2)
    with c1:
        sc = g.assign(label=g["matchup"] + " · " + g["season"].astype(str) + " Wk " + g["week"].astype(str),
                      res_label=np.select([spread_err > 0, spread_err < 0], ["Home covered", "Away covered"], "Push"))
        C.show(C.scatter_line_vs_actual(
            sc, "spread_line", "result", "res_label",
            {"Home covered": T.BLUE, "Away covered": T.ORANGE, "Push": T.TEXT_2},
            "Closing spread vs. final margin (home perspective)",
            "Closing line: points home expected to win by", "Actual home margin", "label", zero_lines=True), height=380)
    with c2:
        err = g.assign(se=spread_err.abs(), te=total_err.abs()).groupby(key).agg(
            spread_mae=("se", "mean"), total_mae=("te", "mean"), games=("game_id", "size")).reset_index()
        C.show(C.trend(err, key, [("spread_mae", "Spread", T.BLUE), ("total_mae", "Total", T.ORANGE)],
                       "Mean absolute error of closing lines", y_title="Points", x_title=xt, n_col="games"), height=380)

    # Calibration
    section("Moneyline calibration", "Favorite's no-vig implied win probability vs. how often favorites actually won",
            "Implied probability from American odds with the vig removed proportionally. Points near the dotted "
            "diagonal mean closing prices matched realized win rates in this sample.")
    cal = m.calibration(g)
    c1, c2 = st.columns([1.3, 1])
    with c1:
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=[0.5, 1], y=[0.5, 1], mode="lines", line=dict(color=T.MUTED, dash="dot", width=1),
                                 name="Perfect calibration", hoverinfo="skip"))
        fig.add_trace(go.Scatter(
            x=cal["avg_implied"], y=cal["actual_win_pct"], mode="lines+markers", name="Favorites",
            line=dict(color=T.BLUE, width=2),
            marker=dict(size=np.clip(np.sqrt(cal["games"]) * 1.6, 7, 26), color=T.BLUE, line=dict(width=1.5, color=T.SURFACE)),
            customdata=np.stack([cal["bucket"], cal["games"]], axis=-1),
            hovertemplate="Bucket %{customdata[0]}<br>Avg implied: %{x:.1%}<br>Actual win %: %{y:.1%}"
                          "<br>Games: %{customdata[1]}<extra></extra>"))
        fig.update_layout(title="Implied vs. actual favorite win rate")
        fig.update_xaxes(tickformat=".0%", title="Avg no-vig implied probability", showgrid=True, gridcolor=T.GRID)
        fig.update_yaxes(tickformat=".0%", title="Actual win %")
        C.show(fig, height=360)
    with c2:
        t = cal.copy()
        t["diff"] = t["actual_win_pct"] - t["avg_implied"]
        data_table(pct_cols(t[["bucket", "games", "avg_implied", "actual_win_pct", "diff"]],
                            ["avg_implied", "actual_win_pct", "diff"]), {
            "bucket": "Implied prob.", "games": "Games", "avg_implied": PCTF("Avg implied"),
            "actual_win_pct": PCTF("Actual win %"),
            "diff": st.column_config.NumberColumn("Actual − implied", format="%+.1f pp"),
        }, height=360)

    # Hold and prices
    c1, c2 = st.columns(2)
    with c1:
        hold = g.groupby(key).agg(ml=("ml_hold", "mean"), sp=("spread_hold", "mean"), tot=("total_hold", "mean"),
                                  games=("game_id", "size")).reset_index()
        C.show(C.trend(hold, key, [("ml", "Moneyline", T.BLUE), ("sp", "Spread", T.AQUA), ("tot", "Total", T.ORANGE)],
                       "Average bookmaker hold at close", kind="pct1", x_title=xt, n_col="games"))
        st.caption("The step up in 2023 appears in all three markets at once, which points to a change in the "
                   "dataset's odds provider rather than a market shift. See Data Explorer → data-quality notes.")
    with c2:
        prices = pd.concat([g["home_spread_odds"], g["away_spread_odds"]]).dropna().astype(int)
        C.show(C.price_bars(prices, "Closing spread prices (both sides)", highlight=(-110,)))

    c1, c2 = st.columns(2)
    with c1:
        C.show(C.histogram(g["fav_line"], "Distribution of closing spreads", "Favorite's closing spread",
                           highlight=(3, 7), bin_size=0.5))
    with c2:
        C.show(C.histogram(g["total_line"], "Distribution of closing totals", "Closing total", color=T.AQUA, bin_size=1))

    # Team-level market expectation
    section("Results vs. market expectation by team",
            "Actual wins compared with the sum of each game's no-vig implied win probability",
            "Expected wins = sum of the team's closing no-vig moneyline probabilities. This is a description of past "
            "prices, not a forecast.")
    tt = tg.groupby("team").agg(games=("game_id", "size"), wins=("su", lambda s: (s == "W").sum()),
                                ties=("su", lambda s: (s == "T").sum()), exp_wins=("imp_prob", "sum"),
                                avg_imp=("imp_prob", "mean"), avg_ml=("ml", "median"),
                                avg_line=("team_line", "mean")).reset_index()
    tt["wins_over_exp"] = tt["wins"] + 0.5 * tt["ties"] - tt["exp_wins"]
    tt["win_pct"] = tt["wins"] / tt["games"]
    d = tt.sort_values("wins_over_exp")
    fig = go.Figure(go.Bar(
        x=d["team"], y=d["wins_over_exp"], marker=dict(color=[T.GREEN if v >= 0 else T.RED for v in d["wins_over_exp"]], cornerradius=2),
        customdata=np.stack([d["wins"], d["exp_wins"], d["games"]], axis=-1),
        hovertemplate="<b>%{x}</b><br>Actual wins: %{customdata[0]:.0f}<br>Implied wins: %{customdata[1]:.1f}"
                      "<br>Difference: %{y:+.1f}<br>Games: %{customdata[2]:.0f}<extra></extra>"))
    fig.update_layout(title="Actual wins − market-implied wins (ties = ½ win)", showlegend=False)
    fig.update_xaxes(type="category")
    fig.update_yaxes(title="Wins")
    C.show(fig, height=320)
    show = pct_cols(tt.sort_values("wins_over_exp", ascending=False)[
        ["team", "games", "wins", "exp_wins", "wins_over_exp", "win_pct", "avg_imp", "avg_ml", "avg_line"]],
        ["win_pct", "avg_imp"])
    data_table(show, {
        "team": "Team", "games": "G", "wins": "Wins", "exp_wins": st.column_config.NumberColumn("Implied wins", format="%.1f"),
        "wins_over_exp": st.column_config.NumberColumn("Diff", format="%+.1f"), "win_pct": PCTF("Win %"),
        "avg_imp": PCTF("Avg implied win %"), "avg_ml": st.column_config.NumberColumn("Median ML", format="%+.0f"),
        "avg_line": st.column_config.NumberColumn("Avg line", format="%+.1f"),
    }, height=380)
    csv_button(show, "nfl_edge_market_vs_results_by_team.csv", key="mkt_csv")
