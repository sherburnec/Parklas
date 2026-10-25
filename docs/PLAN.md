# Curb & Zoning Map: Phase 1 Implementation Plan

Oct 15, 2026 · @Charles

Phase 1 is a public GitHub Pages site that maps hand-made Burbank curb rules onto an OpenStreetMap street base, built by one person in an estimated 7 to 11 weeks part-time. Source: [Curb & Zoning Map PRD](https://claude.ai/code/artifact/4d928a71-8b77-44bd-8102-b6a140024196). Requirement IDs in this plan (FR, AR, DM) are defined in the PRD's Phase 1 requirement list.

## Assumptions locked

**Decided by the product owner**

- Plan covers Phase 1 only. Phase 2 appears only as the seams set by the four architecture rules.
- Hosting is GitHub Pages. The data is not restricted, so the public site can carry real Burbank data as it is created.
- A base street layer from OpenStreetMap covers every Burbank street, whether or not its rules have been mapped.
- Permit zones are their own polygon file, one polygon per section of the city.
- Permit zones are lettered A to H and never overlap: a location is in at most one zone. They are a separate category from the zoning polygons (residential, commercial and so on), with their own file and codes.
- A rule row has at most one permit code. On a timed parking or other row, a code means permit holders for that zone are exempt; on a "no parking except by permit" row, it means only holders may park. A permit never exempts you from rows that are not marked.
- "All sweeping in Zone C" is a filter by the zone's polygon, worked out at build time, not a mark on each route. This extends the PRD, which says filtering by a single permit is not required; add it to the PRD.
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
- Zone filter (extends the PRD): limit every rule layer to sides inside one permit zone, using a zone assigned to each side at build time.
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
4. The build script joins rows to segments, adds `city_id`, and writes one GeoJSON file per layer, as the PRD data model specifies. It also writes a coverage file marking which segments have any rule, (from M2-8) `trim.json` with the band geometry flags, and (from M2-9) a `permit_zone` on each side's features, found by testing the side against the permit zone polygons.
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
- **Side stored as L/R, relative to the segment's direction** (first to last coordinate in the frozen segments file, facing along it). It maps straight onto the map's line offset, and needs no compass or grid lookup. Rejected: N/S/E/W, because Burbank's grid is rotated about 45 degrees from compass, so every rule would depend on an angle and tie-break rule (M1-3 spike, decision 1). The earlier objection to L/R, that it breaks if a block's direction is reversed, does not apply because the segments file is frozen; a deliberate re-extraction must report any segment whose direction changed, since its L/R rows would flip. Cardinal labels (city-grid) are derived for display only.
- **Frozen segments file.** Re-extracting OSM could renumber blocks and orphan your rows, so re-extraction is a deliberate step that reports changed IDs. Rejected: fetching OSM live on each build.
- **Prebuilt files on GitHub Pages.** No server, free, and the loader is the only thing Phase 2 replaces. Rejected: a database now, which adds hosting with no Phase 1 need.

## Work breakdown

49 tasks across seven milestones (M0 to M6, plus ten TD test-data tasks and the TD-5.2 and TD-2.2 revisions; TD-5 to TD-10 added after the R-1 review, M2-9 and M4-5 added for permit zones). Sizes: S = up to 1 day, M = 2 to 4 days, L = 1 to 2 weeks, all part-time. Estimates assume OSM data for Burbank is usable as-is and exclude your time creating rule data and drawing polygons, all of which is manual.

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
| M2-4 ✅ | Build script: CSV + segments to per-layer GeoJSON, side offsets, coverage file | M1-1, M2-3 | L | Sample rows yield valid GeoJSON with correct sides on N/S and E/W streets (superseded by M2-6: sides are L/R, tested on streets running in every direction) | FR-11, DM-2 |
| M2-5 ✅ | Authoring templates and README: CSV headers, polygon how-to, example rows | M2-4 | S | You can add one block of rules using only the README | DM-3 |
| M2-6 ✅ | Switch `side` from N/S/E/W to L/R (relative to segment direction): schema, validator, build script, sample generator, templates, tests. Add a build check that reports any segment whose direction differs from the frozen file (delivered as the direction report in `extract-burbank-segments.ts --force`) | M2-4, M2-5, TD-2 | M | `validate` rejects N, S, E, W; sample rows yield bands on the correct side of streets running in all directions, including reversed segments; sample data regenerated; `npm test` and `npm run build` pass | FR-11, DM-2 |
| M2-7 ✅ | Authoring map view: a map page (own entry point, not part of the public app) that shows every segment with its `segment_id`, an arrow for its direction, and its `L` and `R` sides marked, with click-to-copy of the `segment_id`. Data comes through the data-loader only | M1-2, M2-6, M3-1 | M | Clicking a segment shows its `segment_id` and marks which side is `L` and which is `R`, and these agree with the sides the build script draws for the same segment, including a reversed one; `npm test` and `npm run build` pass | DM-3, FR-11 |
| M2-8 ✅ | Band geometry flags in the build script (spike decisions 2, 3, 4). Test first. One node-graph pass over the frozen `segments.geojson` writes `data/<city_id>/trim.json` (not into `segments.geojson`): per segment `trim_start_m` and `trim_end_m` (`reach / tan(theta/2)`, capped at 35% of the block per end), `sliver: true` for blocks under 20 m, and `inner_L` / `inner_R` for sides with another block within 10 m and within 25 degrees of parallel. Order: flag slivers first, then ignore sliver edges when finding theta and inner neighbours. Band offsets and widths come from one shared config that the build script and the layers both read. `validate` and the loader accept the new file, so it needs its own JSON Schema. A sample folder borrows `trim.json` from its source city like `segments.geojson`, and `build:data` publishes it to `public/data/<folder>/` for every city folder. Add a short section to `data/README.md`: a block under 20 m is drawn only if it has a rule row, and inner-facing sides are not drawn but stay in the click-through list | M2-4, M2-6 | M | Tests cover a 90 degree corner, an acute fork that hits the cap, a sliver (and that its edges are ignored for trim and inner flags), and a dual carriageway where only the outer sides are unflagged; `build:data` writes `trim.json` for the sample set; `npm test` and `npm run build` pass | FR-9, FR-11 |
| TD-1 ✅ | Sample dataset `data/burbank-sample/` (30 connected segments, empty rule files; superseded by TD-2, which uses the whole segments file), `DATA_SET` setting for validate, build:data and the loader, sample banner | M2-4 | S | `validate` and `build:data` pass on the empty sample set and the banner shows | Testing |
| TD-2 ✅ | Sparse citywide sample data: made-up rules on a spread of segments across all of Burbank (about 1 in 15), all four rule layers, plus a few `SAMPLE-` zoning and `DEMO-` permit polygons across the city. Replaces the 30-segment `area.json` limit with the whole segments file. Generator script, seeded so output is repeatable | TD-1, M2-4 | M | `validate` and `build:data` pass on the sample set; every rule layer has rows in at least 4 distinct parts of the city; amended by TD-2.2: the share of blocks with a rule is the TD-2.2 target (75%), no longer "unmapped blocks still outnumber mapped ones" | Testing |
| M3-1 ✅ | Data loader, single entry point. CI runs `npm run build:data` for every city folder under `data/` (generated `public/` is gitignored); the loader takes a city_id and reads `data/<city_id>/` paths, so a new city needs only a data folder | M2-4 | S | A search finds no data fetch outside the loader; the deployed site serves the built files for every city folder | AR-3 |
| M3-2 ✅ | Not-yet-mapped style from coverage file | M1-2, M3-1 | S | Unmapped blocks show hatched; clicking says "not yet mapped" | FR-12 |
| TD-3 ✅ | Citywide sample zoning: extend the generator so `SAMPLE-` zoning polygons tile the whole city (grid cells snapped to street lines, groups of whole blocks). Changed after first delivery: inner borders between cells are wiggled with seeded extra points that both neighbours share, so zones are many-sided polygons, not rectangles; the outer edge stays straight. Codes `SAMPLE-R1`, `C1`, `C2`, `MU`, `M1`, `OS`, `P`; `C1` and `C2` share a category to test the code map; adds a `public` category | TD-2, M3-2 | S | `validate` passes; every point in the city falls in exactly one zone; every category appears in at least 2 separate places | Testing |
| M3-3 ✅ | Zoning polygons, category colors from code map | M3-1 | S | Each zone code shows its category color | FR-3 |
| TD-4 ✅ | Day-by-day sample sweeping: extend the generator's sweeping rules so about half the city (checkerboard of a 4 x 4 area grid) gives each mapped block a single-day window per side, with the opposite sides on different days (for example N Monday 08:00–10:00, S Tuesday 08:00–10:00; superseded by M2-6: now L Monday 08:00–10:00, R Tuesday 08:00–10:00, days assigned in side order L, R). Each area uses its own pair of weekdays, so areas sweep on different days. A few blocks start at 08:30 (to 10:30) to test the hourly rule. No `weeks_of_month` in the new windows (TD-9). Keeps the 1-in-15 mapped spread from TD-2 | TD-2 | S | `validate` passes; every weekday has sweeping somewhere in the city; both sides of a street are represented | Testing |
| TD-5 ✅ | Citywide sample timed parking: extend the generator's timed parking step to add timed rows (also on a few newly mapped blocks), weighted toward `SAMPLE-` commercial and mixed-use zones. Limits 30, 60, 120, 180 and 240 minutes (30 tests the fallback style); most rows have a schedule such as Mon–Sat 08:00–18:00, a few have none; some sit on sides that also have sweeping; a few rows inside a `DEMO-` permit zone carry that zone's code. Own seeded generator, so other layers' rows do not move | TD-2, TD-3, TD-4 | S | `validate` passes; every limit appears in at least 2 separate parts of the city; the "unmapped blocks still outnumber mapped ones" check is superseded by the TD-2.2 target share | Testing |
| M3-4 ✅ | Street sweeping layer | M2-1, M3-1, M1-3 | M | Active sides highlight and inactive mute at the chosen hour | FR-4 |
| TD-5.2 ✅ | Revision to TD-5 (already run; TD-5 stays ✅ as delivered). Re-run the generator's timed parking step so that timed parking is spread across the city, weighted toward `SAMPLE-` commercial and mixed-use zones, with 60, 120, 180 and 240 minute limits plus an odd value (30) for the fallback style, mostly Mon–Sat 08:00–18:00 and a few null schedules, some on sides that also have sweeping, a few with `DEMO-` permit codes. Keep what TD-5 and TD-2 already produced and add only what is missing; keep the own seeded generator so other layers' rows do not move | TD-5, M2-6 | S | `validate` passes; every limit appears in at least 2 separate parts of the city | Testing |
| M3-5 ✅ | Reopened: layer already built; add the permit label. Timed parking layer, style per limit; a row with a `permit_code` is labelled "Zone X permit exempt" | M2-1, M3-1, M1-3, M3-10, TD-5.2 | M | 1, 2, 3 and 4 hour limits look different; a row with a `permit_code` shows "Zone X permit exempt" | FR-5 |
| TD-6 ✅ | Sample restrictions: extend the generator to cover all five types across the city (permit only, specific times, any time, no stopping, no standing). Permit-only rows sit inside `DEMO-` permit zones and use that zone's code; some no stopping rows on corner segments; some restrictions on sides that already have timed parking. Keep what TD-2 already produces and add only what is missing | TD-2, M2-6 | S | `validate` passes; each of the five types appears in at least 2 separate parts of the city | Testing |
| M3-6 ✅ | Restrictions layer, three styles plus permit code, worded "Zone X permit required" for "except by permit" rows and "Zone X permit exempt" for other rows with a code. Delivered with a new optional `rules.csv` column, `permit_mode` (`required` or `exempt`; only on a `no_parking` restriction with a `permit_code`; empty reads as exempt), since the rows had no other way to tell the two apart. Schema, validator, build, templates, README and sample generator updated; draws `no_parking` rows only, in band slot 2 | M2-1, M3-1, M1-3, M3-10, TD-6 | M | Each type is distinct; permit code shows where set | FR-6 |
| M3-7 ✅ | Delivered: black band in slot 3 (`band_count` 4), solid for `no_stopping`, dashed for `no_standing`, one map layer per type, added last so it draws above the other bands; `permit_code` is ignored on these rows; toggle hook is `setVisible` on the returned layer (M4-1 wires it); shared `restrictionRows` helper. Not yet checked by eye in a browser. No stopping/standing/parking layer. Notes from M3-6: (1) add `"no_stopping": 3` to `band_slots` and raise `band_count` from 3 to 4 in `config/band-geometry.json`; `trim.ts` reads `band_count`, so re-run `build:data` and check `trim.test.ts`. (2) Draw `no_stopping` and `no_standing` rows from `city.restrictions` through `layoutBands`, so a sliver counts as having a rule only if it has a row in this layer; move the `no_parking` type filter, now repeated in `restrictions.ts` and `draw-restrictions.ts`, into one shared helper. (3) Tell the two types apart with one visual detail (solid vs dashed) using a separate map layer per type, since `line-dasharray` is not data-driven here. (4) Avoid colors in use: sweeping orange, the timed parking palette, and the restrictions teal, red and maroon. (5) Decide before building whether a `permit_code` is allowed on these rows (schema allows it; `permit_mode` is rejected there, so it would read as exempt; PRD open question). (6) "Own toggle" here means its own map-layer group and legend; M4-1 wires the switch. (7) Check the M3-6 band colors and permit text in a browser first (labels show from zoom 16.5) | M3-6 | S | Highest-contrast style; own toggle; fourth band stays clear of the other three at z17 | FR-7 |
| TD-7 ✅ | Delivered: `generate:sample` now writes `curb-colors.json` (red, yellow, green, white, blue) and a seeded last step adds corner-weighted curb color rows for all five colors (blue is new) plus a few rows with their own schedule. Sample curb colors: the generator writes the sample curb color config (red, yellow, white, green, blue, each with label, hex, time limit, default schedule) and places colors across the city, mostly near corners, with a few rows whose own schedule overrides the default. Keep what TD-2 already produces and add only what is missing | TD-2, M2-6 | S | `validate` passes; every color in the config appears in at least 2 separate parts of the city | Testing |
| M3-8 ✅ | Delivered: curb color bands in new slot 4 (`curb_color` in `band_slots`, `band_count` 5, so `trim.json` was regenerated and the trim test now expects a 5.4 m reach). Label, hex, time limit and default schedule are read from `curb-colors.json`; a row's own schedule overrides the default, and a null row schedule uses the default. A key missing from the config draws grey rather than being dropped. Not yet checked by eye in a browser. Curb colors from config | M2-1, M3-1, M1-3, M3-10, TD-7 | S | A new color appears after editing only the config | FR-8 |
| TD-8 ✅ | Delivered: `generate:sample` now writes `permit-zones.geojson` (it used to read a hand-made file of 4 rectangles). `scripts/lib/sample-permit-zones.ts` builds the street network's city blocks and grows each zone from touching blocks, so borders run exactly along street lines; DEMO-B is grown against DEMO-A (they share an edge), seeds are at least 1.6 km apart, and the zones cover about 7% of street sides. Rule codes are now tested per side (`sidePoint`, 4 m off the block's middle, as M2-9 will), so a permit code always matches the zone its own side lies in; a last step gives any zone with no rule a permit-only row. Sample permit zones: extend the generator to 8 non-overlapping `DEMO-` permit zones (`DEMO-A` to `DEMO-H`) across the city, mostly in `SAMPLE-` residential zones, following street lines; at least two share an edge; most of the city is outside any zone. Every `DEMO-` code in the rules has a zone and every zone has at least one rule | TD-2, TD-6 | S | `validate` passes; every `DEMO-` code in the rules has a matching zone; zones appear in at least 4 separate parts of the city; no two zones overlap | Testing |
| TD-2.2 ✅ | Denser sample data. Target share: **75%** of Burbank blocks carry at least one rule row (about 10% before). Supersedes the "unmapped blocks still outnumber mapped ones" check in TD-2 and TD-5. To change the value: edit the percentage in this cell, untick ✅, and ask for TD-2.2 to be re-run; the generator constant `TARGET_MAPPED_SHARE` in `scripts/lib/sample-data.ts` must match, and a test fails if the two differ. The generator gets a last step, with its own seeded generator, that tops up unmapped blocks (picked evenly over the city) until the share is reached. Every earlier row stays in place and new rows go on the end. Most new blocks get a single rule: day-by-day sweeping (both sides, as TD-4) in the sweeping areas, otherwise timed parking, a restriction or a curb color. If the target is already met, nothing is added | TD-2, TD-4, TD-5.2, TD-6, TD-7, TD-8 | S | `validate` and `build:data` pass on the sample set; the share of blocks with a rule is the target (rounded up to a whole block); no earlier row changes; every rule layer gains rows in all parts of the city | Testing |
| M3-9 ✅ | Delivered: `drawPermitZones` (translucent fill, outline and permit-code label, added under the street lines so every band draws on top), a "Permit overview" button that shows or hides the zones with a legend of codes (starts on), colors by sorted code. Not yet checked by eye in a browser. Permit zones polygons and overview | M3-1, TD-8 | M | All permit zones show together with their codes | FR-10 |
| M2-9 ✅ | Delivered: `scripts/lib/permit-zones.ts` (side point 4 m off the block middle, zone lookup, end-zone lookup, overlap finder); `buildLayers` takes the permit zones and writes `permit_zone` (code or null) on every feature of all four layers; `Problem` now has `severity` (`error` or `warning`), and `validate` and `build:data` print warnings without failing. Checks added as specified; the validator also errors on a `permit_code` when the city has no permit zones file. The TD-8 `sidePoint` now calls the shared function. The sample set gives 11 end-zone warnings, no code-mismatch warnings. Permit zone assignment at build time: for each side of each block, the build script tests a point just off the block's midpoint, toward that side, against the permit zone polygons and writes `permit_zone` (the zone's code: A to H in real data, `DEMO-A` to `DEMO-H` in the sample set, or none) on that side's features. Nothing is marked by hand on sweeping or any other rule. Validator checks: permit zones don't overlap; every `permit_code` on a rule row names a zone in the file; a warning when a row's code differs from the zone its side falls in; a warning for a block whose two ends fall in different zones. Test first | M2-4, M2-6, TD-8 | M | Tests cover a side inside one zone, the two sides of a street on a zone border (different zones), a side outside every zone, overlapping zones (rejected) and a rule row naming an unknown zone (rejected); `build:data` writes `permit_zone` for the sample set; `npm test` and `npm run build` pass | FR-10 (extended) |
| M3-10 ✅ | Layers apply the band geometry flags: bands are cut by `trim_start_m` / `trim_end_m`, inner-facing sides are not drawn, flagged slivers are drawn only if they have a rule row. Retrofit the finished sweeping layer; all later rule layers (M3-5 to M3-8) use the same shared helper. The loader exposes `trim.json`; the layers do no geometry of their own. The hard-coded band constants in `src/layers/sweeping.ts` (`FIRST_OFFSET_PX`, `OFFSET_STEP_PX`, `WIDTH_PX`, `MIN_WIDTH_PX`) are replaced by the shared config from M2-8 | M2-8, M3-4 | M | On the downtown fork, sweeping bands no longer cross at z17; a sliver with no rule is not drawn and one with a rule is; the hidden inner side still appears in the click-through data; `npm test` and `npm run build` pass | FR-9, FR-11 |
| M4-1 ✅ | Delivered: `src/time-ui` holds one in-memory state (day, hour, seven layer toggles: zoning, permit zones, sweeping, timed parking, restrictions, no stopping/standing, curb colors), mirrored in the URL as `?day=| M4-1 | Shared time state and per-layer toggles. Replaces the hard-coded day and hour in the finished layers; layers built later read the shared state from the start |hour=&hide=` (default Mon 08:00, all layers on; `hide` lists switched-off layers; other parameters are kept; no browser storage). `main.ts` draws every layer from that state and restyles all of them on one change. Every layer now has `setVisible`; the M3-9 "Permit overview" button is replaced by the shared "Permit zones" toggle. No day picker or slider yet (M4-2). Not yet checked by eye in a browser. Shared time state and per-layer toggles. Replaces the hard-coded day and hour in the finished layers; layers built later read the shared state from the start | M2-1, M3-4 | S | One change updates every layer | FR-1 |
| M4-2 ✅ | Delivered: `createTimeControls` in `src/time-ui` (Monday to Sunday buttons, 0 to 23 slider, a readout such as "Monday 8:00 AM", Now, Play/Pause), all reading and writing the shared state. Now uses `localDayHour` (new, in the schedule engine) with the `time_zone` from `city.json`, so it ignores the device zone; pressing it also pauses play. Play adds one hour per second and loops 23 to 0 on the same day (`createPlayer`). Tests mock the clock either side of both 2026 DST changes. Layout is a top-centre panel and may crowd the layer toggles on a phone (M5-1). Not yet checked by eye in a browser. Day picker, hourly slider, Now (America/Los\_Angeles), play | M4-1 | M | Now matches Burbank local hour on both sides of a DST change | FR-2 |
| TD-9 ✅ | Delivered: `scripts/lib/sample-edge-cases.ts` picks five sides (own seeded generator, rows appended after TD-2.2, only on already-mapped blocks and on sides with no other row, so no earlier row moves and the mapped share is unchanged): three stacked sides in different parts of the city (A midnight crossing, null schedule and 08:30 start; B Sunday-into-Monday window; C `weeks_of_month` [1, 3]), one inner-facing side and one sliver whose rule is the only one in its layer on the block. Each case has three hand-written day-and-hour results that a test checks against the schedule engine; `generate:sample` writes them to `data/burbank-sample/test-cases.md`. `loadCityFiles` now skips `.md` files so the validator ignores the notes. Sample edge cases: a fixed set in the generator that stacks rules from 4 or more layers on 3 segment sides in different parts of the city, including a window crossing midnight, a Sunday-into-Monday window, a null schedule, an 08:30 start, one `weeks_of_month` [1, 3] row (format test only), one inner-facing side and one sliver with a rule. The generator also writes `data/burbank-sample/test-cases.md` with what the map and detail list should show at 3 day-and-hour times per side | TD-5.2, TD-6, TD-7, M2-8 | S | `validate` passes; `test-cases.md` lists the expected results for every edge-case side | Testing |
| M4-3 ✅ | Delivered: clicking any block (mapped or not) opens a panel in `src/curb-detail` listing both sides, L and R, each with a city-grid label (display only; `GRID_NORTH_BEARING` 311 is a rough, hand-measured angle that fits the downtown grid and is off elsewhere), the permit zone from `permit_zone`, and every rule from all layers with exact windows, "Active" or "Not active", the next change counted from the chosen hour ("N days later" by calendar day) and permit wording ("Zone C permit exempt" or "required"). Rules are read from the loader's rows, not from what is drawn, so inner-facing sides (marked "not drawn on the map") and slivers list theirs. An unmapped block shows the M3-2 message. `basemap` gained `onSegmentClick` and no longer opens its own popup; `schedule-engine` gained `localParts`. A side with no rule rows has no `permit_zone` to read, so it says "not recorded". `detail.test.ts` parses `test-cases.md` and checks all five cases and 15 times. Not yet checked by eye in a browser. Click-through list: every rule on a side, active or not, next change, permit exemptions in words, and the permit zone the side lies in | M2-1, M3-4, M3-10, M2-9, TD-9 | M | List matches the CSV rows for that side, with correct next change; inner-facing sides and skipped slivers (not drawn, per M2-8 and M3-10) still list their rules | FR-9 |
| M4-4 ✅ | Delivered: `zonesForDay` (pure, in `src/curb-detail/day-zones.ts`) lists every timed parking row in force on the chosen day, read from the loader's rows: street, side, limit, exact hours ("all day" for a null schedule, "until 06:00" for the tail of a window that crossed midnight in) and "Zone C permit exempt". A row counts if the engine finds it active at midnight or at any window start that day, so it agrees with the map, week of month included. `createDayZones` adds a collapsible bottom-centre panel that rebuilds when the day changes; picking an item eases the map to it (zoom at least 17) and opens its block in the click-through panel, through an `onSelect` callback in `main.ts` so `curb-detail` never touches the basemap. Not yet checked by eye in a browser. "Zones for the day" list, including any permit exemption | M3-5, M4-1 | S | Lists each timed zone in force that day with its hours | FR-5 |
| M4-5 ✅ | Delivered: `zone` in the shared state (`all`, `none` or a permit code; URL `?zone=`, left out when `all`; no browser storage). `createZoneFilter` in `src/time-ui` is a select of All, each code in the permit zones file, No zone; a code not in the file resets to All. `filterByZone` (new, `src/layers/zone-filter.ts`, no geometry) keeps sides by their build-time `permit_zone`; sweeping, timed parking, restrictions, no stopping/standing and curb colors all apply it at draw and on every update. `drawPermitZones` gained `highlight(code)` (stronger fill and thick outline for the chosen zone, shown even if the Permit zones toggle is off). The detail panel and "zones for the day" list are not filtered. Selector sits under the layer toggles with a fixed offset (M5-1 layout). Not yet checked by eye in a browser. Zone filter: a selector (All, each permit zone, No zone) that limits every rule layer, sweeping included, to sides whose `permit_zone` matches, and highlights the chosen zone's polygon. Choice is kept in the shared state and URL | M2-9, M4-1, M3-9 | S | Choosing a zone shows only sides in that zone for every layer, with no hand-marked routes; reloading the URL restores the choice; `npm test` and `npm run build` pass | FR-10 (extended) |
| M5-1 ✅ | Delivered: `index.html` now has a `#map` element and a `#panel` (toggle button, curb-detail host, `#controls`); `main.ts` puts the map in `#map` and every control and legend in `#controls`. At 700 px and narrower the map fills the space above a bottom panel (max 55% of the height, scrolls, starts collapsed behind a Show/Hide controls button, the sample banner stays above the map); wider screens keep the floating layout. Buttons, selects, sliders, summaries, checkbox rows and the map zoom and attribution buttons are at least 44 px on narrow or touch screens. The permit zones legend moved down so it no longer sits on the zone filter. CSS and wiring only, no new features or tests. Not yet checked by eye in a browser (no browser tooling here). Responsive layout and touch targets | M4-2 | M | All controls usable at 375 px width | FR-14 |
| M5-2 ✅ | Delivered: `build:data` writes `public/data/<folder>/metadata.json` (`city_id`, `last_updated` as YYYY-MM-DD in the city's time zone) for every city folder, sample and real. The date is the day of the build (`scripts/lib/metadata.ts`, tested). The loader reads `metadata.json` as a required file and returns it as `metadata`. `index.html` has a permanent footer, "Reference tool only. Not the official source for citations." (plain HTML, so it shows even if data fails to load), and `main.ts` adds "Data last updated YYYY-MM-DD" once the data loads. Not yet checked by eye in a browser. Last-updated date and reference-tool label | M3-1 | S | Both visible on load | FR-13 |
| M5-3 ✅ | Delivered: review found no break. `src/main.ts` and `src/authoring/main.ts` are the only importers of `basemap`, both through `src/basemap/index.ts`. New `scripts/lib/basemap-isolation.test.ts` fails if any file under `src`, `spike` or `scripts`, or any `<script src>` in the root or `spike` pages, reaches into `src/basemap/` other than its index (static, re-export, side-effect, dynamic and `require` forms; the checker is itself tested, and a planted violation was seen to fail it). Phase 2 tile swap, described not made: only `src/basemap/basemap.ts` changes (`styleFor`: replace the `segments` GeoJSON street lines and labels with a vector or raster tile source, plus its glyphs and attribution). The segments still have to be drawn for click-through and the unmapped hatching, so that part stays but must keep the layer ids `underStreetsLayerId` and `underLabelsLayerId` pointing at real layers. Known limit: `Basemap.map` exposes the MapLibre `Map` and the layers and authoring page use its type, so a swap to a different map library would not be isolated (outside Phase 2 scope). Basemap isolation check, covering both the public app and the authoring page (M2-7) | M3-2, M2-7 | S | Replacing the basemap module needs no change elsewhere | AR-1 |
| M5-4 ✅ | Delivered: audit found no use of `localStorage`, `sessionStorage` or IndexedDB (nor cookies, the Cache API or service workers) in `src`, `spike`, `index.html` or `authoring.html`, and none in the built `dist` bundles, MapLibre included, so nothing needed removing or wrapping. All state is in memory and the URL. New `scripts/lib/no-browser-storage.test.ts` fails if any of those files uses a storage API (the checker is itself tested). Not run in a real browser with storage blocked (no browser tooling here); the evidence is that no code path touches storage. Storage audit | M5-1 | S | No feature breaks with browser storage blocked | AR-4 |
| M5-5 ✅ | Delivered: `scripts/extract-block-numbers.ts` (pure parts in `scripts/lib/block-numbers.ts`, tested) ran against Overpass and wrote `data/burbank/blocks.csv` (2,582 rows) and `blocks-report.md`: **178 blocks numbered, 2,404 need hand entry** (2,216 with no address found, 140 with only 1, 48 spanning different hundreds). OSM holds only about 2,500 usable Burbank addresses, so most blocks are on the report. Street names are compared ignoring case, spacing and a trailing period only: the segment extractor keeps the OSM `name` as it is and has no normalisation to reuse, and abbreviations are not expanded (a missed match goes on the report, never a wrong one). Manual rows are kept on re-run. `schemas/block-row.schema.json` and the validator checks were added (segment exists, no duplicates, multiple of 100, low not above high, warning for a segment with no row; `blocks.csv` is no longer read as a rules file). `build:data` writes `blocks.json` (`{city_id, blocks: {segment_id: number or null}}`, same wrapper as `trim.json`) for any folder with a `blocks.csv`; a sample folder borrows its source city's. The loader reads it as optional and returns `blocks` (null when absent). The curb detail heading comes from `blockHeading` in `src/curb-detail/format.ts`: "1200 block of West Olive Avenue", or "West Olive Avenue, block number not recorded". `segments.geojson` is unchanged (same SHA-256 before and after). `basemap`, `layers` and the authoring page are untouched. Not yet checked by eye in a browser. Block numbers in the curb detail panel (for example "1200 block of West Olive Avenue"), so users and data authors can tie a block to a real address range. `segments.geojson` is frozen, so the numbers live in a new file, `data/<city_id>/blocks.csv` (`segment_id, block_number, low_address, high_address, source`; `source` is `osm` or `manual`), never in `segments.geojson`. Steps: (1) **Gather.** New one-off script `scripts/extract-block-numbers.ts`, run like M1-1 and committed with its output: query Overpass for `addr:housenumber` nodes and building ways in Burbank; for each, keep only segments whose `street` matches the address's `addr:street` (after the same name normalisation the segment extractor uses) and that lie within 40 m, and assign it to the nearest one; per segment, `low_address` and `high_address` are the smallest and largest house number found and `block_number` is `floor(low_address / 100) * 100`. A segment with fewer than 2 matching addresses, or with `low_address` and `high_address` in different hundreds, is written with an empty `block_number` and listed in a report (file `data/<city_id>/blocks-report.md`) for hand entry; never guess. Rows with `source` = `manual` are never overwritten when the script is re-run. (2) **Validate.** New `schemas/block-row.schema.json`; `validate` checks every `segment_id` exists in `segments.geojson`, `block_number` is empty or a non-negative multiple of 100, `low_address` is not above `high_address`, and warns on a segment with no row. Duplicate `segment_id` is an error. (3) **Build and load.** `build:data` turns `blocks.csv` into `public/data/<folder>/blocks.json` (segment_id to block_number or null) for every city folder; a sample folder borrows `blocks.csv` from its source city like `segments.geojson` and `trim.json`; the loader reads it as an optional file (a city without `blocks.csv` still loads) and returns `blocks`. (4) **Show.** `src/curb-detail` heading reads "1200 block of West Olive Avenue" when a block number exists, otherwise just the street name followed by "block number not recorded"; the cross streets line is unchanged. No change to `basemap`, `layers` or the authoring page. (5) **Docs.** Add a short `blocks.csv` section to `data/README.md` (how to fill a gap from the report, what `manual` means). Test first for the build script and the extraction's pure parts (address-to-segment matching, hundred rounding, the mixed-hundred rule, manual rows kept); `detail.test.ts` gets cases for a block with and without a number. OSM address coverage in Burbank is probably incomplete, so a large share of blocks may need hand entry; the report is the to-do list. Out of scope: odd/even (L/R) address parity per side, address search, and any change to `segments.geojson` | M4-3, M2-8, M3-1 | M | Tests pass; `extract-block-numbers` writes `blocks.csv` and `blocks-report.md` for Burbank with a count of blocks numbered and blocks needing hand entry; `validate` and `build:data` pass for the real and sample sets; clicking a numbered block shows "N block of <street>" and an unnumbered one shows "block number not recorded"; `segments.geojson` is byte-for-byte unchanged; `npm test` and `npm run build` pass | FR-9 (extended), DM-3 |
| TD-10 | Switch the public site from sample to real data: `data/burbank/` holds empty rule files from the templates; the site opens on `burbank` by default; `burbank-sample` stays for tests and may still be published (M3-1 builds every city folder) but is never the default | M2-5, TD-1 | S | A build with `DATA_SET=real` passes; the site opens on real data with no sample banner; `public/data/burbank/` contains no `SAMPLE-` or `DEMO-` codes; every block not yet entered shows as not yet mapped | Testing |
| M6-1 | Pilot data: one dense area, all layers | M2-5, M2-7, TD-10 | M | Area passes the validator and every layer has rows | Phasing |
| M6-2 | Accuracy walk: check 20 pilot curb sides against signs | M6-1 | M | 20 of 20 match or are corrected | Risk 1 |
| M6-3 | Phase 1 review and PRD handoff update | all, including M6-4 | S | Exit criteria in the PRD are ticked or explained | Phasing |
| M6-4 | Revisit `docs/data-dependent-decisions.md`: run each check on the pilot data and the citywide segments file, then set every row to Confirmed or Changed with a line of evidence. Update `docs/spike-notes.md` and the build script's tests for any value that changed | M6-1, M6-2, M2-8, M3-10 | S | No row in the file is still Set or Open; every changed value is updated in the spike notes and the build script, and `npm test` and `npm run build` pass | FR-9, FR-11 |

No Phase 1 requirement is left without a task. Beats, officer location and tickets have no tasks because they are Phase 2.

## Sequencing

The first demo (one layer driven by the time slider over real streets) lands after M3-4, roughly week 4 to 6.

**Critical path:** M0-1 → M1-1 → M1-3 → M2-4 → M2-6 → M2-8 → M3-10 → M3-5 → M4-4 → M6-3. (Earlier path, kept for reference: M2-4 → M3-1 → M3-4 → M4-3 → M5-1 → M6-3; it now runs alongside, and M2-7 gates M6-1.)

**Runs in parallel**

- M2-1 (schedule engine) and M2-2 (schemas) start on day one; neither needs the map.
- M0-2 (deploy) any time after M0-1.
- Your data entry (M6-1) starts once M2-5 gives you templates and M2-7 gives you the authoring map, alongside M3 and M4.
- M3-3 (zoning, done) and M3-9 (permit zones) need only the loader, not the band spike or band flags.
- M2-7 (authoring map) and M2-8 (band flags) can run side by side after M2-6. M3-5 to M3-8 wait on M3-10.
- M2-9 runs after TD-8 (it needs the sample permit zones to test against); M4-5 runs after M4-1 and M2-9.
- Each TD task runs just before the layer that needs its data (TD-5.2 before M3-5, TD-6 before M3-6, TD-7 before M3-8, TD-8 before M3-9, TD-9 before M4-3, TD-10 before M6-1).

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
| Side bands overlap at corners and short blocks | Map unreadable | Developer | M1-3 spike before any layer; trim band ends, minimum width. The spike showed these are not enough on forks, so band geometry flags (M2-8) are applied in the layers (M3-10) |
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
| Add the zone filter (FR-10 extension) and the A to H permit zone rules to the PRD requirements and decisions | Non-blocking | M4-5 |
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
- Rule rows are CSV keyed by segment_id and side (L/R). L and R are relative to the segment's direction (first to last coordinate in segments.geojson), facing along it. Never compass directions.

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
