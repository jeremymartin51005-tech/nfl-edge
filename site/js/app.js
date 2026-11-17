const RAW = window.NFL_DATA;

/* ---------- Data prep ---------- */
const DIV_OF = {};
for (const [d, ts] of Object.entries(RAW.divisions)) ts.forEach(t => DIV_OF[t] = d);
const ROUND = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference', SB: 'Super Bowl' };
const ROUND_S = { WC: 'WC', DIV: 'DIV', CON: 'CONF', SB: 'SB' };
const GAMES = RAW.games.map(r => {
  const g = {}; RAW.columns.forEach((c, i) => g[c] = r[i]);
  g.result = g.hs - g.as;                 // home margin
  g.pts = g.hs + g.as;
  g.margin = Math.abs(g.result);
  g.post = g.type !== 'REG';
  g.indoor = g.roof === 'dome' || g.roof === 'closed';
  g.prime = !!g.kick && g.kick >= '19:00';
  g.favTeam = g.fav === 1 ? g.home : g.fav === -1 ? g.away : null;
  g.dogTeam = g.fav === 1 ? g.away : g.fav === -1 ? g.home : null;
  // ATS: spread = points the HOME team is expected to win by (+ = home favored)
  g.homeAtsM = g.spread == null ? null : g.result - g.spread;
  g.favAtsM = (g.spread == null || !g.fav) ? null : (g.fav === 1 ? g.result : -g.result) - Math.abs(g.spread);
  g.favWon = g.fav ? Math.sign(g.fav === 1 ? g.result : -g.result) : null;
  g.ouM = g.total == null ? null : g.pts - g.total;
  g.ou = g.ouM == null ? '' : g.ouM > 0 ? 'Over' : g.ouM < 0 ? 'Under' : 'Push';
  g.atsWinner = g.homeAtsM == null ? '' : g.homeAtsM > 0 ? g.home : g.homeAtsM < 0 ? g.away : 'PUSH';
  return g;
});
const SEASONS = [...new Set(GAMES.map(g => g.season))].sort((a, b) => a - b);
const TEAMS = Object.keys(DIV_OF).sort();

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const pct = (x, d = 1) => x == null || isNaN(x) ? '–' : (x * 100).toFixed(d) + '%';
const num = (x, d = 1) => x == null || isNaN(x) ? '–' : x.toFixed(d);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Grade a list of signed margins: >0 win, 0 push, <0 loss. pct excludes pushes. */
function grade(ms) {
  let w = 0, l = 0, p = 0;
  for (const m of ms) { if (m == null) continue; if (m > 0) w++; else if (m < 0) l++; else p++; }
  return { w, l, p, n: w + l + p, pct: w + l ? w / (w + l) : NaN, rec: `${w}-${l}-${p}` };
}
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- Filters ---------- */
const F = { from: SEASONS[0], to: SEASONS[SEASONS.length - 1], type: 'all', div: '', team: '' };
function initFilters() {
  const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${t}</option>`;
  $('#fFrom').innerHTML = SEASONS.map(s => opt(s, s, s === F.from)).join('');
  $('#fTo').innerHTML = SEASONS.map(s => opt(s, s, s === F.to)).join('');
  $('#fDiv').innerHTML = opt('', 'All divisions') + Object.keys(RAW.divisions).map(d => opt(d, d)).join('');
  fillTeams();
  const on = (id, k, cast = v => v) => $(id).addEventListener('change', e => { F[k] = cast(e.target.value); onFilter(id); });
  on('#fFrom', 'from', Number); on('#fTo', 'to', Number); on('#fType', 'type'); on('#fDiv', 'div'); on('#fTeam', 'team');
  $('#resetBtn').onclick = () => {
    Object.assign(F, { from: SEASONS[0], to: SEASONS[SEASONS.length - 1], type: 'all', div: '', team: '' });
    $('#fFrom').value = F.from; $('#fTo').value = F.to; $('#fType').value = 'all'; $('#fDiv').value = ''; fillTeams(); render();
  };
}
function fillTeams() {
  const list = F.div ? RAW.divisions[F.div] : TEAMS;
  if (F.team && !list.includes(F.team)) F.team = '';
  $('#fTeam').innerHTML = `<option value="">All teams</option>` + list.map(t => `<option value="${t}"${t === F.team ? ' selected' : ''}>${t} – ${RAW.teamNames[t]}</option>`).join('');
}
function onFilter(id) {
  if (F.from > F.to) { if (id === '#fFrom') F.to = F.from; else F.from = F.to; $('#fFrom').value = F.from; $('#fTo').value = F.to; }
  if (id === '#fDiv') fillTeams();
  render();
}
/** Season + game-type filter only (no team/division). */
function baseGames() {
  return GAMES.filter(g => g.season >= F.from && g.season <= F.to &&
    (F.type === 'all' || (F.type === 'REG' ? !g.post : g.post)));
}
/** Full filter: also keeps only games involving the team / division. */
function games() {
  return baseGames().filter(g => {
    if (F.team) return g.home === F.team || g.away === F.team;
    if (F.div) return DIV_OF[g.home] === F.div || DIV_OF[g.away] === F.div;
    return true;
  });
}

/* ---------- Charts ---------- */
const charts = {};
const refLine = {
  id: 'refLine',
  afterDatasetsDraw(chart, _a, o) {
    if (o == null || o.value == null) return;
    const horiz = chart.options.indexAxis === 'y';
    const scale = horiz ? chart.scales.x : chart.scales.y;
    const px = scale.getPixelForValue(o.value), ca = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(px, ca.top); ctx.lineTo(px, ca.bottom); } else { ctx.moveTo(ca.left, px); ctx.lineTo(ca.right, px); }
    ctx.stroke(); ctx.restore();
  }
};
const barLabels = {
  id: 'barLabels',
  afterDatasetsDraw(chart, _a, o) {
    if (!o || !o.fmt) return;
    const ctx = chart.ctx, horiz = chart.options.indexAxis === 'y';
    ctx.save(); ctx.fillStyle = cssVar('--text-2'); ctx.font = '600 11px Inter, sans-serif';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const v = ds.data[i]; if (v == null || isNaN(v)) return;
        const t = o.fmt(v);
        if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, el.x + 5, el.y); }
        else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(t, el.x, Math.min(el.y, el.base) - 4); }
      });
    });
    ctx.restore();
  }
};
Chart.register(refLine, barLabels);

function baseOpts({ yPct = false, xPct = false, horiz = false, yMin, yMax, tooltip } = {}) {
  const grid = cssVar('--grid'), tick = cssVar('--text-2');
  const pctTick = v => Math.round(v * 100) + '%';
  const o = {
    responsive: true, maintainAspectRatio: false, animation: false,
    indexAxis: horiz ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 18, right: horiz ? 46 : 8 } },
    plugins: {
      legend: { display: false },
      tooltip: Object.assign({
        backgroundColor: cssVar('--surface'), titleColor: cssVar('--text'), bodyColor: cssVar('--text-2'),
        borderColor: cssVar('--border'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
        titleFont: { weight: '600' },
      }, tooltip || {}),
    },
    scales: {
      x: { grid: { display: horiz, color: grid }, border: { display: false }, ticks: { color: tick, maxRotation: 0 } },
      y: { grid: { display: !horiz, color: grid }, border: { display: false }, ticks: { color: tick, autoSkip: !horiz } },
    },
  };
  const v = horiz ? o.scales.x : o.scales.y;           // value axis
  if (yMin != null) v.min = yMin;
  if (yMax != null) v.max = yMax;
  if (yPct || xPct) v.ticks.callback = pctTick;
  return o;
}
function draw(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}
const BAR = { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 46, categoryPercentage: .72, barPercentage: .9, borderColor: 'transparent' };

/* ---------- Pages ---------- */
let tab = 'overview';
function render() {
  const g = games(), last = SEASONS[SEASONS.length - 1];
  document.querySelectorAll('#presets button').forEach(b => { const n = +b.dataset.n; b.setAttribute('aria-pressed', F.to === last && F.from === (n ? SEASONS[Math.max(0, SEASONS.length - n)] : SEASONS[0])); });
  $('#resetBtn').classList.toggle('active', F.from !== SEASONS[0] || F.to !== last || F.type !== 'all' || !!F.div || !!F.team);
  const seasons = F.from === F.to ? `${F.from}` : `${F.from}–${F.to}`;
  const type = { all: 'regular season + playoffs', REG: 'regular season', POST: 'playoffs' }[F.type];
  const who = F.team ? ` · games involving <b>${F.team}</b>` : F.div ? ` · games involving the <b>${F.div}</b>` : '';
  const partial = F.to === SEASONS[SEASONS.length - 1] ? ` · ${F.to} season is in progress (through ${RAW.meta.lastGame})` : '';
  $('#summary').innerHTML = `Showing <b>${g.length.toLocaleString()}</b> completed games · ${seasons} · ${type}${who}${partial}`;
  ({ overview: renderOverview, spreads: renderSpreads, totals: renderTotals, margins: renderMargins, research: g => rsMode === 'log' ? renderLog(g) : rsMode === 'compare' ? renderCompare() : renderResearch(g) })[tab](g);
}

const TIPS = {
  cover: 'How often this side beat the point spread. Covers ÷ (covers + non-covers); pushes are left out.',
  favwin: 'How often the favorite won the game outright, whatever the spread.',
  over: 'How often the combined score finished above the over/under total. Pushes are left out.',
  under: 'How often the combined score finished below the total. It is 100% minus the over rate.',
  ppg: 'Home score plus away score, averaged across games.',
  total: 'The over/under line: the combined score the sportsbook expected.',
  vsTotal: 'Average of actual combined points minus the closing total. Positive means games outscored the line.',
  margin: 'Points between the winner and the loser, averaged across games.',
  median: 'The middle game: half of games were closer than this, half were not.',
  onescore: 'Games decided by 7 points or fewer, a single touchdown.',
  blowout: 'Games decided by 17 points or more, at least three scores.',
  key: 'Games that ended exactly 3 or 7 apart, the most common NFL margins. Spreads near these numbers matter most.',
  hfa: 'Average home score minus away score. Neutral-site games are left out.',
  homewin: 'Share of games won by the home team. Neutral-site games are left out.',
  wlp: 'Wins, losses and pushes. A push is a tie against the number and is refunded.',
  vsSpread: 'Average points by which the side beat (+) or missed (−) the spread.',
  chance: 'Whether the rate is far enough from 50% that luck alone is an unlikely explanation (95% confidence).',
};
const tip = k => `<span class="tip" tabindex="0" data-tip="${TIPS[k]}" title="${TIPS[k]}">?</span>`;
function kpi(label, value, sub, ctx) { return `<div class="kpi"><div class="l">${label}</div><div class="v">${value}</div><div class="s">${sub || ''}</div>${ctx ? `<div class="c">${ctx}</div>` : ''}</div>`; }

/* Overview */
function renderOverview(g) {
  if (!g.length) { $('#ovKpis').innerHTML = ''; $('#ovInsights').innerHTML = ''; $('#ovMap').innerHTML = '<div class="empty">No games match these filters.</div>'; return; }
  const fav = grade(g.map(x => x.favAtsM));
  const home = grade(g.filter(x => !x.neutral).map(x => x.homeAtsM));
  const ou = grade(g.map(x => x.ouM));
  // --- benchmarks: league baseline (all teams, all seasons, same game-type filter) and previous season ---
  const lg = GAMES.filter(x => F.type === 'all' || (F.type === 'REG' ? !x.post : x.post));
  const narrowed = g.length !== lg.length;
  const span = `${SEASONS[0]}–${SEASONS[SEASONS.length - 1]}`;
  const arrow = d => +d.toFixed(1) > 0 ? '▲' : +d.toFixed(1) < 0 ? '▼' : '■';
  const sgn = (d, dp = 1) => { const r = +d.toFixed(dp); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(dp); };
  const be = r => `${arrow((r - BE) * 100)} ${sgn((r - BE) * 100)} vs. 52.4% break-even`;
  const vsLg = (v, base, unit, pctMode) => `${arrow(pctMode ? (v - base) * 100 : v - base)} ${sgn(pctMode ? (v - base) * 100 : v - base)}${unit} vs. league (${pctMode ? pct(base) : num(base)})`;
  const ss = [...new Set(g.map(x => x.season))].sort((x, y) => x - y);
  const prevCmp = (fn, unit) => {                      // latest season in view vs. the one before it
    if (ss.length < 2) return '';
    const l = ss[ss.length - 1], p = ss[ss.length - 2];
    const lv = +fn(g.filter(x => x.season === l)).toFixed(1), pv = +fn(g.filter(x => x.season === p)).toFixed(1);
    return `${l} alone: ${num(lv)}, ${arrow(lv - pv)} ${sgn(lv - pv)} vs. ${p} (${num(pv)})`;
  };
  const avgPts = a => mean(a.map(x => x.pts)), avgMar = a => mean(a.map(x => x.margin));
  const lgFav = grade(lg.map(x => x.favAtsM)).pct, lgHome = grade(lg.filter(x => !x.neutral).map(x => x.homeAtsM)).pct, lgOu = grade(lg.map(x => x.ouM)).pct;
  const both = (a, b) => [a, b].filter(Boolean).join('<br>');
  $('#ovKpis').innerHTML = [
    kpi('Games', g.length.toLocaleString(), `${ss.length} season(s)`, narrowed ? `${pct(g.length / lg.length, 0)} of all ${lg.length.toLocaleString()} games` : ''),
    kpi('Points per game' + tip('ppg'), num(avgPts(g)), `Avg closing total ${num(mean(g.filter(x => x.total != null).map(x => x.total)))}`, both(narrowed ? vsLg(avgPts(g), avgPts(lg), ' pts') : '', prevCmp(avgPts, ' pts'))),
    kpi('Favorite cover %' + tip('cover'), pct(fav.pct), fav.rec, both(be(fav.pct), narrowed ? vsLg(fav.pct, lgFav, ' pts', true) : '')),
    kpi('Home cover %' + tip('cover'), pct(home.pct), home.rec, both(be(home.pct), narrowed ? vsLg(home.pct, lgHome, ' pts', true) : '')),
    kpi('Over %' + tip('over'), pct(ou.pct), ou.rec, both(be(ou.pct), narrowed ? vsLg(ou.pct, lgOu, ' pts', true) : '')),
    kpi('Avg margin of victory' + tip('margin'), num(avgMar(g)) + ' pts', `${pct(g.filter(x => x.margin <= 7).length / g.length, 0)} decided by ≤ 7`, both(narrowed ? vsLg(avgMar(g), avgMar(lg), ' pts') : '', prevCmp(avgMar, ' pts'))),
  ].join('');
  renderInsights(GAMES, span);

  renderMap(g);
}

/* Insights: always computed on the league baseline so the wording stays valid under any filter */
function renderInsights(lg, span) {
  $('#insScope').textContent = `· all ${lg.length.toLocaleString()} games, ${span}, not affected by filters`;
  const I = [];
  const bk = BUCKETS.map(([l, lo, hi]) => { const gs = lg.filter(x => x.fav && Math.abs(x.spread) >= lo && Math.abs(x.spread) <= hi); return { n: gs.length, c: grade(gs.map(x => x.favAtsM)).pct, w: gs.filter(x => x.favWon === 1).length / gs.length }; }).filter(b => b.n >= 30);
  const fav = grade(lg.map(x => x.favAtsM));
  if (bk.length > 1) {
    const cs = bk.map(b => b.c);
    I.push(['Favorites win, but do not cover', `As spreads grow, favorites' win rate climbs from <b>${pct(bk[0].w, 0)}</b> to <b>${pct(bk[bk.length - 1].w, 0)}</b>. Their cover rate stays between <b>${pct(Math.min(...cs), 0)}</b> and <b>${pct(Math.max(...cs), 0)}</b>.`,
      fav.pct < BE ? 'A likely winner is not a likely cover.' : 'Favorites have cleared break-even here, but not by spread size.', 'spreads', 'size']);
  }
  const ind = lg.filter(x => x.roof && x.indoor), out = lg.filter(x => x.roof && !x.indoor);
  if (ind.length && out.length) {
    const tl = a => mean(a.filter(x => x.total != null).map(x => x.total)), io = grade(ind.map(x => x.ouM)).pct;
    I.push(['The roof is already in the total', `Indoor games score <b>${num(mean(ind.map(x => x.pts)))}</b> points to <b>${num(mean(out.map(x => x.pts)))}</b> outdoors, but indoor totals are set higher too (<b>${num(tl(ind))}</b> vs. <b>${num(tl(out))}</b>).`,
      io > BE ? 'Indoor overs have cleared break-even, narrowly.' : 'Playing indoors is not a reason to bet the over.', 'totals', 'roof']);
  }
  const nn = lg.filter(x => !x.neutral), home = grade(nn.map(x => x.homeAtsM));
  I.push(['Home field is already in the spread', `Home teams win <b>${pct(nn.filter(x => x.result > 0).length / nn.length)}</b> of games but cover <b>${pct(home.pct)}</b>.`,
    home.pct > BE ? 'Home teams have cleared break-even in this sample.' : 'Do not add points for home field.', 'spreads', 'hfa']);
  const tr = TEAMS.map(t => { const gr = grade(lg.filter(x => x.home === t || x.away === t).map(x => x.homeAtsM == null ? null : x.home === t ? x.homeAtsM : -x.homeAtsM)); return { t, ...gr }; }).filter(r => r.w + r.l >= 30).sort((a, b) => b.pct - a.pct);
  if (tr.length > 1) {
    const top = tr[0], bot = tr[tr.length - 1];
    I.push(['Teams differ more than situations', `<b>${top.t}</b> has covered <b>${pct(top.pct)}</b> and <b>${bot.t}</b> <b>${pct(bot.pct)}</b>. <b>${tr.filter(r => r.pct > BE).length} of ${tr.length}</b> teams beat break-even.`,
      'Check a team’s splits and sample size before leaning on it.', 'spreads', 'teams']);
  }
  $('#ovInsights').innerHTML = I.map(a => `<div class="answer"><div class="q">${a[0]}</div><div class="a">${a[1]}</div><div class="so">${a[2]}</div><button data-go="${a[3]}" data-q="${a[4]}">See the evidence →</button></div>`).join('');
  document.querySelectorAll('#ovInsights [data-go], .lede [data-go]').forEach(b => b.onclick = () => go(b.dataset.go, b.dataset.q));
}

