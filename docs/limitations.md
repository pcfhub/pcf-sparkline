---
title: Limitations
description: What Sparkline does not do.
order: 7
---

# Limitations

Each of these is a constraint that was chosen, not a defect waiting on a fix.

- **One series.** There is one Value role and one Label role, and a
  `property-set` is a fixed-arity declaration — there is no way to say "however
  many numeric columns the view has". Two lines on one chart is a different
  control.

- **It never sorts, and never filters.** The order and the contents are the
  view's. A client-side sort would reorder only the records this control was
  handed and not the view behind them, so a series that looked sorted would be
  wrong the moment the view held more records than one page.

- **250 records, and 100 by default.** `pageSize` is what the series is drawn
  from; the platform will not serve more than 250 in a page, and the control
  never turns a page to accumulate more. Past a few hundred points a sparkline
  is drawing a texture rather than a trend anyway — aggregate in the view.

- **Nothing is aggregated.** One record is one point. Charting a year of
  transactions gives a point per transaction, not a point per month; build the
  monthly view and chart that.

- **Switching chart type changes the domain**, and therefore what the picture
  means — columns start at zero, line and area do not. See
  [the API reference](api.md#chart-type-and-the-domain-that-comes-with-it) for
  why. It is stated here because it surprises people.

- **Expand grows the chart; it does not cover the page.** Where the platform
  offers `setFullScreen` the control asks for it and the host gives it the form
  area. Everywhere else — canvas, and the demo on this site — the chart grows in
  place instead. A code component that pins itself over the form with
  `position: fixed` escapes the form's stacking context, covers the command bar,
  and takes ownership of an Esc key it cannot promise to receive. Growing in
  place is a smaller promise and one the control can keep.

- **The chart is not mirrored in right-to-left locales.** The chrome flips — the
  title, the Expand button — but the series still runs left to right, in the
  order the view returned it. Mirroring the plot would put the first record on
  the right, and nothing about a Dataverse view says that is the reading order
  its author intended.

- **The point targets are narrow.** Each reading has an invisible hit area as
  wide as the spacing allows, which for a hundred points in a 300-unit box is
  well under the 24 px a pointer target should be. That is the trade a dense
  chart makes; the keyboard path is the one that scales, which is why the chart
  is a single tab stop with arrow keys through the series rather than a hundred
  tab stops, and why every point carries its own name for a screen reader.

- **Under forced colours the fill is gone.** Windows high-contrast overrides
  `fill` and `stroke`, so the area is drawn as a dashed outline and the columns
  as outlined boxes rather than as solid ones — a chart whose only remaining
  signal is "there is a rectangle here" would be worse than one that admits it.
  The line survives unchanged, because a stroke is still a shape.
