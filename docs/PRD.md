# Curb & Zoning Map PRD

Oct 14, 2026 · @Charles · Updated Oct 24, 2026 to match docs/PLAN.md and the built Phase 1 code

## Overview

This project builds one map that shows which parking rules apply to every curb in Burbank, CA at any chosen day and time. It starts as a proof of concept in Burbank and is designed to extend to other cities afterward.

Today the rules sit in separate sources: zoning, street sweeping, timed parking, restrictions and curb colors. Officers in the field cannot easily see what applies where they stand. Managers cannot review the whole city to decide where to patrol.

**Goals**

- Show six layers on one map: zoning, street sweeping, timed parking, no-parking and permit restrictions, no stopping/standing/parking, and curb colors.
- Let the viewer pick a day and time and see which rules are active, with every active rule visible at once.
- Distinguish the two sides of each street, since most signs and curbs are side-specific.
- Give managers a whole-city view and editable patrol beats.
- Give officers a phone and tablet view that shows what applies at their location.
- Keep the design ready for multiple cities and for ticket analysis later.

**Not in the proof of concept**

- Real ticket data. All ticket data will be sample data until a much later stage.
- Login, offline use and live GPS. These arrive in the hosted-app phase (see Phasing).
- Legal authority. The map is a planning and reference tool, not the official source for citing a violation.

## Users

Two teams use the app, and they see different data. Officers get the rules. Management gets the rules plus patrol planning and, later, ticket data.

|  | Enforcement officers | Management |
| --- | --- | --- |
| Where they work | In the field | At a desk, reviewing the whole city |
| Devices | Phones and tablets | Not stated yet; assumed desktop and tablet |
| Main question | What applies at the curb where I am, and until when? | Where should patrols go, and are the beats working? |
| Sees | All six rule layers, time controls, their own location | Everything officers see, plus a permit overview, beat editing and (later) ticket analysis |
| Edits | Nothing | Patrol beats, changed every few days or weeks |
| Connectivity | Strong signal across the city except one small area | Office network |

A third, smaller role updates the zone and curb data when the planning board approves changes, about every few months. The data is entered by hand to start. Who performs those updates is an open question.

## Phasing

The proof of concept ships as a public GitHub Pages site, then moves to a hosted app. The move is safe if the page follows the four rules under Architecture.

|  | Phase 1: published page | Phase 2: hosted app |
| --- | --- | --- |
| Purpose | Prove the rules, schedules and management view | Prove the field experience and add multi-user features |
| Basemap | OpenStreetMap street centerlines and names for all of Burbank, drawn by the app; no map tiles | Real map tiles with street names and imagery |
| Location | None | Live GPS for officers |
| Access | Public GitHub Pages site; rule data is not restricted, so real data can be used | Logins and roles for officers and management |
| Data | Files loaded into the page | Database behind an API |
| Beats | Not editable | Editable and saved by management |
| Tickets | Not included | Import by address, geocoding, analysis |
| Offline | No | Cached map and rules for the one weak-signal area |

**What Phase 1 cannot prove:** how the layers look over a real basemap, live location, performance on a phone with a full city of data, and anything involving sensitive ticket data. These are Phase 2 exit criteria.

## Functional requirements

Every layer responds to one shared day and time, and every active rule is drawn at once with a toggle per layer.

**Time controls (Phase 1)**

- A day picker for Monday to Sunday and a time-of-day slider that steps by the hour. A rule counts as active at a step if it is in force at the top of that hour; exact times show in the curb detail list.
- A "Now" button that jumps to the current day and time in Burbank's time zone.
- A play button that advances the time through the day so the viewer can watch rules switch on and off.

**Layers (Phase 1)**

