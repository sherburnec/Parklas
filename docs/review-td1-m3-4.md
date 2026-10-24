# Review of TD-1, TD-2, M3-1, M3-2, TD-3, M3-3, TD-4, M3-4 against later decisions

Also checked: the parts of M2-4 and M2-5 those tasks rely on. Input for regenerating the remaining prompts.

Decisions: (1) `side` is L/R relative to segment direction; (2) bands use `trim.json` flags and one shared band config; (3) loader takes a `city_id`, CI builds every city folder; (4) CLAUDE.md matches the PLAN.md starter.

## M2-6 status

M2-6 is already done in code and ticked in PLAN.md (commit 68dd98a).

- Done: `rule-row.schema.json` allows only L/R; validator rejects N, S, E, W and l/r; `sideToOffset` in `build.ts` maps L/R and throws otherwise; tests cover E, W, N, S, four diagonals and a reversed segment; sample generator uses L/R; `data/burbank-sample/rules.csv` regenerated (236 L, 212 R); templates and `data/README.md` updated; `findDirectionChanges` reports reversed segments.
- Differs from the row wording: the direction check is part of `extract-burbank-segments.ts --force`, not of `build:data`. It matches decision 1 (a deliberate re-extraction must report). The row now says so.
- Two plan texts it left outdated (M2-4 "Done when", TD-4 example) are fixed below.

## Conflicts

| File | Conflict | Decision | Fixed by | Action taken |
| --- | --- | --- | --- | --- |
| `src/layers/sweeping.ts` | Band offsets and widths are hard-coded constants; the build script has no copy | 2 | M2-8 (shared config), M3-10 (layers read it) | Code untouched. M3-10 row now names the constants and says the shared config replaces them. |
| `src/layers/sweeping.ts`, `draw-sweeping.ts` | Full-length bands: no trim, no inner-side skip, no sliver rule | 2 | M3-10 | Code untouched. Row already named all three. |
| `src/data-loader/load-city.ts` | Does not load `trim.json` | 2 | M2-8 (loader accepts), M3-10 (loader exposes) | Code untouched. Rows already name it. |
| `scripts/lib/validate.ts`, `schemas/` | No schema or file-name entry for `trim.json`; a committed one would be flagged as unrecognised | 2 | M2-8 | Code untouched. M2-8 row now says `trim.json` needs its own JSON Schema. |
| `scripts/lib/data-set.ts`, `scripts/build-data.ts` | Sample folders borrow `segments.geojson` from their source city, but nothing borrows or publishes `trim.json` | 2, 3 | M2-8 (was silent) | Code untouched. M2-8 row now covers borrowing and publishing for every city folder. |
| `.gitignore` | Lines `CLAUDE.md` and `docs/s*.md` kept `CLAUDE.md` and `docs/spike-notes.md` out of git and CI. `CLAUDE.md` text already equals the PLAN.md starter | 4 | none | Removed both lines. The pattern also hid `docs/schedule-engine.md`, which now shows as untracked. Nothing was staged or committed. |
| `data/README.md` | Said "about 320 rows"; the file has 448 after TD-4 | none (stale doc) | none | Changed to "about 450 rows". |
| `src/main.ts` | `CITY_ID = 'burbank'` is hard-coded, so "a new city needs only a data folder" is true for build and deploy but not for which city the page shows | 3 | none | No change. Phase 1 has one city; revisit if a second is added. |
| `spike/spike.ts` | Picks sides by compass | 1 | none needed | No change. Throwaway code, outside the `tsconfig` include, and the spike notes already say so. |

No conflict: `deploy.yml` validates and builds both data sets, so every city folder is built; the loader takes a `cityId`; no `fetch()` outside the loader; no browser storage; only `main.ts` imports basemap; modules import each other through `index.ts`.

No conflict needed a coded fix, so no new test was added.

## Changes to docs/PLAN.md

1. Task count line: "30 tasks" is now "39 tasks" (M0 to M6 plus four TD tasks).
2. M2-4 "Done when": N/S and E/W marked "(superseded by M2-6 ...)".
3. TD-1 row: 30-segment sample marked "(superseded by TD-2 ...)".
4. TD-4 row: "N Monday, S Tuesday" marked superseded; now L Monday, R Tuesday.
5. M2-6 row: notes the direction report lives in the extract script. Still ticked.
6. M2-8 row: `trim.json` JSON Schema; sample folders borrow it; `build:data` publishes it.
7. M3-10 row: hard-coded band constants replaced by the shared config.
8. M4-3 row: inner-facing sides and skipped slivers still list their rules.
9. Data flow step 4: build also writes `trim.json`.
10. Critical path: now M2-4 → M2-6 → M2-8 → M3-10 → M3-5 → M4-4 → M6-3, old path kept for reference.
11. "Runs in parallel": M6-1 also needs M2-7; M3-3 marked done; added M2-7 beside M2-8 and M3-5 to M3-8 waiting on M3-10.
12. Band-overlap risk row: mitigation points to M2-8 and M3-10.
