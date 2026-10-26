# Curb & Zoning Map: Phase 1 Implementation Plan

Oct 15, 2026 · @Charles · Updated Oct 25, 2026

Phase 1 is a public GitHub Pages site that maps hand-made Burbank curb rules onto an OpenStreetMap street base. Source: [Curb & Zoning Map PRD](https://claude.ai/code/artifact/4d928a71-8b77-44bd-8102-b6a140024196), also in `docs/PRD.md`. Requirement IDs (FR, AR, DM) are defined in the PRD. Delivery details for each finished task are in its commit.

## Decisions

- Phase 1 only. Phase 2 appears only as the seams set by the four architecture rules in `CLAUDE.md`.
- Data is not restricted, so the public site can carry real Burbank data.
- An OpenStreetMap base covers every Burbank street. Blocks with no rule rows show as "not yet mapped", never as "no restrictions".
- Rules are CSV rows keyed to a block and side. Zoning and permit polygons are drawn by hand (QGIS or geojson.io); Burbank publishes none of this data.
- Permit zones A to H are their own polygon file, never overlap, and are separate from zoning. A rule row has at most one permit code: "required" on an except-by-permit restriction, "exempt" elsewhere.
- The zone filter uses each side's permit zone, found at build time from the polygons. No route is marked by hand.
- Sweeping in Burbank is day-by-day. The format and engine also support week-of-month for later cities.
- Time controls step by the hour. A rule counts as active if it is in force at HH:00; the detail list shows exact times. A time mode switches between that hour, the whole chosen day, and all times (M5-8).
- Each data folder has its own route: `/burbank/` is real data, `/burbank-sample/` is sample data, and each has its own `authoring.html`. The folder in the path picks the data, so one deploy serves every city and data set (M5-7).
- No stopping/standing is drawn from the restrictions file, with its own toggle and the strongest style.
- Zoning categories: residential, commercial, mixed use, industrial, open space, public. Each zone code maps to one in a config file.
- Works at phone and desktop widths. No GPS in Phase 1.

## Scope

**In scope:** OSM street base with names and a "not yet mapped" state; six rule layers (zoning, sweeping, timed parking, restrictions, no stopping/standing, curb colors); permit zones and overview; zone filter; day picker, hourly slider, Now in Burbank time, play; per-layer toggles, side bands and a click-through list; "active zones"; authoring templates, validator and build script; last-updated date and reference-tool label; automatic deploy.

**Out of scope:** patrol beats, live GPS, real map tiles, logins, database and API, offline use, tickets, legal authority for citations, holidays, an in-app data editor.

## Architecture

A static site reads prebuilt GeoJSON. All heavy work happens in build scripts, not the browser.

**Data flow**

1. A one-time script extracts Burbank streets from OSM and splits them into blocks with a stable `segment_id`. The result is frozen as `data/burbank/segments.geojson`. A deliberate re-extraction reports changed IDs and reversed directions.
2. Rules are authored as CSV rows: `segment_id, side, layer, type, limit_minutes, permit_code, permit_mode, color_key, schedule`. `side` is L or R, relative to the segment's direction.
3. The validator checks every file against JSON Schema and reports file, row and reason.
4. `build:data` writes one GeoJSON file per layer, a coverage file, `trim.json` (band geometry flags), `blocks.json` (block numbers), `metadata.json` (last updated), `permit-zone-bounds.json` (each permit zone's bounds and outside-the-zone mask, M5-9), and a `permit_zone` on every side's features.
5. The page at `/<folder>/` loads `data/<folder>/` through the data loader and draws it (M5-7).

**Modules** (AR-2)

| Module | Job | Phase 2 change |
| --- | --- | --- |
| `basemap` | OSM street base, names, unmapped style | Tile source (AR-1); only `src/basemap/basemap.ts` changes |
| `data-loader` | The only code that fetches data | Calls an API (AR-3) |
| `schedule-engine` | Pure functions: is a rule active, when it next changes | None |
| `layers` | Styles and draws each rule layer and side bands | None |
| `time-ui` | Day picker, slider, Now, play, time mode, toggles, zone filter | None |
| `curb-detail` | Click-through list and "active zones" | None |

**Schedule format**

```json
{ "windows": [ { "days": ["mon"], "start": "18:00", "end": "06:00", "weeks_of_month": [1, 3] } ] }
```

`null` means always in force. `end` before `start` crosses midnight. `weeks_of_month` is optional; absent means every week.

**Key choices**

- **MapLibre GL JS** for built-in line offsets at city scale, over Leaflet.
- **L/R sides**, because Burbank's grid is rotated about 45 degrees from compass (`docs/spike-notes.md`). City-grid labels are derived for display only.
- **Frozen segments file**, so re-extracting OSM cannot orphan rule rows.
- **Prebuilt files on GitHub Pages**: no server, and the loader is the only thing Phase 2 replaces.

## Work breakdown

Sizes: S = up to 1 day, M = 2 to 4 days, L = 1 to 2 weeks, part-time. Estimates exclude the manual work of creating rule data and polygons.

**Done**

| ID | Task | Req |
| --- | --- | --- |
| M0-1 ✅ | Repo, Vite + TypeScript, lint, Vitest, folder per module | AR-2 |
| M0-2 ✅ | GitHub Actions deploy to Pages | Phasing |
| M1-1 ✅ | Extract Burbank streets from OSM, split into blocks, assign `segment_id` | FR-12 |
| M1-2 ✅ | Base street layer with names | FR-12 |
| M1-3 ✅ | Spike: offset bands per side in a dense area (`docs/spike-notes.md`) | FR-9, FR-11 |
| M2-1 ✅ | Schedule engine: active-at, next change, midnight crossing, null, week-of-month | DM-1, FR-9 |
| M2-2 ✅ | JSON Schemas for every file, including city config | DM-2 |
| M2-3 ✅ | Validator CLI with file, row and reason output | DM-3 |
| M2-4 ✅ | Build script: CSV + segments to per-layer GeoJSON and coverage file | FR-11, DM-2 |
| M2-5 ✅ | Authoring templates and `data/README.md` | DM-3 |
| M2-6 ✅ | Switch `side` from N/S/E/W to L/R; re-extraction reports reversed segments | FR-11, DM-2 |
| M2-7 ✅ | Authoring map page: segment IDs, direction arrows, L/R sides, click to copy | DM-3, FR-11 |
| M2-8 ✅ | Band geometry flags in `trim.json` (end trim, slivers, inner sides) and one shared band config | FR-9, FR-11 |
| M2-9 ✅ | Build-time `permit_zone` per side; overlap, unknown-code and mismatch checks; validator warnings | FR-10 |
| M3-1 ✅ | Data loader taking a `city_id`; CI builds every city folder | AR-3 |
| M3-2 ✅ | Not-yet-mapped style from the coverage file | FR-12 |
| M3-3 ✅ | Zoning polygons, category colors from the code map | FR-3 |
| M3-4 ✅ | Street sweeping layer | FR-4 |
| M3-5 ✅ | Timed parking layer, style per limit, "Zone X permit exempt" label | FR-5 |
| M3-6 ✅ | Restrictions layer with permit wording; added the `permit_mode` column (`required` or `exempt`) | FR-6 |
| M3-7 ✅ | No stopping (solid) and no standing (dashed) black band in slot 3 | FR-7 |
| M3-8 ✅ | Curb colors from `curb-colors.json`; a row's own schedule overrides the default | FR-8 |
| M3-9 ✅ | Permit zone polygons with codes and legend | FR-10 |
| M3-10 ✅ | Layers apply the band geometry flags through one shared helper | FR-9, FR-11 |
| M4-1 ✅ | Shared state (day, hour, toggles) in memory and the URL | FR-1 |
| M4-2 ✅ | Day picker, hourly slider, Now in Burbank time across DST, play | FR-2 |
| M4-3 ✅ | Click-through list: every rule per side, active state, next change, permit zone | FR-9 |
| M4-4 ✅ | "Active zones" list for timed parking | FR-5 |
| M4-5 ✅ | Zone filter (All, each zone, No zone) on every rule layer, kept in the URL | FR-10 |
| M5-1 ✅ | Responsive layout and 44 px touch targets; bottom panel at 700 px and narrower | FR-14 |
| M5-2 ✅ | Last-updated date and reference-tool label | FR-13 |
| M5-3 ✅ | Basemap isolation test covering the app and the authoring page | AR-1 |
| M5-4 ✅ | Storage audit and a test that fails on any browser storage use | AR-4 |
| M5-5 ✅ | Block numbers from OSM addresses in `blocks.csv`, shown in the curb detail heading | FR-9, DM-3 |
| M5-6 ✅ | Consistent block direction: Olive runs outward from the West/East Olive split just south of Front Street (northeast on East Olive, southwest on the rest), North/South streets outward from Olive, other East/West streets outward like Olive. Set by name prefix, then a prefixed namesake, then the local grid. Same ids; 1,185 blocks reversed with `from_street`/`to_street` swapped; the extraction applies the rule; `trim.json` and the sample set (new `SAMPLE_SEED`) regenerated | FR-11, DM-3 |
| TD-1 ✅ | Sample data set, `DATA_SET` setting and sample banner | Testing |
| TD-2 ✅ | Seeded citywide sample rules on all layers, plus `SAMPLE-` zoning and `DEMO-` permit polygons | Testing |
| TD-2.2 ✅ | Denser sample data. Target share: **75%** of blocks carry a rule row. A test compares this value with `TARGET_MAPPED_SHARE` in `scripts/lib/sample-data.ts`; to change it, edit both, untick, and re-run TD-2.2 | Testing |
| TD-3 ✅ | Sample zoning tiling the whole city with shared, irregular borders | Testing |
| TD-4 ✅ | Day-by-day sample sweeping, opposite sides on different days | Testing |
| TD-5 ✅ | Sample timed parking, weighted toward commercial zones | Testing |
| TD-5.2 ✅ | Revision of TD-5: limits 30 to 240 minutes spread citywide | Testing |
| TD-6 ✅ | Sample restrictions of all five types | Testing |
| TD-7 ✅ | Sample curb colors and config, five colors | Testing |
| TD-8 ✅ | Eight generated `DEMO-` permit zones along street lines | Testing |
| TD-9 ✅ | Sample edge cases and `data/burbank-sample/test-cases.md` | Testing |

**Remaining**

| ID | Task | Depends on | Size | Done when | Req |
| --- | --- | --- | --- | --- | --- |
| M2-7.2 ✅ | Revision of M2-7: the authoring page shows the longitude and latitude of the last point clicked on the map, in a fixed box at the bottom right. The box is empty until the first click and updates on every click, on a block or off it. Authoring page only; the public page is unchanged. Click-to-copy of the segment ID is unchanged. State stays in memory | M2-7 | S | After a click the box shows that point's coordinates to 6 decimals; a later click replaces them; the public page has no such box; `npm test` and `npm run build` pass | DM-3 |
| M5-7 ✅ | City routes. Each data folder gets its own pages: `/burbank/` loads `data/burbank/`, `/burbank-sample/` loads `data/burbank-sample/`, and the authoring page is `/<folder>/authoring.html` (lowercase, since Pages paths are case-sensitive). Recommended approach: the build emits a real `index.html` and `authoring.html` in a folder per data folder (Vite multi-page entries generated from the `data/` folders), so every route is a real file on GitHub Pages, with no 404-redirect trick, and returns 200. The page reads its folder from its own path; the data loader resolves `data/` from the site root, not the page's folder. The sample banner shows when the folder is a sample set, replacing the page-level `DATA_SET` (the scripts keep it). The site root is a page listing the folders to choose from, with the default folder named in `config/` marked (`burbank-sample` until TD-10), and `/authoring.html` redirects to that folder's authoring page. An unknown path gets a 404 page listing the folders that exist. The query state (day, hour, toggles, zone) works the same on every route | M3-1, TD-1 | M | One build serves `/burbank/` and `/burbank-sample/`, each with its own data and the banner only on the sample one; `/burbank/authoring.html` and `/burbank-sample/authoring.html` load their own data; the root lists every folder and links to each; `/authoring.html` redirects to the default folder's authoring page; an unknown path shows the 404 list; a new data folder gets its routes with no code change; the basemap isolation and storage tests still pass; `npm test` and `npm run build` pass | AR-3, DM-2 |
| M5-8 ✅ | Time mode with three settings, kept in memory and the URL (`mode=day` or `mode=all`; absent means hour). **Hour** is today's behavior. **Day**: a rule counts as active if any window is in force at any minute of the chosen day, including a window that began the night before; the slider and play are disabled, the day picker works. **All times**: every rule is drawn as active whatever its schedule; the day picker, slider and play are disabled. Now switches back to Hour. A new pure schedule-engine function answers "active at any time on this day", handling midnight crossing, null and week-of-month the same way Hour does. Every rule layer and the zone filter follow the mode. The curb detail list says which mode is on: Hour is unchanged, Day lists each rule's windows that day or "Not active today", All times lists each rule's full schedule | M2-1, M4-1, M4-2, M4-3 | M | Engine tests cover a window crossing into and out of the day, null, week-of-month and a rule on another day only; a Mon 18:00–06:00 rule is active on Mon and Tue in Day mode and inactive on Wed; switching modes redraws every layer with no reload; Now returns to Hour; the mode survives a reload from the URL; `npm test` and `npm run build` pass | FR-1, FR-2, FR-9, DM-1 |
| M5-9 ✅ | Isolate a permit zone, building on the M4-5 filter. Choosing a zone (A to H; `DEMO-` codes in the sample set) in the filter, or by clicking its polygon or legend entry, isolates it: only that zone's polygon shows, the map fits to it, the area outside is dimmed, and every rule layer stays limited to that zone as now. All shows every zone again without moving the map; No zone is unchanged. The build writes each zone's bounds and an outside-the-zone mask, so the page does no geometry. The existing `zone` URL value carries it, so a link with `zone=C` opens isolated and fitted to Zone C | M3-9, M4-5 | M | Picking C shows only Zone C's polygon, fits the map to it and dims the rest; clicking another zone's polygon or legend entry isolates that zone; a link with `zone=C` opens isolated; All restores every zone; works on both `burbank` and `burbank-sample`; `npm test` and `npm run build` pass | FR-10 |
| TD-10 | Switch the public site to real data: `data/burbank/` holds empty rule files from the templates, and the default folder in `config/` (M5-7) becomes `burbank`, so the site root opens `/burbank/`. `/burbank-sample/` stays for tests and is never the default | M2-5, M5-7 | S | A build with `DATA_SET=real` passes; the site root opens `/burbank/` with no sample banner; `public/data/burbank/` has no `SAMPLE-` or `DEMO-` codes; every block not yet entered shows as not yet mapped | Testing |
| M6-1 | Pilot data: one dense area, all layers | TD-10 | M | Area passes the validator and every layer has rows | Phasing |
| M6-2 | Accuracy walk: check 20 pilot curb sides against signs | M6-1 | M | 20 of 20 match or are corrected | Risk 1 |
| M6-4 | Revisit `docs/data-dependent-decisions.md` against the pilot data and citywide segments; set every row to Confirmed or Changed with evidence; update `docs/spike-notes.md` and the build tests for any changed value | M6-1, M6-2 | S | No row is still Set or Open; `npm test` and `npm run build` pass | FR-9, FR-11 |
| M6-3 | Phase 1 review: fill in the PRD handoff section | all | S | Every PRD exit criterion is ticked or explained | Phasing |

Order: M2-7.2, M5-7, M5-8, M5-9, TD-10, M6-1, M6-2, M6-4, M6-3. Data entry paces all of it.

## Testing and rollout

- **Unit tests (Vitest):** schedule engine (midnight, null, week-of-month, week wrap, DST), build scripts, side offsets, zone-code mapping, architecture checks.
- **Data tests:** the validator runs in CI, so a bad row never deploys.
- **Manual checklist per release:** one phone and one desktop browser; each layer toggles; Now matches the clock; a known curb side lists the right rules.
- **Field check:** the M6-2 accuracy walk.
- **Rollout:** every merge to main deploys to Pages. Rollback is a revert.

The Phase 1 exit criteria are in the PRD handoff section.

## Risks

| Risk | Mitigation |
| --- | --- |
| OSM blocks don't match real curb segments (mid-block rule changes) | Add start and end distances to a row, only if the pilot needs it |
| Hand-entered data errors | Validator in CI, accuracy walk, last-updated date, reference label |
| Hourly steps hide half-hour rules | Detail list shows exact times |
| Data entry slower than coding | Pilot one dense area first; the unmapped state keeps partial data honest |
| Large citywide files slow on phones | Simplify geometry at build; full test is a Phase 2 item |

## Open items

- **Pilot area** is not chosen yet. It blocks M6-1.
- **Browser check:** M3-7 to M3-9, M4-1 to M4-5, M5-1, M5-2, M5-5 and M5-9 were built without a browser. Check them by eye before M6-1.
- **Block numbers:** 2,404 of 2,582 blocks need hand entry; `data/burbank/blocks-report.md` is the to-do list.
- **City-grid labels** use a rough hand-measured angle that fits downtown and is off elsewhere.
- Other open questions, such as zoning category grouping and permit codes on no-stopping rows, are tracked in the PRD.

## Working with Claude Code

Rules live in `CLAUDE.md`. For each task:

1. Start a branch named after the task, for example `m6-1-pilot-data`.
2. Ask Claude Code to plan first, then approve or correct the plan.
3. Read the diff before accepting.
4. Check the task's "Done when" column, then commit, push and merge.
5. Start a fresh conversation for the next task.

Prompts to copy:

- `Do task M6-1 from docs/PLAN.md. Plan first, write tests first, and stop when the "Done when" check passes.`
- `Check this branch against the four architecture rules in CLAUDE.md and list any breaks.`
- `Validate data/burbank/ and explain each error in plain words, with the row to fix.`