| Layer | What it shows | How it is told apart |
| --- | --- | --- |
| Zoning | Zoned areas of the city | Fill color by category (residential, commercial, mixed and so on). Burbank has about 25 to 30 zoning types, so each record keeps its exact zone code and maps to a category. Not time-based. |
| Street sweeping | Which curb sides are being swept | Active sides highlighted at the chosen time, inactive sides muted, left and right side drawn separately |
| Timed parking | Zones with a time limit | A distinct style per limit (1, 2, 3, 4 hours and so on), with a fallback style for any other limit. Each zone has its own days and hours, and some have none. A row with a permit code is labelled "Zone X permit exempt". A "active zones" view lists the zones that apply, when each is active and any permit exemption. |
| Restrictions | No-parking rows only: no parking except by permit, no parking at specific times, and no parking at any time | Three distinct styles, set by the row's permit code and schedule. An "except by permit" row is labelled "Zone X permit required"; any other row with a permit code is labelled "Zone X permit exempt" |
| No stopping, standing or parking | The strictest restrictions: no-stopping and no-standing rows | Drawn from the restrictions file filtered by type, with its own toggle and the highest-contrast highlight on the map. No stopping and no standing differ in one visual detail (for example solid versus dashed) and are named in the click list. Rows follow the time slider like any other rule |
| Curb colors | Painted curbs | Color and timing come from a config file. A new color is added by editing the config. Each color has its own schedule or none. |

**Overlaps.** Where several rules apply to one curb side, each layer draws its own parallel band so none hides another. Clicking a curb lists every rule on it, including inactive ones, with the next time each changes, any permit exemption in words, and the permit zone the side lies in. Sides that are not drawn (inner-facing sides and short blocks, see Geometry) still list their rules.

**Permit zones (Phase 1).** Permit zones are their own polygon file, one polygon per section of the city, labelled with the permit code. They are a separate category from zoning, with their own file and codes.

- Burbank's zones are lettered A to H. Zones never overlap, so a location is in at most one zone, and most of the city is in none.
- A rule row has at most one permit code. On an "except by permit" restriction it means only holders of that zone's permit may park. On any other row it means holders of that zone's permit are exempt. A permit never exempts a holder from a row that does not name it.
- Each curb side's permit zone is worked out at build time from the polygons, never marked by hand on a rule.

**Permit overview and zone filter (Phase 1).** A view that shows all permit zones together with their codes. A zone filter (All, each permit zone, No zone) limits every rule layer, sweeping included, to the sides in the chosen zone and highlights that zone's polygon, so "all sweeping in Zone C" needs no hand-marked routes. The choice is kept in the URL.

**Authoring page (Phase 1, internal).** A separate map page, not linked from the public page, for data entry. It shows every block with its segment ID, an arrow for its direction and its L and R sides marked, and copies the segment ID on click. It marks sides with the same code the build uses.

**Beats (Phase 2).** Management draws, edits and saves patrol beats. Beats change every few days or weeks as data is reviewed and more officers join.

**Officer location view (Phase 2).** Shows the officer's position and the rules on the nearest curb side, with time remaining on each active rule.

## Data model

Each city's data lives in its own folder, `data/<city_id>/`, because the rules and polygons are created by hand and are not available from a regular source. Curb rules for every layer are typed into one CSV file, one row per rule per curb side, with a column naming the layer. A build script turns the rows into one GeoJSON file per layer for the page. Templates and a field-by-field authoring README live in `data/README.md` and `data/burbank/templates/`, and every file has a JSON Schema in `schemas/`.

**Hand-authored files**

| File | Geometry | Key properties |
| --- | --- | --- |
| Rules (`rules.csv`) | None; keyed to a segment | segment ID, side (L/R), layer (sweeping, timed parking, restrictions, curb color), type (restrictions only: no parking, no standing, no stopping), limit in minutes (timed parking only), permit code (timed parking and restrictions only), color key (curb colors only), schedule |
| Zoning | Polygon | zone code, category, name, city |
| Zoning category config | None | display categories (label, color) and the category for each exact zone code |
| Curb color config | None | per color: label, hex, time limit, default schedule |
| Permit zones | Polygon | permit code, name, city |
| City config | None | city ID, name, time zone |
| Street segments (base) | LineString | segment ID, street name, cross streets, city; from OpenStreetMap, frozen |

**Generated by the build** (never edited by hand)

| File | Geometry | Key properties |
| --- | --- | --- |
| Street sweeping, timed parking, restrictions, curb colors | LineString, one per rule per side | the rule row's fields plus street and cross streets from the segment, city, and the side's permit zone |
| Coverage | None | which segments have any rule row |
| Band geometry flags (`trim.json`) | None | per segment: band trim at each end, short-block flag, inner-facing flag per side |

