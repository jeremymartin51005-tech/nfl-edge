// Data explorer: what is in the file, how it was checked, and the raw records behind every figure.
'use strict';

(() => {
  const NE = window.NE;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;

  const DICTIONARY = [
    ['Closing spread', 'The point spread at kickoff. Shown from a team’s side: negative means favored (KC −3.5 must win by 4 or more). The source stores it as points the home team was favored by (spread_line, positive = home favored).'],
    ['Cover / miss / push', 'A side’s final margin plus its own spread: above zero is a cover, zero a push, below zero a miss.'],
    ['Cover % (ATS)', 'Covers ÷ (covers + misses). Pushes are left out of the rate and reported separately.'],
    ['Closing total', 'The over/under line on combined points at kickoff. Over % = overs ÷ (overs + unders).'],
    ['Moneyline', 'American odds to win outright. −150: stake 150 to win 100. +130: stake 100 to win 130.'],
    ['Implied chance (no-vig)', 'A price’s implied probability (−150 → 60%), divided by the two sides’ sum to remove the bookmaker’s margin.'],
    ['Bookmaker margin (hold)', 'Both sides’ implied chances added up, minus 100%. The bookmaker’s built-in edge.'],
    ['Break-even rate', 'The win rate a side needs at its price to come out even: 52.4% at −110.'],
    ['Favorite', 'The side the closing spread favored; a spread of exactly zero falls back to the shorter moneyline.'],
    ['Straight up (SU)', 'Who won the game, whatever the spread. Win % = wins ÷ games played; ties count as games.'],
    ['95% range', 'Where the true rate plausibly sits given the number of games: the Wilson score interval for rates, ± 1.96 standard errors for averages.'],
    ['Neutral site', 'Games at a neutral venue (international games, Super Bowls). The listed home team is kept but these games never count toward home-field rates.'],
  ];

  const checks = () => {
    const G = NE.games;
    const m = NE.meta;
    const resultOk = G.filter((g) => g.src_result === null || g.src_result === g.result).length;
    const totalOk = G.filter((g) => g.src_total === null || g.src_total === g.total_pts).length;
    const mlFav = G.filter((g) => g.home_ml !== null && g.away_ml !== null && g.home_ml !== g.away_ml && g.fav_side);
    const agree = mlFav.filter((g) => (g.home_ml < g.away_ml ? 'home' : 'away') === g.fav_side).length;
    const odd = mlFav.filter((g) => (g.home_ml < g.away_ml ? 'home' : 'away') !== g.fav_side);
    const oddMax = d3.max(odd, (g) => g.fav_line) ?? 0;
    const missing = (k) => G.filter((g) => g[k] === null).length;
    const before = G.filter((g) => g.season < 2023);
    const after = G.filter((g) => g.season >= 2023);
    const tempMissing = (m.columns.find((c) => c.name === 'temp') || {}).missing_completed;
    const pass = (ok, text, detail) => ({ tone: ok ? 'good' : 'bad', label: ok ? 'Pass' : 'Check', text, detail });
    const note = (text, detail) => ({ tone: 'neutral', label: 'Note', text, detail });
    return [
      pass(m.duplicate_ids === 0, 'No duplicate game IDs', `${f.int(m.duplicate_ids)} duplicates among ${f.int(m.rows_2020)} rows from 2020 on.`),
      pass(m.duplicate_matchups === 0, 'No duplicate date + matchup rows', `${f.int(m.duplicate_matchups)} rows share a date, home team and away team.`),
      pass(resultOk === G.length, 'Margins match the source', `The home margin computed from the scores equals the source’s result column in ${f.int(resultOk)} of ${f.int(G.length)} games.`),
      pass(totalOk === G.length, 'Combined points match the source', `Home + away points equals the source’s total column in ${f.int(totalOk)} of ${f.int(G.length)} games.`),
      pass(odd.length === 0 || oddMax <= 1.5, 'Spread and moneyline agree on the favorite', `The spread favorite also had the shorter moneyline in ${f.int(agree)} of ${f.int(mlFav.length)} games (${f.pct(agree / mlFav.length)}), which confirms the spread sign convention.${odd.length ? ` The ${odd.length} exceptions are all spreads of ${f.n1(oddMax)} points or less with near-even moneylines, where the two markets can differ slightly.` : ''}`),
      pass(missing('spread_line') + missing('total_line') + missing('home_ml') === 0, 'Every completed game has its closing lines', `Missing: spread ${missing('spread_line')}, total ${missing('total_line')}, moneyline ${missing('home_ml')}. A game missing a line would be left out of that market only.`),
      note('Scheduled games are left out', `${f.int(m.unplayed)} games from 2020 on have no final score yet. They are not in this page, so no future game or its odds appears anywhere.`),
      note('Neutral-site games are handled separately', `${f.int(G.filter((g) => g.neutral).length)} games were at a neutral site. They keep the listed home team but never count toward home-field rates; the Neutral sites filter can drop them.`),
      note('Ties count as games, not wins', `${f.int(G.filter((g) => g.result === 0).length)} games ended in a tie.`),
      note('Pushes are reported separately', `${f.int(G.filter((g) => g.home_ats === 'Push').length)} spread pushes and ${f.int(G.filter((g) => g.ou_result === 'Push').length)} total pushes are left out of cover and over rates.`),
      { tone: 'warn', label: 'Caution', text: 'Bookmaker margin jumps in 2023', detail: `The average moneyline margin goes from ${f.pct(NE.mean(before, 'ml_hold'))} before 2023 to ${f.pct(NE.mean(after, 'ml_hold'))} from 2023, in all three markets at once. That most likely reflects a change of odds provider in the source. Lines are unaffected; compare prices across that boundary with care.` },
      note('Weather is incomplete', `Temperature and wind are missing for ${f.int(tempMissing)} completed games (mostly domes and recent seasons). Weather is shown in game details but not used in any statistic.`),
      note('One snapshot, one consensus line', 'The file has closing lines only, with no opening lines, timestamps or sportsbook names. Line movement and sportsbook comparisons are left out.'),
    ];
  };

  NE.tabs.data = (root) => {
    const m = NE.meta;
    const { games } = NE.data();
    const ids = new Set(games.map((g) => g.game_id));
    const ix = Object.fromEntries(NE.raw.cols.map((c, i) => [c, i]));
    let recs = NE.raw.rows.filter((r) => ids.has(r[ix.game_id]));
    if (S.dx_q) { const q = S.dx_q.toLowerCase(); recs = recs.filter((r) => r.join(' ').toLowerCase().includes(q)); }
    const si = ix[S.dx_sort] ?? ix.gameday;
    const dir = S.dx_dir === 'asc' ? 1 : -1;
    recs = recs.slice().sort((a, b) => {
      const x = a[si];
      const y = b[si];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
    });
    const size = 50;
    const pages = Math.max(1, Math.ceil(recs.length / size));
    const page = Math.min(S.dx_page, pages - 1);
    const shown = recs.slice(page * size, page * size + size);
    const colCols = [
      ['name', 'Column', (c) => c.name, 'text'], ['category', 'Kind', (c) => c.category, 'text'], ['type', 'Type', (c) => c.type, 'text'],
      ['missing_completed', 'Missing (completed games)', (c) => c.missing_completed, 'int'], ['missing_2020', 'Missing (all rows 2020 on)', (c) => c.missing_2020, 'int'],
      ['example', 'Example', (c) => c.example, 'text'], ['use', 'Used for', (c) => c.use, 'text'], ['embedded', 'In this page', (c) => (c.embedded ? 'Yes' : 'No'), 'text'],
    ];
    const lines = (k) => games.filter((g) => g[k] !== null).length;

    root.innerHTML = `
      <div class="page-h"><div><h2>Data explorer</h2><p class="lede">Where the numbers come from, how they were checked, and the raw records behind them. Source: nflverse <code>games.csv</code> (github.com/nflverse/nfldata), downloaded ${esc(m.downloaded)}.</p></div></div>
      <div class="kpis">
        ${U.kpi({ label: 'Rows in source file', value: f.int(m.file.rows), sub: `seasons ${m.file.seasons[0]}–${m.file.seasons[1]}`, info: 'Every row in games.csv, all seasons back to 1999.' })}
        ${U.kpi({ label: 'Rows from 2020 on', value: f.int(m.rows_2020), sub: `${f.int(m.unplayed)} not yet played`, info: 'Rows in scope, including scheduled games that have no final score.' })}
        ${U.kpi({ label: 'Completed games', value: f.int(NE.games.length), sub: `${NE.seasons.length} seasons`, info: 'Games with a final score: everything the dashboard analyzes.' })}
        ${U.kpi({ label: 'Games under the filters', value: f.int(games.length), sub: U.rangeText(games), info: 'Completed games that match the filters at the top.' })}
        ${U.kpi({ label: 'Columns', value: f.int(m.file.columns), sub: `${NE.raw.cols.length} carried into this page`, info: 'Columns in the source file. External ID columns are left out of the page.' })}
        ${U.kpi({ label: 'Duplicate games', value: f.int(m.duplicate_ids + m.duplicate_matchups), sub: 'by game ID and by date + teams', info: 'Rows that repeat a game ID, or a date with the same home and away team.' })}
        ${U.kpi({ label: 'Sportsbooks', value: '1', sub: 'consensus line, not named', info: 'The source gives one consensus line per game and does not say which sportsbook it came from.' })}
        ${U.kpi({ label: 'Betting markets', value: '3', sub: 'spread, total, moneyline', info: 'Closing spread, total and moneyline, each with the price on both sides.' })}
      </div>
      <section class="card"><header class="card-h"><div><h3>Data-quality checks${U.info('Checks run in this page against the embedded data every time it opens.')}</h3><p class="note">Run live against the data in this page.</p></div></header>
        <ul class="checks">${checks().map((c) => `<li><span class="pill ${c.tone}">${c.label}</span><div><b>${esc(c.text)}</b><p>${esc(c.detail)}</p></div></li>`).join('')}</ul>
      </section>
      <div class="grid">
        <section class="card"><header class="card-h"><div><h3>Files</h3></div></header>
          ${U.table({ cols: [['n', 'File', (r) => r.name, 'text'], ['r', 'Rows', (r) => r.rows, 'int'], ['c', 'Columns', (r) => r.columns, 'int'], ['s', 'Size (KB)', (r) => r.size_kb, 'int'], ['y', 'Seasons', (r) => `${r.seasons[0]}–${r.seasons[1]}`, 'text'], ['d', 'Downloaded', () => m.downloaded, 'text']], rows: [m.file] })}
          <p class="note">Refresh with <code>python scripts/fetch_data.py</code>, then rebuild with <code>python dashboard/build.py</code>.</p>
        </section>
        <section class="card"><header class="card-h"><div><h3>Markets and sportsbooks</h3><p class="note">Games under the current filters.</p></div></header>
          ${U.table({ cols: [['m', 'Market', (r) => r[0], 'text'], ['c', 'Source columns', (r) => r[1], 'text'], ['g', 'Games with line', (r) => r[2], 'int'], ['s', 'Snapshot', () => 'Closing', 'text'], ['b', 'Sportsbook', () => 'Consensus (not named)', 'text']],
            rows: [['Point spread', 'spread_line, home/away_spread_odds', lines('spread_line')], ['Total', 'total_line, over_odds, under_odds', lines('total_line')], ['Moneyline', 'home_moneyline, away_moneyline', lines('home_ml')]] })}
        </section>
      </div>
      <section class="card"><header class="card-h"><div><h3>Columns and missing values${U.info('Every column in the source file, with how many values are missing among completed games and among all rows from 2020 on (scheduled games have no scores yet).')}</h3><p class="note">All ${m.file.columns} source columns. Click a column header to sort.</p></div></header>
        ${U.table({ cols: colCols, rows: U.sortRows(m.columns, colCols, S.dc_sort, S.dc_dir), sortKey: S.dc_sort, sortDir: S.dc_dir, sortParam: 'dc_sort', dirParam: 'dc_dir', cls: 'tall' })}
      </section>
      <section class="card"><header class="card-h"><div><h3>Data dictionary</h3></div></header>
        <dl class="kv wide">${DICTIONARY.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      </section>
      <section class="card" id="card-records"><header class="card-h"><div><h3>Underlying records${U.info('The source rows behind every figure, exactly as in games.csv, for the completed games under the current filters.')}</h3><p class="note">${f.int(recs.length)} source rows under the current filters. Search any value; click a column to sort.</p></div>
          <div class="card-c"><label class="ctl grow"><span>Search</span><input id="dx-q" type="search" value="${esc(S.dx_q)}" placeholder="Any value: team, QB, stadium, date" data-key="dx_q" aria-label="Search records"></label><button type="button" class="btn ghost" data-csv="records">Download CSV</button><button type="button" class="btn ghost" data-csv="records-copy">Copy CSV</button></div></header>
        <div class="tbl tall"><table><thead><tr>${NE.raw.cols.map((c) => `<th data-sort="${c}" data-sort-param="dx_sort" data-dir-param="dx_dir" aria-sort="${S.dx_sort === c ? (S.dx_dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${shown.map((r) => `<tr class="clickable" data-go="${U.go({ tab: 'games', game: r[ix.game_id] })}">${r.map((v) => `<td class="${typeof v === 'number' ? 'num' : ''}">${v === null ? '<span class="muted">—</span>' : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="pager">
          <button type="button" class="btn ghost" data-go="${U.go({ dx_page: Math.max(0, page - 1) })}" ${page === 0 ? 'disabled' : ''}>← Previous</button>
          <span>Page ${page + 1} of ${pages}</span>
          <button type="button" class="btn ghost" data-go="${U.go({ dx_page: Math.min(pages - 1, page + 1) })}" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
        </div>
        <p class="note" data-csv-msg></p>
      </section>`;
  };

  NE.csvSources = NE.csvSources || {};
  NE.csvSources.records = () => {
    const ids = new Set(NE.data().games.map((g) => g.game_id));
    const ix = NE.raw.cols.indexOf('game_id');
    let recs = NE.raw.rows.filter((r) => ids.has(r[ix]));
    if (S.dx_q) { const q = S.dx_q.toLowerCase(); recs = recs.filter((r) => r.join(' ').toLowerCase().includes(q)); }
    const objs = recs.map((r) => Object.fromEntries(NE.raw.cols.map((c, i) => [c, r[i]])));
    return { name: 'nfl_edge_records.csv', text: U.csv(objs, NE.raw.cols) };
  };
})();
