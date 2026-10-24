# Curb & Zoning Map: Phase 1 Implementation Plan

Oct 15, 2026 · @Charles

Phase 1 is a public GitHub Pages site that maps hand-made Burbank curb rules onto an OpenStreetMap street base, built by one person in an estimated 7 to 11 weeks part-time. Source: [Curb & Zoning Map PRD](https://claude.ai/code/artifact/4d928a71-8b77-44bd-8102-b6a140024196). Requirement IDs in this plan (FR, AR, DM) are defined in the PRD's Phase 1 requirement list.

## Assumptions locked

**Decided by the product owner**

- Plan covers Phase 1 only. Phase 2 appears only as the seams set by the four architecture rules.
- Hosting is GitHub Pages. The data is not restricted, so the public site can carry real Burbank data as it is created.
- A base street layer from OpenStreetMap covers every Burbank street, whether or not its rules have been mapped.
- Permit zones are their own polygon file, one polygon per section of the city.
- Street sweeping is day-by-day in Burbank. The schedule format must support week-of-month for later cities.
- Time controls step by the hour.

**Inferred defaults (each marked \[ASSUMPTION\], change any by editing this list)**

- &#91;ASSUMPTION\] Rule data is authored as spreadsheet rows (CSV) keyed to a street block and side. A build script turns the rows into the PRD's per-layer GeoJSON. Hand-drawing each curb line is avoided.
- &#91;ASSUMPTION\] Zoning and permit polygons are drawn by hand in a free GIS tool (QGIS or geojson.io). Burbank publishes none of this data, so every rule and polygon is created manually; only the street base comes from outside (OpenStreetMap).
- &#91;ASSUMPTION\] Blocks with no rule rows show as "not yet mapped", never as "no restrictions".
- &#91;ASSUMPTION\] At each hour step, a rule counts as active if it is in force at HH:00. Exact start and end times always show in the curb detail list.
- &#91;ASSUMPTION\] The schedule engine evaluates week-of-month now (small cost, unit-tested). Burbank data leaves it empty.
- &#91;ASSUMPTION\] "No stopping, standing or parking" is drawn from the restrictions file filtered by type. It has its own toggle and the strongest style.
- &#91;ASSUMPTION\] Layout works on phone and desktop browser widths. No GPS in Phase 1.
- &#91;ASSUMPTION\] Stack: TypeScript, Vite, MapLibre GL JS, Vitest, GitHub Actions. All free, no server.
- &#91;ASSUMPTION\] Zoning categories start as residential, commercial, mixed use, industrial, open space and public; each exact zone code maps to one in a config file.

## Scope

**In scope (Phase 1)**

- Base street layer for all of Burbank from OpenStreetMap, with street names and a "not yet mapped" state.
- Six rule layers: zoning, street sweeping, timed parking, restrictions, no stopping/standing/parking, curb colors.
- Permit zones polygon layer and a permit overview showing all zones together.
- Day picker, hourly time slider, "Now" button in Burbank time, play button.
- One toggle per layer, parallel side bands, click-through list of every rule on a curb side.
- "Zones for the day" list for timed parking.
- Data authoring workflow, schema validator and build script.
- Last-updated date and a "reference tool, not for citations" label.
- Automatic deploy to GitHub Pages.

**Out of scope (Phase 2 or later)**

- Patrol beats, live GPS, real map tiles, logins and roles, database and API, offline use, ticket import and analysis.

**Non-goals**

- Legal authority for citations.
- Holidays.
- Week-of-month data for Burbank (format and engine support it; no Burbank data uses it).
- An in-app data editor.

## Architecture and approach

A static site reads prebuilt GeoJSON files; all heavy work (joining rules to streets, offsetting sides) happens in a build script, not in the browser.

**Data flow**

1. One-time script extracts Burbank streets from OpenStreetMap and splits them into blocks (intersection to intersection), each with a stable `segment_id`. The result is committed and frozen as `data/burbank/segments.geojson`.
2. You author rules as CSV rows: `segment_id, side, layer, type, limit_minutes, permit_code, color_key, schedule`. Zoning and permit zones are drawn as polygon GeoJSON.
3. The validator checks every file against JSON Schema and reports file, row and reason for each bad row.
4. The build script joins rows to segments, adds `city_id`, and writes one GeoJSON file per layer, as the PRD data model specifies. It also writes a coverage file marking which segments have any rule.
5. The page loads those files through one loader and draws them.

**Modules** (AR-2; each a folder with no imports from the others except through the listed interface)

| Module | Job | Phase 2 change |
| --- | --- | --- |
| `basemap` | Draws OSM street base, names, unmapped style | Points at a tile source (AR-1) |
| `data-loader` | The only code that fetches data | Calls an API instead of files (AR-3) |
| `schedule-engine` | Pure functions: is a rule active, when it next changes | None |
| `layers` | Styles and draws each rule layer and side bands | None |
| `time-ui` | Day picker, hourly slider, Now, play, toggles | None |
| `curb-detail` | Click list and "zones for the day" | None |

App state (day, hour, toggles) lives in memory and the URL, never browser storage (AR-4).

**Schedule format sketch** (DM schedules, plus week-of-month)

```json
{ "windows": [ { "days": ["mon"], "start": "18:00", "end": "06:00", "weeks_of_month": [1, 3] } ] }
```

`null` means always in force. `end` earlier than `start` means the window crosses midnight. `weeks_of_month` is optional; absent means every week.

**Key choices and the main alternative rejected**

- **MapLibre GL JS** draws parallel side bands with its built-in line offset and handles a full city of lines. Rejected: Leaflet, which needs a plugin for offsets and slows with many lines.
- **Rules keyed to OSM blocks, authored as CSV.** You type rows instead of drawing lines, and partial coverage is explicit. Rejected: hand-drawn per-side LineStrings, which multiply effort and errors.
- **Side stored as N/S/E/W, converted at build time** to a left or right offset using the block's direction. Rejected: storing left/right directly, which breaks if a block's direction is reversed.
- **Frozen segments file.** Re-extracting OSM could renumber blocks and orphan your rows, so re-extraction is a deliberate step that reports changed IDs. Rejected: fetching OSM live on each build.
- **Prebuilt files on GitHub Pages.** No server, free, and the loader is the only thing Phase 2 replaces. Rejected: a database now, which adds hosting with no Phase 1 need.

## Work breakdown

30 tasks across seven milestones. Sizes: S = up to 1 day, M = 2 to 4 days, L = 1 to 2 weeks, all part-time. Estimates assume OSM data for Burbank is usable as-is and exclude your time creating rule data and drawing polygons, all of which is manual.

| ID | Task | Depends on | Size | Done when (binary) | Req |
| --- | --- | --- | --- | --- | --- |
| M0-1 ✅ | Repo, Vite + TypeScript, lint, Vitest, folder per module | none | S | `npm test` and `npm run build` pass on a clean clone | AR-2 |
| M0-2 ✅ | GitHub Actions deploy to Pages | M0-1 | S | A push to main updates the live URL | Phasing |
| M1-1 ✅ | Script: extract Burbank streets from OSM, split into blocks, assign `segment_id` | M0-1 | M | Every named Burbank street appears; no block crosses an intersection | FR-12 |
| M1-2 ✅ | Base street layer with names | M1-1 | S | Streets and names render citywide | FR-12 |
| M1-3 ✅ | Spike: three offset bands per side in a dense area | M1-1 | M | Bands stay separate at corners and on the shortest block at zoom 17 | FR-9, FR-11 |
| M2-1 ✅ | Schedule engine: active-at, next-change, midnight crossing, null, week-of-month | M0-1 | M | Unit tests pass for each case, including Sunday-to-Monday wrap | DM-1, FR-9 |
| M2-2 ✅ | JSON Schemas for every file, including city config (time zone, zoning map) | M0-1 | M | Schemas cover every PRD data-model field | DM-2 |
| M2-3 ✅ | Validator CLI with file, row and reason output | M2-2 | S | A seeded bad row is reported with its row number | DM-3 |
| M2-4 ✅ | Build script: CSV + segments to per-layer GeoJSON, side offsets, coverage file | M1-1, M2-3 | L | Sample rows yield valid GeoJSON with correct sides on N/S and E/W streets | FR-11, DM-2 |
| M2-5 ✅ | Authoring templates and README: CSV headers, polygon how-to, example rows | M2-4 | S | You can add one block of rules using only the README | DM-3 |
| TD-1 ✅ | Sample dataset `data/burbank-sample/` (30 connected segments, empty rule files), `DATA_SET` setting for validate, build:data and the loader, sample banner | M2-4 | S | `validate` and `build:data` pass on the empty sample set and the banner shows | Testing |
| TD-2 ✅ | Sparse citywide sample data: made-up rules on a spread of segments across all of Burbank (about 1 in 15), all four rule layers, plus a few `SAMPLE-` zoning and `DEMO-` permit polygons across the city. Replaces the 30-segment `area.json` limit with the whole segments file. Generator script, seeded so output is repeatable | TD-1, M2-4 | M | `validate` and `build:data` pass on the sample set; every rule layer has rows in at least 4 distinct parts of the city; unmapped blocks still outnumber mapped ones | Testing |
| M3-1 ✅ | Data loader, single entry point. CI runs `npm run build:data` for every city folder under `data/` (generated `public/` is gitignored); the loader takes a city_id and reads `data/<city_id>/` paths, so a new city needs only a data folder | M2-4 | S | A search finds no data fetch outside the loader; the deployed site serves the built files for every city folder | AR-3 |
| M3-2 ✅ | Not-yet-mapped style from coverage file | M1-2, M3-1 | S | Unmapped blocks show hatched; clicking says "not yet mapped" | FR-12 |
| TD-3 ✅ | Citywide sample zoning: extend the generator so `SAMPLE-` zoning polygons tile the whole city (grid cells snapped to street lines, groups of whole blocks). Changed after first delivery: inner borders between cells are wiggled with seeded extra points that both neighbours share, so zones are many-sided polygons, not rectangles; the outer edge stays straight. Codes `SAMPLE-R1`, `C1`, `C2`, `MU`, `M1`, `OS`, `P`; `C1` and `C2` share a category to test the code map; adds a `public` category | TD-2, M3-2 | S | `validate` passes; every point in the city falls in exactly one zone; every category appears in at least 2 separate places | Testing |
| M3-3 ✅ | Zoning polygons, category colors from code map | M3-1 | S | Each zone code shows its category color | FR-3 |
| TD-4 ✅ | Day-by-day sample sweeping: extend the generator's sweeping rules so about half the city (checkerboard of a 4 x 4 area grid) gives each mapped block a single-day window per side, with the opposite sides on different days (for example N Monday 08:00–10:00, S Tuesday 08:00–10:00). Each area uses its own pair of weekdays, so areas sweep on different days. A few blocks start at 08:30 (to 10:30) to test the hourly rule. No `weeks_of_month` in the new windows (TD-9). Keeps the 1-in-15 mapped spread from TD-2 | TD-2 | S | `validate` passes; every weekday has sweeping somewhere in the city; both sides of a street are represented | Testing |
| M3-4 ✅ | Street sweeping layer | M2-1, M3-1, M1-3 | M | Active sides highlight and inactive mute at the chosen hour | FR-4 |
| M3-5 | Timed parking layer, style per limit | M2-1, M3-1, M1-3 | M | 1, 2, 3 and 4 hour limits look different | FR-5 |
| M3-6 | Restrictions layer, three styles plus permit code | M2-1, M3-1, M1-3 | M | Each type is distinct; permit code shows where set | FR-6 |
| M3-7 | No stopping/standing/parking layer | M3-6 | S | Highest-contrast style; own toggle | FR-7 |
| M3-8 | Curb colors from config | M2-1, M3-1, M1-3 | S | A new color appears after editing only the config | FR-8 |
| M3-9 | Permit zones polygons and overview | M3-1 | M | All permit zones show together with their codes | FR-10 |
| M4-1 | Shared time state and per-layer toggles | M2-1 | S | One change updates every layer | FR-1 |
| M4-2 | Day picker, hourly slider, Now (America/Los\_Angeles), play | M4-1 | M | Now matches Burbank local hour on both sides of a DST change | FR-2 |
| M4-3 | Click-through list: every rule on a side, active or not, next change | M2-1, M3-4 | M | List matches the CSV rows for that side, with correct next change | FR-9 |
| M4-4 | "Zones for the day" list | M3-5 | S | Lists each timed zone in force that day with its hours | FR-5 |
| M5-1 | Responsive layout and touch targets | M4-2 | M | All controls usable at 375 px width | FR-14 |
| M5-2 | Last-updated date and reference-tool label | M3-1 | S | Both visible on load | FR-13 |
| M5-3 | Basemap isolation check | M3-2 | S | Replacing the basemap module needs no change elsewhere | AR-1 |
| M5-4 | Storage audit | M5-1 | S | No feature breaks with browser storage blocked | AR-4 |
| M6-1 | Pilot data: one dense area, all layers | M2-5 | M | Area passes the validator and every layer has rows | Phasing |
| M6-2 | Accuracy walk: check 20 pilot curb sides against signs | M6-1 | M | 20 of 20 match or are corrected | Risk 1 |
| M6-3 | Phase 1 review and PRD handoff update | all | S | Exit criteria in the PRD are ticked or explained | Phasing |

No Phase 1 requirement is left without a task. Beats, officer location and tickets have no tasks because they are Phase 2.

## Sequencing

The first demo (one layer driven by the time slider over real streets) lands after M3-4, roughly week 4 to 6.

**Critical path:** M0-1 → M1-1 → M1-3 → M2-4 → M3-1 → M3-4 → M4-3 → M5-1 → M6-3.

**Runs in parallel**

- M2-1 (schedule engine) and M2-2 (schemas) start on day one; neither needs the map.
- M0-2 (deploy) any time after M0-1.
- Your data entry (M6-1) starts as soon as M2-5 gives you templates, alongside M3 and M4.
- M3-3 (zoning) and M3-9 (permit zones) need only the loader, not the band spike.

**Milestones**

1. M0, setup: week 1.
2. M1, streets and the band spike: weeks 1 to 2. The riskiest step; if bands fail, the side-offset design changes before anything else is built.
3. M2, schedule engine and data pipeline: weeks 2 to 4.
4. M3, layers: weeks 4 to 7.
5. M4, time controls and curb detail: weeks 5 to 8.
6. M5, polish and architecture checks: weeks 8 to 9.
7. M6, pilot data and review: weeks 8 to 11, paced by your data entry.

Ranges depend on hours per week (assumed 10 to 15) and how much of the code Claude Code writes on the first attempt.

## Testing and rollout

The schedule engine and the build script carry the correctness risk, so they get automated tests; the map gets a manual checklist.

- **Unit tests (Vitest):** schedule engine cases (midnight crossing, null, week-of-month, week wrap, DST), side-to-offset conversion, zone-code-to-category mapping.
- **Data tests:** validator runs in CI on every push; a bad row fails the build so broken data never deploys.
- **Manual map checklist** per release: one phone and one desktop browser; each layer toggles; Now matches the clock; a known curb side lists the right rules.
- **Field check:** M6-2 accuracy walk of 20 curb sides.
- **Rollout:** every merge to main deploys to Pages. Work happens on short branches, one task each.
- **Rollback:** revert the commit; Pages redeploys the previous version in minutes.

**Phase 1 exit criteria** \[ASSUMPTION: derived, since the PRD has no metrics; the PRD roadmap gates override these\]

- [ ] All six rule layers and permit zones render for the pilot area.
- [ ] Hourly time controls drive every layer, and Now is correct in Burbank time.
- [ ] Every Burbank street shows, with unmapped blocks clearly marked.
- [ ] Curb detail lists every rule with its next change, matching the source rows.
- [ ] 20 of 20 walked curb sides match the map.
- [ ] Swapping the basemap or the loader touches only that module.
- [ ] Adding a block of rules takes the README alone.

## Risks and mitigations

| Risk | Effect | Owner | Mitigation |
| --- | --- | --- | --- |
| Side bands overlap at corners and short blocks | Map unreadable | Developer | M1-3 spike before any layer; trim band ends, minimum width |
| OSM blocks don't match real curb segments (mid-block rule changes) | Rules land on the wrong stretch | Data author | Allow a row to cover part of a block by start and end distance \[ASSUMPTION: add only if the pilot needs it\] |
| Re-extracting OSM renumbers blocks | CSV rows orphaned | Developer | Freeze segments file; re-extract script reports changed IDs |
| Hand-entered data errors | Wrong rule shown | Data author | Validator in CI, accuracy walk, last-updated date, reference label |
| Hourly steps hide half-hour rules | Rule looks inactive near its start | Developer | Detail list shows exact times; documented in the UI help |
| Data entry slower than coding | Phase 1 shows little coverage | Product owner | Pilot one dense area first; unmapped state keeps partial data honest |
| OSM licence | Missing credit | Developer | Show "© OpenStreetMap contributors" on the map |
| Large citywide files slow on phones | Laggy map | Developer | Simplify geometry at build; full test is a Phase 2 exit item |

## Open items

| Item | Blocking? | Needed by |
| --- | --- | --- |
| Pick the polygon drawing tool (QGIS or geojson.io); Burbank publishes no boundaries, so all are hand-drawn | Non-blocking | M3-3, M3-9 |
| Final zoning category grouping for the 25 to 30 codes | Non-blocking | M3-3 (defaults used until set) |
| How many permit zone types exist and their codes | Non-blocking | M3-9 |
| Which pilot area to map first | Blocking for M6-1 | Week 3 |
| PRD roadmap gates, if they differ from the exit criteria here | Non-blocking | M6-3 |

## Using this plan with Claude Code in VS Code

Put the PRD and this plan inside the repo, give Claude Code a short rules file, then build one task ID at a time.

**One-time setup**

1. Install the Claude Code extension from the VS Code marketplace, then sign in when prompted.
2. Create an empty GitHub repo (`parklas`), clone it, and open the folder in VS Code.
3. Export the PRD and this plan as Markdown (each doc's export menu) and save them as `docs/PRD.md` and `docs/PLAN.md`.
4. Create `CLAUDE.md` at the repo root with the text below. Claude Code reads it at the start of every session.
5. In GitHub, set Pages to deploy from GitHub Actions (Settings, Pages, Source).

**CLAUDE.md starter**

```markdown
# Curb & Zoning Map

Read docs/PRD.md and docs/PLAN.md before any task. Work only on the task ID I name.

## Stack
TypeScript, Vite, MapLibre GL JS, Vitest, GitHub Actions to GitHub Pages. No server.

## Architecture rules (never break)
1. basemap is one module; nothing else imports it.
2. Modules: basemap, data-loader, schedule-engine, layers, time-ui, curb-detail. Talk only through each module's index.ts.
3. All data is fetched through data-loader. No fetch() anywhere else.
4. No localStorage, sessionStorage or IndexedDB for anything that matters. State lives in memory and the URL.

## Data
- City data in data/<city_id>/. Burbank time zone: America/Los_Angeles.
- segments.geojson is frozen. Never regenerate it unless the task says so.
- Rule rows are CSV keyed by segment_id and side (N/S/E/W).

## Working rules
- Write tests first for schedule-engine and build scripts.
- Run npm test and npm run build before saying a task is done.
- Do not add features beyond the task. If the plan is unclear, ask.
- When a task is done, tick it in docs/PLAN.md and list what changed.
```

**The loop for each task**

1. Start a branch named after the task, for example `m2-1-schedule-engine`.
2. Ask Claude Code to plan first (use plan mode), then approve or correct the plan.
3. Let it build, then read the diff in VS Code before accepting.
4. Check the task's "Done when" column yourself, then commit, push and merge.
5. Start a fresh conversation for the next task so old context doesn't leak in.

**Prompts to copy**

- Start a task: `Do task M2-1 from docs/PLAN.md. Plan first, write tests first, and stop when the "Done when" check passes.`
- Review: `Check this branch against the four architecture rules in CLAUDE.md and list any breaks.`
- Data help: `Validate data/burbank/ and explain each error in plain words, with the row to fix.`
- Stuck: `This failed: <paste error>. Explain the cause before changing any code.`

**Habits that help a solo builder**

- Do M1-3 (the band spike) early, even if it feels like a detour; it decides the map's look.
- Keep tasks small. If Claude Code's plan touches more than two modules, split the task.
- Update `docs/PLAN.md` as you go; it becomes the record for the Phase 2 handoff in the PRD.
