# Enterprise Transformation Portfolio Dashboard

A static, read-only dashboard for a demonstration enterprise transformation programme (July 2026 – December 2028). It shows 15 projects with their RAG status, a portfolio roadmap with milestones, a programme status summary, a project portfolio table and a project detail panel.

Live site: https://marcinzatorski.github.io/programme-portfolio-dashboard/

## Features

- **Filters**: search (project, domain, scope, platform, keyword, framework or milestone), RAG, domain, year, technology / platform and framework. Filters run in the browser on data that is already loaded. Nothing is submitted or sent.
- **KPI cards**: total, Green, Amber and Red counts, projects active now, projects starting and ending in the next 6 months, and milestones due in the next 90 days. All values are calculated from the data. Clicking a RAG card filters by that status.
- **Portfolio roadmap**: years, quarters, a Today line, project bars filled with the RAG colour and milestone diamonds. Go-live milestones are larger and at-risk milestones have a thick dark outline. Hover or keyboard focus shows the milestone name, date and description.
- **Programme Status Summary**: Highlights, Lowlights, Risks / Issues, Next Steps and Decisions Needed. Items linked to projects follow the filters.
- **Project Portfolio**: a table of all projects. Select a row to open the project detail panel.
- **Project detail panel**: scope, schedule (start, end, duration, mini timeline, milestones), technology / platforms, technical keywords, framework alignment and RAG commentary.
- **Light and dark mode**: the choice is saved in this browser's `localStorage`. The operating system setting is used by default.

## Structure

```
/
├── index.html                 Page structure
├── styles.css                 Styles, light and dark themes
├── app.js                     Data loading, filters and rendering (plain JavaScript)
├── README.md
└── data/
    ├── projects.json          15 projects from the Excel workbook, plus milestones
    └── portfolio-status.json  Programme Status Summary content
```

There is no build step, package manager or framework.

## Data

`data/projects.json` is generated from `IT_Transformation_Programme_Portfolio.xlsx` (sheet "Portfolio Data"). Project names, domains, dates, RAG, scope, platforms, keywords, frameworks and RAG commentary are taken from the workbook without changes. Semicolon-separated cells are stored as arrays.

The milestones (2–3 per project) and the Programme Status Summary are illustrative demonstration content, aligned with each project's scope, dates and RAG commentary.

Portfolio totals: 15 projects, 11 Green, 3 Amber, 1 Red (New Call Centre Onboarding & Operational Readiness).

## Running locally

The page loads its JSON with `fetch`, so it needs to be served over HTTP:

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Deployment

GitHub Pages, "Deploy from a branch", branch `main`, folder `/ (root)`. All paths are relative.

## Security & Privacy

- This is a static portfolio / demonstration dashboard. It is not an official company portal.
- It has no authentication: no login, sign-in, registration or password fields.
- It collects no personal data. There are no forms. Filters and search only work on data already loaded in the browser.
- It contains no analytics, tracking, cookies, advertising or embedded third-party content.
- It uses no external runtime dependencies: no CDNs, web fonts, external images or external APIs. Fonts are the system fonts; icons are drawn with CSS and inline SVG.
- All data is static demonstration data stored in this repository.
- The site makes only same-origin requests: `index.html`, `styles.css`, `app.js`, `data/projects.json` and `data/portfolio-status.json`.
- A Content Security Policy in `index.html` restricts scripts, styles, data and images to the site's own origin and blocks forms, plugins and framing of other content.
- There are no redirects, pop-ups, iframes, service workers or web app manifests. The only browser storage used is `localStorage` for the light / dark theme.

When changing the site, keep these properties: do not add external scripts, fonts, trackers, forms or redirects.
