// Odds & market: how closing lines and prices related to results, and what the data can't show.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;

  const UNAVAILABLE = [
    ['Opening vs. closing spreads', 'The file has closing spreads only; there are no opening lines.'],
    ['Opening vs. closing totals', 'Closing totals only.'],
    ['Changes in moneyline prices', 'One moneyline price per side, taken at the close.'],
    ['Average spread and total movement', 'Movement needs an opening line to subtract from the close.'],
    ['Line movement by team or by season', 'Same reason: no opening lines or timestamps.'],
    ['Differences between sportsbooks', 'One consensus line per game; the sportsbook is not identified.'],
  ];
  const AVAILABLE = [
    ['Closing lines vs. game outcomes', 'Spread vs. margin, total vs. points, price vs. win rate'],
    ['Bookmaker margin (hold) at the close', 'For spreads, totals and moneylines'],
    ['Distributions of closing spreads, totals and prices', 'Including key numbers'],
    ['Results vs. market expectation by team', 'Actual wins against price-implied wins'],
  ];

  NE.tabs.market = (root) => {
    const { games, scopeTeamGames } = NE.data();
    if (!games.length) { root.innerHTML = U.empty(); return; }
    const P = NE.periods(games);
    const sp = games.filter((g) => g.spread_line !== null);
    const fit = NE.slope(sp.map((g) => g.spread_line), sp.map((g) => g.result));
    const rSpread = NE.pearson(sp.map((g) => g.spread_line), sp.map((g) => g.result));
    const tl = games.filter((g) => g.total_line !== null);
    const rTotal = NE.pearson(tl.map((g) => g.total_line), tl.map((g) => g.total_pts));
    const both = games.filter((g) => g.home_spread_odds !== null);
    const std = both.filter((g) => g.home_spread_odds === -110 && g.away_spread_odds === -110).length / (both.length || 1);
    const cal = calibration(games);
    const calErr = cal.length ? d3.sum(cal, (r) => Math.abs(r.won - r.imp) * r.n) / d3.sum(cal, (r) => r.n) : null;
    const before = games.filter((g) => g.season < 2023);
    const after = games.filter((g) => g.season >= 2023);

    root.innerHTML = `
      <div class="page-h"><div><h2>Odds & market</h2><p class="lede">How the closing lines and prices related to what happened. The data has one consensus closing line per game, so this page describes closing prices only.</p></div></div>
      <div class="grid">
        <section class="card"><header class="card-h"><div><h3>Not available in this data${U.info('These analyses were asked for but need data the source does not have. They are left out rather than estimated.')}</h3><p class="note">Left out rather than estimated.</p></div></header>
          ${U.table({ cols: [['a', 'Analysis', (r) => r[0], 'text'], ['s', 'Status', () => '<span class="pill bad">Not in data</span>', 'html'], ['w', 'Why', (r) => r[1], 'text']], rows: UNAVAILABLE })}
        </section>
        <section class="card"><header class="card-h"><div><h3>What this page shows</h3><p class="note">Everything below uses closing lines, prices and final scores.</p></div></header>
          ${U.table({ cols: [['a', 'Analysis', (r) => r[0], 'text'], ['s', 'Status', () => '<span class="pill good">Shown</span>', 'html'], ['w', 'Covers', (r) => r[1], 'text']], rows: AVAILABLE })}
        </section>
      </div>

      ${NE.showMarket('spread') ? `
      ${U.section('Spread', 'Did closing spreads predict final margins?', 'mk-sec-spread')}
      <div class="kpis">
        ${U.kpi({ label: 'Average miss', value: f.n1(d3.mean(sp, (g) => Math.abs(g.home_ats_margin))), sub: 'points, either direction', info: 'Average of |final home margin − closing home line|.' })}
        ${U.kpi({ label: 'Home bias', value: f.s2(NE.mean(sp, 'home_ats_margin')), sub: 'average margin − line', info: 'Above zero means home teams beat their closing lines on average.' })}
        ${U.kpi({ label: 'Margin per point of spread', value: f.n2(fit && fit.slope), sub: `correlation ${f.n2(rSpread)}`, info: 'Slope of final margin on the closing line. 1.00 means each extra point of spread was worth about one extra point of margin on average.' })}
        ${U.kpi({ label: 'Spreads at −110 both ways', value: f.pct(std), sub: 'of games with spread prices', info: 'Share of games where both sides of the closing spread were priced at the standard −110.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'mk-scatter', title: 'Closing spread vs. final margin', note: `Home side. Above the dashed line, the home team covered. Each point of spread was worth ${f.n2(fit && fit.slope)} points of margin.`, info: 'Each dot is a game. The solid line is the fitted trend; the dashed line is where margin equals the line exactly.' })}
        ${U.card({ id: 'mk-keys', title: 'Key numbers: margins vs. spreads', note: 'Share of games at each whole number. Margins pile up on 3 and 7, and so do spreads.', info: 'Final winning margins and closing spreads (points laid by the favorite), as a share of games at each value from 1 to 14.' })}
        ${U.card({ id: 'mk-mae', title: 'How far closing lines missed', note: 'Average miss per period, with 95% ranges.', info: 'Average absolute difference between the closing line and the result, for spreads and totals.' })}
        ${U.card({ id: 'mk-sprices', title: 'Closing spread prices', note: 'Both sides of every spread, shortest price to longest. Orange is the standard −110.', info: 'How often each American price appeared on either side of the closing spread.' })}
      </div>` : ''}

      ${NE.showMarket('total') ? `
      ${U.section('Total', 'Did closing totals predict combined points?', 'mk-sec-total')}
      <div class="kpis">
        ${U.kpi({ label: 'Average miss', value: f.n1(d3.mean(tl, (g) => Math.abs(g.ou_margin))), sub: 'points, either direction', info: 'Average of |combined points − closing total|.' })}
        ${U.kpi({ label: 'Bias', value: f.s2(NE.mean(tl, 'ou_margin')), sub: 'average points − total', info: 'Above zero means games averaged more points than the closing total.' })}
        ${U.kpi({ label: 'Correlation', value: f.n2(rTotal), sub: 'closing total vs. points', info: 'How closely the closing total tracked combined points game by game (1 = perfectly).' })}
        ${U.kpi({ label: 'Average total margin', value: f.pct(NE.mean(games, 'total_hold')), sub: 'bookmaker’s cut on totals', info: 'Implied chance of the over plus implied chance of the under, minus 100%.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'mk-tmae', title: 'How far closing totals missed', note: 'Average miss per period, with 95% ranges.', info: 'Average |combined points − closing total| per season or week.' })}
        ${U.card({ id: 'mk-tdist', title: 'Closing totals', note: 'Games by closing over/under, in whole points.', info: 'Distribution of closing totals; click a bar to list those games.' })}
      </div>` : ''}

      ${NE.showMarket('ml') ? `
      ${U.section('Moneyline', 'Did the prices match how often favorites won?', 'mk-sec-ml')}
      <div class="kpis">
        ${U.kpi({ label: 'Average moneyline margin', value: f.pct(NE.mean(games, 'ml_hold')), sub: 'bookmaker’s cut', info: 'Both sides’ implied chances added up, minus 100%.' })}
        ${U.kpi({ label: 'Average favorite price-implied chance', value: f.pct(NE.mean(games, 'fav_imp')), sub: `actual win % ${f.pct(NE.su(games, 'fav_su').pct)}`, info: 'The average no-vig win chance the closing moneyline gave the favorite, against how often favorites actually won.' })}
        ${U.kpi({ label: 'Average price miss', value: f.pp(calErr), sub: 'actual − implied, by price group', info: 'Game-weighted average gap between the actual win rate and the implied chance across the price groups below.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'mk-calib', title: 'Price vs. how often favorites won', note: 'Whiskers are 95% ranges. Dots near the dashed line: prices matched results.', info: 'Favorites grouped by their no-vig implied win chance (5-point groups), against the share they actually won.' })}
        <section class="card"><header class="card-h"><div><h3>Price groups</h3><p class="note">A group whose 95% range misses its implied chance is a price that did not match results.</p></div></header>
          ${U.table({ cols: [['b', 'Implied chance', (r) => r.bucket, 'text'], ['n', 'Games', (r) => r.n, 'int'], ['imp', 'Avg implied', (r) => r.imp, 'pct'], ['won', 'Actual win %', (r) => r.won, 'pct'], ['range', '95% range', (r) => `${f.pct(r.lo)}–${f.pct(r.hi)}`, 'text'], ['d', 'Actual − implied', (r) => f.pp(r.won - r.imp), 'text'], ['v', 'Verdict', (r) => (r.lo > r.imp || r.hi < r.imp ? '<span class="pill bad">Missed</span>' : '<span class="pill neutral">Matched</span>'), 'html']], rows: cal })}
        </section>
      </div>
      ${U.card({ id: 'mk-wins', title: 'Actual wins vs. wins the prices implied, by team', note: 'Wins minus the sum of each game’s no-vig win chance (a tie counts half). Above zero: won more than the prices suggested. Click a team to open it.', info: 'Describes past prices, not a forecast. Uses every team’s games under the filters (the Team filter is ignored here).' })}` : ''}

      ${U.section('Prices', 'The bookmaker’s margin at the close, across all three markets.')}
      ${U.card({ id: 'mk-hold', title: 'Bookmaker margin at the close', note: `The step up in 2023 hits all three markets at once (moneyline ${f.pct(NE.mean(before, 'ml_hold'))} before, ${f.pct(NE.mean(after, 'ml_hold'))} from 2023). That most likely reflects a change of odds provider in the source, not the market, so compare prices across it with care.`, info: 'Margin = both sides’ implied chances added up, minus 100%.' })}`;

    const drill = U.drill(P, games);
    const hint = U.drillHint(P);
    U.draw(root, 'mk-scatter', (el) => C.scatter(el, { fit: true, fitLabel: 'Fitted trend', points: sp.map((g) => ({ x: g.spread_line, y: g.result, group: g.home_ats, id: g.game_id, label: U.gameLabel(g) })), groups: [{ key: 'Cover', name: 'Home covered', color: C.col.blue() }, { key: 'No Cover', name: 'Away covered', color: C.col.orange() }, { key: 'Push', name: 'Push', color: C.col.muted() }], diag: true, diagLabel: 'Margin = line', zero: true, xLabel: 'Points the home team was favored by', yLabel: 'Home margin', onClick: (p) => U.openGame(p.id) }));
    U.draw(root, 'mk-keys', (el) => {
      const ks = d3.range(1, 15);
      const decided = games.filter((g) => g.result !== 0);
      const withFav = games.filter((g) => g.fav_line !== null);
      C.bars(el, { cats: ks, xLabel: 'Points', kind: 'pct', labels: false, series: [
        { name: 'Final margin', color: C.col.blue(), values: ks.map((k) => decided.filter((g) => g.abs_margin === k).length / (decided.length || 1)), extra: (i) => [{ label: 'Games', value: f.int(decided.filter((g) => g.abs_margin === ks[i]).length) }] },
        { name: 'Closing spread', color: C.col.orange(), values: ks.map((k) => withFav.filter((g) => g.fav_line === k).length / (withFav.length || 1)), extra: (i) => [{ label: 'Games', value: f.int(withFav.filter((g) => g.fav_line === ks[i]).length) }] },
      ] });
    });
    U.draw(root, 'mk-mae', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [{ name: 'Spread miss', color: C.col.blue(), ...NE.metricSeries('spread_mae', P.groups) }, { name: 'Total miss', color: C.col.orange(), ...NE.metricSeries('total_mae', P.groups) }] }));
    U.draw(root, 'mk-sprices', (el) => {
      const counts = d3.rollups(games.flatMap((g) => [g.home_spread_odds, g.away_spread_odds]).filter((v) => v !== null), (v) => v.length, (v) => v).sort((a, b) => NE.prob(b[0]) - NE.prob(a[0]));
      const tot = d3.sum(counts, (c) => c[1]);
      C.bars(el, { cats: counts.map((c) => f.odds(c[0])), kind: 'num', labels: false, series: [{ name: 'Sides', color: C.col.blue(), colors: counts.map((c) => (c[0] === -110 ? C.col.orange() : C.col.blue())), values: counts.map((c) => c[1]), extra: (i) => [{ label: 'Share', value: f.pct(counts[i][1] / tot) }] }] });
    });
    U.draw(root, 'mk-tmae', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [{ name: 'Total miss', color: C.col.orange(), ...NE.metricSeries('total_mae', P.groups) }] }));
    U.draw(root, 'mk-tdist', (el) => C.hist(el, { values: tl.map((g) => Math.floor(g.total_line)), xLabel: 'Closing total', color: C.col.teal(), hint: 'Click to list these games', onClick: (v) => NE.set(NE.specToExplorer({ side: 'all', team: '', opp: '', smin: '', smax: '', tmin: String(v), tmax: String(v + 0.5), div: 'any' })) }));
    U.draw(root, 'mk-calib', (el) => C.calib(el, cal));
    U.draw(root, 'mk-wins', (el) => C.hbars(el, { kind: 'num', center: 0, valueLabel: 'Wins vs. implied', onClick: U.openTeam, rows: NE.teamTable(scopeTeamGames).map((t) => ({ label: t.team, value: t.winsOverExp, lines: [{ label: 'Actual wins', value: String(t.su.w) }, { label: 'Implied wins', value: f.n1(t.expWins) }, { label: 'Games', value: String(t.n) }] })).sort((a, b) => b.value - a.value) }));
    U.draw(root, 'mk-hold', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', fmtV: d3.format('.2%'), onClick: drill, hint, series: [
      { name: 'Moneyline', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'ml_hold')), n: P.groups.map((g) => g.length) },
      { name: 'Spread', color: C.col.teal(), values: P.groups.map((g) => NE.mean(g, 'spread_hold')) },
      { name: 'Total', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'total_hold')) },
    ] }));
  };

  const calibration = (games) => {
    const g = games.filter((x) => x.fav_imp !== null);
    return d3.range(10).map((i) => {
      const lo = 0.5 + i * 0.05;
      const v = g.filter((x) => x.fav_imp >= lo && (x.fav_imp < lo + 0.05 || (i === 9 && x.fav_imp <= 1)));
      if (!v.length) return null;
      const s = NE.su(v, 'fav_su');
      return { bucket: `${Math.round(lo * 100)}–${Math.round(lo * 100 + 5)}%`, imp: d3.mean(v, (x) => x.fav_imp), won: s.pct, lo: s.lo, hi: s.hi, n: v.length };
    }).filter(Boolean);
  };
})();