**Geometry.** Each line is the street centerline for one block, taken from OpenStreetMap and frozen in a segments file with a stable segment ID. The app draws it offset toward the record's side and offsets each layer by a different distance so the bands sit side by side. Band offsets and widths come from one shared config that the build and the page both read. If the data later arrives already positioned along the curb, the offset step is switched off.

- **Sides.** A side is L or R: left or right when facing along the segment's direction, from the first to the last coordinate in the frozen file. Compass directions are not used, because Burbank's street grid is rotated about 45 degrees from compass. Because the file is frozen, every L/R row stays stable; a deliberate re-extraction reports any segment whose direction changed.
- **Band trim.** Bands are shortened at each end of a block by an amount that grows as the angle to the next block shrinks, capped at 35% of the block per end, so bands do not cross at corners.
- **Inner-facing sides.** Where two roads run side by side, such as the halves of a divided road, the sides that face each other are not drawn, because the bands would cross. Their rules still appear in the click-through list.
- **Short blocks.** Blocks under about 20 m are drawn only if they have a rule row.
- The build computes all of this once; the page does no geometry of its own. The thresholds are starting values from the band spike and are checked against real data before Phase 1 ends (`docs/data-dependent-decisions.md`).

**Schedules.** A schedule is a list of windows. Each window has a list of weekdays, a start time and an end time in 24-hour format. A window may cross midnight, so 18:00 to 06:00 on Monday runs into Tuesday morning. A null schedule means the rule is always in effect. A window may also list weeks of the month (1 to 5); absent means every week. Burbank sweeping is day-by-day and leaves it empty, but other cities will need it, so the engine supports it from Phase 1. Holidays are out of scope for now.

**Multiple cities.** Every record belongs to a city. Each city has its own folder of files, its own time zone and its own category mapping for zoning, so Burbank's setup does not have to match the next city's. The deploy builds every city folder, so a new city needs only a data folder to be published. The Phase 1 page opens on Burbank.

**Authoring and coverage.** Rules are typed as spreadsheet (CSV) rows keyed to a street segment and side, and a build script turns them into the per-layer files above. Every Burbank street shows from the segments file, so the map is complete before the rules are. Segments with no rule rows show as "not yet mapped", never as "no restrictions", so partial data is never mistaken for an unrestricted curb.

**Sample data.** A separate made-up data set, `data/burbank-sample/`, is used to build and test the layers before real data exists. It uses the real Burbank segments file, and its codes start with `SAMPLE-` (zoning) and `DEMO-` (permit zones) so they can never be mistaken for real ones. A page showing sample data carries a "Sample data" banner. Once the real data folder is switched on, the public site opens on real data by default; the sample set stays for testing.

## Architecture and constraints

Phase 1 is built so that moving to a hosted app replaces some modules without rewriting the rest.

**Four rules for the published page**

1. The basemap is one swappable module. Phase 1 draws the project's own centerlines. Phase 2 points it at a tile source. No other module refers to it.
2. The code is split into separate modules that talk only through each module's public interface: basemap, data loading, schedule engine, layer rendering, the time-control interface and curb detail.
3. All data passes through one loading function. Phase 1 reads files. Phase 2 calls an API.
4. The page does not depend on page-only features such as its built-in browser storage for anything that matters. App state (day, hour, layer toggles, zone filter) lives in memory and the URL. Beats and tickets belong in a database.

**Roles.** Officers and management see different data. Phase 1 has no login and is a public GitHub Pages site. Rule data is public information, so it can be real; ticket data stays out. Phase 2 adds logins and role-based access, with ticket data and beat editing limited to management.

**Security.** No security standards are required yet. They may be supplied later, so the hosted design should not rule out single sign-on, audit logging or required hosting.

**Data updates**

| Data | Who changes it | How often |
| --- | --- | --- |
| Zone and curb data | Staff, after planning board decisions | Every few months, by hand |
| Patrol beats | Management | Every few days or weeks |
| Ticket data | Imported from the ticket system | Daily, later phase |

