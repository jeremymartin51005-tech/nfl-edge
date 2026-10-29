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

## Interactive HTML dashboard (main deliverable)

`dashboard/nfl_edge_dashboard.html` is a single self-contained file (data, d3 and the app inlined, about 980 KB).
Open it in any browser, online or offline. To rebuild it after refreshing the data:

```bash
python scripts/fetch_data.py   # refresh data/raw/games.csv
python dashboard/build.py      # rebuild the HTML file
```

**Global filters** (one bar, applied to every tab): season range, date range, game type (regular season /
playoffs), market (spread / total / moneyline), team, and neutral-site games. Active filters appear as chips
that remove themselves with one click, and **Reset filters** restores everything.

**Tabs**

1. **Overview:** the eight headline figures (each with a 95% range and a sparkline), a "what changed" table that
   tests whether each change since the first season is bigger than chance, an automatic "worth investigating" scan,
   and charts for scoring, who wins, results against the line (following the market filter) and variability
   (margin distribution, box plots, season × week heatmap), plus a chart-any-measure explorer.
2. **The story:** six chapters computed live from every season, each with one chart and a button into the full view,
   ending with takeaways for reading betting trends.
3. **Team analytics:** a profile (records with 95% ranges, home/away and favorite/underdog charts, every game against
   the line, splits, season-by-season and a sortable game log), a two-team comparison that flags real differences,
   and league rankings.
4. **Betting trends:** against the spread, over/under and favorites vs. underdogs, with break-even lines at the
   closing prices, spread and total ranges, venue × role, team rankings and outcome distributions.
5. **Trend lab:** an "Is this trend real?" tester (any side, team, opponent, spread range, total range, division and
   rest situation, judged against 50% or the price-implied chance and against break-even, season by season), the
   full list of situations the scan tests (it reports how many would pass by luck alone), a funnel plot,
   a coin-flip simulator and a season-to-season persistence check.
6. **Game explorer:** every game with filters (team, opponent, home/away, favorite/underdog, situation, division,
   straight-up, spread and total results, spread and total ranges, season, week, search), sortable columns that
   follow the market filter, CSV export, and a detail panel (lines, settlement, records going in, rest, weather,
   earlier meetings, how favorites did at the same spread).
7. **Odds & market:** an itemized list of the analyses the data cannot support (opening lines, line movement,
   sportsbook comparisons), then closing lines against outcomes per market, key numbers, price calibration,
   bookmaker margin and results against market expectation by team.
8. **Data explorer:** file and column inventory with missing-value counts, live data-quality checks (duplicates,
   cross-checks against the source's own result and total columns, spread sign convention), markets and sportsbooks,
   a data dictionary, and a searchable, sortable, exportable table of the underlying records.

Source lives in `dashboard/src/`: `core.js` (data, statistics, filters, trend engine), `charts.js` (chart library),
`ui.js` (shared builders), one `tab_*.js` per tab, and `shell.js` (header, filters, events).

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
