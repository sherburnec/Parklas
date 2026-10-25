# Adding data

Everything here is typed by hand. Each city has its own folder, `data/<city_id>/` (for Burbank, `data/burbank/`). The files you add live in that folder. Copy starting files from `data/burbank/templates/`.

| You want to add | File in `data/burbank/` | Start from |
| --- | --- | --- |
| Sweeping, timed parking, restrictions, no stopping, curb colors | `rules.csv` | `templates/rules.csv` (headers only) or `templates/rules.example.csv` (5 examples) |
| Curb color list | `curb-colors.json` | `templates/curb-colors.json` |
| Zoning areas | `zoning.geojson` and `zoning-categories.json` | `templates/zoning.example.geojson`, `templates/zoning-categories.json` |
| Permit zones | `permit-zones.geojson` | `templates/permit-zones.example.geojson` |

## Sample data set

`data/burbank-sample/` is made-up data for building and testing the layers. Its zone codes start with `SAMPLE-` and its permit codes with `DEMO-`; the validator rejects anything else. It borrows `data/burbank/segments.geojson` and never copies it, and its rules may fall on any segment in that file.

What it holds:

- `rules.csv`: about 600 rows on 244 of 2582 segments, spread over the whole city, across sweeping, timed parking, restrictions (no parking at any time, at set times, or with a `DEMO-` permit code that matches the permit zone it sits in; no standing; no stopping on corner blocks) and curb colors. Schedules include always-on, day and hour windows, a window that crosses midnight, and a few `weeks_of_month` windows. Every other block stays "not yet mapped".
- The last 14 rows of `rules.csv` are a fixed set of edge cases (task TD-9): three sides with rules from four layers stacked on each, one inner-facing side and one sliver. `test-cases.md` lists each of those sides (segment_id, street, cross streets, L or R) and what the map and the curb detail list should show at three day-and-hour times. It is written by the same script; the validator and the build ignore it.
- `curb-colors.json` and `zoning-categories.json`: a few entries each.
- `zoning.geojson` (20 `SAMPLE-` polygons tiling the whole city, written by `npm run generate:sample`, do not edit by hand) and `permit-zones.geojson` (4 `DEMO-` polygons): coarse rectangles in different parts of the city. Edit the permit zones by hand.

`rules.csv` here is written by a seeded script, so the same command always gives the same file. Do not edit it by hand; regenerate it:

```
npm run generate:sample
```

The script reads `data/burbank/segments.geojson` (it never changes it) and picks segments by sampling each part of an 8 x 8 grid over the city. To get a different spread, change `SAMPLE_SEED` in `scripts/lib/sample-data.ts`, then update the seed in `scripts/lib/sample-data.test.ts`. `npm test` fails if `rules.csv` is out of step with the script.

The `DATA_SET` setting picks which folders `validate`, `build:data` and the page use: `sample` (the default) uses folders named `<city_id>-sample`, `real` uses the others. In PowerShell: `$env:DATA_SET='real'; npm run validate`. When the page uses the sample set it shows "Sample data. Not real Burbank rules."

Never edit `segments.geojson`. It is the street list and must not change. Every `L` and `R` in `rules.csv` is read against the direction of its segment in that file, so a segment drawn the other way round would put its rows on the opposite curb. When the file is deliberately re-extracted (`node scripts/extract-burbank-segments.ts --force`), the script lists every segment whose direction is reversed, next to the added, removed and changed ones. It only reports; check the rows for those segments yourself.

## Short blocks and inner sides on the map

`npm run build:data` also writes `data/<city_id>/trim.json`, so the map can keep the side bands tidy. You never edit it, and it is rebuilt from `segments.geojson` and `config/band-geometry.json` (band offsets and widths). Two things follow for your data:

- **A block under 20 m is drawn only if it has a rule row.** Short connecting blocks between two roads are left off the map unless you give them a rule. Their rows still work as normal.
- **Inner-facing sides are not drawn on the map, but they still appear in the click-through list.** Where two roads run side by side, such as the two halves of a divided road, the sides that face each other are skipped because the bands would cross. Write their rows as you would for any other side.

## Authoring page: find a segment_id and its sides

The authoring page is a separate map for data entry. The public page does not link to it.

1. Run `npm run dev` and open `http://localhost:5173/authoring.html` (use the port Vite prints). On the deployed site it is `authoring.html` next to the main page, but nothing links to it.
2. Zoom in. Every block has an arrow showing its direction, a blue line with an `L` on its left and an orange line with an `R` on its right, both read facing along the arrow.
3. Click a block. The panel shows its street and cross streets and its `segment_id`, and copies the `segment_id` to the clipboard. Paste it into `rules.csv`, and use `L` or `R` for the side you saw.

The page draws the sides with the same code as `npm run build:data`, so the side you see marked `L` is the side the build draws for an `L` row, including on a block whose direction runs the other way round.

## 1. Find a segment_id

A segment is one block of one street, from one cross street to the next. Every block has a `segment_id`.

The easiest way is the authoring page (next section). To look it up in the file instead:

1. Open `data/burbank/segments.geojson` in VS Code.
2. Press Ctrl+F and type the street name, for example `West Magnolia Boulevard`.
3. Each line is one block. Find the one whose `from_street` and `to_street` are the cross streets you want. Copy its `segment_id`, for example `burbank-118435906-123108474`.

One block, two sides (`L` and `R`): each side gets its own row. To tell which is which, note the first and last coordinate of the segment's line: stand at the first and face the last, and `L` is on your left.

