/* ==========================================================================
   Enterprise Transformation Portfolio – application logic
   Data:         data/projects.json (loaded at runtime, never embedded here)
   Logic:        date maths, statistics, filtering
   Presentation: one render function per dashboard section
   ========================================================================== */
(function () {
  'use strict';

  const DATA_URL = 'data/projects.json';
  const RAG_ORDER = ['Red', 'Amber', 'Green'];
  const RAG_LABEL = { Green: 'On track', Amber: 'Attention required', Red: 'Critical' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VISIBLE_TAGS = 3;

  /** Application state */
  const state = {
    data: null,
    projects: [],
    filters: { search: '', rag: '', domain: '', year: '', platform: '', framework: '' },
    sort: { key: 'id', dir: 1 },
    today: todayUTC(),
    lastFocus: null
  };

  const $ = (sel, root = document) => root.querySelector(sel);

  /* ------------------------------------------------------------------
     Utilities: dates (all in UTC days to avoid timezone / DST drift)
     ------------------------------------------------------------------ */
  function todayUTC() {
    const d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  /** "2026-07-01" -> UTC ms */
  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  const DAY = 86400000;
  const ymd = ms => { const d = new Date(ms); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
  function fmtMonthYear(ms) { const [y, m] = ymd(ms); return `${MONTHS[m]} ${y}`; }
  function fmtDate(ms) { const [y, m, d] = ymd(ms); return `${d} ${MONTHS[m]} ${y}`; }
  function fmtLongMonthYear(ms) { const [y, m] = ymd(ms); return `${MONTHS_LONG[m]} ${y}`; }
  function addMonths(ms, n) { const [y, m, d] = ymd(ms); return Date.UTC(y, m + n, d); }
  /** Whole calendar months covered, inclusive (1 Jul – 30 Jun = 12). */
  function durationMonths(start, end) {
    const [sy, sm] = ymd(start); const [ey, em] = ymd(end);
    return (ey - sy) * 12 + (em - sm) + 1;
  }
  function yearsSpanned(start, end) {
    const out = []; for (let y = ymd(start)[0]; y <= ymd(end)[0]; y++) out.push(y); return out;
  }

  /* ------------------------------------------------------------------
     Utilities: DOM
     ------------------------------------------------------------------ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const ragKey = rag => rag.toLowerCase();
  const ragPill = rag => `<span class="rag-pill ${ragKey(rag)}"><i class="dot rag-${ragKey(rag)}"></i>${esc(rag)}</span>`;
  const uniqueSorted = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b));

  /* ------------------------------------------------------------------
     Data loading & normalisation
     ------------------------------------------------------------------ */
  async function loadData() {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${DATA_URL}`);
    return res.json();
  }

  /** Adds computed fields (UTC ms dates, duration, years, area) without altering source values. */
  function normalise(data) {
    const areaByDomain = {};
    (data.transformationAreas || []).forEach(a => a.domains.forEach(d => { areaByDomain[d] = a.area; }));
    return data.projects.map(p => {
      const start = parseISO(p.startDate);
      const end = parseISO(p.endDate);
      return Object.assign({}, p, {
        _start: start,
        _end: end,
        _endExcl: end + DAY,
        _months: durationMonths(start, end),
        _years: yearsSpanned(start, end),
        _timing: `${fmtMonthYear(start)} – ${fmtMonthYear(end)}`,
        _area: areaByDomain[p.domain] || 'Other',
        _haystack: [p.projectName, p.domain, p.scope, p.ragCommentary, ...p.platforms, ...p.technicalKeywords, ...p.frameworks].join(' ').toLowerCase()
      });
    });
  }

  /* ------------------------------------------------------------------
     Business logic: filtering & statistics
     ------------------------------------------------------------------ */
  function matches(p, f) {
    if (f.rag && p.rag !== f.rag) return false;
    if (f.domain && p.domain !== f.domain) return false;
    if (f.year && !p._years.includes(Number(f.year))) return false;
    if (f.platform && !p.platforms.includes(f.platform)) return false;
    if (f.framework && !p.frameworks.includes(f.framework)) return false;
    if (f.search) {
      const terms = f.search.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.every(t => p._haystack.includes(t))) return false;
    }
    return true;
  }
  const filtered = () => state.projects.filter(p => matches(p, state.filters));
  const activeFilterCount = () => Object.values(state.filters).filter(Boolean).length;

  function computeStats(list) {
    const t = state.today;
    const horizon = addMonths(t, 6);
    const count = rag => list.filter(p => p.rag === rag).length;
    return {
      total: list.length,
      green: count('Green'),
      amber: count('Amber'),
      red: count('Red'),
      active: list.filter(p => p._start <= t && p._end >= t).length,
      startingSoon: list.filter(p => p._start > t && p._start <= horizon).length,
      endingSoon: list.filter(p => p._end >= t && p._end <= horizon).length,
      horizon
    };
  }

  /** Count items of a list-valued field across projects. */
  function frequency(list, field) {
    const m = new Map();
    list.forEach(p => p[field].forEach(v => m.set(v, (m.get(v) || 0) + 1)));
    return m;
  }

  /* ------------------------------------------------------------------
     Presentation: header & filters
     ------------------------------------------------------------------ */
  function renderHeader() {
    const m = state.data.meta;
    $('#dash-title').textContent = m.title;
    $('#dash-subtitle').textContent = m.subtitle;
    $('#dash-period').textContent = `${fmtLongMonthYear(parseISO(m.programmeStart))} – ${fmtLongMonthYear(parseISO(m.programmeEnd))}`;
    const upd = $('#dash-updated');
    upd.textContent = fmtDate(parseISO(m.lastUpdated));
    upd.setAttribute('datetime', m.lastUpdated);
    $('#source-note').textContent = `Source: ${m.source}. ${state.projects.length} projects. ${m.notes || ''}`;
  }

  function fillSelect(id, values, labelFn = v => v) {
    const sel = $(id);
    values.forEach(v => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(labelFn(v))}</option>`));
  }

  function initFilters() {
    const P = state.projects;
    fillSelect('#f-rag', RAG_ORDER.filter(r => P.some(p => p.rag === r)), r => `${r} – ${RAG_LABEL[r]}`);
    fillSelect('#f-domain', uniqueSorted(P.map(p => p.domain)));
    fillSelect('#f-year', uniqueSorted(P.flatMap(p => p._years).map(String)));
    fillSelect('#f-platform', uniqueSorted(P.flatMap(p => p.platforms)));
    fillSelect('#f-framework', uniqueSorted(P.flatMap(p => p.frameworks)));

    ['rag', 'domain', 'year', 'platform', 'framework'].forEach(k => {
      $(`#f-${k}`).addEventListener('change', e => setFilter(k, e.target.value));
    });
    let timer;
    $('#f-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => setFilter('search', e.target.value.trim()), 150);
    });
    $('#btn-reset').addEventListener('click', resetFilters);
  }

  function setFilter(key, value) {
    state.filters[key] = value;
    syncFilterControls();
    renderAll();
  }

  function resetFilters() {
    Object.keys(state.filters).forEach(k => { state.filters[k] = ''; });
    syncFilterControls();
    renderAll();
  }

  function syncFilterControls() {
    Object.entries(state.filters).forEach(([k, v]) => {
      const el = $(`#f-${k}`);
      if (el.value !== v) el.value = v;
      el.classList.toggle('active', Boolean(v));
    });
  }

  function renderFilterStatus(list) {
    const n = activeFilterCount();
    $('#filter-status').textContent = n
      ? `Showing ${list.length} of ${state.projects.length} projects · ${n} filter${n > 1 ? 's' : ''} active`
      : `Showing all ${state.projects.length} projects`;
  }

  /* ------------------------------------------------------------------
     Presentation: KPI cards
     ------------------------------------------------------------------ */
  function renderKPIs(list) {
    const s = computeStats(list);
    const pct = v => (s.total ? Math.round((v / s.total) * 100) : 0) + '% of shown';
    const horizonTxt = `to ${fmtMonthYear(s.horizon)}`;
    const cards = [
      { cls: 'neutral', label: 'Total projects', value: s.total, sub: activeFilterCount() ? `of ${state.projects.length} in portfolio` : 'in portfolio' },
      { cls: 'green', rag: 'Green', label: 'Green', value: s.green, sub: `On track · ${pct(s.green)}` },
      { cls: 'amber', rag: 'Amber', label: 'Amber', value: s.amber, sub: `Attention required · ${pct(s.amber)}` },
      { cls: 'red', rag: 'Red', label: 'Red', value: s.red, sub: `Critical · ${pct(s.red)}` },
      { cls: '', label: 'Active now', value: s.active, sub: `In delivery on ${fmtDate(state.today)}` },
      { cls: '', label: 'Starting in next 6 months', value: s.startingSoon, sub: horizonTxt },
      { cls: '', label: 'Ending in next 6 months', value: s.endingSoon, sub: horizonTxt }
    ];
    $('#kpis').innerHTML = cards.map(c => {
      const interactive = c.rag ? ` data-rag="${c.rag}" role="button" tabindex="0" aria-pressed="${state.filters.rag === c.rag}" title="Filter to ${c.rag}"` : '';
      const dot = c.rag ? `<i class="dot rag-${ragKey(c.rag)}"></i>` : '';
      return `<div class="kpi ${c.cls}"${interactive}>
        <div class="kpi-label">${dot}${esc(c.label)}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub">${esc(c.sub)}</div>
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
     Presentation: roadmap (Gantt)
     Bar positions are computed from startDate / endDate against the
     programme window from meta – nothing is hard-coded.
     ------------------------------------------------------------------ */
  function renderRoadmap(list) {
    const m = state.data.meta;
    const t0 = parseISO(m.programmeStart);
    const t1 = parseISO(m.programmeEnd) + DAY;
    const span = t1 - t0;
    const pos = ms => ((Math.min(Math.max(ms, t0), t1) - t0) / span) * 100;

    // Quarter and year segments across the window
    const quarters = [];
    for (let q = t0; q < t1; q = addMonths(q, 3)) {
      const [y, mo] = ymd(q);
      const qStart = Date.UTC(y, Math.floor(mo / 3) * 3, 1);
      quarters.push({ y, q: Math.floor(mo / 3) + 1, from: pos(Math.max(qStart, t0)), to: pos(Math.min(addMonths(qStart, 3), t1)), ystart: mo < 3 });
    }
    const years = uniqueSorted(quarters.map(q => String(q.y))).map(y => {
      const qs = quarters.filter(q => String(q.y) === y);
      return { y, from: qs[0].from, to: qs[qs.length - 1].to };
    });

    const gridlines = quarters.map(q => `<span class="rm-gridline${q.ystart ? ' year' : ''}" style="left:${q.from}%"></span>`).join('');
    const today = state.today;
    const todayIn = today >= t0 && today < t1;
    const todayLine = todayIn ? `<span class="rm-today" style="left:${pos(today)}%"></span>` : '';

    const head = `<div class="rm-row rm-head" role="row">
        <div class="rm-label" role="columnheader">Project · ${list.length} shown</div>
        <div class="rm-scale" role="columnheader">
          <div class="rm-years">${years.map(y => `<span class="rm-year" style="left:${y.from}%;width:${y.to - y.from}%">${y.y}</span>`).join('')}</div>
          <div class="rm-quarters">${quarters.map(q => `<span class="rm-q${q.ystart ? ' ystart' : ''}" style="left:${q.from}%;width:${q.to - q.from}%">Q${q.q}</span>`).join('')}
            ${todayIn ? `<span class="rm-today-label" style="left:${pos(today)}%">Today</span>` : ''}</div>
        </div>
      </div>`;

    const rows = [...list].sort((a, b) => a._start - b._start || a._end - b._end || a.id - b.id).map(p => {
      const left = pos(p._start);
      const width = Math.max(pos(p._endExcl) - left, 0.6);
      const label = width > 11 ? `<span class="rm-bar-text">${esc(p._timing)}</span>` : '';
      const tip = `${p.projectName}\n${p._timing} (${p._months} months)\nRAG: ${p.rag} – ${RAG_LABEL[p.rag]}`;
      return `<div class="rm-row" role="row" tabindex="0" data-id="${p.id}" aria-label="${esc(`${p.projectName}, ${p._timing}, ${p.rag}`)}">
          <div class="rm-label" role="cell">
            <i class="dot rag-${ragKey(p.rag)}" aria-hidden="true"></i>
            <span class="rm-text"><span class="rm-name" title="${esc(p.projectName)}">${esc(p.projectName)}</span><span class="rm-domain">${esc(p.domain)}</span></span>
          </div>
          <div class="rm-track" role="cell">${gridlines}${todayLine}
            <span class="rm-bar ${ragKey(p.rag)}" style="left:${left}%;width:${width}%" title="${esc(tip)}">${label}</span>
          </div>
        </div>`;
    }).join('');

    $('#roadmap').innerHTML = head + `<div class="rm-body" role="rowgroup">${rows || '<p class="empty">No projects match the current filters.</p>'}</div>`;
  }

  /* ------------------------------------------------------------------
     Presentation: Portfolio Attention Required (Red + Amber)
     ------------------------------------------------------------------ */
  function renderAttention(list) {
    const items = list.filter(p => p.rag === 'Red' || p.rag === 'Amber')
      .sort((a, b) => RAG_ORDER.indexOf(a.rag) - RAG_ORDER.indexOf(b.rag) || a._start - b._start);
    if (!items.length) {
      const hidden = state.projects.some(p => p.rag !== 'Green') ? ' in the current filter selection' : '';
      $('#attention').innerHTML = `<p class="empty">No Red or Amber projects${hidden}.</p>`;
      return;
    }
    $('#attention').innerHTML = items.map(p => {
      const a = p.attention || {};
      const principal = p.rag === 'Red' ? `<div class="att-principal">Principal programme concern${a.issueType ? ' · ' + esc(a.issueType) : ''}</div>` : '';
      const impacts = a.impactAreas && a.impactAreas.length
        ? `<div class="att-impacts" aria-label="Impacted areas">${a.impactAreas.map(i => `<span>${esc(i)}</span>`).join('')}</div>` : '';
      return `<article class="att-item ${ragKey(p.rag)}" tabindex="0" data-id="${p.id}">
          ${principal}
          <div class="att-top">
            <div><div class="att-title">${esc(p.projectName)}</div>
              <div class="att-meta">${esc(p.domain)} · ${esc(p._timing)}</div></div>
            ${ragPill(p.rag)}
          </div>
          <p class="att-comment">${esc(p.ragCommentary)}</p>
          ${impacts}
        </article>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
     Presentation: composition (stacked by RAG) & framework alignment
     ------------------------------------------------------------------ */
  function barRow(label, total, max, segments, filterAttr) {
    const segs = segments.filter(s => s.n > 0)
      .map(s => `<span class="bar-seg ${s.cls}" style="width:${(s.n / max) * 100}%" title="${esc(`${label}: ${s.n} ${s.title}`)}"></span>`).join('');
    return `<div class="bar-row"${filterAttr || ''}>
        <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
        <span class="bar-track">${segs}</span>
        <span class="bar-value">${total}</span>
      </div>`;
  }

  function renderComposition(list) {
    const areas = (state.data.transformationAreas || []).map(a => a.area);
    const max = Math.max(1, ...areas.map(a => list.filter(p => p._area === a).length));
    $('#composition').innerHTML = areas.map(a => {
      const ps = list.filter(p => p._area === a);
      const segs = ['Green', 'Amber', 'Red'].map(r => ({ cls: ragKey(r), n: ps.filter(p => p.rag === r).length, title: r }));
      return barRow(a, ps.length, max, segs);
    }).join('');
  }

  function renderFrameworks(list) {
    const all = uniqueSorted(state.projects.flatMap(p => p.frameworks));
    const freq = frequency(list, 'frameworks');
    const max = Math.max(1, ...freq.values());
    const rows = all.map(f => ({ f, n: freq.get(f) || 0 })).sort((a, b) => b.n - a.n || a.f.localeCompare(b.f));
    $('#frameworks').innerHTML = rows.map(r =>
      barRow(r.f, r.n, max, [{ cls: 'neutral', n: r.n, title: 'projects' }],
        ` data-filter="framework" data-value="${esc(r.f)}" role="button" tabindex="0" title="Filter to ${esc(r.f)}"`)
    ).join('');
  }

  /* ------------------------------------------------------------------
     Presentation: technology landscape
     ------------------------------------------------------------------ */
  function renderTech(list) {
    const freq = frequency(list, 'platforms');
    const groups = (state.data.technologyGroups || []).map(g => {
      const terms = g.terms.map(t => ({ t, n: freq.get(t) || 0 })).sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));
      const projectsInGroup = list.filter(p => p.platforms.some(x => g.terms.includes(x))).length;
      return { name: g.group, terms, projectsInGroup };
    });
    const tag = ({ t, n }) => {
      const sel = state.filters.platform === t ? ' selected' : '';
      const dim = n === 0 ? ' dim' : '';
      return `<button type="button" class="tag${sel}${dim}" data-filter="platform" data-value="${esc(t)}" title="${esc(`${t}: ${n} project${n === 1 ? '' : 's'} – click to filter`)}">${esc(t)} <span class="count">${n}</span></button>`;
    };
    const groupHtml = groups.map(g => `<div class="tech-group">
        <h3>${esc(g.name)} <span>${g.projectsInGroup} proj.</span></h3>
        <div class="tech-tags">${g.terms.map(tag).join('')}</div>
      </div>`).join('');

    // Recurring technical keywords (appear in 2+ of the shown projects)
    const kw = [...frequency(list, 'technicalKeywords')].filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const kwHtml = `<div class="tech-group" style="grid-column:1/-1">
        <h3>Recurring technical themes <span>keywords in 2+ shown projects</span></h3>
        <div class="tech-tags">${kw.length ? kw.map(([k, n]) => `<button type="button" class="tag kw" data-search="${esc(k)}" title="Search for ${esc(k)}">${esc(k)} <span class="count">${n}</span></button>`).join('') : '<span class="empty">None in the current selection.</span>'}</div>
      </div>`;
    $('#tech').innerHTML = groupHtml + kwHtml;
  }

  /* ------------------------------------------------------------------
     Presentation: project portfolio table
     ------------------------------------------------------------------ */
  function tagList(values, cls = '') {
    const shown = values.slice(0, VISIBLE_TAGS).map(v => `<span class="tag ${cls}">${esc(v)}</span>`).join('');
    const rest = values.slice(VISIBLE_TAGS);
    if (!rest.length) return `<div class="tech-tags">${shown}</div>`;
    const hidden = rest.map(v => `<span class="tag ${cls}" hidden data-extra>${esc(v)}</span>`).join('');
    return `<div class="tech-tags">${shown}${hidden}<button type="button" class="tag more" data-more aria-expanded="false">+${rest.length} more</button></div>`;
  }

  function renderTable(list) {
    const { key, dir } = state.sort;
    const rows = [...list].sort((a, b) => {
      let va = a[key], vb = b[key];
      if (key === 'rag') { va = RAG_ORDER.indexOf(a.rag); vb = RAG_ORDER.indexOf(b.rag); }
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    document.querySelectorAll('#ptable th[data-sort]').forEach(th => {
      th.setAttribute('aria-sort', th.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
    $('#ptable tbody').innerHTML = rows.length ? rows.map(p => `<tr tabindex="0" data-id="${p.id}">
        <td class="c-id">${p.id}</td>
        <td class="c-name">${esc(p.projectName)}</td>
        <td class="c-domain">${esc(p.domain)}</td>
        <td>${ragPill(p.rag)}</td>
        <td class="c-timing">${esc(p._timing)}<small>${p._months} months</small></td>
        <td class="c-scope">${esc(p.scope)}</td>
        <td class="c-tags">${tagList(p.platforms)}</td>
        <td class="c-tags">${tagList(p.technicalKeywords, 'kw')}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty">No projects match the current filters.</td></tr>`;
  }

  /* ------------------------------------------------------------------
     Presentation: project detail drawer
     ------------------------------------------------------------------ */
  function openDetail(id) {
    const p = state.projects.find(x => x.id === Number(id));
    if (!p) return;
    const m = state.data.meta;
    const t0 = parseISO(m.programmeStart), t1 = parseISO(m.programmeEnd) + DAY;
    const left = ((p._start - t0) / (t1 - t0)) * 100;
    const width = ((p._endExcl - p._start) / (t1 - t0)) * 100;
    const tags = (arr, cls = '') => `<div class="tech-tags">${arr.map(v => `<span class="tag ${cls}">${esc(v)}</span>`).join('')}</div>`;

    $('#d-kicker').innerHTML = `Project ${p.id} · ${esc(p.domain)} · ${ragPill(p.rag)}`;
    $('#d-title').textContent = p.projectName;
    $('#d-body').innerHTML = `
      <dl class="d-facts">
        <div class="d-fact"><dt>Start date</dt><dd>${fmtDate(p._start)}</dd></div>
        <div class="d-fact"><dt>End date</dt><dd>${fmtDate(p._end)}</dd></div>
        <div class="d-fact"><dt>Duration</dt><dd>${p._months} months</dd></div>
        <div class="d-fact"><dt>RAG</dt><dd>${esc(p.rag)} – ${RAG_LABEL[p.rag]}</dd></div>
        <div class="d-fact" style="grid-column:span 2"><dt>Domain</dt><dd>${esc(p.domain)}</dd></div>
      </dl>
      <div class="d-section">
        <h3>Position in programme window</h3>
        <div class="d-mini" aria-hidden="true"><i class="rag-${ragKey(p.rag)}" style="left:${left}%;width:${width}%"></i></div>
        <div class="d-mini-scale"><span>${fmtMonthYear(t0)}</span><span>${fmtMonthYear(parseISO(m.programmeEnd))}</span></div>
      </div>
      <div class="d-section"><h3>RAG commentary</h3><p class="d-commentary ${ragKey(p.rag)}">${esc(p.ragCommentary)}</p></div>
      <div class="d-section"><h3>Scope</h3><p>${esc(p.scope)}</p></div>
      <div class="d-section"><h3>Technology / platforms</h3>${tags(p.platforms)}</div>
      <div class="d-section"><h3>Technical keywords</h3>${tags(p.technicalKeywords, 'kw')}</div>
      <div class="d-section"><h3>Relevant frameworks</h3>${tags(p.frameworks)}
        <p style="margin-top:6px;font-size:11px;color:var(--ink-3)">Framework alignment only; does not imply certification.</p></div>`;

    state.lastFocus = document.activeElement;
    $('#drawer').hidden = false;
    $('#drawer-backdrop').hidden = false;
    $('#d-close').focus();
  }

  function closeDetail() {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
  }

  /* ------------------------------------------------------------------
     Orchestration
     ------------------------------------------------------------------ */
  function renderAll() {
    const list = filtered();
    renderFilterStatus(list);
    renderKPIs(list);
    renderRoadmap(list);
    renderAttention(list);
    renderComposition(list);
    renderFrameworks(list);
    renderTech(list);
    renderTable(list);
  }

  /** One delegated handler for clicks and Enter/Space on interactive items. */
  function handleActivate(e) {
    const t = e.target;

    const more = t.closest('[data-more]');
    if (more) {
      e.stopPropagation();
      const open = more.getAttribute('aria-expanded') === 'true';
      more.parentElement.querySelectorAll('[data-extra]').forEach(x => { x.hidden = open; });
      more.setAttribute('aria-expanded', String(!open));
      more.textContent = open ? `+${more.parentElement.querySelectorAll('[data-extra]').length} more` : 'Show less';
      return true;
    }
    const kpi = t.closest('.kpi[data-rag]');
    if (kpi) { setFilter('rag', state.filters.rag === kpi.dataset.rag ? '' : kpi.dataset.rag); return true; }

    const f = t.closest('[data-filter]');
    if (f) { const k = f.dataset.filter; setFilter(k, state.filters[k] === f.dataset.value ? '' : f.dataset.value); return true; }

    const s = t.closest('[data-search]');
    if (s) { const v = state.filters.search === s.dataset.search ? '' : s.dataset.search; $('#f-search').value = v; setFilter('search', v); return true; }

    const sortTh = t.closest('th[data-sort]');
    if (sortTh) {
      const k = sortTh.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 };
      renderTable(filtered());
      return true;
    }
    const row = t.closest('[data-id]');
    if (row && !t.closest('#drawer')) { openDetail(row.dataset.id); return true; }
    return false;
  }

  function initEvents() {
    $('#main').addEventListener('click', handleActivate);
    $('#main').addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-id], [role="button"], th[data-sort]')) {
        if (handleActivate(e)) e.preventDefault();
      }
    });
    $('#d-close').addEventListener('click', closeDetail);
    $('#drawer-backdrop').addEventListener('click', closeDetail);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

    $('#btn-theme').addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('etp-theme', next); } catch (err) { /* storage unavailable */ }
    });
  }

  function initTheme() {
    const root = document.documentElement;
    if (!root.dataset.theme) {
      root.dataset.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }

  async function init() {
    initTheme();
    try {
      state.data = await loadData();
    } catch (err) {
      console.warn('Failed to load portfolio data:', err);
      $('#load-error').hidden = false;
      return;
    }
    state.projects = normalise(state.data);
    renderHeader();
    initFilters();
    initEvents();
    syncFilterControls();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
