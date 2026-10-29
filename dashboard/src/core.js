// NFL EDGE: data preparation, statistics and app state.
// Conventions: spread_line = points the HOME team was favored by (positive = home favored).
// A team's own line is sportsbook style (negative = favored). ATS margin = team margin + own line.
'use strict';

const NE = (window.NE = {});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
NE.raw = JSON.parse(document.getElementById('ne-data').textContent);

NE.buildGames = () => {
  const { cols, rows } = NE.raw;
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const v = (r, c) => (r[ix[c]] === undefined ? null : r[ix[c]]);
  const settle = (m, w, p, l) => (m === null ? null : m > 0 ? w : m < 0 ? l : p);
  const prob = (ml) => (ml === null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const id = v(r, 'game_id');
    const hs = v(r, 'home_score');
    const as = v(r, 'away_score');
    if (hs === null || as === null || seen.has(id)) continue;
    seen.add(id);
    const sl = v(r, 'spread_line');
    const tl = v(r, 'total_line');
    const hml = v(r, 'home_moneyline');
    const aml = v(r, 'away_moneyline');
    const result = hs - as;
    const total = hs + as;
    let fav = null;
    if (sl !== null && sl > 0) fav = 'home';
    else if (sl !== null && sl < 0) fav = 'away';
    else if (sl === 0 && hml !== null && aml !== null && hml !== aml) fav = hml < aml ? 'home' : 'away';
    const home = v(r, 'home_team');
    const away = v(r, 'away_team');
    const favLine = fav ? Math.abs(sl) : null;
    const favMargin = fav ? (fav === 'home' ? result : -result) : null;
    const homeAts = sl === null ? null : result - sl;
    const ou = tl === null ? null : total - tl;
    const hp = prob(hml);
    const ap = prob(aml);
    const hsp = prob(v(r, 'home_spread_odds'));
    const asp = prob(v(r, 'away_spread_odds'));
    const op = prob(v(r, 'over_odds'));
    const up = prob(v(r, 'under_odds'));
    out.push({
      game_id: id,
      season: v(r, 'season'),
      week: v(r, 'week'),
      game_type: v(r, 'game_type'),
      phase: v(r, 'game_type') === 'REG' ? 'REG' : 'POST',
      date: v(r, 'gameday'),
      home_team: home,
      away_team: away,
      home_score: hs,
      away_score: as,
      neutral: v(r, 'location') === 'Neutral',
      overtime: v(r, 'overtime') === 1,
      result,
      total_pts: total,
      abs_margin: Math.abs(result),
      winner: result > 0 ? home : result < 0 ? away : 'TIE',
      spread_line: sl,
      home_spread: sl === null ? null : -sl,
      total_line: tl,
      home_ml: hml,
      away_ml: aml,
      home_spread_odds: v(r, 'home_spread_odds'),
      away_spread_odds: v(r, 'away_spread_odds'),
      over_odds: v(r, 'over_odds'),
      under_odds: v(r, 'under_odds'),
      favorite: fav === 'home' ? home : fav === 'away' ? away : null,
      underdog: fav === 'home' ? away : fav === 'away' ? home : null,
      fav_side: fav,
      fav_line: favLine,
      fav_margin: favMargin,
      fav_su: settle(favMargin, 'W', 'T', 'L'),
      fav_ats_margin: fav ? favMargin - favLine : null,
      fav_ats: fav ? settle(favMargin - favLine, 'Cover', 'Push', 'No Cover') : null,
      home_ats_margin: homeAts,
      home_ats: settle(homeAts, 'Cover', 'Push', 'No Cover'),
      ats_winner: homeAts === null ? null : homeAts > 0 ? home : homeAts < 0 ? away : 'PUSH',
      ou_margin: ou,
      ou_result: settle(ou, 'Over', 'Push', 'Under'),
      home_imp: hp !== null && ap !== null ? hp / (hp + ap) : null,
      away_imp: hp !== null && ap !== null ? ap / (hp + ap) : null,
      ml_hold: hp !== null && ap !== null ? hp + ap - 1 : null,
      spread_hold: hsp !== null && asp !== null ? hsp + asp - 1 : null,
      total_hold: op !== null && up !== null ? op + up - 1 : null,
      spread_bucket: NE.spreadBucket(favLine),
      total_bucket: NE.totalBucket(tl),
      stadium: v(r, 'stadium'),
      home_qb: v(r, 'home_qb_name'),
      away_qb: v(r, 'away_qb_name'),
      home_coach: v(r, 'home_coach'),
      away_coach: v(r, 'away_coach'),
    });
  }
  return out.sort((a, b) => (a.date === b.date ? (a.game_id < b.game_id ? -1 : 1) : a.date < b.date ? -1 : 1));
};