/* ---------- Question framework ---------- */
const BE = 0.5238;
const TREE = [
  { tab: 'spreads', title: 'The spread',
    big: ['sides', 'Does either side of the spread win more often than it should?'],
    drivers: [['size', 'Does a bigger spread make the favorite more or less likely to cover?'], ['hfa', 'How much is home field worth, and is it already in the line?']],
    detail: [['teams', 'Which teams have covered most and least often, as favorites and as underdogs?'], ['exact', 'How have favorites done at each exact spread?']] },
  { tab: 'totals', title: 'Totals',
    big: ['trend', 'Is NFL scoring rising or falling, and do the totals keep pace?'],
    drivers: [['roof', 'Do indoor games produce more points, and more overs, than outdoor games?'], ['tsize', 'Do high totals go over more or less often than low ones?']],
    detail: [['stadiums', 'Which stadiums play over or under their totals?'], ['teampts', 'Which teams’ games are the highest and lowest scoring?']] },
  { tab: 'margins', title: 'Margin of victory',
    big: ['close', 'How close is a typical NFL game?'],
    drivers: [['type', 'Are divisional, prime-time and playoff games closer than the rest?'], ['week', 'Do games get closer or more lopsided as the season goes on?']],
    detail: [['typetable', 'How do one-score games and blowouts split by game type?'], ['phase', 'Does the early-to-late pattern hold in every season?']] },
];
/* Chance tests: normal approximation, two-sided, 95% level (|z| >= 1.96). */
const zProp = gr => { const n = gr.w + gr.l; return n ? (gr.w - n / 2) / Math.sqrt(n / 4) : 0; };            // rate vs. 50%
const zTwoProp = (a, b) => { const n1 = a.w + a.l, n2 = b.w + b.l; if (!n1 || !n2) return 0; const p = (a.w + b.w) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); return se ? (a.w / n1 - b.w / n2) / se : 0; };
const variance = a => { const m = mean(a); return a.length > 1 ? a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) : NaN; };
const zMeans = (a, b) => { if (a.length < 2 || b.length < 2) return 0; const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length); return se ? (mean(a) - mean(b)) / se : 0; };
const real = z => Math.abs(z) >= 1.96;
const chancePill = gr => !(gr.w + gr.l) ? '' : real(zProp(gr)) ? '<span class="pill">more than chance</span>' : '<span class="pill mute">could be chance</span>';
const chanceTxt = z => real(z) ? 'more than chance' : 'could be chance';
const median = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const TBUCKETS = [['40 or less', 0, 40], ['40.5–43.5', 40.5, 43.5], ['44–46.5', 44, 46.5], ['47–49.5', 47, 49.5], ['50 or more', 50, 99]];
const B = x => `<b>${x}</b>`;

