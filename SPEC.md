# Sparkline

A compact trend chart over any Dataverse view.

## What the build disagreed with

**`of-type-group` works on a `<property-set>`.** It is documented, and it was
not obvious that the tooling honoured it inside `<data-set>` rather than only on
a top-level `<property>`. `npm run refreshTypes` accepts both groups
(`sparklineValue`, `sparklineCategory`) and the build validates the manifest.
The fallback — `of-type="Decimal"` and `of-type="SingleLine.Text"`, which would
have cost the ability to bind a `Whole.None` or `Currency` column — was not
needed.

**A `property-set` role does not appear in `IInputs`.** The generated
`ManifestTypes.d.ts` has `chartType`, `chartHeight`, `allowFullScreen`,
`pageSize` and `records`, and nothing for `valueField` or `categoryField`. That
is correct and it is worth knowing before writing code against it: a role is not
a property, it is a *column*, and the only way to reach it is
`dataset.columns.find(c => c.alias === 'valueField')`. Read from the generated
file after `refreshTypes`.

**An SVG `<circle>` is an ellipse under `preserveAspectRatio="none"`.** The
point marker started as a `<circle>` inside the chart and arrived visibly oval
in every box that is not 15:4, because the two axes scale independently.
`vector-effect: non-scaling-stroke` does not help — it fixes stroke width, not
geometry. The marker is now a positioned `<div>` in the hit layer above the
picture, sized in pixels, so it is round whatever the box does. Observed in the
dev harness at several widths.

## Platform behaviour worth knowing

**`mode.setFullScreen` has no getter.** Nothing on `context` reports whether the
control is currently in full screen, so the control has to remember what it
asked for — which is also why the Expand button carries no `aria-pressed`: the
platform's own chrome can leave full screen without the control asking, and a
stuck `aria-pressed="true"` would then be a lie. Read from
`@types/powerapps-component-framework`: `Mode` has `setFullScreen(value)` and no
counterpart. What the platform does provide is the transition, as
`fullscreen_open` and `fullscreen_close` in `updatedProperties`, and since 0.2.0
the control corrects what it remembers from those (see *Demo*).

**Both of the mode APIs this control uses are typed as always present.**
`trackContainerResize` and `setFullScreen` are non-optional in the type
definitions, which is a claim about the definitions and not about the host —
the same claim `paging.loadExactPage` makes and does not keep. Both are
feature-detected. `dev/host.js` grew a `quirks.hasFullScreen` switch so the
absent case is exercised, and `dev/smoke.js` asserts that the control expands in
place there rather than throwing.

**`context.parameters.<input>` is absent in the local rig unless supplied.**
`dev/host.js` builds `parameters` from `records`, `pageSize` and whatever is in
its `inputs` option, so a declared property with a manifest `default-value`
arrives as `undefined` — which the platform never does. Reading
`context.parameters.chartType.raw` therefore throws in `smoke.js` and works on a
form. The fix belongs in the harness, and `dev/smoke.js` now seeds every
`bind()` with the manifest's own defaults; the comment there says they have to
be kept in step with the manifest. This is a candidate for promotion — see
below.

## Sizing

The chart's coordinate space is a constant `viewBox` (300 × 80) stretched by CSS
with `preserveAspectRatio="none"`. Nothing is measured, and that is a testing
constraint before it is an aesthetic one: `dev/dom.js` has no layout at all — no
`getBoundingClientRect`, no `getComputedStyle`, and `createElementNS` returns an
element with no `getBBox` and no `viewBox.baseVal` — so a chart that positioned
itself by measuring could not be asserted outside a browser, and its regressions
would be found by customers. `dev/smoke.js` asserts the exact `points` string,
and asserts it is identical at `allocatedWidth` `-1` and `640`.

Height is the exception, and the reason the control calls
`mode.trackContainerResize(true)` at all: `allocatedHeight > 0` beats the
`chartHeight` property, so a canvas maker who drags the component's box gets the
box they drew. `-1` (no limit) and `0` (not laid out yet) both fall through to
the property. **The claim that a model-driven form reports `-1` here is inherited
from `_template/TEMPLATE.md` and from `pcf-kanban-board`'s measurements, not
observed for this control** — see *Not verified*.

## Demo

`fidelity: "mocked"`: the records are a fixture, and nothing else in the demo
differs from a form.

The control performs no dataset mutation the harness has to answer for: it does
not sort, select, open records or turn pages. It reads `sortedRecordIds`, reads
two columns and draws. Everything a visitor touches — hover, the arrow keys, the
readout, the chart types — behaves in the demo exactly as it does on a form.

**Expand** was the reason it was `limited` until 2026-10-02. The harness's
`setFullScreen` was an empty function, so the button took the fallback it keeps
for a host without the call. The hub now honours it: the demo covers the
browser window, the control is re-rendered with `fullscreen_open` in
`updatedProperties` and a real `allocatedHeight`, and a bar of the hub's own
stands in for the platform's way out.

**A canvas app has `setFullScreen`, and it works.** Seen in a played canvas app
on 2026-10-02, over the Active Contacts view: Expand opened the control in a
panel over the screen, with the platform's own close button above the control's
Collapse. Until then this repository said canvas was the host without the call
— in `docs/canvas.md`, the FAQ, the limitations and `dev/smoke.js` — and
nobody had checked. Microsoft's reference lists it for both hosts.

Running 0.1.0's bundle in the hub's demo showed two things that control did,
and 0.2.0 fixes both. They are what Microsoft's reference says a form would do
to it as well; neither has been seen on one.

