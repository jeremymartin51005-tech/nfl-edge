// Shell: global filter bar, filter chips, tab routing and the page's event handlers.
'use strict';

(() => {
  const NE = window.NE;
  const C = NE.charts;
  const U = NE.ui;
  const f = NE.f;
  const esc = NE.esc;
  const S = NE.S;
  const view = document.getElementById('view');

  const TABS = [
    ['overview', 'Overview'], ['story', 'The story'], ['teams', 'Team analytics'], ['betting', 'Betting trends'],
    ['lab', 'Trend lab'], ['games', 'Game explorer'], ['market', 'Odds & market'], ['data', 'Data explorer'],
  ];
  const ALL_DATA_TABS = new Set(['story']);

  const renderTabs = () => {
    document.getElementById('tabs').innerHTML = TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${S.tab === id}">${label}</button>`).join('');
  };

  const renderFilters = () => {
    const seasons = NE.seasons.map((s) => [s, String(s)]);
    document.getElementById('filters').innerHTML = `
      <div class="ctl"><span>Seasons</span><div class="pair">
        <select data-key="s0" aria-label="First season">${seasons.map(([v, l]) => `<option value="${v}"${v === S.s0 ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <i>to</i>
        <select data-key="s1" aria-label="Last season">${seasons.map(([v, l]) => `<option value="${v}"${v === S.s1 ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div></div>
      <div class="ctl"><span>Dates</span><div class="pair">
        <input type="date" data-key="d0" value="${esc(S.d0)}" min="${NE.firstDate}" max="${NE.lastDate}" aria-label="From date">
        <i>to</i>
        <input type="date" data-key="d1" value="${esc(S.d1)}" min="${NE.firstDate}" max="${NE.lastDate}" aria-label="To date">
      </div></div>
      ${U.seg('phase', [['All', 'All'], ['REG', 'Regular'], ['POST', 'Playoffs']], S.phase, 'Games')}
      ${U.seg('market', [['all', 'All'], ['spread', 'Spread'], ['total', 'Total'], ['ml', 'Moneyline']], S.market, 'Market')}
      ${U.sel('team', U.teamOptions('All teams'), S.team, 'Team')}
      <label class="ctl check"><input type="checkbox" data-key="neutral" ${S.neutral ? 'checked' : ''}><span>Neutral-site games</span></label>
      <button type="button" class="btn ghost reset" data-reset-keys="global" ${NE.filtersAreDefault() ? 'disabled' : ''}>Reset filters</button>`;
  };

  const renderChips = () => {
    const chips = document.getElementById('chips');
    if (ALL_DATA_TABS.has(S.tab)) { chips.innerHTML = '<span class="chip">This tab always uses every season; the filters apply to the other tabs.</span>'; return; }
    const { games } = NE.data();
    const D = NE.DEFAULTS;
    const chip = (label, patch) => `<button type="button" class="chip on" data-go="${U.go(patch)}" aria-label="Remove filter: ${esc(label)}">${esc(label)} <i aria-hidden="true">×</i></button>`;
    const parts = [`<span class="chip strong">${f.int(games.length)} games</span>`, `<span class="chip">${U.rangeText(games)}</span>`];
    if (S.s0 !== D.s0 || S.s1 !== D.s1) parts.push(chip(S.s0 === S.s1 ? `Season ${S.s0}` : `Seasons ${S.s0}–${S.s1}`, { s0: D.s0, s1: D.s1 }));
    if (S.d0 || S.d1) parts.push(chip(`Dates ${S.d0 ? f.date(S.d0) : 'start'} – ${S.d1 ? f.date(S.d1) : 'end'}`, { d0: '', d1: '' }));
    if (S.phase !== 'All') parts.push(chip(S.phase === 'REG' ? 'Regular season' : 'Playoffs', { phase: 'All' }));
    if (S.market !== 'all') parts.push(chip(`${NE.MARKETS[S.market]} market`, { market: 'all' }));
    if (S.team) parts.push(chip(`${S.team} games`, { team: '' }));
    if (!S.neutral) parts.push(chip('No neutral sites', { neutral: true }));
    if (['lab', 'teams'].includes(S.tab) && S.team) parts.push('<span class="chip">The Team filter is ignored on this tab so every team can be compared.</span>');
    chips.innerHTML = parts.join('');
  };

  let lastTab = null;
  let scrollTarget = null;
  const render = () => {
    const active = document.activeElement;
    const focusId = active && active.id;
    const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    C.hide();
    renderTabs();
    renderFilters();
    renderChips();
    (NE.tabs[S.tab] || NE.tabs.overview)(view);
    if (S.tab !== lastTab) { window.scrollTo({ top: 0 }); lastTab = S.tab; }
    if (scrollTarget) {
      const el = document.getElementById(scrollTarget);
      scrollTarget = null;
      if (el) el.scrollIntoView({ block: 'start' });
    }
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus({ preventScroll: true }); if (caret !== null && el.setSelectionRange) { try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text input */ } } }
    }
  };
  NE.render = render;
  NE.listeners.push(render);

  // Apply a patch from a data-go attribute; "_scroll" names an element to bring into view.
  const apply = (patch) => {
    const p = { ...patch };
    const target = p._scroll;
    delete p._scroll;
    if (target) scrollTarget = target;
    if (Object.keys(p).length) NE.set(p);
    else if (target) { const el = document.getElementById(target); scrollTarget = null; if (el) el.scrollIntoView({ block: 'start' }); }
  };

  const RESET_GROUPS = { global: NE.GLOBAL_KEYS, gx: [...NE.GX_KEYS, 'gx_page'], tt: NE.TT_KEYS };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go],[data-tab],[data-reset-keys],[data-sort],[data-game],[data-sim],[data-csv]');
    if (!t) return;
    if (t.dataset.tab) { NE.set({ tab: t.dataset.tab }); return; }
    if (t.dataset.resetKeys) { NE.reset(RESET_GROUPS[t.dataset.resetKeys] || []); return; }
    if (t.dataset.sim) { NE.runSim(Number(t.dataset.sim), view); return; }
    if (t.dataset.csv) {
      const [name, mode] = t.dataset.csv.split('-');
      const src = NE.csvSources[name] && NE.csvSources[name]();
      if (src) U.exportCsv(src.text, src.name, t.closest('.card').querySelector('[data-csv-msg]'), mode === 'copy' ? 'copy' : 'download');
      return;
    }
    if (t.dataset.sort) {
      const key = t.dataset.sort;
      const sp = t.dataset.sortParam;
      const dp = t.dataset.dirParam;
      const patch = { [sp]: key, [dp]: S[sp] === key && S[dp] === 'desc' ? 'asc' : 'desc' };
      if (sp === 'gx_sort') patch.gx_page = 0;
      if (sp === 'dx_sort') patch.dx_page = 0;
      NE.set(patch);
      return;
    }
    if (t.dataset.game) { NE.set({ game: t.dataset.game }); return; }
    if (t.dataset.go) apply(JSON.parse(t.dataset.go));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-go]')) { e.preventDefault(); apply(JSON.parse(e.target.dataset.go)); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.key || el.type === 'search') return;
    const k = el.dataset.key;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (typeof NE.DEFAULTS[k] === 'number') v = Number(v);
    if (el.type === 'number' && v !== '' && Number.isNaN(Number(v))) return;
    if (el.type === 'date' && v && !(el.validity && el.validity.valid)) return;
    const patch = { [k]: v };
    if (k.startsWith('gx_')) patch.gx_page = 0;
    if (k === 'gx_team' && !v) Object.assign(patch, { gx_venue: '', gx_role: '', gx_su: ['team-w', 'team-l'].includes(S.gx_su) ? '' : S.gx_su, gx_ats: ['team-cover', 'team-miss'].includes(S.gx_ats) ? '' : S.gx_ats });
    if (k === 'gx_team' && v) patch.gx_sit = '';
    if (k === 'gx_season' && !v) patch.gx_week = '';
    if (k === 'tt_team') patch.tt_side = v ? 'team' : NE.DEFAULTS.tt_side;
    if (NE.GLOBAL_KEYS.includes(k)) { patch.gx_page = 0; patch.dx_page = 0; }
    NE.set(patch);
  });
  const timers = {};
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type !== 'search' || !el.dataset.key) return;
    const k = el.dataset.key;
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => NE.set({ [k]: el.value, ...(k === 'gx_q' ? { gx_page: 0 } : {}), ...(k === 'dx_q' ? { dx_page: 0 } : {}) }), 250);
  });
  // Definitions on "i" markers: hover or keyboard focus.
  const showInfo = (el) => { const r = el.getBoundingClientRect(); C.note(el.dataset.info, r.left + r.width / 2, r.top); };
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-info]'); if (el) showInfo(el); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('[data-info]')) C.hide(); });
  document.addEventListener('focusin', (e) => { if (e.target.matches('[data-info]')) showInfo(e.target); });
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-info]')) C.hide(); });
  window.addEventListener('scroll', () => C.hide(), { passive: true });
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
