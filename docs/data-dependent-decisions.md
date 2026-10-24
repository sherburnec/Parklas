# Decisions that need real data

Settings below were chosen from the M1-3 spike or from reasoning, before real Burbank rule data existed. Each one has a starting value that is used until the check in its row is run. Task M6-4 in PLAN.md revisits this file once the pilot data (M6-1) and the accuracy walk (M6-2) are done.

Status values: **Set** (starting value chosen, check still to run), **Open** (no value chosen yet, needs a product call or data), **Confirmed** (checked against real data), **Changed** (checked, value updated; say what and why).

## Inner-facing sides on forks and dual carriageways

Source: [spike-notes.md](spike-notes.md), decision 2. Approach is decided: draw only the outer-facing side where two blocks run close and roughly parallel. Inner sides stay in the click-through list.

| # | Decision | Starting value | Status | How to check with real data |
| --- | --- | --- | --- | --- |
| 1 | Distance threshold D | 10 m | Set | Measure the centerline gap for every dual carriageway and fork pair in the segments file. Confirm each real pair falls under D (the notes say the carriageways are "about 10 m" apart, so some may be over) and that no ordinary parallel streets fall under it. |
| 2 | Angle threshold A (undirected angle between the two blocks, so opposite one-way directions count as parallel) | 25 degrees | Set | List every pair flagged at 25 degrees. Confirm the 15 degree fork is caught and that 90 degree corners, T-junctions and acute side streets are not. Try 20 and 30 and compare the lists. |
| 3 | Minimum overlap length: how long the stretch inside D and A must be before a side is flagged | Open | Open | Every pair of blocks meeting at a node is within D near that node. Pick the length (metres, or share of the block) that keeps ordinary intersections unflagged but still flags the forks. |
| 4 | Where the angle is measured: over the whole block, or only over the stretch inside D | Over the stretch inside D (curved blocks and forks open up along their length) | Set | Check curved blocks in the segments file against a whole-block angle. |
| 5 | Hide the whole side, or only the conflicting stretch | Whole side (one flag per segment and side) | Set | Count how many hidden sides would have drawn correctly along most of their length. If many, consider sub-segment ranges. |
| 6 | Show inner sides again from a high zoom (the notes say slivers read at z18 and above) | Open | Open | Check on the map at z18 and z19 whether the inner bands are readable once the roads are far enough apart. |
| 7 | Map hint that a hidden side exists | Open | Open | Product call. Without one, a viewer cannot tell the inner sides are missing from the map. |
| 8 | Order of rules: sliver skip (decision 4 in the notes) before or after inner-side detection | Sliver flag first; sliver edges are then ignored when finding inner-facing neighbours and trim angles | Set | Slivers join the two carriageways. Run both orders on the downtown area and compare what is hidden. |
| 9 | Fallback when both sides of a block are inner-facing (three or more blocks close together) | Open | Open | Find the blocks where this happens in the real segments file. If there are none, record that and drop the rule. |
| 10 | Alternative rule: flag a side when the trim needed at a node exceeds the trim cap and another block is within D, instead of a fixed angle | Not used | Open | Compare its flagged list with the 25 degree list. Use it if the angle list hides sides on long blocks that would have drawn correctly. |

## Band trim and short blocks

Source: [spike-notes.md](spike-notes.md), values table and decisions 3 and 4.

| # | Decision | Starting value | Status | How to check with real data |
| --- | --- | --- | --- | --- |
| 11 | Trim cap per block end | 35% of the block | Set | Check the shortest real blocks (44 m and under) for a visible stub of band at both ends. |
| 12 | Sliver length below which blocks are skipped in the rules layers (drawn only if a rule row references them; no merging) | About 20 m | Set | Count blocks under 20 m that carry a real rule in the pilot data. Any rule on a sliver must stay visible. If a sliver must be drawn and cannot be, consider merging two collinear blocks. |
| 13 | Band offsets and widths (2, 4, 6 px offsets, 2 px drawn width at z17) | As in the spike | Set | Look at the pilot area on a phone and a desktop. The notes list 5/5/3.5 px as easier to read on desktop. Changing any value means recomputing the trim. |

## Rules for revisiting

- Run each check on the pilot area (M6-1) and on the citywide segments file, not only on the downtown spike area.
- For every row, set the status to Confirmed or Changed and add one line with the evidence (the counts or the blocks you looked at).
- Any value that changes must also be updated in [spike-notes.md](spike-notes.md) and in the build script's tests.
- Add new rows here whenever a decision is made that cannot be checked until real data exists.