NE.SPREAD_BUCKETS = ['Pick–3', '3.5–6.5', '7–10', '10.5+'];
NE.TOTAL_BUCKETS = ['≤40', '40.5–43.5', '44–46.5', '47–49.5', '50+'];
NE.spreadBucket = (x) => (x === null ? null : x <= 3 ? 'Pick–3' : x <= 6.5 ? '3.5–6.5' : x <= 10 ? '7–10' : '10.5+');
NE.totalBucket = (t) => (t === null ? null : t <= 40 ? '≤40' : t <= 43.5 ? '40.5–43.5' : t <= 46.5 ? '44–46.5' : t <= 49.5 ? '47–49.5' : '50+');

NE.buildTeamGames = (games) => {
  const settle = (m, w, p, l) => (m === null ? null : m > 0 ? w : m < 0 ? l : p);
  const out = [];
  for (const g of games) {
    for (const side of ['home', 'away']) {
      const isHome = side === 'home';
      const team = isHome ? g.home_team : g.away_team;
      const pf = isHome ? g.home_score : g.away_score;
      const pa = isHome ? g.away_score : g.home_score;
      const line = g.spread_line === null ? null : isHome ? -g.spread_line : g.spread_line;
      const margin = pf - pa;
      out.push({
        g,
        game_id: g.game_id,
        season: g.season,
        week: g.week,
        phase: g.phase,
        date: g.date,
        team,
        opponent: isHome ? g.away_team : g.home_team,
        venue: g.neutral ? 'Neutral' : isHome ? 'Home' : 'Away',
        pts_for: pf,
        pts_against: pa,
        margin,
        su: settle(margin, 'W', 'T', 'L'),
        team_line: line,
        role: g.favorite === team ? 'Favorite' : g.underdog === team ? 'Underdog' : null,
        ats_margin: line === null ? null : margin + line,
        ats: line === null ? null : settle(margin + line, 'Cover', 'Push', 'No Cover'),
        ou_result: g.ou_result,
        total_line: g.total_line,
        total_pts: g.total_pts,
        ml: isHome ? g.home_ml : g.away_ml,
        imp: isHome ? g.home_imp : g.away_imp,
      });
    }
  }
  return out;
};