/** One-line answer to every question, from the filtered games. */
function answers(g) {
  const A = {}, nn = g.filter(x => !x.neutral), bg = baseGames();
  // --- spread ---
  const sides = [['Favorites', g.map(x => x.favAtsM)], ['Underdogs', g.map(x => x.favAtsM == null ? null : -x.favAtsM)], ['Home teams', nn.map(x => x.homeAtsM)], ['Away teams', nn.map(x => x.homeAtsM == null ? null : -x.homeAtsM)]].map(([name, ms]) => ({ name, ...grade(ms) }));
  const top = sides.slice().sort((a, b) => b.pct - a.pct)[0];
  A.sides = top.pct > BE ? `Yes, in these games. ${top.name} have covered ${B(pct(top.pct))} (${top.rec}), above the 52.4% needed to break even.`
    : `No. ${top.name} come closest at ${B(pct(top.pct))} (${top.rec}), short of the 52.4% needed to break even.`;
  A.sides += real(zProp(top)) ? ' The gap from 50% is more than chance would explain.' : ' A gap that small from 50% could be chance.';
  const fv = g.filter(x => x.fav), sm = fv.filter(x => Math.abs(x.spread) <= 3), bgF = fv.filter(x => Math.abs(x.spread) >= 7);
  const cs = grade(sm.map(x => x.favAtsM)).pct, cb = grade(bgF.map(x => x.favAtsM)).pct, wr = a => a.filter(x => x.favWon === 1).length / a.length;
  A.size = `${cb < cs - .01 ? 'Slightly less.' : cb > cs + .01 ? 'Slightly more.' : 'It makes almost no difference.'} Favorites of 3 or fewer cover ${B(pct(cs))} and favorites of 7 or more cover ${B(pct(cb))}, even though they win ${B(pct(wr(sm), 0))} and ${B(pct(wr(bgF), 0))} of the time. The cover gap ${real(zTwoProp(grade(sm.map(x => x.favAtsM)), grade(bgF.map(x => x.favAtsM)))) ? 'is more than chance' : 'could be chance'}.`;
  const hc = grade(nn.map(x => x.homeAtsM)).pct, hm = mean(nn.map(x => x.result));
  A.hfa = `About ${B(num(Math.abs(hm)))} ${hm < 0 ? 'points against the home team' : 'points'}: home teams win ${B(pct(nn.filter(x => x.result > 0).length / nn.length))} of games but cover ${B(pct(hc))}, so the line ${hc <= .5 ? 'already accounts for it' : 'accounts for most of it'}.`;
  const tr = teamRows(bg, 'all', 10);
  A.teams = tr.length > 1 ? `${B(tr[0].team)} leads at ${B(pct(tr[0].pct))} (${tr[0].rec}); ${B(tr[tr.length - 1].team)} is last at ${B(pct(tr[tr.length - 1].pct))} (${tr[tr.length - 1].rec}). ${B(tr.filter(r => real(zProp(r))).length + ' of ' + tr.length)} teams are further from 50% than chance would explain.` : null;
  const ex = exactRows(g).filter(r => r.n >= 20).sort((a, b) => b.n - a.n).slice(0, 2);
  A.exact = ex.length ? `The most common ${ex.length > 1 ? 'lines are' : 'line is'} ${ex.map(r => `${B(r.line)} (${r.n} games, favorites cover ${B(pct(r.gr.pct))})`).join(' and ')}.` : null;
  // --- totals ---
  const ou = grade(g.map(x => x.ouM));
  const bs = [...new Set(g.map(x => x.season))].sort((a, b) => a - b).map(s => ({ s, v: mean(g.filter(x => x.season === s).map(x => x.pts)) }));
  if (bs.length > 1) {
    const f = bs[0], l = bs[bs.length - 1], d = +(l.v - f.v).toFixed(1);
    A.trend = `${d > 0 ? 'Up' : d < 0 ? 'Down' : 'Flat:'} ${d ? B(num(Math.abs(d))) + ' points a game' : ''} since ${f.s} (${num(f.v)} to ${num(l.v)}). ${Math.abs(ou.pct - .5) < .025 ? 'Totals have kept pace' : ou.pct > .5 ? 'Games have outscored the totals' : 'Totals have run ahead of the scoring'}: the over has hit ${B(pct(ou.pct))} (${ou.rec}).`;
  } else A.trend = bs.length ? `Games in ${bs[0].s} average ${B(num(bs[0].v))} points and the over has hit ${B(pct(ou.pct))} (${ou.rec}). Pick more than one season to see the trend.` : null;
  const ind = g.filter(x => x.roof && x.indoor), out = g.filter(x => x.roof && !x.indoor);
  const ip = mean(ind.map(x => x.pts)), op = mean(out.map(x => x.pts)), io = grade(ind.map(x => x.ouM)).pct, oo = grade(out.map(x => x.ouM)).pct;
  A.roof = ind.length && out.length ? `${ip > op ? 'More points, yes' : 'Not more points'}: ${B(num(ip))} indoors to ${B(num(op))} outdoors. ${io - oo > .05 ? 'More overs too' : io > oo ? 'More overs, but only slightly' : 'Not more overs'}: ${B(pct(io))} indoors to ${B(pct(oo))} outdoors. The scoring gap ${real(zMeans(ind.map(x => x.pts), out.map(x => x.pts))) ? 'is more than chance' : 'could be chance'}; the over gap ${real(zTwoProp(grade(ind.map(x => x.ouM)), grade(out.map(x => x.ouM)))) ? 'is too' : 'could be chance'}.` : null;
  const tb = totalRows(g).filter(r => r.gr.w + r.gr.l >= 20);
  A.tsize = tb.length > 1 ? `Totals of ${tb[0].l} go over ${B(pct(tb[0].gr.pct))} of the time; totals of ${tb[tb.length - 1].l} go over ${B(pct(tb[tb.length - 1].gr.pct))}. That gap ${real(zTwoProp(tb[0].gr, tb[tb.length - 1].gr)) ? 'is more than chance' : 'could be chance'}.` : null;
  const st = stadiumRows(g).filter(r => r.n >= 10 && !isNaN(r.line)).sort((a, b) => (b.pts - b.line) - (a.pts - a.line));
  A.stadiums = st.length > 1 ? `${B(esc(st[0].stadium))} runs furthest over its totals (${B('+' + num(st[0].pts - st[0].line))} a game); ${B(esc(st[st.length - 1].stadium))} runs furthest under (${B(num(st[st.length - 1].pts - st[st.length - 1].line).replace('-', '−'))}).` : null;
  const tp = teamPtsRows(bg).sort((a, b) => b.comb - a.comb);
  A.teampts = tp.length > 1 ? `${B(tp[0].team)} games average the most points (${B(num(tp[0].comb))}); ${B(tp[tp.length - 1].team)} games the fewest (${B(num(tp[tp.length - 1].comb))}).` : null;
  // --- margins ---
  const mg = g.map(x => x.margin), share = (a, f) => a.length ? a.filter(f).length / a.length : NaN;
  A.close = `The average game is decided by ${B(num(mean(mg)))} points (median ${num(median(mg), 0)}). ${B(pct(share(g, x => x.margin <= 7), 0))} finish within 7 and ${B(pct(share(g, x => x.margin >= 17), 0))} by 17 or more.`;
  const am = f => mean(g.filter(f).map(x => x.margin)), dv = am(x => x.div), nd = am(x => !x.div), pr = am(x => x.prime), po = am(x => x.post);
  A.type = isNaN(dv) || isNaN(nd) ? null : `${Math.abs(dv - nd) < .5 ? 'Barely.' : dv < nd ? 'Divisional games are.' : 'Divisional games are not.'} Divisional games are decided by ${B(num(dv))} points and the rest by ${B(num(nd))}` + (isNaN(pr) ? '' : `; prime time ${B(num(pr))}`) + (isNaN(po) ? '' : `; playoffs ${B(num(po))}`) + `. The divisional gap ${chanceTxt(zMeans(g.filter(x => x.div).map(x => x.margin), g.filter(x => !x.div).map(x => x.margin))) === 'more than chance' ? 'is more than chance' : 'could be chance'}.`;
  const reg = g.filter(x => !x.post), e = mean(reg.filter(x => x.week <= 6).map(x => x.margin)), lt = mean(reg.filter(x => x.week >= 13).map(x => x.margin));
  const wz = real(zMeans(reg.filter(x => x.week <= 6).map(x => x.margin), reg.filter(x => x.week >= 13).map(x => x.margin)));
  A.week = isNaN(e) || isNaN(lt) ? null : `${!wz ? 'No clear change.' : lt > e ? 'More lopsided.' : 'Closer.'} Weeks 1–6 average ${B(num(e))} points, weeks 13–18 average ${B(num(lt))}` + (isNaN(po) ? '' : `, and the playoffs ${B(num(po))}`) + `. The early-to-late gap ${real(zMeans(reg.filter(x => x.week <= 6).map(x => x.margin), reg.filter(x => x.week >= 13).map(x => x.margin))) ? 'is more than chance' : 'could be chance'}.`;
  const tt = typeRows(g), fd = n => tt.find(r => r.l === n);
  A.typetable = fd('Divisional') && fd('Playoffs') ? `${B(pct(fd('Divisional').close, 0))} of divisional games and ${B(pct(fd('Playoffs').close, 0))} of playoff games finish within one score, against ${B(pct(fd('All games').close, 0))} overall.`
    : fd('All games') ? `${B(pct(fd('All games').close, 0))} of these games finish within one score.` : null;
  const ph = phaseRows(g).filter(r => !isNaN(r.early) && !isNaN(r.late));
  A.phase = ph.length ? `Late-season games were more lopsided than early ones in ${B(ph.filter(r => r.late > r.early).length + ' of ' + ph.length)} seasons.` : null;
  for (const k in A) if (!A[k] || /NaN|(^|[^0-9])–([^0-9]|$)/.test(A[k].replace(/<[^>]+>/g, ''))) A[k] = 'Not enough games in these filters to say.';
  return A;
}
/** Fill the question and answer line of every drill-down block on a page. */
function fillQuestions(tabId, g) {
  const A = answers(g), t = TREE.find(x => x.tab === tabId);
  [t.big, ...t.drivers, ...t.detail].forEach(([id, q]) => {
    $('#q-' + id + ' > summary').innerHTML = `<span class="qq">${q}</span><span class="chev"><span class="o">Show the evidence ▾</span><span class="c">Hide ▴</span></span><span class="aa">${A[id]}</span>`;
  });
}
function go(tabId, qid) {
  setTab(tabId);
  if (!qid) return;
  const el = document.getElementById('q-' + qid);
  if (el) { el.open = true; render(); el.scrollIntoView({ block: 'start' }); }
}
function renderMap(g) {
  const A = answers(g);
  $('#ovMap').innerHTML = TREE.map(t => `<div class="card map"><div class="sec">${t.title}</div>
    <div class="bq"><button data-go="${t.tab}" data-q="${t.big[0]}">${t.big[1]}</button></div><div class="ba">${A[t.big[0]]}</div>
    <ul>${[...t.drivers, ...t.detail].map(([id, q]) => `<li class="d"><button data-go="${t.tab}" data-q="${id}">${q}</button></li>`).join('')}</ul></div>`).join('');
  document.querySelectorAll('#ovMap [data-go]').forEach(b => b.onclick = () => go(b.dataset.go, b.dataset.q));
}

