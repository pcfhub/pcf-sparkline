---
title: Model-driven apps
description: Adding Sparkline to a form.
order: 4
---

# Using it on a model-driven form

This is a dataset control, so it goes on a **subgrid**, not on a column.

:::steps
1. Add a subgrid to the form and point it at the view you want to chart. The
   view's filter and its sort are the query — the control does not add to
   either.
2. With the subgrid selected, open **Components → Add component** and choose
   **Sparkline**.
3. Map **Value** to the numeric column and, optionally, **Label** to the column
   that names each point.
4. Set **Chart height** — a model-driven form reports no allocated height, so
   this is the one that decides.
5. Enable it for **Web**, **Phone** and **Tablet** as appropriate, then save and
   publish.
:::

## Column types

| Role | Accepts |
| --- | --- |
| **Value** | Whole number, Decimal, Floating point, Currency |
| **Label** | Single line of text, Date only, Date and time, Whole number, Choice |

**Duration is deliberately not accepted for Value.** Its underlying value is a
number of minutes while the cell shows "2 hours", so a chart drawn from it would
measure something the label does not say.

A record whose Value is empty is skipped and the line is joined across the gap.
A record holding text where a number belongs is skipped too, and counted
separately — both counts are announced in the chart's hidden caption, because a
chart that silently drops records lies by omission.

:::callout{type=info}
**The order is the view's.** The control never sorts in the browser: a
client-side sort would reorder only the records it was handed rather than the
view behind them, so a series that looked sorted would be wrong as soon as the
view held more records than one page. Sort the view.
:::

## The subgrid's own chrome

The command bar, the view selector and quick find are all off. A chart has no
selection for a command bar to act on, and its two roles are mapped to specific
columns, so letting a user switch view would point them at columns that are not
there.
