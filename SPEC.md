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
platform's own chrome can leave full screen without telling the control, and a
stuck `aria-pressed="true"` would then be a lie. Read from
`@types/powerapps-component-framework`: `Mode` has `setFullScreen(value)` and no
counterpart.

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

`fidelity: "limited"`, and it is closer to `full` than any other dataset control
in the catalogue, which is the part worth recording.

The control performs no dataset mutation the harness has to answer for: it does
not sort, select, open records or turn pages. It reads `sortedRecordIds`, reads
two columns and draws. Everything a visitor touches — hover, the arrow keys, the
readout, the chart types — behaves in the demo exactly as it does on a form.

Two things do not, and both are in `demo.limitations`:

1. **Expand** cannot take over the page, because `setFullScreen` is a platform
   call and the harness is not the platform. The button falls back to growing
   the chart in place — genuinely the same fallback it takes on any host without
   that API, which is why the demo is still honest, but it is not what
   production does.
2. **`pageSize`** is inert: the harness serves every fixture record on one page
   and its `setPageSize` is an empty function.

Had v0.1 shipped without full screen, `full` would have been defensible, and
that trade was made deliberately in favour of shipping the feature.

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
  the height then fills it.** The fallback path is exercised locally; the
  platform path is not.
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