/* ---------- Row builders shared by answers and tables ---------- */
let teamRole = 'all';
function teamRows(gs, role, minN = 0) {
  const teams = F.div ? RAW.divisions[F.div] : TEAMS;
  const rows = teams.map(t => {
    const mine = gs.filter(x => x.home === t || x.away === t);
    const tm = x => x.homeAtsM == null ? null : (x.home === t ? x.homeAtsM : -x.homeAtsM);
    const pick = role === 'fav' ? mine.filter(x => x.favTeam === t) : role === 'dog' ? mine.filter(x => x.dogTeam === t) : mine;
    const gr = grade(pick.map(tm));
    const fv = grade(mine.filter(x => x.favTeam === t).map(tm)), dg = grade(mine.filter(x => x.dogTeam === t).map(tm));
    return { team: t, div: DIV_OF[t], ...gr, fav: fv, dog: dg, atsM: mean(pick.map(tm).filter(v => v != null)) };
  }).filter(r => r.n >= minN && !isNaN(r.pct));
  return rows.sort((a, b) => b.pct - a.pct || b.n - a.n);
}
function exactRows(g) {
  const by = {};
  g.forEach(x => { if (x.fav && x.spread != null) (by[Math.abs(x.spread)] ||= []).push(x); });
  return Object.entries(by).map(([k, gs]) => ({ v: +k, line: +k === 0 ? "Pick'em" : '−' + k, n: gs.length, gr: grade(gs.map(x => x.favAtsM)), win: gs.filter(x => x.favWon === 1).length / gs.length, atsM: mean(gs.map(x => x.favAtsM)) }));
}
function totalRows(g) {
  return TBUCKETS.map(([l, lo, hi]) => { const gs = g.filter(x => x.total != null && x.total >= lo && x.total <= hi); return { l, n: gs.length, gr: grade(gs.map(x => x.ouM)), pts: mean(gs.map(x => x.pts)), line: mean(gs.map(x => x.total)) }; }).filter(r => r.n);
}
function stadiumRows(g) {
  const by = {};
  g.forEach(x => { if (x.stadium) (by[x.stadium] ||= []).push(x); });
  return Object.entries(by).map(([s, gs]) => {
    const rc = {}; gs.forEach(x => rc[x.roof] = (rc[x.roof] || 0) + 1);
    const roof = Object.entries(rc).sort((a, b) => b[1] - a[1])[0][0];
    const homes = {}; gs.filter(x => !x.neutral).forEach(x => homes[x.home] = (homes[x.home] || 0) + 1);
    const team = Object.entries(homes).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 2).join(' / ') || 'Neutral';
    return { stadium: s, team, roof: ROOF[roof] || roof || '–', indoor: roof === 'dome' || roof === 'closed', n: gs.length, pts: mean(gs.map(x => x.pts)), line: mean(gs.filter(x => x.total != null).map(x => x.total)), ou: grade(gs.map(x => x.ouM)) };
  });
}
function teamPtsRows(gs) {
  return (F.div ? RAW.divisions[F.div] : TEAMS).map(t => {
    const mine = gs.filter(x => x.home === t || x.away === t);
    return { team: t, div: DIV_OF[t], n: mine.length, pf: mean(mine.map(x => x.home === t ? x.hs : x.as)), pa: mean(mine.map(x => x.home === t ? x.as : x.hs)), comb: mean(mine.map(x => x.pts)), line: mean(mine.filter(x => x.total != null).map(x => x.total)), ou: grade(mine.map(x => x.ouM)) };
  }).filter(r => r.n);
}
function typeRows(g) {
  const s1 = cssVar('--s1'), s2 = cssVar('--s2'), s3 = cssVar('--s3'), nu = cssVar('--neutral');
  return [['All games', g, nu], ['Divisional', g.filter(x => x.div), s1], ['Non-divisional', g.filter(x => !x.div), s1],
    ['Prime time', g.filter(x => x.prime), s3], ['Day games', g.filter(x => !x.prime), s3],
    ['Regular season', g.filter(x => !x.post), s2], ['Playoffs', g.filter(x => x.post), s2]]
    .map(([l, gs, c]) => ({ l, c, n: gs.length, m: mean(gs.map(x => x.margin)), med: median(gs.map(x => x.margin)), close: gs.filter(x => x.margin <= 7).length / gs.length, blow: gs.filter(x => x.margin >= 17).length / gs.length, favWin: gs.filter(x => x.favWon === 1).length / gs.filter(x => x.fav).length })).filter(r => r.n);
}
function phaseRows(g) {
  return [...new Set(g.map(x => x.season))].sort((a, b) => a - b).map(s => {
    const gs = g.filter(x => x.season === s), reg = gs.filter(x => !x.post), m = a => mean(a.map(x => x.margin));
    return { season: s, n: gs.length, early: m(reg.filter(x => x.week <= 6)), mid: m(reg.filter(x => x.week >= 7 && x.week <= 12)), late: m(reg.filter(x => x.week >= 13)), post: m(gs.filter(x => x.post)) };
  });
}

/* ---------- The spread ---------- */
const BUCKETS = [['Pick–2.5', 0, 2.5], ['3', 3, 3], ['3.5–6.5', 3.5, 6.5], ['7', 7, 7], ['7.5–9.5', 7.5, 9.5], ['10–13.5', 10, 13.5], ['14+', 14, 99]];
function renderSpreads(g) {
  fillQuestions('spreads', g);
  const nn = g.filter(x => !x.neutral);
  const home = grade(nn.map(x => x.homeAtsM)), fav = grade(g.map(x => x.favAtsM));
  $('#hfKpis').innerHTML = [
    kpi('Favorite cover %' + tip('cover'), pct(fav.pct), fav.rec + ' ' + tip('wlp')),
    kpi('Favorite win %' + tip('favwin'), pct(g.filter(x => x.favWon === 1).length / g.filter(x => x.fav).length), 'Outright'),
    kpi('Home cover %' + tip('cover'), pct(home.pct), home.rec),
    kpi('Home win %' + tip('homewin'), pct(nn.filter(x => x.result > 0).length / nn.length), `${nn.length.toLocaleString()} non-neutral games`),
    kpi('Home-field advantage' + tip('hfa'), (mean(nn.map(x => x.result)) >= 0 ? '+' : '') + num(mean(nn.map(x => x.result))) + ' pts', 'Avg home margin'),
  ].join('');
  const s1 = cssVar('--s1'), s2 = cssVar('--s2'), s3 = cssVar('--s3'), nu = cssVar('--neutral');
  const roleChart = (id, roles) => {
    roles = roles.map(([name, ms]) => ({ name, ...grade(ms) }));
    const o = baseOpts({ horiz: true, xPct: true, yMin: .3, yMax: .7 });
    o.plugins.refLine = { value: .5 }; o.plugins.barLabels = { fmt: v => pct(v) };
    o.interaction = { mode: 'nearest', axis: 'y', intersect: false };
    o.plugins.tooltip.callbacks = { label: i => [`Cover %: ${pct(roles[i.dataIndex].pct)}`, `Record (W-L-P): ${roles[i.dataIndex].rec}`, `Gap from 50%: ${chanceTxt(zProp(roles[i.dataIndex]))}`] };
    o.scales.x.ticks.stepSize = .1;
    draw(id, { type: 'bar', data: { labels: roles.map(r => r.name), datasets: [{ data: roles.map(r => r.pct), backgroundColor: roles.map(r => r.pct > .5 ? s1 : nu), ...BAR, borderSkipped: false, maxBarThickness: 24 }] }, options: o });
  };
  roleChart('cSides', [['Favorites', g.map(x => x.favAtsM)], ['Underdogs', g.map(x => x.favAtsM == null ? null : -x.favAtsM)], ['Home teams', nn.map(x => x.homeAtsM)], ['Away teams', nn.map(x => x.homeAtsM == null ? null : -x.homeAtsM)]]);

  const bk = BUCKETS.map(([l, lo, hi]) => {
    const gs = g.filter(x => x.fav && Math.abs(x.spread) >= lo && Math.abs(x.spread) <= hi);
    return { l, n: gs.length, gr: grade(gs.map(x => x.favAtsM)), win: gs.length ? gs.filter(x => x.favWon === 1).length / gs.length : NaN };
  });
  const o = baseOpts({ yPct: true, yMin: 0, yMax: 1 });
  o.plugins.refLine = { value: .5 }; o.plugins.barLabels = { fmt: v => pct(v, 0) };
  o.plugins.tooltip.callbacks = { title: i => `Favorite by ${bk[i[0].dataIndex].l} pts`,
    label: i => i.datasetIndex === 0 ? `Cover %: ${pct(bk[i.dataIndex].gr.pct)} (${bk[i.dataIndex].gr.rec})` : `Win %: ${pct(bk[i.dataIndex].win)}`,
    footer: i => `n = ${bk[i[0].dataIndex].n} games · cover gap from 50%: ${chanceTxt(zProp(bk[i[0].dataIndex].gr))}` };
  draw('cSpread', { type: 'bar', data: { labels: bk.map(b => [b.l, `n=${b.n}`]), datasets: [
    { label: 'Cover %', data: bk.map(b => b.gr.pct), backgroundColor: s1, ...BAR },
    { label: 'Win %', data: bk.map(b => b.win), backgroundColor: s2, ...BAR }] }, options: o });

  const ss = SEASONS.filter(s => s >= F.from && s <= F.to).map(s => {
    const gs = nn.filter(x => x.season === s);
    return { s, m: mean(gs.map(x => x.result)), line: mean(gs.filter(x => x.spread != null).map(x => x.spread)), a: grade(gs.map(x => x.homeAtsM)), n: gs.length };
  }).filter(r => r.n);
  const o3 = baseOpts(); o3.plugins.barLabels = { fmt: v => (v >= 0 ? '+' : '') + num(v) };
  o3.plugins.tooltip.callbacks = { label: i => `${i.dataset.label}: ${i.raw >= 0 ? '+' : ''}${num(i.raw)} pts`, footer: i => { const r = ss[i[0].dataIndex]; return `Home cover %: ${pct(r.a.pct)} (${r.a.rec}) · n = ${r.n}`; } };
  draw('cHfa', { type: 'bar', data: { labels: ss.map(r => r.s), datasets: [
    { label: 'Avg home margin', data: ss.map(r => r.m), backgroundColor: s1, ...BAR },
    { label: 'Avg home spread', data: ss.map(r => r.line), backgroundColor: s2, ...BAR }] }, options: o3 });

  // detail: teams
  const rows = teamRows(baseGames(), teamRole);
  const zoom = rows.length && rows.every(r => r.pct >= .3 && r.pct <= .7);
  $('#teamChartSub').textContent = `Sorted high to low · dashed line = 50% · axis ${zoom ? '30–70%' : '0–100%'}${F.div ? ' · ' + F.div : ''}${F.team ? ' · ' + F.team + ' highlighted' : ''}`;
  $('#cTeams').parentElement.style.height = Math.max(220, rows.length * 19 + 50) + 'px';
  const ot = baseOpts({ horiz: true, xPct: true, yMin: zoom ? .3 : 0, yMax: zoom ? .7 : 1 });
  ot.interaction = { mode: 'nearest', axis: 'y', intersect: false };
  ot.plugins.refLine = { value: .5 }; ot.plugins.barLabels = { fmt: v => pct(v, 0) };
  ot.plugins.tooltip.callbacks = {
    title: i => `${rows[i[0].dataIndex].team} – ${RAW.teamNames[rows[i[0].dataIndex].team]}`,
    label: i => { const r = rows[i.dataIndex]; return [`Cover %: ${pct(r.pct)}`, `Record (W-L-P): ${r.rec}`, `Avg margin vs. spread: ${r.atsM >= 0 ? '+' : ''}${num(r.atsM)} pts`, `Gap from 50%: ${chanceTxt(zProp(r))}`]; } };
  draw('cTeams', { type: 'bar', data: { labels: rows.map(r => r.team), datasets: [{ data: rows.map(r => r.pct), ...BAR, maxBarThickness: 22, categoryPercentage: .86,
    backgroundColor: rows.map(r => r.team === F.team ? s2 : r.pct > .5 ? s1 : nu) }] }, options: ot });
  table('#teamTable', [
    { k: 'team', h: 'Team', f: r => `<b title="${RAW.teamNames[r.team]}">${r.team}</b>` },
    { k: 'div', h: 'Division' },
    { k: 'pct', h: 'Cover %', num: 1, tip: 'cover', f: r => pct(r.pct) },
    { k: 'rec', h: 'W-L-P', num: 1, tip: 'wlp', sort: r => r.n },
    { k: 'ch', h: 'vs. 50%', tip: 'chance', sort: r => Math.abs(zProp(r)), f: r => chancePill(r) },
    { k: 'favpct', h: 'As fav', num: 1, sort: r => r.fav.pct, f: r => `${pct(r.fav.pct)} <span style="color:var(--muted)">(${r.fav.rec})</span>` },
    { k: 'dogpct', h: 'As dog', num: 1, sort: r => r.dog.pct, f: r => `${pct(r.dog.pct)} <span style="color:var(--muted)">(${r.dog.rec})</span>` },
    { k: 'atsM', h: 'Avg vs. spread', num: 1, tip: 'vsSpread', f: r => (r.atsM >= 0 ? '+' : '') + num(r.atsM) },
  ], rows, { key: 'pct', desc: true, hl: r => r.team === F.team });
  // detail: exact spreads
  table('#exactTable', [
    { k: 'v', h: 'Favorite spread', f: r => `<b>${r.line}</b>` },
    { k: 'n', h: 'Games', num: 1 },
    { k: 'cov', h: 'Favorite cover %', num: 1, tip: 'cover', sort: r => r.gr.pct, f: r => pct(r.gr.pct) },
    { k: 'rec', h: 'W-L-P', num: 1, sort: r => r.gr.w, f: r => r.gr.rec },
    { k: 'win', h: 'Favorite win %', num: 1, f: r => pct(r.win) },
    { k: 'atsM', h: 'Avg vs. spread', num: 1, f: r => (r.atsM >= 0 ? '+' : '') + num(r.atsM) },
    { k: 'tag', h: '', sort: r => r.gr.pct, f: r => tag(r.gr) },
  ], exactRows(g), { key: 'v', desc: false, page: 12 });
}