The validator checks every file against its schema and reports the file, row and reason for each bad row, so hand-entered data is checked before it reaches the map. It also checks that permit zones do not overlap and that every permit code on a rule names a zone, and warns when a row's permit code differs from the zone its side lies in. It runs on every push, and a bad row stops the deploy.

## Future: ticket import and analysis

Ticket analysis is a much later stage and uses sample data until then. The design reserves room for it now.

- **Import.** Ticket locations arrive as street addresses, not coordinates, and are imported daily. Each address must be geocoded to a point and matched to the nearest curb side.
- **Record.** Each ticket keeps its location, date and time, violation type and, where known, the rule that was cited.
- **Analysis.** Management can review tickets by time of day and area, compare them with the rules active at that time, and use the results to set patrol beats.
- **Privacy.** Ticket data can include plate numbers and officer identities. It is visible to management only and is excluded from the published-page phase.

## Staged roadmap

&#91;embedded content: phased roadmap · 4 phases, 4 gates\]

Phase 1 covers the first two stages on a published page with sample data. The gates are proposed exit criteria and can change as the open questions below are settled.

## Phase 1 requirements

The implementation plan traces each task to these IDs. Source: `docs/PLAN.md`.

| ID | Requirement |
| --- | --- |
| FR-1 | One shared day and hour drives every layer; one toggle per layer |
| FR-2 | Day picker, hourly slider, Now in Burbank time, play |
| FR-3 | Zoning polygons colored by category from exact zone code |
| FR-4 | Street sweeping by side, active highlighted, inactive muted |
| FR-5 | Timed parking, style per limit, "Zone X permit exempt" label, "active zones" list with exemptions |
| FR-6 | Restrictions (no-parking rows): three styles, "Zone X permit required" or "Zone X permit exempt" shown |
| FR-7 | No-stopping and no-standing rows in the highest-contrast style, distinguishable from each other, own toggle |
| FR-8 | Curb colors and schedules from a config file |
| FR-9 | Parallel side bands, trimmed at corners; click list of every rule with next change, permit exemptions and the side's permit zone, including sides not drawn |
| FR-10 | Permit zones polygon file (A to H, non-overlapping) and overview; each side's permit zone set at build time; zone filter limits every rule layer to one zone |
| FR-11 | Each side of a street drawn separately, as L/R relative to the segment's direction |
| FR-12 | Base street layer for all of Burbank with "not yet mapped" state |
| FR-13 | Last-updated date and reference-tool label |
| FR-14 | Usable on phone and desktop browser widths |
| DM-1 | Schedule windows: weekdays, start, end, midnight crossing, null, weeks of month |
| DM-2 | Every record has a city; city config holds time zone and zoning categories |
| DM-3 | Every file validated before it reaches the map, with file, row and reason for each problem |
| AR-1 to AR-4 | The four rules for the published page |

## Phase 1 decisions

Recorded 2026-10-15.

- Hosting: public GitHub Pages; rule data is not restricted.
- Base layer: OpenStreetMap streets for all of Burbank, split into blocks with stable IDs.
- Data entry: Burbank publishes none of this data, so all rules and polygons are created by hand. Rules are CSV rows keyed to block and side; zoning and permit polygons are drawn in a free GIS tool. Only the street base comes from outside (OpenStreetMap).
- Permit zones: separate polygon file.
- Sweeping: day-by-day for Burbank; schedule format and engine support week of month.
- Time controls: hourly steps.
- Stack: TypeScript, Vite, MapLibre GL JS, Vitest, GitHub Actions.

Recorded later, during Phase 1 build (see `docs/PLAN.md` and `docs/spike-notes.md`):

