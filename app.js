/* ==========================================================================
   Enterprise Transformation Portfolio – application logic
   Data:         data/projects.json, data/portfolio-status.json (loaded at runtime)
   Logic:        date maths, statistics, filtering
   Presentation: one render function per dashboard section
   ========================================================================== */
(function () {
  'use strict';

  const DATA_URL = './data/projects.json';
  const STATUS_URL = './data/portfolio-status.json';
  const RAG_ORDER = ['Red', 'Amber', 'Green'];
  const RAG_LABEL = { Green: 'On track', Amber: 'Attention required', Red: 'Critical' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const VISIBLE_TAGS = 3;
  const MILESTONE_HORIZON_DAYS = 90;

  /** Programme Status Summary columns: JSON key, title, CSS modifier, icon path */
  const STATUS_COLUMNS = [
    { key: 'highlights', title: 'Highlights', cls: 'highlights', icon: 'M5 12l4 4L19 6' },
    { key: 'lowlights', title: 'Lowlights', cls: 'lowlights', icon: 'M12 5v9M12 18.5v.5' },
    { key: 'risksIssues', title: 'Risks / Issues', cls: 'risks', icon: 'M12 3l9.5 17h-19zM12 10v4M12 17v.5' },
    { key: 'nextSteps', title: 'Next Steps', cls: 'next', icon: 'M5 12h13M13 6l6 6-6 6' },
    { key: 'decisionsNeeded', title: 'Decisions Needed', cls: 'decisions', icon: 'M9 11l3 3 8-8M20 12v7H4V5h11' }
  ];

  /** Application state */
  const state = {
    data: null,
    status: null,
    projects: [],
    areaIndex: {},
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
  const domainChip = p => `<span class="domain-chip area-${p._areaIdx}" title="${esc(p._area)}">${esc(p.domain)}</span>`;
  const shortName = name => name.split(/ – | with /)[0];

  /* ------------------------------------------------------------------
     Data loading & normalisation
     ------------------------------------------------------------------ */
  async function loadJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
    return res.json();
  }

  /** Adds computed fields (UTC ms dates, duration, years, area, milestones) without altering source values. */
  function normalise(data) {
    const areaByDomain = {};
    (data.transformationAreas || []).forEach((a, i) => {
      state.areaIndex[a.area] = i + 1;
      a.domains.forEach(d => { areaByDomain[d] = a.area; });
    });
    return data.projects.map(p => {
      const start = parseISO(p.startDate);
      const end = parseISO(p.endDate);
      const area = areaByDomain[p.domain] || 'Other';
      const milestones = (p.milestones || [])
        .map(m => Object.assign({}, m, { _date: parseISO(m.date) }))
        .sort((a, b) => a._date - b._date);
      return Object.assign({}, p, {
        _start: start,
        _end: end,
        _endExcl: end + DAY,
        _months: durationMonths(start, end),
        _years: yearsSpanned(start, end),
        _timing: `${fmtMonthYear(start)} – ${fmtMonthYear(end)}`,
        _area: area,
        _areaIdx: state.areaIndex[area] || 0,
        _ms: milestones,
        _haystack: [p.projectName, p.domain, p.scope, p.ragCommentary, ...p.platforms, ...p.technicalKeywords, ...p.frameworks,
          ...milestones.map(m => m.name)].join(' ').toLowerCase()
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
    const msHorizon = t + MILESTONE_HORIZON_DAYS * DAY;
    const count = rag => list.filter(p => p.rag === rag).length;
    const upcoming = list.flatMap(p => p._ms).filter(m => m._date >= t && m._date <= msHorizon);
    return {
      total: list.length,
      green: count('Green'),
      amber: count('Amber'),
      red: count('Red'),
      active: list.filter(p => p._start <= t && p._end >= t).length,
      startingSoon: list.filter(p => p._start > t && p._start <= horizon).length,
      endingSoon: list.filter(p => p._end >= t && p._end <= horizon).length,
      msUpcoming: upcoming.length,
      msAtRisk: upcoming.filter(m => m.status === 'at-risk').length,
      horizon,
      msHorizon
    };
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
      { cls: 'total', label: 'Total projects', value: s.total, sub: activeFilterCount() ? `of ${state.projects.length} in portfolio` : 'in portfolio' },
      { cls: 'green', rag: 'Green', label: 'Green', value: s.green, sub: `On track · ${pct(s.green)}` },
      { cls: 'amber', rag: 'Amber', label: 'Amber', value: s.amber, sub: `Attention required · ${pct(s.amber)}` },
      { cls: 'red', rag: 'Red', label: 'Red', value: s.red, sub: `Critical · ${pct(s.red)}` },
      { cls: 'blue', label: 'Active now', value: s.active, sub: `In delivery on ${fmtDate(state.today)}` },
      { cls: 'teal', label: 'Starting in next 6 months', value: s.startingSoon, sub: horizonTxt },
      { cls: 'cyan', label: 'Ending in next 6 months', value: s.endingSoon, sub: horizonTxt },
      { cls: 'violet', label: `Milestones next ${MILESTONE_HORIZON_DAYS} days`, value: s.msUpcoming, sub: `to ${fmtDate(s.msHorizon)} · ${s.msAtRisk} at risk` }
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
     Presentation: roadmap (Gantt + milestones)
     Bar and milestone positions are computed from dates against the
     programme window in meta – nothing is hard-coded.
     ------------------------------------------------------------------ */
  function programmeWindow() {
    const m = state.data.meta;
    const t0 = parseISO(m.programmeStart);
    const t1 = parseISO(m.programmeEnd) + DAY;
    return { t0, t1, pos: ms => ((Math.min(Math.max(ms, t0), t1) - t0) / (t1 - t0)) * 100 };
  }

  function milestoneClasses(p, m) {
    return [m.type === 'go-live' ? 'go-live' : '', m.status === 'at-risk' ? `at-risk ${ragKey(p.rag)}` : ''].join(' ').trim();
  }

  function renderRoadmap(list) {
    const { t0, t1, pos } = programmeWindow();

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
      const markers = p._ms.map((m, i) =>
        `<button type="button" class="ms ${milestoneClasses(p, m)}" style="left:${pos(m._date)}%" data-tip="ms" data-pid="${p.id}" data-mi="${i}"
           aria-label="${esc(`Milestone: ${m.name}, ${fmtDate(m._date)}`)}"></button>`).join('');
      return `<div class="rm-row${p.rag === 'Red' ? ' is-red' : ''}" role="row" tabindex="0" data-id="${p.id}" aria-label="${esc(`${p.projectName}, ${p._timing}, ${p.rag}`)}">
          <div class="rm-label" role="cell">
            <i class="dot rag-${ragKey(p.rag)}" title="${esc(`RAG: ${p.rag}`)}"></i>
            <span class="rm-text"><span class="rm-name">${esc(p.projectName)}</span><span class="rm-meta">${domainChip(p)}<span class="rm-timing">${esc(p._timing)}</span></span></span>
          </div>
          <div class="rm-track" role="cell">${gridlines}${todayLine}
            <span class="rm-bar ${ragKey(p.rag)}" style="left:${left}%;width:${width}%" data-tip="bar" data-pid="${p.id}"></span>
            ${markers}
          </div>
        </div>`;
    }).join('');

    $('#roadmap').innerHTML = head + `<div class="rm-body" role="rowgroup">${rows || '<p class="empty">No projects match the current filters.</p>'}</div>`;
  }

  /* ------------------------------------------------------------------
     Presentation: Programme Status Summary
     Items follow the filters through their projectIds; items with no
     projectIds are programme-wide and always shown.
     ------------------------------------------------------------------ */
  function renderStatus(list) {
    const el = $('#status');
    if (!state.status) {
      el.innerHTML = '<p class="empty">Programme status data (data/portfolio-status.json) could not be loaded.</p>';
      return;
    }
    $('#status-meta').textContent = `Reporting period: ${state.status.reportingPeriod || '—'}` +
      (activeFilterCount() ? ' · filtered to shown projects' : '');
    const shownIds = new Set(list.map(p => p.id));
    const byId = new Map(state.projects.map(p => [p.id, p]));
    const visible = item => !item.projectIds || !item.projectIds.length || item.projectIds.some(id => shownIds.has(id));

    el.innerHTML = STATUS_COLUMNS.map(col => {
      const items = (state.status[col.key] || []).filter(visible);
      const lis = items.map(item => {
        const tag = item.type ? `<span class="si-tag ${ragKey(item.rag || 'Amber')}">${esc(item.type)}</span>` : '';
        const links = (item.projectIds || []).map(id => byId.get(id)).filter(Boolean)
          .map(p => `<button type="button" class="si-link" data-open="${p.id}" title="${esc(p.projectName)}">${esc(shortName(p.projectName))}</button>`).join('');
        return `<li class="status-item${item.rag === 'Red' ? ' is-red' : ''}">
            <span class="si-text">${tag}${esc(item.text)}</span>
            ${links ? `<span class="si-links">${links}</span>` : ''}
          </li>`;
      }).join('');
      return `<div class="status-col ${col.cls}">
          <h3><span class="st-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13"><path d="${col.icon}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            ${esc(col.title)}<span class="st-count">${items.length}</span></h3>
          ${items.length ? `<ul class="status-list">${lis}</ul>` : '<p class="status-empty">Nothing for the current selection.</p>'}
        </div>`;
    }).join('');
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
    $('#ptable tbody').innerHTML = rows.length ? rows.map(p => `<tr tabindex="0" data-id="${p.id}" class="is-${ragKey(p.rag)}">
        <td class="c-id">${p.id}</td>
        <td class="c-name">${esc(p.projectName)}</td>
        <td class="c-domain">${domainChip(p)}</td>
        <td>${ragPill(p.rag)}</td>
        <td class="c-timing">${esc(p._timing)}<small>${p._months} months · ${p._ms.length} milestones</small></td>
        <td class="c-scope">${esc(p.scope)}</td>
        <td class="c-tags">${tagList(p.platforms)}</td>
        <td class="c-tags">${tagList(p.technicalKeywords, 'kw')}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty">No projects match the current filters.</td></tr>`;
  }

  /* ------------------------------------------------------------------
     Presentation: project detail drawer (project status report)
     Order: Scope → Schedule & Key Milestones → Technology → Keywords →
            Framework Alignment → RAG Commentary
     ------------------------------------------------------------------ */
  function scheduleSection(p) {
    const span = p._endExcl - p._start;
    const rel = ms => ((ms - p._start) / span) * 100;
    const markers = p._ms.map((m, i) =>
      `<span class="ms ${milestoneClasses(p, m)}" style="left:${rel(m._date)}%" tabindex="0" data-tip="ms" data-pid="${p.id}" data-mi="${i}"
         aria-label="${esc(`${m.name}, ${fmtDate(m._date)}`)}"></span>`).join('');
    const items = p._ms.map(m => {
      const badges = (m.type === 'go-live' ? '<span class="ms-badge golive">Go-live</span>' : '') +
        (m.status === 'at-risk' ? `<span class="ms-badge risk ${ragKey(p.rag)}">At risk</span>` : '');
      return `<li class="ms-item ${milestoneClasses(p, m)}">
          <div class="ms-date">${fmtDate(m._date)}</div>
          <div class="ms-name">${esc(m.name)}${badges}</div>
          <div class="ms-desc">${esc(m.description)}</div>
        </li>`;
    }).join('');
    return `<div class="d-section d-schedule"><h3>Schedule &amp; key milestones</h3>
        <dl class="d-facts">
          <div class="d-fact"><dt>Start date</dt><dd>${fmtDate(p._start)}</dd></div>
          <div class="d-fact"><dt>End date</dt><dd>${fmtDate(p._end)}</dd></div>
          <div class="d-fact"><dt>Duration</dt><dd>${p._months} months</dd></div>
        </dl>
        <div class="d-window"><span class="d-window-track"></span><span class="d-window-bar" style="left:0;width:100%"></span>${markers}</div>
        <div class="d-window-scale"><span>${fmtMonthYear(p._start)}</span><span>${fmtMonthYear(p._end)}</span></div>
        ${items ? `<ol class="ms-list">${items}</ol>` : '<p>No milestones defined.</p>'}
      </div>`;
  }

  function openDetail(id) {
    const p = state.projects.find(x => x.id === Number(id));
    if (!p) return;
    hideTip();
    const tags = (arr, cls = '') => `<div class="tech-tags">${arr.map(v => `<span class="tag ${cls}">${esc(v)}</span>`).join('')}</div>`;
    const drawer = $('#drawer');
    drawer.style.setProperty('--d-rag', `var(--rag-${ragKey(p.rag)})`);
    drawer.style.setProperty('--d-rag-soft', `var(--rag-${ragKey(p.rag)}-soft)`);

    $('#d-kicker').innerHTML = `Project ${p.id} · ${domainChip(p)} · ${ragPill(p.rag)}`;
    $('#d-title').textContent = p.projectName;
    $('#d-body').innerHTML = `
      <div class="d-section d-scope"><h3>Scope</h3><p>${esc(p.scope)}</p></div>
      ${scheduleSection(p)}
      <div class="d-section d-tech"><h3>Technology / platforms</h3>${tags(p.platforms)}</div>
      <div class="d-section d-kw"><h3>Technical keywords</h3>${tags(p.technicalKeywords, 'kw')}</div>
      <div class="d-section d-fw"><h3>Framework alignment</h3>${tags(p.frameworks, 'fw')}
        <p class="fw-note">Relevant frameworks only; does not imply certification.</p></div>
      <div class="d-section d-status"><h3>Status · RAG commentary</h3>
        <p class="d-commentary">${ragPill(p.rag)} &nbsp;${esc(p.ragCommentary)}</p></div>`;

    state.lastFocus = document.activeElement;
    drawer.hidden = false;
    $('#drawer-backdrop').hidden = false;
    $('#d-body').scrollTop = 0;
    $('#d-close').focus();
  }

  function closeDetail() {
    if ($('#drawer').hidden) return;
    hideTip();
    $('#drawer').hidden = true;
    $('#drawer-backdrop').hidden = true;
    if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus();
  }

  /* ------------------------------------------------------------------
     Tooltip (one fixed-position element, clamped to the viewport)
     ------------------------------------------------------------------ */
  function tipContent(el) {
    const p = state.projects.find(x => x.id === Number(el.dataset.pid));
    if (!p) return '';
    if (el.dataset.tip === 'ms') {
      const m = p._ms[Number(el.dataset.mi)];
      if (!m) return '';
      const tag = m.status === 'at-risk' ? `<div class="tt-tag ${ragKey(p.rag)}">At risk</div>` : '';
      return `<div class="tt-project">${esc(shortName(p.projectName))}</div>
        <div class="tt-title">${esc(m.name)}</div>
        <div class="tt-date">${fmtDate(m._date)}${m.type === 'go-live' ? ' · Go-live' : ''}</div>
        <div class="tt-desc">${esc(m.description)}</div>${tag}`;
    }
    return `<div class="tt-title">${esc(p.projectName)}</div>
      <div class="tt-date">${esc(p._timing)} · ${p._months} months</div>
      <div class="tt-desc">RAG: ${esc(p.rag)} – ${RAG_LABEL[p.rag]} · ${p._ms.length} milestones</div>`;
  }

  function showTip(el) {
    const html = tipContent(el);
    if (!html) return;
    const tip = $('#tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    tip.classList.remove('show');
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 10, pad = 8;
    let top = r.top - th - gap;
    if (top < pad) top = r.bottom + gap;
    top = Math.min(top, window.innerHeight - th - pad);
    const cx = el.dataset.tip === 'bar' ? Math.min(Math.max(lastPointerX, r.left), r.right) : r.left + r.width / 2;
    const left = Math.min(Math.max(cx - tw / 2, pad), window.innerWidth - tw - pad);
    tip.style.top = `${Math.max(top, pad)}px`;
    tip.style.left = `${left}px`;
    cancelAnimationFrame(tipFrame);
    tipFrame = requestAnimationFrame(() => tip.classList.add('show'));
  }
  function hideTip() {
    const tip = $('#tooltip');
    cancelAnimationFrame(tipFrame);
    tip.classList.remove('show');
    tip.hidden = true;
  }
  let lastPointerX = 0;
  let tipFrame = 0;

  function initTooltips() {
    document.addEventListener('mousemove', e => { lastPointerX = e.clientX; }, { passive: true });
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (el) showTip(el);
    });
    document.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });
    document.addEventListener('focusin', e => {
      const el = e.target.closest('[data-tip]');
      if (el) showTip(el); else hideTip();
    });
    document.addEventListener('focusout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
    window.addEventListener('scroll', hideTip, { passive: true, capture: true });
    window.addEventListener('resize', hideTip);
  }

  /* ------------------------------------------------------------------
     Theme (light / dark) – stored in localStorage, OS preference as default
     ------------------------------------------------------------------ */
  function syncThemeToggle() {
    const dark = document.documentElement.dataset.theme === 'dark';
    const btn = $('#btn-theme');
    btn.setAttribute('aria-pressed', String(dark));
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  function toggleTheme() {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('etp-theme', root.dataset.theme); } catch (err) { /* storage unavailable */ }
    syncThemeToggle();
    setTimeout(() => root.classList.remove('theme-transition'), 350);
  }
  function initTheme() {
    const root = document.documentElement;
    if (!root.dataset.theme) {
      root.dataset.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    syncThemeToggle();
    $('#btn-theme').addEventListener('click', toggleTheme);
  }

  /* ------------------------------------------------------------------
     Orchestration
     ------------------------------------------------------------------ */
  function renderAll() {
    const list = filtered();
    hideTip();
    renderFilterStatus(list);
    renderKPIs(list);
    renderRoadmap(list);
    renderStatus(list);
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

    const link = t.closest('[data-open]');
    if (link) { openDetail(link.dataset.open); return true; }

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
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideTip(); closeDetail(); } });
  }

  async function init() {
    initTheme();
    initTooltips();
    let status;
    try {
      [state.data, status] = await Promise.all([
        loadJSON(DATA_URL),
        loadJSON(STATUS_URL).catch(err => { console.warn('Programme status not loaded:', err); return null; })
      ]);
    } catch (err) {
      console.warn('Failed to load portfolio data:', err);
      $('#load-error').hidden = false;
      return;
    }
    state.status = status;
    state.projects = normalise(state.data);
    renderHeader();
    initFilters();
    initEvents();
    syncFilterControls();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
