// NFL EDGE core: data preparation, statistics, the trend engine and app state.
// Conventions: spread_line = points the HOME team was favored by (positive = home favored).
// A team's own line is sportsbook style (negative = favored). ATS margin = team margin + own line.
'use strict';

const NE = (window.NE = {});
NE.raw = JSON.parse(document.getElementById('ne-data').textContent);
NE.meta = NE.raw.meta;
NE.tabs = {};

// American odds -> implied probability (vig included).
NE.prob = (ml) => (ml === null || ml === undefined ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));

NE.SPREAD_BUCKETS = ['Pick–3', '3.5–6.5', '7–10', '10.5+'];
NE.SPREAD_RANGES = { 'Pick–3': ['0', '3'], '3.5–6.5': ['3.5', '6.5'], '7–10': ['7', '10'], '10.5+': ['10.5', ''] };
NE.TOTAL_BUCKETS = ['≤40', '40.5–43.5', '44–46.5', '47–49.5', '50+'];
NE.TOTAL_RANGES = { '≤40': ['', '40'], '40.5–43.5': ['40.5', '43.5'], '44–46.5': ['44', '46.5'], '47–49.5': ['47', '49.5'], '50+': ['50', ''] };
NE.spreadBucket = (x) => (x === null ? null : x <= 3 ? 'Pick–3' : x <= 6.5 ? '3.5–6.5' : x <= 10 ? '7–10' : '10.5+');
NE.totalBucket = (t) => (t === null ? null : t <= 40 ? '≤40' : t <= 43.5 ? '40.5–43.5' : t <= 46.5 ? '44–46.5' : t <= 49.5 ? '47–49.5' : '50+');

// ---------------------------------------------------------------------------
// Games: one row per completed game, settled against the closing lines.
// ---------------------------------------------------------------------------
NE.buildGames = () => {
  const { cols, rows } = NE.raw;
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const v = (r, c) => (r[ix[c]] === undefined ? null : r[ix[c]]);
  const settle = (m, w, p, l) => (m === null ? null : m > 0 ? w : m < 0 ? l : p);
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
    const hp = NE.prob(hml);
    const ap = NE.prob(aml);
    const hsp = NE.prob(v(r, 'home_spread_odds'));
    const asp = NE.prob(v(r, 'away_spread_odds'));
    const op = NE.prob(v(r, 'over_odds'));
    const up = NE.prob(v(r, 'under_odds'));
    out.push({
      game_id: id,
      season: v(r, 'season'),
      week: v(r, 'week'),
      game_type: v(r, 'game_type'),
      phase: v(r, 'game_type') === 'REG' ? 'REG' : 'POST',
      date: v(r, 'gameday'),
      weekday: v(r, 'weekday'),
      kickoff: v(r, 'gametime'),
      home_team: home,
      away_team: away,
      home_score: hs,
      away_score: as,
      neutral: v(r, 'location') === 'Neutral',
      overtime: v(r, 'overtime') === 1,
      div: v(r, 'div_game') === 1,
      home_rest: v(r, 'home_rest'),
      away_rest: v(r, 'away_rest'),
      roof: v(r, 'roof'),
      surface: v(r, 'surface'),
      temp: v(r, 'temp'),
      wind: v(r, 'wind'),
      referee: v(r, 'referee'),
      stadium: v(r, 'stadium'),
      home_qb: v(r, 'home_qb_name'),
      away_qb: v(r, 'away_qb_name'),
      home_coach: v(r, 'home_coach'),
      away_coach: v(r, 'away_coach'),
      src_result: v(r, 'result'),
      src_total: v(r, 'total'),
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
      fav_imp: hp !== null && ap !== null && fav ? (fav === 'home' ? hp : ap) / (hp + ap) : null,
      ml_hold: hp !== null && ap !== null ? hp + ap - 1 : null,
      spread_hold: hsp !== null && asp !== null ? hsp + asp - 1 : null,
      total_hold: op !== null && up !== null ? op + up - 1 : null,
      spread_bucket: NE.spreadBucket(favLine),
      total_bucket: NE.totalBucket(tl),
    });
  }
  return out.sort((a, b) => (a.date === b.date ? (a.game_id < b.game_id ? -1 : 1) : a.date < b.date ? -1 : 1));
};

