// Game explorer: every game, filterable, sortable and exportable, with a detail panel.
'use strict';

(() => {
  const NE = window.NE;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;

  const num = (x) => (x === '' || x === null || x === undefined ? null : Number(x));
  NE.gxRows = () => {
    const { games } = NE.data();
    const t = S.gx_team;
    const o = S.gx_opp;
    const smin = num(S.gx_smin);
    const smax = num(S.gx_smax);
    const tmin = num(S.gx_tmin);
    const tmax = num(S.gx_tmax);
    let rows = games;
    if (t) rows = rows.filter((r) => r.home_team === t || r.away_team === t);
    if (o) rows = rows.filter((r) => r.home_team === o || r.away_team === o);
    if (t && S.gx_venue) rows = rows.filter((r) => (S.gx_venue === 'Neutral' ? r.neutral : !r.neutral && (S.gx_venue === 'Home' ? r.home_team === t : r.away_team === t)));
    if (t && S.gx_role) rows = rows.filter((r) => (S.gx_role === 'Favorite' ? r.favorite === t : r.underdog === t));
    if (S.gx_sit === 'home-fav') rows = rows.filter((r) => r.fav_side === 'home' && !r.neutral);
    if (S.gx_sit === 'away-fav') rows = rows.filter((r) => r.fav_side === 'away' && !r.neutral);
    if (S.gx_sit === 'home-site') rows = rows.filter((r) => !r.neutral);
    if (S.gx_sit === 'neutral') rows = rows.filter((r) => r.neutral);
    if (S.gx_div === 'yes') rows = rows.filter((r) => r.div);
    if (S.gx_div === 'no') rows = rows.filter((r) => !r.div);
    if (S.gx_su === 'fav') rows = rows.filter((r) => r.fav_su === 'W');
    if (S.gx_su === 'dog') rows = rows.filter((r) => r.fav_su === 'L');
    if (S.gx_su === 'tie') rows = rows.filter((r) => r.result === 0);
    if (S.gx_su === 'team-w' && t) rows = rows.filter((r) => r.winner === t);
    if (S.gx_su === 'team-l' && t) rows = rows.filter((r) => r.winner !== t && r.winner !== 'TIE');
    if (S.gx_ats === 'fav') rows = rows.filter((r) => r.fav_ats === 'Cover');
    if (S.gx_ats === 'dog') rows = rows.filter((r) => r.fav_ats === 'No Cover');
    if (S.gx_ats === 'push') rows = rows.filter((r) => r.home_ats === 'Push');
    if (S.gx_ats === 'team-cover' && t) rows = rows.filter((r) => r.ats_winner === t);
    if (S.gx_ats === 'team-miss' && t) rows = rows.filter((r) => r.ats_winner !== t && r.ats_winner !== 'PUSH');
    if (S.gx_ou) rows = rows.filter((r) => r.ou_result === S.gx_ou);
    if (smin !== null) rows = rows.filter((r) => r.fav_line !== null && r.fav_line >= smin);
    if (smax !== null) rows = rows.filter((r) => r.fav_line !== null && r.fav_line <= smax);
    if (tmin !== null) rows = rows.filter((r) => r.total_line !== null && r.total_line >= tmin);
    if (tmax !== null) rows = rows.filter((r) => r.total_line !== null && r.total_line <= tmax);
    if (S.gx_season) rows = rows.filter((r) => String(r.season) === S.gx_season);
    if (S.gx_week) rows = rows.filter((r) => String(r.week) === S.gx_week);
    if (S.gx_q) {
      const q = String(S.gx_q).toLowerCase();
      rows = rows.filter((r) => [r.game_id, r.home_team, r.away_team, r.home_qb, r.away_qb, r.home_coach, r.away_coach, r.stadium, r.referee].join(' ').toLowerCase().includes(q));
    }
    return rows;
  };

  const COLS = {
    base: [
      ['date', 'Date', (g) => g.date, 'text'], ['week', 'Wk', (g) => g.week, 'int'],
      ['away_team', 'Away', (g) => g.away_team, 'text'], ['away_score', 'Away pts', (g) => g.away_score, 'int'],
      ['home_team', 'Home', (g) => g.home_team, 'text'], ['home_score', 'Home pts', (g) => g.home_score, 'int'],
      ['winner', 'Winner', (g) => (g.winner === 'TIE' ? 'Tie' : g.winner), 'text'],
    ],
    spread: [
      ['home_spread', 'Home line', (g) => g.home_spread, 'line', 'The home team’s closing spread: negative means the home team was favored.'],
      ['favorite', 'Favorite', (g) => g.favorite, 'text'], ['underdog', 'Underdog', (g) => g.underdog, 'text'],
      ['fav_ats', 'Fav ATS', (g) => g.fav_ats, 'pill'], ['ats_winner', 'Covered', (g) => (g.ats_winner === 'PUSH' ? 'Push' : g.ats_winner), 'text'],
    ],
    total: [
      ['total_line', 'Total', (g) => g.total_line, 'n1'], ['total_pts', 'Combined', (g) => g.total_pts, 'int'], ['ou_result', 'O/U', (g) => g.ou_result, 'text'],
    ],
    ml: [
      ['home_ml', 'Home ML', (g) => g.home_ml, 'odds'], ['away_ml', 'Away ML', (g) => g.away_ml, 'odds'], ['home_imp', 'Home win chance', (g) => g.home_imp, 'pct', 'The home team’s win chance implied by the closing moneylines, with the bookmaker’s margin removed.'],
    ],
  };
  const columns = () => [...COLS.base, ...(NE.showMarket('spread') ? COLS.spread : []), ...(NE.showMarket('total') ? COLS.total : []), ...(NE.showMarket('ml') ? COLS.ml : [])];

  const detail = (id) => {
    const g = NE.games.find((x) => x.game_id === id);
    if (!g) return '';
    const kv = (rows) => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const entering = (team) => {
      const prior = NE.teamGames.filter((r) => r.team === team && r.season === g.season && r.date < g.date);
      return prior.length ? `${NE.su(prior).rec} SU · ${NE.ats(prior).rec} ATS` : 'First game of the season';
    };
    const h2h = NE.teamGames.filter((r) => r.team === g.home_team && r.opponent === g.away_team && r.date < g.date);
    const same = NE.games.filter((x) => x.fav_line === g.fav_line && x.game_id !== g.game_id);
    const sameAts = NE.ats(same, 'fav_ats');
    const sameSu = NE.su(same, 'fav_su');
    const weather = g.roof && g.roof !== 'outdoors' ? `${esc(g.roof)}` : [g.temp !== null ? `${g.temp}°F` : null, g.wind !== null ? `wind ${g.wind} mph` : null].filter(Boolean).join(', ') || 'Not recorded';
    return `<section class="card detail">
      <header class="card-h"><div><p class="note">${esc(g.weekday || '')} ${f.date(g.date)}${g.kickoff ? ` · ${esc(g.kickoff)} ET` : ''} · ${g.season} week ${g.week}${g.phase === 'POST' ? ' · playoffs' : ''}${g.overtime ? ' · overtime' : ''}${g.div ? ' · division game' : ''}</p></div>
        <div class="card-c"><button type="button" class="btn ghost" data-go="${U.go({ game: '' })}">Close</button></div></header>
      <div class="score">
        <span class="${g.result < 0 ? 'w' : ''}">${esc(g.away_team)} <small>away</small></span><b class="${g.result < 0 ? 'w' : ''}">${g.away_score}</b>
        <span class="${g.result > 0 ? 'w' : ''}">${esc(g.home_team)} <small>${g.neutral ? 'neutral site' : 'home'}</small></span><b class="${g.result > 0 ? 'w' : ''}">${g.home_score}</b>
      </div>
      <p class="note">${esc(g.stadium || '')}${g.away_qb ? ` · QBs ${esc(g.away_qb)} and ${esc(g.home_qb)}` : ''}</p>
      <h4>Closing lines</h4>
      ${kv([['Spread', `${esc(g.home_team)} ${f.line(g.home_spread)}`], ['Favorite', g.favorite ? `${esc(g.favorite)} by ${f.n1(g.fav_line)}` : 'None (pick’em)'], ['Spread prices (home / away)', `${f.odds(g.home_spread_odds)} / ${f.odds(g.away_spread_odds)}`], ['Total', f.n1(g.total_line)], ['Over / under prices', `${f.odds(g.over_odds)} / ${f.odds(g.under_odds)}`], ['Moneyline (home / away)', `${f.odds(g.home_ml)} / ${f.odds(g.away_ml)}`], ['No-vig win chance (home / away)', `${f.pct0(g.home_imp)} / ${f.pct0(g.away_imp)}`]])}
      <h4>How it settled</h4>
      ${kv([['Winner', esc(g.winner === 'TIE' ? 'Tie' : g.winner)], ['Home margin', f.s1(g.result)], ['Favorite against the spread', `${U.outcomePill(g.fav_ats)} ${f.s1(g.fav_ats_margin)}`], ['Covered', esc(g.ats_winner === 'PUSH' ? 'Push' : g.ats_winner ?? '—')], ['Combined points', g.total_pts], ['Total', `${g.ou_result ?? '—'} ${f.s1(g.ou_margin)}`]])}
      <h4>Context</h4>
      ${kv([[`${esc(g.away_team)} going in`, entering(g.away_team)], [`${esc(g.home_team)} going in`, entering(g.home_team)],
        ['Rest days (away / home)', `${g.away_rest ?? '—'} / ${g.home_rest ?? '—'}`],
        [`Earlier meetings (${esc(g.home_team)} side)`, h2h.length ? `${NE.su(h2h).rec} SU · ${NE.ats(h2h).rec} ATS` : 'None since 2020'],
        g.fav_line !== null ? [`Favorites laying ${f.n1(g.fav_line)}, all games`, `${sameSu.rec} SU · ${sameAts.rec} ATS (${f.pct(sameAts.pct)}, range ${f.ci(sameAts)})`] : null,
        ['Roof / surface', `${esc(g.roof ?? '—')} / ${esc(g.surface ?? '—')}`], ['Weather', weather], ['Referee', esc(g.referee ?? '—')]])}
    </section>`;
  };

  NE.tabs.games = (root) => {
    const all = NE.gxRows();
    const cols = columns();
    const rows = U.sortRows(all, cols, S.gx_sort, S.gx_dir);
    const size = Number(S.gx_size) || 50;
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.min(S.gx_page, pages - 1);
    const shown = rows.slice(page * size, page * size + size);
    const fav = NE.ats(all, 'fav_ats');
    const o = NE.ou(all);
    const t = S.gx_team;
    const tr = t ? NE.teamGames.filter((r) => r.team === t && all.some((g) => g.game_id === r.game_id)) : [];
    const anyFilter = NE.GX_KEYS.some((k) => S[k] !== NE.DEFAULTS[k]);
    const seasons = [...new Set(NE.data().games.map((g) => g.season))].sort((a, b) => b - a);
    const weeks = S.gx_season ? [...new Set(NE.data().games.filter((g) => String(g.season) === S.gx_season).map((g) => g.week))].sort((a, b) => a - b) : [];
    root.innerHTML = `
      <div class="page-h"><div><h2>Game explorer</h2><p class="lede">Every completed game, with its closing lines and how each bet settled. The filters at the top (seasons, dates, game type, market, team) apply too.</p></div></div>
      <section class="card">
        <div class="filters">
          ${U.sel('gx_team', U.teamOptions('Any team'), S.gx_team, 'Team')}
          ${U.sel('gx_opp', U.teamOptions('Any opponent'), S.gx_opp, 'Opponent')}
          ${t ? U.sel('gx_venue', [['', 'Either'], ['Home', 'Home'], ['Away', 'Away'], ['Neutral', 'Neutral site']], S.gx_venue, `${t} home / away`) : U.sel('gx_sit', [['', 'Any'], ['home-fav', 'Home team favored'], ['away-fav', 'Road team favored'], ['home-site', 'Home sites only'], ['neutral', 'Neutral sites only']], S.gx_sit, 'Situation')}
          ${t ? U.sel('gx_role', [['', 'Either'], ['Favorite', 'Favorite'], ['Underdog', 'Underdog']], S.gx_role, `${t} favorite / underdog`) : ''}
          ${U.sel('gx_div', [['', 'Any'], ['yes', 'Division games'], ['no', 'Non-division']], S.gx_div, 'Division')}
          ${U.sel('gx_su', [['', 'Any'], ['fav', 'Favorite won'], ['dog', 'Underdog won'], ['tie', 'Tie'], ...(t ? [['team-w', `${t} won`], ['team-l', `${t} lost`]] : [])], S.gx_su, 'Straight-up result')}
          ${U.sel('gx_ats', [['', 'Any'], ['fav', 'Favorite covered'], ['dog', 'Underdog covered'], ['push', 'Push'], ...(t ? [['team-cover', `${t} covered`], ['team-miss', `${t} missed`]] : [])], S.gx_ats, 'Spread result')}
          ${U.sel('gx_ou', [['', 'Any'], ['Over', 'Over'], ['Under', 'Under'], ['Push', 'Push']], S.gx_ou, 'Total result')}
          ${U.range('gx_smin', 'gx_smax', S.gx_smin, S.gx_smax, 'Spread (points laid)', '0', 'any')}
          ${U.range('gx_tmin', 'gx_tmax', S.gx_tmin, S.gx_tmax, 'Closing total', 'any', 'any')}
          ${U.sel('gx_season', [['', 'Any'], ...seasons.map((s) => [String(s), String(s)])], S.gx_season, 'Season')}
          ${S.gx_season ? U.sel('gx_week', [['', 'Any'], ...weeks.map((w) => [String(w), `Week ${w}`])], S.gx_week, 'Week') : ''}
          <label class="ctl grow"><span>Search</span><input id="gx-q" type="search" value="${esc(S.gx_q)}" placeholder="Team, QB, coach, stadium, referee" data-key="gx_q" aria-label="Search games"></label>
          ${anyFilter ? `<button type="button" class="btn ghost" data-reset-keys="gx">Clear these filters</button>` : ''}
        </div>
      </section>
      <div class="explorer">
        <section class="card">
          <header class="card-h"><div><h3>${f.int(rows.length)} game${rows.length === 1 ? '' : 's'}</h3>
            <p class="note">${t && tr.length ? `${esc(t)}: ${NE.su(tr).rec} straight up, ${NE.ats(tr).rec} ATS (${f.pct(NE.ats(tr).pct)}, range ${f.ci(NE.ats(tr))}). ` : ''}Favorites ${fav.rec} ATS (${f.pct(fav.pct)}). Totals ${o.rec} O-U-P (${f.pct(o.pct)} over). Click a column to sort, a row for details.</p></div>
            <div class="card-c">${U.sel('gx_size', [[25, '25 per page'], [50, '50 per page'], [100, '100 per page'], [250, '250 per page']], size, 'Rows')}<button type="button" class="btn ghost" data-csv="games">Download CSV</button><button type="button" class="btn ghost" data-csv="games-copy">Copy CSV</button></div></header>
          ${U.table({ cols, rows: shown, sortKey: S.gx_sort, sortDir: S.gx_dir, sortParam: 'gx_sort', dirParam: 'gx_dir', cls: 'tall gx', rowAttrs: (g) => `data-game="${esc(g.game_id)}" class="clickable${g.game_id === S.game ? ' picked' : ''}"` })}
          <div class="pager">
            <button type="button" class="btn ghost" data-go="${U.go({ gx_page: Math.max(0, page - 1) })}" ${page === 0 ? 'disabled' : ''}>← Previous</button>
            <span>Page ${page + 1} of ${pages}</span>
            <button type="button" class="btn ghost" data-go="${U.go({ gx_page: Math.min(pages - 1, page + 1) })}" ${page >= pages - 1 ? 'disabled' : ''}>Next →</button>
          </div>
          <p class="note" data-csv-msg></p>
        </section>
        <aside>${S.game ? detail(S.game) : '<p class="callout">Pick a game to see its closing lines, how each bet settled, both teams’ records going in, rest and weather, and how favorites have done at the same spread.</p>'}</aside>
      </div>`;
  };

  NE.csvSources = NE.csvSources || {};
  NE.csvSources.games = () => ({ name: 'nfl_edge_games.csv', text: U.csv(U.sortRows(NE.gxRows(), columns(), S.gx_sort, S.gx_dir), ['game_id', 'date', 'season', 'week', 'game_type', 'away_team', 'away_score', 'home_team', 'home_score', 'neutral', 'div', 'winner', 'spread_line', 'home_spread', 'favorite', 'underdog', 'fav_line', 'fav_su', 'fav_ats', 'home_ats', 'ats_winner', 'total_line', 'total_pts', 'ou_result', 'home_ml', 'away_ml', 'home_imp', 'away_imp', 'home_spread_odds', 'away_spread_odds', 'over_odds', 'under_odds', 'stadium']) });
})();
