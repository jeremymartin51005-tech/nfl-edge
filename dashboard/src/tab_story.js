// The story: a guided read over every season, numbers computed live from the data.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;

  const chapter = (n, kicker, headline, body, chartId, cta, patch) => `
    <article class="chapter" id="chapter-${n}">
      <div class="chapter-t">
        <span class="kicker">${n} · ${kicker}</span>
        <h2>${headline}</h2>
        <p>${body}</p>
        <button type="button" class="btn" data-go="${U.go(patch)}">${cta} →</button>
      </div>
      <div class="chapter-c card"><div class="chart" data-chart="${chartId}"></div></div>
    </article>`;

  // Team-season measure in one season against the next.
  NE.PERSIST = {
    cover: { label: 'Cover %', get: (rows) => NE.ats(rows).pct, kind: 'pct' },
    win: { label: 'Win %', get: (rows) => NE.su(rows).pct, kind: 'pct' },
    over: { label: 'Over %', get: (rows) => NE.ou(rows).pct, kind: 'pct' },
    diff: { label: 'Point differential per game', get: (rows) => NE.mean(rows, 'margin'), kind: 'num' },
  };
  NE.persistence = (teamGames, metric) => {
    const m = NE.PERSIST[metric];
    const by = new Map(NE.groupBy(teamGames, (r) => `${r.team}|${r.season}`).map(([k, rows]) => [k, rows.length >= 8 ? m.get(rows) : null]));
    const pts = [];
    for (const [k, v] of by) {
      const [team, season] = k.split('|');
      const next = by.get(`${team}|${Number(season) + 1}`);
      if (v !== null && next !== null && next !== undefined) pts.push({ x: v, y: next, label: `${team}: ${season} → ${Number(season) + 1}`, team, group: 'pair' });
    }
    return { pts, r: NE.pearson(pts.map((p) => p.x), pts.map((p) => p.y)) };
  };

  NE.tabs.story = (root) => {
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
    const persist = NE.persistence(TG, 'cover');
    const persistWin = NE.persistence(TG, 'win');
    const scan = NE.scan(TG);
    const flagged = scan.filter((x) => x.flagged);
    const expected = scan.length * 0.05;
    const be = NE.mean(TG, 'spread_be');
    const aboveBe = teams.filter((t) => t.ats.lo !== null && t.ats.lo > be).length;
    const lead = flagged.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];

    root.innerHTML = `
      <div class="story">
        <p class="story-lede">Seven seasons of NFL games and the betting lines that closed on them. Six findings, ending with the most useful one for anyone reading betting trends: most of them are noise.</p>
        <p class="note">This tab always uses every season (2020 through week ${NE.latestWeek} of ${NE.latestSeason}); the filters apply to the other tabs. Each chapter opens the full view.</p>
        ${chapter(1, 'Scoring', `Scoring fell from ${f.n1(tot[0])} to ${f.n1(d3.min(tot))} points a game, then came back`,
          `Combined points peaked in ${peak} and bottomed out in ${low}. The closing total followed scoring down and back up, usually a step behind. The shaded band is the 95% range for each season’s average.`,
          'st-scoring', 'Open the scoring trend', { tab: 'overview', metric: 'avg_total', split: 'none', _scroll: 'card-ov-trend' })}
        ${chapter(2, 'Home field', `Home teams won ${f.pct(home20.value)} in empty-stadium 2020, against ${f.pct(homeRest.value)} since`,
          `With about ${f.int(Math.round(d3.mean(home, (p) => p.n)))} home games a season, each season’s rate is only known to within about ${f.n1(d3.mean(home, (p) => (p.hi - p.lo) / 2) * 100)} points either way, so single seasons bounce around. ${lowestFull === 2020 ? '2020 is still the lowest of the completed seasons.' : `The lowest completed season was ${lowestFull}.`}`,
          'st-home', 'Open home-field results', { tab: 'overview', metric: 'home_win', split: 'none', _scroll: 'card-ov-trend' })}
        ${chapter(3, 'Favorites', `Favorites win ${f.pct(fav.pct)} of games but cover only ${f.pct(favAts.pct)}`,
          `Winning and covering are different questions. Favorites of 7 or more won ${f.pct(bigSu.pct)} straight up yet covered ${f.pct(bigAts.pct)}. The spread does its job: it turns a lopsided game into something close to a coin flip.`,
          'st-fav', 'Open favorites vs. underdogs', { tab: 'betting', market: 'ml', _scroll: 'sec-ml' })}
        ${chapter(4, 'Totals', `Closing totals miss by ${f.n1(totalMae)} points a game, yet overs hit ${f.pct(overAll.pct)}`,
          `Single games are hard to call: the correlation between the closing total and the points scored is only ${f.n2(rTot)}. Over many games the line comes out close to balanced, which is what a market is for.`,
          'st-totals', 'Open over / under', { tab: 'betting', market: 'total', _scroll: 'sec-total' })}
        ${chapter(5, 'Teams', outside === 0 ? `Not one of ${teams.length} teams has a spread record that chance can’t explain` : `Only ${outside} of ${teams.length} teams have a spread record that chance can’t explain`,
          `Each dot is a team’s cover rate since 2020. The blue band is where a fair coin lands 95% of the time over the same number of games, about ${f.int(Math.round(d3.mean(teams, (t) => t.ats.dec)))} per team. A team’s cover rate one season barely predicts the next (correlation ${f.n2(persist.r)}), unlike its win rate (${f.n2(persistWin.r)}). At the closing prices a side needs ${f.pct(be)} just to break even; ${aboveBe === 0 ? 'no team' : `${aboveBe} team${aboveBe === 1 ? '' : 's'}`} cleared that with room to spare.`,
          'st-noise', 'Open the Trend lab', { tab: 'lab', funnel: 'cover', _scroll: 'card-lab-funnel' })}
        ${chapter(6, 'Leads, not edges', `${flagged.length} of ${scan.length} betting situations stand out from chance: ${flagged.length <= expected ? 'no more than' : flagged.length <= expected * 2 ? 'close to what' : 'more than'} luck alone would produce (about ${f.n1(expected)})`,
          `The dashboard tests a fixed list of common situations: spread ranges, home and road favorites and underdogs, division games, rest, total ranges and every team. Dots outside the band passed the 95% test.${lead ? ` The strongest, ${lead.spec.label.toLowerCase()}, went ${lead.res.rec} (${f.pct(lead.res.rate)}).` : ''} With this many tests, a few passes are expected by chance, so each one is a question to check in later seasons, not an answer.`,
          'st-scan', 'Test a situation yourself', { tab: 'lab', _scroll: 'card-lab-test' })}
        <section class="takeaways card">
          <h3>What to take from it</h3>
          <ol>
            <li><b>Check the sample before trusting a rate.</b> A 55% cover rate over 100 games has a 95% range of roughly 45% to 64%. Every rate on this dashboard shows its range.</li>
            <li><b>Separate winning from covering.</b> Strong teams win more; they do not cover more, because the line already prices them in.</li>
            <li><b>Remember the bookmaker’s cut.</b> At the closing prices, ${f.pct(be)} is break-even, not 50%.</li>
            <li><b>Prefer patterns that persist.</b> Win rates and point differential carry over from season to season; cover rates mostly do not.</li>
            <li><b>Count the tests.</b> Out of ${scan.length} situations, about ${f.n1(expected)} pass the 95% bar by luck. A pattern earns trust by holding up in seasons it was not found in.</li>
            <li><b>Know what the data can’t show.</b> Closing lines only: no line movement and no sportsbook comparisons.</li>
          </ol>
        </section>
      </div>`;

    const ci = (groups, field) => { const pts = groups.map(([, g]) => NE.meanCI(g, field)); return { lo: pts.map((p) => p.lo), hi: pts.map((p) => p.hi), n: pts.map((p) => p.n) }; };
    U.draw(root, 'st-scoring', (el) => C.line(el, { cats: seasons, xLabel: 'Season', hint: 'Click to open this season in the Overview', onClick: (i) => NE.set({ tab: 'overview', s0: seasons[i], s1: seasons[i] }), series: [
      { name: 'Combined points', color: C.col.blue(), values: tot, ...ci(bySeason, 'total_pts') },
      { name: 'Closing total', color: C.col.orange(), values: bySeason.map(([, g]) => NE.mean(g, 'total_line')), dash: true },
    ] }));
    U.draw(root, 'st-home', (el) => C.line(el, { cats: seasons, xLabel: 'Season', kind: 'pct', ref: 0.5, series: [{ name: 'Home win %', color: C.col.blue(), values: home.map((p) => p.value), lo: home.map((p) => p.lo), hi: home.map((p) => p.hi), n: home.map((p) => p.n) }] }));
    U.draw(root, 'st-fav', (el) => {
      const b = NE.SPREAD_BUCKETS.map((k) => G.filter((g) => g.spread_bucket === k));
      const su = b.map((g) => NE.su(g, 'fav_su'));
      const at = b.map((g) => NE.ats(g, 'fav_ats'));
      C.bars(el, { cats: NE.SPREAD_BUCKETS, xLabel: 'Spread', kind: 'pct', ref: 0.5, hint: 'Click to list these games', series: [
        { name: 'Won the game', color: C.col.blue(), values: su.map((r) => r.pct), lo: su.map((r) => r.lo), hi: su.map((r) => r.hi), n: su.map((r) => r.n) },
        { name: 'Covered the spread', color: C.col.teal(), values: at.map((r) => r.pct), lo: at.map((r) => r.lo), hi: at.map((r) => r.hi), n: at.map((r) => r.dec) },
      ], onClick: (i) => { const [a, z] = NE.SPREAD_RANGES[NE.SPREAD_BUCKETS[i]]; NE.set({ ...NE.specToExplorer({ side: 'all', team: '', opp: '', smin: a, smax: z, tmin: '', tmax: '', div: 'any' }), ...allSeasons() }); } });
    });
    U.draw(root, 'st-totals', (el) => C.scatter(el, { h: 320, points: G.map((g) => ({ x: g.total_line, y: g.total_pts, group: g.ou_result, label: U.gameLabel(g), id: g.game_id })), groups: ouGroups(), diag: true, diagLabel: 'Points = total', xLabel: 'Closing total', yLabel: 'Combined points', onClick: (p) => NE.set({ tab: 'games', game: p.id, ...allSeasons() }) }));
    U.draw(root, 'st-noise', (el) => C.funnel(el, { h: 340, points: teams.map((t) => ({ label: t.team, n: t.ats.dec, p: t.ats.pct })), p0: 0.5, yLabel: 'Cover %', onClick: (t) => NE.set({ tab: 'teams', pteam: t, tmode: 'profile', ...allSeasons() }) }));
    U.draw(root, 'st-scan', (el) => C.funnel(el, { h: 340, points: scan.filter((x) => !x.res.implied).map((x) => ({ label: x.spec.label.replace(' against the spread', ' ATS'), n: x.res.n, p: x.res.rate })), p0: 0.5, yLabel: 'Cover or over %' }));
  };
  const allSeasons = () => ({ s0: NE.DEFAULTS.s0, s1: NE.DEFAULTS.s1, d0: '', d1: '', phase: 'All', team: '', neutral: true });
  const ouGroups = () => [{ key: 'Over', name: 'Over', color: C.col.blue() }, { key: 'Under', name: 'Under', color: C.col.orange() }, { key: 'Push', name: 'Push', color: C.col.muted() }];
  NE.ouGroups = ouGroups;
})();
