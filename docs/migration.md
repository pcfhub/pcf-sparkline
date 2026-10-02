---
title: Migrating to 0.2.0
description: What an upgrade from 0.1.0 changes on its own, and what to do about it.
appliesTo: ">=0.2.0"
order: 9
---

# Migrating to 0.2.0

Nothing was renamed or retyped, and every property you set still means what it
meant. One default changed, and one sizing rule, and both act without being
asked.

## What changed on its own

**Records to chart no longer defaults to 100.** In 0.1.0 a chart whose
**Records to chart** nobody had touched still asked the view for 100 records,
and so replaced the page size the host had already chosen. In 0.2.0, left
unset, the control asks for nothing and draws the page the host is fetching: a
subgrid's own records-per-page setting, a main grid's *Rows per page*, the
canvas default. On a subgrid set to four records, an unconfigured chart goes
from up to 100 points to four.

A chart whose **Records to chart** was set to a number is unchanged.

**The box a host allocates now holds the whole control.** Where the host
reports a height — a canvas app, and any host in full screen — 0.1.0 gave all
of it to the chart, so the title and the readout were drawn outside the box and
the readout could be cut off. 0.2.0 fits the title, the chart and the readout
inside it. In a canvas app the chart is therefore about 49 pixels shorter than
it was in the same box, and the readout that was hidden under it is visible. A
model-driven form, where **Chart height** decides, is unchanged.

## What to do

:::steps
1. **Decide how many records each chart should draw.** For every chart that
   relied on the old default, set **Records to chart** to `100` to get 0.1.0's
   series back, or to the number the chart is actually for. The limit is still
   250.
2. **In canvas, look at charts sized tightly.** If a chart now looks short, make
   its box about 49 pixels taller. Nothing else about the box changed.
:::

Expanding is also fixed in this release, with nothing to do: the control
follows the host out of full screen when the host's own close button is used,
and the Expand button keeps the keyboard focus.
