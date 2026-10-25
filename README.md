# Curb & Zoning Map

A map of the parking rules on every curb in Burbank, CA, at any day and hour you pick. You can see street sweeping, timed parking, no-parking rules, no stopping/standing, curb colors, zoning and permit zones together, and each side of the street is shown separately.

It is a static website (no server) published to GitHub Pages. **It is a reference tool, not the official source for citations.**

> **Project status (Oct 2026): Phase 1, mid-build.** The map, layers, time controls and data tools are built. The public site still shows **made-up sample data** with a yellow "Sample data" banner. Next comes switching to real Burbank data (task TD-10), then entering pilot data (M6-1). See [docs/PLAN.md](docs/PLAN.md) for the full task list.

---

## Contents

- [Pages](#pages)
- [Quick start (run it on your computer)](#quick-start)
- [Updating the data](#updating-the-data)
- [Commands](#commands)
- [How the project is laid out](#how-the-project-is-laid-out)
- [More documents](#more-documents)

---

## Pages

The site has two pages. A third page exists only for developers.

### 1. The map: `index.html` (public)

**Who uses it:** enforcement officers (phone or tablet) and management (desktop).
**What it answers:** "What rules apply on this curb right now, or at another time, and when do they change?"

| Feature | Where | What it does |
| --- | --- | --- |
| **Day and time** | Top centre | Pick a day (Mon to Sun) and drag the slider to pick an hour. A rule counts as on if it is in force at the start of that hour. |
| **Now** | In the time box | Jumps to the current day and hour in Burbank time, whatever time zone your device is in. |
| **Play / Pause** | In the time box | Moves through the day hour by hour, so you can watch rules switch on and off. |
| **Layer toggles** | Top left | Turn each layer on or off: Zoning, Permit zones, Street sweeping, Timed parking, Restrictions, No stopping / standing, Curb colors. |
| **Permit zone filter** | Left | Pick All, one permit zone, or No zone. Every rule layer then shows only curb sides in that zone, and the zone is outlined on the map. |
| **Curb detail** | Right (click any block) | Lists every rule on both sides of the block, including ones that are off right now. Each rule shows whether it is active, when it next changes, any permit wording ("Zone A permit required" or "Zone A permit exempt") and which permit zone the side is in. The heading shows the block number when it is known, for example "1200 block of West Olive Avenue". |
| **Zones for the day** | Bottom centre | Lists every timed parking zone in force on the chosen day, with its limit, hours and permit exemption. Click one to fly to it and open its curb detail. |
| **Legends** | Bottom right | The colors and line styles for each layer. |
| **Footer** | Bottom | The reference-tool notice and the date the data was last updated. |

**Reading the map**

- Each rule is a thin coloured band along the curb. Several rules on one curb sit side by side, so none hides another.
- A street drawn as a **dashed red line**, with "Not yet mapped" in the curb detail, means **nobody has entered rules for that block yet**. It does **not** mean the curb has no restrictions.
- A few curb sides are not drawn: the sides facing each other on a divided road, and blocks shorter than about 20 m that have no rules. Their rules still appear in the curb detail.
- On a phone (700 px wide or less) the controls move into a panel at the bottom. Tap **Show controls** / **Hide controls** to open or close it.

**Sharing a view:** the address bar keeps the day, hour, hidden layers and zone filter, for example `?day=sat&hour=14&hide=zoning&zone=C`. Copy the address to send someone exactly what you see.

### 2. The authoring map: `authoring.html` (internal, for data entry)

**Who uses it:** whoever enters rule data.
**What it answers:** "What is this block's `segment_id`, and which side is L and which is R?"

Nothing on the public site links to this page. Open it by typing its address:

- On your computer: `http://localhost:5173/authoring.html` (after `npm run dev`).
- On the live site: add `authoring.html` to the end of the site address.

How to use it:

1. Zoom in on the block you want.
2. Each block has an **arrow** showing its direction, a **blue line marked L** (left, facing along the arrow) and an **orange line marked R** (right).
3. **Click the block.** A box shows the street, its cross streets and its `segment_id`, and the `segment_id` is copied to your clipboard, ready to paste into `rules.csv`.

### 3. Band spike: `spike/index.html` (developers only)

An early experiment (task M1-3) for tuning band widths and offsets with sliders. It is only available through `npm run dev` at `/spike/index.html` and is not published.

---

## Quick start

You need [Node.js](https://nodejs.org/) 22 or newer and Git.

```
git clone https://github.com/sherburnec/Parklas.git
cd Parklas
npm install
npm run build:data
npm run dev
```

Open the address Vite prints (usually `http://localhost:5173/`).

`npm run build:data` must run at least once before `npm run dev`, because the page reads the map files it writes into `public/data/`. Run it again whenever you change anything in `data/`.

---

## Updating the data

All rule data is typed by hand. Burbank does not publish it. This section is the short version. The full field-by-field guide, with every column, polygon drawing in geojson.io and QGIS, and block numbers, is [data/README.md](data/README.md).

### The one rule to remember

> **Edit files in `data/`. Never edit `public/data/`, `segments.geojson` or `trim.json`.**
> `public/data/` is rebuilt from `data/` every time. `segments.geojson` is the frozen street list. Changing it moves every rule onto the wrong curb.

### Which file do I edit?

Each city has a folder. Burbank's real data lives in `data/burbank/`.

| I want to change... | Edit this file | Start by copying |
| --- | --- | --- |
| Sweeping, timed parking, no parking, no standing, no stopping, curb colors on a block | `data/burbank/rules.csv` | `data/burbank/templates/rules.csv` (headers only) |
| The list of curb colors (name, color, time limit, usual hours) | `data/burbank/curb-colors.json` | `data/burbank/templates/curb-colors.json` |
| Zoning areas | `data/burbank/zoning.geojson` | `data/burbank/templates/zoning.example.geojson` |
| How zone codes group into map colors (R-1 is "Residential"...) | `data/burbank/zoning-categories.json` | `data/burbank/templates/zoning-categories.json` |
| Permit zone areas (A to H) | `data/burbank/permit-zones.geojson` | `data/burbank/templates/permit-zones.example.geojson` |
| Block numbers ("1200 block of...") | `data/burbank/blocks.csv` (to-do list: `blocks-report.md`) | already exists |
| City name or time zone | `data/burbank/city.json` | already exists |

**Do not hand-edit** these, they are made by scripts: `segments.geojson`, `trim.json`, everything in `public/`, and `rules.csv` / `zoning.geojson` in `data/burbank-sample/`.

### The update loop

Every change follows the same five steps.

```
 1. Edit a file in data/burbank/
 2. npm run validate          <- checks your work, tells you the file, row and reason for any mistake
 3. npm run build:data        <- turns data/ into the map files
 4. npm run dev               <- look at it on the map
 5. commit and push to main   <- GitHub checks it again and publishes it
```

Until task TD-10 is done, the scripts work on the **sample** data by default. To check and build the **real** Burbank folder, set `DATA_SET=real` first:

```
# PowerShell
$env:DATA_SET='real'; npm run validate
$env:DATA_SET='real'; npm run build:data

# Git Bash / macOS / Linux
DATA_SET=real npm run validate
DATA_SET=real npm run build:data
```

### Adding rules for one block: worked example

**Goal:** the north side of the 100 block of East Olive Avenue has 2-hour parking, Monday to Friday, 8 AM to 6 PM.

**Step 1. Find the block and its side.**
Open the authoring map (`http://localhost:5173/authoring.html`), zoom to the block and click it. Its `segment_id` is copied, for example `burbank-118435906-123108474`. Look at which coloured line runs along the curb you mean: blue is **L**, orange is **R**.

> L and R are always relative to the arrow on the block, never north, south, east or west. Burbank's streets are tilted about 45 degrees from the compass, so compass directions would be ambiguous.

**Step 2. Add one row to `rules.csv`.**
Each row is **one rule on one side of one block**. Two sides with the same rule need two rows.

```
segment_id,side,layer,type,limit_minutes,permit_code,permit_mode,color_key,schedule
burbank-118435906-123108474,L,timed_parking,,120,,,,"{""windows"":[{""days"":[""mon"",""tue"",""wed"",""thu"",""fri""],""start"":""08:00"",""end"":""18:00""}]}"
```

Leave a cell empty (two commas in a row) when it does not apply. The street name and cross streets are filled in for you.

**Step 3. Validate, build and look.**

```
$env:DATA_SET='real'; npm run validate
$env:DATA_SET='real'; npm run build:data
$env:DATA_SET='real'; npm run dev
```

Click the block on the map and check the curb detail lists the new rule.

### What goes in each column

| Column | Fill in for | What to write | Example |
| --- | --- | --- | --- |
| `segment_id` | every row | The block's ID from the authoring map | `burbank-118435906-123108474` |
| `side` | every row | `L` or `R` | `L` |
| `layer` | every row | `sweeping`, `timed_parking`, `restrictions` or `curb_color` | `timed_parking` |
| `type` | `restrictions` only | `no_parking`, `no_standing` or `no_stopping` | `no_parking` |
| `limit_minutes` | `timed_parking` only | The time limit in minutes | `120` (2 hours) |
| `permit_code` | `timed_parking` or `restrictions`, optional | The permit zone letter named on the sign | `A` |
| `permit_mode` | `no_parking` with a `permit_code` only | `required` = only permit holders may park. `exempt` or empty = permit holders are exempt | `required` |
| `color_key` | `curb_color` only | A color name from `curb-colors.json` | `red` |
| `schedule` | any row, optional | When the rule is on (see below). **Empty = always on** | see below |

**Which `layer` and `type` for each sign:**

| The sign or curb says | `layer` | `type` | Other columns |
| --- | --- | --- | --- |
| Street sweeping Mon 8 to 10 AM | `sweeping` | | `schedule` |
| 2 hour parking 8 AM to 6 PM | `timed_parking` | | `limit_minutes` = `120`, `schedule` |
| 2 hour parking, Zone B permits exempt | `timed_parking` | | `limit_minutes`, `permit_code` = `B`, `schedule` |
| No parking 6 PM to 6 AM | `restrictions` | `no_parking` | `schedule` |
| No parking any time | `restrictions` | `no_parking` | leave `schedule` empty |
| No parking except by Zone A permit | `restrictions` | `no_parking` | `permit_code` = `A`, `permit_mode` = `required` |
| No standing | `restrictions` | `no_standing` | `schedule` if timed |
| No stopping | `restrictions` | `no_stopping` | `schedule` if timed |
| Red curb | `curb_color` | | `color_key` = `red` (its hours come from `curb-colors.json` unless you fill `schedule`) |

[data/burbank/templates/rules.example.csv](data/burbank/templates/rules.example.csv) has five ready-made rows to copy from.

### Writing a schedule

A schedule says when a rule is on. It is a list of time windows. Copy this pattern and change the days and times:

```
{"windows":[{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"18:00"}]}
```

- **Days:** `mon` `tue` `wed` `thu` `fri` `sat` `sun`, lower case.
- **Times:** 24-hour clock. 6 PM is `18:00`.
- **Overnight:** an end time earlier than the start runs past midnight. `"start":"18:00","end":"06:00"` on `mon` lasts until Tuesday 6 AM.
- **Different hours on different days:** add more windows, separated by commas:
  `{"windows":[{"days":["mon"],"start":"08:00","end":"10:00"},{"days":["thu"],"start":"12:00","end":"14:00"}]}`
- **Only some weeks of the month** (not used in Burbank): add `"weeks_of_month":[1,3]` inside the window.
- **Always on:** leave the cell empty.

**The quotes problem.** In a CSV file, the schedule cell must be wrapped in double quotes, and every quote inside it doubled:

```
"{""windows"":[{""days"":[""mon""],""start"":""08:00"",""end"":""10:00""}]}"
```

- **In Excel or Google Sheets:** paste the plain pattern into the cell and save as CSV. The program adds the extra quotes for you.
- **In a text editor (VS Code, Notepad):** type the doubled-quote version exactly as shown.

### Adding a new curb color or zone code

- **New curb color:** add an entry to `curb-colors.json`. The key (for example `blue`) is what you type in the `color_key` column.
  ```json
  "blue": { "label": "Blue: disabled parking", "hex": "#1565C0", "time_limit_minutes": null, "default_schedule": null }
  ```
- **New zoning code:** add a line under `zone_codes` in `zoning-categories.json`, pointing to a category, for example `"R-2": "residential"`.

### Drawing zoning or permit zone areas

Draw polygons in [geojson.io](https://geojson.io) or QGIS, then paste them into `zoning.geojson` or `permit-zones.geojson`. Each polygon needs these properties:

- **Zoning:** `zone_code` (exactly as the city writes it, like `R-1`), `category`, `name`, `city_id` = `burbank`
- **Permit zones:** `permit_code` (like `A`), `name`, `city_id` = `burbank`

Permit zones must not overlap. Draw shared borders down the middle of the street so the two sides fall into different zones. You never mark a permit zone on a rule row: the build works out each curb side's zone from these polygons. Step-by-step drawing instructions are in [data/README.md, section 4](data/README.md#4-draw-a-polygon-zoning-or-permit-zones).

### When `validate` reports a problem

`npm run validate` prints one line per problem with the file, the row and the reason, then a summary such as `burbank: 4 files checked, 0 problems`. **Row 1 is the header**, so row 2 is your first rule.

| Message mentions | Usual cause | Fix |
| --- | --- | --- |
| `is not in segments.geojson` | The `segment_id` was mistyped or only partly copied | Copy it again from the authoring map |
| `side` | Used N, S, E or W, or lower case | Use `L` or `R` |
| `type`, `limit_minutes` or `color_key` | A column filled for the wrong layer, or left empty for the right one | Check the "Fill in for" column in the table above |
| `schedule` | Broken quotes or brackets, wrong day name, time not `HH:MM` | Start again from the pattern above |
| a `permit_code` that is not a zone | The letter is not in `permit-zones.geojson` | Fix the letter or add the zone polygon |
| `overlaps zone` | Two polygons cover the same ground | Redraw the border so they only touch |

A **warning** (the build still runs) means something looks odd but may be right, for example a row's `permit_code` is different from the zone its curb sits in. Check it against the sign.

### Publishing

Push or merge to `main`. GitHub Actions then:

1. runs the tests,
2. validates the sample **and** real data folders (a single bad row stops the deploy, so a mistake never reaches the live site),
3. builds the map files and the site,
4. publishes it to GitHub Pages.

Watch it under the repository's **Actions** tab. The live address is shown under **Settings > Pages**. To undo a bad change, revert the commit and push.

### The sample data set

`data/burbank-sample/` is made-up data for testing the map. Its zoning codes start with `SAMPLE-` and its permit codes with `DEMO-`, so they can never be confused with real ones. Its `rules.csv` and `zoning.geojson` are written by a script, so do not edit them by hand. Run `npm run generate:sample` instead. `test-cases.md` in that folder lists curb sides with known answers for checking the map by eye.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Installs everything the project needs. Run once after cloning. |
| `npm run dev` | Starts the site on your computer, reloading as you edit code. |
| `npm run validate` | Checks every data file. Prints file, row and reason for each problem. |
| `npm run build:data` | Validates, then writes the map files into `public/data/`. Writes nothing if there is a problem. |
| `npm run generate:sample` | Rewrites the sample rules and sample zoning. |
| `npm test` | Runs all tests. |
| `npm run build` | Type-checks and builds the site into `dist/`. |
| `npm run preview` | Serves the built `dist/` site locally. |
| `npm run lint` | Checks code style. |

Add `DATA_SET=real` in front of `validate`, `build:data`, `dev` or `build` to use the real data instead of the sample (see [The update loop](#the-update-loop)).

---

## How the project is laid out

```
data/
  burbank/              Real Burbank data (you edit this)
    templates/          Starting files to copy
    segments.geojson    Frozen street list. Never edit.
  burbank-sample/       Made-up test data
  README.md             Full data-entry guide
schemas/                The rules each data file must follow
config/                 Band widths and offsets, shared by build and page
scripts/                Validator, data build, OSM extraction, sample generator
src/
  basemap/              Street lines and names (the only module that draws the base map)
  data-loader/          The only code that fetches data
  schedule-engine/      Works out whether a rule is on and when it next changes
  layers/               Draws each rule layer
  time-ui/              Day, hour, Now, Play, toggles, zone filter, URL state
  curb-detail/          Curb detail list and "Zones for the day"
  authoring/            The authoring map page
index.html              The public map
authoring.html          The authoring map
docs/                   PRD, plan and design notes
```

Built with TypeScript, Vite, MapLibre GL JS and Vitest. Modules talk to each other only through their `index.ts`, and app state lives in memory and the URL, never in browser storage. These rules let Phase 2 swap the street base for map tiles and the file loader for an API without rewriting the rest. They are listed in [CLAUDE.md](CLAUDE.md) and enforced by tests.

---

## More documents

| Document | What is in it |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | What the product is for, who uses it, requirements, phases |
| [docs/PLAN.md](docs/PLAN.md) | Phase 1 task list, done and remaining |
| [data/README.md](data/README.md) | Complete data-entry guide |
| [data/burbank/blocks-report.md](data/burbank/blocks-report.md) | Blocks still missing a block number |
| [docs/schedule-engine.md](docs/schedule-engine.md) | How schedules are evaluated |
| [docs/spike-notes.md](docs/spike-notes.md) | Why bands and L/R sides work the way they do |
| [docs/data-dependent-decisions.md](docs/data-dependent-decisions.md) | Settings to re-check once real data exists |
