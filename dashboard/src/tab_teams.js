// Team analytics: one team's profile, two teams side by side, and league rankings.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;

  const toolbar = () => `
    <div class="page-h"><div><h2>Team analytics</h2><p class="lede">Every number here is from the team’s own side, home or away. Records describe past rosters, coaches and schedules; they do not predict future results.</p></div></div>
    <div class="toolbar">
      ${U.sel('pteam', U.teamOptions(), S.pteam, S.tmode === 'compare' ? 'Team A' : 'Team')}
      ${S.tmode === 'compare' ? U.sel('pteam2', U.teamOptions(), S.pteam2, 'Team B') : ''}
      ${U.seg('tmode', [['profile', 'Team profile'], ['compare', 'Compare two teams'], ['rank', 'League rankings']], S.tmode, 'View')}
    </div>`;

  const splitRows = (t) => [
    ['Home', t.home], ['Away', t.away], ...(t.neutral.n ? [['Neutral site', t.neutral]] : []),
    ['As favorite', t.fav], ['As underdog', t.dog], ['Division games', t.div], ['Other games', t.nondiv],
  ];

  const profile = (root) => {
    const { scopeTeamGames } = NE.data();
    const rows = scopeTeamGames.filter((r) => r.team === S.pteam);
    if (!rows.length) { root.innerHTML = toolbar() + U.empty(`${S.pteam} has no games under these filters.`); return; }
    const t = NE.teamSummary(rows);
    const P = NE.periods(rows);
    const be = NE.mean(rows, 'spread_be');
    const market = S.market === 'all' ? 'spread' : S.market;
    const gameTitle = { spread: 'Every game against the spread', total: 'Every game against the total', ml: 'Every game, win or lose' }[market];
    const gameNote = { spread: 'Bars are ATS margins (margin + own line), oldest to newest: green covered, red missed.', total: 'Bars are combined points minus the closing total: blue over, orange under.', ml: 'Bars are final margins: green won, red lost.' }[market];
    const logCols = [
      ['date', 'Date', (r) => r.date, 'text'], ['week', 'Wk', (r) => r.week, 'int'], ['venue', 'Venue', (r) => r.venue, 'text'], ['opponent', 'Opp', (r) => r.opponent, 'text'],
      ['pts_for', 'PF', (r) => r.pts_for, 'int'], ['pts_against', 'PA', (r) => r.pts_against, 'int'], ['su', 'W/L', (r) => r.su, 'pill'],
      ['team_line', 'Line', (r) => r.team_line, 'line'], ['role', 'Role', (r) => r.role, 'text'], ['ats', 'ATS', (r) => r.ats, 'pill'], ['ats_margin', 'ATS margin', (r) => r.ats_margin, 's1'],
      ['total_line', 'Total', (r) => r.total_line, 'n1'], ['total_pts', 'Combined', (r) => r.total_pts, 'int'], ['ou_result', 'O/U', (r) => r.ou_result, 'text'], ['ml', 'ML', (r) => r.ml, 'odds'],
    ];
    const log = U.sortRows(rows, logCols, S.tl_sort, S.tl_dir);

    root.innerHTML = `${toolbar()}
      <div class="kpis">
        ${U.kpi({ label: 'Record', value: t.su.rec, sub: `${t.n} games`, info: 'Straight-up wins-losses(-ties) in the games in view.' })}
        ${U.kpi({ label: 'Win %', value: f.pct(t.su.pct), ci: `95% range ${f.ci(t.su)}`, tone: t.su.lo > 0.5 ? 'up' : t.su.hi < 0.5 ? 'down' : '', info: 'Wins ÷ games played; ties count as games.' })}
        ${U.kpi({ label: 'Points per game', value: f.n1(t.ppg), sub: `allowed ${f.n1(t.papg)}`, info: 'Average points scored and allowed per game.' })}
        ${U.kpi({ label: 'Point differential', value: f.s1(t.diff.value), ci: `95% range ${f.s1(t.diff.lo)} to ${f.s1(t.diff.hi)}`, tone: t.diff.lo > 0 ? 'up' : t.diff.hi < 0 ? 'down' : '', info: 'Average of points scored minus points allowed, from this team’s side.' })}
        ${U.kpi({ label: 'Against the spread', value: t.ats.rec, ci: `cover ${f.pct(t.ats.pct)} · ${f.ci(t.ats)}`, foot: U.vs50(t.ats), info: 'Cover-miss-push against the closing spread. Cover % = covers ÷ (covers + misses).' })}
        ${U.kpi({ label: 'Average ATS margin', value: f.s1(t.atsMargin), sub: 'margin + own line', info: 'How far the team beat (+) or missed (−) its closing spread on average.' })}
        ${U.kpi({ label: 'Over / under', value: t.ou.rec, ci: `over ${f.pct(t.ou.pct)} · ${f.ci(t.ou)}`, info: 'Over-under-push in this team’s games against the closing total.' })}
        ${U.kpi({ label: 'Average closing spread', value: f.line(t.line === null ? null : Math.round(t.line * 10) / 10), sub: 'negative = favored', info: 'The team’s average closing spread in sportsbook terms: −5 means it was favored by 5 on average.' })}
        ${U.kpi({ label: 'Average closing total', value: f.n1(t.totalLine), sub: `points scored ${f.n1(t.combined)}`, info: 'Average over/under line in this team’s games, and the combined points actually scored.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'tm-venue', title: 'Home vs. away', info: 'Win % and cover % at home and on the road, each with its 95% range. Neutral-site games are left out.', note: 'Whiskers are 95% ranges.' })}
        ${U.card({ id: 'tm-role', title: 'As favorite vs. as underdog', info: 'Win % and cover % by the team’s closing-spread role, each with its 95% range.', note: 'Whiskers are 95% ranges.' })}
      </div>
      ${U.card({ id: 'tm-games', title: gameTitle, note: `${gameNote} Click a bar to open the game.`, info: 'Follows the Market filter: spread, total or moneyline. With all markets on, it shows the spread.' })}
      <div class="grid">
        ${U.card({ id: 'tm-scoring', title: 'Scoring over time', note: 'Points scored and allowed per game.', info: 'Per season, or per week when one season is in view.' })}
        ${U.card({ id: 'tm-cover', title: 'ATS performance over time', note: 'Band = 95% range. Orange dashed = break-even at the closing prices.', info: 'Cover % per season (or week). A band that crosses 50% means that period could be luck.' })}
        ${U.card({ id: 'tm-ou', title: 'Over / under trend', note: 'Share of this team’s graded games.', info: 'Overs, pushes and unders as shares of each period’s graded games.' })}
        ${U.card({ id: 'tm-dist', title: 'How far from the line', note: 'ATS margin per game, in 3-point bins.', info: 'Shows the spread of results around the closing line. Most games miss the line by more than a field goal either way.' })}
      </div>
      <section class="card"><header class="card-h"><div><h3>Splits${U.info('Home and away exclude neutral sites. Favorite and underdog follow the closing spread. Cover ranges are 95% ranges.')}</h3></div></header>
        ${U.table({ cols: [
          ['split', 'Split', (r) => r[0], 'text'], ['n', 'Games', (r) => r[1].n, 'int'], ['su', 'Record', (r) => r[1].su.rec, 'text'], ['win', 'Win %', (r) => r[1].su.pct, 'pct'],
          ['ppg', 'PF/G', (r) => r[1].ppg, 'n1'], ['papg', 'PA/G', (r) => r[1].papg, 'n1'], ['ats', 'ATS (C-M-P)', (r) => r[1].ats.rec, 'text'], ['cov', 'Cover %', (r) => r[1].ats.pct, 'pct'],
          ['covr', 'Cover 95% range', (r) => f.ci(r[1].ats), 'text'], ['ou', 'O-U-P', (r) => r[1].ou.rec, 'text'], ['over', 'Over %', (r) => r[1].ou.pct, 'pct'],
        ], rows: splitRows(t) })}
      </section>
      <section class="card"><header class="card-h"><div><h3>Season by season</h3><p class="note">Click a season to focus the whole dashboard on it.</p></div></header>
        ${U.table({ cols: [
          ['s', 'Season', (r) => r[0], 'text'], ['n', 'G', (r) => r[1].n, 'int'], ['rec', 'Record', (r) => r[1].su.rec, 'text'], ['win', 'Win %', (r) => r[1].su.pct, 'pct'],
          ['ppg', 'PF/G', (r) => r[1].ppg, 'n1'], ['papg', 'PA/G', (r) => r[1].papg, 'n1'], ['diff', 'Diff', (r) => r[1].diff.value, 's1'], ['ats', 'ATS', (r) => r[1].ats.rec, 'text'],
          ['cov', 'Cover %', (r) => r[1].ats.pct, 'pct'], ['ou', 'O-U-P', (r) => r[1].ou.rec, 'text'], ['over', 'Over %', (r) => r[1].ou.pct, 'pct'], ['line', 'Avg line', (r) => r[1].line, 's1'], ['tl', 'Avg total', (r) => r[1].totalLine, 'n1'],
        ], rows: NE.groupBy(rows, 'season').reverse().map(([s, g]) => [s, NE.teamSummary(g)]), rowAttrs: (r) => `class="clickable" data-go="${U.go({ s0: r[0], s1: r[0] })}"` })}
      </section>
      <section class="card"><header class="card-h"><div><h3>Game log</h3><p class="note">Click a column to sort, a row to open the game. Line is the team’s own closing spread.</p></div>
        <div class="card-c"><button type="button" class="btn ghost" data-csv="team">Download CSV</button><button type="button" class="btn ghost" data-csv="team-copy">Copy CSV</button></div></header>
        ${U.table({ cols: logCols, rows: log, sortKey: S.tl_sort, sortDir: S.tl_dir, sortParam: 'tl_sort', dirParam: 'tl_dir', cls: 'tall', rowAttrs: (r) => `class="clickable" data-go="${U.go({ tab: 'games', game: r.game_id })}"` })}
        <p class="note" data-csv-msg></p>
      </section>`;

    const pair = (labels, parts) => ({
      cats: labels,
      series: [
        { name: 'Win %', color: C.col.blue(), values: parts.map((p) => p.su.pct), lo: parts.map((p) => p.su.lo), hi: parts.map((p) => p.su.hi), n: parts.map((p) => p.n), extra: (i) => [{ label: 'Record', value: parts[i].su.rec }] },
        { name: 'Cover %', color: C.col.teal(), values: parts.map((p) => p.ats.pct), lo: parts.map((p) => p.ats.lo), hi: parts.map((p) => p.ats.hi), n: parts.map((p) => p.ats.dec), extra: (i) => [{ label: 'C-M-P', value: parts[i].ats.rec }] },
      ],
    });
    U.draw(root, 'tm-venue', (el) => C.bars(el, { kind: 'pct', ref: 0.5, ...pair(['Home', 'Away'], [t.home, t.away]) }));
    U.draw(root, 'tm-role', (el) => C.bars(el, { kind: 'pct', ref: 0.5, ...pair(['Favorite', 'Underdog'], [t.fav, t.dog]) }));
    U.draw(root, 'tm-games', (el) => {
      const good = C.col.good();
      const bad = C.col.bad();
      const muted = C.col.muted();
      const r2 = rows.filter((r) => (market === 'spread' ? r.ats_margin !== null : market === 'total' ? r.g.ou_margin !== null : true));
      C.gameBars(el, { yLabel: market === 'spread' ? 'ATS margin' : market === 'total' ? 'Points vs. total' : 'Final margin', onClick: U.openGame, rows: r2.map((r) => {
        const value = market === 'spread' ? r.ats_margin : market === 'total' ? r.g.ou_margin : r.margin;
        const color = market === 'total' ? (value > 0 ? C.col.blue() : value < 0 ? C.col.orange() : muted) : value > 0 ? good : value < 0 ? bad : muted;
        return { id: r.game_id, value, color, label: `${r.date} · ${r.venue === 'Away' ? '@' : 'vs.'} ${r.opponent}`, lines: [{ label: 'Score', value: `${r.pts_for}-${r.pts_against}` }, { label: 'Line', value: f.line(r.team_line) }, { label: 'ATS margin', value: f.s1(r.ats_margin) }, { label: 'Total', value: `${f.n1(r.total_line)} (${r.ou_result ?? '—'})` }] };
      }) });
    });
    U.draw(root, 'tm-scoring', (el) => C.line(el, { cats: P.cats, xLabel: P.label, series: [
      { name: 'Scored', color: C.col.blue(), values: P.groups.map((g) => NE.mean(g, 'pts_for')), n: P.groups.map((g) => g.length) },
      { name: 'Allowed', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'pts_against')) },
    ] }));
    U.draw(root, 'tm-cover', (el) => { const r = P.groups.map((g) => NE.ats(g)); C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, ref2: be, ref2Label: `Break-even ${f.pct(be)}`, series: [{ name: 'Cover %', color: C.col.teal(), values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec) }] }); });
    U.draw(root, 'tm-ou', (el) => { const r = P.groups.map((g) => NE.ou(g)); C.stack(el, { cats: P.cats, xLabel: P.label, parts: [{ name: 'Over', color: C.col.blue(), values: r.map((x) => x.w) }, { name: 'Push', color: C.col.muted(), values: r.map((x) => x.p) }, { name: 'Under', color: C.col.orange(), values: r.map((x) => x.l) }] }); });
    U.draw(root, 'tm-dist', (el) => C.hist(el, { values: rows.map((r) => r.ats_margin), step: 3, xLabel: 'ATS margin', vline: 0, colorOf: (v) => (v + 1.5 >= 0 ? C.col.good() : C.col.bad()) }));
  };

  const compare = (root) => {
    const { scopeTeamGames } = NE.data();
    const A = scopeTeamGames.filter((r) => r.team === S.pteam);
    const B = scopeTeamGames.filter((r) => r.team === S.pteam2);
    if (!A.length || !B.length) { root.innerHTML = toolbar() + U.empty('One of the teams has no games under these filters.'); return; }
    const a = NE.teamSummary(A);
    const b = NE.teamSummary(B);
    const verdict = (d) => (!d ? '' : d.real ? '<span class="pill good">Real difference</span>' : '<span class="pill neutral">Could be chance</span>');
    const rows = [
      ['Games', a.n, b.n, ''], ['Record', a.su.rec, b.su.rec, ''],
      ['Win %', f.pct(a.su.pct), f.pct(b.su.pct), verdict(NE.diffRate(a.su, b.su))],
      ['Points per game', f.n1(a.ppg), f.n1(b.ppg), ''], ['Points allowed per game', f.n1(a.papg), f.n1(b.papg), ''],
      ['Point differential', f.s1(a.diff.value), f.s1(b.diff.value), verdict(NE.diffMean(a.diff, b.diff))],
      ['ATS (cover-miss-push)', a.ats.rec, b.ats.rec, ''], ['Cover %', f.pct(a.ats.pct), f.pct(b.ats.pct), verdict(NE.diffRate(a.ats, b.ats))],
      ['Average ATS margin', f.s1(a.atsMargin), f.s1(b.atsMargin), ''],
      ['Over-under-push', a.ou.rec, b.ou.rec, ''], ['Over %', f.pct(a.ou.pct), f.pct(b.ou.pct), verdict(NE.diffRate(a.ou, b.ou))],
      ['Average closing spread', f.s1(a.line), f.s1(b.line), ''], ['Average closing total', f.n1(a.totalLine), f.n1(b.totalLine), ''],
      ['Home record', a.home.su.rec, b.home.su.rec, ''], ['Away record', a.away.su.rec, b.away.su.rec, ''],
      ['Record as favorite', a.fav.su.rec, b.fav.su.rec, ''], ['Record as underdog', a.dog.su.rec, b.dog.su.rec, ''],
      ['Cover % as favorite', f.pct(a.fav.ats.pct), f.pct(b.fav.ats.pct), ''], ['Cover % as underdog', f.pct(a.dog.ats.pct), f.pct(b.dog.ats.pct), ''],
    ];
    const h2h = NE.teamGames.filter((r) => r.team === S.pteam && r.opponent === S.pteam2).reverse();
    const hs = NE.su(h2h);
    const ha = NE.ats(h2h);
    root.innerHTML = `${toolbar()}
      <div class="grid top">
        <section class="card"><header class="card-h"><div><h3>${esc(S.pteam)} vs. ${esc(S.pteam2)}${U.info('Same filters for both teams. “Real difference” means the 95% range for the gap between them excludes zero.')}</h3><p class="note">“Real difference” means the gap is unlikely to be luck.</p></div></header>
          <div class="tbl short"><table><thead><tr><th>Measure</th><th class="num">${esc(S.pteam)}</th><th class="num">${esc(S.pteam2)}</th><th>Gap</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</tbody></table></div></section>
        <div class="stack">
          ${U.card({ id: 'cmp-rates', title: 'Key rates with 95% ranges', note: 'Overlapping whiskers: the gap may not be real.' })}
          ${U.card({ id: 'cmp-cover', title: 'Cover % over time' })}
          ${U.card({ id: 'cmp-scoring', title: 'Point differential over time' })}
        </div>
      </div>
      <section class="card"><header class="card-h"><div><h3>Head to head since 2020</h3><p class="note">All seasons and game types, from ${esc(S.pteam)}’s side: ${hs.rec} straight up, ${ha.rec} against the spread. Click a game to open it.</p></div></header>
        ${h2h.length ? U.table({ cols: [['date', 'Date', (r) => r.date, 'text'], ['venue', 'Venue', (r) => r.venue, 'text'], ['score', 'Score', (r) => `${r.pts_for}-${r.pts_against}`, 'text'], ['su', 'Result', (r) => r.su, 'pill'], ['line', 'Line', (r) => r.team_line, 'line'], ['ats', 'ATS', (r) => r.ats, 'pill'], ['tl', 'Total', (r) => r.total_line, 'n1'], ['ou', 'O/U', (r) => r.ou_result, 'text']], rows: h2h, rowAttrs: (r) => `class="clickable" data-go="${U.go({ tab: 'games', game: r.game_id })}"` }) : '<p class="empty">These teams have not met since 2020.</p>'}
      </section>`;
    U.draw(root, 'cmp-rates', (el) => {
      const m = [['Win %', (t) => t.su], ['Cover %', (t) => t.ats], ['Over %', (t) => t.ou], ['Win % as fav.', (t) => t.fav.su], ['Win % as dog', (t) => t.dog.su]];
      const ser = (t, name, color) => ({ name, color, values: m.map(([, g]) => g(t).pct), lo: m.map(([, g]) => g(t).lo), hi: m.map(([, g]) => g(t).hi), n: m.map(([, g]) => g(t).dec) });
      C.bars(el, { cats: m.map((x) => x[0]), kind: 'pct', ref: 0.5, series: [ser(a, S.pteam, C.col.blue()), ser(b, S.pteam2, C.col.orange())] });
    });
    const byPeriod = (rowsX, fn) => new Map(NE.groupBy(rowsX, NE.periodKey([...A, ...B])).map(([k, g]) => [k, fn(g)]));
    const cats = [...new Set([...A, ...B].map((r) => r[NE.periodKey([...A, ...B])]))].sort((x, y) => x - y);
    const xl = NE.periodKey([...A, ...B]) === 'week' ? 'Week' : 'Season';
    U.draw(root, 'cmp-cover', (el) => {
      const PA = byPeriod(A, (g) => NE.ats(g).pct);
      const PB = byPeriod(B, (g) => NE.ats(g).pct);
      C.line(el, { cats, xLabel: xl, kind: 'pct', ref: 0.5, series: [{ name: S.pteam, color: C.col.blue(), values: cats.map((c) => PA.get(c) ?? null) }, { name: S.pteam2, color: C.col.orange(), values: cats.map((c) => PB.get(c) ?? null) }] });
    });
    U.draw(root, 'cmp-scoring', (el) => {
      const PA = byPeriod(A, (g) => NE.mean(g, 'margin'));
      const PB = byPeriod(B, (g) => NE.mean(g, 'margin'));
      C.line(el, { cats, xLabel: xl, ref: 0, series: [{ name: S.pteam, color: C.col.blue(), values: cats.map((c) => PA.get(c) ?? null) }, { name: S.pteam2, color: C.col.orange(), values: cats.map((c) => PB.get(c) ?? null) }] });
    });
  };

  const RANK = {
    cover: { label: 'Cover %', kind: 'pct', get: (t) => t.ats, center: 0.5 },
    win: { label: 'Win %', kind: 'pct', get: (t) => t.su, center: 0.5 },
    over: { label: 'Over %', kind: 'pct', get: (t) => t.ou, center: 0.5 },
    favcover: { label: 'Cover % as favorite', kind: 'pct', get: (t) => t.fav.ats, center: 0.5 },
    dogcover: { label: 'Cover % as underdog', kind: 'pct', get: (t) => t.dog.ats, center: 0.5 },
    diff: { label: 'Point differential', kind: 'num', get: (t) => ({ pct: t.diff.value, lo: t.diff.lo, hi: t.diff.hi, rec: `${t.su.rec}`, dec: t.n }), center: 0 },
  };
  const rankings = (root) => {
    const { scopeTeamGames } = NE.data();
    if (!scopeTeamGames.length) { root.innerHTML = toolbar() + U.empty(); return; }
    const key = RANK[S.rank] ? S.rank : 'cover';
    const R = RANK[key];
    const table = NE.teamTable(scopeTeamGames);
    const rows = table.map((t) => ({ t, r: R.get(t) })).filter((x) => x.r.pct !== null);
    const cols = [
      ['team', 'Team', (x) => x.t.team, 'text'], ['n', 'G', (x) => x.t.n, 'int'], ['rec', 'Record', (x) => x.t.su.rec, 'text'], ['win', 'Win %', (x) => x.t.su.pct, 'pct'],
      ['diff', 'Diff', (x) => x.t.diff.value, 's1'], ['ats', 'ATS', (x) => x.t.ats.rec, 'text'], ['cover', 'Cover %', (x) => x.t.ats.pct, 'pct'], ['covr', 'Cover range', (x) => f.ci(x.t.ats), 'text'],
      ['ou', 'O-U-P', (x) => x.t.ou.rec, 'text'], ['over', 'Over %', (x) => x.t.ou.pct, 'pct'], ['line', 'Avg line', (x) => x.t.line, 's1'],
    ];
    root.innerHTML = `${toolbar()}
      <div class="grid">
        ${U.card({ id: 'rank', title: `${R.label} by team`, info: 'Bars run from the baseline. Whiskers are 95% ranges. Grey bars are within chance of the baseline; colored bars are unlikely to be luck alone.', note: 'Grey = within chance. Click a team to open it.', controls: U.sel('rank', Object.entries(RANK).map(([k, r]) => [k, r.label]), key, 'Measure') })}
        <section class="card"><header class="card-h"><div><h3>All teams</h3><p class="note">Click a column to sort, a row to open the team.</p></div></header>
          ${U.table({ cols, rows: U.sortRows(rows, cols, S.rk_sort, S.rk_dir), sortKey: S.rk_sort, sortDir: S.rk_dir, sortParam: 'rk_sort', dirParam: 'rk_dir', cls: 'tall', rowAttrs: (x) => `class="clickable" data-go="${U.go({ pteam: x.t.team, tmode: 'profile' })}"` })}
        </section>
      </div>`;
    U.draw(root, 'rank', (el) => C.hbars(el, { kind: R.kind, center: R.center, noise: true, selected: S.pteam, valueLabel: R.label, onClick: (team) => NE.set({ pteam: team, tmode: 'profile' }),
      rows: rows.map((x) => ({ label: x.t.team, value: x.r.pct, lo: x.r.lo, hi: x.r.hi, lines: [{ label: 'Record', value: x.r.rec }, { label: 'Games', value: f.int(x.r.dec) }] })).sort((p, q) => q.value - p.value) }));
  };

  NE.tabs.teams = (root) => (S.tmode === 'compare' ? compare(root) : S.tmode === 'rank' ? rankings(root) : profile(root));
  NE.csvSources = NE.csvSources || {};
  NE.csvSources.team = () => {
    const rows = NE.data().scopeTeamGames.filter((r) => r.team === S.pteam);
    return { name: `nfl_edge_${S.pteam}_games.csv`, text: U.csv(rows, ['game_id', 'date', 'season', 'week', 'team', 'opponent', 'venue', 'pts_for', 'pts_against', 'su', 'team_line', 'role', 'ats', 'ats_margin', 'total_line', 'total_pts', 'ou_result', 'ml']) };
  };
})();