## 2. What each column means

`rules.csv` has one row per rule on one side of one block.

| Column | What to write |
| --- | --- |
| `segment_id` | The block, copied exactly from step 1. |
| `side` | `L` or `R`: the side of the block the rule is on, as seen facing along the segment's direction (from the first coordinate of its line in `segments.geojson` to the last). This is not a compass or city-grid direction. Any other value is rejected when you build. |
| `layer` | `sweeping`, `timed_parking`, `restrictions` or `curb_color`. |
| `type` | Only for `restrictions`: `no_parking`, `no_standing` or `no_stopping`. Leave empty for the other layers. A `no_stopping` row is what draws the strongest "no stopping, standing or parking" style. |
| `limit_minutes` | Only for `timed_parking`: the limit in minutes. 2 hours is `120`. Leave empty otherwise. |
| `permit_code` | Optional, for `timed_parking` and `restrictions`: the permit zone the row names, for example `A`. On a timed parking row, holders of that zone's permit are exempt. On a restrictions row, see `permit_mode`. Leave empty otherwise. |
| `permit_mode` | Only for a `restrictions` row of type `no_parking` that has a `permit_code`. `required` means no parking except by permit: only holders of that zone's permit may park, shown as "Zone A permit required". Empty or `exempt` means the ban applies to everyone except holders, shown as "Zone A permit exempt". Leave empty otherwise. |
| `color_key` | Only for `curb_color`: a color name from `curb-colors.json`, for example `red`. Leave empty otherwise. |
| `schedule` | When the rule is in force (step 3). Empty means always. |

The street name and cross streets are filled in for you from the segment.

## 3. Write a schedule

A schedule is a list of windows. Each window has days, a start time and an end time (24-hour clock). Copy this pattern and change the parts that differ:

```
{"windows":[{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"18:00"}]}
```

- Days are `sun` `mon` `tue` `wed` `thu` `fri` `sat`, lower case.
- An end earlier than the start runs past midnight: `"start":"18:00","end":"06:00"` on Monday ends Tuesday at 06:00.
- Several windows: put commas between them inside the `[ ]`, for example one for Monday and another for Thursday with different hours.
- Only some weeks of the month: add `"weeks_of_month":[1,3]` to the window. Burbank sweeping does not need this.
- Always in force: leave the cell empty.

**In a spreadsheet or text file:** the schedule has commas and quotes, so the whole cell must be wrapped in double quotes and every quote inside it doubled:

```
"{""windows"":[{""days"":[""mon""],""start"":""08:00"",""end"":""10:00""}]}"
```

Excel and Google Sheets do this for you if you paste the plain pattern into the cell and save as CSV. In a text editor, type it as shown. Open `templates/rules.example.csv` to see all five kinds of row.

## 4. Draw a polygon (zoning or permit zones)

**geojson.io**

1. Go to geojson.io and zoom to the area.
2. Click the polygon tool (left of the map), click each corner, and click the first corner again (or press Enter) to finish.
3. In the table on the right, click the shape and add its properties (names below).
4. Choose Save, then GeoJSON. Copy the shape out of the downloaded file into the right file in `data/burbank/`. Keep the layout of the template: a `FeatureCollection` holding a list of `features`.

**QGIS**

1. Layer, Create Layer, New GeoPackage Layer. Choose type Polygon and CRS EPSG:4326. Add the text fields named below.
2. Toggle editing, add each polygon, and fill in the fields.
3. Export, Save Features As, format GeoJSON, CRS EPSG:4326, and save over the file in `data/burbank/`.

Coordinates must be longitude then latitude in degrees (EPSG:4326), as in the templates.

Properties each polygon needs:

- Zoning: `zone_code` (the exact code, like `R-1`), `category` (a key from `zoning-categories.json`), `name`, `city_id` (`burbank`).
- Permit zones: `permit_code`, `name`, `city_id` (`burbank`).

Permit zones must not overlap; two zones may share a border. Draw each border along the street line, so the two sides of that street fall in different zones. `build:data` works out each side's zone itself (a point 4 m off the middle of the block, toward that side) and writes it as `permit_zone` on that side's features in every layer file; you never mark a zone on a rule. The validator reports an error for overlapping zones and for a `permit_code` that names no zone in the file. It prints a warning (the build still runs) when a row's `permit_code` differs from the zone its side falls in, and when a block's two ends fall in different zones, which usually means a border cuts across the block.

A new zone code needs a line in `zone_codes` in `zoning-categories.json` pointing at a category. A new curb color needs an entry in `curb-colors.json`.

## 5. Check and build

Run these in the VS Code terminal from the project folder:

```
npm run validate
npm run build:data
```

- `validate` checks every file. If something is wrong it prints the file, the row and the reason, for example `data/burbank/rules.csv, row 3: segment_id "..." is not in segments.geojson`. Row 1 is the header. Fix that row and run it again until it says `0 problems`.
- `build:data` runs the check first, then writes the map files to `public/data/`. It prints how many rows and segments it covered. Nothing is written if there is a problem.

## Adding one block of rules: quick path

1. Copy `templates/rules.csv` to `data/burbank/rules.csv` (skip if it already exists).
2. Find the `segment_id` (step 1).
3. Add a row per side per rule (step 2), with a schedule if it has one (step 3).
4. If you used a curb color, copy `templates/curb-colors.json` to `data/burbank/` first.
5. Run `npm run validate`, then `npm run build:data`.
