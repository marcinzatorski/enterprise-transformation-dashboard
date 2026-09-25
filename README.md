# Enterprise Transformation Portfolio Dashboard

An interactive, executive-level dashboard for a multi-year enterprise transformation programme (July 2026 – December 2028). It presents programme health, RAG status, a portfolio roadmap, items that need attention, the technology landscape and framework alignment across 15 transformation projects. The projects cover identity, security, infrastructure, network, cloud, service management, data, business applications, customer experience, business operations and the IT operating model.

It is a static site: HTML, CSS and vanilla JavaScript, with no build step, backend or framework. It runs on GitHub Pages as-is.

> **Screenshot:** _placeholder. Add an image at `docs/screenshot.png` and replace this line with `![Dashboard screenshot](docs/screenshot.png)`._

## Features

- **KPI cards**: total, Green, Amber and Red counts, plus projects active today and projects starting or ending in the next 6 months. All values are calculated from project dates and statuses. Clicking a RAG card filters by that status.
- **Filters**: free-text search, RAG, domain, year, technology/platform and framework. Every section updates together, without a page reload. Includes a Reset button.
- **Portfolio roadmap**: a Gantt-style timeline from Jul 2026 to Dec 2028 with year bands, quarter columns and a "Today" marker. Bar positions are calculated from each project's start and end dates.
- **Portfolio Attention Required**: Red and Amber projects with their RAG commentary. The Red project is highlighted as the principal programme concern.
- **Portfolio composition**: projects by transformation area, stacked by RAG.
- **Framework alignment**: the relevant frameworks per project (alignment only, not certification). Clicking a framework filters by it.
- **Technology landscape**: platforms grouped into themes with usage counts, plus technical keywords that recur across projects. Clicking a tag filters by it.
- **Project portfolio table**: a sortable table with scope, platforms and keywords. Long tag lists collapse behind "+N more".
- **Project detail panel**: dates, duration, RAG, scope, platforms, technical keywords, frameworks, RAG commentary and the project's position in the programme window.
- **Light and dark mode**: the choice is remembered in the browser. The layout is responsive, built for 1920×1080 and usable at 1366×768 and on tablets.

## Technology stack

- HTML5 (semantic markup, ARIA roles for interactive elements)
- CSS3 (custom properties for colours, spacing, typography, RAG styles and dark mode)
- Vanilla JavaScript (ES2017+, `fetch` for data loading)
- No external libraries, fonts or CDNs

## Repository structure

```
/
├── index.html          Page structure and section containers
├── styles.css          Design tokens (light/dark), layout, components
├── app.js              Data loading, statistics, filters, rendering
├── README.md
└── data/
    └── projects.json   Portfolio data (source of truth for the UI)
```

## Running locally

The page loads `data/projects.json` with `fetch`, so it must be served over HTTP. Opening `index.html` directly from disk will not work.

```bash
# from the repository root
python -m http.server 8000
# then open http://localhost:8000
```

Any static file server works, for example `npx serve` or the VS Code Live Server extension.

## Deploying to GitHub Pages

1. Commit all files to the `main` branch, keeping the `data/` folder.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, select **main** and **/ (root)**, then click **Save**.
4. After about a minute the site is available at `https://<username>.github.io/<repository>/`.

All paths are relative, so the site works from the repository sub-path without any configuration.

## Data model

`data/projects.json` contains four top-level keys:

| Key | Purpose |
|---|---|
| `meta` | Title, subtitle, programme window (`programmeStart`, `programmeEnd`), `lastUpdated`, source note |
| `transformationAreas` | Groups source domains into five transformation areas, used for the composition chart |
| `technologyGroups` | Groups platform names into landscape themes (only terms that appear in the data) |
| `projects` | One object per project (below) |

Project fields:

| Field | Type | Example |
|---|---|---|
| `id` | number | `15` |
| `projectName` | string | `New Call Centre Onboarding & Operational Readiness` |
| `domain` | string | `Business Operations` |
| `startDate` / `endDate` | ISO date string | `2026-09-01` / `2027-04-30` |
| `rag` | `Green` \| `Amber` \| `Red` | `Red` |
| `scope` | string | Scope statement |
| `platforms` | string[] | `["CCaaS", "Telephony", "IVR", …]` |
| `technicalKeywords` | string[] | `["Contact Centre", "Cutover", …]` |
| `frameworks` | string[] | `["Business Continuity", "IT Service Continuity"]` |
| `ragCommentary` | string | Current RAG narrative |
| `attention` *(optional)* | object | `issueType` and `impactAreas`, a structured summary of the RAG commentary shown in the attention panel |

Timing labels, durations, the years each project spans and all KPI figures are calculated in `app.js` and are not stored in the data file.

### Updating the data

Edit `data/projects.json` and commit. KPIs, filter options, the roadmap and every chart are regenerated from the file. If you add a new platform, also add it to a group in `technologyGroups` so it appears in the landscape. If you add a new domain, add it to `transformationAreas`.

## Licence

MIT. See [LICENSE](LICENSE).
