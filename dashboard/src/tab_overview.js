// Overview: what has changed since 2020, and which betting patterns are worth a closer look.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;

  // Change between the first and last full season in view, with a 95% range for the change.
  const CHANGES = [
    ['avg_total', 'Combined points per game', 'n1'],
    ['avg_total_line', 'Closing total', 'n1'],
    ['avg_fav_line', 'Points laid by the favorite', 'n1'],
    ['avg_margin', 'Winning margin', 'n1'],
    ['home_win', 'Home win %', 'pct'],
    ['fav_win', 'Favorite win % (straight up)', 'pct'],
    ['fav_cover', 'Favorite cover % (against the spread)', 'pct'],
    ['over', 'Over %', 'pct'],
  ];
  const change = (key, ga, gb) => {
    const a = NE.metricPoint(key, ga);
    const b = NE.metricPoint(key, gb);
    if (a.value === null || b.value === null) return null;
    const d = b.value - a.value;
    const se = NE.METRICS[key].kind === 'pct'
      ? Math.sqrt((a.value * (1 - a.value)) / a.n + (b.value * (1 - b.value)) / b.n)
      : Math.sqrt((a.sd ** 2) / a.n + (b.sd ** 2) / b.n);
    return { a: a.value, b: b.value, d, lo: d - 1.96 * se, hi: d + 1.96 * se, real: Math.abs(d) > 1.96 * se };
  };

  const changesCard = (games) => {
    const seasons = [...new Set(games.map((g) => g.season))].sort((x, y) => x - y);
    if (seasons.length < 2) return '';
    const full = seasons.filter((s) => s < NE.latestSeason);
    const first = seasons[0];
    const last = full.length >= 2 ? full[full.length - 1] : seasons[seasons.length - 1];
    if (first === last) return '';
    const ga = games.filter((g) => g.season === first);
    const gb = games.filter((g) => g.season === last);
    const rows = CHANGES.map(([k, label, kind]) => ({ k, label, kind, c: change(k, ga, gb) })).filter((r) => r.c);
    const fmt = (v, kind) => (kind === 'pct' ? f.pct(v) : f.n1(v));
    const fmtD = (v, kind) => (kind === 'pct' ? f.pp(v) : f.s1(v));
    return U.card({
      id: 'ov-changes',
      title: `What changed: ${first} vs. ${last}`,
      info: 'Each change comes with a 95% range. If that range excludes zero, the change is unlikely to be season-to-season luck. Click a row to chart that measure across every season.',
      note: `${last < NE.latestSeason && seasons.includes(NE.latestSeason) ? `${NE.latestSeason} is left out of this comparison because it is still in progress. ` : ''}“Real change” means the 95% range for the change excludes zero.`,
      body: `<div class="tbl short"><table><thead><tr><th>Measure</th><th class="num">${first}</th><th class="num">${last}</th><th class="num">Change</th><th>Verdict</th></tr></thead><tbody>${rows.map((r) => `
        <tr class="clickable" data-go="${U.go({ metric: r.k, split: 'none', _scroll: 'card-ov-trend' })}"><td>${r.label}</td><td class="num">${fmt(r.c.a, r.kind)}</td><td class="num">${fmt(r.c.b, r.kind)}</td><td class="num ${r.c.real ? (r.c.d > 0 ? 'up' : 'down') : ''}">${fmtD(r.c.d, r.kind)}</td><td>${r.c.real ? '<span class="pill good">Real change</span>' : '<span class="pill neutral">Could be chance</span>'}</td></tr>`).join('')}</tbody></table></div>`,
    });
  };

  const worthCard = (scopeTeamGames) => {
    const scan = NE.scan(scopeTeamGames);
    if (!scan.length) return '';
    const flagged = scan.filter((x) => x.flagged).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const expected = scan.length * 0.05;
    const rows = flagged.slice(0, 6).map((x) => {
      const r = x.res;
      const patch = { tab: 'lab', tt_market: x.spec.market, tt_side: x.spec.side, tt_team: x.spec.team, tt_opp: x.spec.opp, tt_smin: x.spec.smin, tt_smax: x.spec.smax, tt_tmin: x.spec.tmin, tt_tmax: x.spec.tmax, tt_div: x.spec.div, tt_rest: x.spec.rest };
      return `<tr class="clickable" data-go="${U.go(patch)}"><td>${esc(x.spec.label)}</td><td>${r.rec}</td><td class="num">${f.pct(r.rate)}</td><td class="num muted">${f.ci(r)}</td><td class="num muted">${r.implied ? `implied ${f.pct(r.base)}` : '50%'}</td></tr>`;
    }).join('');
    return U.card({
      id: 'ov-worth',
      title: 'Worth investigating',
      info: 'The dashboard tests a fixed list of common betting situations (spread ranges, home and road favorites and underdogs, division games, rest, total ranges, every team) and lists the ones whose 95% range excludes the baseline. Testing many situations means some pass by luck alone, about 1 in 20.',
      note: `<b>${flagged.length}</b> of <b>${scan.length}</b> situations tested sit outside chance of their baseline. With that many tests, about <b>${f.n1(expected)}</b> would by luck alone, so treat these as leads, not edges. Click one to test it in the Trend lab.`,
      body: flagged.length
        ? `<div class="tbl short"><table><thead><tr><th>Situation</th><th>Record</th><th class="num">Rate</th><th class="num">95% range</th><th class="num">Baseline</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="empty">Nothing tested clears the bar under these filters: every situation is within chance of its baseline.</p>',
    });
  };

  NE.tabs.overview = (root) => {
    const S = NE.S;
    const { games, teamGames, scopeTeamGames } = NE.data();
    if (!games.length) { root.innerHTML = U.empty(); return; }
    const P = NE.periods(games);
    const home = NE.homeSU(games);
    const fav = NE.su(games, 'fav_su');
    const favAts = NE.ats(games, 'fav_ats');
    const decided = games.filter((g) => g.result !== 0);
    const minGames = Math.min(8, d3.max(d3.rollups(teamGames, (v) => v.length, (r) => r.team), (x) => x[1]));
    const ppg = d3.rollups(teamGames, (v) => ({ ppg: d3.mean(v, (r) => r.pts_for), n: v.length }), (r) => r.team).filter((x) => x[1].n >= minGames).sort((a, b) => b[1].ppg - a[1].ppg);
    const top = ppg[0] || ['—', { ppg: null }];
    const bySeason = NE.groupBy(games, 'season').map(([s, g]) => [s, NE.mean(g, 'total_pts')]);
    const topSeason = bySeason.reduce((a, b) => (b[1] > a[1] ? b : a));
    const seasonsIn = bySeason.map((x) => x[0]);
    const avgTotal = NE.mean(games, 'total_pts');
    const ml = NE.showMarket('ml');

    root.innerHTML = `
      <div class="page-h">
        <div><h2>Overview</h2>
        <p class="lede">Across <b>${f.int(games.length)}</b> games, combined scoring averaged <b>${f.n1(avgTotal)}</b> points (peak <b>${topSeason[0]}</b> at ${f.n1(topSeason[1])}). Home teams won <b>${f.pct(home.pct)}</b>, and favorites won <b>${f.pct(fav.pct)}</b> of games but covered the spread only <b>${f.pct(favAts.pct)}</b> of the time.</p></div>
        <button type="button" class="btn ghost" data-go="${U.go({ tab: 'story' })}">Read the story →</button>
      </div>
      <div class="kpis">
        ${U.kpi({ label: 'Games analyzed', value: f.int(games.length), sub: U.rangeText(games), info: 'Completed games that match the filters. Scheduled games are never included.' })}
        ${U.kpi({ label: 'Seasons covered', value: f.int(seasonsIn.length), sub: seasonsIn.length > 1 ? `${seasonsIn[0]}–${seasonsIn[seasonsIn.length - 1]}` : `${seasonsIn[0]} season`, info: 'NFL seasons in view. A season runs from September to February; the latest one is still in progress.' })}
        ${U.kpi({ label: 'Home win %', value: f.pct(home.pct), ci: `95% range ${f.ci(home)}`, sub: `${home.rec} W-L${home.t ? '-T' : ''}`, spark: 'home_win', patch: { metric: 'home_win', split: 'none', _scroll: 'card-ov-trend' }, info: 'Home wins ÷ home games played. Neutral-site games are left out; ties count as games, not wins.' })}
        ${U.kpi({ label: 'Favorite win %', value: f.pct(fav.pct), ci: `95% range ${f.ci(fav)}`, sub: `${fav.rec} straight up`, spark: 'fav_win', patch: { metric: 'fav_win', split: 'none', _scroll: 'card-ov-trend' }, info: 'Games won outright by the closing-spread favorite ÷ games with a favorite. Straight up: who won the game, whatever the spread.' })}
        ${U.kpi({ label: 'ATS cover %', value: f.pct(favAts.pct), ci: `95% range ${f.ci(favAts)}`, sub: `${favAts.rec} for favorites`, spark: 'fav_cover', patch: { metric: 'fav_cover', split: 'none', _scroll: 'card-ov-trend' }, info: 'Favorite covers ÷ (covers + misses); pushes are left out. Every graded game has one cover and one miss, so underdogs covered the rest.' })}
        ${U.kpi({ label: 'Average game total', value: f.n1(avgTotal), sub: `closing total ${f.n1(NE.mean(games, 'total_line'))}`, spark: 'avg_total', patch: { metric: 'avg_total', split: 'none', _scroll: 'card-ov-trend' }, info: 'Home score + away score, averaged over games. The closing total is the over/under line at kickoff.' })}
        ${U.kpi({ label: 'Average winning margin', value: f.n1(NE.mean(decided, 'abs_margin')), sub: `median ${f.n1(NE.median(decided, 'abs_margin'))}`, spark: 'avg_margin', patch: { metric: 'avg_margin', split: 'none', _scroll: 'card-ov-trend' }, info: 'Average points between winner and loser, ties left out.' })}
        ${U.kpi({ label: 'Highest-scoring team', value: esc(top[0]), sub: `${f.n1(top[1].ppg)} pts/game · top season ${topSeason[0]}`, patch: top[0] !== '—' ? { tab: 'teams', pteam: top[0], tmode: 'profile' } : null, info: 'Team with the most points per game in view (teams with at least a handful of games), and the season with the most combined points per game.' })}
      </div>
      <div class="grid two">
        ${changesCard(games)}
        ${worthCard(scopeTeamGames)}
      </div>

      ${U.section('Scoring', 'How many points were scored, and did the closing totals keep up?')}
      <div class="grid">
        ${U.card({ id: 'ov-scoring', title: 'Scoring trend: points vs. the closing total', info: 'Average combined points per game, with its 95% range, next to the average closing total. Click a point to zoom in.', note: 'Click a point to zoom in.' })}
        ${U.card({ id: 'ov-points', title: 'Average points scored per team', info: 'Average points scored by the home team and by the away team in each game.', note: 'Home and away teams, per game.' })}
      </div>

      ${U.section('Who wins', 'Straight-up results: who won the game, whatever the line.')}
      <div class="grid">
        ${U.card({ id: 'ov-homeaway', title: 'Home vs. away win %', info: 'Neutral-site games are left out. Whiskers show the 95% range for the home rate.', note: 'Whiskers are 95% ranges.' })}
        ${U.card({ id: 'ov-favdog', title: 'Favorite vs. underdog win %', info: 'The favorite is the side the closing spread favored.', note: 'Whiskers are 95% ranges.' })}
      </div>

      ${U.section('Against the line', `Betting results by market. ${S.market === 'all' ? 'Use the Market filter to focus on one.' : `Showing the ${NE.MARKETS[S.market].toLowerCase()} market.`}`)}
      <div class="grid">
        ${NE.showMarket('spread') ? U.card({ id: 'ov-ats', title: 'ATS cover % over time', info: 'Covers ÷ (covers + misses) against the closing spread; pushes left out. The orange dashed line is the break-even rate at the closing prices: the share a side must cover to come out even after the bookmaker’s cut.', note: 'Bands are 95% ranges. Dashed grey is 50%; dashed orange is break-even at closing prices.' }) : ''}
        ${NE.showMarket('spread') ? U.card({ id: 'ov-spread', title: 'Average point spread over time', info: 'Points the favorite laid at the close (with its 95% range), and the average line from the home side (positive = home favored).', note: 'How big favorites were, and how much the home side was favored.' }) : ''}
        ${NE.showMarket('total') ? U.card({ id: 'ov-over', title: 'Over % over time', info: 'Overs ÷ (overs + unders) against the closing total; pushes left out.', note: 'Bands are 95% ranges.' }) : ''}
        ${NE.showMarket('total') ? U.card({ id: 'ov-totalline', title: 'Average game total over time', info: 'Average closing over/under line, with its 95% range, next to the points actually scored.', note: 'Closing totals against points scored.' }) : ''}
        ${ml ? U.card({ id: 'ov-ml', cls: 'wide', title: 'Favorites: wins vs. what the prices implied', info: 'Favorite win % (with 95% range) against the average no-vig win chance implied by the closing moneylines. When the band covers the dashed line, prices matched results.', note: 'Moneyline market.' }) : ''}
      </div>

      ${U.section('How much it varies', 'The averages above hide a wide spread of results. These views show it.')}
      <div class="grid">
        ${U.card({ id: 'ov-margin', title: 'Distribution of final scoring margins', info: 'Games by final margin. 3, 7 and 10 (orange) are the most common NFL margins because of field goals and touchdowns.', note: 'Orange marks 3, 7 and 10.' })}
        ${U.card({ id: 'ov-box', title: 'Combined points per game, by season', info: 'Box = middle half of games; line = median; whiskers = typical range; dots = unusual games.', note: 'Click a season to zoom in.' })}
      </div>
      ${U.card({ id: 'ov-heat', title: 'Season × week', info: 'Each cell is one week of games. Colors show how that week compared. Click a cell to list its games.', note: 'Click a cell to list that week’s games.', controls: U.sel('heat', [['avg_total', 'Combined points'], ['home_win', 'Home win %'], ['fav_cover', 'Favorite cover %'], ['over', 'Over %']], S.heat, 'Color by') })}

      ${U.section('Chart any measure', 'Pick a measure and a comparison; every line carries its 95% range.')}
      ${U.card({ id: 'ov-trend', title: `${NE.METRICS[S.metric].label}, ${P.key === 'week' ? 'week by week' : 'by season'}`, info: 'The shaded band is the 95% range: where the true value plausibly sits given the number of games behind it.', controls: U.sel('metric', Object.entries(NE.METRICS).map(([k, m]) => [k, m.label]), S.metric, 'Measure') + U.sel('split', Object.entries(NE.SPLITS).map(([k, s]) => [k, s.label]), S.split, 'Compare') })}`;

    for (const k of ['home_win', 'fav_win', 'fav_cover', 'avg_total', 'avg_margin']) U.spark(root, k, NE.metricSeries(k, P.groups).values);
    const drill = U.drill(P, games);
    const hint = U.drillHint(P);
    const series = (key, name, color, extra = {}) => ({ name, color, ...NE.metricSeries(key, P.groups), ...extra });

    U.draw(root, 'ov-scoring', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [series('avg_total', 'Combined points', C.col.blue()), { name: 'Closing total', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'total_line')), dash: true }] }));
    U.draw(root, 'ov-points', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [
      { name: 'Home team', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'home_score')), n: P.groups.map((g) => g.length) },
      { name: 'Away team', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'away_score')) },
    ] }));
    U.draw(root, 'ov-homeaway', (el) => {
      const r = P.groups.map((g) => NE.homeSU(g));
      C.bars(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, onClick: drill, hint, series: [
        { name: 'Home', color: C.col.blue(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.n), extra: (i) => [{ label: 'Record', value: r[i].rec }] },
        { name: 'Away', color: C.col.orange(), values: r.map((x) => x.lpct) },
      ] });
    });
    U.draw(root, 'ov-favdog', (el) => {
      const r = P.groups.map((g) => NE.su(g, 'fav_su'));
      C.bars(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, onClick: drill, hint, series: [
        { name: 'Favorite', color: C.col.blue(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.n), extra: (i) => [{ label: 'Record', value: r[i].rec }] },
        { name: 'Underdog', color: C.col.orange(), values: r.map((x) => x.lpct) },
      ] });
    });
    const be = NE.mean(teamGames, 'spread_be');
    U.draw(root, 'ov-ats', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, ref2: be, ref2Label: `Break-even ${f.pct(be)}`, onClick: drill, hint, series: [series('fav_cover', 'Favorites', C.col.blue()), { name: 'Home teams', color: C.col.teal(), values: NE.metricSeries('home_cover', P.groups).values }] }));
    U.draw(root, 'ov-spread', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [series('avg_fav_line', 'Points laid by the favorite', C.col.blue()), { name: 'Home-side line (+ = home favored)', color: C.col.teal(), values: P.groups.map((g) => NE.mean(g, 'spread_line')) }] }));
    U.draw(root, 'ov-over', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, onClick: drill, hint, series: [series('over', 'Over %', C.col.blue())] }));
    U.draw(root, 'ov-totalline', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [series('avg_total_line', 'Average closing total', C.col.orange()), { name: 'Points scored', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'total_pts')), dash: true }] }));
    U.draw(root, 'ov-ml', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', onClick: drill, hint, series: [series('fav_win', 'Favorite win %', C.col.blue()), { name: 'Price-implied win chance', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'fav_imp')), dash: true }] }));
    U.draw(root, 'ov-margin', (el) => C.hist(el, { values: games.map((g) => g.abs_margin), highlight: [3, 7, 10], xLabel: 'Final margin (points)' }));
    U.draw(root, 'ov-box', (el) => C.box(el, { groups: NE.groupBy(games, 'season').map(([s, g]) => ({ label: s, values: g.map((r) => r.total_pts) })), yLabel: 'Combined points', onClick: (s) => NE.set({ s0: s, s1: s }) }));
    U.draw(root, 'ov-heat', (el) => {
      const cells = new Map(NE.groupBy(games, (g) => `${g.season}|${g.week}`).map(([k, g]) => [k, g]));
      const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
      const rows = [...new Set(games.map((g) => g.season))].sort((a, b) => a - b);
      const m = NE.METRICS[S.heat];
      C.heat(el, { rows, cols: weeks, colLabel: 'week', label: m.label, kind: m.kind, center: m.kind === 'pct' ? 0.5 : undefined,
        cell: (r, c) => { const g = cells.get(`${r}|${c}`); if (!g) return null; return { value: NE.metricPoint(S.heat, g).value, n: g.length }; },
        onClick: (r, c) => NE.set({ ...NE.specToExplorer({ side: 'all', team: '', opp: '', smin: '', smax: '', tmin: '', tmax: '', div: 'any' }), gx_season: String(r), gx_week: String(c) }) });
    });
    U.draw(root, 'ov-trend', (el) => {
      const split = NE.SPLITS[S.split];
      const m = NE.METRICS[S.metric];
      const lines = split.groups
        ? split.groups.map(([name, fn], i) => ({ name, color: C.series()[i], ...NE.metricSeries(S.metric, P.groups.map((g) => g.filter(fn))) }))
        : [{ name: m.label, color: C.col.blue(), ...NE.metricSeries(S.metric, P.groups) }];
      C.line(el, { cats: P.cats, xLabel: P.label, kind: m.kind, ref: m.base, series: lines, onClick: drill, hint });
    });
  };
})();
