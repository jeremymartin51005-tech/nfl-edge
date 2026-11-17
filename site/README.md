# NFL Edge dashboard

Interactive dashboard of NFL results against the closing betting line,
2020–2026 (1,829 completed games, data through 2026-11-09).

## Run it

- **On your computer:** unzip and double-click `index.html`. No internet,
  server or install needed.
- **On GitHub Pages:** upload the contents of this folder to the root of a
  repository (keep the folder structure), then in **Settings → Pages** choose
  **Deploy from a branch**, branch `main`, folder `/ (root)`. The site appears
  at `https://<your-user>.github.io/<repo>/` after a minute or two.

## Files

| Path | Contents |
|---|---|
| `index.html` | Page markup |
| `css/styles.css` | All styling, light and dark themes |
| `js/app.js` | Filters, KPIs, charts, tables and question answers |
| `js/vendor/chart.umd.js` | Chart.js 4.4.1 (MIT licence, see `js/vendor/chart.js-LICENSE.md`) |
| `data/games.js` | Cleaned game data the dashboard reads |
| `data/games.csv` | Raw nflverse source file, for reference |

Source data: nflverse `games.csv` (https://github.com/nflverse/nfldata).
Historical description only; not betting advice.
