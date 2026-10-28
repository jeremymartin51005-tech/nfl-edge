from __future__ import annotations

import pandas as pd
import streamlit as st

from nfl_edge.loader import SOURCE_URL, describe_files
from nfl_edge.ui.components import KPI, csv_button, data_table, esc, kpi_grid, note, page_header, section
from nfl_edge.ui.filters import get_context

DICTIONARY = [
    ("spread_line", "Source", "Closing spread as points the HOME team is expected to win by. Positive = home favored "
     "(e.g. 3.5 means home −3.5)."),
    ("home_spread", "Derived", "Home team's closing spread in sportsbook notation (= −spread_line). Negative = favored."),
    ("team_line", "Derived", "A team's own closing spread in sportsbook notation, used for team-perspective ATS."),
    ("result", "Source", "Home score − away score."),
    ("total_line", "Source", "Closing over/under total for combined points."),
    ("total_pts", "Derived", "Home score + away score."),
    ("home_ml / away_ml", "Source", "Closing American moneyline odds. −150 = risk 150 to win 100; +130 = risk 100 to win 130."),
    ("*_spread_odds, over/under_odds", "Source", "Closing prices (juice) on each side of the spread and total."),
    ("favorite / underdog", "Derived", "Side favored by the closing spread; a 0 spread (pick'em) uses the shorter moneyline."),
    ("fav_line", "Derived", "Points the favorite was laying (absolute closing spread)."),
    ("home_ats / fav_ats", "Derived", "Cover if margin + line > 0, Push if = 0, No Cover if < 0, from that side's perspective."),
    ("ats_winner", "Derived", "Team that covered the closing spread, or PUSH."),
    ("ou_result", "Derived", "Over if total_pts > total_line, Under if <, Push if equal."),
    ("home_imp / away_imp", "Derived", "Moneyline implied win probability with the vig removed proportionally."),
    ("ml_hold / spread_hold / total_hold", "Derived", "Bookmaker margin: sum of both sides' implied probabilities − 1."),
    ("neutral_site", "Derived", "True when location = Neutral. Designated home team retained; excluded from home-field rates."),
    ("spread_bucket / total_bucket", "Derived", "Ranges used for grouping: spread Pick–3, 3.5–6.5, 7–10, 10.5+; "
     "totals ≤40, 40.5–43.5, 44–46.5, 47–49.5, 50+."),
]

BETTING_COLS = ["spread_line", "home_spread_odds", "away_spread_odds", "total_line", "over_odds", "under_odds",
                "home_moneyline", "away_moneyline"]


def render() -> None:
    ctx = get_context()
    page_header("Data Explorer", "What is in the dataset, how it was cleaned, and what it cannot tell us.", ctx)
    rep, raw = ctx.report, ctx.raw
    scope = raw[raw["season"] >= 2020]

    kpi_grid([
        KPI("Source rows", f"{rep.raw_rows:,}", f"Seasons {rep.raw_seasons[0]}–{rep.raw_seasons[1]} in file"),
        KPI("Rows 2020+", f"{rep.in_scope_rows:,}", "Includes scheduled games"),
        KPI("Completed games", f"{rep.completed_games:,}", f"{rep.unplayed_excluded} unplayed excluded"),
        KPI("Games in filter", f"{ctx.n:,}", ctx.period),
        KPI("Seasons covered", f"{ctx.all_games['season'].nunique()}",
            f"{ctx.all_games['season'].min()}–{ctx.all_games['season'].max()}"),
        KPI("Duplicates", f"{rep.duplicate_game_ids + rep.duplicate_matchups}", "game_id + date/matchup checks"),
        KPI("Sportsbooks", "1", "Consensus line; book not identified"),
        KPI("Markets", "3", "Spread · Total · Moneyline (closing)"),
    ])

    section("Data-quality notes")
    note("<br>".join(f"• {esc(w)}" for w in rep.warnings), "warn")

    c1, c2 = st.columns([1, 1.4])
    with c1:
        section("Files")
        files = describe_files()
        data_table(pd.DataFrame([{
            "file": f.path.name, "rows": f.rows, "columns": f.columns, "size_kb": round(f.size_kb),
            "modified": f.modified.strftime("%Y-%m-%d %H:%M"),
        } for f in files]), {"size_kb": "Size (KB)"})
        st.caption(f"Source: nflverse/nfldata `games.csv` — {SOURCE_URL}. Refresh with `python scripts/fetch_data.py`.")

        section("Betting markets", "Coverage among completed 2020+ games")
        done = scope[scope["home_score"].notna()]
        data_table(pd.DataFrame([
            {"market": "Point spread", "columns": "spread_line, home/away_spread_odds",
             "games_with_line": int(done["spread_line"].notna().sum()), "snapshot": "Closing"},
            {"market": "Total (over/under)", "columns": "total_line, over/under_odds",
             "games_with_line": int(done["total_line"].notna().sum()), "snapshot": "Closing"},
            {"market": "Moneyline", "columns": "home/away_moneyline",
             "games_with_line": int(done["home_moneyline"].notna().sum()), "snapshot": "Closing"},
        ]), {"games_with_line": "Games with line"})
        st.caption("Not available: opening lines, line timestamps, per-sportsbook prices, player props, team box-score stats.")

    with c2:
        section("Columns & missing values", "Source file, 2020+ rows (completed games / all rows)")
        done = scope[scope["home_score"].notna()]
        cols = pd.DataFrame({
            "column": scope.columns,
            "dtype": [str(t) for t in scope.dtypes],
            "missing_completed": done.isna().sum().values,
            "missing_all": scope.isna().sum().values,
            "example": [next((str(v) for v in done[c].dropna().head(1)), "") for c in scope.columns],
        })
        cols["market"] = cols["column"].isin(BETTING_COLS).map({True: "betting", False: ""})
        data_table(cols, {"missing_completed": "Missing (completed)", "missing_all": "Missing (all 2020+)"}, height=470)

    section("Data dictionary", "Key fields and conventions")
    data_table(pd.DataFrame(DICTIONARY, columns=["field", "type", "definition"]),
               {"definition": st.column_config.TextColumn("Definition", width="large")})

    section("Underlying records", "Cleaned games after global filters; search any text field")
    q = st.text_input("Search records", placeholder="e.g. KC, Mahomes, Lambeau, 2023_22", key="dx_q",
                      label_visibility="collapsed")
    show_cols = st.multiselect("Columns", list(ctx.games.columns), key="dx_cols", default=[
        "game_id", "date", "season", "week", "game_type", "away_team", "away_score", "home_team", "home_score",
        "result", "spread_line", "home_spread", "favorite", "fav_line", "home_ats", "fav_ats", "total_line",
        "total_pts", "ou_result", "home_ml", "away_ml", "neutral_site"])
    d = ctx.games
    if q:
        hay = d.astype(str).agg(" ".join, axis=1).str.lower()
        d = d[hay.str.contains(q.lower(), regex=False)]
    d = d[show_cols or list(ctx.games.columns)]
    data_table(d, {"date": st.column_config.DateColumn("date", format="YYYY-MM-DD")}, height=420)
    csv_button(d, "nfl_edge_records.csv", key="dx_csv")
