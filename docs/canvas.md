---
title: Canvas apps
description: Adding Sparkline to a canvas app or custom page.
order: 3
---

# Using it in a canvas app

:::steps
1. From **Insert → Get more components**, open the **Code** tab and import
   **Sparkline**.
2. Place it from **Insert → Code components**.
3. Set `Items` to the table you want to chart.
4. Open the **Fields** flyout on `Items` and add the two columns the control
   reads — the numeric one and, if you want labels, the one that names each
   point.
5. Map them to **Value** and **Label**.
:::

## Wiring it up

```powerfx
// Items — sort in the formula, because the control never reorders records.
SortByColumns(
    Filter(MonthlyRevenue, Year = 2025),
    "cr123_period",
    SortOrder.Ascending
)
```

| Property | Value |
| --- | --- |
| Value | the numeric column, e.g. `cr123_revenue` |
| Label | the naming column, e.g. `cr123_periodlabel` |
| Chart type | `line`, `area` or `columns` |
| Records to chart | `100` |
| Allow expanding | `true` |

:::callout{type=warning}
**The columns have to be added to the Fields flyout, not only mapped.** A canvas
app hands the control only the columns picked there, so a role mapped to a
column that is not in the flyout arrives as nothing at all. When the Value role
is unfilled the control says so in words rather than drawing an empty box — if
you see *"Bind a numeric column to Value to draw a chart"*, that is this.
:::

## Sizing

Canvas is the host that reports an allocated height, so **the box you drag wins
and the Chart height property is ignored.** Resize the component and the chart
follows. On a model-driven form it is the other way round — see
[Model-driven apps](model-driven.md).

## Expanding

**Expand** grows the chart in place in canvas rather than taking over the
screen: `setFullScreen` is a model-driven behaviour, and the control does not
pretend to have it. Set **Allow expanding** to `false` to hide the button in a
layout that is already the size it wants to be.

## Reading the output

There is none. The control reads a table and draws it; it writes nothing back
and raises no event, so there is no `OnChange` to handle.
