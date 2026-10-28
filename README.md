# NFL EDGE: Historical Betting Analytics

An interactive dashboard for exploring NFL results and closing betting lines from the **2020 season onward**.
It describes what happened and is **not** a prediction tool. It does not model outcomes, generate odds or recommend bets.

Built with Python, Streamlit, Pandas and Plotly.

## Quick start

```bash
pip install -r requirements.txt
python scripts/fetch_data.py      # optional: refresh data/raw/games.csv to the latest results
streamlit run app.py              # http://localhost:8501
```

Run the tests (settlement logic, independent recomputation against the raw CSV, headless render of every page):

```bash
python -m pytest tests -q
```

## Data

| | |
|---|---|
| Source | [nflverse/nfldata `games.csv`](https://github.com/nflverse/nfldata) (`data/raw/games.csv`) |
| Scope used | Seasons 2020+, completed games only (1,800 games through 2026 Week 7 at the time of writing) |
| Results | Final scores, overtime, game type (REG / WC / DIV / CON / SB), neutral-site flag |
| Markets | **Closing** point spread, total and moneyline, plus the price (juice) on each side |
| Sportsbooks | One consensus line per game; the book is not identified |
| Not available | Opening lines, line timestamps, per-sportsbook prices, team box-score statistics |

Because only closing lines exist, the dashboard **does not show** line movement, opening vs. closing comparisons,
moneyline price changes or sportsbook comparisons. The Odds & Market page states this explicitly rather than estimating them.

Cleaning, which is reported live on the Data Explorer page:
- Scheduled games without a final score are dropped, so future games never appear.
- Duplicates are checked by `game_id` and by date + home + away. None were found.
- Neutral-site games keep the designated home team. They are excluded from home-field win rates and labelled *Neutral* in team splits. A sidebar toggle excludes them entirely.
- Games missing a given line are excluded from that market's statistics only. There are currently none.
- Average vig steps up in 2023 in every market at once (about 2.8% to about 4.3% on moneylines). That most likely reflects a change of odds provider in the source, so the dashboard flags it.

## Conventions

**Spread sign.** The source column `spread_line` is the number of points the **home team** is expected to win by
(positive means home favored). In tables, spreads use **sportsbook notation**: `home_spread = −spread_line`, and a team's
`team_line` is negative when favored (e.g. KC −3.5).

**Favorite.** The favorite is the side the closing spread favors. A spread of exactly 0 (pick'em) falls back to the shorter moneyline.

## Metric definitions

| Metric | Definition |
|---|---|
| Win % | Wins ÷ games played. Ties stay in the denominator and are not wins. |
| Home win % | Home wins ÷ home games played, excluding neutral sites. |
| Favorite win % | Favorite outright (straight-up) wins ÷ games with an identifiable favorite. |
| ATS margin | Team margin + team line. Above 0 is a **cover**, 0 is a **push**, below 0 is **no cover**. Home and away games are graded from the team's own side. |
| ATS cover % | Covers ÷ (covers + non-covers). Pushes are excluded from the denominator and reported separately as push % of graded games. |
| Over % | Overs ÷ (overs + unders), where combined points are compared with the closing total. Pushes are reported separately. |
| Avg combined points | Mean of home score + away score. |
| Avg scoring margin | Home score − away score at league level; team score − opponent score in team views. |
| Avg winning margin | Mean absolute margin in games that had a winner. |
| Implied probability | From American odds: `-ml/(-ml+100)` for favorites, `100/(ml+100)` for underdogs. *No-vig* values divide each side by the sum of both. |
| Hold | Sum of both sides' implied probabilities − 1, i.e. the bookmaker margin. |
| Mean abs. error | Mean of \|actual − closing line\| for the spread (home margin) or the total (combined points). |

Every graded game produces exactly one ATS cover and one non-cover. League-wide splits such as home vs. away or favorite vs. underdog are therefore mirror images, and a team-perspective "overall" cover rate is always 50%.

Spread ranges (favorite's closing spread): **Pick–3, 3.5–6.5, 7–10, 10.5+**.
Total ranges: **≤40, 40.5–43.5, 44–46.5, 47–49.5, 50+**.

## Pages

1. **Overview**: KPIs, scoring and line trends by season (by week when a single season is selected), home/away and favorite/underdog win rates, ATS and over rates, the margin distribution, and auto-generated observations.
2. **Team Analytics**: a team profile (SU / ATS / O-U records, splits by venue and role, season table, game log) and a side-by-side comparison of two teams with head-to-head results.
3. **Betting Trends**: three market views. Against the spread (by season, spread range, venue × role, team, push frequency), Over/Under (by season, total range, team, closing total vs. actual scatter) and Favorite vs. Underdog (straight-up vs. ATS by spread size and season).
4. **Game Explorer**: a sortable table with filters for team, opponent, home/away, favorite/underdog, ATS and O/U outcomes, spread and total ranges, plus free-text search. Clicking a row opens a detail panel with lines, settlement, head-to-head history and each team's record entering the game. Results export to CSV.
5. **Odds & Market**: closing-line accuracy, moneyline calibration, bookmaker hold, price and line distributions, and actual wins vs. market-implied wins by team. Unsupported analyses are listed with the reason.
6. **Data Explorer**: files, coverage, columns, missing values, duplicate checks, data-quality notes, a data dictionary and searchable raw records with CSV export.

**Global filters** in the sidebar apply to every page: season range, date range, team, game type, and whether to include neutral-site games. The active filters and sample size are shown as chips at the top of each page, and **Reset filters** restores the defaults.

## Project layout

```
app.py                  entry point: navigation, sidebar, theme
nfl_edge/loader.py      raw file reading
nfl_edge/cleaning.py    validation, settlement (ATS / O-U / favorite), team-perspective rows
nfl_edge/metrics.py     reusable statistics (records, rates, grouped tables, calibration)
nfl_edge/ui/            theme, global filters, components (KPI cards, tables, detail panel), chart builders
views/                  one module per page
tests/                  calculation and page-render tests
scripts/fetch_data.py   refresh the dataset
```

*Historical records describe past rosters, coaches and schedules. They do not predict or guarantee future results.*
