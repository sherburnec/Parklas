# Adding data

Everything here is typed by hand. Each city has its own folder, `data/<city_id>/` (for Burbank, `data/burbank/`). The files you add live in that folder. Copy starting files from `data/burbank/templates/`.

| You want to add | File in `data/burbank/` | Start from |
| --- | --- | --- |
| Sweeping, timed parking, restrictions, no stopping, curb colors | `rules.csv` | `templates/rules.csv` (headers only) or `templates/rules.example.csv` (5 examples) |
| Curb color list | `curb-colors.json` | `templates/curb-colors.json` |
| Zoning areas | `zoning.geojson` and `zoning-categories.json` | `templates/zoning.example.geojson`, `templates/zoning-categories.json` |
| Permit zones | `permit-zones.geojson` | `templates/permit-zones.example.geojson` |

Never edit `segments.geojson`. It is the street list and must not change.

## 1. Find a segment_id

A segment is one block of one street, from one cross street to the next. Every block has a `segment_id`.

The map does not show IDs yet, so look it up:

1. Open `data/burbank/segments.geojson` in VS Code.
2. Press Ctrl+F and type the street name, for example `West Magnolia Boulevard`.
3. Each line is one block. Find the one whose `from_street` and `to_street` are the cross streets you want. Copy its `segment_id`, for example `burbank-118435906-123108474`.

One block, two sides: each side gets its own row.

## 2. What each column means

`rules.csv` has one row per rule on one side of one block.

| Column | What to write |
| --- | --- |
| `segment_id` | The block, copied exactly from step 1. |
| `side` | `N`, `S`, `E` or `W`: the side of the street the rule is on. Use `N` or `S` on an east-west street, `E` or `W` on a north-south street. Any other choice is rejected when you build. |
| `layer` | `sweeping`, `timed_parking`, `restrictions` or `curb_color`. |
| `type` | Only for `restrictions`: `no_parking`, `no_standing` or `no_stopping`. Leave empty for the other layers. A `no_stopping` row is what draws the strongest "no stopping, standing or parking" style. |
| `limit_minutes` | Only for `timed_parking`: the limit in minutes. 2 hours is `120`. Leave empty otherwise. |
| `permit_code` | Optional, for `timed_parking` and `restrictions`: the permit that is exempt, for example `A`. Leave empty otherwise. |
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