NE.games = NE.buildGames();
NE.teamGames = NE.buildTeamGames(NE.games);
NE.seasons = [...new Set(NE.games.map((g) => g.season))].sort((a, b) => a - b);
NE.teams = [...new Set(NE.games.flatMap((g) => [g.home_team, g.away_team]))].sort();
NE.latestSeason = NE.seasons[NE.seasons.length - 1];
NE.latestWeek = d3.max(NE.games.filter((g) => g.season === NE.latestSeason), (g) => g.week);

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
// Wilson score interval: a 95% range for a rate, given k successes in n tries.
NE.wilson = (k, n, z = 1.96) => {
  if (!n) return [null, null];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
};
const count = (arr, f, val) => arr.reduce((s, r) => s + (r[f] === val ? 1 : 0), 0);
NE.count = count;
NE.mean = (arr, f) => {
  let s = 0;
  let k = 0;
  for (const r of arr) {
    const x = typeof f === 'function' ? f(r) : r[f];
    if (x !== null && x !== undefined && !Number.isNaN(x)) { s += x; k += 1; }
  }
  return k ? s / k : null;
};
NE.median = (arr, f) => {
  const xs = arr.map((r) => (typeof f === 'function' ? f(r) : r[f])).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  return xs.length ? d3.quantileSorted(xs, 0.5) : null;
};
// Straight-up record. Win % = wins / games (ties stay in the games).
NE.su = (arr, f = 'su') => {
  const w = count(arr, f, 'W');
  const l = count(arr, f, 'L');
  const t = count(arr, f, 'T');
  const n = w + l + t;
  const [lo, hi] = NE.wilson(w, n);
  return { w, l, t, n, pct: n ? w / n : null, lpct: n ? l / n : null, lo, hi, rec: `${w}-${l}${t ? `-${t}` : ''}`, lrec: `${l}-${w}${t ? `-${t}` : ''}` };
};
// Two-way market with pushes. Rate = wins / (wins + losses); pushes reported apart.
NE.graded = (arr, f, win, loss, push) => {
  const w = count(arr, f, win);
  const l = count(arr, f, loss);
  const p = count(arr, f, push);
  const dec = w + l;
  const [lo, hi] = NE.wilson(w, dec);
  const [llo, lhi] = NE.wilson(l, dec);
  return { w, l, p, dec, n: dec + p, pct: dec ? w / dec : null, lpct: dec ? l / dec : null, lo, hi, llo, lhi, ppct: dec + p ? p / (dec + p) : null, rec: `${w}-${l}-${p}`, lrec: `${l}-${w}-${p}` };
};
NE.ats = (arr, f = 'ats') => NE.graded(arr, f, 'Cover', 'No Cover', 'Push');
NE.ou = (arr, f = 'ou_result') => NE.graded(arr, f, 'Over', 'Under', 'Push');
// Is a rate's 95% range clear of 50%?
NE.clear = (r) => r && r.lo !== null && (r.lo > 0.5 || r.hi < 0.5);
NE.pearson = (xs, ys) => {
  const n = xs.length;
  if (n < 3) return null;
  const mx = d3.mean(xs);
  const my = d3.mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
NE.f = {
  pct: (x) => (x === null || x === undefined ? '—' : d3.format('.1%')(x)),
  pct0: (x) => (x === null || x === undefined ? '—' : d3.format('.0%')(x)),
  n1: (x) => (x === null || x === undefined ? '—' : d3.format('.1f')(x)),
  n2: (x) => (x === null || x === undefined ? '—' : d3.format('.2f')(x)),
  int: (x) => (x === null || x === undefined ? '—' : d3.format(',')(x)),
  s1: (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${d3.format('.1f')(Math.abs(x))}`),
  line: (x) => (x === null || x === undefined ? '—' : x === 0 ? 'PK' : `${x > 0 ? '+' : '−'}${d3.format('~g')(Math.abs(x))}`),
  odds: (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : '−'}${Math.abs(Math.round(x))}`),
  date: (s) => (s ? d3.utcFormat('%b %-d, %Y')(new Date(`${s}T00:00:00Z`)) : '—'),
  pp: (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${d3.format('.1f')(Math.abs(x) * 100)} pts`),
  ci: (r) => (r && r.lo !== null ? `${d3.format('.0%')(r.lo)}–${d3.format('.0%')(r.hi)}` : '—'),
  moe: (r) => (r && r.lo !== null ? `± ${d3.format('.1f')(((r.hi - r.lo) / 2) * 100)} pts` : ''),
};
NE.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// State: filters, tabs and selections. Kept in the URL hash so a view can be bookmarked.
// ---------------------------------------------------------------------------
NE.DEFAULTS = {
  tab: 'story',
  s0: NE.seasons[0],
  s1: NE.latestSeason,
  phase: 'All',
  team: '',
  neutral: true,
  // page-level
  pteam: 'KC',
  pteam2: 'BUF',
  tmode: 'profile',
  bet: 'ats',
  metric: 'avg_total',
  split: 'none',
  heat: 'avg_total',
  funnel: 'cover',
  rank: 'cover',
  persist: 'cover',
  gx_team: '',
  gx_opp: '',
  gx_venue: '',
  gx_role: '',
  gx_ats: '',
  gx_ou: '',
  gx_spread: '',
  gx_total: '',
  gx_season: '',
  gx_week: '',
  gx_q: '',
  gx_sort: 'date',
  gx_dir: 'desc',
  gx_page: 0,
  game: '',
};
NE.S = { ...NE.DEFAULTS };
const GLOBAL_KEYS = ['s0', 's1', 'phase', 'team', 'neutral'];

NE.readHash = () => {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  if (/^[a-z]+$/.test(h)) { NE.S.tab = h; return; }
  try {
    const params = new URLSearchParams(h);
    for (const [k, val] of params) {
      if (!(k in NE.DEFAULTS)) continue;
      const d = NE.DEFAULTS[k];
      NE.S[k] = typeof d === 'number' ? Number(val) : typeof d === 'boolean' ? val === '1' : val;
    }
  } catch (e) { /* ignore a malformed hash */ }
};
NE.writeHash = () => {
  const p = new URLSearchParams();
  for (const k of Object.keys(NE.DEFAULTS)) {
    if (NE.S[k] !== NE.DEFAULTS[k] || k === 'tab') p.set(k, typeof NE.S[k] === 'boolean' ? (NE.S[k] ? '1' : '0') : NE.S[k]);
  }
  try { history.replaceState(null, '', `#${p.toString()}`); } catch (e) { /* sandboxed frames may refuse */ }
};

NE.listeners = [];
NE.set = (patch) => {
  Object.assign(NE.S, patch);
  // Keep the season range valid: moving one end past the other drags it along.
  if (NE.S.s0 > NE.S.s1) { if ('s0' in patch) NE.S.s1 = NE.S.s0; else NE.S.s0 = NE.S.s1; }
  NE.writeHash();
  for (const fn of NE.listeners) fn(patch);
};
NE.resetFilters = () => NE.set(Object.fromEntries(GLOBAL_KEYS.map((k) => [k, NE.DEFAULTS[k]])));
NE.filtersAreDefault = () => GLOBAL_KEYS.every((k) => NE.S[k] === NE.DEFAULTS[k]);

// Filtered data, cached on the global filter values.
let cacheKey = '';
let cache = null;
NE.data = () => {
  const S = NE.S;
  const key = GLOBAL_KEYS.map((k) => S[k]).join('|');
  if (key === cacheKey && cache) return cache;
  const keep = (g) => g.season >= S.s0 && g.season <= S.s1 && (S.phase === 'All' || g.phase === S.phase) && (S.neutral || !g.neutral);
  const games = NE.games.filter((g) => keep(g) && (!S.team || g.home_team === S.team || g.away_team === S.team));
  const scopeGames = NE.games.filter(keep);
  const ids = new Set(games.map((g) => g.game_id));
  const scopeIds = new Set(scopeGames.map((g) => g.game_id));
  cache = {
    games,
    teamGames: NE.teamGames.filter((t) => ids.has(t.game_id)),
    // the same filters without the team filter, for team pages and rankings
    scopeGames,
    scopeTeamGames: NE.teamGames.filter((t) => scopeIds.has(t.game_id)),
  };
  cacheKey = key;
  return cache;
};
// Trend axis: seasons normally, weeks when one season is in view.
NE.trendKey = () => (NE.S.s0 === NE.S.s1 ? 'week' : 'season');

// ---------------------------------------------------------------------------
// Aggregations shared by several views
// ---------------------------------------------------------------------------
NE.groupBy = (arr, key) => d3.groups(arr, typeof key === 'function' ? key : (r) => r[key]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

// League metrics by period, each with the counts needed for a 95% range.
NE.METRICS = {
  avg_total: { label: 'Combined points per game', fmt: 'n1', kind: 'mean', calc: (g) => ({ value: NE.mean(g, 'total_pts'), sd: d3.deviation(g, (r) => r.total_pts), n: g.length }) },
  avg_total_line: { label: 'Closing total', fmt: 'n1', kind: 'mean', calc: (g) => ({ value: NE.mean(g, 'total_line'), sd: d3.deviation(g, (r) => r.total_line), n: g.length }) },
  avg_margin: { label: 'Winning margin', fmt: 'n1', kind: 'mean', calc: (g) => { const d = g.filter((r) => r.result !== 0); return { value: NE.mean(d, 'abs_margin'), sd: d3.deviation(d, (r) => r.abs_margin), n: d.length }; } },
  avg_fav_line: { label: 'Points laid by the favorite', fmt: 'n1', kind: 'mean', calc: (g) => ({ value: NE.mean(g, 'fav_line'), sd: d3.deviation(g, (r) => r.fav_line), n: g.length }) },
  home_win: { label: 'Home win %', fmt: 'pct', kind: 'rate', calc: (g) => { const r = NE.su(g.filter((x) => !x.neutral).map((x) => ({ su: x.result > 0 ? 'W' : x.result < 0 ? 'L' : 'T' }))); return { value: r.pct, lo: r.lo, hi: r.hi, n: r.n }; } },
  fav_win: { label: 'Favorite win %', fmt: 'pct', kind: 'rate', calc: (g) => { const r = NE.su(g, 'fav_su'); return { value: r.pct, lo: r.lo, hi: r.hi, n: r.n }; } },
  fav_cover: { label: 'Favorite cover %', fmt: 'pct', kind: 'rate', calc: (g) => { const r = NE.ats(g, 'fav_ats'); return { value: r.pct, lo: r.lo, hi: r.hi, n: r.dec }; } },
  home_cover: { label: 'Home cover %', fmt: 'pct', kind: 'rate', calc: (g) => { const r = NE.ats(g, 'home_ats'); return { value: r.pct, lo: r.lo, hi: r.hi, n: r.dec }; } },
  over: { label: 'Over %', fmt: 'pct', kind: 'rate', calc: (g) => { const r = NE.ou(g); return { value: r.pct, lo: r.lo, hi: r.hi, n: r.dec }; } },
  spread_mae: { label: 'Spread miss (points)', fmt: 'n1', kind: 'mean', calc: (g) => { const v = g.filter((r) => r.home_ats_margin !== null).map((r) => Math.abs(r.home_ats_margin)); return { value: d3.mean(v) ?? null, sd: d3.deviation(v), n: v.length }; } },
  total_mae: { label: 'Total miss (points)', fmt: 'n1', kind: 'mean', calc: (g) => { const v = g.filter((r) => r.ou_margin !== null).map((r) => Math.abs(r.ou_margin)); return { value: d3.mean(v) ?? null, sd: d3.deviation(v), n: v.length }; } },
  ml_hold: { label: 'Moneyline margin', fmt: 'pct', kind: 'plain', calc: (g) => ({ value: NE.mean(g, 'ml_hold'), n: g.length }) },
};
// Adds a 95% range to a mean: ± 1.96 standard errors.
NE.metricPoint = (key, g) => {
  const m = NE.METRICS[key];
  const r = m.calc(g);
  if (m.kind === 'mean' && r.sd && r.n > 1) { const se = r.sd / Math.sqrt(r.n); r.lo = r.value - 1.96 * se; r.hi = r.value + 1.96 * se; }
  return r;
};
// Splits that make sense for a metric: the same metric for two groups.
NE.SPLITS = {
  none: { label: 'No split', groups: null },
  phase: { label: 'Regular season vs. playoffs', groups: [['Regular season', (g) => g.phase === 'REG'], ['Playoffs', (g) => g.phase === 'POST']] },
  div: { label: 'Big vs. small spreads', groups: [['Spread 7 or more', (g) => g.fav_line !== null && g.fav_line >= 7], ['Spread under 7', (g) => g.fav_line !== null && g.fav_line < 7]] },
  site: { label: 'Neutral vs. home sites', groups: [['Home sites', (g) => !g.neutral], ['Neutral sites', (g) => g.neutral]] },
};

NE.teamSummary = (rows) => {
  const su = NE.su(rows);
  const ats = NE.ats(rows);
  const ou = NE.ou(rows);
  const part = (f) => { const v = rows.filter(f); return { n: v.length, su: NE.su(v), ats: NE.ats(v) }; };
  return {
    n: rows.length,
    su,
    ats,
    ou,
    ppg: NE.mean(rows, 'pts_for'),
    papg: NE.mean(rows, 'pts_against'),
    diff: NE.mean(rows, 'margin'),
    atsMargin: NE.mean(rows, 'ats_margin'),
    line: NE.mean(rows, 'team_line'),
    totalLine: NE.mean(rows, 'total_line'),
    combined: NE.mean(rows, 'total_pts'),
    expWins: d3.sum(rows, (r) => r.imp ?? 0),
    home: part((r) => r.venue === 'Home'),
    away: part((r) => r.venue === 'Away'),
    neutral: part((r) => r.venue === 'Neutral'),
    fav: part((r) => r.role === 'Favorite'),
    dog: part((r) => r.role === 'Underdog'),
  };
};
NE.teamTable = (teamGames) => NE.groupBy(teamGames, 'team').map(([team, rows]) => {
  const s = NE.teamSummary(rows);
  return { team, ...s, winsOverExp: s.su.w + 0.5 * s.su.t - s.expWins };
});
