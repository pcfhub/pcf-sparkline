---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## The chart is empty and it says "Bind a numeric column to Value"

The Value role is not filled. On a form that means the mapping was not set when
the component was added to the subgrid; in canvas it usually means the column
was mapped but never added to the **Fields** flyout on `Items`, so the app is
handing the control a table that does not include it.

## My records are in the wrong order

Sort the view — or, in canvas, the formula behind `Items`. The control draws the
records in the order it receives them and never reorders them itself; see
[Limitations](limitations.md) for why that is deliberate rather than missing.

## Some records are missing from the chart

Records with no value are skipped and the line is joined across the gap;
records holding text where a number belongs are skipped too. Both counts are in
the chart's hidden caption, which a screen reader announces and which you can
see in the page's accessibility tree. If the second count is not zero, the Value
role is bound to a column that is not really numeric.

## Why did switching to columns change the shape of my chart?

Because it changed the vertical domain. Columns extend the domain to include
zero — a column's length *is* its value, so a non-zero baseline would lie about
the ratios — while line and area scale to the range of the data. Same numbers,
different question being answered. See
[the API reference](api.md#chart-type-and-the-domain-that-comes-with-it).

## Expand does not fill the screen

In canvas apps, and in the demo on this site, there is no `setFullScreen` for
the control to call, so it grows in place instead. On a model-driven form it
asks the platform for the form area and the platform gives it. This is listed
under [Limitations](limitations.md).

## Can I change the colour?

Not directly, and that is deliberate: the series takes `colorBrandForeground1`
from the app's own theme, so it already matches everything else on the page. A
maker-supplied hex would override the customer's brand with something that
matches nothing.

## Does it work on a phone?

Yes. The chart scales to whatever width it is given, and the readout and point
buttons work with touch. The point targets are narrow on a dense series — see
[Limitations](limitations.md).

## Will it ask my administrator for permissions?

No. The manifest declares no `feature-usage`, so importing the solution raises
no consent prompt: the control reaches no Web API, no Utility API and no device.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-sparkline/issues>, with the
platform version and the control version from the solution.
