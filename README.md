# Sparkline

A compact trend chart over any Dataverse view.

[![Build](https://github.com/pcfhub/pcf-sparkline/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-sparkline/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-sparkline/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-sparkline/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-sparkline), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.


## What it does

A Dataverse view is a table of readings; this draws it as one line, and puts
it inside a form section rather than on a dashboard. Bind a numeric column to
**Value**, optionally a column to **Label**, and the records the view returns
become a series — line, area or columns — with a readout under it and a
keyboard path through every point.

The built-in alternative is a chart, and a chart is a different thing: it lives
on a dashboard or takes a subgrid's worth of space, it comes with its own
chrome, and configuring one is a separate designer. This is a component the size
of a field, meant to sit beside the values it summarises.

Three decisions are worth knowing before you file an issue about them.

**It never sorts.** The series is drawn in the order the view hands it over, and
a client-side sort would reorder only the records this control was given rather
than the view behind them — so the second page of a "sorted" series would be
wrong in a way nobody could see. Sort the view.

**Line and area scale to the range of the data; columns start at zero.** That is
not an inconsistency. A column encodes magnitude by its length, so a column
chart on a non-zero baseline lies about the ratios between its bars. A sparkline
encodes *shape*, and zero-baselining a series that runs from 101.2 to 101.9
flattens the only thing it had to say. Switching chart type therefore changes
what the picture means, which is why the two live behind one property and not
behind a hidden setting.

**Expand grows the chart; it does not cover the page.** Where the platform
offers `setFullScreen` the control asks for it and the host gives it the form
area. Where it does not — canvas, and the hub's demo — the chart grows in place
instead. A code component that pins itself over the form with `position: fixed`
escapes the form's stacking context, covers the command bar, and takes ownership
of an Esc key it cannot promise to receive.

Records with no value are skipped and the gap is bridged; records holding text
where a number belongs are skipped too, and counted separately, because one is
missing data and the other is a column bound to the wrong thing. Both counts are
stated in a visually hidden caption rather than swallowed.

## Properties

The two columns the control reads are `property-set` roles on the dataset. A
role is *found* on the column by its manifest name and the values are *read* by
the schema name of whatever the maker mapped to it.

| Role | Manifest name | Type | Required | What it is |
| --- | --- | --- | --- | --- |
| Value | `valueField` | `Whole.None`, `Decimal`, `FP`, `Currency` | **yes** | The series. One point per record. |
| Label | `categoryField` | text, date, `Whole.None` or choice | no | Names each point. Without it, points are numbered. |

| Property | Type | Default | What it controls |
| --- | --- | --- | --- |
| `chartType` | Enum: `line` \| `area` \| `columns` | `line` | How the series is drawn, and which domain it gets |
| `chartHeight` | Whole.None | `96` | Height in pixels, **used only where the host reports none** |
| `allowFullScreen` | TwoOptions | `true` | Whether the Expand button is shown |
| `pageSize` | Whole.None | `100` | How many records the series is drawn from; clamped to 250 |

No outputs. The control reads a view and draws it, and nothing it does is worth
reporting back to a form or a canvas app.

`chartHeight` is a fallback rather than a setting. The control calls
`mode.trackContainerResize(true)`, so a host that reports an allocated height —
canvas, where the maker drags the control's box — wins, and this is what a
model-driven form gets, since it reports `-1` forever.

**No `<feature-usage>`, so the maker is asked for no permissions at install.**
`setFullScreen` and `trackContainerResize` are members of `context.mode`, which
is not gated, and nothing here reaches the Web API, the Utility API or a device.

Strings ship in five languages — 1033 English, 3082 Spanish, 1036 French, 1031
German, 1041 Japanese. The control bundles no framework: it is a `standard`
control writing DOM and inline SVG, and it reads Fluent's design tokens through
`var()` because the form already mounts a `FluentProvider` above it.

## On the hub

`demo.fidelity` is **`limited`**, and it is closer to `full` than any other
dataset control in the catalogue — which is worth saying, because the two things
that hold it back are both small and both named in `demo.limitations`.

Everything a visitor touches is real. The control performs no dataset mutation
the harness has to answer for: it does not sort, does not select, does not open
records and does not turn pages. It reads `sortedRecordIds`, reads two columns,
and draws. Hover, the arrow keys, the readout and the chart types behave in the
demo exactly as they do on a form.

Two things do not. **Expand** cannot take over the page, because
`context.mode.setFullScreen` is a platform call and the harness is not the
platform — so the button falls back to growing the chart in place, which is what
it does on any host without that API. And **Records to chart** is inert, because
the harness serves every fixture record on one page and its `setPageSize` does
nothing. A demo where an advertised feature behaves differently from production
is exactly the situation `limited` exists to describe.

Four presets: **Line**, **Area** and **Columns** over the same twelve months, so
the domain difference between them is visible rather than described; and
**Tall, no expanding**, which is the only one that shows the control with no
Expand button — and the only one whose `TwoOptions` value is the one that goes
wrong, since a manifest `default-value="false"` reaches a harness as the string
`"false"`, and `Boolean("false")` is `true`.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-sparkline/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control has no harness page, and the script says
so rather than serving a 404.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `Sparkline/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `Sparkline/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
