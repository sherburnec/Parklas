# Sample edge cases (task TD-9)

Written by `npm run generate:sample`. Do not edit by hand; `npm test` fails if this file differs from what the script writes.

Each case below is one street side whose rules are the last rows of `rules.csv`. Check the map and the curb detail list against the results listed for each time.

- **Times.** All times are on the Burbank clock (America/Los_Angeles) in the app's reference week: Sun 4 Jan to Sat 10 Jan 2026. The slider steps by the hour, and a rule counts as active if it is in force at HH:00. The detail list shows exact start and end times.
- **Map.** "Active" bands are drawn at full strength and inactive bands muted. Each rule is drawn in its own layer, so a side with rules in several layers shows several parallel bands.
- **Detail list.** Lists every rule on the side, active or not, with its next change. "Next change" is the next time the rule turns on or off, counted from the hour checked.
- **Side.** L and R are relative to the segment's direction (first to last coordinate in `segments.geojson`), facing along it.

| Case | segment_id | Street | Cross streets | Side | What it tests |
| --- | --- | --- | --- | --- | --- |
| A | `burbank-122647357-122907123` | West Chandler Boulevard South | North Naomi Street and Florence Street | L | Stack with a midnight crossing, a null schedule and an 08:30 start |
| B | `burbank-123482396-123605880` | North Parish Place | Bonita Avenue and Rosita Avenue | L | Stack with a Sunday-into-Monday window |
| C | `burbank-123442566-123442570` | Lake Street | West Linden Avenue and West Linden Avenue | L | Stack with a weeks_of_month [1, 3] row |
| D | `burbank-1897595379-6606789899` | Empire Avenue | (none) and Clybourn Avenue | R | Inner-facing side with one rule |
| E | `burbank-13505960224-13505960225` | South Hollywood Way | North Hollywood Way / Olive Avenue and Hollywood Way / Olive Avenue | R | Sliver with one rule |

## Case A: Stack with a midnight crossing, a null schedule and an 08:30 start

- segment_id: `burbank-122647357-122907123`
- Street: West Chandler Boulevard South, between North Naomi Street and Florence Street
- Side: **L**
- Permit zone: DEMO-F
- Drawing: drawn, one band per layer
- Sweeping starts at 08:30. The slider steps by the hour, so at Tue 08:00 it shows not active and at Tue 09:00 active; the detail list always shows 08:30 to 10:30.
- The no parking window runs Fri 22:00 to Sat 06:00 and Sat 22:00 to Sun 06:00. At Sat 02:00 it is active through Friday night's window.
- Timed parking has no schedule, so it is always active and has no next change.
- The green curb row has no schedule of its own, so it follows the green default in curb-colors.json (Mon to Fri 08:00 to 18:00).

