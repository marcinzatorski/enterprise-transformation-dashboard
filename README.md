# Enterprise Transformation Portfolio Dashboard

An interactive, executive-level dashboard for a multi-year enterprise transformation programme (July 2026 – December 2028). It presents programme health, RAG status, a portfolio roadmap with key milestones, a programme status summary and a project portfolio with detailed project status reports across 15 transformation projects. The projects cover identity, security, infrastructure, network, cloud, service management, data, business applications, customer experience, business operations and the IT operating model.

It is a static site: HTML, CSS and vanilla JavaScript, with no build step, backend or framework. It runs on GitHub Pages as-is.

> **Screenshot:** _placeholder. Add an image at `docs/screenshot.png` and replace this line with `![Dashboard screenshot](docs/screenshot.png)`._

## Features

- **Filters**: free-text search (including milestone names), RAG, domain, year, technology/platform and framework. Every section updates together, without a page reload. Includes a Reset button.
- **KPI cards**: total, Green, Amber and Red counts, projects active today, projects starting or ending in the next 6 months, and milestones due in the next 90 days (with the number at risk). All values are calculated from the data. Clicking a RAG card filters by that status.
- **Portfolio roadmap**: a Gantt-style timeline from Jul 2026 to Dec 2028 with year bands, quarter columns, a "Today" marker, domain labels and RAG indicators.
  - Each project shows 2–3 milestone diamonds, positioned by date. Go-live and at-risk milestones are highlighted.
  - Hovering over or focusing a milestone or bar shows a tooltip. It works with the keyboard and in both themes, and stays inside the window.
- **Programme Status Summary**: Highlights, Lowlights, Risks / Issues, Next Steps and Decisions Needed, loaded from `data/portfolio-status.json`. Items linked to projects follow the filters and open the project detail.
- **Project portfolio table**: sortable, with domain, RAG, timing, scope, platforms and keywords. Long tag lists collapse behind "+N more".
- **Project detail panel**: a short project status report with scope; schedule and key milestones (start, end, calculated duration and a milestone timeline); technology/platforms; technical keywords; framework alignment; and RAG commentary.
- **Light and dark mode**: a sun/moon switch in the header. The choice is saved in the browser, and the operating system setting is used by default. Each theme has its own colour palette.
- **Responsive**: built for 1920×1080 and usable at 1366×768 and on tablets. The roadmap scrolls horizontally on narrow screens.

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
    ├── projects.json          Portfolio data incl. milestones (source of truth for the UI)
    └── portfolio-status.json  Programme Status Summary content
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

### `data/projects.json`

Four top-level keys:

| Key | Purpose |
|---|---|
| `meta` | Title, subtitle, programme window (`programmeStart`, `programmeEnd`), `lastUpdated`, source note |
| `transformationAreas` | Groups source domains into five transformation areas, used for domain label colours |
| `technologyGroups` | Groups platform names into themes (kept for reference; not currently displayed) |
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
| `milestones` | object[] | 2–3 per project: `name`, `date` (ISO, within the project dates), `type` (`gate` \| `delivery` \| `go-live`), `status` (`on-track` \| `at-risk`), `description` |
| `attention` *(optional)* | object | `issueType` and `impactAreas`, a structured summary of the RAG commentary |

Timing labels, durations, the years each project spans, milestone positions and all KPI figures are calculated in `app.js` and are not stored in the data file.

### `data/portfolio-status.json`

`reportingPeriod`, plus five arrays: `highlights`, `lowlights`, `risksIssues`, `nextSteps` and `decisionsNeeded`. Each item has a `text` and an optional `projectIds` array, which links it to projects so it follows the filters. Items without `projectIds` are programme-wide and always shown. Risk / issue items can also have a `type` (`Risk` or `Issue`) and a `rag`. Milestones and status content are illustrative demo data, aligned to each project's scope, dates and RAG commentary.

### Updating the data

Edit `data/projects.json` or `data/portfolio-status.json` and commit. KPIs, filter options, the roadmap, milestones and the status summary are regenerated from the files. If you add a new domain, also add it to `transformationAreas` so it gets a domain colour.

## Licence

MIT. See [LICENSE](LICENSE).