// Two rows per game, one from each team's side.
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
      const rest = isHome ? g.home_rest : g.away_rest;
      const oppRest = isHome ? g.away_rest : g.home_rest;
      const spreadOdds = isHome ? g.home_spread_odds : g.away_spread_odds;
      out.push({
        g,
        key: `${g.game_id}-${team}`,
        game_id: g.game_id,
        season: g.season,
        week: g.week,
        phase: g.phase,
        date: g.date,
        team,
        opponent: isHome ? g.away_team : g.home_team,
        is_home: isHome,
        venue: g.neutral ? 'Neutral' : isHome ? 'Home' : 'Away',
        pts_for: pf,
        pts_against: pa,
        margin,
        su: settle(margin, 'W', 'T', 'L'),
        team_line: line,
        role: g.favorite === team ? 'Favorite' : g.underdog === team ? 'Underdog' : null,
        ats_margin: line === null ? null : margin + line,
        ats: line === null ? null : settle(margin + line, 'Cover', 'Push', 'No Cover'),
        spread_odds: spreadOdds,
        spread_be: NE.prob(spreadOdds),
        ou_result: g.ou_result,
        total_line: g.total_line,
        total_pts: g.total_pts,
        ml: isHome ? g.home_ml : g.away_ml,
        imp: isHome ? g.home_imp : g.away_imp,
        rest,
        rest_edge: rest === null || oppRest === null ? null : rest > oppRest ? 'more' : rest < oppRest ? 'less' : 'same',
        div: g.div,
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
NE.firstDate = NE.games[0].date;
NE.lastDate = NE.games[NE.games.length - 1].date;

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
const valueOf = (r, f) => (typeof f === 'function' ? f(r) : r[f]);
const ok = (x) => x !== null && x !== undefined && !Number.isNaN(x);
NE.ok = ok;
NE.mean = (arr, f) => {
  let s = 0;
  let k = 0;
  for (const r of arr) { const x = valueOf(r, f); if (ok(x)) { s += x; k += 1; } }
  return k ? s / k : null;
};
NE.median = (arr, f) => {
  const xs = arr.map((r) => valueOf(r, f)).filter(ok).sort((a, b) => a - b);
  return xs.length ? d3.quantileSorted(xs, 0.5) : null;
};
// Mean with a 95% range (± 1.96 standard errors).
NE.meanCI = (arr, f) => {
  const xs = arr.map((r) => valueOf(r, f)).filter(ok);
  if (!xs.length) return { value: null, lo: null, hi: null, n: 0, sd: null };
  const m = d3.mean(xs);
  const sd = xs.length > 1 ? d3.deviation(xs) : 0;
  const se = xs.length > 1 ? sd / Math.sqrt(xs.length) : 0;
  return { value: m, lo: m - 1.96 * se, hi: m + 1.96 * se, n: xs.length, sd };
};
// Straight-up record. Win % = wins / games (ties stay in the games).
NE.su = (arr, f = 'su') => {
  const w = count(arr, f, 'W');
  const l = count(arr, f, 'L');
  const t = count(arr, f, 'T');
  const n = w + l + t;
  const [lo, hi] = NE.wilson(w, n);
  return { w, l, t, n, dec: n, pct: n ? w / n : null, lpct: n ? l / n : null, lo, hi, rec: `${w}-${l}${t ? `-${t}` : ''}`, lrec: `${l}-${w}${t ? `-${t}` : ''}` };
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
// Is a rate's 95% range clear of a baseline (50% unless given)?
NE.clear = (r, base = 0.5) => !!r && r.lo !== null && r.lo !== undefined && (r.lo > base || r.hi < base);
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
NE.slope = (xs, ys) => {
  const mx = d3.mean(xs);
  const my = d3.mean(ys);
  const sxy = d3.sum(xs, (x, i) => (x - mx) * (ys[i] - my));
  const sxx = d3.sum(xs, (x) => (x - mx) ** 2);
  return sxx ? { slope: sxy / sxx, intercept: my - (sxy / sxx) * mx } : null;
};
// 95% range for a difference between two rates or two means.
NE.diffRate = (a, b) => {
  if (!a || !b || !a.dec || !b.dec) return null;
  const d = b.pct - a.pct;
  const se = Math.sqrt((a.pct * (1 - a.pct)) / a.dec + (b.pct * (1 - b.pct)) / b.dec);
  return { d, lo: d - 1.96 * se, hi: d + 1.96 * se, real: Math.abs(d) > 1.96 * se };
};
NE.diffMean = (a, b) => {
  if (!a || !b || !a.n || !b.n) return null;
  const d = b.value - a.value;
  const se = Math.sqrt((a.sd ** 2) / a.n + (b.sd ** 2) / b.n);
  return { d, lo: d - 1.96 * se, hi: d + 1.96 * se, real: Math.abs(d) > 1.96 * se };
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const nil = (x) => x === null || x === undefined || Number.isNaN(x);
NE.f = {
  pct: (x) => (nil(x) ? '—' : d3.format('.1%')(x)),
  pct0: (x) => (nil(x) ? '—' : d3.format('.0%')(x)),
  n1: (x) => (nil(x) ? '—' : d3.format('.1f')(x)),
  n2: (x) => (nil(x) ? '—' : d3.format('.2f')(x)),
  int: (x) => (nil(x) ? '—' : d3.format(',')(x)),
  s1: (x) => (nil(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${d3.format('.1f')(Math.abs(x))}`),
  s2: (x) => (nil(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${d3.format('.2f')(Math.abs(x))}`),
  line: (x) => (nil(x) ? '—' : x === 0 ? 'PK' : `${x > 0 ? '+' : '−'}${d3.format('~g')(Math.abs(x))}`),
  odds: (x) => (nil(x) ? '—' : `${x > 0 ? '+' : '−'}${Math.abs(Math.round(x))}`),
  date: (s) => (s ? d3.utcFormat('%b %-d, %Y')(new Date(`${s}T00:00:00Z`)) : '—'),
  pp: (x) => (nil(x) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${d3.format('.1f')(Math.abs(x) * 100)} pts`),
  ci: (r) => (r && !nil(r.lo) ? `${d3.format('.0%')(r.lo)}–${d3.format('.0%')(r.hi)}` : '—'),
  ci1: (r) => (r && !nil(r.lo) ? `${d3.format('.1f')(r.lo)}–${d3.format('.1f')(r.hi)}` : '—'),
};
NE.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// State: filters, tabs and selections, mirrored in the URL hash where the host allows it.
// ---------------------------------------------------------------------------
NE.DEFAULTS = {
  tab: 'overview',
  // global filters
  s0: NE.seasons[0],
  s1: NE.latestSeason,
  d0: '',
  d1: '',
  phase: 'All',
  market: 'all',
  team: '',
  neutral: true,
  // overview
  metric: 'avg_total',
  split: 'none',
  heat: 'avg_total',
  // teams
  pteam: 'KC',
  pteam2: 'BUF',
  tmode: 'profile',
  rank: 'cover',
  // trend lab
  tt_market: 'spread',
  tt_side: 'fav',
  tt_team: '',
  tt_opp: '',
  tt_smin: '',
  tt_smax: '',
  tt_tmin: '',
  tt_tmax: '',
  tt_div: 'any',
  tt_rest: 'any',
  funnel: 'cover',
  persist: 'cover',
  scan_sort: 'z',
  // game explorer
  gx_team: '',
  gx_opp: '',
  gx_venue: '',
  gx_role: '',
  gx_sit: '',
  gx_div: '',
  gx_su: '',
  gx_ats: '',
  gx_ou: '',
  gx_smin: '',
  gx_smax: '',
  gx_tmin: '',
  gx_tmax: '',
  gx_season: '',
  gx_week: '',
  gx_q: '',
  gx_sort: 'date',
  gx_dir: 'desc',
  gx_page: 0,
  gx_size: 50,
  game: '',
  // data explorer
  dx_q: '',
  dx_page: 0,
  dx_sort: 'gameday',
  dx_dir: 'desc',
  // table sort state
  tl_sort: 'date',
  tl_dir: 'desc',
  rk_sort: 'cover',
  rk_dir: 'desc',
  bt_sort: 'cover',
  bt_dir: 'desc',
  to_sort: 'over',
  to_dir: 'desc',
  scan_dir: 'desc',
  dc_sort: '',
  dc_dir: 'asc',
};
NE.S = { ...NE.DEFAULTS };
NE.GLOBAL_KEYS = ['s0', 's1', 'd0', 'd1', 'phase', 'market', 'team', 'neutral'];
NE.GX_KEYS = ['gx_team', 'gx_opp', 'gx_venue', 'gx_role', 'gx_sit', 'gx_div', 'gx_su', 'gx_ats', 'gx_ou', 'gx_smin', 'gx_smax', 'gx_tmin', 'gx_tmax', 'gx_season', 'gx_week', 'gx_q'];
NE.TT_KEYS = ['tt_market', 'tt_side', 'tt_team', 'tt_opp', 'tt_smin', 'tt_smax', 'tt_tmin', 'tt_tmax', 'tt_div', 'tt_rest'];

NE.readHash = () => {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  if (/^[a-z]+$/.test(h)) { if (NE.tabs[h]) NE.S.tab = h; return; }
  try {
    for (const [k, val] of new URLSearchParams(h)) {
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
  const S = NE.S;
  // Keep ranges valid: moving one end past the other drags it along.
  if (S.s0 > S.s1) { if ('s0' in patch) S.s1 = S.s0; else S.s0 = S.s1; }
  if (S.d0 && S.d1 && S.d0 > S.d1) { if ('d0' in patch) S.d1 = S.d0; else S.d0 = S.d1; }
  // Picking a team in the global filter also opens it on the Teams tab.
  if ('team' in patch && patch.team) S.pteam = patch.team;
  NE.writeHash();
  for (const fn of NE.listeners) fn(patch);
};
NE.reset = (keys) => NE.set(Object.fromEntries(keys.map((k) => [k, NE.DEFAULTS[k]])));
NE.filtersAreDefault = () => NE.GLOBAL_KEYS.every((k) => NE.S[k] === NE.DEFAULTS[k]);
NE.showMarket = (m) => NE.S.market === 'all' || NE.S.market === m;

// Filtered data, cached on the global filter values.
let cacheKey = '';
let cache = null;
NE.data = () => {
  const S = NE.S;
  const key = NE.GLOBAL_KEYS.map((k) => S[k]).join('|');
  if (key === cacheKey && cache) return cache;
  const keep = (g) => g.season >= S.s0 && g.season <= S.s1 && (!S.d0 || g.date >= S.d0) && (!S.d1 || g.date <= S.d1)
    && (S.phase === 'All' || g.phase === S.phase) && (S.neutral || !g.neutral);
  const scopeGames = NE.games.filter(keep);
  const games = S.team ? scopeGames.filter((g) => g.home_team === S.team || g.away_team === S.team) : scopeGames;
  const ids = new Set(games.map((g) => g.game_id));
  const scopeIds = new Set(scopeGames.map((g) => g.game_id));
  cache = {
    games,
    teamGames: NE.teamGames.filter((t) => ids.has(t.game_id)),
    // the same filters without the team filter, for team pages and league-wide rankings
    scopeGames,
    scopeTeamGames: NE.teamGames.filter((t) => scopeIds.has(t.game_id)),
  };
  cacheKey = key;
  return cache;
};
// Trend axis: seasons, or weeks when everything in view is one season.
NE.periodKey = (rows) => (new Set(rows.map((r) => r.season)).size <= 1 ? 'week' : 'season');
NE.groupBy = (arr, key) => d3.groups(arr, typeof key === 'function' ? key : (r) => r[key]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
NE.periods = (rows) => {
  const key = NE.periodKey(rows);
  const groups = NE.groupBy(rows, key);
  return { key, label: key === 'week' ? 'Week' : 'Season', cats: groups.map((g) => g[0]), groups: groups.map((g) => g[1]) };
};

// ---------------------------------------------------------------------------
// League measures by period (overview trend explorer, heatmap), each with a 95% range.
// ---------------------------------------------------------------------------
const homeSU = (g) => NE.su(g.filter((x) => !x.neutral).map((x) => ({ su: x.result > 0 ? 'W' : x.result < 0 ? 'L' : 'T' })));
NE.homeSU = homeSU;
const rate = (r) => ({ value: r.pct, lo: r.lo, hi: r.hi, n: r.dec });
NE.METRICS = {
  avg_total: { label: 'Combined points per game', kind: 'num', calc: (g) => NE.meanCI(g, 'total_pts') },
  avg_team_pts: { label: 'Points per team per game', kind: 'num', calc: (g) => NE.meanCI(g.flatMap((x) => [{ v: x.home_score }, { v: x.away_score }]), 'v') },
  avg_total_line: { label: 'Closing total', kind: 'num', calc: (g) => NE.meanCI(g, 'total_line') },
  avg_margin: { label: 'Winning margin', kind: 'num', calc: (g) => NE.meanCI(g.filter((x) => x.result !== 0), 'abs_margin') },
  avg_fav_line: { label: 'Points laid by the favorite', kind: 'num', calc: (g) => NE.meanCI(g, 'fav_line') },
  home_win: { label: 'Home win %', kind: 'pct', calc: (g) => rate(homeSU(g)) },
  fav_win: { label: 'Favorite win %', kind: 'pct', calc: (g) => rate(NE.su(g, 'fav_su')) },
  fav_cover: { label: 'Favorite cover %', kind: 'pct', base: 0.5, calc: (g) => rate(NE.ats(g, 'fav_ats')) },
  home_cover: { label: 'Home cover %', kind: 'pct', base: 0.5, calc: (g) => rate(NE.ats(g, 'home_ats')) },
  over: { label: 'Over %', kind: 'pct', base: 0.5, calc: (g) => rate(NE.ou(g)) },
  spread_mae: { label: 'Spread miss (points)', kind: 'num', calc: (g) => NE.meanCI(g.filter((x) => x.home_ats_margin !== null), (x) => Math.abs(x.home_ats_margin)) },
  total_mae: { label: 'Total miss (points)', kind: 'num', calc: (g) => NE.meanCI(g.filter((x) => x.ou_margin !== null), (x) => Math.abs(x.ou_margin)) },
  ml_hold: { label: 'Moneyline margin', kind: 'pct', calc: (g) => ({ value: NE.mean(g, 'ml_hold'), n: g.length }) },
};
NE.metricPoint = (key, g) => NE.METRICS[key].calc(g);
NE.metricSeries = (key, groups) => {
  const pts = groups.map((g) => NE.metricPoint(key, g));
  return { values: pts.map((p) => p.value ?? null), lo: pts.map((p) => p.lo ?? null), hi: pts.map((p) => p.hi ?? null), n: pts.map((p) => p.n) };
};
NE.SPLITS = {
  none: { label: 'No split', groups: null },
  phase: { label: 'Regular season vs. playoffs', groups: [['Regular season', (g) => g.phase === 'REG'], ['Playoffs', (g) => g.phase === 'POST']] },
  div: { label: 'Division vs. other games', groups: [['Division games', (g) => g.div], ['Other games', (g) => !g.div]] },
  spread: { label: 'Big vs. small spreads', groups: [['Spread 7 or more', (g) => g.fav_line !== null && g.fav_line >= 7], ['Spread under 7', (g) => g.fav_line !== null && g.fav_line < 7]] },
  site: { label: 'Home sites vs. neutral sites', groups: [['Home sites', (g) => !g.neutral], ['Neutral sites', (g) => g.neutral]] },
};

// ---------------------------------------------------------------------------
// Team summaries
// ---------------------------------------------------------------------------
NE.teamSummary = (rows) => {
  const part = (f) => { const v = rows.filter(f); return { n: v.length, su: NE.su(v), ats: NE.ats(v), ou: NE.ou(v), ppg: NE.mean(v, 'pts_for'), papg: NE.mean(v, 'pts_against') }; };
  const s = {
    n: rows.length,
    su: NE.su(rows),
    ats: NE.ats(rows),
    ou: NE.ou(rows),
    ppg: NE.mean(rows, 'pts_for'),
    papg: NE.mean(rows, 'pts_against'),
    diff: NE.meanCI(rows, 'margin'),
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
    div: part((r) => r.div),
    nondiv: part((r) => !r.div),
  };
  s.winsOverExp = s.su.w + 0.5 * s.su.t - s.expWins;
  return s;
};
NE.teamTable = (teamGames) => NE.groupBy(teamGames, 'team').map(([team, rows]) => ({ team, ...NE.teamSummary(rows) }));

// ---------------------------------------------------------------------------
// Trend engine: describe a situation, get its record, rate, 95% range and verdict.
// ---------------------------------------------------------------------------
// Sides are a point of view (spread and moneyline) or a set of games (totals).
NE.SIDES = {
  fav: { label: 'Favorites', test: (r) => r.role === 'Favorite' },
  dog: { label: 'Underdogs', test: (r) => r.role === 'Underdog' },
  home: { label: 'Home teams', test: (r) => r.venue === 'Home' },
  away: { label: 'Road teams', test: (r) => r.venue === 'Away' },
  homefav: { label: 'Home favorites', test: (r) => r.venue === 'Home' && r.role === 'Favorite' },
  homedog: { label: 'Home underdogs', test: (r) => r.venue === 'Home' && r.role === 'Underdog' },
  awayfav: { label: 'Road favorites', test: (r) => r.venue === 'Away' && r.role === 'Favorite' },
  awaydog: { label: 'Road underdogs', test: (r) => r.venue === 'Away' && r.role === 'Underdog' },
  team: { label: 'Every game', test: () => true },
  all: { label: 'All games', game: true, test: () => true },
  homefavg: { label: 'Games with a home favorite', game: true, test: (r) => r.g.fav_side === 'home' && !r.g.neutral },
  awayfavg: { label: 'Games with a road favorite', game: true, test: (r) => r.g.fav_side === 'away' && !r.g.neutral },
};
NE.sideOptions = (market, team) => {
  const base = market === 'total' ? ['all', 'homefavg', 'awayfavg'] : ['fav', 'dog', 'home', 'away', 'homefav', 'homedog', 'awayfav', 'awaydog'];
  return team ? (market === 'total' ? ['team', ...base.slice(1)] : ['team', ...base]) : base;
};
NE.MARKETS = { spread: 'Spread', total: 'Total', ml: 'Moneyline' };
NE.specFromState = () => {
  const S = NE.S;
  const spec = { market: S.tt_market, side: S.tt_side, team: S.tt_team, opp: S.tt_opp, smin: S.tt_smin, smax: S.tt_smax, tmin: S.tt_tmin, tmax: S.tt_tmax, div: S.tt_div, rest: S.tt_rest };
  if (!NE.sideOptions(spec.market, spec.team).includes(spec.side)) spec.side = NE.sideOptions(spec.market, spec.team)[0];
  return spec;
};
NE.trendRows = (spec, teamGames) => {
  const side = NE.SIDES[spec.side] || NE.SIDES.fav;
  const num = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
  const smin = num(spec.smin);
  const smax = num(spec.smax);
  const tmin = num(spec.tmin);
  const tmax = num(spec.tmax);
  return teamGames.filter((r) => {
    const g = r.g;
    // Game-level sides take one row per game: the picked team's, else the listed home team's.
    if (side.game) { if (r.team !== (spec.team || g.home_team)) return false; } else if (spec.team && r.team !== spec.team) return false;
    if (spec.opp && r.opponent !== spec.opp) return false;
    if (!side.test(r)) return false;
    if (smin !== null && (g.fav_line === null || g.fav_line < smin)) return false;
    if (smax !== null && (g.fav_line === null || g.fav_line > smax)) return false;
    if (tmin !== null && (g.total_line === null || g.total_line < tmin)) return false;
    if (tmax !== null && (g.total_line === null || g.total_line > tmax)) return false;
    if (spec.div === 'yes' && !g.div) return false;
    if (spec.div === 'no' && g.div) return false;
    if (spec.rest && spec.rest !== 'any' && r.rest_edge !== spec.rest) return false;
    return true;
  });
};
NE.trendResult = (spec, rows) => {
  if (spec.market === 'total') {
    const r = NE.ou(rows);
    return { kind: 'Over %', recLabel: 'over-under-push', k: r.w, n: r.dec, games: rows.length, rate: r.pct, lo: r.lo, hi: r.hi, rec: r.rec, base: 0.5, baseLabel: '50%', breakeven: NE.mean(rows, (x) => NE.prob(x.g.over_odds)), pushes: r.p };
  }
  if (spec.market === 'ml') {
    const r = NE.su(rows);
    return { kind: 'Win %', recLabel: 'win-loss-tie', k: r.w, n: r.n, games: rows.length, rate: r.pct, lo: r.lo, hi: r.hi, rec: r.rec, base: NE.mean(rows, 'imp'), baseLabel: 'price-implied', implied: true };
  }
  const r = NE.ats(rows);
  return { kind: 'Cover %', recLabel: 'cover-miss-push', k: r.w, n: r.dec, games: rows.length, rate: r.pct, lo: r.lo, hi: r.hi, rec: r.rec, base: 0.5, baseLabel: '50%', breakeven: NE.mean(rows, 'spread_be'), pushes: r.p };
};
NE.verdict = (res) => {
  if (!res || res.n === 0 || res.lo === null) return { tone: 'neutral', text: 'No games' };
  const small = res.n < 30 ? ' (small sample)' : '';
  if (res.lo > res.base) return { tone: 'good', text: (res.implied ? 'Won more often than the prices implied' : `Above ${res.baseLabel}, beyond chance`) + small };
  if (res.hi < res.base) return { tone: 'bad', text: (res.implied ? 'Won less often than the prices implied' : `Below ${res.baseLabel}, beyond chance`) + small };
  return { tone: 'neutral', text: (res.implied ? 'In line with the prices' : `Within chance of ${res.baseLabel}`) + small };
};
NE.specLabel = (spec) => {
  const parts = [];
  const side = NE.SIDES[spec.side];
  if (spec.team) parts.push(spec.side === 'team' ? `${spec.team}, every game` : `${spec.team} as ${side.label.toLowerCase().replace(/s$/, '')}`);
  else parts.push(side.label);
  if (spec.opp) parts.push(`vs. ${spec.opp}`);
  if (spec.smin !== '' || spec.smax !== '') parts.push(`spread ${spec.smin === '' ? '0' : spec.smin}–${spec.smax === '' ? 'any' : spec.smax}`);
  if (spec.tmin !== '' || spec.tmax !== '') parts.push(`total ${spec.tmin === '' ? 'any' : spec.tmin}–${spec.tmax === '' ? 'any' : spec.tmax}`);
  if (spec.div === 'yes') parts.push('division games');
  if (spec.div === 'no') parts.push('non-division games');
  if (spec.rest && spec.rest !== 'any') parts.push(`${spec.rest} rest than opponent`);
  return parts.join(', ');
};

// Every pattern the "worth investigating" scan tests. Testing many patterns means a few
// clear the 95% bar by luck alone (about 5 in 100), which the dashboard says out loud.
NE.scanSpecs = () => {
  const base = { team: '', opp: '', smin: '', smax: '', tmin: '', tmax: '', div: 'any', rest: 'any' };
  const specs = [];
  for (const b of NE.SPREAD_BUCKETS) { const [a, z] = NE.SPREAD_RANGES[b]; specs.push({ ...base, market: 'spread', side: 'fav', smin: a, smax: z, label: `Favorites laying ${b} against the spread` }); }
  for (const s of ['homefav', 'homedog', 'awayfav', 'awaydog']) specs.push({ ...base, market: 'spread', side: s, label: `${NE.SIDES[s].label} against the spread` });
  specs.push({ ...base, market: 'spread', side: 'fav', div: 'yes', label: 'Favorites in division games' });
  specs.push({ ...base, market: 'spread', side: 'fav', div: 'no', label: 'Favorites outside the division' });
  specs.push({ ...base, market: 'spread', side: 'fav', rest: 'more', label: 'Favorites with more rest' });
  specs.push({ ...base, market: 'spread', side: 'dog', rest: 'more', label: 'Underdogs with more rest' });
  for (const b of NE.TOTAL_BUCKETS) { const [a, z] = NE.TOTAL_RANGES[b]; specs.push({ ...base, market: 'total', side: 'all', tmin: a, tmax: z, label: `Overs when the total is ${b}` }); }
  specs.push({ ...base, market: 'total', side: 'all', div: 'yes', label: 'Overs in division games' });
  specs.push({ ...base, market: 'total', side: 'all', div: 'no', label: 'Overs outside the division' });
  for (const b of NE.SPREAD_BUCKETS) { const [a, z] = NE.SPREAD_RANGES[b]; specs.push({ ...base, market: 'ml', side: 'dog', smin: a, smax: z, label: `Underdogs getting ${b}: wins vs. price` }); }
  for (const t of NE.teams) specs.push({ ...base, market: 'spread', side: 'team', team: t, label: `${t} against the spread` });
  for (const t of NE.teams) specs.push({ ...base, market: 'total', side: 'team', team: t, label: `Overs in ${t} games` });
  return specs;
};
NE.scan = (teamGames, minN = 30) => {
  const out = [];
  for (const spec of NE.scanSpecs()) {
    const res = NE.trendResult(spec, NE.trendRows(spec, teamGames));
    if (res.n < minN || res.lo === null) continue;
    const se = (res.hi - res.lo) / 3.92 || 1;
    out.push({ spec, res, z: (res.rate - res.base) / se, flagged: NE.clear(res, res.base) });
  }
  return out;
};

// Explorer filters that show the games behind a trend-lab situation.
NE.specToExplorer = (spec) => {
  const patch = Object.fromEntries(NE.GX_KEYS.map((k) => [k, NE.DEFAULTS[k]]));
  patch.gx_team = spec.team || '';
  patch.gx_opp = spec.opp || '';
  const s = spec.side;
  if (spec.team) {
    if (['home', 'homefav', 'homedog'].includes(s)) patch.gx_venue = 'Home';
    if (['away', 'awayfav', 'awaydog'].includes(s)) patch.gx_venue = 'Away';
    if (['fav', 'homefav', 'awayfav'].includes(s)) patch.gx_role = 'Favorite';
    if (['dog', 'homedog', 'awaydog'].includes(s)) patch.gx_role = 'Underdog';
  } else {
    if (['homefav', 'awaydog', 'homefavg'].includes(s)) patch.gx_sit = 'home-fav';
    if (['homedog', 'awayfav', 'awayfavg'].includes(s)) patch.gx_sit = 'away-fav';
    if (['home', 'away'].includes(s)) patch.gx_sit = 'home-site';
  }
  patch.gx_smin = spec.smin;
  patch.gx_smax = spec.smax;
  patch.gx_tmin = spec.tmin;
  patch.gx_tmax = spec.tmax;
  patch.gx_div = spec.div === 'any' ? '' : spec.div;
  return { ...patch, tab: 'games', gx_page: 0, game: '' };
};