- **The Expand button lost the focus when the host re-rendered.** The click
  renders once and puts the focus back on the button; the host's `updateView`
  after `setFullScreen` renders again, and `restoreFocus` was spent on the
  first. `render` now notes which of its own elements has the focus before it
  throws the markup away — the button, or a point — and gives it back, so a
  render the user did not cause no longer takes it. The same loss was there for
  a point being read with the arrow keys when a refresh arrived.
- **Leaving by the host's own way out left `expanded` set.** The button went on
  reading Collapse and the chart kept its expanded height, in place, until the
  button was pressed once for nothing. `updateView` now reads `fullscreen_close`
  and `fullscreen_open` from `updatedProperties`, as Microsoft's canvas dataset
  tutorial does, and corrects `expanded` from them. A host that names neither
  changes nothing.

`dev/host.js` answers `setFullScreen` the same way — the next context names
the transition — and has `closeFullScreen()` for the host leaving by itself.
The five checks that cover this fail against 0.1.0's bundle.

**The readout was cut off in a canvas app's full-screen panel**, which is how
the third fault was found (2026-10-02). Two rules produced it, and neither was
about full screen:

- **The host's height went to the plot, and it is the control's.** With a box
  of 160px, 0.1.0 drew a 160px plot and was 208.8px tall — the title and the
  readout, 48.8px between them, outside the box. Measured in the hub's
  harness. `hostBox` now hands the number over as `--Sparkline-box`, and the
  stylesheet takes `--Sparkline-chrome` out of it: 160px of control, 111.2px of
  plot.
- **Expanded, the plot was `70vh` whatever the host said.** That is a guess at
  the room, measured off the window, and a canvas panel is smaller than the
  window. It now applies only where the host gave no box. A host that gives a
  box and has no `setFullScreen` (none is known) therefore gets an Expand
  that changes nothing: the box is the host's, and the control stays in it.

In the harness, with 482px allocated in full screen, the control is 482px and
the readout ends inside the frame. **On canvas this rests on the panel's height
arriving as `allocatedHeight`**, which Microsoft's tutorial says it does and
nobody has read back — see *Not verified*.

**`pageSize`** was a second reason until 2026-09-27: the harness served every
fixture record on one page, and its `setPageSize` was an empty function.
pcfhub/pcfhub#51 made it applied on the next fetch. It was checked with 0.1.0's
published bundle: at 6 the Columns preset drew six columns, January to June,
labelled "6 points, from $420.00 to $690.00".

Had v0.1 shipped without full screen, `full` would have been defensible, and
that trade was made deliberately in favour of shipping the feature. It is
`mocked` rather than `full` now because the hub's tiers say what is not real,
and the data is not: every other dataset control over a fixture says the same.

## Not verified

Nothing in this repository has been on a real form. Every assertion in
`dev/smoke.js` is against fixtures this repository wrote, and `npm run harness`
is a page that draws the control, not a Power App.

- **That a model-driven form reports `allocatedHeight` as `-1`, and that canvas
  reports a positive number.** The whole height rule rests on this. Proving it:
  put the control on a form and on a canvas screen, and read the value back —
  the dev harness's own **Allocated height** box exercises both branches but
  supplies the number itself.
- **That `mode.setFullScreen(true)` gives this control the form area, and that
  the height then fills it.** Seen on canvas, where it opens a panel (see
  *Demo*); not on a model-driven form. Not read back on canvas either: what
  `updatedProperties` and `allocatedHeight` carry in the panel. Both fixes for
  the panel rest on those — the control leaves full screen when the platform's
  button names `fullscreen_close`, and it fits the panel when `allocatedHeight`
  is the panel's. If the chart stays small inside the panel, the second is not
  what canvas does.
- **That `getValue()` on a Currency column returns a number rather than a
  string.** `toNumber` handles both, so this is not a risk to correctness — but
  which one arrives decides whether the string branch is dead code.
- **That a real view's `property-set` column arrives with `alias` equal to the
  role name and `name` equal to the schema name.** The fixtures are built on
  that reading of the reference, and it is the one thing that, if backwards,
  makes the control render nothing everywhere while passing every test here.
- **That the palette clears contrast on a real form in both themes**, and that
  the forced-colours fallbacks are legible in Windows high contrast. Checked in
  a browser at the fallback colours only; the Fluent tokens a real form
  publishes were never involved.
- **`media/screenshot.png` does not exist yet**, so `docs/` references no
  images and `pcfhub.json` lists no screenshots. Both want a capture from a real
  form before release.

## Promoting a finding

Three things here look general rather than true only of this control, and belong
in the skill's `references/control-patterns.md` rather than being rediscovered:

- **The rule that `allocatedHeight`/`allocatedWidth` beats a size property, and
  that `-1` and `0` are both "no answer".** `pcf-kanban-board` has the width
  half; this is the height half, and together they are a rule rather than two
  anecdotes.
- **"Never measure the DOM, or the control cannot be smoke-tested."** This is
  the first control in the catalogue whose visual output is geometry, and the
  constraint generalises to anything that positions its own elements.
- **The harness must seed a control's declared inputs with the manifest
  defaults.** `dev/host.js`'s empty `inputs` bag is a shape the platform never
  produces, and every future control with input properties will hit it. The
  `quirks.hasFullScreen` switch and the per-record `formatted` bag added to
  `dev/host.js` are already promoted: both landed in
  `_template/variants/dataset/dev/host.js` in the same change.