/* ---------- Totals ---------- */
const ROOF = { dome: 'Dome', closed: 'Retractable (closed)', open: 'Retractable (open)', outdoors: 'Outdoors' };
function renderTotals(g) {
  fillQuestions('totals', g);
  const s1 = cssVar('--s1'), s2 = cssVar('--s2'), nu = cssVar('--neutral');
  const ou = grade(g.map(x => x.ouM)), tl = g.filter(x => x.total != null);
  $('#totKpis').innerHTML = [
    kpi('Points per game' + tip('ppg'), num(mean(g.map(x => x.pts))), 'Both teams combined'),
    kpi('Avg closing total' + tip('total'), num(mean(tl.map(x => x.total))), 'Over/under line'),
    kpi('Points vs. total' + tip('vsTotal'), (mean(tl.map(x => x.ouM)) >= 0 ? '+' : '') + num(mean(tl.map(x => x.ouM))) + ' pts', 'Avg scored minus line'),
    kpi('Over %' + tip('over'), pct(ou.pct), `${ou.rec} (O-U-Push)`),
    kpi('Under %' + tip('under'), pct(1 - ou.pct), 'Break-even is 52.4%'),
  ].join('');
  const ss = SEASONS.filter(s => s >= F.from && s <= F.to).map(s => {
    const gs = g.filter(x => x.season === s);
    return { s, v: mean(gs.map(x => x.pts)), line: mean(gs.filter(x => x.total != null).map(x => x.total)), ou: grade(gs.map(x => x.ouM)), n: gs.length };
  }).filter(r => r.n);
  const o = baseOpts();
  o.plugins.tooltip.callbacks = { label: i => `${i.dataset.label}: ${num(i.raw)}`, footer: i => { const r = ss[i[0].dataIndex]; return `Over %: ${pct(r.ou.pct)} (${r.ou.rec}) · n = ${r.n}`; } };
  draw('cTrend', { type: 'line', data: { labels: ss.map(r => r.s), datasets: [
    { label: 'Points scored', data: ss.map(r => r.v), borderColor: s1, backgroundColor: s1, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: .25 },
    { label: 'Avg closing total', data: ss.map(r => r.line), borderColor: s2, backgroundColor: s2, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: .25, borderDash: [5, 4] }] }, options: o });
  $('#trendNote').textContent = ss.length > 1 ? 'Where the blue line sits above the orange one, games outscored the line that season. Hover a season for its over %.' : 'Pick more than one season to see a trend.';

  const side = (label, gs, color) => {
    const r = grade(gs.map(x => x.ouM));
    return `<div class="side"><h4><i style="width:10px;height:10px;border-radius:3px;background:${color};display:inline-block"></i>${label}</h4>
      <div class="row"><span>Games</span><b>${gs.length.toLocaleString()}</b></div>
      <div class="row"><span>Avg points scored</span><b>${num(mean(gs.map(x => x.pts)))}</b></div>
      <div class="row"><span>Avg closing total</span><b>${num(mean(gs.filter(x => x.total != null).map(x => x.total)))}</b></div>
      <div class="row"><span>Over %</span><b>${pct(r.pct)}</b></div>
      <div class="row"><span>O-U-Push</span><b>${r.rec}</b></div></div>`;
  };
  $('#vsTiles').innerHTML = side('Indoor', g.filter(x => x.roof && x.indoor), s1) + side('Outdoor', g.filter(x => x.roof && !x.indoor), s2);
  const rf = Object.keys(ROOF).map(k => { const gs = g.filter(x => x.roof === k); return { l: ROOF[k], n: gs.length, v: mean(gs.map(x => x.pts)), line: mean(gs.filter(x => x.total != null).map(x => x.total)), ou: grade(gs.map(x => x.ouM)) }; }).filter(r => r.n);
  const o2 = baseOpts({ horiz: true, yMin: 30 }); o2.plugins.barLabels = { fmt: v => num(v) };
  o2.interaction = { mode: 'index', axis: 'y', intersect: false };
  o2.plugins.tooltip.callbacks = { label: i => `${i.dataset.label}: ${num(i.raw)}`, footer: i => { const r = rf[i[0].dataIndex]; return `Over %: ${pct(r.ou.pct)} (${r.ou.rec}) · n = ${r.n}`; } };
  draw('cRoof', { type: 'bar', data: { labels: rf.map(r => r.l), datasets: [
    { label: 'Avg points scored', data: rf.map(r => r.v), backgroundColor: s1, ...BAR, maxBarThickness: 16 },
    { label: 'Avg closing total', data: rf.map(r => r.line), backgroundColor: s2, ...BAR, maxBarThickness: 16 }] }, options: o2 });

  const tb = totalRows(g);
  const o5 = baseOpts({ yPct: true, yMin: 0, yMax: .8 }); o5.plugins.refLine = { value: .5 }; o5.plugins.barLabels = { fmt: v => pct(v, 0) };
  o5.plugins.tooltip.callbacks = { title: i => `Closing total ${tb[i[0].dataIndex].l}`, label: i => { const r = tb[i.dataIndex]; return [`Over %: ${pct(r.gr.pct)} (${r.gr.rec})`, `Avg scored ${num(r.pts)} vs. line ${num(r.line)}`]; }, footer: i => `n = ${tb[i[0].dataIndex].n} games · gap from 50%: ${chanceTxt(zProp(tb[i[0].dataIndex].gr))}` };
  draw('cTot', { type: 'bar', data: { labels: tb.map(r => [r.l, `n=${r.n}`]), datasets: [{ data: tb.map(r => r.gr.pct), backgroundColor: tb.map(r => r.gr.pct > .5 ? s1 : nu), ...BAR }] }, options: o5 });

  const min = +$('#stMin').value, q = $('#stSearch').value.trim().toLowerCase();
  table('#stadiumTable', [
    { k: 'stadium', h: 'Stadium', f: r => `<b>${esc(r.stadium)}</b>` },
    { k: 'team', h: 'Home team' },
    { k: 'roof', h: 'Roof', f: r => `<span class="pill ${r.indoor ? '' : 'mute'}">${r.roof}</span>` },
    { k: 'n', h: 'Games', num: 1 },
    { k: 'pts', h: 'Avg pts', num: 1, f: r => num(r.pts) },
    { k: 'line', h: 'Avg total', num: 1, f: r => num(r.line) },
    { k: 'diff', h: 'Pts vs. total', num: 1, tip: 'vsTotal', sort: r => r.pts - r.line, f: r => { const d = r.pts - r.line; return `<span style="color:${d >= 0 ? 'var(--good)' : 'var(--bad)'}">${d >= 0 ? '+' : ''}${num(d)}</span>`; } },
    { k: 'ourec', h: 'O-U-P', num: 1, sort: r => r.ou.n, f: r => r.ou.rec },
    { k: 'oupct', h: 'Over %', num: 1, sort: r => r.ou.pct, f: r => pct(r.ou.pct) },
  ], stadiumRows(g).filter(r => r.n >= min && (!q || r.stadium.toLowerCase().includes(q) || r.team.toLowerCase().includes(q))), { key: 'diff', desc: true, page: 12 });
  table('#teamPtsTable', [
    { k: 'team', h: 'Team', f: r => `<b title="${RAW.teamNames[r.team]}">${r.team}</b>` },
    { k: 'div', h: 'Division' },
    { k: 'n', h: 'Games', num: 1 },
    { k: 'comb', h: 'Pts per game (both teams)', num: 1, f: r => num(r.comb) },
    { k: 'pf', h: 'Scored', num: 1, f: r => num(r.pf) },
    { k: 'pa', h: 'Allowed', num: 1, f: r => num(r.pa) },
    { k: 'line', h: 'Avg total', num: 1, f: r => num(r.line) },
    { k: 'oupct', h: 'Over %', num: 1, sort: r => r.ou.pct, f: r => `${pct(r.ou.pct)} <span style="color:var(--muted)">(${r.ou.rec})</span>` },
  ], teamPtsRows(baseGames()), { key: 'comb', desc: true, page: 16, hl: r => r.team === F.team });
}

