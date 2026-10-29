// NFL EDGE UI builders shared by every tab: cards, KPI tiles, controls and small helpers.
'use strict';

(() => {
  const NE = window.NE;
  const esc = NE.esc;
  const f = NE.f;
  const U = (NE.ui = {});

  U.go = (patch) => esc(JSON.stringify(patch));
  // A small "i" marker; hovering or focusing it shows the definition.
  U.info = (text) => (text ? `<span class="info" tabindex="0" role="note" data-info="${esc(text)}" aria-label="${esc(text)}">i</span>` : '');
  U.card = ({ id, title, note = '', info = '', controls = '', body = '', cls = '', h = 0 }) => `
    <section class="card ${cls}" id="card-${id}">
      <header class="card-h"><div><h3>${title}${U.info(info)}</h3>${note ? `<p class="note">${note}</p>` : ''}</div>${controls ? `<div class="card-c">${controls}</div>` : ''}</header>
      ${body || `<div class="chart" data-chart="${id}" data-label="${esc(title.replace(/<[^>]+>/g, ''))}"${h ? ` style="min-height:${h}px"` : ''}></div>`}
    </section>`;
  U.kpi = ({ label, value, sub = '', ci = '', info = '', spark = '', tone = '', patch = null, foot = '' }) => `
    <div class="kpi ${patch ? 'clickable' : ''} ${tone}" ${patch ? `data-go="${U.go(patch)}" tabindex="0" role="button"` : ''}>
      <span class="kpi-l">${label}${U.info(info)}</span>
      <span class="kpi-v">${value}</span>
      ${ci ? `<span class="kpi-ci">${ci}</span>` : ''}
      ${sub ? `<span class="kpi-s">${sub}</span>` : ''}
      ${spark ? `<span class="kpi-spark" data-spark="${spark}"></span>` : ''}
      ${foot ? `<span class="kpi-f">${foot}</span>` : ''}
    </div>`;
  U.section = (title, note = '', id = '') => `<div class="sec"${id ? ` id="${id}"` : ''}><h2>${title}</h2>${note ? `<p>${note}</p>` : ''}</div>`;
  U.sel = (key, options, value, label, cls = '') => `
    <label class="ctl ${cls}"><span>${label}</span><select data-key="${key}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  U.seg = (key, options, value, label = '') => `
    <div class="ctl"><span>${label}</span><div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, l]) => `<button type="button" data-go="${U.go({ [key]: v })}" aria-pressed="${String(v) === String(value)}">${esc(l)}</button>`).join('')}</div></div>`;
  U.num = (key, value, label, placeholder, step = 0.5) => `
    <label class="ctl num-ctl"><span>${label}</span><input type="number" step="${step}" min="0" data-key="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" inputmode="decimal"></label>`;
  U.range = (k0, k1, v0, v1, label, ph0, ph1) => `
    <div class="ctl"><span>${label}</span><div class="range">
      <input type="number" step="0.5" min="0" data-key="${k0}" value="${esc(v0)}" placeholder="${esc(ph0)}" aria-label="${esc(label)} from" inputmode="decimal">
      <i>to</i>
      <input type="number" step="0.5" min="0" data-key="${k1}" value="${esc(v1)}" placeholder="${esc(ph1)}" aria-label="${esc(label)} to" inputmode="decimal">
    </div></div>`;
  U.teamOptions = (any) => [...(any ? [['', any]] : []), ...NE.teams.map((t) => [t, t])];
  U.pill = (v) => (v ? `<span class="pill ${v === 'Cover' || v === 'W' || v === 'Over' ? 'good' : v === 'No Cover' || v === 'L' || v === 'Under' ? 'bad' : 'neutral'}">${esc(v)}</span>` : '—');
  U.outcomePill = (v) => (v ? `<span class="pill ${v === 'Cover' || v === 'W' ? 'good' : v === 'No Cover' || v === 'L' ? 'bad' : 'neutral'}">${esc(v)}</span>` : '—');
  U.verdict = (res) => { const v = NE.verdict(res); return `<span class="pill ${v.tone}">${esc(v.text)}</span>`; };
  // Verdict for a plain rate against 50%.
  U.vs50 = (r) => {
    if (!r || r.lo === null || r.lo === undefined) return '';
    if (r.lo > 0.5) return '<span class="pill good">Above 50%, beyond chance</span>';
    if (r.hi < 0.5) return '<span class="pill bad">Below 50%, beyond chance</span>';
    return '<span class="pill neutral">Within chance of 50%</span>';
  };
  U.empty = (text = 'No games match these filters. Widen the seasons or dates, or reset the filters.') => `<div class="card"><p class="empty">${esc(text)}</p></div>`;
  U.draw = (root, id, fn) => { const el = root.querySelector(`[data-chart="${id}"]`); if (el) fn(el); };
  U.spark = (root, id, values, color) => { const el = root.querySelector(`[data-spark="${id}"]`); if (el) NE.charts.spark(el, values, color); };
  U.rangeText = (games) => (games.length ? `${f.date(games[0].date)} – ${f.date(games[games.length - 1].date)}` : '—');

  // Click on a period: a season narrows the filters to it; a week opens that week's games.
  U.drill = (P, games) => (i) => {
    if (P.key === 'season') NE.set({ s0: P.cats[i], s1: P.cats[i] });
    else NE.set({ ...NE.specToExplorer({ side: 'all', team: '', opp: '', smin: '', smax: '', tmin: '', tmax: '', div: 'any' }), gx_season: String(games[0].season), gx_week: String(P.cats[i]) });
  };
  U.drillHint = (P) => (P.key === 'season' ? 'Click to focus on this season' : 'Click to list this week’s games');
  U.openTeam = (team) => NE.set({ tab: 'teams', pteam: team, tmode: 'profile' });
  U.openGame = (id) => NE.set({ tab: 'games', game: id });
  U.gameLabel = (g) => `${g.away_team} @ ${g.home_team} · ${g.season} week ${g.week}`;

  // A sortable table built from rows and column specs: [key, label, get(row), kind, cls].
  U.table = ({ cols, rows, sortKey, sortDir, sortParam, dirParam, rowAttrs = () => '', cls = '' }) => {
    const cell = (v, kind) => {
      if (kind === 'pct') return f.pct(v);
      if (kind === 'n1') return f.n1(v);
      if (kind === 's1') return f.s1(v);
      if (kind === 'int') return f.int(v);
      if (kind === 'line') return f.line(v);
      if (kind === 'odds') return f.odds(v);
      if (kind === 'pill') return U.pill(v);
      if (kind === 'html') return v ?? '—';
      return v === null || v === undefined || v === '' ? '—' : esc(v);
    };
    const numeric = (kind) => ['pct', 'n1', 's1', 'int', 'line', 'odds', 'num'].includes(kind);
    const head = cols.map(([k, label, , kind, info]) => `<th class="${numeric(kind) ? 'num' : ''}"${sortParam ? ` data-sort="${k}" data-sort-param="${sortParam}" data-dir-param="${dirParam}" aria-sort="${sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${label}${info ? U.info(info) : ''}</th>`).join('');
    const body = rows.map((r) => `<tr ${rowAttrs(r)}>${cols.map(([, , get, kind]) => `<td class="${numeric(kind) ? 'num' : ''}">${cell(get(r), kind)}</td>`).join('')}</tr>`).join('');
    return `<div class="tbl ${cls}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  };
  U.sortRows = (rows, cols, key, dir) => {
    const col = cols.find((c) => c[0] === key);
    if (!col) return rows;
    const get = col[2];
    const d = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let x = get(a);
      let y = get(b);
      if (col[5]) { x = col[5](a); y = col[5](b); }
      if (x === y) return 0;
      if (x === null || x === undefined || x === '—') return 1;
      if (y === null || y === undefined || y === '—') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * d;
    });
  };
  // Sort state for tables that are not in the URL (rankings and small tables).
  U.local = {};

  U.csv = (rows, cols) => {
    const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [cols.join(','), ...rows.map((r) => cols.map((c) => q(typeof c === 'function' ? c(r) : r[c])).join(','))].join('\n');
  };
  // When the page is hosted on claude.ai, files go through the viewer's download prompt.
  let downloads = null;
  const downloadsCap = () => {
    if (!downloads) downloads = window.claude && typeof window.claude.use === 'function' ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
    return downloads;
  };
  // Save or copy a CSV. Copy falls back to a selected text box where the clipboard is blocked.
  U.exportCsv = async (text, name, msgEl, mode) => {
    const say = (t) => { if (msgEl) msgEl.textContent = t; };
    const rowsN = text.split('\n').length - 1;
    const showText = () => {
      if (!msgEl) return;
      let ta = msgEl.parentElement.querySelector('textarea.csv-out');
      if (!ta) { ta = document.createElement('textarea'); ta.className = 'csv-out'; ta.readOnly = true; ta.setAttribute('aria-label', 'CSV text'); msgEl.after(ta); }
      ta.value = text;
      ta.focus();
      ta.select();
      say(`Copying was blocked here, so the ${f.int(rowsN)} rows are selected in the box below: press Ctrl+C (⌘C on a Mac) to copy them.`);
    };
    if (mode === 'copy') {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => say(`Copied ${f.int(rowsN)} rows. Paste them into a spreadsheet.`), showText);
      else showText();
      return;
    }
    const cap = await downloadsCap();
    if (cap) {
      try {
        await cap.save({ filename: name, data: text });
        say(`Saved ${f.int(rowsN)} rows as ${name}.`);
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') say('Download cancelled.');
        else if (code === 'rate_limited') say('A download prompt is already open.');
        else say('Downloads are not available in this view. Use Copy CSV instead.');
      }
      return;
    }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      say(`Downloaded ${f.int(rowsN)} rows as ${name}. If no file appeared, this viewer blocks downloads: use Copy CSV.`);
    } catch (e) { say('Downloading was blocked here. Use Copy CSV instead.'); }
  };
})();
