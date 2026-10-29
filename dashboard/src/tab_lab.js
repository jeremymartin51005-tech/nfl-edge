// Trend lab: test any situation against chance, see every situation scanned, and how much
// of a team's record luck alone can produce.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;

  const FUNNEL = {
    cover: { label: 'Cover %', get: (t) => t.ats },
    over: { label: 'Over %', get: (t) => t.ou },
    win: { label: 'Win %', get: (t) => t.su },
  };
  let sim = null;

  const tester = (scopeTeamGames) => {
    const spec = NE.specFromState();
    const rows = NE.trendRows(spec, scopeTeamGames);
    const res = NE.trendResult(spec, rows);
    const bySeason = NE.groupBy(rows, 'season').map(([s, r]) => [s, NE.trendResult(spec, r)]);
    const above = bySeason.filter(([, r]) => r.n > 0 && r.rate > r.base).length;
    const counted = bySeason.filter(([, r]) => r.n > 0).length;
    const v = NE.verdict(res);
    let beText = '';
    if (!res.implied && res.breakeven && res.n) {
      if (res.lo > res.breakeven) beText = `<span class="pill good">Clears break-even (${f.pct(res.breakeven)}) beyond chance</span>`;
      else if (res.rate > res.breakeven) beText = `<span class="pill neutral">Above break-even (${f.pct(res.breakeven)}), but within chance of it</span>`;
      else beText = `<span class="pill bad">Below break-even (${f.pct(res.breakeven)})</span>`;
    }
    const sides = NE.sideOptions(spec.market, spec.team).map((k) => [k, k === 'team' ? `${spec.team}: every game` : NE.SIDES[k].label]);
    const rateWord = { spread: 'covered', total: 'went over', ml: 'won' }[spec.market];
    return `
      <section class="card lab" id="card-lab-test">
        <header class="card-h"><div><h3>Is this trend real?${U.info('Build a situation from closing-line data. The lab finds every matching game under the global filters, then shows the record, the rate and its 95% range, and whether the rate is beyond what chance alone would give. Spread and total situations are judged against 50% and against break-even at the closing prices; moneyline situations are judged against the win chance the prices implied.')}</h3>
          <p class="note">Pick a market and describe a situation. Seasons, dates and game type come from the filters at the top.</p></div>
          <div class="card-c"><button type="button" class="btn ghost" data-reset-keys="tt">Reset situation</button></div></header>
        <div class="filters">
          ${U.seg('tt_market', [['spread', 'Spread'], ['total', 'Total'], ['ml', 'Moneyline']], spec.market, 'Market')}
          ${U.sel('tt_side', sides, spec.side, spec.market === 'total' ? 'Games' : 'Side')}
          ${U.sel('tt_team', U.teamOptions('Any team'), spec.team, 'Team')}
          ${U.sel('tt_opp', U.teamOptions('Any opponent'), spec.opp, 'Opponent')}
          ${U.range('tt_smin', 'tt_smax', spec.smin, spec.smax, 'Spread (points laid)', '0', 'any')}
          ${U.range('tt_tmin', 'tt_tmax', spec.tmin, spec.tmax, 'Closing total', 'any', 'any')}
          ${U.sel('tt_div', [['any', 'Any game'], ['yes', 'Division games'], ['no', 'Non-division']], spec.div, 'Division')}
          ${U.sel('tt_rest', [['any', 'Any rest'], ['more', 'More rest than opponent'], ['same', 'Same rest'], ['less', 'Less rest than opponent']], spec.rest, 'Rest')}
        </div>
        <div class="lab-out">
          <div class="lab-num">
            <span class="lab-label">${esc(NE.specLabel(spec))}</span>
            <span class="lab-rate">${f.pct(res.rate)}</span>
            <span class="lab-sub">${res.kind} · ${res.rec} (${res.recLabel}) · ${f.int(res.n)} graded game${res.n === 1 ? '' : 's'}</span>
            <span class="lab-sub">95% range ${f.ci(res)} · baseline ${res.implied ? `${f.pct(res.base)} (price-implied)` : '50%'}</span>
            <div class="lab-pills"><span class="pill ${v.tone}">${esc(v.text)}</span>${beText}</div>
            <p class="note">${res.n ? `It ${rateWord} more often than ${res.implied ? 'the prices implied' : '50%'} in <b>${above} of ${counted}</b> season${counted === 1 ? '' : 's'}.` : ''} ${res.n && res.n < 30 ? 'Fewer than 30 games: treat any rate here as a rough guess.' : ''}</p>
            <button type="button" class="btn" data-go="${U.go(NE.specToExplorer(spec))}" ${res.games ? '' : 'disabled'}>Show these ${f.int(res.games)} games →</button>
            ${spec.rest !== 'any' ? '<p class="note">The game list cannot filter by rest, so it will include every rest situation.</p>' : ''}
          </div>
          <div class="lab-charts">
            <div class="chart" data-chart="lab-ci" style="min-height:92px"></div>
            <div class="chart" data-chart="lab-season"></div>
          </div>
        </div>
      </section>`;
  };

  const scanCard = (scopeTeamGames) => {
    const scan = NE.scan(scopeTeamGames);
    const flagged = scan.filter((x) => x.flagged).length;
    const cols = [
      ['label', 'Situation', (x) => x.spec.label, 'text'],
      ['market', 'Market', (x) => NE.MARKETS[x.spec.market], 'text'],
      ['n', 'Games', (x) => x.res.n, 'int'],
      ['rec', 'Record', (x) => x.res.rec, 'text'],
      ['rate', 'Rate', (x) => x.res.rate, 'pct'],
      ['range', '95% range', (x) => f.ci(x.res), 'text'],
      ['base', 'Baseline', (x) => x.res.base, 'pct'],
      ['z', 'Distance from baseline', (x) => `${x.z > 0 ? '+' : '−'}${d3.format('.1f')(Math.abs(x.z))} SE`, 'text', 'How many standard errors the rate sits from its baseline. Beyond about ±2 the 95% range excludes the baseline.', (x) => Math.abs(x.z)],
      ['verdict', 'Verdict', (x) => (x.flagged ? `<span class="pill ${x.z > 0 ? 'good' : 'bad'}">Outside chance</span>` : '<span class="pill neutral">Within chance</span>'), 'html'],
    ];
    const rows = U.sortRows(scan, cols, S.scan_sort, S.scan_dir);
    return `
      <section class="card" id="card-lab-scan">
        <header class="card-h"><div><h3>Every situation the dashboard tests${U.info('A fixed list of common betting situations, each tested against its baseline under the current filters. Situations with fewer than 30 graded games are skipped.')}</h3>
          <p class="note"><b>${flagged}</b> of <b>${scan.length}</b> sit outside chance; luck alone would put about <b>${f.n1(scan.length * 0.05)}</b> there. Click a row to load it into the tester.</p></div></header>
        ${U.table({ cols, rows, sortKey: S.scan_sort, sortDir: S.scan_dir, sortParam: 'scan_sort', dirParam: 'scan_dir', cls: 'tall',
          rowAttrs: (x) => `class="clickable${x.flagged ? ' flag' : ''}" data-go="${U.go({ tt_market: x.spec.market, tt_side: x.spec.side, tt_team: x.spec.team, tt_opp: x.spec.opp, tt_smin: x.spec.smin, tt_smax: x.spec.smax, tt_tmin: x.spec.tmin, tt_tmax: x.spec.tmax, tt_div: x.spec.div, tt_rest: x.spec.rest, _scroll: 'card-lab-test' })}"` })}
      </section>`;
  };

  NE.tabs.lab = (root) => {
    const { scopeTeamGames } = NE.data();
    if (!scopeTeamGames.length) { root.innerHTML = U.empty(); return; }
    const key = FUNNEL[S.funnel] ? S.funnel : 'cover';
    const table = NE.teamTable(scopeTeamGames);
    const pts = table.map((t) => { const r = FUNNEL[key].get(t); return { label: t.team, n: r.dec, p: r.pct }; }).filter((p) => p.n);
    const outside = pts.filter((p) => Math.abs(p.p - 0.5) > 1.96 * Math.sqrt(0.25 / p.n)).length;
    const persistKey = NE.PERSIST[S.persist] ? S.persist : 'cover';
    const per = NE.persistence(scopeTeamGames, persistKey);
    const simKey = NE.GLOBAL_KEYS.map((k) => S[k]).join('|');
    if (sim && sim.key !== simKey) sim = null;
    const strength = per.r === null ? '' : Math.abs(per.r) < 0.15 ? 'almost none, so last season tells you very little' : Math.abs(per.r) < 0.35 ? 'weak, so last season tells you a little' : 'moderate, so it does carry over';

    root.innerHTML = `
      <div class="page-h"><div><h2>Trend lab</h2><p class="lede">Any record can look like a pattern. This tab checks whether a pattern is bigger than what chance alone produces, and whether it holds up from season to season. The Team filter is ignored here so every team can be compared.</p></div></div>
      ${tester(scopeTeamGames)}
      ${scanCard(scopeTeamGames)}
      <div class="grid">
        ${U.card({ id: 'lab-funnel', title: `${FUNNEL[key].label}: which teams stand out from chance?`, info: 'Each dot is a team: its rate (up) against how many graded games it played (across). The blue band is where a fair coin lands 95% of the time for that many games; it narrows as games pile up.', note: `<b>${outside} of ${pts.length}</b> teams fall outside the band; with ${pts.length} teams, about ${f.n1(pts.length * 0.05)} would by luck alone. Click a team to open it.`, controls: U.sel('funnel', Object.entries(FUNNEL).map(([k, v]) => [k, v.label]), key, 'Measure') })}
        ${U.card({ id: 'lab-sim', title: 'Coin-flip simulator', info: 'Each team keeps its real number of graded games, but every game is decided by a fair coin. If real teams spread out about as much as the coin-flip teams, team ATS records are mostly noise.', note: 'Same number of games per team, decided by a fair coin.', controls: '<button type="button" class="btn" data-sim="1">Flip one season</button><button type="button" class="btn ghost" data-sim="1000">Run 1,000</button>', body: '<div class="chart" data-chart="lab-sim"></div><p class="sim-out" id="sim-out"></p>' })}
      </div>
      ${U.card({ id: 'lab-persist', title: `Does it carry over? ${NE.PERSIST[persistKey].label}, one season to the next`, info: 'Each dot is a team in one season (across) and the following season (up); team-seasons with fewer than 8 games are left out. A correlation near 0 means one season tells you little about the next.', note: per.r === null ? 'Pick at least two seasons in the filters to compare.' : `Correlation <b>${f.n2(per.r)}</b> across ${f.int(per.pts.length)} team-season pairs: ${strength}. Click a dot to open the team.`, controls: U.sel('persist', Object.entries(NE.PERSIST).map(([k, v]) => [k, v.label]), persistKey, 'Measure') })}
      <section class="card" id="card-lab-read"><header class="card-h"><div><h3>How to read a 95% range</h3></div></header>
        <div class="explain">
          <p>Rates use the Wilson score interval, a standard formula for a rate measured over a limited number of tries. The range narrows as games pile up:</p>
          <table><thead><tr><th>Graded games</th><th class="num">A 55% rate could really be</th></tr></thead><tbody>
            ${[17, 50, 100, 300, 1000].map((n) => { const [lo, hi] = NE.wilson(Math.round(0.55 * n), n); return `<tr><td>${n}${n === 17 ? ' (one team-season)' : ''}</td><td class="num">${f.pct(lo)} to ${f.pct(hi)}</td></tr>`; }).join('')}
          </tbody></table>
          <p>Averages (points per game, closing totals, margins) use ± 1.96 standard errors. A range that excludes the baseline does not prove a lasting edge: with dozens of teams and situations, about 1 in 20 clear it by luck, and markets adjust once a pattern is widely known.</p>
        </div>
      </section>`;

    const spec = NE.specFromState();
    const rows = NE.trendRows(spec, scopeTeamGames);
    const res = NE.trendResult(spec, rows);
    U.draw(root, 'lab-ci', (el) => C.ciStrip(el, { rate: res.rate, lo: res.lo, hi: res.hi, base: res.base, baseLabel: res.implied ? `implied ${f.pct(res.base)}` : '50%', breakeven: res.implied ? null : res.breakeven }));
    U.draw(root, 'lab-season', (el) => {
      const by = NE.groupBy(rows, 'season').map(([s, r]) => [s, NE.trendResult(spec, r)]);
      C.line(el, { h: 220, cats: by.map((x) => x[0]), xLabel: 'Season', kind: 'pct', ref: res.implied ? null : 0.5, series: [
        { name: res.kind, color: C.col.blue(), values: by.map((x) => x[1].rate), lo: by.map((x) => x[1].lo), hi: by.map((x) => x[1].hi), n: by.map((x) => x[1].n) },
        ...(res.implied ? [{ name: 'Price-implied', color: C.col.orange(), values: by.map((x) => x[1].base), dash: true }] : []),
      ] });
    });
    U.draw(root, 'lab-funnel', (el) => C.funnel(el, { points: pts, p0: 0.5, yLabel: FUNNEL[key].label, onClick: U.openTeam, selected: S.pteam }));
    U.draw(root, 'lab-persist', (el) => {
      const pct = NE.PERSIST[persistKey].kind === 'pct';
      C.scatter(el, { points: per.pts.map((p) => ({ ...p, id: p.team })), groups: [{ key: 'pair', name: 'Team-season pairs', color: C.col.teal() }], fit: true, xLabel: `${NE.PERSIST[persistKey].label}, one season`, yLabel: 'The next season', xFmt: pct ? d3.format('.0%') : d3.format('+.1f'), yFmt: pct ? d3.format('.0%') : d3.format('+.1f'), hline: pct ? 0.5 : 0, vline: pct ? 0.5 : 0, onClick: (p) => U.openTeam(p.team), clickHint: 'Click to open this team' });
    });
    drawSim(root, table);
  };

  const drawSim = (root, table) => {
    const el = root.querySelector('[data-chart="lab-sim"]');
    if (!el) return;
    const actual = table.filter((t) => t.ats.dec).map((t) => ({ v: t.ats.pct, label: t.team }));
    const groups = [{ name: 'Real teams', color: C.col.blue(), points: actual }];
    if (sim && sim.single) groups.push({ name: 'Coin flips', color: C.col.orange(), points: sim.single });
    C.strip(el, { groups, center: 0.5, valueLabel: 'Cover %' });
    const out = root.querySelector('#sim-out');
    const sdReal = d3.deviation(actual, (p) => p.v) || 0;
    if (!sim) { out.innerHTML = `Real teams’ cover rates spread out by <b>${f.n1(sdReal * 100)}</b> points (standard deviation). Flip the coins to compare.`; return; }
    if (sim.runs) {
      out.innerHTML = `Over <b>${f.int(sim.runs)}</b> simulated seasons, coin-flip teams spread out by <b>${f.n1(sim.meanSd * 100)}</b> points on average, against <b>${f.n1(sdReal * 100)}</b> for the real teams. Real teams spread out more than the coins in <b>${f.pct(sim.share)}</b> of runs. ${sim.share < 0.95 ? 'That is not enough to rule out luck: team ATS records look a lot like coin flips.' : 'So real teams vary a little more than luck alone would make them.'}`;
    } else {
      out.innerHTML = `This run: the coins spread out by <b>${f.n1(sim.sd * 100)}</b> points, the real teams by <b>${f.n1(sdReal * 100)}</b>. Flip again to see how much the coins themselves vary.`;
    }
  };
  NE.runSim = (runs, root) => {
    const { scopeTeamGames } = NE.data();
    const table = NE.teamTable(scopeTeamGames);
    const teams = table.filter((t) => t.ats.dec);
    const flip = () => teams.map((t) => { let k = 0; for (let i = 0; i < t.ats.dec; i += 1) if (Math.random() < 0.5) k += 1; return { v: k / t.ats.dec, label: `${t.team} (coin)` }; });
    const sdReal = d3.deviation(teams, (t) => t.ats.pct);
    const key = NE.GLOBAL_KEYS.map((k) => S[k]).join('|');
    if (runs === 1) { const single = flip(); sim = { key, single, sd: d3.deviation(single, (p) => p.v) }; } else {
      let sum = 0;
      let beat = 0;
      let single = null;
      for (let r = 0; r < runs; r += 1) { const s = flip(); const sd = d3.deviation(s, (p) => p.v); sum += sd; if (sdReal > sd) beat += 1; single = s; }
      sim = { key, single, runs, meanSd: sum / runs, share: beat / runs };
    }
    drawSim(root, table);
  };
})();
