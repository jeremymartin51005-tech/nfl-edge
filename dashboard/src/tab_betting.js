// Betting trends: how games settled against the closing spread, total and moneyline.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;
  const S = NE.S;

  const toGames = (spec) => NE.set(NE.specToExplorer({ side: 'all', team: '', opp: '', smin: '', smax: '', tmin: '', tmax: '', div: 'any', ...spec }));
  const rateSeries = (name, color, r, extra) => ({ name, color, values: r.map((x) => x.pct), lo: r.map((x) => x.lo), hi: r.map((x) => x.hi), n: r.map((x) => x.dec), extra });

  // ---- spread ---------------------------------------------------------------------------
  const spread = (games, teamGames, scopeTeamGames, P) => {
    const home = NE.ats(games, 'home_ats');
    const fav = NE.ats(games, 'fav_ats');
    const be = NE.mean(teamGames, 'spread_be');
    const buckets = NE.SPREAD_BUCKETS.map((b) => { const g = games.filter((x) => x.spread_bucket === b); return { b, g, su: NE.su(g, 'fav_su'), ats: NE.ats(g, 'fav_ats'), margin: NE.mean(g, 'fav_margin') }; });
    const teamCols = [
      ['team', 'Team', (t) => t.team, 'text'], ['n', 'G', (t) => t.n, 'int'], ['ats', 'ATS (C-M-P)', (t) => t.ats.rec, 'text'], ['cover', 'Cover %', (t) => t.ats.pct, 'pct'],
      ['range', '95% range', (t) => f.ci(t.ats), 'text'], ['margin', 'ATS margin', (t) => t.atsMargin, 's1'], ['fav', 'As fav.', (t) => t.fav.ats.rec, 'text'], ['dog', 'As dog', (t) => t.dog.ats.rec, 'text'],
    ];
    const teams = NE.teamTable(scopeTeamGames).filter((t) => t.ats.dec);
    return {
      html: `
      ${U.section('Against the spread', 'Did the favorite (or the home team) beat the closing spread?', 'sec-spread')}
      <p class="callout"><b>How spreads are settled.</b> Each side is graded from its own closing line: ATS margin = that side’s final margin + its line (negative when favored). Above zero is a <b>cover</b>, zero a <b>push</b>, below zero a <b>miss</b>. Cover % = covers ÷ (covers + misses); pushes are reported on their own. Every graded game has one cover and one miss, so home and away (or favorite and underdog) always add to 100%.</p>
      <div class="kpis">
        ${U.kpi({ label: 'Games graded', value: f.int(home.n), sub: `${home.p} pushes`, info: 'Completed games with a closing spread.' })}
        ${U.kpi({ label: 'Favorites ATS', value: fav.rec, ci: `cover ${f.pct(fav.pct)} · ${f.ci(fav)}`, foot: U.vs50(fav), info: 'Favorite cover-miss-push. This is the overall ATS record from the favorite’s side.' })}
        ${U.kpi({ label: 'Underdog cover %', value: f.pct(fav.lpct), sub: fav.lrec, info: 'Underdog covers ÷ graded games. Always 100% minus the favorite rate.' })}
        ${U.kpi({ label: 'Home cover %', value: f.pct(home.pct), ci: `95% range ${f.ci(home)}`, sub: home.rec, foot: U.vs50(home), info: 'Home teams against the spread, neutral sites included as listed.' })}
        ${U.kpi({ label: 'Away cover %', value: f.pct(home.lpct), sub: home.lrec, info: 'Away teams against the spread.' })}
        ${U.kpi({ label: 'Push %', value: f.pct(home.ppct), sub: 'margin landed on the number', info: 'Share of graded games where the final margin exactly equalled the spread. Only whole-number spreads can push.' })}
        ${U.kpi({ label: 'Break-even rate', value: f.pct(be), sub: 'at the closing prices', info: 'The cover rate a side needs to come out even after the bookmaker’s cut, averaged over the actual closing prices (−110 needs 52.4%).' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'bt-season', title: 'ATS results over time', note: 'Who covered each period: home or away. Click to zoom in.', info: 'Share of each period’s graded games covered by the home team, pushed, or covered by the away team.' })}
        ${U.card({ id: 'bt-favline', title: 'Favorite vs. underdog cover %', note: 'Band = 95% range. Grey dashed = 50%, orange dashed = break-even.', info: 'Favorite cover rate with its 95% range, and the underdog rate (its mirror image).' })}
        ${U.card({ id: 'bt-bucket', title: 'Cover % by spread range', note: 'Points the favorite laid at the close. Click a bar to list those games.', info: 'Ranges: pick to 3, 3.5 to 6.5, 7 to 10, and 10.5 or more. Whiskers are 95% ranges.' })}
        ${U.card({ id: 'bt-sit', title: 'Home / away × favorite / underdog', note: 'Neutral sites left out. Whiskers are 95% ranges.', info: 'Each side graded from its own line: home favorites, home underdogs, road favorites, road underdogs.' })}
      </div>
      <section class="card"><header class="card-h"><div><h3>Spread ranges${U.info('Winning outright and covering are different results: a favorite can win and still miss the spread.')}</h3><p class="note">Favorites can win the game and still miss the spread. Click a row to list the games.</p></div></header>
        ${U.table({ cols: [
          ['b', 'Spread', (x) => x.b, 'text'], ['n', 'Games', (x) => x.g.length, 'int'], ['su', 'Favorite win %', (x) => x.su.pct, 'pct'], ['cov', 'Favorite cover %', (x) => x.ats.pct, 'pct'],
          ['range', 'Cover 95% range', (x) => f.ci(x.ats), 'text'], ['dog', 'Underdog cover %', (x) => x.ats.lpct, 'pct'], ['push', 'Push %', (x) => x.ats.ppct, 'pct'], ['rec', 'Favorite C-M-P', (x) => x.ats.rec, 'text'], ['m', 'Avg favorite margin', (x) => x.margin, 's1'],
        ], rows: buckets, rowAttrs: (x) => `class="clickable" data-go="${U.go(NE.specToExplorer({ side: 'all', team: '', opp: '', smin: NE.SPREAD_RANGES[x.b][0], smax: NE.SPREAD_RANGES[x.b][1], tmin: '', tmax: '', div: 'any' }))}"` })}
      </section>
      <div class="grid">
        ${U.card({ id: 'bt-teams', title: 'ATS performance by team', note: 'Grey = within chance of 50%. Click a team to open it.', info: 'Each team graded from its own side, home or away, with its 95% range. Uses every team’s games under the filters (the Team filter is ignored here).' })}
        <section class="card"><header class="card-h"><div><h3>Team ATS table</h3><p class="note">Click a column to sort, a row to open the team.</p></div></header>
          ${U.table({ cols: teamCols, rows: U.sortRows(teams, teamCols, S.bt_sort, S.bt_dir), sortKey: S.bt_sort, sortDir: S.bt_dir, sortParam: 'bt_sort', dirParam: 'bt_dir', cls: 'tall', rowAttrs: (t) => `class="clickable" data-go="${U.go({ tab: 'teams', pteam: t.team, tmode: 'profile' })}"` })}
        </section>
      </div>
      <div class="grid">
        ${U.card({ id: 'bt-push', title: 'Push rate by closing spread', note: 'Spreads of 3 and 7 push most because 3 and 7 are the most common margins.', info: 'Share of games at each whole-number spread that landed exactly on the number.' })}
        ${U.card({ id: 'bt-margin', title: 'How far from the number', note: 'Favorite ATS margin per game, in 3-point bins.', info: 'Final margin minus the spread, from the favorite’s side. The spread of this distribution is why single games are hard to call.' })}
      </div>`,
      draw: (root) => {
        const drill = U.drill(P, games);
        const hint = U.drillHint(P);
        U.draw(root, 'bt-season', (el) => { const r = P.groups.map((g) => NE.ats(g, 'home_ats')); C.stack(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, parts: [{ name: 'Home covered', color: C.col.blue(), values: r.map((x) => x.w) }, { name: 'Push', color: C.col.muted(), values: r.map((x) => x.p) }, { name: 'Away covered', color: C.col.orange(), values: r.map((x) => x.l) }] }); });
        U.draw(root, 'bt-favline', (el) => { const r = P.groups.map((g) => NE.ats(g, 'fav_ats')); C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, ref2: be, ref2Label: `Break-even ${f.pct(be)}`, onClick: drill, hint, series: [rateSeries('Favorite cover %', C.col.blue(), r), { name: 'Underdog cover %', color: C.col.orange(), values: r.map((x) => x.lpct) }] }); });
        U.draw(root, 'bt-bucket', (el) => C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, hint: 'Click to list these games', series: [
          rateSeries('Favorite', C.col.blue(), buckets.map((x) => x.ats), (i) => [{ label: 'C-M-P', value: buckets[i].ats.rec }]),
          { name: 'Underdog', color: C.col.orange(), values: buckets.map((x) => x.ats.lpct) },
        ], onClick: (i) => { const [a, z] = NE.SPREAD_RANGES[NE.SPREAD_BUCKETS[i]]; toGames({ smin: a, smax: z }); } }));
        U.draw(root, 'bt-sit', (el) => {
          const sits = [['Home fav.', 'homefav'], ['Home dog', 'homedog'], ['Road fav.', 'awayfav'], ['Road dog', 'awaydog']];
          const r = sits.map(([, s]) => NE.ats(teamGames.filter(NE.SIDES[s].test)));
          C.bars(el, { cats: sits.map((s) => s[0]), kind: 'pct', ref: 0.5, hint: 'Click to test this in the Trend lab', series: [rateSeries('Cover %', C.col.teal(), r, (i) => [{ label: 'C-M-P', value: r[i].rec }])],
            onClick: (i) => NE.set({ tab: 'lab', tt_market: 'spread', tt_side: sits[i][1], tt_team: '', tt_opp: '', tt_smin: '', tt_smax: '', tt_tmin: '', tt_tmax: '', tt_div: 'any', tt_rest: 'any', _scroll: 'card-lab-test' }) });
        });
        U.draw(root, 'bt-teams', (el) => C.hbars(el, { kind: 'pct', center: 0.5, noise: true, valueLabel: 'Cover %', onClick: U.openTeam, rows: teams.map((t) => ({ label: t.team, value: t.ats.pct, lo: t.ats.lo, hi: t.ats.hi, lines: [{ label: 'C-M-P', value: t.ats.rec }] })).sort((a, b) => b.value - a.value) }));
        U.draw(root, 'bt-push', (el) => {
          const by = NE.groupBy(games.filter((g) => g.fav_line !== null && g.fav_line % 1 === 0), 'fav_line').map(([l, g]) => ({ l, n: g.length, p: g.filter((x) => x.home_ats === 'Push').length })).filter((x) => x.n >= 5);
          C.bars(el, { cats: by.map((x) => d3.format('~g')(x.l)), xLabel: 'Spread', kind: 'pct', labels: false, series: [{ name: 'Push rate', color: C.col.violet(), values: by.map((x) => x.p / x.n), n: by.map((x) => x.n), extra: (i) => [{ label: 'Pushes', value: String(by[i].p) }] }] });
        });
        U.draw(root, 'bt-margin', (el) => C.hist(el, { values: games.map((g) => g.fav_ats_margin), step: 3, xLabel: 'Favorite ATS margin', vline: 0, colorOf: (v) => (v + 1.5 >= 0 ? C.col.good() : C.col.bad()) }));
      },
    };
  };

  // ---- totals ------------------------------------------------------------------------------
  const totals = (games, teamGames, scopeTeamGames, P) => {
    const o = NE.ou(games);
    const be = NE.mean(games, (g) => NE.prob(g.over_odds));
    const buckets = NE.TOTAL_BUCKETS.map((b) => { const g = games.filter((x) => x.total_bucket === b); return { b, g, ou: NE.ou(g), line: NE.mean(g, 'total_line'), pts: NE.mean(g, 'total_pts') }; });
    const teamCols = [
      ['team', 'Team', (t) => t.team, 'text'], ['n', 'G', (t) => t.n, 'int'], ['ou', 'O-U-P', (t) => t.ou.rec, 'text'], ['over', 'Over %', (t) => t.ou.pct, 'pct'],
      ['range', '95% range', (t) => f.ci(t.ou), 'text'], ['tl', 'Avg total', (t) => t.totalLine, 'n1'], ['pts', 'Avg points', (t) => t.combined, 'n1'],
    ];
    const teams = NE.teamTable(scopeTeamGames).filter((t) => t.ou.dec);
    return {
      html: `
      ${U.section('Over / under', 'Did the two teams combine for more or fewer points than the closing total?', 'sec-total')}
      <p class="callout"><b>How totals are settled.</b> Combined points (home + away) against the closing total: above is an <b>over</b>, below an <b>under</b>, equal a <b>push</b>. Over % = overs ÷ (overs + unders).</p>
      <div class="kpis">
        ${U.kpi({ label: 'Games graded', value: f.int(o.n), sub: `${o.rec} O-U-P`, info: 'Completed games with a closing total.' })}
        ${U.kpi({ label: 'Over %', value: f.pct(o.pct), ci: `95% range ${f.ci(o)}`, foot: U.vs50(o), info: 'Overs ÷ (overs + unders).' })}
        ${U.kpi({ label: 'Under %', value: f.pct(o.lpct), sub: `${o.l} unders`, info: 'Unders ÷ (overs + unders).' })}
        ${U.kpi({ label: 'Push %', value: f.pct(o.ppct), sub: `${o.p} pushes`, info: 'Games that landed exactly on the total.' })}
        ${U.kpi({ label: 'Average closing total', value: f.n1(NE.mean(games, 'total_line')), sub: `median ${f.n1(NE.median(games, 'total_line'))}`, info: 'Average over/under line at kickoff.' })}
        ${U.kpi({ label: 'Average combined points', value: f.n1(NE.mean(games, 'total_pts')), sub: `median ${f.n1(NE.median(games, 'total_pts'))}`, info: 'Home + away points, averaged.' })}
        ${U.kpi({ label: 'Points vs. the total', value: f.s1(NE.mean(games, 'ou_margin')), sub: `average miss ${f.n1(d3.mean(games, (g) => Math.abs(g.ou_margin)))}`, info: 'Average of combined points minus the closing total (bias), and the average size of the miss either way.' })}
        ${U.kpi({ label: 'Break-even rate', value: f.pct(be), sub: 'for overs at closing prices', info: 'The over rate needed to come out even after the bookmaker’s cut, at the actual closing over prices.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'to-line', title: 'Closing total vs. actual points', note: 'Average per period. Click to zoom in.', info: 'Average closing total and average combined points per season (or week).' })}
        ${U.card({ id: 'to-over', title: 'Over % over time', note: 'Band = 95% range.', info: 'Over rate per period with its 95% range.' })}
        ${U.card({ id: 'to-bucket', title: 'Over % by closing-total range', note: 'Click a bar to list those games.', info: 'Totals of 40 or less, 40.5–43.5, 44–46.5, 47–49.5 and 50 or more. Whiskers are 95% ranges.' })}
        ${U.card({ id: 'to-scatter', title: 'Every game: closing total vs. points', note: 'Above the dashed line went over. Click a dot to open the game.', info: 'Each dot is one game.' })}
      </div>
      <section class="card"><header class="card-h"><div><h3>Closing-total ranges</h3><p class="note">Click a row to list the games.</p></div></header>
        ${U.table({ cols: [
          ['b', 'Closing total', (x) => x.b, 'text'], ['n', 'Games', (x) => x.g.length, 'int'], ['rec', 'O-U-P', (x) => x.ou.rec, 'text'], ['over', 'Over %', (x) => x.ou.pct, 'pct'],
          ['range', '95% range', (x) => f.ci(x.ou), 'text'], ['push', 'Push %', (x) => x.ou.ppct, 'pct'], ['line', 'Avg total', (x) => x.line, 'n1'], ['pts', 'Avg points', (x) => x.pts, 'n1'],
        ], rows: buckets, rowAttrs: (x) => `class="clickable" data-go="${U.go(NE.specToExplorer({ side: 'all', team: '', opp: '', smin: '', smax: '', tmin: NE.TOTAL_RANGES[x.b][0], tmax: NE.TOTAL_RANGES[x.b][1], div: 'any' }))}"` })}
      </section>
      <div class="grid">
        ${U.card({ id: 'to-teams', title: 'Over % by team', note: 'Grey = within chance of 50%. Click a team to open it.', info: 'Every game involving each team, with its 95% range.' })}
        <section class="card"><header class="card-h"><div><h3>Team totals table</h3><p class="note">Click a column to sort, a row to open the team.</p></div></header>
          ${U.table({ cols: teamCols, rows: U.sortRows(teams, teamCols, S.to_sort, S.to_dir), sortKey: S.to_sort, sortDir: S.to_dir, sortParam: 'to_sort', dirParam: 'to_dir', cls: 'tall', rowAttrs: (t) => `class="clickable" data-go="${U.go({ tab: 'teams', pteam: t.team, tmode: 'profile' })}"` })}
        </section>
      </div>
      ${U.card({ id: 'to-dist', title: 'How far from the total', note: 'Combined points minus the closing total, in 3-point bins.', info: 'Blue bars went over, orange under. Totals miss by double digits about half the time.' })}`,
      draw: (root) => {
        const drill = U.drill(P, games);
        const hint = U.drillHint(P);
        U.draw(root, 'to-line', (el) => C.line(el, { cats: P.cats, xLabel: P.label, onClick: drill, hint, series: [{ name: 'Closing total', color: C.col.orange(), values: P.groups.map((g) => NE.mean(g, 'total_line')), dash: true }, { name: 'Combined points', color: C.col.blue(), ...NE.metricSeries('avg_total', P.groups) }] }));
        U.draw(root, 'to-over', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, ref2: be, ref2Label: `Break-even ${f.pct(be)}`, onClick: drill, hint, series: [{ name: 'Over %', color: C.col.blue(), ...NE.metricSeries('over', P.groups) }] }));
        U.draw(root, 'to-bucket', (el) => C.bars(el, { cats: NE.TOTAL_BUCKETS, xLabel: 'Total', kind: 'pct', ref: 0.5, hint: 'Click to list these games', series: [rateSeries('Over %', C.col.blue(), buckets.map((x) => x.ou), (i) => [{ label: 'O-U-P', value: buckets[i].ou.rec }])],
          onClick: (i) => { const [a, z] = NE.TOTAL_RANGES[NE.TOTAL_BUCKETS[i]]; toGames({ tmin: a, tmax: z }); } }));
        U.draw(root, 'to-scatter', (el) => C.scatter(el, { points: games.filter((g) => g.total_line !== null).map((g) => ({ x: g.total_line, y: g.total_pts, group: g.ou_result, id: g.game_id, label: U.gameLabel(g) })), groups: NE.ouGroups(), diag: true, diagLabel: 'Points = total', xLabel: 'Closing total', yLabel: 'Combined points', onClick: (p) => U.openGame(p.id) }));
        U.draw(root, 'to-teams', (el) => C.hbars(el, { kind: 'pct', center: 0.5, noise: true, valueLabel: 'Over %', onClick: U.openTeam, rows: teams.map((t) => ({ label: t.team, value: t.ou.pct, lo: t.ou.lo, hi: t.ou.hi, lines: [{ label: 'O-U-P', value: t.ou.rec }] })).sort((a, b) => b.value - a.value) }));
        U.draw(root, 'to-dist', (el) => C.hist(el, { values: games.map((g) => g.ou_margin), step: 3, xLabel: 'Points minus total', vline: 0, colorOf: (v) => (v + 1.5 >= 0 ? C.col.blue() : C.col.orange()) }));
      },
    };
  };

  // ---- favorites vs. underdogs (moneyline) --------------------------------------------------------
  const favdog = (games, P) => {
    const g = games.filter((x) => x.fav_side !== null);
    const su = NE.su(g, 'fav_su');
    const at = NE.ats(g, 'fav_ats');
    const wins = g.filter((x) => x.fav_su === 'W');
    const imp = NE.mean(g, 'fav_imp');
    const buckets = NE.SPREAD_BUCKETS.map((b) => { const x = g.filter((r) => r.spread_bucket === b); return { b, x, su: NE.su(x, 'fav_su'), ats: NE.ats(x, 'fav_ats'), imp: NE.mean(x, 'fav_imp'), margin: NE.mean(x, 'fav_margin'), ml: NE.median(x, (r) => (r.fav_side === 'home' ? r.home_ml : r.away_ml)) }; });
    return {
      html: `
      ${U.section('Favorites vs. underdogs', 'Winning the game (moneyline) is not the same as covering the spread.', 'sec-ml')}
      <p class="callout"><b>Winning is not covering.</b> <b>Straight up (SU)</b> is who won the game, which settles moneyline bets. <b>Against the spread (ATS)</b> is whether the final margin beat the closing spread. The favorite is the side the closing spread favored.</p>
      <div class="kpis">
        ${U.kpi({ label: 'Favorite win % (SU)', value: f.pct(su.pct), ci: `95% range ${f.ci(su)}`, sub: su.rec, info: 'Favorite outright wins ÷ games with a favorite.' })}
        ${U.kpi({ label: 'Underdog win % (SU)', value: f.pct(su.lpct), sub: `${su.l} outright upsets`, info: 'Underdog outright wins ÷ games with a favorite.' })}
        ${U.kpi({ label: 'Price-implied favorite win %', value: f.pct(imp), sub: 'average, vig removed', info: 'The average win chance the closing moneylines gave the favorite, with the bookmaker’s margin removed.' })}
        ${U.kpi({ label: 'Favorite cover % (ATS)', value: f.pct(at.pct), ci: `95% range ${f.ci(at)}`, sub: at.rec, foot: U.vs50(at), info: 'Favorite covers ÷ (covers + misses).' })}
        ${U.kpi({ label: 'Underdog cover % (ATS)', value: f.pct(at.lpct), sub: at.lrec, info: 'Underdog covers ÷ (covers + misses).' })}
        ${U.kpi({ label: 'Average favorite margin', value: f.s1(NE.mean(g, 'fav_margin')), sub: 'every game, losses included', info: 'Favorite score minus underdog score, averaged over every game.' })}
        ${U.kpi({ label: 'Favorite margin of victory', value: f.n1(NE.mean(wins, 'fav_margin')), sub: `${f.int(wins.length)} favorite wins`, info: 'Average margin in the games the favorite won.' })}
        ${U.kpi({ label: 'Average spread', value: f.n1(NE.mean(g, 'fav_line')), sub: `median ${f.n1(NE.median(g, 'fav_line'))}`, info: 'Average points the favorite laid at the close.' })}
      </div>
      <div class="grid">
        ${U.card({ id: 'fd-bucket', title: 'Winning vs. covering, by spread size', note: 'Bigger favorites win far more often but do not cover more. Click to list the games.', info: 'Favorite win % (SU) and cover % (ATS) by spread range, with 95% ranges.' })}
        ${U.card({ id: 'fd-trend', title: 'Favorites over time', note: 'Win % (SU) against cover % (ATS).', info: 'Per season, or per week when one season is in view.' })}
      </div>
      ${U.card({ id: 'fd-exact', title: 'By exact closing spread', note: 'Spreads with at least 15 games. Band = 95% range for the cover rate; thin samples have wide bands.', info: 'Each point is one closing spread value.' })}
      <section class="card"><header class="card-h"><div><h3>By spread size${U.info('Median moneyline is the favorite’s typical closing price in that range.')}</h3><p class="note">Price-implied win % is what the closing moneylines expected; compare it with the actual win %. For the full price check, see Odds & market.</p></div></header>
        ${U.table({ cols: [
          ['b', 'Spread', (x) => x.b, 'text'], ['n', 'Games', (x) => x.x.length, 'int'], ['ml', 'Median favorite ML', (x) => x.ml, 'odds'], ['imp', 'Price-implied win %', (x) => x.imp, 'pct'],
          ['su', 'Actual win %', (x) => x.su.pct, 'pct'], ['sur', 'Win 95% range', (x) => f.ci(x.su), 'text'], ['ats', 'Cover %', (x) => x.ats.pct, 'pct'], ['m', 'Avg margin', (x) => x.margin, 's1'],
        ], rows: buckets })}
      </section>`,
      draw: (root) => {
        U.draw(root, 'fd-bucket', (el) => C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, hint: 'Click to list these games', series: [
          { name: 'Won the game', color: C.col.blue(), values: buckets.map((x) => x.su.pct), lo: buckets.map((x) => x.su.lo), hi: buckets.map((x) => x.su.hi), n: buckets.map((x) => x.su.n) },
          rateSeries('Covered the spread', C.col.teal(), buckets.map((x) => x.ats)),
        ], onClick: (i) => { const [a, z] = NE.SPREAD_RANGES[NE.SPREAD_BUCKETS[i]]; toGames({ smin: a, smax: z }); } }));
        U.draw(root, 'fd-trend', (el) => C.line(el, { cats: P.cats, xLabel: P.label, kind: 'pct', ref: 0.5, onClick: U.drill(P, games), hint: U.drillHint(P), series: [
          { name: 'Favorite win %', color: C.col.blue(), values: NE.metricSeries('fav_win', P.groups).values },
          { name: 'Favorite cover %', color: C.col.teal(), ...NE.metricSeries('fav_cover', P.groups) },
          { name: 'Underdog cover %', color: C.col.orange(), values: P.groups.map((x) => NE.ats(x, 'fav_ats').lpct) },
        ] }));
        U.draw(root, 'fd-exact', (el) => {
          const by = NE.groupBy(g, 'fav_line').filter(([, x]) => x.length >= 15);
          const s = by.map(([, x]) => NE.su(x, 'fav_su'));
          const a = by.map(([, x]) => NE.ats(x, 'fav_ats'));
          C.line(el, { cats: by.map(([l]) => d3.format('~g')(l)), xLabel: 'Spread', kind: 'pct', ref: 0.5, series: [
            { name: 'Favorite win %', color: C.col.blue(), values: s.map((r) => r.pct) },
            rateSeries('Favorite cover %', C.col.teal(), a),
          ] });
        });
      },
    };
  };

  NE.tabs.betting = (root) => {
    const { games, teamGames, scopeTeamGames } = NE.data();
    if (!games.length) { root.innerHTML = U.empty(); return; }
    const P = NE.periods(games);
    const parts = [];
    if (NE.showMarket('spread')) parts.push(spread(games, teamGames, scopeTeamGames, P));
    if (NE.showMarket('total')) parts.push(totals(games, teamGames, scopeTeamGames, P));
    if (NE.showMarket('ml')) parts.push(favdog(games, P));
    const nav = S.market === 'all'
      ? `<nav class="jump" aria-label="Sections"><span>Jump to</span><button type="button" data-go="${U.go({ _scroll: 'sec-spread' })}">Against the spread</button><button type="button" data-go="${U.go({ _scroll: 'sec-total' })}">Over / under</button><button type="button" data-go="${U.go({ _scroll: 'sec-ml' })}">Favorites vs. underdogs</button></nav>`
      : '';
    root.innerHTML = `
      <div class="page-h"><div><h2>Betting trends</h2><p class="lede">How games settled against the closing lines. ${S.market === 'all' ? 'All three markets are shown; use the Market filter to focus on one.' : `Showing the ${NE.MARKETS[S.market].toLowerCase()} market; set Market to All to see every section.`}</p></div></div>
      ${nav}
      ${parts.map((p) => p.html).join('')}`;
    for (const p of parts) p.draw(root);
  };
})();
