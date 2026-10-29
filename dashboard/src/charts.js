// NFL EDGE charts (d3). Every chart sizes itself from its box, shows a tooltip on hover,
// and takes an optional onClick so clicking a mark can drive the rest of the dashboard.
'use strict';

(() => {
  const NE = window.NE;
  const C = (NE.charts = {});
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  C.col = {
    blue: () => cssVar('--blue'),
    orange: () => cssVar('--orange'),
    teal: () => cssVar('--teal'),
    violet: () => cssVar('--violet'),
    good: () => cssVar('--good'),
    bad: () => cssVar('--bad'),
    muted: () => cssVar('--mark-muted'),
    ref: () => cssVar('--ref'),
    warn: () => cssVar('--warn'),
  };
  C.series = () => [C.col.blue(), C.col.orange(), C.col.teal(), C.col.violet()];
  const ok = (v) => v !== null && v !== undefined && !Number.isNaN(v);

  // ---- tooltip ------------------------------------------------------------------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  const place = (x0, y0) => {
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = x0 + 14;
    let y = y0 - h - 10;
    if (x + w > window.innerWidth - 8) x = x0 - w - 14;
    if (y < 8) y = y0 + 18;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y}px`;
  };
  C.tip = (event, title, lines) => {
    tip.replaceChildren();
    if (title) { const h = document.createElement('div'); h.className = 'tip-h'; h.textContent = title; tip.append(h); }
    for (const ln of lines) {
      const row = document.createElement('div');
      row.className = 'tip-r';
      if (ln.color) { const s = document.createElement('i'); s.style.background = ln.color; row.append(s); }
      const a = document.createElement('span');
      a.textContent = ln.label;
      row.append(a);
      if (ln.value !== undefined) { const b = document.createElement('b'); b.textContent = ln.value; row.append(b); }
      tip.append(row);
    }
    if (lines.hint) { const p = document.createElement('div'); p.className = 'tip-hint'; p.textContent = lines.hint; tip.append(p); }
    tip.hidden = false;
    place(event.clientX, event.clientY);
  };
  // Plain-text explanation (definitions on "i" markers), placed at a point or an element.
  C.note = (text, x, y) => {
    tip.replaceChildren();
    const p = document.createElement('div');
    p.className = 'tip-text';
    p.textContent = text;
    tip.append(p);
    tip.hidden = false;
    place(x, y);
  };
  C.hide = () => { tip.hidden = true; };

  // ---- shared pieces ----------------------------------------------------------------
  const svgFor = (el, H) => {
    el.replaceChildren();
    const W = Math.max(280, Math.floor(el.clientWidth || 600));
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img');
    if (el.dataset.label) svg.attr('aria-label', el.dataset.label);
    return { svg, W, H };
  };
  const measure = (svg, strings, cls = 'tick') => {
    const g = svg.append('g');
    let w = 0;
    for (const s of strings) w = Math.max(w, g.append('text').attr('class', cls).text(s).node().getComputedTextLength());
    g.remove();
    return w;
  };
  // Legend across the top; returns its height.
  const legend = (svg, items, W) => {
    if (items.length < 2) return 0;
    const g = svg.append('g');
    let x = 0;
    let y = 11;
    for (const it of items) {
      const n = g.append('g');
      const wide = it.band || it.line;
      if (it.band) n.append('rect').attr('width', 14).attr('height', 9).attr('y', -8).attr('fill', it.color).attr('opacity', 0.25);
      else if (it.line) n.append('line').attr('x1', 0).attr('x2', 14).attr('y1', -4).attr('y2', -4).attr('stroke', it.color).attr('stroke-width', it.dash ? 1.3 : 2.2).attr('stroke-dasharray', it.dash ? '4 3' : null);
      else n.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('y', -9).attr('fill', it.color);
      const t = n.append('text').attr('x', wide ? 19 : 15).attr('class', 'legend').text(it.label);
      const w = (wide ? 19 : 15) + t.node().getComputedTextLength() + 16;
      if (x + w > W && x > 0) { x = 0; y += 17; }
      n.attr('transform', `translate(${x},${y})`);
      x += w;
    }
    return y + 9;
  };
  const yGrid = (svg, y, fmt, L, R, ticks = 5) => {
    const t = y.ticks(ticks);
    const g = svg.append('g');
    g.selectAll('line').data(t).join('line').attr('class', 'grid').attr('x1', L).attr('x2', R).attr('y1', y).attr('y2', y);
    g.selectAll('text').data(t).join('text').attr('class', 'tick').attr('x', L - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
  };
  const xCats = (svg, cats, pos, yPos, W) => {
    const widest = measure(svg, cats.map(String));
    const every = Math.max(1, Math.ceil((widest + 10) / (W / Math.max(1, cats.length))));
    svg.append('g').selectAll('text').data(cats.filter((_, i) => i % every === 0)).join('text')
      .attr('class', 'tick').attr('x', pos).attr('y', yPos).attr('text-anchor', 'middle').text((d) => d);
  };
  const refLine = (svg, y, v, L, R, label, cls = 'ref') => {
    if (!ok(v)) return;
    svg.append('line').attr('class', cls).attr('x1', L).attr('x2', R).attr('y1', y(v)).attr('y2', y(v));
    if (label) svg.append('text').attr('class', 'ref-t').attr('x', R - 2).attr('y', y(v) - 4).attr('text-anchor', 'end').text(label);
  };
  const axisTitle = (svg, text, x, y, rotate) => {
    if (!text) return;
    const t = svg.append('text').attr('class', 'axis-t').attr('text-anchor', 'middle').text(text);
    if (rotate) t.attr('transform', `translate(${x},${y}) rotate(-90)`); else t.attr('x', x).attr('y', y);
  };
  C.empty = (el, text = 'No games match these filters.') => {
    el.replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    el.append(p);
  };
  const valOf = (kind) => (kind === 'pct' ? NE.f.pct : NE.f.n1);
  const yFormat = (y, kind) => y.tickFormat(5, kind === 'pct' ? '%' : '');

  // ---- line chart, optional 95% band --------------------------------------------------
  // o: { cats, series:[{name,color,values,lo?,hi?,n?,dash?}], kind, ref, refLabel, ref2, ref2Label, xLabel, onClick(i), hint, h }
  C.line = (el, o) => {
    if (!o.cats.length || !o.series.some((s) => s.values.some(ok))) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 270);
    const items = o.series.map((s) => ({ label: s.name, color: s.color, line: true, dash: s.dash }));
    if (o.series.some((s) => s.lo)) items.push({ label: '95% range', color: o.series.find((s) => s.lo).color, band: true });
    if (ok(o.ref2)) items.push({ label: o.ref2Label, color: C.col.warn(), line: true, dash: true });
    const top = legend(svg, items, W) + 12;
    const all = o.series.flatMap((s) => [...s.values, ...(s.lo || []), ...(s.hi || [])]).filter(ok);
    if (ok(o.ref)) all.push(o.ref);
    if (ok(o.ref2)) all.push(o.ref2);
    const [a, b] = d3.extent(all);
    const pad = (b - a) * 0.08 || Math.abs(b) * 0.1 || 1;
    const y = d3.scaleLinear([a - pad, b + pad], [H - 28, top]).nice(5);
    const yf = yFormat(y, o.kind);
    const L = measure(svg, y.ticks(5).map(yf)) + 14;
    const R = W - 10;
    const cats = o.cats.map(String);
    const x = d3.scalePoint(cats, [L + 12, R - 10]);
    yGrid(svg, y, yf, L, R);
    refLine(svg, y, o.ref, L, R, o.refLabel);
    refLine(svg, y, o.ref2, L, R, null, 'ref warn');
    xCats(svg, cats, (d) => x(d), H - 8, W);
    for (const s of o.series) {
      if (!s.lo) continue;
      const area = d3.area().defined((_, i) => ok(s.lo[i]) && ok(s.hi[i])).x((_, i) => x(cats[i])).y0((_, i) => y(s.lo[i])).y1((_, i) => y(s.hi[i]));
      svg.append('path').datum(cats).attr('d', area).attr('fill', s.color).attr('opacity', 0.15);
    }
    for (const s of o.series) {
      const line = d3.line().defined((_, i) => ok(s.values[i])).x((_, i) => x(cats[i])).y((_, i) => y(s.values[i]));
      svg.append('path').datum(cats).attr('d', line).attr('class', 'line').attr('stroke', s.color).attr('stroke-dasharray', s.dash ? '5 4' : null);
      svg.append('g').selectAll('circle').data(cats.map((c, i) => i).filter((i) => ok(s.values[i]))).join('circle')
        .attr('class', 'dot').attr('cx', (i) => x(cats[i])).attr('cy', (i) => y(s.values[i])).attr('r', cats.length > 25 ? 2.5 : 3.6).attr('fill', s.color);
    }
    const step = cats.length > 1 ? x.step() : W - L;
    const rule = svg.append('line').attr('class', 'hover-rule').attr('y1', top).attr('y2', H - 28).attr('opacity', 0);
    const fv = o.fmtV || valOf(o.kind);
    svg.append('g').selectAll('rect').data(cats).join('rect')
      .attr('x', (d) => x(d) - step / 2).attr('width', step).attr('y', top).attr('height', H - 28 - top).attr('fill', 'transparent')
      .attr('class', o.onClick ? 'hit clickable' : 'hit')
      .on('mousemove', (event, d) => {
        const i = cats.indexOf(d);
        rule.attr('x1', x(d)).attr('x2', x(d)).attr('opacity', 1);
        const lines = o.series.map((s) => ({ color: o.series.length > 1 ? s.color : null, label: s.name, value: `${fv(s.values[i])}${s.lo && ok(s.lo[i]) ? `  (${fv(s.lo[i])}–${fv(s.hi[i])})` : ''}` }));
        const n = (o.series.find((s) => s.n) || {}).n;
        if (n) lines.push({ label: 'Games', value: NE.f.int(n[i]) });
        if (o.hint) lines.hint = o.hint;
        C.tip(event, `${o.xLabel ? `${o.xLabel} ` : ''}${d}`, lines);
      })
      .on('mouseleave', () => { rule.attr('opacity', 0); C.hide(); })
      .on('click', (event, d) => { if (o.onClick) { C.hide(); o.onClick(cats.indexOf(d)); } });
  };

  // ---- grouped bars with optional 95% whiskers -------------------------------------------
  // o: { cats, series:[{name,color,colors?,values,lo?,hi?,n?,extra?(i)}], kind, ref, ref2, ref2Label, onClick(ci,si), labels, h, hint, xLabel }
  C.bars = (el, o) => {
    if (!o.cats.length || !o.series.some((s) => s.values.some(ok))) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 270);
    const items = o.series.map((s) => ({ label: s.name, color: s.color }));
    if (ok(o.ref2)) items.push({ label: o.ref2Label, color: C.col.warn(), line: true, dash: true });
    const top = legend(svg, items, W) + 16;
    const all = o.series.flatMap((s) => [...s.values, ...(s.hi || [])]).filter(ok);
    const hi = Math.max(d3.max(all) ?? 0, o.ref ?? 0, o.ref2 ?? 0);
    const lo = Math.min(0, d3.min(o.series.flatMap((s) => s.values).filter(ok)) ?? 0);
    const y = d3.scaleLinear([lo, hi * 1.06 || 1], [H - 28, top]).nice(5);
    const yf = yFormat(y, o.kind);
    const L = measure(svg, y.ticks(5).map(yf)) + 14;
    const R = W - 8;
    const cats = o.cats.map(String);
    const x = d3.scaleBand(cats, [L + 4, R]).paddingInner(0.25).paddingOuter(0.1);
    const inner = d3.scaleBand(o.series.map((_, i) => i), [0, x.bandwidth()]).padding(0.1);
    const bw = Math.min(inner.bandwidth(), 34);
    yGrid(svg, y, yf, L, R);
    xCats(svg, cats, (d) => x(d) + x.bandwidth() / 2, H - 8, W);
    const fv = o.fmtV || valOf(o.kind);
    o.series.forEach((s, si) => {
      const g = svg.append('g');
      const idx = cats.map((_, i) => i).filter((i) => ok(s.values[i]));
      const cx = (i) => x(cats[i]) + inner(si) + inner.bandwidth() / 2;
      g.selectAll('rect').data(idx).join('rect')
        .attr('x', (i) => cx(i) - bw / 2).attr('width', bw)
        .attr('y', (i) => Math.min(y(s.values[i]), y(0))).attr('height', (i) => Math.max(0.5, Math.abs(y(0) - y(s.values[i]))))
        .attr('rx', 3).attr('fill', (i) => (s.colors ? s.colors[i] : s.color)).attr('class', o.onClick ? 'clickable' : null)
        .on('mousemove', (event, i) => {
          const lines = [{ color: o.series.length > 1 ? s.color : null, label: s.name, value: fv(s.values[i]) }];
          if (s.lo && ok(s.lo[i])) lines.push({ label: '95% range', value: `${fv(s.lo[i])}–${fv(s.hi[i])}` });
          if (s.n) lines.push({ label: 'Games', value: NE.f.int(s.n[i]) });
          for (const e of s.extra ? s.extra(i) : []) lines.push(e);
          if (o.hint) lines.hint = o.hint;
          C.tip(event, `${o.xLabel ? `${o.xLabel} ` : ''}${cats[i]}`, lines);
        })
        .on('mouseleave', C.hide)
        .on('click', (event, i) => { if (o.onClick) { C.hide(); o.onClick(i, si); } });
      if (s.lo) {
        const w = g.append('g').attr('class', 'whisker');
        for (const i of idx) {
          if (!ok(s.lo[i])) continue;
          w.append('line').attr('x1', cx(i)).attr('x2', cx(i)).attr('y1', y(s.lo[i])).attr('y2', y(s.hi[i]));
          w.append('line').attr('x1', cx(i) - 4).attr('x2', cx(i) + 4).attr('y1', y(s.lo[i])).attr('y2', y(s.lo[i]));
          w.append('line').attr('x1', cx(i) - 4).attr('x2', cx(i) + 4).attr('y1', y(s.hi[i])).attr('y2', y(s.hi[i]));
        }
      }
      if (o.labels !== false && cats.length * o.series.length <= 14 && bw >= 18 && !s.lo) {
        g.selectAll('text').data(idx).join('text').attr('class', 'bar-label').attr('x', cx).attr('y', (i) => y(Math.max(0, s.values[i])) - 5)
          .attr('text-anchor', 'middle').text((i) => (o.kind === 'pct' ? d3.format('.0%')(s.values[i]) : d3.format('.1f')(s.values[i])));
      }
    });
    refLine(svg, y, o.ref, L, R, o.refLabel);
    refLine(svg, y, o.ref2, L, R, null, 'ref warn');
  };

  // ---- 100% stacked outcomes -----------------------------------------------------------
  // o: { cats, parts:[{name,color,values}], onClick(i), xLabel, h, hint }
  C.stack = (el, o) => {
    if (!o.cats.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 270);
    const top = legend(svg, o.parts.map((p) => ({ label: p.name, color: p.color })), W) + 12;
    const y = d3.scaleLinear([0, 1], [H - 28, top]);
    const L = measure(svg, ['100%']) + 14;
    const R = W - 8;
    const cats = o.cats.map(String);
    const x = d3.scaleBand(cats, [L + 4, R]).paddingInner(0.28).paddingOuter(0.1);
    const bw = Math.min(x.bandwidth(), 42);
    yGrid(svg, y, d3.format('.0%'), L, R);
    xCats(svg, cats, (d) => x(d) + x.bandwidth() / 2, H - 8, W);
    cats.forEach((c, i) => {
      const tot = d3.sum(o.parts, (p) => p.values[i]) || 1;
      let acc = 0;
      for (const p of o.parts) {
        const v = p.values[i] / tot;
        svg.append('rect').attr('x', x(c) + (x.bandwidth() - bw) / 2).attr('width', bw).attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v) - (v > 0 ? 1.5 : 0)))
          .attr('fill', p.color).attr('class', o.onClick ? 'clickable' : null)
          .on('mousemove', (event) => {
            const lines = o.parts.map((q) => ({ color: q.color, label: q.name, value: `${q.values[i]} (${d3.format('.0%')(q.values[i] / tot)})` }));
            if (o.hint) lines.hint = o.hint;
            C.tip(event, `${o.xLabel ? `${o.xLabel} ` : ''}${c}`, lines);
          })
          .on('mouseleave', C.hide)
          .on('click', () => { if (o.onClick) { C.hide(); o.onClick(i); } });
        acc += v;
      }
    });
    refLine(svg, y, 0.5, L, R);
  };

  // ---- histogram over numeric values ---------------------------------------------------
  // o: { values, step, highlight:[...], xLabel, color, colorOf(v), vline, h, onClick(value), hint }
  C.hist = (el, o) => {
    const vals = o.values.filter(ok);
    if (!vals.length) return C.empty(el);
    const step = o.step || 1;
    const counts = d3.rollups(vals, (v) => v.length, (v) => Math.floor(v / step) * step).sort((a, b) => a[0] - b[0]);
    const { svg, W, H } = svgFor(el, o.h || 240);
    const ymax = d3.max(counts, (c) => c[1]);
    const y = d3.scaleLinear([0, ymax * 1.08], [H - 40, 10]).nice(5);
    const L = measure(svg, y.ticks(5).map(d3.format('~f'))) + 14;
    const R = W - 8;
    const [a, b] = d3.extent(counts, (c) => c[0]);
    // Whole-number values sit on their tick; wider bins are centered on the bin.
    const discrete = step <= 1;
    const mid = (v) => (discrete ? v : v + step / 2);
    const x = d3.scaleLinear(discrete ? [a - step, b + step] : [a, b + step], [L + 4, R]);
    const bw = Math.max(1.2, x(a + step) - x(a) - 1.5);
    yGrid(svg, y, d3.format('~f'), L, R);
    svg.append('g').selectAll('text').data(x.ticks(Math.min(12, Math.floor(W / 64)))).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 24).attr('text-anchor', 'middle').text(d3.format('~f'));
    axisTitle(svg, o.xLabel, (L + R) / 2, H - 4);
    const hl = new Set(o.highlight || []);
    const fill = (c) => (o.colorOf ? o.colorOf(c[0]) : hl.has(c[0]) ? C.col.orange() : o.color || C.col.blue());
    svg.append('g').selectAll('rect').data(counts).join('rect')
      .attr('x', (c) => x(mid(c[0])) - bw / 2).attr('width', bw).attr('y', (c) => y(c[1])).attr('height', (c) => y(0) - y(c[1]))
      .attr('rx', Math.min(2, bw / 2)).attr('fill', fill).attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, c) => {
        const lines = [{ label: 'Games', value: NE.f.int(c[1]) }, { label: 'Share', value: d3.format('.1%')(c[1] / vals.length) }];
        if (o.hint) lines.hint = o.hint;
        const label = step === 1 || step === 0.5 ? d3.format('~f')(c[0]) : `${d3.format('~f')(c[0])} to ${d3.format('~f')(c[0] + step)}`;
        C.tip(event, `${o.xLabel}: ${label}`, lines);
      })
      .on('mouseleave', C.hide)
      .on('click', (event, c) => { if (o.onClick) { C.hide(); o.onClick(c[0]); } });
    if (ok(o.vline)) svg.append('line').attr('class', 'ref').attr('x1', x(o.vline)).attr('x2', x(o.vline)).attr('y1', 10).attr('y2', H - 40);
  };

  // ---- scatter --------------------------------------------------------------------------
  // o: { points:[{x,y,group,label,id,lines?}], groups:[{key,name,color}], xLabel, yLabel, diag, diagLabel, zero, fit, hline, vline, onClick(p), clickHint, h, xFmt, yFmt }
  C.scatter = (el, o) => {
    if (!o.points.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 340);
    const counts = d3.rollup(o.points, (v) => v.length, (p) => p.group);
    const items = o.groups.map((g) => ({ label: `${g.name} (${NE.f.int(counts.get(g.key) || 0)})`, color: g.color }));
    if (o.fit) items.push({ label: o.fitLabel || 'Trend line', color: C.col.ref(), line: true });
    if (o.diag) items.push({ label: o.diagLabel || 'Line = result', color: C.col.ref(), line: true, dash: true });
    const top = legend(svg, items, W) + 10;
    const xd = o.xDomain || d3.extent(o.points, (p) => p.x);
    const yd = o.yDomain || d3.extent(o.points, (p) => p.y);
    const y = d3.scaleLinear(yd, [H - 42, top]).nice();
    const yFmt = o.yFmt || d3.format('~f');
    const xFmt = o.xFmt || d3.format('~f');
    const L = measure(svg, y.ticks(6).map(yFmt)) + 30;
    const R = W - 10;
    const x = d3.scaleLinear(xd, [L, R]).nice();
    yGrid(svg, y, yFmt, L, R, 6);
    svg.append('g').selectAll('text').data(x.ticks(Math.min(10, Math.floor(W / 70)))).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 24).attr('text-anchor', 'middle').text(xFmt);
    axisTitle(svg, o.xLabel, (L + R) / 2, H - 4);
    axisTitle(svg, o.yLabel, 11, (top + H - 42) / 2, true);
    if (o.zero) {
      svg.append('line').attr('class', 'axis').attr('x1', x(0)).attr('x2', x(0)).attr('y1', top).attr('y2', H - 42);
      svg.append('line').attr('class', 'axis').attr('x1', L).attr('x2', R).attr('y1', y(0)).attr('y2', y(0));
    }
    if (ok(o.hline)) svg.append('line').attr('class', 'ref').attr('x1', L).attr('x2', R).attr('y1', y(o.hline)).attr('y2', y(o.hline));
    if (ok(o.vline)) svg.append('line').attr('class', 'ref').attr('x1', x(o.vline)).attr('x2', x(o.vline)).attr('y1', top).attr('y2', H - 42);
    if (o.diag) {
      const d0 = Math.max(x.domain()[0], y.domain()[0]);
      const d1 = Math.min(x.domain()[1], y.domain()[1]);
      if (d1 > d0) svg.append('line').attr('class', 'ref').attr('x1', x(d0)).attr('y1', y(d0)).attr('x2', x(d1)).attr('y2', y(d1));
    }
    const colorOf = new Map(o.groups.map((g) => [g.key, g.color]));
    const many = o.points.length > 400;
    svg.append('g').selectAll('circle').data(o.points).join('circle')
      .attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', many ? 3 : 5)
      .attr('fill', (p) => colorOf.get(p.group) || C.col.muted()).attr('fill-opacity', many ? 0.55 : 0.85)
      .attr('stroke', 'var(--panel)').attr('stroke-width', many ? 0.5 : 1)
      .attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, p) => {
        const lines = [{ label: o.xLabel, value: xFmt(p.x) }, { label: o.yLabel, value: yFmt(p.y) }, ...(p.lines || [])];
        if (o.onClick) lines.hint = o.clickHint || 'Click for details';
        C.tip(event, p.label, lines);
      })
      .on('mouseleave', C.hide)
      .on('click', (event, p) => { if (o.onClick) { C.hide(); o.onClick(p); } });
    if (o.fit && o.points.length > 2) {
      const fit = NE.slope(o.points.map((p) => p.x), o.points.map((p) => p.y));
      if (fit) {
        const [a, b] = x.domain();
        const ya = Math.max(y.domain()[0], Math.min(y.domain()[1], fit.intercept + fit.slope * a));
        const yb = Math.max(y.domain()[0], Math.min(y.domain()[1], fit.intercept + fit.slope * b));
        const xa = fit.slope ? (ya - fit.intercept) / fit.slope : a;
        const xb = fit.slope ? (yb - fit.intercept) / fit.slope : b;
        svg.append('line').attr('class', 'fit').attr('x1', x(xa)).attr('x2', x(xb)).attr('y1', y(ya)).attr('y2', y(yb));
      }
    }
  };

  // ---- horizontal bars around a center, with 95% whiskers (team rankings) ------------------
  // o: { rows:[{label,value,lo?,hi?,lines?}], center, kind, noise, onClick(label), selected, valueLabel }
  C.hbars = (el, o) => {
    if (!o.rows.length) return C.empty(el);
    const rowH = 19;
    const top = 6;
    const H = top + o.rows.length * rowH + 30;
    const { svg, W } = svgFor(el, H);
    const pct = o.kind === 'pct';
    const fmt = pct ? d3.format('.0%') : d3.format('+.1f');
    const ext = d3.extent([...o.rows.flatMap((r) => [ok(r.lo) ? r.lo : r.value, ok(r.hi) ? r.hi : r.value]), o.center]);
    const span = Math.max(o.center - ext[0], ext[1] - o.center) * 1.05 || 0.1;
    const L = measure(svg, o.rows.map((r) => r.label)) + 12;
    const R = W - 10;
    const x = d3.scaleLinear([o.center - span, o.center + span], [L, R]);
    const y = d3.scaleBand(o.rows.map((r) => r.label), [top, top + o.rows.length * rowH]).padding(0.24);
    const ticks = x.ticks(6);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('x1', x).attr('x2', x).attr('y1', top).attr('y2', H - 26);
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 9).attr('text-anchor', 'middle').text(fmt);
    svg.append('g').selectAll('text').data(o.rows).join('text').attr('class', (r) => (r.label === o.selected ? 'tick sel' : 'tick'))
      .attr('x', L - 8).attr('y', (r) => y(r.label) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => r.label);
    const good = C.col.good();
    const bad = C.col.bad();
    const muted = C.col.muted();
    const fill = (r) => {
      const clear = ok(r.lo) && (r.lo > o.center || r.hi < o.center);
      if (o.noise && !clear) return muted;
      return r.value >= o.center ? good : bad;
    };
    svg.append('g').selectAll('rect').data(o.rows).join('rect')
      .attr('x', (r) => Math.min(x(r.value), x(o.center))).attr('width', (r) => Math.max(1, Math.abs(x(r.value) - x(o.center))))
      .attr('y', (r) => y(r.label)).attr('height', y.bandwidth()).attr('rx', 2).attr('fill', fill)
      .attr('stroke', (r) => (r.label === o.selected ? 'var(--text)' : null)).attr('stroke-width', 1.5)
      .attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, r) => {
        const lines = [{ label: o.valueLabel || 'Value', value: pct ? NE.f.pct(r.value) : NE.f.s1(r.value) }];
        if (ok(r.lo)) lines.push({ label: '95% range', value: pct ? `${NE.f.pct(r.lo)}–${NE.f.pct(r.hi)}` : `${NE.f.s1(r.lo)} to ${NE.f.s1(r.hi)}` });
        for (const ln of r.lines || []) lines.push(ln);
        if (o.onClick) lines.hint = o.hint || 'Click to open this team';
        C.tip(event, r.label, lines);
      })
      .on('mouseleave', C.hide)
      .on('click', (event, r) => { if (o.onClick) { C.hide(); o.onClick(r.label); } });
    if (o.rows.some((r) => ok(r.lo))) {
      const w = svg.append('g').attr('class', 'whisker');
      for (const r of o.rows) {
        if (!ok(r.lo)) continue;
        const cy = y(r.label) + y.bandwidth() / 2;
        w.append('line').attr('x1', x(r.lo)).attr('x2', x(r.hi)).attr('y1', cy).attr('y2', cy);
      }
    }
    svg.append('line').attr('class', 'ref').attr('x1', x(o.center)).attr('x2', x(o.center)).attr('y1', top - 4).attr('y2', H - 26);
  };

  // ---- funnel plot: rate against sample size, with the band a fair coin would give -----------
  // o: { points:[{label,n,p}], p0, yLabel, onClick(label), selected, h }
  C.funnel = (el, o) => {
    if (!o.points.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 380);
    const top = legend(svg, [
      { label: 'Inside the chance band', color: C.col.muted() },
      { label: 'Outside it, above', color: C.col.good() },
      { label: 'Outside it, below', color: C.col.bad() },
      { label: '95% band for a fair coin', color: C.col.blue(), band: true },
    ], W) + 10;
    const nMax = d3.max(o.points, (p) => p.n) * 1.05;
    const nMin = Math.max(4, d3.min(o.points, (p) => p.n) * 0.8);
    const band = (n) => 1.96 * Math.sqrt((o.p0 * (1 - o.p0)) / n);
    const yVals = [...o.points.map((p) => p.p), o.p0 + band(nMin), o.p0 - band(nMin)];
    const y = d3.scaleLinear([Math.max(0, d3.min(yVals) - 0.02), Math.min(1, d3.max(yVals) + 0.02)], [H - 42, top]).nice();
    const L = measure(svg, y.ticks(6).map(d3.format('.0%'))) + 30;
    const R = W - 12;
    const x = d3.scaleLinear([nMin, nMax], [L, R]);
    yGrid(svg, y, d3.format('.0%'), L, R, 6);
    svg.append('g').selectAll('text').data(x.ticks(8)).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 24).attr('text-anchor', 'middle').text(d3.format('~f'));
    axisTitle(svg, 'Graded games (sample size)', (L + R) / 2, H - 4);
    axisTitle(svg, o.yLabel, 11, (top + H - 42) / 2, true);
    const ns = d3.range(nMin, nMax, (nMax - nMin) / 80).concat([nMax]);
    svg.append('path').datum(ns).attr('fill', C.col.blue()).attr('opacity', 0.14)
      .attr('d', d3.area().x(x).y0((n) => y(Math.max(0, o.p0 - band(n)))).y1((n) => y(Math.min(1, o.p0 + band(n)))));
    svg.append('line').attr('class', 'ref').attr('x1', L).attr('x2', R).attr('y1', y(o.p0)).attr('y2', y(o.p0));
    const color = (p) => (p.p > o.p0 + band(p.n) ? C.col.good() : p.p < o.p0 - band(p.n) ? C.col.bad() : C.col.muted());
    const g = svg.append('g');
    g.selectAll('circle').data(o.points).join('circle')
      .attr('cx', (p) => x(p.n)).attr('cy', (p) => y(p.p)).attr('r', (p) => (p.label === o.selected ? 7 : 5.5))
      .attr('fill', color).attr('stroke', (p) => (p.label === o.selected ? 'var(--text)' : 'var(--panel)')).attr('stroke-width', 1.5)
      .attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, p) => {
        const inside = Math.abs(p.p - o.p0) <= band(p.n);
        const lines = [{ label: o.yLabel, value: NE.f.pct(p.p) }, { label: 'Graded games', value: NE.f.int(p.n) }, { label: 'Chance band', value: `${NE.f.pct(Math.max(0, o.p0 - band(p.n)))}–${NE.f.pct(Math.min(1, o.p0 + band(p.n)))}` }, { label: 'Verdict', value: inside ? 'Could be chance' : 'Unlikely to be chance alone' }];
        if (o.onClick) lines.hint = 'Click to open this team';
        C.tip(event, p.label, lines);
      })
      .on('mouseleave', C.hide)
      .on('click', (event, p) => { if (o.onClick) { C.hide(); o.onClick(p.label); } });
    g.selectAll('text').data(o.points.filter((p) => Math.abs(p.p - o.p0) > band(p.n) || p.label === o.selected)).join('text')
      .attr('class', 'pt-label').attr('x', (p) => x(p.n) + 8).attr('y', (p) => y(p.p)).attr('dy', '0.32em').text((p) => p.label);
  };

  // ---- box plot per group -----------------------------------------------------------------
  // o: { groups:[{label, values}], yLabel, onClick(label), h }
  C.box = (el, o) => {
    const groups = o.groups.filter((g) => g.values.length);
    if (!groups.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 280);
    const all = groups.flatMap((g) => g.values);
    const y = d3.scaleLinear(d3.extent(all), [H - 28, 12]).nice();
    const L = measure(svg, y.ticks(6).map(d3.format('~f'))) + 30;
    const R = W - 8;
    const x = d3.scaleBand(groups.map((g) => String(g.label)), [L, R]).padding(0.35);
    yGrid(svg, y, d3.format('~f'), L, R, 6);
    axisTitle(svg, o.yLabel, 11, (12 + H - 28) / 2, true);
    xCats(svg, groups.map((g) => String(g.label)), (d) => x(d) + x.bandwidth() / 2, H - 8, W);
    const blue = C.col.blue();
    for (const gp of groups) {
      const v = gp.values.slice().sort((a, b) => a - b);
      const q1 = d3.quantileSorted(v, 0.25);
      const q2 = d3.quantileSorted(v, 0.5);
      const q3 = d3.quantileSorted(v, 0.75);
      const iqr = q3 - q1;
      const lo = d3.min(v.filter((d) => d >= q1 - 1.5 * iqr));
      const hi = d3.max(v.filter((d) => d <= q3 + 1.5 * iqr));
      const cx = x(String(gp.label)) + x.bandwidth() / 2;
      const bw = Math.min(x.bandwidth(), 46);
      const g = svg.append('g').attr('class', o.onClick ? 'clickable' : null);
      g.append('line').attr('class', 'box-w').attr('x1', cx).attr('x2', cx).attr('y1', y(lo)).attr('y2', y(hi));
      g.append('line').attr('class', 'box-w').attr('x1', cx - bw / 4).attr('x2', cx + bw / 4).attr('y1', y(lo)).attr('y2', y(lo));
      g.append('line').attr('class', 'box-w').attr('x1', cx - bw / 4).attr('x2', cx + bw / 4).attr('y1', y(hi)).attr('y2', y(hi));
      g.append('rect').attr('x', cx - bw / 2).attr('width', bw).attr('y', y(q3)).attr('height', Math.max(1, y(q1) - y(q3))).attr('rx', 3).attr('fill', blue).attr('fill-opacity', 0.28).attr('stroke', blue);
      g.append('line').attr('class', 'box-m').attr('x1', cx - bw / 2).attr('x2', cx + bw / 2).attr('y1', y(q2)).attr('y2', y(q2));
      g.selectAll('circle').data(v.filter((d) => d < lo || d > hi)).join('circle').attr('cx', cx).attr('cy', y).attr('r', 2.2).attr('fill', C.col.muted());
      g.append('rect').attr('x', cx - x.bandwidth() / 2).attr('width', x.bandwidth()).attr('y', 12).attr('height', H - 40).attr('fill', 'transparent')
        .on('mousemove', (event) => {
          const lines = [{ label: 'Median', value: d3.format('.1f')(q2) }, { label: 'Middle half', value: `${d3.format('~f')(q1)}–${d3.format('~f')(q3)}` }, { label: 'Range', value: `${d3.format('~f')(v[0])}–${d3.format('~f')(v[v.length - 1])}` }, { label: 'Std. deviation', value: d3.format('.1f')(d3.deviation(v) || 0) }, { label: 'Games', value: NE.f.int(v.length) }];
          if (o.onClick) lines.hint = o.hint || 'Click to focus this season';
          C.tip(event, String(gp.label), lines);
        })
        .on('mouseleave', C.hide)
        .on('click', () => { if (o.onClick) { C.hide(); o.onClick(gp.label); } });
    }
  };

  // ---- heatmap (season x week) ---------------------------------------------------------------
  // o: { rows, cols, cell(r,c)->{value,n}|null, kind, center?, label, colLabel, onClick(r,c) }
  C.heat = (el, o) => {
    if (!o.rows.length) return C.empty(el);
    const cellH = 26;
    const H = 30 + o.rows.length * cellH + 30;
    const { svg, W } = svgFor(el, H);
    const L = measure(svg, o.rows.map(String)) + 12;
    const R = W - 8;
    const x = d3.scaleBand(o.cols.map(String), [L, R]).padding(0.06);
    const y = d3.scaleBand(o.rows.map(String), [24, 24 + o.rows.length * cellH]).padding(0.08);
    const cells = [];
    for (const r of o.rows) for (const c of o.cols) { const v = o.cell(r, c); if (v && ok(v.value)) cells.push({ r, c, ...v }); }
    if (!cells.length) return C.empty(el);
    const ext = d3.extent(cells, (d) => d.value);
    let color;
    if (ok(o.center)) {
      const m = Math.max(Math.abs(ext[0] - o.center), Math.abs(ext[1] - o.center)) || 1;
      color = d3.scaleLinear([o.center - m, o.center, o.center + m], [C.col.orange(), cssVar('--heat-mid'), C.col.blue()]).clamp(true);
    } else {
      color = d3.scaleLinear(ext, [cssVar('--heat-lo'), C.col.blue()]);
    }
    svg.append('g').selectAll('text').data(o.cols.filter((_, i) => i % (x.bandwidth() < 18 ? 2 : 1) === 0)).join('text').attr('class', 'tick').attr('x', (c) => x(String(c)) + x.bandwidth() / 2).attr('y', 14).attr('text-anchor', 'middle').text((c) => c);
    svg.append('g').selectAll('text').data(o.rows).join('text').attr('class', 'tick').attr('x', L - 8).attr('y', (r) => y(String(r)) + y.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => r);
    const fv = valOf(o.kind);
    svg.append('g').selectAll('rect').data(cells).join('rect')
      .attr('x', (d) => x(String(d.c))).attr('y', (d) => y(String(d.r))).attr('width', x.bandwidth()).attr('height', y.bandwidth()).attr('rx', 2)
      .attr('fill', (d) => color(d.value)).attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, d) => {
        const lines = [{ label: o.label, value: fv(d.value) }, { label: 'Games', value: NE.f.int(d.n) }];
        if (o.onClick) lines.hint = 'Click to list these games';
        C.tip(event, `${d.r} · ${o.colLabel} ${d.c}`, lines);
      })
      .on('mouseleave', C.hide)
      .on('click', (event, d) => { if (o.onClick) { C.hide(); o.onClick(d.r, d.c); } });
    const kx = L;
    const ky = H - 12;
    const kw = Math.min(200, R - L - 80);
    const grad = `heat-${Math.random().toString(36).slice(2, 8)}`;
    const lg = svg.append('defs').append('linearGradient').attr('id', grad);
    const dom = color.domain();
    dom.forEach((s, i) => lg.append('stop').attr('offset', `${(i / (dom.length - 1)) * 100}%`).attr('stop-color', color(s)));
    svg.append('text').attr('class', 'tick').attr('x', kx).attr('y', ky).text(fv(dom[0]));
    const tx = kx + measure(svg, [fv(dom[0])]) + 8;
    svg.append('rect').attr('x', tx).attr('y', ky - 8).attr('width', kw).attr('height', 8).attr('rx', 2).attr('fill', `url(#${grad})`);
    svg.append('text').attr('class', 'tick').attr('x', tx + kw + 8).attr('y', ky).text(fv(dom[dom.length - 1]));
  };

  // ---- strip of dots per group (coin-flip simulator) -------------------------------------------
  // o: { groups:[{name,color,points:[{v,label}]}], center, valueLabel }
  C.strip = (el, o) => {
    const H = 40 + o.groups.length * 64 + 30;
    const { svg, W } = svgFor(el, H);
    const all = o.groups.flatMap((g) => g.points.map((p) => p.v));
    if (!all.length) return C.empty(el);
    const m = Math.max(0.12, d3.max(all, (v) => Math.abs(v - o.center)) * 1.1);
    const L = measure(svg, o.groups.map((g) => g.name)) + 16;
    const R = W - 12;
    const x = d3.scaleLinear([o.center - m, o.center + m], [L, R]);
    const ticks = x.ticks(8);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('x1', x).attr('x2', x).attr('y1', 20).attr('y2', H - 26);
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 9).attr('text-anchor', 'middle').text(d3.format('.0%'));
    svg.append('line').attr('class', 'ref').attr('x1', x(o.center)).attr('x2', x(o.center)).attr('y1', 16).attr('y2', H - 26);
    o.groups.forEach((gp, gi) => {
      const cy = 50 + gi * 64;
      svg.append('text').attr('class', 'tick').attr('x', L - 10).attr('y', cy).attr('dy', '0.32em').attr('text-anchor', 'end').text(gp.name);
      const placed = [];
      const pts = gp.points.slice().sort((a, b) => a.v - b.v).map((p) => {
        const px = x(p.v);
        let dy = 0;
        for (let k = 0; k < 12; k += 1) {
          dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 7;
          if (!placed.some((q) => Math.abs(q.px - px) < 7 && Math.abs(q.dy - dy) < 7)) break;
        }
        placed.push({ px, dy });
        return { ...p, px, cy: cy + dy };
      });
      svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => p.px).attr('cy', (p) => p.cy).attr('r', 3.6)
        .attr('fill', gp.color).attr('fill-opacity', 0.85)
        .on('mousemove', (event, p) => C.tip(event, p.label, [{ label: o.valueLabel, value: NE.f.pct(p.v) }]))
        .on('mouseleave', C.hide);
      const sd = d3.deviation(gp.points, (p) => p.v);
      svg.append('text').attr('class', 'strip-sd').attr('x', R).attr('y', cy - 26).attr('text-anchor', 'end').text(`spread (std. dev.) ${d3.format('.1f')((sd || 0) * 100)} pts`);
    });
  };

  // ---- calibration: price vs result --------------------------------------------------------------
  // rows: [{bucket, imp, won, lo, hi, n}]
  C.calib = (el, rows) => {
    if (!rows.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, 310);
    const top = legend(svg, [{ label: 'Favorites, grouped by price', color: C.col.blue() }, { label: 'Price matched the result', color: C.col.ref(), line: true, dash: true }], W) + 10;
    const y = d3.scaleLinear([0.35, 1], [H - 42, top]);
    const L = measure(svg, ['100%']) + 30;
    const R = W - 12;
    const x = d3.scaleLinear([0.5, 1], [L, R]);
    yGrid(svg, y, d3.format('.0%'), L, R);
    svg.append('g').selectAll('text').data(x.ticks(5)).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 24).attr('text-anchor', 'middle').text(d3.format('.0%'));
    axisTitle(svg, 'No-vig implied win chance', (L + R) / 2, H - 4);
    axisTitle(svg, 'Actual win %', 11, (top + H - 42) / 2, true);
    svg.append('line').attr('class', 'ref').attr('x1', x(0.5)).attr('y1', y(0.5)).attr('x2', x(1)).attr('y2', y(1));
    const w = svg.append('g').attr('class', 'whisker');
    for (const r of rows) w.append('line').attr('x1', x(r.imp)).attr('x2', x(r.imp)).attr('y1', y(Math.max(0.35, r.lo))).attr('y2', y(Math.min(1, r.hi)));
    svg.append('path').datum(rows).attr('class', 'line').attr('stroke', C.col.blue()).attr('d', d3.line().x((r) => x(r.imp)).y((r) => y(r.won)));
    const rs = d3.scaleSqrt([0, d3.max(rows, (r) => r.n)], [3, 11]);
    svg.append('g').selectAll('circle').data(rows).join('circle').attr('class', 'dot').attr('cx', (r) => x(r.imp)).attr('cy', (r) => y(r.won)).attr('r', (r) => rs(r.n)).attr('fill', C.col.blue())
      .on('mousemove', (event, r) => C.tip(event, `Implied ${r.bucket}`, [{ label: 'Avg implied', value: NE.f.pct(r.imp) }, { label: 'Actual win %', value: NE.f.pct(r.won) }, { label: '95% range', value: `${NE.f.pct(r.lo)}–${NE.f.pct(r.hi)}` }, { label: 'Games', value: NE.f.int(r.n) }]))
      .on('mouseleave', C.hide);
  };

  // ---- per-game bars (team game log) -------------------------------------------------------------
  // o: { rows:[{label,value,color,id,lines}], onClick(id), yLabel, h }
  C.gameBars = (el, o) => {
    if (!o.rows.length) return C.empty(el);
    const { svg, W, H } = svgFor(el, o.h || 230);
    const ext = d3.extent(o.rows, (r) => r.value);
    const m = Math.max(Math.abs(ext[0]), Math.abs(ext[1])) || 1;
    const y = d3.scaleLinear([-m, m], [H - 16, 10]).nice();
    const L = measure(svg, y.ticks(5).map(d3.format('+~f'))) + 30;
    const R = W - 8;
    const x = d3.scaleBand(o.rows.map((_, i) => i), [L, R]).padding(0.15);
    yGrid(svg, y, d3.format('+~f'), L, R);
    axisTitle(svg, o.yLabel, 11, H / 2, true);
    svg.append('line').attr('class', 'axis').attr('x1', L).attr('x2', R).attr('y1', y(0)).attr('y2', y(0));
    svg.append('g').selectAll('rect').data(o.rows).join('rect')
      .attr('x', (_, i) => x(i)).attr('width', x.bandwidth()).attr('y', (r) => Math.min(y(r.value), y(0))).attr('height', (r) => Math.max(1, Math.abs(y(r.value) - y(0))))
      .attr('rx', Math.min(2, x.bandwidth() / 2)).attr('fill', (r) => r.color).attr('class', o.onClick ? 'clickable' : null)
      .on('mousemove', (event, r) => { const lines = [...(r.lines || [])]; if (o.onClick) lines.hint = 'Click to open this game'; C.tip(event, r.label, lines); })
      .on('mouseleave', C.hide)
      .on('click', (event, r) => { if (o.onClick) { C.hide(); o.onClick(r.id); } });
  };

  // ---- one rate with its 95% range against its baselines (trend lab) ---------------------------
  // o: { rate, lo, hi, base, baseLabel, breakeven? }
  C.ciStrip = (el, o) => {
    if (!ok(o.rate)) return C.empty(el, 'No games match this situation.');
    const { svg, W, H } = svgFor(el, 92);
    const vals = [o.lo, o.hi, o.base, o.breakeven].filter(ok);
    const lo = Math.max(0, Math.min(0.3, d3.min(vals) - 0.04));
    const hi = Math.min(1, Math.max(0.7, d3.max(vals) + 0.04));
    const x = d3.scaleLinear([lo, hi], [16, W - 16]);
    const cy = 46;
    svg.append('g').selectAll('text').data(x.ticks(8)).join('text').attr('class', 'tick').attr('x', x).attr('y', H - 4).attr('text-anchor', 'middle').text(d3.format('.0%'));
    svg.append('line').attr('class', 'axis').attr('x1', 16).attr('x2', W - 16).attr('y1', cy).attr('y2', cy);
    const ref = (v, label, cls, dy) => {
      if (!ok(v)) return;
      svg.append('line').attr('class', cls).attr('x1', x(v)).attr('x2', x(v)).attr('y1', 14).attr('y2', cy + 18);
      svg.append('text').attr('class', 'ref-t').attr('x', x(v)).attr('y', dy).attr('text-anchor', 'middle').text(label);
    };
    ref(o.base, o.baseLabel, 'ref', 10);
    if (ok(o.breakeven) && Math.abs(x(o.breakeven) - x(o.base)) > 4) ref(o.breakeven, `break-even ${d3.format('.1%')(o.breakeven)}`, 'ref warn', H - 20);
    const color = o.lo > o.base ? C.col.good() : o.hi < o.base ? C.col.bad() : C.col.blue();
    svg.append('rect').attr('x', x(o.lo)).attr('width', Math.max(2, x(o.hi) - x(o.lo))).attr('y', cy - 7).attr('height', 14).attr('rx', 7).attr('fill', color).attr('opacity', 0.3);
    svg.append('circle').attr('cx', x(o.rate)).attr('cy', cy).attr('r', 7).attr('fill', color).attr('stroke', 'var(--panel)').attr('stroke-width', 2);
    svg.append('text').attr('class', 'pt-label').attr('x', x(o.rate)).attr('y', cy - 13).attr('text-anchor', 'middle').text(d3.format('.1%')(o.rate));
  };

  // ---- sparkline for KPI tiles --------------------------------------------------------------------
  C.spark = (el, values, color) => {
    el.replaceChildren();
    const v = values.filter(ok);
    if (v.length < 2) return;
    const W = 120;
    const H = 26;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('preserveAspectRatio', 'none').attr('aria-hidden', 'true');
    const x = d3.scaleLinear([0, values.length - 1], [2, W - 2]);
    const y = d3.scaleLinear(d3.extent(v), [H - 3, 3]);
    svg.append('path').attr('d', d3.line().defined(ok).x((_, i) => x(i)).y((d) => y(d))(values)).attr('class', 'spark').attr('stroke', color || C.col.blue());
    const last = values.length - 1;
    if (ok(values[last])) svg.append('circle').attr('cx', x(last)).attr('cy', y(values[last])).attr('r', 2.4).attr('fill', color || C.col.blue());
  };
})();