| # | Map layer | Rule | Schedule |
| --- | --- | --- | --- |
| 1 | Street sweeping | Street sweeping | Tue 08:30–10:30 |
| 2 | Timed parking | 120 minute limit | none (always in force) |
| 3 | Restrictions | No parking | Fri, Sat 22:00–06:00 (crosses midnight) |
| 4 | Curb colors | green curb (uses the color's default: Mon–Fri 08:00–18:00) | none (always in force) |

#### Tue 09:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, active (full strength) | Active, next change Tue 10:30 |
| 2 | Timed parking | band drawn, active (full strength) | Active, no next change |
| 3 | Restrictions | band drawn, muted | Not active, next change Fri 22:00 (3 days later) |
| 4 | Curb colors | band drawn, active (full strength) | Active, next change Tue 18:00 |

#### Sat 02:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Tue 08:30 (3 days later) |
| 2 | Timed parking | band drawn, active (full strength) | Active, no next change |
| 3 | Restrictions | band drawn, active (full strength) | Active, next change Sat 06:00 |
| 4 | Curb colors | band drawn, muted | Not active, next change Mon 08:00 (2 days later) |

#### Fri 23:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Tue 08:30 (4 days later) |
| 2 | Timed parking | band drawn, active (full strength) | Active, no next change |
| 3 | Restrictions | band drawn, active (full strength) | Active, next change Sat 06:00 (1 day later) |
| 4 | Curb colors | band drawn, muted | Not active, next change Mon 08:00 (3 days later) |

## Case B: Stack with a Sunday-into-Monday window

- segment_id: `burbank-123482396-123605880`
- Street: North Parish Place, between Bonita Avenue and Rosita Avenue
- Side: **L**
- Permit zone: DEMO-B
- Drawing: drawn, one band per layer
- No standing runs from Sun 20:00 to Mon 04:00. It is active at Mon 02:00 although Monday is not in its days.
- The red curb row has its own schedule, which replaces red's default (none).

| # | Map layer | Rule | Schedule |
| --- | --- | --- | --- |
| 1 | Street sweeping | Street sweeping | Mon 08:00–10:00 |
| 2 | Timed parking | 60 minute limit | Mon–Sat 08:00–18:00 |
| 3 | No stopping/standing | No standing | Sun 20:00–04:00 (crosses midnight) |
| 4 | Curb colors | red curb | Mon–Fri 16:00–18:00 |

#### Sun 23:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Mon 08:00 (1 day later) |
| 2 | Timed parking | band drawn, muted | Not active, next change Mon 08:00 (1 day later) |
| 3 | No stopping/standing | band drawn, active (full strength) | Active, next change Mon 04:00 (1 day later) |
| 4 | Curb colors | band drawn, muted | Not active, next change Mon 16:00 (1 day later) |

#### Mon 02:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Mon 08:00 |
| 2 | Timed parking | band drawn, muted | Not active, next change Mon 08:00 |
| 3 | No stopping/standing | band drawn, active (full strength) | Active, next change Mon 04:00 |
| 4 | Curb colors | band drawn, muted | Not active, next change Mon 16:00 |

#### Mon 08:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, active (full strength) | Active, next change Mon 10:00 |
| 2 | Timed parking | band drawn, active (full strength) | Active, next change Mon 18:00 |
| 3 | No stopping/standing | band drawn, muted | Not active, next change Sun 20:00 (6 days later) |
| 4 | Curb colors | band drawn, muted | Not active, next change Mon 16:00 |

## Case C: Stack with a weeks_of_month [1, 3] row

- segment_id: `burbank-123442566-123442570`
- Street: Lake Street, between West Linden Avenue and West Linden Avenue
- Side: **L**
- Permit zone: DEMO-H
- Drawing: drawn, one band per layer
- Weeks of month is a format test only; Burbank does not use it. The app's reference week is Sun 4 Jan to Sat 10 Jan 2026, so Mon 5 Jan is week 1 and the sweeping row is active at Mon 10:00. Mon 12 Jan (week 2) is skipped, so from Thu 8 Jan the next change is Mon 19 Jan, 11 days later.
- The 30 minute timed parking row tests the fallback style.
- The blue curb row has no schedule and blue has no default, so it is always active.

| # | Map layer | Rule | Schedule |
| --- | --- | --- | --- |
| 1 | Street sweeping | Street sweeping | Mon 09:00–11:00, weeks 1 and 3 of the month |
| 2 | Timed parking | 30 minute limit | Mon–Sat 09:00–18:00 |
| 3 | No stopping/standing | No stopping | Mon–Fri 07:00–09:00 |
| 4 | Curb colors | blue curb (uses the color's default: none (always in force)) | none (always in force) |

#### Mon 10:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, active (full strength) | Active, next change Mon 11:00 |
| 2 | Timed parking | band drawn, active (full strength) | Active, next change Mon 18:00 |
| 3 | No stopping/standing | band drawn, muted | Not active, next change Tue 07:00 (1 day later) |
| 4 | Curb colors | band drawn, active (full strength) | Active, no next change |

#### Mon 07:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Mon 09:00 |
| 2 | Timed parking | band drawn, muted | Not active, next change Mon 09:00 |
| 3 | No stopping/standing | band drawn, active (full strength) | Active, next change Mon 09:00 |
| 4 | Curb colors | band drawn, active (full strength) | Active, no next change |

#### Thu 10:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Street sweeping | band drawn, muted | Not active, next change Mon 09:00 (11 days later) |
| 2 | Timed parking | band drawn, active (full strength) | Active, next change Thu 18:00 |
| 3 | No stopping/standing | band drawn, muted | Not active, next change Fri 07:00 (1 day later) |
| 4 | Curb colors | band drawn, active (full strength) | Active, no next change |

## Case D: Inner-facing side with one rule

- segment_id: `burbank-1897595379-6606789899`
- Street: Empire Avenue, between (none) and Clybourn Avenue
- Side: **R**
- Permit zone: DEMO-A
- Drawing: not drawn at any hour (inner-facing side); its rule still appears in the detail list
- trim.json flags this side as inner-facing, so the map never draws it at any hour. The curb detail list must still list the rule, with its state and next change.
- The other side of this block, and any rule on it, is not part of this case.

| # | Map layer | Rule | Schedule |
| --- | --- | --- | --- |
| 1 | Timed parking | 120 minute limit | Mon–Fri 08:00–18:00 |

#### Wed 10:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Timed parking | not drawn (inner-facing side) | Active, next change Wed 18:00 |

#### Sat 12:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Timed parking | not drawn (inner-facing side) | Not active, next change Mon 08:00 (2 days later) |

#### Fri 18:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Timed parking | not drawn (inner-facing side) | Not active, next change Mon 08:00 (3 days later) |

## Case E: Sliver with one rule

- segment_id: `burbank-13505960224-13505960225`
- Street: South Hollywood Way, between North Hollywood Way / Olive Avenue and Hollywood Way / Olive Avenue
- Side: **R**
- Permit zone: DEMO-F
- Drawing: a sliver (under 20 m), drawn because it has a rule in this layer
- This block is under 20 m (a sliver in trim.json). Slivers are drawn only if they have a rule in the layer, and this is the only row in its layer on the block, so its band must be drawn.
- The other side of this block, and any rule on it, is not part of this case.

| # | Map layer | Rule | Schedule |
| --- | --- | --- | --- |
| 1 | Curb colors | yellow curb | Sat, Sun 09:00–17:00 |

#### Sat 10:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Curb colors | band drawn, active (full strength) | Active, next change Sat 17:00 |

#### Sun 17:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Curb colors | band drawn, muted | Not active, next change Sat 09:00 (6 days later) |

#### Wed 12:00

| # | Map layer | Map shows | Detail list shows |
| --- | --- | --- | --- |
| 1 | Curb colors | band drawn, muted | Not active, next change Sat 09:00 (3 days later) |