/* ---------- Margins ---------- */
function renderMargins(g) {
  fillQuestions('margins', g);
  const s1 = cssVar('--s1'), s2 = cssVar('--s2');
  const mg = g.map(x => x.margin), share = f => g.length ? g.filter(f).length / g.length : NaN;
  $('#marKpis').innerHTML = [
    kpi('Avg margin' + tip('margin'), num(mean(mg)) + ' pts', 'Winner minus loser'),
    kpi('Median margin' + tip('median'), num(median(mg), 0) + ' pts', 'Half of games are closer'),
    kpi('One-score games' + tip('onescore'), pct(share(x => x.margin <= 7)), 'Decided by 7 or fewer'),
    kpi('Blowouts' + tip('blowout'), pct(share(x => x.margin >= 17)), 'Decided by 17 or more'),
    kpi('Decided by exactly 3 or 7' + tip('key'), pct(share(x => x.margin === 3 || x.margin === 7)), 'The two key numbers'),
  ].join('');
  const CAP = 28, hist = Array.from({ length: CAP + 1 }, (_, i) => g.filter(x => i < CAP ? x.margin === i : x.margin >= CAP).length);
  const oh = baseOpts({ yPct: true, yMin: 0 });
  oh.scales.x.title = { display: true, text: 'Final margin (points)', color: cssVar('--muted') };
  oh.plugins.tooltip.callbacks = { title: i => i[0].dataIndex === CAP ? `Decided by ${CAP} or more` : i[0].dataIndex === 0 ? 'Tie' : `Decided by ${i[0].dataIndex}`, label: i => `${pct(i.raw)} of games (${hist[i.dataIndex]})` };
  draw('cHist', { type: 'bar', data: { labels: hist.map((_, i) => i === CAP ? CAP + '+' : i), datasets: [{ data: hist.map(n => g.length ? n / g.length : 0), backgroundColor: hist.map((_, i) => i === 3 || i === 7 ? s2 : s1), ...BAR, borderRadius: 2, categoryPercentage: .9 }] }, options: oh });

  const ctx = typeRows(g);
  const o = baseOpts({ yMin: 0 }); o.plugins.barLabels = { fmt: v => num(v) };
  o.plugins.tooltip.callbacks = { title: i => ctx[i[0].dataIndex].l, label: i => { const r = ctx[i.dataIndex]; return [`Avg margin: ${num(r.m)} pts`, `One-score games: ${pct(r.close)}`, `Blowouts: ${pct(r.blow)}`]; }, footer: i => `n = ${ctx[i[0].dataIndex].n} games` };
  const short = { 'Non-divisional': 'Non-div.', 'Regular season': 'Regular' };
  draw('cCtx', { type: 'bar', data: { labels: ctx.map(r => [short[r.l] || r.l, `n=${r.n}`]), datasets: [{ data: ctx.map(r => r.m), backgroundColor: ctx.map(r => r.c), ...BAR }] }, options: o });

  const reg = g.filter(x => !x.post), po = g.filter(x => x.post);
  const ph = [['Early season', 'Weeks 1–6', reg.filter(x => x.week <= 6)], ['Mid season', 'Weeks 7–12', reg.filter(x => x.week >= 7 && x.week <= 12)], ['Late season', 'Weeks 13–18', reg.filter(x => x.week >= 13)], ['Playoffs', 'All rounds', po]];
  $('#phaseKpis').innerHTML = ph.map(([l, s, gs]) => kpi(l, gs.length ? num(mean(gs.map(x => x.margin))) + ' pts' : '–', `${s} · n=${gs.length}`)).join('');
  const pts = [];
  for (let w = 1; w <= 18; w++) { const gs = reg.filter(x => x.week === w); if (gs.length) pts.push({ l: `${w}`, gs }); }
  ['WC', 'DIV', 'CON', 'SB'].forEach(t => { const gs = po.filter(x => x.type === t); if (gs.length) pts.push({ l: ROUND_S[t], full: ROUND[t], gs, post: true }); });
  const wk = pts.map(p => ({ ...p, m: mean(p.gs.map(x => x.margin)), close: p.gs.filter(x => x.margin <= 7).length / p.gs.length, n: p.gs.length }));
  const allAvg = mean(reg.map(x => x.margin));
  const o3 = baseOpts({ yMin: 0 }); o3.plugins.refLine = { value: allAvg };
  o3.scales.x.title = { display: true, text: 'Regular-season week, then playoff round', color: cssVar('--muted') };
  o3.plugins.tooltip.callbacks = { title: i => { const p = wk[i[0].dataIndex]; return p.post ? p.full + ' round' : 'Week ' + p.l; }, label: i => `Avg margin: ${num(wk[i.dataIndex].m)} pts`, afterLabel: i => `One-score games: ${pct(wk[i.dataIndex].close)}`, footer: i => `n = ${wk[i[0].dataIndex].n} games · dashed line = regular-season avg ${num(allAvg)}` };
  draw('cWeek', { type: 'line', data: { labels: wk.map(p => p.l), datasets: [{ data: wk.map(p => p.m), borderColor: s1, borderWidth: 2, tension: .25,
    pointRadius: wk.map(p => p.post ? 6 : 4), pointHoverRadius: 7, pointBackgroundColor: wk.map(p => p.post ? s2 : s1), pointBorderColor: cssVar('--surface'), pointBorderWidth: 2,
    segment: { borderDash: c => wk[c.p1DataIndex] && wk[c.p1DataIndex].post ? [4, 4] : undefined } }] }, options: o3 });

  table('#typeTable', [
    { k: 'l', h: 'Game type', f: r => `<b>${r.l}</b>` },
    { k: 'n', h: 'Games', num: 1 },
    { k: 'm', h: 'Avg margin', num: 1, f: r => num(r.m) },
    { k: 'med', h: 'Median', num: 1, f: r => num(r.med, 0) },
    { k: 'close', h: 'One-score %', num: 1, tip: 'onescore', f: r => pct(r.close) },
    { k: 'blow', h: 'Blowout %', num: 1, tip: 'blowout', f: r => pct(r.blow) },
    { k: 'favWin', h: 'Favorite win %', num: 1, f: r => pct(r.favWin) },
  ], ctx, { key: 'n', desc: true });
  const d = r => r.late - r.early;
  table('#phaseTable', [
    { k: 'season', h: 'Season', f: r => `<b>${r.season}</b>` },
    { k: 'n', h: 'Games', num: 1 },
    { k: 'early', h: 'Early', num: 1, f: r => num(r.early) },
    { k: 'mid', h: 'Mid', num: 1, f: r => num(r.mid) },
    { k: 'late', h: 'Late', num: 1, f: r => num(r.late) },
    { k: 'post', h: 'Playoffs', num: 1, f: r => num(r.post) },
    { k: 'd', h: 'Late minus early', num: 1, sort: d, f: r => isNaN(d(r)) ? '–' : (d(r) >= 0 ? '+' : '−') + num(Math.abs(d(r))) },
  ], phaseRows(g), { key: 'season', desc: false });
}

