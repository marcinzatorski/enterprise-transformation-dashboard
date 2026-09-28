/*
 * Enterprise Transformation Portfolio – dashboard logic.
 *
 * Static, read-only page. The only network requests are two same-origin
 * JSON files (data/projects.json and data/portfolio-status.json).
 * No forms, no data collection, no third-party resources. The theme choice
 * is kept in localStorage in this browser only.
 */
'use strict';

(function () {
  var THEME_KEY = 'ppd-theme';
  var DAY = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var RAG_ORDER = ['Green', 'Amber', 'Red'];

  /* ---------- Theme (applied before first paint) ---------- */

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function initialTheme() {
    var saved = storedTheme();
    if (saved === 'light' || saved === 'dark') return saved;
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', initialTheme());

  /* ---------- State ---------- */

  var state = {
    meta: null,
    projects: [],
    status: null,
    today: todayUTC(),
    filters: { search: '', rag: '', domain: '', year: '', platform: '', framework: '' },
    sort: { key: 'id', dir: 1 },
    lastFocus: null
  };

  /* ---------- Date helpers (all dates handled as UTC midnight) ---------- */

  function parseDate(iso) {
    var p = iso.split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function todayUTC() {
    var d = new Date();
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addMonths(t, n) {
    var d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
  }

  function fmtMonth(t) {
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function fmtDay(t) {
    var d = new Date(t);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function yearOf(t) { return new Date(t).getUTCFullYear(); }

  // Whole calendar months from start date to end date (inclusive), e.g. 1 Jul 2026 – 30 Jun 2027 = 12.
  function monthsBetween(start, end) {
    var afterEnd = new Date(end + DAY);
    var s = new Date(start);
    return (afterEnd.getUTCFullYear() - s.getUTCFullYear()) * 12 + (afterEnd.getUTCMonth() - s.getUTCMonth());
  }

  /* ---------- DOM helper: builds elements with textContent only ---------- */

  function el(tag, opts, children) {
    var node = document.createElement(tag);
    opts = opts || {};
    if (opts.cls) node.className = opts.cls;
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.attrs) {
      Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
    }
    if (opts.style) {
      Object.keys(opts.style).forEach(function (k) { node.style[k] = opts.style[k]; });
    }
    if (opts.on) {
      Object.keys(opts.on).forEach(function (k) { node.addEventListener(k, opts.on[k]); });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function $(id) { return document.getElementById(id); }

  function ragClass(rag) { return 'rag-' + String(rag).toLowerCase(); }

  // Domain colour groups: identity (violet), business & data (orange), technology (blue).
  function domainClass(domain) {
    if (/Identity/.test(domain)) return 'dom-identity';
    if (/Business|Data/.test(domain)) return 'dom-business';
    return 'dom-tech';
  }

  function domainTag(domain) {
    return el('span', { cls: 'domain-tag ' + domainClass(domain) }, [el('span', { cls: 'dom-sq', attrs: { 'aria-hidden': 'true' } }), domain]);
  }

  // Small decorative line icons, drawn as inline SVG (no external files).
  var ICON_PATHS = {
    check: 'M4 8.5l2.5 2.5L12 5.5',
    alert: 'M8 4v5M8 11.6v.4',
    warn: 'M8 2.8L14 13H2L8 2.8zM8 6.8v3M8 11.6v.2',
    arrow: 'M3.5 8h9M9 4.5L12.5 8 9 11.5',
    decide: 'M3.5 3.5h9v9h-9zM5.8 8.2l1.6 1.6 3-3.3'
  };

  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICON_PATHS[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  /* ---------- Data loading ---------- */

  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error(path + ' returned ' + res.status);
      return res.json();
    });
  }

  function prepare(data) {
    state.meta = data.meta;
    state.projects = data.projects.map(function (p) {
      var start = parseDate(p.startDate);
      var end = parseDate(p.endDate);
      var milestones = p.milestones.map(function (m) {
        return { name: m.name, date: parseDate(m.date), type: m.type, description: m.description };
      }).sort(function (a, b) { return a.date - b.date; });
      var haystack = [p.name, p.domain, p.scope, p.rag, p.ragCommentary]
        .concat(p.platforms, p.keywords, p.frameworks, milestones.map(function (m) { return m.name; }))
        .join(' ').toLowerCase();
      return {
        id: p.id, name: p.name, domain: p.domain, rag: p.rag, scope: p.scope,
        platforms: p.platforms, keywords: p.keywords, frameworks: p.frameworks,
        ragCommentary: p.ragCommentary, start: start, end: end,
        startYear: yearOf(start), endYear: yearOf(end),
        milestones: milestones, haystack: haystack
      };
    });
  }

  /* ---------- Filtering ---------- */

  function matches(p) {
    var f = state.filters;
    if (f.rag && p.rag !== f.rag) return false;
    if (f.domain && p.domain !== f.domain) return false;
    if (f.year) {
      var y = Number(f.year);
      if (y < p.startYear || y > p.endYear) return false;
    }
    if (f.platform && p.platforms.indexOf(f.platform) === -1) return false;
    if (f.framework && p.frameworks.indexOf(f.framework) === -1) return false;
    if (f.search) {
      var terms = f.search.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) {
        if (p.haystack.indexOf(terms[i]) === -1) return false;
      }
    }
    return true;
  }

  function filtered() { return state.projects.filter(matches); }

  function uniqueSorted(list) {
    var seen = {};
    list.forEach(function (v) { seen[v] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function fillSelect(id, values) {
    var select = $(id);
    values.forEach(function (v) { select.appendChild(el('option', { text: String(v), attrs: { value: String(v) } })); });
  }

  function setupFilters() {
    var all = state.projects;
    fillSelect('filter-rag', RAG_ORDER);
    fillSelect('filter-domain', uniqueSorted(all.map(function (p) { return p.domain; })));
    var years = [];
    for (var y = yearOf(parseDate(state.meta.programmeStart)); y <= yearOf(parseDate(state.meta.programmeEnd)); y++) years.push(y);
    fillSelect('filter-year', years);
    fillSelect('filter-platform', uniqueSorted([].concat.apply([], all.map(function (p) { return p.platforms; }))));
    fillSelect('filter-framework', uniqueSorted([].concat.apply([], all.map(function (p) { return p.frameworks; }))));

    $('filter-search').addEventListener('input', function (e) { state.filters.search = e.target.value.trim(); render(); });
    ['rag', 'domain', 'year', 'platform', 'framework'].forEach(function (key) {
      $('filter-' + key).addEventListener('change', function (e) { state.filters[key] = e.target.value; render(); });
    });
    $('reset-filters').addEventListener('click', resetFilters);
  }

  function resetFilters() {
    Object.keys(state.filters).forEach(function (k) { state.filters[k] = ''; });
    $('filter-search').value = '';
    ['rag', 'domain', 'year', 'platform', 'framework'].forEach(function (k) { $('filter-' + k).value = ''; });
    render();
  }

  function setRagFilter(rag) {
    state.filters.rag = state.filters.rag === rag ? '' : rag;
    $('filter-rag').value = state.filters.rag;
    render();
  }

  /* ---------- KPIs ---------- */

  function pct(part, whole) { return whole ? Math.round((part / whole) * 100) : 0; }

  function renderKPIs(list) {
    var root = $('kpis');
    clear(root);
    var t = state.today;
    var in6 = addMonths(t, 6);
    var in90 = t + 90 * DAY;
    var counts = { Green: 0, Amber: 0, Red: 0 };
    var active = 0, starting = 0, ending = 0, msDue = 0, msRisk = 0;
    list.forEach(function (p) {
      counts[p.rag] += 1;
      if (p.start <= t && p.end >= t) active += 1;
      if (p.start > t && p.start <= in6) starting += 1;
      if (p.end >= t && p.end <= in6) ending += 1;
      p.milestones.forEach(function (m) {
        if (m.date >= t && m.date <= in90) {
          msDue += 1;
          if (m.type === 'at-risk') msRisk += 1;
        }
      });
    });
    var n = list.length;

    root.appendChild(kpiCard({ cls: 'total', label: 'Total projects', value: n, note: n === state.projects.length ? 'in portfolio' : 'shown of ' + state.projects.length }));
    [['Green', 'On track'], ['Amber', 'Attention required'], ['Red', 'Critical']].forEach(function (r) {
      root.appendChild(kpiCard({
        cls: 'k-' + r[0].toLowerCase(), label: r[0], dot: r[0], value: counts[r[0]],
        note: r[1] + ' · ' + pct(counts[r[0]], n) + '% of shown', rag: r[0]
      }));
    });
    root.appendChild(kpiCard({ cls: 'k-blue', label: 'Active now', value: active, note: 'In delivery on ' + fmtDay(t) }));
    root.appendChild(kpiCard({ cls: 'k-teal', label: 'Starting in next 6 months', value: starting, note: 'to ' + fmtMonth(in6) }));
    root.appendChild(kpiCard({ cls: 'k-cyan', label: 'Ending in next 6 months', value: ending, note: 'to ' + fmtMonth(in6) }));
    root.appendChild(kpiCard({ cls: 'k-violet', label: 'Milestones next 90 days', value: msDue, note: 'to ' + fmtDay(in90) + ' · ' + msRisk + ' at risk' }));
  }

  function kpiCard(o) {
    var label = el('span', { cls: 'kpi-label' }, [o.dot ? el('span', { cls: 'dot-rag ' + ragClass(o.dot) }) : null, o.label]);
    var children = [label, el('span', { cls: 'kpi-value', text: String(o.value) }), el('span', { cls: 'kpi-note', text: o.note })];
    if (o.rag) {
      var isActive = state.filters.rag === o.rag;
      return el('button', {
        cls: 'kpi ' + o.cls + (isActive ? ' active' : ''),
        attrs: { type: 'button', 'aria-pressed': String(isActive), title: 'Filter by ' + o.rag },
        on: { click: function () { setRagFilter(o.rag); } }
      }, children);
    }
    return el('div', { cls: 'kpi ' + o.cls }, children);
  }

  /* ---------- Roadmap ---------- */

  function timelineScale() {
    var start = parseDate(state.meta.programmeStart);
    var end = parseDate(state.meta.programmeEnd) + DAY;
    return {
      start: start, end: end,
      pos: function (t) { return Math.max(0, Math.min(1, (t - start) / (end - start))) * 100; }
    };
  }

  function renderRoadmap(list) {
    var root = $('roadmap');
    clear(root);
    var sc = timelineScale();
    var today = state.today;
    var todayVisible = today >= sc.start && today < sc.end;

    // Header: years and quarters
    var years = el('div', { cls: 'rm-years' });
    var quarters = el('div', { cls: 'rm-quarters' });
    var y0 = yearOf(sc.start), y1 = yearOf(sc.end - DAY);
    for (var y = y0; y <= y1; y++) {
      var ys = Math.max(Date.UTC(y, 0, 1), sc.start);
      var ye = Math.min(Date.UTC(y + 1, 0, 1), sc.end);
      years.appendChild(el('div', { cls: 'rm-year', text: String(y), style: { left: sc.pos(ys) + '%', width: (sc.pos(ye) - sc.pos(ys)) + '%' } }));
      for (var q = 0; q < 4; q++) {
        var qs = Date.UTC(y, q * 3, 1), qe = Date.UTC(y, q * 3 + 3, 1);
        if (qe <= sc.start || qs >= sc.end) continue;
        quarters.appendChild(el('div', { cls: 'rm-quarter', text: 'Q' + (q + 1), style: { left: sc.pos(qs) + '%', width: (sc.pos(qe) - sc.pos(qs)) + '%' } }));
      }
    }
    if (todayVisible) {
      quarters.appendChild(el('span', { cls: 'rm-today-tag', text: 'Today', style: { left: sc.pos(today) + '%' } }));
    }
    root.appendChild(el('div', { cls: 'rm-row rm-head' }, [
      el('div', { cls: 'rm-label', text: 'Project · ' + list.length + ' shown' }),
      el('div', { cls: 'rm-scale' }, [years, quarters])
    ]));

    if (!list.length) {
      root.appendChild(el('div', { cls: 'rm-empty', text: 'No projects match the current filters.' }));
      return;
    }

    var rows = list.slice().sort(function (a, b) { return a.start - b.start || a.id - b.id; });
    rows.forEach(function (p) { root.appendChild(roadmapRow(p, sc)); });

    // Overlay: quarter grid lines and Today line across all project rows
    var overlay = el('div', { cls: 'rm-overlay', attrs: { 'aria-hidden': 'true' } });
    overlay.style.top = '49px';
    for (var yy = y0; yy <= y1; yy++) {
      for (var qq = 0; qq < 4; qq++) {
        var t = Date.UTC(yy, qq * 3, 1);
        if (t <= sc.start || t >= sc.end) continue;
        overlay.appendChild(el('div', { cls: 'rm-gridline' + (qq === 0 ? ' year' : ''), style: { left: sc.pos(t) + '%' } }));
      }
    }
    if (todayVisible) overlay.appendChild(el('div', { cls: 'rm-todayline', style: { left: sc.pos(today) + '%' } }));
    root.appendChild(overlay);
  }

  function roadmapRow(p, sc) {
    var rc = ragClass(p.rag);
    var label = el('div', { cls: 'rm-label' }, [
      el('span', { cls: 'dot-rag ' + rc, attrs: { 'aria-hidden': 'true' } }),
      el('div', { cls: 'rm-text' }, [
        el('div', { cls: 'rm-name', text: p.name, attrs: { title: p.name } }),
        el('div', { cls: 'rm-meta' }, [
          domainTag(p.domain),
          el('span', { text: fmtMonth(p.start) + ' – ' + fmtMonth(p.end) })
        ])
      ])
    ]);
    var left = sc.pos(p.start);
    var width = sc.pos(p.end + DAY) - left;
    var track = el('div', { cls: 'rm-track' }, [
      el('div', {
        cls: 'rm-bar ' + rc,
        style: { left: left + '%', width: width + '%' },
        attrs: { title: p.name + ' · ' + p.rag + ' · ' + fmtMonth(p.start) + ' – ' + fmtMonth(p.end) }
      })
    ]);
    p.milestones.forEach(function (m) {
      track.appendChild(milestoneMarker(p, m, sc.pos(m.date + DAY / 2)));
    });
    return el('div', {
      cls: 'rm-row rm-project' + (p.rag === 'Red' ? ' is-red' : ''),
      attrs: { tabindex: '0', 'aria-label': p.name + ', ' + p.rag + '. Open project details.' },
      on: {
        click: function () { openDrawer(p.id); },
        keydown: function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openDrawer(p.id); } }
      }
    }, [label, track]);
  }

  function milestoneClass(p, m) {
    var cls = 'ms ' + ragClass(p.rag);
    if (m.type === 'go-live') cls += ' go-live';
    if (m.type === 'at-risk') cls += ' at-risk';
    return cls;
  }

  function milestoneMarker(p, m, leftPct) {
    var marker = el('button', {
      cls: milestoneClass(p, m),
      style: { left: leftPct + '%' },
      attrs: { type: 'button', 'aria-label': m.name + ', ' + fmtDay(m.date) + (m.type !== 'standard' ? ', ' + m.type : '') }
    });
    marker.addEventListener('mouseenter', function () { showTooltip(marker, p, m); });
    marker.addEventListener('mouseleave', hideTooltip);
    marker.addEventListener('focus', function () { showTooltip(marker, p, m); });
    marker.addEventListener('blur', hideTooltip);
    return marker;
  }

  /* ---------- Tooltip ---------- */

  function showTooltip(target, p, m) {
    var tip = $('tooltip');
    clear(tip);
    var name = el('div', { cls: 'tt-name' }, [m.name]);
    if (m.type === 'go-live') name.appendChild(el('span', { cls: 'tt-tag', text: 'Go-live' }));
    if (m.type === 'at-risk') name.appendChild(el('span', { cls: 'tt-tag', text: 'At risk' }));
    tip.appendChild(name);
    tip.appendChild(el('div', { cls: 'tt-date', text: fmtDay(m.date) + ' · ' + p.name }));
    tip.appendChild(el('div', { text: m.description }));
    tip.hidden = false;

    var r = target.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight, gap = 10;
    var left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    var top = r.top - th - gap;
    if (top < 8) top = r.bottom + gap;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideTooltip() { $('tooltip').hidden = true; }

  /* ---------- Programme Status Summary ---------- */

  var STATUS_COLUMNS = [
    { key: 'highlights', title: 'Highlights', cls: 's-high', icon: 'check' },
    { key: 'lowlights', title: 'Lowlights', cls: 's-low', icon: 'alert' },
    { key: 'risksIssues', title: 'Risks / Issues', cls: 's-risk', icon: 'warn' },
    { key: 'nextSteps', title: 'Next Steps', cls: 's-next', icon: 'arrow' },
    { key: 'decisionsNeeded', title: 'Decisions Needed', cls: 's-dec', icon: 'decide' }
  ];

  function renderStatus(list) {
    var root = $('status');
    clear(root);
    if (!state.status) return;
    $('status-sub').textContent = 'Reporting period: ' + state.status.reportingPeriod;
    var visibleIds = {};
    list.forEach(function (p) { visibleIds[p.id] = true; });
    var byId = {};
    state.projects.forEach(function (p) { byId[p.id] = p; });

    STATUS_COLUMNS.forEach(function (col) {
      var items = (state.status[col.key] || []).filter(function (item) {
        if (!item.projectIds || !item.projectIds.length) return true;
        return item.projectIds.some(function (id) { return visibleIds[id]; });
      });
      var ul = el('ul', { cls: 'status-list' });
      items.forEach(function (item) {
        var li = el('li', { cls: 'status-item' + (item.rag === 'Red' ? ' critical' : '') });
        var text = el('p', { cls: 'status-text' });
        if (item.type) {
          text.appendChild(el('span', { cls: 'status-badge ' + (item.type === 'Issue' ? 'badge-issue' : 'badge-risk'), text: item.type.toUpperCase() }));
        }
        text.appendChild(document.createTextNode(item.text));
        li.appendChild(text);
        if (item.projectIds && item.projectIds.length) {
          var links = el('div', { cls: 'status-links' });
          item.projectIds.forEach(function (id) {
            var p = byId[id];
            if (!p) return;
            links.appendChild(el('button', {
              cls: 'proj-link', text: p.name,
              attrs: { type: 'button', title: 'Open project details' },
              on: { click: function () { openDrawer(p.id); } }
            }));
          });
          li.appendChild(links);
        }
        ul.appendChild(li);
      });
      if (!items.length) ul.appendChild(el('li', { cls: 'status-empty', text: 'No items for the current filters.' }));
      root.appendChild(el('div', { cls: 'status-col ' + col.cls }, [
        el('div', { cls: 'status-head' }, [
          el('span', { cls: 'status-icon' }, [icon(col.icon)]),
          el('h3', { text: col.title }),
          el('span', { cls: 'count', text: String(items.length) })
        ]),
        ul
      ]));
    });
  }

  /* ---------- Project Portfolio table ---------- */

  function chipList(values, max, extraCls) {
    var wrap = el('div', { cls: 'chips' });
    var shown = max ? values.slice(0, max) : values;
    shown.forEach(function (v) { wrap.appendChild(el('span', { cls: 'chip' + (extraCls ? ' ' + extraCls : ''), text: v })); });
    if (max && values.length > max) {
      wrap.appendChild(el('span', { cls: 'more', text: '+' + (values.length - max) + ' more', attrs: { title: values.slice(max).join(', ') } }));
    }
    return wrap;
  }

  function sortValue(p, key) {
    if (key === 'rag') return RAG_ORDER.indexOf(p.rag);
    if (key === 'start') return p.start;
    if (key === 'name' || key === 'domain') return p[key].toLowerCase();
    return p.id;
  }

  function sortProjects(list) {
    var key = state.sort.key, dir = state.sort.dir;
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, key), vb = sortValue(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.id - b.id;
    });
  }

  function setupSorting() {
    var buttons = document.querySelectorAll('.sort-btn');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort.key === key) state.sort.dir = -state.sort.dir;
        else state.sort = { key: key, dir: 1 };
        renderTable(filtered());
      });
    });
  }

  function syncSortHeaders() {
    var buttons = document.querySelectorAll('.sort-btn');
    Array.prototype.forEach.call(buttons, function (btn) {
      var active = btn.getAttribute('data-sort') === state.sort.key;
      var th = btn.parentNode;
      if (active) th.setAttribute('aria-sort', state.sort.dir === 1 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      btn.querySelector('.sort-ind').textContent = active ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : '';
    });
  }

  function ragPill(rag) {
    return el('span', { cls: 'rag-pill ' + ragClass(rag) }, [el('span', { cls: 'dot-rag ' + ragClass(rag) }), rag]);
  }

  function renderTable(list) {
    var tbody = $('portfolio').querySelector('tbody');
    clear(tbody);
    syncSortHeaders();
    if (!list.length) {
      tbody.appendChild(el('tr', { cls: 'table-empty' }, [el('td', { text: 'No projects match the current filters.', attrs: { colspan: '8' } })]));
      return;
    }
    sortProjects(list).forEach(function (p) {
      tbody.appendChild(el('tr', {
        cls: 'row-' + p.rag.toLowerCase(),
        attrs: { tabindex: '0', 'aria-label': p.name + ', ' + p.rag + '. Open project details.' },
        on: {
          click: function () { openDrawer(p.id); },
          keydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(p.id); } }
        }
      }, [
        el('td', { cls: 'col-id', text: String(p.id) }),
        el('td', { cls: 'col-name', text: p.name }),
        el('td', { cls: 'col-domain' }, [domainTag(p.domain)]),
        el('td', {}, [ragPill(p.rag)]),
        el('td', { cls: 'col-timing' }, [
          el('div', { text: fmtMonth(p.start) + ' – ' + fmtMonth(p.end) }),
          el('div', { cls: 'timing-sub', text: monthsBetween(p.start, p.end) + ' months · ' + p.milestones.length + ' milestones' })
        ]),
        el('td', { cls: 'col-scope', text: p.scope }),
        el('td', { cls: 'col-chips' }, [chipList(p.platforms, 3)]),
        el('td', { cls: 'col-chips' }, [chipList(p.keywords, 3, 'kw')])
      ]));
    });
  }

  /* ---------- Project detail drawer ---------- */

  function section(title, content, accent) {
    return el('section', { cls: 'd-section' + (accent ? ' ' + accent : '') }, [el('h3', { text: title })].concat(content));
  }

  function scheduleSection(p) {
    var span = p.end + DAY - p.start;
    var posIn = function (t) { return Math.max(0, Math.min(1, (t - p.start) / span)) * 100; };
    var mini = el('div', { cls: 'mini-tl' }, [el('div', { cls: 'mini-bar ' + ragClass(p.rag) })]);
    if (state.today >= p.start && state.today <= p.end) {
      mini.appendChild(el('div', { cls: 'mini-today', style: { left: posIn(state.today) + '%' }, attrs: { title: 'Today' } }));
    }
    p.milestones.forEach(function (m) {
      mini.appendChild(milestoneMarker(p, m, posIn(m.date + DAY / 2)));
    });

    var list = el('ol', { cls: 'ms-list' });
    p.milestones.forEach(function (m) {
      var nameRow = el('div', { cls: 'ms-item-name' }, [m.name]);
      if (m.type === 'go-live') nameRow.appendChild(el('span', { cls: 'ms-flag go-live', text: 'GO-LIVE' }));
      if (m.type === 'at-risk') nameRow.appendChild(el('span', { cls: 'ms-flag at-risk', text: 'AT RISK' }));
      list.appendChild(el('li', { cls: 'ms-item' }, [
        el('span', { cls: 'ms-icon', attrs: { 'aria-hidden': 'true' } }, [el('span', { cls: milestoneClass(p, m) })]),
        el('div', {}, [
          el('div', { cls: 'ms-item-date', text: fmtDay(m.date).toUpperCase() }),
          nameRow,
          el('div', { cls: 'ms-item-desc', text: m.description })
        ])
      ]));
    });

    return section('Schedule & Key Milestones', [
      el('div', { cls: 'd-dates' }, [
        el('div', { cls: 'd-date' }, [el('span', { text: 'Start date' }), el('strong', { text: fmtDay(p.start) })]),
        el('div', { cls: 'd-date' }, [el('span', { text: 'End date' }), el('strong', { text: fmtDay(p.end) })]),
        el('div', { cls: 'd-date' }, [el('span', { text: 'Duration' }), el('strong', { text: monthsBetween(p.start, p.end) + ' months' })])
      ]),
      mini,
      el('div', { cls: 'mini-scale' }, [el('span', { text: fmtMonth(p.start) }), el('span', { text: fmtMonth(p.end) })]),
      list
    ], 'acc-blue');
  }

  function openDrawer(id) {
    var p = state.projects.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    hideTooltip();
    if ($('drawer').hidden) state.lastFocus = document.activeElement;

    var tags = $('drawer-tags');
    clear(tags);
    tags.appendChild(el('span', { cls: 'tag-num', text: 'Project ' + p.id }));
    tags.appendChild(el('span', { cls: 'tag-sep', text: '·', attrs: { 'aria-hidden': 'true' } }));
    tags.appendChild(domainTag(p.domain));
    tags.appendChild(el('span', { cls: 'tag-sep', text: '·', attrs: { 'aria-hidden': 'true' } }));
    tags.appendChild(ragPill(p.rag));
    $('drawer-title').textContent = p.name;

    var body = $('drawer-body');
    clear(body);
    body.appendChild(section('Scope', [el('p', { text: p.scope })], 'acc-blue'));
    body.appendChild(scheduleSection(p));
    body.appendChild(section('Technology / Platforms', [chipList(p.platforms)], 'acc-blue'));
    body.appendChild(section('Technical Keywords', [chipList(p.keywords, 0, 'kw')], 'acc-teal'));
    body.appendChild(section('Framework Alignment', [
      chipList(p.frameworks, 0, 'fw'),
      el('p', { cls: 'd-note', text: 'Relevant frameworks only; does not imply certification.' })
    ], 'acc-violet'));
    body.appendChild(section('Status · RAG Commentary', [
      el('div', { cls: 'commentary ' + ragClass(p.rag) }, [
        el('span', { cls: 'commentary-rag' }, [el('span', { cls: 'dot-rag ' + ragClass(p.rag) }), p.rag]),
        p.ragCommentary
      ])
    ], 'acc-' + p.rag.toLowerCase()));
    body.scrollTop = 0;

    $('drawer-backdrop').hidden = false;
    $('drawer').hidden = false;
    $('drawer-close').focus();
  }

  function closeDrawer() {
    if ($('drawer').hidden) return;
    hideTooltip();
    $('drawer').hidden = true;
    $('drawer-backdrop').hidden = true;
    if (state.lastFocus && document.body.contains(state.lastFocus)) state.lastFocus.focus();
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || $('drawer').hidden) return;
    var focusable = $('drawer').querySelectorAll('button, [tabindex="0"]');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Theme toggle ---------- */

  function syncThemeButton() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var btn = $('theme-toggle');
    btn.setAttribute('aria-pressed', String(dark));
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable: theme applies for this visit only */ }
    syncThemeButton();
  }

  /* ---------- Render ---------- */

  function render() {
    hideTooltip();
    var list = filtered();
    var total = state.projects.length;
    $('filter-result').textContent = list.length === total
      ? 'Showing all ' + total + ' projects'
      : 'Showing ' + list.length + ' of ' + total + ' projects';
    renderKPIs(list);
    renderRoadmap(list);
    renderStatus(list);
    renderTable(list);
  }

  /* ---------- Start ---------- */

  function start() {
    syncThemeButton();
    $('theme-toggle').addEventListener('click', toggleTheme);
    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideTooltip(); closeDrawer(); }
      trapFocus(e);
    });
    window.addEventListener('scroll', hideTooltip, { passive: true });
    window.addEventListener('resize', hideTooltip);

    Promise.all([loadJSON('data/projects.json'), loadJSON('data/portfolio-status.json')])
      .then(function (results) {
        prepare(results[0]);
        state.status = results[1];
        if (state.meta.lastUpdated) $('last-updated').textContent = fmtDay(parseDate(state.meta.lastUpdated));
        setupFilters();
        setupSorting();
        render();
      })
      .catch(function (err) {
        $('load-error').hidden = false;
        if (window.console) console.error(err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