- Sides: stored as L/R relative to each segment's direction, not compass directions, because Burbank's grid is rotated about 45 degrees (band spike, M1-3).
- Band geometry: band trim, inner-facing sides and short blocks are worked out by the build script into a generated file; the page reads it and does no geometry. Starting values are revisited against real data in M6-4.
- Permit zones: lettered A to H, never overlapping, separate from zoning. A rule row has at most one permit code, meaning "required" on an except-by-permit restriction and "exempt" elsewhere.
- Zone filter: added to Phase 1. Each side's permit zone is set at build time from the polygons, so filtering by zone needs no hand marking. This replaces the earlier "filtering by a single permit is not required".
- Zoning categories start as residential, commercial, mixed use, industrial, open space and public, until the final grouping is set.
- Sample data: a separate `burbank-sample` data set with `SAMPLE-` and `DEMO-` codes is used for building and testing; the public site defaults to real data once it is switched on.
- Restrictions split: the restrictions layer draws only no-parking rows (three styles from permit code and schedule). The no stopping/standing/parking layer draws no-stopping and no-standing rows, with one visual difference between them.
- Authoring page: a separate, unlinked map page for finding segment IDs and sides during data entry.

## Phase 1 results and Phase 2 handoff

Fill this in at the end of Phase 1 (plan task M6-3). Phase 2 starts when every exit criterion is met or has an agreed exception.

**Exit criteria**

- [ ] All six rule layers and permit zones render for the pilot area.
- [ ] Hourly time controls drive every layer, and Now is correct in Burbank time.
- [ ] Every Burbank street shows, with unmapped blocks clearly marked.
- [ ] Curb detail lists every rule with its next change, matching the source rows.
- [ ] 20 of 20 walked curb sides match the map.
- [ ] Swapping the basemap or the loader touches only that module.
- [ ] Adding a block of rules takes the authoring README alone.

**Results**

| Item | Result |
| --- | --- |
| Live site URL |  |
| Pilot area mapped |  |
| Blocks with rules / total blocks |  |
| Accuracy walk result |  |
| Lessons on data entry |  |
| Changes needed before Phase 2 |  |

**Carried into Phase 2:** replace the basemap module with tiles, the loader with an API, add logins and roles, beat editing, live GPS, offline for the weak-signal area, and phone performance testing with full city data.

## Risks and open questions

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Hand-created geometry contains errors or goes stale | Officers see a rule that is wrong or out of date | Validate every file on import, show a last-updated date, label the map as a reference tool |
| Offset centerlines overlap at intersections and short blocks | Bands are hard to read | Tested on downtown Burbank in the band spike. A minimum width and fixed end trim were not enough on forks and divided roads, so bands are trimmed by angle, inner-facing sides are hidden and short blocks are skipped unless they carry a rule. Values are checked against real data in M6-4 |
| Hidden inner-facing sides | A viewer cannot tell from the map that a side has rules | Rules still show in the click-through list; whether to add a map hint is an open question |
| Many rules on one curb | Map becomes cluttered | Per-layer toggles, thin parallel bands, and a click-through list of every rule |
| No street basemap in Phase 1 | Viewers struggle to orient | OpenStreetMap street base with names in Phase 1; confirm the real basemap in Phase 2 |
| Address geocoding mismatches | Tickets land on the wrong curb | Show unmatched tickets for review instead of guessing |
| Rule data covers only part of the city at first | A blank street is read as unrestricted | Mark unmapped segments explicitly; pilot one dense area first |

**Open questions**

- [ ] Who enters and updates the zone and curb data after planning board decisions, and with what tool? Phase 1: the product owner, using CSV templates and a free GIS tool for polygons; the long-term owner is still open.
- [ ] What devices does management use?
- [ ] Should officers see their assigned beat, or only management?
- [ ] Is offline use needed for the one weak-signal area, or is a clear "no signal" message enough?
- [x] Where do permit zone boundaries come from, and how many permit types exist? Decided: a separate polygon file, drawn by hand since Burbank publishes no boundaries; eight zones, A to H.
- [ ] How are the 25 to 30 zoning types grouped into display categories? Starting categories are set (residential, commercial, mixed use, industrial, open space, public); the final grouping is still open.
- [ ] Which pilot area is mapped first? Blocks M6-1.
- [ ] Should the map hint that an inner-facing side has hidden rules, and should those sides reappear at high zoom? (`docs/data-dependent-decisions.md`, rows 6 and 7.)
- [ ] Should a permit code be allowed on no-stopping and no-standing rows? The schema allows it today, but an exemption there would let permit holders stop where stopping is banned. Likely restrict permit codes to no-parking rows.
- [ ] Which geocoding source will be used for ticket addresses?
- [ ] What hosting and security standards will apply once they are provided?
