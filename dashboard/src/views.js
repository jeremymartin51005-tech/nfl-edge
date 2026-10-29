// NFL EDGE: views. Each tab renders from NE.S (state) and NE.data() (filtered games).
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;
  const view = document.getElementById('view');

  // ---- small builders -----------------------------------------------------------
  const go = (patch) => esc(JSON.stringify(patch));
  const card = ({ id, title, note = '', controls = '', body = '', cls = '' }) => `
    <section class="card ${cls}" id="card-${id}">
      <header class="card-h"><div><h3>${title}</h3>${note ? `<p class="note">${note}</p>` : ''}</div>${controls ? `<div class="card-c">${controls}</div>` : ''}</header>
      ${body || `<div class="chart" data-chart="${id}"></div>`}
    </section>`;
  const kpi = ({ label, value, sub = '', def = '', spark = '', tone = '', patch = null, ci = '' }) => `
    <div class="kpi ${patch ? 'clickable' : ''} ${tone}" ${patch ? `data-go="${go(patch)}" tabindex="0" role="button"` : ''}>
      <span class="kpi-l">${label}</span>
      <span class="kpi-v">${value}</span>
      ${ci ? `<span class="kpi-ci">${ci}</span>` : ''}
      ${sub ? `<span class="kpi-s">${sub}</span>` : ''}
      ${spark ? `<span class="kpi-spark" data-spark="${spark}"></span>` : ''}
      ${def ? `<span class="kpi-d">${def}</span>` : ''}
    </div>`;
  const sel = (key, options, value, label) => `
    <label class="ctl"><span>${label}</span><select data-key="${key}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const seg = (key, options, value) => `
    <div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-go="${go({ [key]: v })}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div>`;
  const teamOptions = (any) => [...(any ? [['', any]] : []), ...NE.teams.map((t) => [t, t])];
  const verdict = (r, what) => {
    if (!r || r.lo === null) return '';
    if (r.lo > 0.5) return `<span class="pill good">Above 50%, beyond chance</span>`;
    if (r.hi < 0.5) return `<span class="pill bad">Below 50%, beyond chance</span>`;
    return `<span class="pill neutral" title="The 95% range includes 50%">Within chance of 50% ${what ? `(${what})` : ''}</span>`;
  };
  const draw = (id, fn) => { const el = view.querySelector(`[data-chart="${id}"]`); if (el) fn(el); };
  const spark = (id, values, color) => { const el = view.querySelector(`[data-spark="${id}"]`); if (el) C.spark(el, values, color); };
  const empty = () => `<div class="card"><p class="empty">No games match these filters. Widen the seasons or reset the filters.</p></div>`;
  const periodGroups = (games) => {
    const key = NE.trendKey();
    const groups = NE.groupBy(games, key);
    return { key, label: key === 'week' ? 'Week' : 'Season', cats: groups.map((g) => g[0]), groups: groups.map((g) => g[1]) };
  };
  const metricSeries = (metric, groups) => {
    const pts = groups.map((g) => NE.metricPoint(metric, g));
    return { values: pts.map((p) => p.value), lo: pts.map((p) => p.lo ?? null), hi: pts.map((p) => p.hi ?? null), n: pts.map((p) => p.n) };
  };
  // Click on a period: a season narrows the filters to it; a week opens those games.
  const drill = (P) => (i) => {
    if (P.key === 'season') NE.set({ s0: P.cats[i], s1: P.cats[i] });
    else NE.set({ tab: 'games', gx_season: String(S.s0), gx_week: String(P.cats[i]), gx_page: 0 });
  };
  const drillHint = (P) => (P.key === 'season' ? 'Click to focus this season' : 'Click to list this week’s games');
  const openTeam = (team) => NE.set({ tab: 'teams', pteam: team, tmode: 'profile' });
  const openGame = (id) => NE.set({ tab: 'games', game: id });

  // =================================================================================
  // STORY: a fixed narrative over every season; numbers are computed live.
  // =================================================================================
  const story = () => {
    const G = NE.games;
    const TG = NE.teamGames;
    const bySeason = NE.groupBy(G, 'season');
    const seasons = bySeason.map((s) => s[0]);
    const tot = bySeason.map(([, g]) => NE.mean(g, 'total_pts'));
    const peak = seasons[d3.maxIndex(tot)];
    const low = seasons[d3.minIndex(tot)];
    const home = bySeason.map(([, g]) => NE.metricPoint('home_win', g));
    const home20 = home[seasons.indexOf(2020)];
    const homeRest = NE.metricPoint('home_win', G.filter((g) => g.season !== 2020));
    const full = seasons.map((s, i) => [s, home[i].value]).filter(([s]) => s < NE.latestSeason);
    const lowestFull = full.length ? full.reduce((a, b) => (b[1] < a[1] ? b : a))[0] : null;
    const fav = NE.su(G, 'fav_su');
    const favAts = NE.ats(G, 'fav_ats');
    const big = G.filter((g) => g.fav_line !== null && g.fav_line >= 7);
    const bigSu = NE.su(big, 'fav_su');
    const bigAts = NE.ats(big, 'fav_ats');
    const totalMae = d3.mean(G, (g) => Math.abs(g.ou_margin));
    const rTot = NE.pearson(G.map((g) => g.total_line), G.map((g) => g.total_pts));
    const overAll = NE.ou(G);
    const teams = NE.teamTable(TG);
    const outside = teams.filter((t) => NE.clear(t.ats)).length;
    const persist = persistence(TG, 'cover');
    const persistWin = persistence(TG, 'win');

    view.innerHTML = `
      <div class="story">
        <p class="story-lede">Seven seasons of NFL games and the lines that closed on them. Five things stand out, and the last one is the most useful: most of what looks like a betting trend is noise.</p>
        <p class="note">This page always uses every season (2020 to week ${NE.latestWeek} of ${NE.latestSeason}). Each chapter has a button that opens the full view.</p>
        ${chapter(1, 'Scoring', `Scoring fell from ${f.n1(tot[0])} to ${f.n1(d3.min(tot))} points a game, then came back`,
          `Combined points peaked in ${peak} and bottomed out in ${low}. The closing total followed scoring down and back up, usually a step behind.`,
          'st-scoring', 'Open the scoring trend', { tab: 'overview', metric: 'avg_total', split: 'none' })}
        ${chapter(2, 'Home field', `Home teams won ${f.pct(home20.value)} in empty-stadium 2020, against ${f.pct(homeRest.value)} since`,
          `The shaded band is the 95% range for each season: with about ${f.int(Math.round(d3.mean(home, (p) => p.n)))} home games a season, each season’s rate is only known to within about ${f.n1(d3.mean(home, (p) => (p.hi - p.lo) / 2) * 100)} points either way. ${lowestFull === 2020 ? '2020 is the lowest of the completed seasons.' : `The lowest completed season was ${lowestFull}.`}`,
          'st-home', 'Open home-field results', { tab: 'overview', metric: 'home_win', split: 'none' })}
        ${chapter(3, 'Favorites', `Favorites win ${f.pct(fav.pct)} of games but cover only ${f.pct(favAts.pct)}`,
          `Winning and covering are different questions. Favorites of 7 or more won ${f.pct(bigSu.pct)} straight up yet covered ${f.pct(bigAts.pct)}. The spread does what it is meant to: it turns a lopsided game into roughly a coin flip.`,
          'st-fav', 'Open favorite vs. underdog', { tab: 'betting', bet: 'favdog' })}
        ${chapter(4, 'Totals', `Closing totals miss by ${f.n1(totalMae)} points a game, yet overs hit ${f.pct(overAll.pct)}`,
          `Single games are hard to call: the correlation between the closing total and the points scored is only ${f.n2(rTot)}. Over many games the line is close to balanced, which is the market's job.`,
          'st-totals', 'Open over / under', { tab: 'betting', bet: 'totals' })}
        ${chapter(5, 'Signal vs. noise', outside === 0 ? `Not one of ${teams.length} teams has a spread record that chance can’t explain` : `Only ${outside} of ${teams.length} teams have a spread record that chance can’t explain`,
          `Each dot is a team’s cover rate since 2020. The blue band is where a fair coin’s rate lands 95% of the time over the same number of games: about ${f.int(Math.round(d3.mean(teams, (t) => t.ats.dec)))} per team. And a team’s cover rate in one season barely predicts the next (correlation ${f.n2(persist.r)}), unlike its win rate (${f.n2(persistWin.r)}).`,
          'st-noise', 'Open signal vs. noise', { tab: 'noise', funnel: 'cover' })}
        <section class="takeaways card">
          <h3>What to take from it</h3>
          <ol>
            <li><b>Check the sample before trusting a rate.</b> A 55% cover rate over 100 games has a 95% range of roughly 45% to 64%. Every rate on this dashboard shows its range.</li>
            <li><b>Separate winning from covering.</b> Strong teams win more; they do not cover more, because the line already prices them in.</li>
            <li><b>Prefer patterns that persist.</b> Win rates and point differential carry from season to season; cover rates mostly do not.</li>
            <li><b>Mind what the data can’t show.</b> Closing lines only: no line movement, no sportsbook comparisons.</li>
          </ol>
        </section>
      </div>`;

    draw('st-scoring', (el) => C.line(el, { cats: seasons, xLabel: 'Season', series: [{ name: 'Combined points', color: C.col.blue(), values: tot, ...ciMean(bySeason, 'total_pts') }, { name: 'Closing total', color: C.col.orange(), values: bySeason.map(([, g]) => NE.mean(g, 'total_line')), dash: true }], onClick: (i) => NE.set({ tab: 'overview', s0: seasons[i], s1: seasons[i], metric: 'avg_total' }), hint: 'Click to open this season' }));
    draw('st-home', (el) => C.line(el, { cats: seasons, xLabel: 'Season', kind: 'pct', ref: 0.5, series: [{ name: 'Home win %', color: C.col.blue(), values: home.map((p) => p.value), lo: home.map((p) => p.lo), hi: home.map((p) => p.hi), n: home.map((p) => p.n) }] }));
    draw('st-fav', (el) => {
      const b = NE.SPREAD_BUCKETS.map((k) => G.filter((g) => g.spread_bucket === k));
      const su = b.map((g) => NE.su(g, 'fav_su'));
      const at = b.map((g) => NE.ats(g, 'fav_ats'));
      C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, series: [
        { name: 'Won the game', color: C.col.blue(), values: su.map((r) => r.pct), lo: su.map((r) => r.lo), hi: su.map((r) => r.hi), n: su.map((r) => r.n) },
        { name: 'Covered the spread', color: C.col.teal(), values: at.map((r) => r.pct), lo: at.map((r) => r.lo), hi: at.map((r) => r.hi), n: at.map((r) => r.dec) },
      ], onClick: (i) => NE.set({ tab: 'games', gx_spread: NE.SPREAD_BUCKETS[i], gx_page: 0 }), hint: 'Click to list these games' });
    });
    draw('st-totals', (el) => C.scatter(el, { points: G.map((g) => ({ x: g.total_line, y: g.total_pts, group: g.ou_result, label: `${g.away_team} @ ${g.home_team} · ${g.season} wk ${g.week}`, id: g.game_id })), groups: ouGroups(), diag: true, diagLabel: 'Points = total', xLabel: 'Closing total', yLabel: 'Combined points', onClick: (p) => openGame(p.id), h: 320 }));
    draw('st-noise', (el) => C.funnel(el, { points: teams.map((t) => ({ label: t.team, n: t.ats.dec, p: t.ats.pct })), p0: 0.5, yLabel: 'Cover %', onClick: openTeam, h: 340 }));
  };
  const chapter = (n, kicker, headline, body, chartId, cta, patch) => `
    <article class="chapter">
      <div class="chapter-t">
        <span class="kicker">${n} · ${kicker}</span>
        <h2>${headline}</h2>
        <p>${body}</p>
        <button type="button" class="btn" data-go="${go(patch)}">${cta} →</button>
      </div>
      <div class="chapter-c card"><div class="chart" data-chart="${chartId}"></div></div>
    </article>`;
  const ciMean = (groups, field) => {
    const pts = groups.map(([, g]) => { const v = g.map((r) => r[field]).filter((x) => x !== null); const m = d3.mean(v); const se = (d3.deviation(v) || 0) / Math.sqrt(v.length || 1); return { lo: m - 1.96 * se, hi: m + 1.96 * se, n: v.length }; });
    return { lo: pts.map((p) => p.lo), hi: pts.map((p) => p.hi), n: pts.map((p) => p.n) };
  };
  const ouGroups = () => [{ key: 'Over', name: 'Over', color: C.col.blue() }, { key: 'Under', name: 'Under', color: C.col.orange() }, { key: 'Push', name: 'Push', color: C.col.muted() }];

  // Team-season metric in one season against the next.
  const PERSIST = {
    cover: { label: 'Cover %', get: (rows) => NE.ats(rows).pct, kind: 'pct' },
    win: { label: 'Win %', get: (rows) => NE.su(rows).pct, kind: 'pct' },
    over: { label: 'Over %', get: (rows) => NE.ou(rows).pct, kind: 'pct' },
    diff: { label: 'Point differential per game', get: (rows) => NE.mean(rows, 'margin'), kind: 'num' },
  };
  const persistence = (teamGames, metric) => {
    const m = PERSIST[metric];
    const by = new Map(NE.groupBy(teamGames, (r) => `${r.team}|${r.season}`).map(([k, rows]) => [k, m.get(rows)]));
    const pts = [];
    for (const [k, v] of by) {
      const [team, season] = k.split('|');
      const next = by.get(`${team}|${Number(season) + 1}`);
      if (v !== null && next !== null && next !== undefined) pts.push({ x: v, y: next, label: `${team} ${season} → ${Number(season) + 1}`, team, group: 'pair' });
    }
    return { pts, r: NE.pearson(pts.map((p) => p.x), pts.map((p) => p.y)) };
  };

  // =================================================================================
  // OVERVIEW
  // =================================================================================
  const overview = () => {
    const { games, teamGames } = NE.data();
    if (!games.length) { view.innerHTML = empty(); return; }
    const P = periodGroups(games);
    const home = NE.metricPoint('home_win', games);
    const homeR = NE.su(games.filter((g) => !g.neutral).map((g) => ({ su: g.result > 0 ? 'W' : g.result < 0 ? 'L' : 'T' })));
    const fav = NE.su(games, 'fav_su');
    const favAts = NE.ats(games, 'fav_ats');
    const decided = games.filter((g) => g.result !== 0);
    const ppg = d3.rollups(teamGames, (v) => d3.mean(v, (r) => r.pts_for), (r) => r.team).sort((a, b) => b[1] - a[1]);
    const top = ppg[0] || ['—', null];
    const seasonsIn = new Set(games.map((g) => g.season));
    const dates = `${f.date(games[0].date)} – ${f.date(games[games.length - 1].date)}`;
    const metricOpts = Object.entries(NE.METRICS).map(([k, m]) => [k, m.label]);
    const splitOpts = Object.entries(NE.SPLITS).map(([k, s]) => [k, s.label]);
    const heatOpts = [['avg_total', 'Combined points'], ['home_win', 'Home win %'], ['fav_cover', 'Favorite cover %'], ['over', 'Over %']];

    view.innerHTML = `
      <div class="kpis">
        ${kpi({ label: 'Games analyzed', value: f.int(games.length), sub: dates, def: 'Completed games only.' })}
        ${kpi({ label: 'Seasons covered', value: f.int(seasonsIn.size), sub: `${d3.min(seasonsIn)}–${d3.max(seasonsIn)}` })}
        ${kpi({ label: 'Home win %', value: f.pct(home.value), ci: `95% range ${f.ci(home)}`, sub: `${homeR.rec} W-L-T`, spark: 'home_win', patch: { metric: 'home_win' }, def: 'Neutral sites left out; ties count as games.' })}
        ${kpi({ label: 'Favorite win %', value: f.pct(fav.pct), ci: `95% range ${f.ci(fav)}`, sub: `${fav.rec} straight up`, spark: 'fav_win', patch: { metric: 'fav_win' } })}
        ${kpi({ label: 'Favorite cover %', value: f.pct(favAts.pct), ci: `95% range ${f.ci(favAts)}`, sub: `${favAts.rec} C-N-P`, spark: 'fav_cover', patch: { metric: 'fav_cover' }, def: 'Pushes left out of the rate.' })}
        ${kpi({ label: 'Avg combined points', value: f.n1(NE.mean(games, 'total_pts')), sub: `closing total ${f.n1(NE.mean(games, 'total_line'))}`, spark: 'avg_total', patch: { metric: 'avg_total' } })}
        ${kpi({ label: 'Avg winning margin', value: f.n1(NE.mean(decided, 'abs_margin')), sub: `median ${f.n1(NE.median(decided, 'abs_margin'))}`, spark: 'avg_margin', patch: { metric: 'avg_margin' } })}
        ${kpi({ label: 'Highest-scoring team', value: esc(top[0]), sub: `${f.n1(top[1])} points per game`, patch: { tab: 'teams', pteam: top[0], tmode: 'profile' } })}
      </div>
      <p class="hint-line">Click a figure to chart it below. Click a point on a season chart to zoom into that season.</p>
      ${insights(games)}
      ${card({ id: 'ov-trend', title: `${NE.METRICS[S.metric].label}, ${P.key === 'week' ? 'week by week' : 'by season'}`, note: 'The shaded band is the 95% range: where the true value plausibly sits given the number of games.', controls: sel('metric', metricOpts, S.metric, 'Measure') + sel('split', splitOpts, S.split, 'Compare') })}
      <div class="grid">
        ${card({ id: 'ov-homeaway', title: 'Home vs. away win %', note: 'Straight-up results, neutral sites left out. Whiskers show the 95% range.' })}
        ${card({ id: 'ov-favdog', title: 'Favorite vs. underdog win %', note: 'Who won outright, whatever the spread.' })}
        ${card({ id: 'ov-box', title: 'How much scoring varies', note: 'Combined points per game. Box = middle half of games, line = median, whiskers = typical range.' })}
        ${card({ id: 'ov-margin', title: 'Final winning margins', note: 'Orange marks 3, 7 and 10, the most common NFL margins.' })}
      </div>
      ${card({ id: 'ov-heat', title: 'Season × week', note: 'Each cell is one week. Click a cell to list its games.', controls: sel('heat', heatOpts, S.heat, 'Color by') })}`;

    for (const k of ['home_win', 'fav_win', 'fav_cover', 'avg_total', 'avg_margin']) spark(k, metricSeries(k, P.groups).values);

    draw('ov-trend', (el) => {
      const split = NE.SPLITS[S.split];
      const kind = NE.METRICS[S.metric].fmt === 'pct' ? 'pct' : 'num';
      const ref = kind === 'pct' && !['home_win', 'fav_win'].includes(S.metric) ? 0.5 : null;
      const series = split.groups
        ? split.groups.map(([name, fn], i) => ({ name, color: C.series()[i], ...metricSeries(S.metric, P.groups.map((g) => g.filter(fn))) }))
        : [{ name: NE.METRICS[S.metric].label, color: C.col.blue(), ...metricSeries(S.metric, P.groups) }];
      C.line(el, { cats: P.cats, xLabel: P.label, kind, ref, series, onClick: drill(P), hint: drillHint(P) });
    });
    draw('ov-homeaway', (el) => {
      const pts = P.groups.map((g) => NE.su(g.filter((x) => !x.neutral).map((x) => ({ su: x.result > 0 ? 'W' : x.result < 0 ? 'L' : 'T' }))));
      C.bars(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [
        { name: 'Home', color: C.col.blue(), values: pts.map((r) => r.pct), lo: pts.map((r) => r.lo), hi: pts.map((r) => r.hi), n: pts.map((r) => r.n) },
        { name: 'Away', color: C.col.orange(), values: pts.map((r) => r.lpct) },
      ], onClick: drill(P), hint: drillHint(P) });
    });
    draw('ov-favdog', (el) => {
      const pts = P.groups.map((g) => NE.su(g, 'fav_su'));
      C.bars(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [
        { name: 'Favorite', color: C.col.blue(), values: pts.map((r) => r.pct), lo: pts.map((r) => r.lo), hi: pts.map((r) => r.hi), n: pts.map((r) => r.n) },
        { name: 'Underdog', color: C.col.orange(), values: pts.map((r) => r.lpct) },
      ], onClick: drill(P), hint: drillHint(P) });
    });
    draw('ov-box', (el) => C.box(el, { groups: NE.groupBy(games, 'season').map(([s, g]) => ({ label: s, values: g.map((r) => r.total_pts) })), yLabel: 'Combined points', onClick: (s) => NE.set({ s0: s, s1: s }) }));
    draw('ov-margin', (el) => C.hist(el, { values: games.map((g) => g.abs_margin), highlight: [3, 7, 10], xLabel: 'Final margin (points)' }));
    draw('ov-heat', (el) => {
      const cellKey = new Map(NE.groupBy(games, (g) => `${g.season}|${g.week}`).map(([k, g]) => [k, g]));
      const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
      const rows = [...new Set(games.map((g) => g.season))].sort((a, b) => a - b);
      const m = NE.METRICS[S.heat];
      C.heat(el, { rows, cols: weeks, colLabel: 'week', label: m.label, kind: m.fmt === 'pct' ? 'pct' : 'num', center: m.fmt === 'pct' ? 0.5 : undefined,
        cell: (r, c) => { const g = cellKey.get(`${r}|${c}`); if (!g) return null; const p = NE.metricPoint(S.heat, g); return { value: p.value, n: g.length }; },
        onClick: (r, c) => NE.set({ tab: 'games', gx_season: String(r), gx_week: String(c), gx_page: 0 }) });
    });
  };

  const insights = (games) => {
    const by = NE.groupBy(games, 'season');
    if (by.length < 2) return '';
    const pts = by.map(([s, g]) => ({ s, tot: NE.mean(g, 'total_pts'), home: NE.metricPoint('home_win', g), cover: NE.ats(g, 'fav_ats') }));
    const hi = (k) => pts.reduce((a, b) => (k(b) > k(a) ? b : a));
    const lo = (k) => pts.reduce((a, b) => (k(b) < k(a) ? b : a));
    const pk = hi((p) => p.tot); const lw = lo((p) => p.tot);
    const hh = hi((p) => p.home.value); const hl = lo((p) => p.home.value);
    const ch = hi((p) => p.cover.pct); const cl = lo((p) => p.cover.pct);
    const key = games.filter((g) => g.abs_margin === 3 || g.abs_margin === 7).length / games.length;
    const one = games.filter((g) => g.abs_margin <= 7).length / games.length;
    const o = NE.ou(games);
    const latest = games.some((g) => g.season === NE.latestSeason);
    return `
      <div class="insights">
        <p class="insight"><span>Scoring</span>Peaked in <b>${pk.s}</b> at <b>${f.n1(pk.tot)}</b> points a game; lowest in <b>${lw.s}</b> at <b>${f.n1(lw.tot)}</b>.</p>
        <p class="insight"><span>Home field</span>Home win % ran from <b>${f.pct(hl.home.value)}</b> (${hl.s}) to <b>${f.pct(hh.home.value)}</b> (${hh.s}).</p>
        <p class="insight"><span>Favorites ATS</span>Cover rate ran from <b>${f.pct(cl.cover.pct)}</b> (${cl.s}) to <b>${f.pct(ch.cover.pct)}</b> (${ch.s}). ${ch.cover.lo <= 0.5 && cl.cover.hi >= 0.5 ? 'Both are within chance of 50%.' : ''}</p>
        <p class="insight"><span>Key numbers</span><b>${f.pct(key)}</b> of games were decided by exactly 3 or 7; <b>${f.pct(one)}</b> by 7 or fewer.</p>
        <p class="insight"><span>Totals</span>Overs hit <b>${f.pct(o.pct)}</b> (95% range ${f.ci(o)}).</p>
        ${latest ? `<p class="insight"><span>Sample size</span>The <b>${NE.latestSeason}</b> season is in progress (through week ${NE.latestWeek}); its ranges are wider.</p>` : ''}
      </div>`;
  };

  // =================================================================================
  // TEAMS
  // =================================================================================
  const teams = () => {
    const { scopeTeamGames } = NE.data();
    const rows = scopeTeamGames.filter((r) => r.team === S.pteam);
    const head = `
      <div class="toolbar">
        ${sel('pteam', teamOptions(), S.pteam, S.tmode === 'compare' ? 'Team A' : 'Team')}
        ${S.tmode === 'compare' ? sel('pteam2', teamOptions(), S.pteam2, 'Team B') : ''}
        ${seg('tmode', [['profile', 'Team profile'], ['compare', 'Compare two teams'], ['rank', 'League rankings']], S.tmode)}
      </div>
      <p class="note">Records describe past rosters, coaches and schedules. They do not predict future results.</p>`;
    if (S.tmode === 'compare') return compare(head);
    if (S.tmode === 'rank') return rankings(head);
    if (!rows.length) { view.innerHTML = head + empty(); return; }
    const t = NE.teamSummary(rows);
    const P = periodGroups(rows);
    view.innerHTML = `${head}
      <div class="kpis">
        ${kpi({ label: 'Record', value: t.su.rec, sub: `${t.n} games` })}
        ${kpi({ label: 'Win %', value: f.pct(t.su.pct), ci: `95% range ${f.ci(t.su)}`, tone: t.su.pct >= 0.5 ? 'up' : 'down' })}
        ${kpi({ label: 'Points per game', value: f.n1(t.ppg), sub: `allowed ${f.n1(t.papg)}` })}
        ${kpi({ label: 'Point differential', value: f.s1(t.diff), sub: 'per game', tone: t.diff >= 0 ? 'up' : 'down' })}
        ${kpi({ label: 'Against the spread', value: t.ats.rec, sub: `cover ${f.pct(t.ats.pct)} · ${f.ci(t.ats)}`, def: verdict(t.ats) })}
        ${kpi({ label: 'Avg ATS margin', value: f.s1(t.atsMargin), sub: 'margin + own line' })}
        ${kpi({ label: 'Over / under', value: t.ou.rec, sub: `over ${f.pct(t.ou.pct)} · ${f.ci(t.ou)}` })}
        ${kpi({ label: 'Avg closing spread', value: f.line(t.line === null ? null : Math.round(t.line * 10) / 10), sub: `total ${f.n1(t.totalLine)} · negative = favored` })}
      </div>
      ${splitsTable(t)}
      <div class="grid">
        ${card({ id: 'tm-ats-games', title: 'Every game against the spread', note: 'Bars are ATS margins, oldest to newest: green covered, red missed. Click a bar to open the game.', cls: 'wide' })}
        ${card({ id: 'tm-scoring', title: 'Points scored and allowed', note: 'Per game.' })}
        ${card({ id: 'tm-ats', title: 'Cover rate over time', note: 'With the 95% range. A band that crosses 50% means the season could be luck.' })}
        ${card({ id: 'tm-hist', title: 'How far from the line', note: 'ATS margin per game. Wide spread = results swing a lot around the line.' })}
        ${card({ id: 'tm-ou', title: 'Over / under results', note: 'Share of this team’s graded games.' })}
      </div>
      ${card({ id: 'tm-seasons', title: 'Season by season', note: 'Every season in the filters.', body: seasonTable(rows) })}`;

    draw('tm-ats-games', (el) => C.gameBars(el, { yLabel: 'ATS margin', onClick: openGame, rows: rows.filter((r) => r.ats_margin !== null).map((r) => ({ id: r.game_id, value: r.ats_margin, color: r.ats === 'Cover' ? C.col.good() : r.ats === 'No Cover' ? C.col.bad() : C.col.muted(),
      label: `${r.date} · ${r.venue === 'Away' ? '@' : 'vs'} ${r.opponent}`, lines: [{ label: 'Score', value: `${r.pts_for}-${r.pts_against}` }, { label: 'Line', value: f.line(r.team_line) }, { label: 'ATS margin', value: f.s1(r.ats_margin) }] })) }));
    draw('tm-scoring', (el) => C.line(el, { cats: P.cats, xLabel: P.label, series: [{ name: 'Scored', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'pts_for')) }, { name: 'Allowed', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'pts_against')) }] }));
    draw('tm-ats', (el) => { const r = P.groups.map((g) => NE.ats(g)); C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [{ name: 'Cover %', color: C.col.teal(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec) }] }); });
    draw('tm-hist', (el) => C.hist(el, { values: rows.map((r) => r.ats_margin), step: 3, xLabel: 'ATS margin (3-point bins)', color: C.col.teal() }));
    draw('tm-ou', (el) => { const r = P.groups.map((g) => NE.ou(g)); C.stack(el, { cats: P.cats, xLabel: P.label, parts: [{ name: 'Over', color: C.col.blue(), values: r.map((x) => x.w) }, { name: 'Push', color: C.col.muted(), values: r.map((x) => x.p) }, { name: 'Under', color: C.col.orange(), values: r.map((x) => x.l) }] }); });
  };

  const splitsTable = (t) => {
    const row = (label, p) => `<tr><td>${label}</td><td class="num">${p.n}</td><td>${p.su.rec}</td><td class="num">${f.pct(p.su.pct)}</td><td>${p.ats.rec}</td><td class="num">${f.pct(p.ats.pct)}</td><td class="num muted">${f.ci(p.ats)}</td></tr>`;
    return `<section class="card"><header class="card-h"><div><h3>Splits</h3><p class="note">Home and away exclude neutral sites. Favorite and underdog follow the closing spread.</p></div></header>
      <div class="tbl"><table><thead><tr><th>Split</th><th class="num">Games</th><th>Record</th><th class="num">Win %</th><th>ATS (C-N-P)</th><th class="num">Cover %</th><th class="num">Cover 95% range</th></tr></thead>
      <tbody>${row('Home', t.home)}${row('Away', t.away)}${t.neutral.n ? row('Neutral site', t.neutral) : ''}${row('Favorite', t.fav)}${row('Underdog', t.dog)}</tbody></table></div></section>`;
  };
  const seasonTable = (rows) => {
    const body = NE.groupBy(rows, 'season').reverse().map(([s, g]) => {
      const t = NE.teamSummary(g);
      return `<tr class="clickable" data-go="${go({ s0: s, s1: s })}"><td>${s}</td><td class="num">${t.n}</td><td>${t.su.rec}</td><td class="num">${f.pct(t.su.pct)}</td><td class="num">${f.n1(t.ppg)}</td><td class="num">${f.n1(t.papg)}</td><td class="num">${f.s1(t.diff)}</td><td>${t.ats.rec}</td><td class="num">${f.pct(t.ats.pct)}</td><td>${t.ou.rec}</td><td class="num">${f.s1(t.line)}</td></tr>`;
    }).join('');
    return `<div class="tbl"><table><thead><tr><th>Season</th><th class="num">G</th><th>Record</th><th class="num">Win %</th><th class="num">PF/G</th><th class="num">PA/G</th><th class="num">Diff</th><th>ATS</th><th class="num">Cover %</th><th>O-U-P</th><th class="num">Avg line</th></tr></thead><tbody>${body}</tbody></table></div><p class="note">Click a season to focus the dashboard on it.</p>`;
  };

  const compare = (head) => {
    const { scopeTeamGames } = NE.data();
    const A = scopeTeamGames.filter((r) => r.team === S.pteam);
    const B = scopeTeamGames.filter((r) => r.team === S.pteam2);
    if (!A.length || !B.length) { view.innerHTML = head + empty(); return; }
    const a = NE.teamSummary(A);
    const b = NE.teamSummary(B);
    const rows = [
      ['Games', a.n, b.n], ['Record', a.su.rec, b.su.rec], ['Win %', f.pct(a.su.pct), f.pct(b.su.pct)], ['Win % 95% range', f.ci(a.su), f.ci(b.su)],
      ['Points per game', f.n1(a.ppg), f.n1(b.ppg)], ['Points allowed', f.n1(a.papg), f.n1(b.papg)], ['Differential', f.s1(a.diff), f.s1(b.diff)],
      ['ATS (C-N-P)', a.ats.rec, b.ats.rec], ['Cover %', f.pct(a.ats.pct), f.pct(b.ats.pct)], ['Cover 95% range', f.ci(a.ats), f.ci(b.ats)], ['Avg ATS margin', f.s1(a.atsMargin), f.s1(b.atsMargin)],
      ['O-U-P', a.ou.rec, b.ou.rec], ['Over %', f.pct(a.ou.pct), f.pct(b.ou.pct)], ['Avg closing spread', f.s1(a.line), f.s1(b.line)], ['Avg closing total', f.n1(a.totalLine), f.n1(b.totalLine)],
      ['Home record', a.home.su.rec, b.home.su.rec], ['Away record', a.away.su.rec, b.away.su.rec], ['As favorite', a.fav.su.rec, b.fav.su.rec], ['As underdog', a.dog.su.rec, b.dog.su.rec],
    ];
    const h2h = NE.teamGames.filter((r) => r.team === S.pteam && r.opponent === S.pteam2).reverse();
    const hs = NE.su(h2h);
    const ha = NE.ats(h2h);
    view.innerHTML = `${head}
      <div class="grid">
        <section class="card"><header class="card-h"><div><h3>${esc(S.pteam)} vs. ${esc(S.pteam2)}</h3><p class="note">Same filters for both. Overlapping 95% ranges mean the gap could be chance.</p></div></header>
          <div class="tbl"><table><thead><tr><th>Measure</th><th class="num">${esc(S.pteam)}</th><th class="num">${esc(S.pteam2)}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join('')}</tbody></table></div></section>
        <div class="stack">
          ${card({ id: 'cmp-rates', title: 'Key rates with 95% ranges', note: 'Whiskers that overlap: the difference may not be real.' })}
          ${card({ id: 'cmp-cover', title: 'Cover rate over time' })}
        </div>
      </div>
      <section class="card"><header class="card-h"><div><h3>Head to head since 2020</h3><p class="note">All seasons and game types, from ${esc(S.pteam)}’s side: ${hs.rec} straight up, ${ha.rec} against the spread. Click a game to open it.</p></div></header>
        ${h2h.length ? `<div class="tbl"><table><thead><tr><th>Date</th><th>Venue</th><th class="num">Score</th><th>Result</th><th class="num">Line</th><th>ATS</th><th class="num">Total</th><th>O/U</th></tr></thead><tbody>${h2h.map((r) => `<tr class="clickable" data-go="${go({ tab: 'games', game: r.game_id })}"><td>${r.date}</td><td>${r.venue}</td><td class="num">${r.pts_for}-${r.pts_against}</td><td>${pill(r.su)}</td><td class="num">${f.line(r.team_line)}</td><td>${pill(r.ats)}</td><td class="num">${f.n1(r.total_line)}</td><td>${r.ou_result ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">These teams have not met since 2020.</p>'}
      </section>`;
    draw('cmp-rates', (el) => {
      const m = [['Win %', (t) => t.su], ['Cover %', (t) => t.ats], ['Over %', (t) => t.ou], ['Win % as fav.', (t) => t.fav.su], ['Win % as dog', (t) => t.dog.su]];
      const ser = (t, name, color) => ({ name, color, values: m.map(([, g]) => g(t).pct), lo: m.map(([, g]) => g(t).lo), hi: m.map(([, g]) => g(t).hi), n: m.map(([, g]) => g(t).dec ?? g(t).n) });
      C.bars(el, { cats: m.map((x) => x[0]), kind: 'pct', ref: 0.5, series: [ser(a, S.pteam, C.col.blue()), ser(b, S.pteam2, C.col.orange())] });
    });
    draw('cmp-cover', (el) => {
      const PA = new Map(NE.groupBy(A, NE.trendKey()).map(([k, g]) => [k, NE.ats(g)]));
      const PB = new Map(NE.groupBy(B, NE.trendKey()).map(([k, g]) => [k, NE.ats(g)]));
      const cats = [...new Set([...PA.keys(), ...PB.keys()])].sort((x, y) => x - y);
      C.line(el, { cats, xLabel: NE.trendKey() === 'week' ? 'Week' : 'Season', kind: 'pct', ref: 0.5, series: [
        { name: S.pteam, color: C.col.blue(), values: cats.map((c) => PA.get(c)?.pct ?? null) },
        { name: S.pteam2, color: C.col.orange(), values: cats.map((c) => PB.get(c)?.pct ?? null) },
      ] });
    });
  };
  const pill = (v) => (v ? `<span class="pill ${v === 'Cover' || v === 'W' ? 'good' : v === 'No Cover' || v === 'L' ? 'bad' : 'neutral'}">${esc(v)}</span>` : '—');

  const RANK = {
    cover: { label: 'Cover %', get: (t) => t.ats, center: 0.5 },
    win: { label: 'Win %', get: (t) => t.su, center: 0.5 },
    over: { label: 'Over %', get: (t) => t.ou, center: 0.5 },
    favcover: { label: 'Cover % as favorite', get: (t) => t.fav.ats, center: 0.5 },
    dogcover: { label: 'Cover % as underdog', get: (t) => t.dog.ats, center: 0.5 },
  };
  const rankings = (head) => {
    const { scopeTeamGames } = NE.data();
    if (!scopeTeamGames.length) { view.innerHTML = head + empty(); return; }
    const key = RANK[S.rank] ? S.rank : 'cover';
    const table = NE.teamTable(scopeTeamGames);
    view.innerHTML = `${head}
      ${card({ id: 'rank', title: `${RANK[key].label} by team`, note: 'Bars run from 50%. Whiskers are 95% ranges. Grey bars are within chance of 50%; color means the gap is unlikely to be luck alone. Click a team to open it.', controls: sel('rank', Object.entries(RANK).map(([k, r]) => [k, r.label]), key, 'Measure') })}`;
    draw('rank', (el) => C.hbars(el, { kind: 'pct', center: 0.5, noise: true, selected: S.pteam, valueLabel: RANK[key].label, onClick: openTeam,
      rows: table.map((t) => { const r = RANK[key].get(t); return { label: t.team, value: r.pct, lo: r.lo, hi: r.hi, lines: [{ label: 'Record', value: r.rec }, { label: 'Graded games', value: f.int(r.dec ?? r.n) }] }; }).filter((r) => r.value !== null).sort((x, y) => y.value - x.value) }));
  };

  // =================================================================================
  // BETTING TRENDS
  // =================================================================================
  const betting = () => {
    const { games, teamGames } = NE.data();
    const head = `<div class="toolbar">${seg('bet', [['ats', 'Against the spread'], ['totals', 'Over / under'], ['favdog', 'Favorite vs. underdog']], S.bet)}</div>`;
    if (!games.length) { view.innerHTML = head + empty(); return; }
    const P = periodGroups(games);
    if (S.bet === 'totals') return totals(head, games, teamGames, P);
    if (S.bet === 'favdog') return favdog(head, games, P);
    const home = NE.ats(games, 'home_ats');
    const fav = NE.ats(games, 'fav_ats');
    const mae = d3.mean(games.filter((g) => g.home_ats_margin !== null), (g) => Math.abs(g.home_ats_margin));
    view.innerHTML = `${head}
      <p class="callout"><b>How spreads are settled.</b> Each side is graded from its own closing line: ATS margin = that side’s final margin + its line (negative when favored). Above zero is a cover, zero a push, below zero a miss. Cover % = covers ÷ (covers + misses); pushes are reported on their own. Every graded game has one cover and one miss, so home and away (or favorite and underdog) always add to 100%.</p>
      <div class="kpis">
        ${kpi({ label: 'Games graded', value: f.int(home.n), sub: `${home.p} pushes (${f.pct(home.ppct)})` })}
        ${kpi({ label: 'Home cover %', value: f.pct(home.pct), ci: `95% range ${f.ci(home)}`, sub: home.rec, def: verdict(home) })}
        ${kpi({ label: 'Away cover %', value: f.pct(home.lpct), sub: home.lrec })}
        ${kpi({ label: 'Favorite cover %', value: f.pct(fav.pct), ci: `95% range ${f.ci(fav)}`, sub: fav.rec, def: verdict(fav) })}
        ${kpi({ label: 'Underdog cover %', value: f.pct(fav.lpct), sub: fav.lrec })}
        ${kpi({ label: 'Avg miss vs. spread', value: f.n1(mae), sub: 'points, either way' })}
      </div>
      <div class="grid">
        ${card({ id: 'bt-stack', title: 'Who covered: home or away', note: 'Share of graded games. Click to zoom in.' })}
        ${card({ id: 'bt-favdog', title: 'Favorite cover % over time', note: 'Band = 95% range. Most seasons sit within chance of 50%.' })}
        ${card({ id: 'bt-bucket', title: 'Cover % by spread size', note: 'Points the favorite laid at the close. Click a bar to list those games.' })}
        ${card({ id: 'bt-sit', title: 'Cover % by venue and role', note: 'Neutral sites left out. Whiskers are 95% ranges.' })}
      </div>
      <div class="grid">
        ${card({ id: 'bt-teams', title: 'Cover % by team', note: 'Grey = within chance of 50%. Click a team to open it.' })}
        ${card({ id: 'bt-push', title: 'Push rate by closing spread', note: 'Only whole-number spreads can push; 3 and 7 push most because they are the most common margins.' })}
      </div>`;
    draw('bt-stack', (el) => { const r = P.groups.map((g) => NE.ats(g, 'home_ats')); C.stack(el, { cats: P.cats, xLabel: P.label, parts: [{ name: 'Home covered', color: C.col.blue(), values: r.map((x) => x.w) }, { name: 'Push', color: C.col.muted(), values: r.map((x) => x.p) }, { name: 'Away covered', color: C.col.orange(), values: r.map((x) => x.l) }], onClick: drill(P), hint: drillHint(P) }); });
    draw('bt-favdog', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [{ name: 'Favorite cover %', color: C.col.blue(), ...metricSeries('fav_cover', P.groups) }], onClick: drill(P), hint: drillHint(P) }));
    draw('bt-bucket', (el) => {
      const r = NE.SPREAD_BUCKETS.map((k) => NE.ats(games.filter((g) => g.spread_bucket === k), 'fav_ats'));
      C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, series: [
        { name: 'Favorite', color: C.col.blue(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec), extra: (i) => [{ label: 'C-N-P', value: r[i].rec }] },
        { name: 'Underdog', color: C.col.orange(), values: r.map((x) => x.lpct) },
      ], onClick: (i) => NE.set({ tab: 'games', gx_spread: NE.SPREAD_BUCKETS[i], gx_page: 0 }), hint: 'Click to list these games' });
    });
    draw('bt-sit', (el) => {
      const sits = [['Home fav.', 'Home', 'Favorite'], ['Home dog', 'Home', 'Underdog'], ['Away fav.', 'Away', 'Favorite'], ['Away dog', 'Away', 'Underdog']];
      const r = sits.map(([, v, ro]) => NE.ats(teamGames.filter((t) => t.venue === v && t.role === ro)));
      C.bars(el, { cats: sits.map((s) => s[0]), kind: 'pct', ref: 0.5, series: [{ name: 'Cover %', color: C.col.teal(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec), extra: (i) => [{ label: 'C-N-P', value: r[i].rec }] }] });
    });
    draw('bt-teams', (el) => C.hbars(el, { kind: 'pct', center: 0.5, noise: true, valueLabel: 'Cover %', onClick: openTeam,
      rows: NE.teamTable(teamGames).filter((t) => t.ats.dec).map((t) => ({ label: t.team, value: t.ats.pct, lo: t.ats.lo, hi: t.ats.hi, lines: [{ label: 'C-N-P', value: t.ats.rec }] })).sort((a, b) => b.value - a.value) }));
    draw('bt-push', (el) => {
      const by = NE.groupBy(games.filter((g) => g.fav_line !== null), 'fav_line').map(([l, g]) => ({ l, n: g.length, p: g.filter((x) => x.home_ats === 'Push').length })).filter((x) => x.p > 0);
      C.bars(el, { cats: by.map((x) => d3.format('~g')(x.l)), xLabel: 'Spread', kind: 'pct', labels: false, series: [{ name: 'Push rate', color: C.col.violet(), values: by.map((x) => x.p / x.n), n: by.map((x) => x.n), extra: (i) => [{ label: 'Pushes', value: String(by[i].p) }] }] });
    });
  };

  const totals = (head, games, teamGames, P) => {
    const o = NE.ou(games);
    view.innerHTML = `${head}
      <p class="callout"><b>How totals are settled.</b> Combined points (home + away) against the closing total. Above is an over, below an under, equal a push. Over % = overs ÷ (overs + unders).</p>
      <div class="kpis">
        ${kpi({ label: 'Games graded', value: f.int(o.n), sub: `${o.rec} O-U-P` })}
        ${kpi({ label: 'Over %', value: f.pct(o.pct), ci: `95% range ${f.ci(o)}`, def: verdict(o) })}
        ${kpi({ label: 'Under %', value: f.pct(o.lpct), sub: `${o.l} unders` })}
        ${kpi({ label: 'Push %', value: f.pct(o.ppct), sub: `${o.p} pushes` })}
        ${kpi({ label: 'Avg closing total', value: f.n1(NE.mean(games, 'total_line')), sub: `median ${f.n1(NE.median(games, 'total_line'))}` })}
        ${kpi({ label: 'Avg combined points', value: f.n1(NE.mean(games, 'total_pts')), sub: `median ${f.n1(NE.median(games, 'total_pts'))}` })}
        ${kpi({ label: 'Points vs. total', value: f.s1(NE.mean(games, 'ou_margin')), sub: `avg miss ${f.n1(d3.mean(games, (g) => Math.abs(g.ou_margin)))}` })}
      </div>
      <div class="grid">
        ${card({ id: 'to-line', title: 'Closing total vs. actual points', note: 'Click a point to zoom in.' })}
        ${card({ id: 'to-over', title: 'Over % over time', note: 'Band = 95% range.' })}
        ${card({ id: 'to-bucket', title: 'Over % by closing total', note: 'Click a bar to list those games.' })}
        ${card({ id: 'to-scatter', title: 'Every game: total vs. points', note: 'Above the dashed line went over. Click a dot to open the game.' })}
      </div>
      ${card({ id: 'to-teams', title: 'Over % by team', note: 'All games involving each team. Grey = within chance of 50%. Click to open a team.' })}`;
    draw('to-line', (el) => C.line(el, { cats: P.cats, xLabel: P.label, series: [{ name: 'Closing total', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'total_line')), dash: true }, { name: 'Combined points', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'total_pts')), ...ciMean(P.groups.map((g) => [0, g]), 'total_pts') }], onClick: drill(P), hint: drillHint(P) }));
    draw('to-over', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [{ name: 'Over %', color: C.col.blue(), ...metricSeries('over', P.groups) }], onClick: drill(P), hint: drillHint(P) }));
    draw('to-bucket', (el) => {
      const r = NE.TOTAL_BUCKETS.map((k) => NE.ou(games.filter((g) => g.total_bucket === k)));
      C.bars(el, { cats: NE.TOTAL_BUCKETS, xLabel: 'Total', kind: 'pct', ref: 0.5, series: [{ name: 'Over %', color: C.col.blue(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec), extra: (i) => [{ label: 'O-U-P', value: r[i].rec }] }], onClick: (i) => NE.set({ tab: 'games', gx_total: NE.TOTAL_BUCKETS[i], gx_page: 0 }), hint: 'Click to list these games' });
    });
    draw('to-scatter', (el) => C.scatter(el, { points: games.map((g) => ({ x: g.total_line, y: g.total_pts, group: g.ou_result, id: g.game_id, label: `${g.away_team} @ ${g.home_team} · ${g.season} wk ${g.week}` })), groups: ouGroups(), diag: true, diagLabel: 'Points = total', xLabel: 'Closing total', yLabel: 'Combined points', onClick: (p) => openGame(p.id) }));
    draw('to-teams', (el) => C.hbars(el, { kind: 'pct', center: 0.5, noise: true, valueLabel: 'Over %', onClick: openTeam,
      rows: NE.teamTable(teamGames).filter((t) => t.ou.dec).map((t) => ({ label: t.team, value: t.ou.pct, lo: t.ou.lo, hi: t.ou.hi, lines: [{ label: 'O-U-P', value: t.ou.rec }] })).sort((a, b) => b.value - a.value) }));
  };

  const favdog = (head, games, P) => {
    const g = games.filter((x) => x.fav_side !== null);
    const su = NE.su(g, 'fav_su');
    const at = NE.ats(g, 'fav_ats');
    const wins = g.filter((x) => x.fav_su === 'W');
    view.innerHTML = `${head}
      <p class="callout"><b>Winning is not covering.</b> Straight up (SU) is who won the game. Against the spread (ATS) is whether the final margin beat the closing spread. The favorite is the side the closing spread favored.</p>
      <div class="kpis">
        ${kpi({ label: 'Favorite win % (SU)', value: f.pct(su.pct), ci: `95% range ${f.ci(su)}`, sub: su.rec })}
        ${kpi({ label: 'Underdog win % (SU)', value: f.pct(su.lpct), sub: `${su.l} outright upsets` })}
        ${kpi({ label: 'Favorite cover % (ATS)', value: f.pct(at.pct), ci: `95% range ${f.ci(at)}`, sub: at.rec, def: verdict(at) })}
        ${kpi({ label: 'Underdog cover % (ATS)', value: f.pct(at.lpct), sub: at.lrec })}
        ${kpi({ label: 'Avg favorite margin', value: f.s1(NE.mean(g, 'fav_margin')), sub: 'every game, losses included' })}
        ${kpi({ label: 'Margin when favorite wins', value: f.n1(NE.mean(wins, 'fav_margin')), sub: `${wins.length} wins` })}
        ${kpi({ label: 'Avg spread', value: f.n1(NE.mean(g, 'fav_line')), sub: `median ${f.n1(NE.median(g, 'fav_line'))}` })}
      </div>
      <div class="grid">
        ${card({ id: 'fd-bucket', title: 'Winning vs. covering, by spread size', note: 'Bigger favorites win far more often but do not cover more. Click to list games.' })}
        ${card({ id: 'fd-trend', title: 'Favorites over time', note: 'Win % (SU) against cover % (ATS).' })}
      </div>
      ${card({ id: 'fd-exact', title: 'By exact closing spread', note: 'Spreads with at least 15 games. Band = 95% range for the cover rate; thinner samples have wider bands.' })}`;
    draw('fd-bucket', (el) => {
      const b = NE.SPREAD_BUCKETS.map((k) => g.filter((x) => x.spread_bucket === k));
      const s = b.map((x) => NE.su(x, 'fav_su'));
      const a = b.map((x) => NE.ats(x, 'fav_ats'));
      C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, series: [
        { name: 'Won the game', color: C.col.blue(), values: s.map((r) => r.pct), lo: s.map((r) => r.lo), hi: s.map((r) => r.hi), n: s.map((r) => r.n) },
        { name: 'Covered the spread', color: C.col.teal(), values: a.map((r) => r.pct), lo: a.map((r) => r.lo), hi: a.map((r) => r.hi), n: a.map((r) => r.dec) },
      ], onClick: (i) => NE.set({ tab: 'games', gx_spread: NE.SPREAD_BUCKETS[i], gx_page: 0 }), hint: 'Click to list these games' });
    });
    draw('fd-trend', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, series: [{ name: 'Favorite win %', color: C.col.blue(), values: metricSeries('fav_win', P.groups).values }, { name: 'Favorite cover %', color: C.col.teal(), ...metricSeries('fav_cover', P.groups) }], onClick: drill(P), hint: drillHint(P) }));
    draw('fd-exact', (el) => {
      const by = NE.groupBy(g, 'fav_line').filter(([, x]) => x.length >= 15);
      const s = by.map(([, x]) => NE.su(x, 'fav_su'));
      const a = by.map(([, x]) => NE.ats(x, 'fav_ats'));
      C.line(el, { cats: by.map(([l]) => d3.format('~g')(l)), xLabel: 'Spread', kind: 'pct', ref: 0.5, series: [
        { name: 'Favorite win %', color: C.col.blue(), values: s.map((r) => r.pct) },
        { name: 'Favorite cover %', color: C.col.teal(), values: a.map((r) => r.pct), lo: a.map((r) => r.lo), hi: a.map((r) => r.hi), n: a.map((r) => r.dec) },
      ] });
    });
  };

  // =================================================================================
  // SIGNAL VS. NOISE
  // =================================================================================
  let sim = null;
  const FUNNEL = {
    cover: { label: 'Cover %', get: (t) => t.ats },
    over: { label: 'Over %', get: (t) => t.ou },
    win: { label: 'Win %', get: (t) => t.su },
  };
  const noise = () => {
    const { scopeTeamGames } = NE.data();
    if (!scopeTeamGames.length) { view.innerHTML = empty(); return; }
    const key = FUNNEL[S.funnel] ? S.funnel : 'cover';
    const table = NE.teamTable(scopeTeamGames);
    const pts = table.map((t) => { const r = FUNNEL[key].get(t); return { label: t.team, n: r.dec ?? r.n, p: r.pct }; }).filter((p) => p.n);
    const outside = pts.filter((p) => Math.abs(p.p - 0.5) > 1.96 * Math.sqrt(0.25 / p.n)).length;
    const persistKey = PERSIST[S.persist] ? S.persist : 'cover';
    const per = persistence(scopeTeamGames, persistKey);
    view.innerHTML = `
      <p class="callout"><b>Why this tab exists.</b> A team that covers 56% of the time looks like a pattern. But flip a fair coin 120 times and you will often get 56 heads or more. Every rate on this dashboard comes with a <b>95% range</b>: the values the true rate could plausibly take given how many games are behind it. When that range includes 50%, the pattern could be luck. This tab shows how much of the data is like that.</p>
      ${card({ id: 'funnel', title: `${FUNNEL[key].label}: which teams stand out from chance?`, note: `Each dot is a team. The blue band is where a 50/50 coin lands 95% of the time for that many games. <b>${outside} of ${pts.length}</b> teams fall outside it, and with ${pts.length} teams about ${f.n1(pts.length * 0.05)} would by luck alone.`, controls: sel('funnel', Object.entries(FUNNEL).map(([k, v]) => [k, v.label]), key, 'Measure') })}
      <div class="grid">
        ${card({ id: 'sim', title: 'Coin-flip simulator', note: 'Give every team the same number of games it really played, but decide each one with a fair coin. If the real teams spread out about as much as the coins, team ATS records are mostly noise.', controls: `<button type="button" class="btn" data-sim="1">Flip one season</button><button type="button" class="btn ghost" data-sim="1000">Run 1,000</button>`, body: `<div class="chart" data-chart="sim"></div><p class="sim-out" id="sim-out"></p>` })}
        ${card({ id: 'persist', title: `Does it carry over? ${PERSIST[persistKey].label}, one season to the next`, note: per.r === null ? 'Pick at least two seasons to compare.' : `Each dot is a team in one season (across) and the next (up). Correlation <b>${f.n2(per.r)}</b>: ${Math.abs(per.r) < 0.15 ? 'almost none, so last season tells you little.' : Math.abs(per.r) < 0.35 ? 'weak, so last season tells you a little.' : 'moderate, so it does carry over.'}`, controls: sel('persist', Object.entries(PERSIST).map(([k, v]) => [k, v.label]), persistKey, 'Measure') })}
      </div>
      <section class="card"><header class="card-h"><div><h3>How to read a 95% range</h3></div></header>
        <div class="explain">
          <p>The range comes from the Wilson score interval, a standard formula for a rate measured on a limited number of tries. It gets narrower as games pile up:</p>
          <table><thead><tr><th>Games</th><th class="num">A 55% rate could really be</th></tr></thead><tbody>
            ${[17, 50, 100, 300, 1000].map((n) => { const [lo, hi] = NE.wilson(Math.round(0.55 * n), n); return `<tr><td>${n}${n === 17 ? ' (one season)' : ''}</td><td class="num">${f.pct(lo)} to ${f.pct(hi)}</td></tr>`; }).join('')}
          </tbody></table>
          <p>Averages (points per game, closing totals) use ± 1.96 standard errors instead. A range that excludes 50% does not prove a lasting edge: with dozens of teams and splits, a few will clear it by luck.</p>
        </div>
      </section>`;
    draw('funnel', (el) => C.funnel(el, { points: pts, p0: 0.5, yLabel: FUNNEL[key].label, onClick: openTeam, selected: S.pteam }));
    draw('persist', (el) => C.scatter(el, { points: per.pts.map((p) => ({ ...p, id: p.team })), groups: [{ key: 'pair', name: 'Team-season pairs', color: C.col.teal() }], fit: true, xLabel: `${PERSIST[persistKey].label}, season N`, yLabel: `Season N + 1`, xFmt: PERSIST[persistKey].kind === 'pct' ? d3.format('.0%') : d3.format('+.1f'), yFmt: PERSIST[persistKey].kind === 'pct' ? d3.format('.0%') : d3.format('+.1f'), hline: PERSIST[persistKey].kind === 'pct' ? 0.5 : 0, vline: PERSIST[persistKey].kind === 'pct' ? 0.5 : 0, onClick: (p) => openTeam(p.team), clickHint: 'Click to open this team' }));
    drawSim(table);
  };
  const drawSim = (table) => {
    const el = view.querySelector('[data-chart="sim"]');
    if (!el) return;
    const actual = table.filter((t) => t.ats.dec).map((t) => ({ v: t.ats.pct, label: t.team }));
    const groups = [{ name: 'Real teams', color: C.col.blue(), points: actual }];
    if (sim && sim.single) groups.push({ name: 'Coin flips', color: C.col.orange(), points: sim.single });
    C.strip(el, { groups, center: 0.5, valueLabel: 'Cover %' });
    const out = view.querySelector('#sim-out');
    const sdReal = d3.deviation(actual, (p) => p.v) || 0;
    if (!sim) { out.textContent = `Real teams’ cover rates spread out by ${f.n1(sdReal * 100)} points (standard deviation). Flip the coins to compare.`; return; }
    if (sim.runs) {
      out.innerHTML = `Over <b>${f.int(sim.runs)}</b> simulated seasons, coin-flip teams spread out by <b>${f.n1(sim.meanSd * 100)}</b> points on average, against <b>${f.n1(sdReal * 100)}</b> for the real teams. Real teams spread out more than the coins in <b>${f.pct(sim.share)}</b> of runs. ${sim.share < 0.95 ? 'That is not enough to rule out luck: team ATS records look a lot like coin flips.' : 'So there is a little more spread than luck alone would give.'}`;
    } else {
      out.innerHTML = `This run: coins spread out by <b>${f.n1(sim.sd * 100)}</b> points, real teams by <b>${f.n1(sdReal * 100)}</b>. Flip again to see how much the coins themselves vary.`;
    }
  };
  const runSim = (runs) => {
    const { scopeTeamGames } = NE.data();
    const table = NE.teamTable(scopeTeamGames).filter((t) => t.ats.dec);
    const flip = () => table.map((t) => { let k = 0; for (let i = 0; i < t.ats.dec; i += 1) if (Math.random() < 0.5) k += 1; return { v: k / t.ats.dec, label: `${t.team} (coin)` }; });
    const sdReal = d3.deviation(table, (t) => t.ats.pct);
    if (runs === 1) { const single = flip(); sim = { single, sd: d3.deviation(single, (p) => p.v) }; } else {
      let sum = 0;
      let beat = 0;
      let single = null;
      for (let r = 0; r < runs; r += 1) { const s = flip(); const sd = d3.deviation(s, (p) => p.v); sum += sd; if (sdReal > sd) beat += 1; single = s; }
      sim = { single, runs, meanSd: sum / runs, share: beat / runs };
    }
    drawSim(NE.teamTable(scopeTeamGames));
  };

  // =================================================================================
  // GAME EXPLORER
  // =================================================================================
  const GX_COLS = [
    ['date', 'Date', (g) => g.date, 'text'], ['season', 'Season', (g) => g.season, 'num'], ['week', 'Wk', (g) => g.week, 'num'],
    ['away_team', 'Away', (g) => g.away_team, 'text'], ['away_score', 'Away pts', (g) => g.away_score, 'num'],
    ['home_team', 'Home', (g) => g.home_team, 'text'], ['home_score', 'Home pts', (g) => g.home_score, 'num'],
    ['winner', 'Winner', (g) => g.winner, 'text'], ['home_spread', 'Home line', (g) => g.home_spread, 'line'], ['favorite', 'Fav', (g) => g.favorite, 'text'],
    ['fav_ats', 'Fav ATS', (g) => g.fav_ats, 'pill'], ['ats_winner', 'Covered', (g) => g.ats_winner, 'text'],
    ['total_line', 'Total', (g) => g.total_line, 'n1'], ['total_pts', 'Combined', (g) => g.total_pts, 'num'], ['ou_result', 'O/U', (g) => g.ou_result, 'text'],
    ['home_ml', 'Home ML', (g) => g.home_ml, 'odds'], ['away_ml', 'Away ML', (g) => g.away_ml, 'odds'],
  ];
  const gxRows = () => {
    const { games } = NE.data();
    let rows = games;
    const t = S.gx_team;
    const o = S.gx_opp;
    if (t) rows = rows.filter((r) => r.home_team === t || r.away_team === t);
    if (o) rows = rows.filter((r) => r.home_team === o || r.away_team === o);
    if (t && S.gx_venue) rows = rows.filter((r) => (S.gx_venue === 'Neutral' ? r.neutral : !r.neutral && (S.gx_venue === 'Home' ? r.home_team === t : r.away_team === t)));
    if (t && S.gx_role) rows = rows.filter((r) => (S.gx_role === 'Favorite' ? r.favorite === t : r.underdog === t));
    if (S.gx_ats === 'fav') rows = rows.filter((r) => r.fav_ats === 'Cover');
    if (S.gx_ats === 'dog') rows = rows.filter((r) => r.fav_ats === 'No Cover');
    if (S.gx_ats === 'push') rows = rows.filter((r) => r.home_ats === 'Push');
    if (S.gx_ats === 'team-cover' && t) rows = rows.filter((r) => r.ats_winner === t);
    if (S.gx_ats === 'team-miss' && t) rows = rows.filter((r) => r.ats_winner !== t && r.ats_winner !== 'PUSH');
    if (S.gx_ou) rows = rows.filter((r) => r.ou_result === S.gx_ou);
    if (S.gx_spread) rows = rows.filter((r) => r.spread_bucket === S.gx_spread);
    if (S.gx_total) rows = rows.filter((r) => r.total_bucket === S.gx_total);
    if (S.gx_season) rows = rows.filter((r) => String(r.season) === S.gx_season);
    if (S.gx_week) rows = rows.filter((r) => String(r.week) === S.gx_week);
    if (S.gx_q) {
      const q = S.gx_q.toLowerCase();
      rows = rows.filter((r) => [r.game_id, r.home_team, r.away_team, r.home_qb, r.away_qb, r.home_coach, r.away_coach, r.stadium].join(' ').toLowerCase().includes(q));
    }
    const col = GX_COLS.find((c) => c[0] === S.gx_sort) || GX_COLS[0];
    const dir = S.gx_dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const x = col[2](a); const y = col[2](b);
      if (x === y) return a.game_id < b.game_id ? dir : -dir;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  };
  const cell = (v, kind) => {
    if (kind === 'line') return f.line(v);
    if (kind === 'odds') return f.odds(v);
    if (kind === 'n1') return f.n1(v);
    if (kind === 'pill') return pill(v);
    return v === null || v === undefined ? '—' : esc(v);
  };
  const PAGE = 50;
  const explorer = () => {
    const rows = gxRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    const page = Math.min(S.gx_page, pages - 1);
    const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
    const fav = NE.ats(rows, 'fav_ats');
    const o = NE.ou(rows);
    const tRows = S.gx_team ? NE.teamGames.filter((r) => r.team === S.gx_team && rows.some((g) => g.game_id === r.game_id)) : [];
    const ts = S.gx_team ? NE.ats(tRows) : null;
    const anyFilter = ['gx_team', 'gx_opp', 'gx_venue', 'gx_role', 'gx_ats', 'gx_ou', 'gx_spread', 'gx_total', 'gx_season', 'gx_week', 'gx_q'].some((k) => S[k]);
    const seasons = [...new Set(NE.data().games.map((g) => g.season))].sort((a, b) => b - a);
    view.innerHTML = `
      <section class="card">
        <div class="filters">
          ${sel('gx_team', teamOptions('Any team'), S.gx_team, 'Team')}
          ${sel('gx_opp', teamOptions('Any opponent'), S.gx_opp, 'Opponent')}
          ${S.gx_team ? sel('gx_venue', [['', 'Either'], ['Home', 'Home'], ['Away', 'Away'], ['Neutral', 'Neutral site']], S.gx_venue, 'Home / away') : ''}
          ${S.gx_team ? sel('gx_role', [['', 'Either'], ['Favorite', 'Favorite'], ['Underdog', 'Underdog']], S.gx_role, 'Fav / dog') : ''}
          ${sel('gx_ats', [['', 'Any'], ['fav', 'Favorite covered'], ['dog', 'Underdog covered'], ['push', 'Push'], ...(S.gx_team ? [['team-cover', `${S.gx_team} covered`], ['team-miss', `${S.gx_team} missed`]] : [])], S.gx_ats, 'Spread result')}
          ${sel('gx_ou', [['', 'Any'], ['Over', 'Over'], ['Under', 'Under'], ['Push', 'Push']], S.gx_ou, 'Total result')}
          ${sel('gx_spread', [['', 'Any'], ...NE.SPREAD_BUCKETS.map((b) => [b, b])], S.gx_spread, 'Spread range')}
          ${sel('gx_total', [['', 'Any'], ...NE.TOTAL_BUCKETS.map((b) => [b, b])], S.gx_total, 'Total range')}
          ${sel('gx_season', [['', 'Any'], ...seasons.map((s) => [String(s), String(s)])], S.gx_season, 'Season')}
          ${S.gx_season ? sel('gx_week', [['', 'Any'], ...[...new Set(NE.data().games.filter((g) => String(g.season) === S.gx_season).map((g) => g.week))].sort((a, b) => a - b).map((w) => [String(w), `Week ${w}`])], S.gx_week, 'Week') : ''}
          <label class="ctl grow"><span>Search</span><input id="gx-q" type="search" value="${esc(S.gx_q)}" placeholder="Team, QB, coach, stadium" data-key="gx_q"></label>
          ${anyFilter ? `<button type="button" class="btn ghost" data-go="${go({ gx_team: '', gx_opp: '', gx_venue: '', gx_role: '', gx_ats: '', gx_ou: '', gx_spread: '', gx_total: '', gx_season: '', gx_week: '', gx_q: '', gx_page: 0 })}">Clear</button>` : ''}
        </div>
      </section>
      <div class="explorer">
        <section class="card">
          <header class="card-h"><div><h3>${f.int(rows.length)} games</h3>
            <p class="note">${S.gx_team && ts ? `${esc(S.gx_team)}: ${ts.rec} ATS (${f.pct(ts.pct)}, range ${f.ci(ts)}) · ` : ''}Favorites ${fav.rec} ATS (${f.pct(fav.pct)}) · Totals ${o.rec} O-U-P. Click a column to sort, a row for details.</p></div>
            <div class="card-c"><button type="button" class="btn ghost" data-csv="1">Download CSV</button><button type="button" class="btn ghost" data-csv="copy">Copy CSV</button></div></header>
          <div class="tbl tall"><table class="gx"><thead><tr>${GX_COLS.map(([k, label, , kind]) => `<th data-sort="${k}" class="${kind === 'text' || kind === 'pill' ? '' : 'num'}" aria-sort="${S.gx_sort === k ? (S.gx_dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label}</th>`).join('')}</tr></thead>
            <tbody>${shown.map((g) => `<tr data-game="${esc(g.game_id)}" class="${g.game_id === S.game ? 'picked' : ''}">${GX_COLS.map(([, , get, kind]) => `<td class="${kind === 'text' || kind === 'pill' ? '' : 'num'}">${cell(get(g), kind)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <div class="pager">
            <button type="button" class="btn ghost" data-go="${go({ gx_page: Math.max(0, page - 1) })}" ${page === 0 ? 'disabled' : ''}>← Newer</button>
            <span>Page ${page + 1} of ${pages}</span>
            <button type="button" class="btn ghost" data-go="${go({ gx_page: Math.min(pages - 1, page + 1) })}" ${page >= pages - 1 ? 'disabled' : ''}>Older →</button>
          </div>
          <p class="note" id="csv-msg"></p>
        </section>
        <aside>${S.game ? detail(S.game) : '<p class="callout">Pick a game to see its closing lines, how each bet settled, both teams’ records going in, and how favorites have done at the same spread.</p>'}</aside>
      </div>`;
  };

  const detail = (id) => {
    const g = NE.games.find((x) => x.game_id === id);
    if (!g) return '';
    const h2h = NE.teamGames.filter((r) => r.team === g.home_team && r.opponent === g.away_team && r.date < g.date);
    const entering = (team) => {
      const prior = NE.teamGames.filter((r) => r.team === team && r.season === g.season && r.date < g.date);
      return prior.length ? `${NE.su(prior).rec} SU · ${NE.ats(prior).rec} ATS` : 'First game of the season';
    };
    const same = NE.games.filter((x) => x.fav_line === g.fav_line && x.game_id !== g.game_id);
    const sameAts = NE.ats(same, 'fav_ats');
    const sameSu = NE.su(same, 'fav_su');
    const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    return `<section class="card detail">
      <header class="card-h"><div><p class="note">${f.date(g.date)} · ${g.season} week ${g.week}${g.phase === 'POST' ? ' · playoffs' : ''}${g.overtime ? ' · overtime' : ''}</p></div>
        <div class="card-c"><button type="button" class="btn ghost" data-go="${go({ game: '' })}">Close</button></div></header>
      <div class="score">
        <span class="${g.result < 0 ? 'w' : ''}">${esc(g.away_team)} <small>away</small></span><b class="${g.result < 0 ? 'w' : ''}">${g.away_score}</b>
        <span class="${g.result > 0 ? 'w' : ''}">${esc(g.home_team)} <small>${g.neutral ? 'neutral site' : 'home'}</small></span><b class="${g.result > 0 ? 'w' : ''}">${g.home_score}</b>
      </div>
      <p class="note">${esc(g.stadium || '')}${g.away_qb ? ` · QBs: ${esc(g.away_qb)}, ${esc(g.home_qb)}` : ''}</p>
      <h4>Closing lines</h4>
      ${kv([['Spread', `${esc(g.home_team)} ${f.line(g.home_spread)}`], ['Favorite', g.favorite ? `${esc(g.favorite)} by ${f.n1(g.fav_line)}` : '—'], ['Spread prices (H / A)', `${f.odds(g.home_spread_odds)} / ${f.odds(g.away_spread_odds)}`], ['Total', f.n1(g.total_line)], ['Over / under prices', `${f.odds(g.over_odds)} / ${f.odds(g.under_odds)}`], ['Moneyline (H / A)', `${f.odds(g.home_ml)} / ${f.odds(g.away_ml)}`], ['No-vig win chance (H / A)', `${f.pct0(g.home_imp)} / ${f.pct0(g.away_imp)}`]])}
      <h4>How it settled</h4>
      ${kv([['Winner', esc(g.winner === 'TIE' ? 'Tie' : g.winner)], ['Favorite ATS', `${pill(g.fav_ats)} ${f.s1(g.fav_ats_margin)}`], ['Covered', esc(g.ats_winner ?? '—')], ['Combined points', g.total_pts], ['Total', `${g.ou_result ?? '—'} ${f.s1(g.ou_margin)}`]])}
      <h4>Context</h4>
      ${kv([[`${esc(g.away_team)} going in`, entering(g.away_team)], [`${esc(g.home_team)} going in`, entering(g.home_team)], [`Earlier meetings (${esc(g.home_team)} side)`, h2h.length ? `${NE.su(h2h).rec} SU · ${NE.ats(h2h).rec} ATS` : 'None since 2020'], [`Favorites at ${f.n1(g.fav_line)} since 2020`, same.length ? `${sameSu.rec} SU · ${sameAts.rec} ATS (${f.pct(sameAts.pct)}, range ${f.ci(sameAts)})` : '—']])}
    </section>`;
  };

  const csv = (mode) => {
    const rows = gxRows();
    const cols = ['game_id', 'date', 'season', 'week', 'game_type', 'away_team', 'away_score', 'home_team', 'home_score', 'neutral', 'winner', 'spread_line', 'home_spread', 'favorite', 'fav_line', 'fav_ats', 'home_ats', 'ats_winner', 'total_line', 'total_pts', 'ou_result', 'home_ml', 'away_ml', 'home_spread_odds', 'away_spread_odds', 'over_odds', 'under_odds', 'stadium'];
    const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const text = [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
    const msg = view.querySelector('#csv-msg');
    if (mode === 'copy') {
      const done = () => { if (msg) msg.textContent = `Copied ${f.int(rows.length)} rows. Paste into a spreadsheet.`; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => { if (msg) msg.textContent = 'Copy was blocked here; use Download CSV instead.'; });
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = 'nfl_edge_games.csv';
      document.body.append(a);
      a.click();
      a.remove();
      if (msg) msg.textContent = `Downloaded ${f.int(rows.length)} rows. If nothing saved, this viewer blocks downloads: use Copy CSV.`;
    } catch (e) { if (msg) msg.textContent = 'Download was blocked here; use Copy CSV.'; }
  };

  // =================================================================================
  // ODDS & MARKET
  // =================================================================================
  const market = () => {
    const { games, teamGames } = NE.data();
    if (!games.length) { view.innerHTML = empty(); return; }
    const P = periodGroups(games);
    const sErr = games.filter((g) => g.home_ats_margin !== null);
    const both = games.filter((g) => g.home_spread_odds !== null);
    const std = both.filter((g) => g.home_spread_odds === -110 && g.away_spread_odds === -110).length / (both.length || 1);
    view.innerHTML = `
      <p class="callout warn"><b>What this data can’t show.</b> One consensus closing line per game: spread, total, moneyline and their prices. No opening lines, no timestamps, no sportsbook names. So line movement, opening vs. closing, price changes and book-to-book comparisons are left out rather than estimated.</p>
      <div class="kpis">
        ${kpi({ label: 'Spread: avg miss', value: f.n1(d3.mean(sErr, (g) => Math.abs(g.home_ats_margin))), sub: `home bias ${f.s1(d3.mean(sErr, (g) => g.home_ats_margin))}`, def: '|final home margin − closing line|' })}
        ${kpi({ label: 'Total: avg miss', value: f.n1(d3.mean(games, (g) => Math.abs(g.ou_margin))), sub: `bias ${f.s1(NE.mean(games, 'ou_margin'))}` })}
        ${kpi({ label: 'Moneyline margin', value: f.pct(NE.mean(games, 'ml_hold')), sub: `spread ${f.pct(NE.mean(games, 'spread_hold'))} · total ${f.pct(NE.mean(games, 'total_hold'))}`, def: 'The bookmaker’s cut: both sides’ implied chances minus 100%.' })}
        ${kpi({ label: 'Spreads at −110 both ways', value: f.pct(std), sub: 'of games with spread prices' })}
      </div>
      <div class="grid">
        ${card({ id: 'mk-scatter', title: 'Closing spread vs. final margin', note: 'Home side. Above the dashed line the home team covered. Click a dot to open the game.' })}
        ${card({ id: 'mk-mae', title: 'How far closing lines missed', note: 'Average points between line and result, with 95% ranges.' })}
        ${card({ id: 'mk-calib', title: 'Moneyline price vs. how often favorites won', note: 'Whiskers are 95% ranges. Dots near the dashed line: prices matched results.' })}
        ${card({ id: 'mk-hold', title: 'Bookmaker margin at close', note: 'The jump in 2023 hits all three markets at once: most likely a change of odds provider in the source, not the market. Compare across it with care.' })}
        ${card({ id: 'mk-prices', title: 'Closing spread prices', note: 'Both sides of every spread, shortest to longest. Orange is the standard −110.' })}
        ${card({ id: 'mk-spreads', title: 'Closing spreads', note: 'Points laid by the favorite. Orange marks 3 and 7. Click a bar to list those games.' })}
      </div>
      ${card({ id: 'mk-wins', title: 'Actual wins vs. wins the prices implied', note: 'Wins minus the sum of each game’s no-vig win chance (a tie counts half). This describes past prices, not a forecast. Click a team to open it.' })}`;
    draw('mk-scatter', (el) => C.scatter(el, { points: sErr.map((g) => ({ x: g.spread_line, y: g.result, group: g.home_ats, id: g.game_id, label: `${g.away_team} @ ${g.home_team} · ${g.season} wk ${g.week}` })), groups: [{ key: 'Cover', name: 'Home covered', color: C.col.blue() }, { key: 'No Cover', name: 'Away covered', color: C.col.orange() }, { key: 'Push', name: 'Push', color: C.col.muted() }], diag: true, diagLabel: 'Margin = line', zero: true, xLabel: 'Points home was favored by', yLabel: 'Home margin', onClick: (p) => openGame(p.id) }));
    draw('mk-mae', (el) => C.line(el, { cats: P.cats, xLabel: P.label, series: [{ name: 'Spread', color: C.col.blue(), ...metricSeries('spread_mae', P.groups) }, { name: 'Total', color: C.col.orange(), ...metricSeries('total_mae', P.groups) }], onClick: drill(P), hint: drillHint(P) }));
    draw('mk-calib', (el) => {
      const g = games.filter((x) => x.fav_side && x.home_imp !== null).map((x) => ({ imp: x.fav_side === 'home' ? x.home_imp : x.away_imp, su: x.fav_su }));
      const rows = d3.range(10).map((i) => { const lo = 0.5 + i * 0.05; const v = g.filter((x) => x.imp >= lo && (x.imp < lo + 0.05 || (i === 9 && x.imp <= 1))); if (!v.length) return null; const s = NE.su(v); return { bucket: `${Math.round(lo * 100)}–${Math.round(lo * 100 + 5)}%`, imp: d3.mean(v, (x) => x.imp), won: s.pct, lo: s.lo, hi: s.hi, n: v.length }; }).filter(Boolean);
      C.calib(el, rows);
    });
    draw('mk-hold', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', series: [{ name: 'Moneyline', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'ml_hold')) }, { name: 'Spread', color: C.col.teal(), values: P.groups.map((g) => NE.mean(g, 'spread_hold')) }, { name: 'Total', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'total_hold')) }] }));
    draw('mk-prices', (el) => {
      const prob = (v) => (v < 0 ? -v / (-v + 100) : 100 / (v + 100));
      const counts = d3.rollups(games.flatMap((g) => [g.home_spread_odds, g.away_spread_odds]).filter((v) => v !== null), (v) => v.length, (v) => v).sort((a, b) => prob(b[0]) - prob(a[0]));
      const tot = d3.sum(counts, (c) => c[1]);
      C.bars(el, { cats: counts.map((c) => f.odds(c[0])), kind: 'num', labels: false, series: [{ name: 'Sides', color: C.col.blue(), colors: counts.map((c) => (c[0] === -110 ? C.col.orange() : C.col.blue())), values: counts.map((c) => c[1]), extra: (i) => [{ label: 'Share', value: f.pct(counts[i][1] / tot) }] }] });
    });
    draw('mk-spreads', (el) => C.hist(el, { values: games.map((g) => g.fav_line), step: 0.5, highlight: [3, 7], xLabel: 'Points laid', onClick: (v) => NE.set({ tab: 'games', gx_spread: NE.spreadBucket(v), gx_page: 0 }) }));
    draw('mk-wins', (el) => C.hbars(el, { kind: 'num', center: 0, valueLabel: 'Wins vs. implied', onClick: openTeam,
      rows: NE.teamTable(teamGames).map((t) => ({ label: t.team, value: t.winsOverExp, lines: [{ label: 'Actual wins', value: String(t.su.w) }, { label: 'Implied wins', value: f.n1(t.expWins) }, { label: 'Games', value: String(t.n) }] })).sort((a, b) => b.value - a.value) }));
  };

  // =================================================================================
  // DATA
  // =================================================================================
  const data = () => {
    const m = NE.raw.meta;
    const G = NE.games;
    const before = G.filter((g) => g.season < 2023 && g.ml_hold !== null);
    const after = G.filter((g) => g.season >= 2023 && g.ml_hold !== null);
    view.innerHTML = `
      <p class="callout">Source: nflverse <code>games.csv</code> (github.com/nflverse/nfldata), downloaded ${esc(m.downloaded)}. Seasons ${NE.seasons[0]}–${NE.latestSeason}, through week ${NE.latestWeek}. All figures are calculated in this page from that file.</p>
      <div class="kpis">
        ${kpi({ label: 'Rows in source (2020+)', value: f.int(m.rows_2020), sub: `${f.int(m.unplayed)} scheduled games left out` })}
        ${kpi({ label: 'Completed games', value: f.int(G.length) })}
        ${kpi({ label: 'Duplicates', value: f.int(m.duplicate_ids + m.duplicate_matchups), sub: 'by game id and by date + teams' })}
        ${kpi({ label: 'Missing lines', value: f.int(G.filter((g) => g.spread_line === null || g.total_line === null || g.home_ml === null).length), sub: 'among completed games' })}
        ${kpi({ label: 'Neutral-site games', value: f.int(G.filter((g) => g.neutral).length), sub: 'left out of home-field rates' })}
        ${kpi({ label: 'Ties', value: f.int(G.filter((g) => g.result === 0).length), sub: 'count as games, not wins' })}
        ${kpi({ label: 'Pushes', value: f.int(G.filter((g) => g.home_ats === 'Push').length), sub: `spread · ${f.int(G.filter((g) => g.ou_result === 'Push').length)} totals` })}
        ${kpi({ label: 'Moneyline margin', value: f.pct(d3.mean(after, (g) => g.ml_hold)), sub: `from 2023 · ${f.pct(d3.mean(before, (g) => g.ml_hold))} before` })}
      </div>
      <div class="grid">
        <section class="card"><header class="card-h"><div><h3>What to know about the data</h3></div></header>
          <ul class="list">
            <li>One consensus closing line per game. No opening lines, timestamps or sportsbook names.</li>
            <li>Scheduled games without a final score are left out: no future game appears anywhere.</li>
            <li>Neutral-site games (international games, Super Bowls) keep the listed home team but never count toward home-field rates.</li>
            <li>The bookmaker margin steps up in 2023 in every market at once, most likely a change of odds provider in the source.</li>
            <li>No team box-score statistics, so team views use scores and lines only.</li>
            <li>The latest season is in progress; its 95% ranges are wider.</li>
          </ul></section>
        <section class="card"><header class="card-h"><div><h3>Definitions</h3></div></header>
          <dl class="kv wide">
            <dt>Spread</dt><dd>Shown from a team’s side: negative means favored (KC −3.5 must win by 4). The source stores it as points the home team was favored by.</dd>
            <dt>Cover / push</dt><dd>Final margin + own spread above zero is a cover, zero a push, below zero a miss.</dd>
            <dt>Cover %</dt><dd>Covers ÷ (covers + misses). Pushes reported separately.</dd>
            <dt>Total</dt><dd>Closing over/under on combined points. Over % = overs ÷ (overs + unders).</dd>
            <dt>Moneyline</dt><dd>American odds to win outright. −150: risk 150 to win 100. +130: risk 100 to win 130.</dd>
            <dt>No-vig chance</dt><dd>Each side’s implied chance divided by the two sides’ sum, removing the bookmaker margin.</dd>
            <dt>Favorite</dt><dd>The side the closing spread favored; a zero spread falls back to the shorter moneyline.</dd>
            <dt>Win %</dt><dd>Wins ÷ games played. Ties stay in the games played.</dd>
            <dt>95% range</dt><dd>Wilson score interval for rates; ± 1.96 standard errors for averages.</dd>
          </dl></section>
      </div>`;
  };

  // =================================================================================
  // Shell: header chips, tabs, events
  // =================================================================================
  const VIEWS = { story, overview, teams, betting, noise, games: explorer, market, data };

  const renderChrome = () => {
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === S.tab));
    const { games } = NE.data();
    const bar = document.getElementById('filters');
    const seasons = NE.seasons.map((s) => [s, String(s)]);
    bar.innerHTML = `
      ${sel('s0', seasons, S.s0, 'From')}
      ${sel('s1', seasons, S.s1, 'To')}
      <div class="ctl"><span>Games</span>${seg('phase', [['All', 'All'], ['REG', 'Regular'], ['POST', 'Playoffs']], S.phase)}</div>
      ${sel('team', teamOptions('All teams'), S.team, 'Team')}
      <label class="ctl check"><input type="checkbox" data-key="neutral" ${S.neutral ? 'checked' : ''}> <span>Neutral sites</span></label>
      <button type="button" class="btn ghost" data-reset="1" ${NE.filtersAreDefault() ? 'disabled' : ''}>Reset</button>`;
    const chips = document.getElementById('chips');
    chips.innerHTML = S.tab === 'story' || S.tab === 'data'
      ? `<span class="chip">This tab always uses every season; the filters apply to the other tabs.</span>`
      : `<span class="chip strong">${f.int(games.length)} games</span>${games.length ? `<span class="chip">${f.date(games[0].date)} – ${f.date(games[games.length - 1].date)}</span>` : ''}${S.team ? `<span class="chip">${esc(S.team)} games only</span>` : ''}${S.phase !== 'All' ? `<span class="chip">${S.phase === 'REG' ? 'Regular season' : 'Playoffs'}</span>` : ''}${!S.neutral ? '<span class="chip">No neutral sites</span>' : ''}`;
  };

  let lastTab = null;
  const render = () => {
    const active = document.activeElement;
    const focusId = active && active.id;
    const caret = active && active.selectionStart;
    renderChrome();
    VIEWS[S.tab] ? VIEWS[S.tab]() : overview();
    if (S.tab !== lastTab) { window.scrollTo({ top: 0 }); lastTab = S.tab; }
    if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); if (caret !== null && el.setSelectionRange) el.setSelectionRange(caret, caret); } }
  };
  NE.render = render;
  NE.listeners.push(render);

  // Events: one set of delegated handlers for the whole page.
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-tab],[data-reset],[data-sort],[data-game],[data-sim],[data-csv]');
    if (!t) return;
    if (t.dataset.tab) return NE.set({ tab: t.dataset.tab });
    if (t.dataset.reset) return NE.resetFilters();
    if (t.dataset.sim) return runSim(Number(t.dataset.sim));
    if (t.dataset.csv) return csv(t.dataset.csv);
    if (t.dataset.sort) return NE.set({ gx_sort: t.dataset.sort, gx_dir: S.gx_sort === t.dataset.sort && S.gx_dir === 'desc' ? 'asc' : 'desc', gx_page: 0 });
    if (t.dataset.game) return NE.set({ game: t.dataset.game });
    if (t.dataset.go) return NE.set(JSON.parse(t.dataset.go));
    return undefined;
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-go][role="button"]')) { e.preventDefault(); NE.set(JSON.parse(e.target.dataset.go)); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.key || el.id === 'gx-q') return;
    const k = el.dataset.key;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (typeof NE.DEFAULTS[k] === 'number') v = Number(v);
    const patch = { [k]: v };
    if (k.startsWith('gx_')) patch.gx_page = 0;
    if (k === 'gx_team' && !v) Object.assign(patch, { gx_venue: '', gx_role: '' });
    if (k === 'gx_season' && !v) patch.gx_week = '';
    NE.set(patch);
  });
  let typing;
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'gx-q') return;
    clearTimeout(typing);
    const v = e.target.value;
    typing = setTimeout(() => NE.set({ gx_q: v, gx_page: 0 }), 250);
  });
  let resizeTimer;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastW) < 30) return;
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 200);
  });

  NE.readHash();
  render();
})();
