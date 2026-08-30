---
title: Overview
description: What Sparkline does, and when to reach for it.
order: 1
---

# Sparkline

A compact trend chart over any Dataverse view.

Bind a numeric column to **Value**, optionally a column to **Label**, and the
records the view returns become one series — a line, an area or columns — sized
to sit in a form section beside the values it summarises.

::image{src=media/screenshot.png alt="Sparkline showing twelve months of revenue as a line, with the January reading read out below it" zoom}

## Why this one

- **It is the size of a field, not the size of a dashboard.** A Power Apps chart
  lives on a dashboard or takes a subgrid's worth of space, brings its own
  chrome, and is configured in a separate designer. This is a component you drop
  into a section that is already there.
- **The view is the query.** There is no chart definition to maintain in
  parallel: whatever the view returns, in the order it returns it, is what gets
  drawn. Change the view's filter or its sort and the picture follows.
- **It can be read without being looked at.** Every point is a named, focusable
  stop; one arrow key moves between them and a live region announces the value.
  The whole series is also written out in a hidden caption, including the count
  of any records that were skipped.
- **It asks for no permissions.** The manifest declares no `feature-usage`, so
  installing it produces no consent prompt: the control reaches no Web API, no
  Utility API and no device.

## What it works with

:::callout{type=info}
**Model-driven forms** and **canvas apps** (including custom pages) are both
supported, and the differences are small but real. On a form, the control sizes
itself with the **Chart height** property, because a model-driven form reports
no allocated height. In canvas, the box you drag wins and the property is
ignored. Also in canvas, the columns come from the **Fields** flyout on `Items`
rather than from a view — pick the two the control needs, or it will say so
rather than draw an empty box.
:::

The series is drawn from one page of records — 100 by default, and the platform
will not serve more than 250 in one page. See [Limitations](limitations.md).