/* Matchup research */
function tag(gr) {
  if (!gr.n) return '<span class="pill mute">no games</span>';
  const t = gr.pct > BE ? '<span class="pill good">above break-even</span>' : gr.pct < 1 - BE ? '<span class="pill bad">below 47.6%</span>' : '<span class="pill mute">coin flip</span>';
  return t + ' ' + chancePill(gr);
}
const stat = (k, gr) => `<div class="stat"><span class="k">${k}</span><b>${pct(gr.pct)}</b><span class="r">${gr.rec}</span>${tag(gr)}</div>`;
const plain = (k, v, r = '') => `<div class="stat"><span class="k">${k}</span><b>${v}</b><span class="r">${r}</span></div>`;
function renderResearch() {
  const gs = baseGames(), away = $('#rsAway').value, home = $('#rsHome').value;
  const sp = parseFloat($('#rsSpread').value), tot = parseFloat($('#rsTotal').value);
  const hasSp = !isNaN(sp), hasTot = !isNaN(tot), L = Math.abs(sp);
  const favT = !hasSp || sp === 0 ? null : sp < 0 ? home : away, dogT = favT === home ? away : favT ? home : null;
  $('#rsLine').innerHTML = away === home ? 'Pick two different teams.' : `<b>${away} @ ${home}</b>` + (hasSp ? ` · ${favT ? favT + ' −' + L : "pick'em"}` : '') + (hasTot ? ` · O/U ${tot}` : '');
  const nm = t => `${t} ${RAW.teamNames[t].split(' ').pop()}`;

  // --- similar lines across the league ---
  let left = '<div class="card"><h3>Spread</h3><p class="sub">Enter a spread to see similar games.</p></div>';
  if (hasSp) {
    const sim = gs.filter(x => x.fav && Math.abs(Math.abs(x.spread) - L) <= 1);
    const same = sim.filter(x => !x.neutral && (favT ? x.fav === (favT === home ? 1 : -1) : true));
    const exact = gs.filter(x => x.fav && Math.abs(x.spread) === L);
    const where = favT === home ? 'Home' : 'Road';
    left = `<div class="card"><h3>Spread: favorites laying ${Math.max(0, L - 1)} to ${L + 1} points</h3><p class="sub">All teams, league-wide. How often did the favorite cover?</p>
      ${stat('All favorites in this range', grade(sim.map(x => x.favAtsM)))}
      ${favT ? stat(`${where} favorites in this range (like ${favT})`, grade(same.map(x => x.favAtsM))) : ''}
      ${stat(`Favorites laying exactly ${L}`, grade(exact.map(x => x.favAtsM)))}
      ${plain('Favorite won the game outright', pct(sim.filter(x => x.favWon === 1).length / sim.length), `${sim.length} games`)}
      ${plain('Avg favorite margin vs. the spread', sim.length ? ((mean(sim.map(x => x.favAtsM)) >= 0 ? '+' : '') + num(mean(sim.map(x => x.favAtsM))) + ' pts') : '–')}
      <p class="note">Underdog cover % is 100% minus the favorite's rate.</p></div>`;
  }
  let right = '<div class="card"><h3>Total</h3><p class="sub">Enter a total to see similar games.</p></div>';
  if (hasTot) {
    const sim = gs.filter(x => x.total != null && Math.abs(x.total - tot) <= 2);
    const hg = gs.filter(x => x.home === home && !x.neutral && x.roof);
    const indoor = hg.length ? hg.filter(x => x.indoor).length > hg.length / 2 : null;
    const ven = indoor == null ? [] : sim.filter(x => x.roof && x.indoor === indoor);
    const div = DIV_OF[home] === DIV_OF[away];
    right = `<div class="card"><h3>Total: games lined ${tot - 2} to ${tot + 2}</h3><p class="sub">All teams, league-wide. How often did the game go over?</p>
      ${stat('All games in this range: over %', grade(sim.map(x => x.ouM)))}
      ${indoor == null ? '' : stat(`${indoor ? 'Indoor' : 'Outdoor'} games in this range (like ${home}'s stadium)`, grade(ven.map(x => x.ouM)))}
      ${stat(`${div ? 'Divisional' : 'Non-divisional'} games in this range`, grade(sim.filter(x => !!x.div === div).map(x => x.ouM)))}
      ${plain('Avg actual points in these games', num(mean(sim.map(x => x.pts))), `${sim.length} games`)}
      ${plain('Avg points vs. the total', sim.length ? ((mean(sim.map(x => x.ouM)) >= 0 ? '+' : '') + num(mean(sim.map(x => x.ouM))) + ' pts') : '–')}
      <p class="note">Under % is 100% minus the over rate.</p></div>`;
  }
  $('#rsMarket').innerHTML = left + right;

  // --- team cards ---
  const card = (t, isHome) => {
    const mine = gs.filter(x => x.home === t || x.away === t).sort((a, b) => a.date < b.date ? 1 : -1);
    const tm = x => x.homeAtsM == null ? null : (x.home === t ? x.homeAtsM : -x.homeAtsM);
    const spot = mine.filter(x => !x.neutral && (isHome ? x.home === t : x.away === t));
    const role = t === favT ? 'favorite' : t === dogT ? 'underdog' : null;
    const inRole = role ? mine.filter(x => (role === 'favorite' ? x.favTeam : x.dogTeam) === t) : [];
    const both = role ? inRole.filter(x => !x.neutral && (isHome ? x.home === t : x.away === t)) : [];
    const pf = mean(mine.map(x => x.home === t ? x.hs : x.as)), pa = mean(mine.map(x => x.home === t ? x.as : x.hs));
    const su = mine.filter(x => (x.home === t ? x.result : -x.result) > 0).length;
    return `<div class="card"><h3>${RAW.teamNames[t]} <span style="color:var(--muted);font-weight:500">· ${isHome ? 'home' : 'away'}${role ? ' ' + role : ''}</span></h3>
      <p class="sub">${mine.length} games in the selected seasons · ${su}-${mine.length - su} straight up · scores ${num(pf)}, allows ${num(pa)} per game</p>
      ${stat('Against the spread, all games', grade(mine.map(tm)))}
      ${stat(`ATS ${isHome ? 'at home' : 'on the road'}`, grade(spot.map(tm)))}
      ${role ? stat(`ATS as a${role === 'underdog' ? 'n' : ''} ${role}`, grade(inRole.map(tm))) : ''}
      ${role ? stat(`ATS as a ${isHome ? 'home' : 'road'} ${role}`, grade(both.map(tm))) : ''}
      ${stat('Their games going over', grade(mine.map(x => x.ouM)))}
      ${stat(`Over ${isHome ? 'at home' : 'on the road'}`, grade(spot.map(x => x.ouM)))}</div>`;
  };
  $('#rsTeams').innerHTML = away === home ? '<div class="empty">Pick two different teams.</div>' : card(away, false) + card(home, true);

  // --- head to head ---
  const h2h = gs.filter(x => (x.home === home && x.away === away) || (x.home === away && x.away === home));
  $('#rsH2hTitle').textContent = `Head to head: ${nm(away)} vs. ${nm(home)}`;
  if (away !== home && h2h.length) {
    const aw = h2h.filter(x => (x.home === away ? x.result : -x.result) > 0).length;
    const aa = grade(h2h.map(x => x.homeAtsM == null ? null : x.home === away ? x.homeAtsM : -x.homeAtsM)), ou = grade(h2h.map(x => x.ouM));
    $('#rsH2hSub').innerHTML = `${h2h.length} meeting${h2h.length > 1 ? 's' : ''} · ${away} won ${aw}, ${home} won ${h2h.length - aw - h2h.filter(x => x.result === 0).length} · ${away} ATS ${aa.rec} · Over-Under ${ou.w}-${ou.l}-${ou.p} · avg ${num(mean(h2h.map(x => x.pts)))} points`;
  } else $('#rsH2hSub').textContent = 'No meetings in the selected seasons.';
  table('#rsH2h', [
    { k: 'date', h: 'Date' },
    { k: 'match', h: 'Matchup', sort: r => r.home, f: r => `${r.away} @ <b>${r.home}</b>` },
    { k: 'score', h: 'Score', sort: r => r.pts, f: r => `${r.as}–${r.hs}${r.ot ? ' OT' : ''}` },
    { k: 'spread', h: 'Spread', sort: r => Math.abs(r.spread ?? 0), f: r => r.spread == null ? '–' : r.spread === 0 ? 'PK' : `${r.favTeam} −${Math.abs(r.spread)}` },
    { k: 'atsWinner', h: 'Covered', f: r => r.atsWinner === 'PUSH' ? '<span class="pill mute">Push</span>' : r.atsWinner ? `<span class="pill">${r.atsWinner}</span>` : '–' },
    { k: 'total', h: 'Total', num: 1, f: r => r.total ?? '–' },
    { k: 'pts', h: 'Pts', num: 1 },
    { k: 'ou', h: 'O/U', f: r => r.ou ? `<span class="pill ${r.ou === 'Over' ? 'good' : r.ou === 'Under' ? 'bad' : 'mute'}">${r.ou}</span>` : '–' },
  ], away === home ? [] : h2h, { key: 'date', desc: true, page: 10 });
}

/* Compare two teams or two periods */
function cmSide(k) {
  const team = $('#cmTeam' + k).value; let from = +$('#cmFrom' + k).value, to = +$('#cmTo' + k).value; if (from > to) [from, to] = [to, from];
  const gs = GAMES.filter(x => x.season >= from && x.season <= to && (F.type === 'all' || (F.type === 'REG' ? !x.post : x.post)) && (!team || x.home === team || x.away === team));
  const tm = x => x.homeAtsM == null ? null : (x.home === team ? x.homeAtsM : -x.homeAtsM);
  const o = { label: `${team || 'All teams'}, ${from === to ? from : from + '–' + to}`, team, n: gs.length, ou: grade(gs.map(x => x.ouM)), pts: gs.map(x => x.pts), mar: gs.map(x => x.margin) };
  if (team) {
    const won = gs.filter(x => (x.home === team ? x.result : -x.result) > 0).length;
    Object.assign(o, { win: { w: won, l: gs.length - won }, ats: grade(gs.map(tm)), fav: grade(gs.filter(x => x.favTeam === team).map(tm)), dog: grade(gs.filter(x => x.dogTeam === team).map(tm)),
      pf: gs.map(x => x.home === team ? x.hs : x.as), pa: gs.map(x => x.home === team ? x.as : x.hs) });
  } else o.ats = grade(gs.map(x => x.favAtsM));
  return o;
}
function renderCompare() {
  const a = cmSide('A'), b = cmSide('B');
  const rate = (label, key, tipK) => {
    const x = a[key], y = b[key], px = x ? (key === 'win' ? x.w / (x.w + x.l) : x.pct) : NaN, py = y ? (key === 'win' ? y.w / (y.w + y.l) : y.pct) : NaN;
    const rec = v => v ? (key === 'win' ? `${v.w}-${v.l}` : v.rec) : '';
    const d = +(px * 100).toFixed(1) - +(py * 100).toFixed(1);
    return { label, tipK, a: x ? `${pct(px)} <span style="color:var(--muted)">(${rec(x)})</span>` : '–', b: y ? `${pct(py)} <span style="color:var(--muted)">(${rec(y)})</span>` : '–',
      d: isNaN(d) ? '–' : (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1) + ' pts', c: isNaN(d) ? '' : real(zTwoProp(x, y)) ? '<span class="pill">more than chance</span>' : '<span class="pill mute">could be chance</span>' };
  };
  const avg = (label, key, tipK) => {
    const x = a[key], y = b[key], d = x && y ? mean(x) - mean(y) : NaN;
    return { label, tipK, a: x ? num(mean(x)) : '–', b: y ? num(mean(y)) : '–', d: isNaN(d) ? '–' : (d >= 0 ? '+' : '−') + num(Math.abs(d)), c: isNaN(d) ? '' : real(zMeans(x, y)) ? '<span class="pill">more than chance</span>' : '<span class="pill mute">could be chance</span>' };
  };
  const rows = [
    { label: 'Games', a: a.n.toLocaleString(), b: b.n.toLocaleString(), d: '', c: '' },
    rate('Win %', 'win'), rate('Cover %' + (!a.team || !b.team ? ' *' : ''), 'ats', 'cover'), rate('Cover % as favorite', 'fav', 'cover'), rate('Cover % as underdog', 'dog', 'cover'),
    rate('Over %', 'ou', 'over'), avg('Points per game (both teams)', 'pts', 'ppg'), avg('Points scored', 'pf'), avg('Points allowed', 'pa'), avg('Avg margin of victory', 'mar', 'margin'),
  ];
  $('#cmTable').innerHTML = `<table><thead><tr><th style="cursor:default">Metric</th><th class="num" style="cursor:default">A: ${a.label}</th><th class="num" style="cursor:default">B: ${b.label}</th><th class="num" style="cursor:default">A minus B</th><th style="cursor:default" title="${TIPS.chance}">Difference <span class="tip">?</span></th></tr></thead><tbody>` +
    rows.filter(r => r.a !== '–' || r.b !== '–').map(r => `<tr><td><b>${r.label}</b>${r.tipK ? ` <span class="tip" title="${TIPS[r.tipK]}">?</span>` : ''}</td><td class="num">${r.a}</td><td class="num">${r.b}</td><td class="num">${r.d}</td><td>${r.c}</td></tr>`).join('') + '</tbody></table>';
  $('#cmNote').textContent = (!a.team || !b.team ? '* For "All teams", cover % is the favorite\u2019s cover rate; win %, favorite/underdog splits and points scored/allowed apply to single teams only. ' : '') +
    '"Could be chance" means a gap this size often appears by luck with this many games. Games involving both teams count on both sides.';
}

/* Game log */
let logRows = [], rsMode = 'matchup';
function renderLog(g) {
  const q = $('#lgSearch').value.trim().toLowerCase(), ats = $('#lgAts').value, ou = $('#lgOu').value, venue = $('#lgVenue').value, c = $('#lgCtx').value;
  logRows = g.filter(x => {
    if (q && ![x.home, x.away, x.stadium, RAW.teamNames[x.home], RAW.teamNames[x.away]].some(s => s && s.toLowerCase().includes(q))) return false;
    if (ats === 'fav' && !(x.favAtsM > 0)) return false;
    if (ats === 'dog' && !(x.favAtsM < 0)) return false;
    if (ats === 'push' && x.homeAtsM !== 0) return false;
    if (ats === 'home' && !(x.homeAtsM > 0)) return false;
    if (ats === 'away' && !(x.homeAtsM < 0)) return false;
    if (ou && x.ou !== ou) return false;
    if (venue === 'in' && !(x.roof && x.indoor)) return false;
    if (venue === 'out' && !(x.roof && !x.indoor)) return false;
    if (c === 'div' && !x.div) return false;
    if (c === 'nondiv' && x.div) return false;
    if (c === 'prime' && !x.prime) return false;
    if (c === 'post' && !x.post) return false;
    return true;
  });
  const line = x => x.spread == null ? '–' : x.spread === 0 ? `PK (${x.favTeam || '–'})` : `${x.favTeam} −${Math.abs(x.spread)}`;
  table('#logTable', [
    { k: 'date', h: 'Date' },
    { k: 'wk', h: 'Wk', sort: r => r.season * 100 + (r.post ? 30 : r.week), f: r => r.post ? ROUND[r.type] : r.week },
    { k: 'match', h: 'Matchup', sort: r => r.away + r.home, f: r => `${r.away} @ <b>${r.home}</b>${r.neutral ? ' <span class="pill mute">Neutral</span>' : ''}` },
    { k: 'score', h: 'Score', sort: r => r.pts, f: r => `${r.as}–${r.hs}${r.ot ? ' OT' : ''}` },
    { k: 'spread', h: 'Spread', sort: r => Math.abs(r.spread ?? 0), f: line },
    { k: 'atsWinner', h: 'Covered', f: r => r.atsWinner === 'PUSH' ? '<span class="pill mute">Push</span>' : r.atsWinner ? `<span class="pill ${r.atsWinner === r.favTeam ? 'good' : 'bad'}">${r.atsWinner}${r.atsWinner === r.favTeam ? ' (fav)' : ' (dog)'}</span>` : '–' },
    { k: 'total', h: 'Total', num: 1, f: r => r.total ?? '–' },
    { k: 'pts', h: 'Pts', num: 1 },
    { k: 'ou', h: 'O/U', f: r => r.ou ? `<span class="pill ${r.ou === 'Over' ? 'good' : r.ou === 'Under' ? 'bad' : 'mute'}">${r.ou}</span>` : '–' },
    { k: 'margin', h: 'Margin', num: 1 },
    { k: 'tags', h: 'Tags', sort: r => (r.div ? 2 : 0) + (r.prime ? 1 : 0), f: r => [r.div ? 'Div' : '', r.prime ? 'Prime' : '', r.indoor ? 'Indoor' : ''].filter(Boolean).join(' · ') },
    { k: 'stadium', h: 'Stadium', f: r => esc(r.stadium) },
  ], logRows, { key: 'date', desc: true, page: 25 });
}
function downloadCsv() {
  const head = ['date', 'season', 'week', 'game_type', 'away', 'home', 'away_score', 'home_score', 'favorite', 'spread_fav', 'ats_cover', 'total_line', 'total_pts', 'ou_result', 'margin', 'divisional', 'prime_time', 'roof', 'stadium'];
  const rows = logRows.map(x => [x.date, x.season, x.week, x.type, x.away, x.home, x.as, x.hs, x.favTeam || '', x.spread == null ? '' : Math.abs(x.spread), x.atsWinner, x.total ?? '', x.pts, x.ou, x.margin, x.div ? 1 : 0, x.prime ? 1 : 0, x.roof, x.stadium]);
  const csv = [head, ...rows].map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'nfl_games_filtered.csv'; a.click();
}

/* ---------- Sortable, paginated table ---------- */
const tableState = {};
function table(sel, cols, rows, opt) {
  const st = tableState[sel] ||= { key: opt.key, desc: opt.desc, page: 0 };
  if (st.sig !== rows.length + '|' + sel) { st.page = 0; st.sig = rows.length + '|' + sel; }
  const col = cols.find(c => c.k === st.key) || cols[0];
  const val = r => col.sort ? col.sort(r) : r[col.k];
  const sorted = rows.slice().sort((a, b) => { const x = val(a), y = val(b); const c = (x > y) - (x < y) || (isNaN(x) - isNaN(y)); return st.desc ? -c : c; });
  const per = opt.page || sorted.length, pages = Math.max(1, Math.ceil(sorted.length / per));
  st.page = Math.min(st.page, pages - 1);
  const shown = sorted.slice(st.page * per, st.page * per + per);
  const el = $(sel);
  if (!rows.length) { el.innerHTML = '<div class="empty">No rows match these filters.</div>'; return; }
  el.innerHTML = `<table><thead><tr>${cols.map(c => `<th data-sort="${c.k}"${c.tip ? ` title="${TIPS[c.tip]}"` : ''} class="${c.num ? 'num ' : ''}${c.k === st.key ? (st.desc ? 'desc' : 'asc') : ''}">${c.h}${c.tip ? ' <span class="tip">?</span>' : ''}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(r => `<tr class="${opt.hl && opt.hl(r) ? 'hl' : ''}">${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.f ? c.f(r) : esc(r[c.k] ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table>` +
    (pages > 1 ? `<div class="pager"><span>${(st.page * per + 1).toLocaleString()}–${Math.min(sorted.length, (st.page + 1) * per).toLocaleString()} of ${sorted.length.toLocaleString()}</span><button data-p="-1" ${st.page ? '' : 'disabled'}>‹ Prev</button><button data-p="1" ${st.page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>` : '');
  el.querySelectorAll('th').forEach(th => th.onclick = () => { const k = th.dataset.sort; if (st.key === k) st.desc = !st.desc; else { st.key = k; st.desc = !cols.find(c => c.k === k).f || cols.find(c => c.k === k).num ? true : false; } st.page = 0; render(); });
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { st.page += +b.dataset.p; render(); });
}

/* ---------- Tabs, theme, boot ---------- */
function setTab(t) {
  tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  try { localStorage.setItem('nfl-edge-tab', t); } catch (e) {}
  render(); window.scrollTo({ top: 0 });
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll('#presets button').forEach(b => b.onclick = () => {
  const n = +b.dataset.n; F.to = SEASONS[SEASONS.length - 1]; F.from = n ? SEASONS[Math.max(0, SEASONS.length - n)] : SEASONS[0];
  $('#fFrom').value = F.from; $('#fTo').value = F.to; render();
});
document.querySelectorAll('details.qa').forEach(d => d.addEventListener('toggle', () => { if (d.open) render(); syncXall(); }));
function syncXall() { document.querySelectorAll('[data-xall]').forEach(b => { const ds = [...b.closest('.page').querySelectorAll('details.qa')]; b.textContent = ds.every(d => d.open) ? 'Close the detail' : 'Open all'; }); }
document.querySelectorAll('[data-xall]').forEach(b => b.onclick = () => {
  const ds = [...b.closest('.page').querySelectorAll('details.qa')], all = ds.every(d => d.open);
  ds.forEach((d, i) => d.open = all ? i < 3 : true); render(); syncXall();
});
document.querySelectorAll('#rsMode button').forEach(b => b.onclick = () => {
  rsMode = b.dataset.v; document.querySelectorAll('#rsMode button').forEach(x => x.setAttribute('aria-pressed', x === b));
  $('#rsPane').hidden = rsMode !== 'matchup'; $('#lgPane').hidden = rsMode !== 'log'; $('#cmPane').hidden = rsMode !== 'compare'; render();
});
document.querySelectorAll('#teamRole button').forEach(b => b.onclick = () => {
  teamRole = b.dataset.v; document.querySelectorAll('#teamRole button').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
});
['#stMin', '#stSearch'].forEach(s => $(s).addEventListener('input', render));
['#lgSearch', '#lgAts', '#lgOu', '#lgVenue', '#lgCtx'].forEach(s => $(s).addEventListener('input', render));
$('#lgCsv').onclick = downloadCsv;
$('#rsAway').innerHTML = TEAMS.map(t => `<option value="${t}"${t === 'KC' ? ' selected' : ''}>${t} – ${RAW.teamNames[t]}</option>`).join('');
$('#rsHome').innerHTML = TEAMS.map(t => `<option value="${t}"${t === 'BUF' ? ' selected' : ''}>${t} – ${RAW.teamNames[t]}</option>`).join('');
['#rsAway', '#rsHome', '#rsSpread', '#rsTotal'].forEach(s => $(s).addEventListener('input', render));
['A', 'B'].forEach((k, i) => {
  $('#cmTeam' + k).innerHTML = '<option value="">All teams</option>' + TEAMS.map(t => `<option value="${t}"${t === ['DET', 'KC'][i] ? ' selected' : ''}>${t} – ${RAW.teamNames[t]}</option>`).join('');
  $('#cmFrom' + k).innerHTML = SEASONS.map(s => `<option${s === SEASONS[0] ? ' selected' : ''}>${s}</option>`).join('');
  $('#cmTo' + k).innerHTML = SEASONS.map(s => `<option${s === SEASONS[SEASONS.length - 1] ? ' selected' : ''}>${s}</option>`).join('');
  ['Team', 'From', 'To'].forEach(f => $('#cm' + f + k).addEventListener('change', render));
});
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('nfl-edge-theme', document.documentElement.dataset.theme); } catch (e) {}
  render();
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
try { const th = localStorage.getItem('nfl-edge-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
Chart.defaults.font.family = 'Inter, -apple-system, Segoe UI, Roboto, sans-serif';
Chart.defaults.font.size = 12;
initFilters();
$('#footer').textContent = `Source: ${RAW.meta.source}. ${GAMES.length.toLocaleString()} completed games, ${SEASONS[0]}–${SEASONS[SEASONS.length - 1]}; ${RAW.meta.unplayedExcluded} unplayed games excluded. Data through ${RAW.meta.lastGame}; updated ${RAW.meta.built}. Historical description only — not betting advice.`;
let start = 'overview'; try { start = localStorage.getItem('nfl-edge-tab') || 'overview'; } catch (e) {}
setTab(document.getElementById('p-' + start) ? start : 'overview');
