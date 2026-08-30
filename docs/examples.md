---
title: Examples
description: Worked configurations of Sparkline.
order: 6
---

# Examples

## Revenue by month, on an account form

The goal: twelve months of revenue beside the account's own fields, small enough
that it does not push anything below the fold.

Build a view on the monthly-revenue table filtered to the account and sorted
ascending by period, put it on the form as a subgrid, and configure the
component:

| Setting | Value |
| --- | --- |
| Value | `cr123_revenue` (Currency) |
| Label | `cr123_periodlabel` (Single line of text) |
| Chart type | `line` |
| Chart height | `96` |
| Records to chart | `12` |
| Allow expanding | `true` |

`Records to chart` is set to 12 rather than left at 100 on purpose: the view
returns months in ascending order, so a page of 100 would quietly start
including the previous years as the data grows.

## Variance against a target, as columns

The goal: show which months came in over and which under, where the sign matters
more than the magnitude.

The view carries a calculated column holding `actual - target`, so the values
run either side of zero.

| Setting | Value |
| --- | --- |
| Value | `cr123_variance` (Decimal) |
| Label | `cr123_periodlabel` |
| Chart type | `columns` |
| Chart height | `120` |
| Records to chart | `24` |

`columns` is the right type here for a reason beyond appearance: it is the one
that extends its domain to include zero, so the baseline in the picture is the
real zero and a column below it is a real shortfall. The same data as a `line`
would be scaled to the range of the variances, and the middle of the chart would
be wherever the middle of the data happened to be.

## A tall chart on a canvas screen

The goal: a chart that fills a panel the maker has already sized.

In canvas, drag the component to the size you want and leave **Chart height**
alone — the box wins. Turn **Allow expanding** off, since there is nothing to
expand into on a screen the maker laid out.

```powerfx
// Items
SortByColumns(
    Filter(Readings, DeviceId = ThisItem.DeviceId),
    "cr123_takenon",
    SortOrder.Ascending
)
```

| Setting | Value |
| --- | --- |
| Value | `cr123_reading` |
| Label | `cr123_takenonlabel` |
| Chart type | `area` |
| Allow expanding | `false` |
| Records to chart | `100` |

:::callout{type=info}
Remember to add both columns to the **Fields** flyout on `Items`. A canvas app
hands the control only what is picked there, and a role mapped to a column that
is not in the flyout arrives as nothing.
:::
