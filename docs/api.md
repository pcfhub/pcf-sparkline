---
title: API reference
description: Properties and dataset roles, generated from the control manifest.
order: 5
---

# API reference

## Input properties

::props-table{kind=input}

## Dataset

::props-table{kind=dataset}

## Dataset columns

::props-table{kind=dataset_column}

**Value is required and Label is not.** A series indexed by position — twelve
readings with no names — is a real configuration, and requiring a label column
would refuse it. With no Label bound, each point is announced as
*"Point 3 of 12"* instead.

## Outputs

There are none. The control reads a view and draws it, and nothing it does is
worth reporting back to a form or a canvas app, so there is no output property
to bind and no `OnChange` to handle.

## Chart type, and the domain that comes with it

`chartType` decides more than the shape.

| Value | Drawn as | Vertical domain |
| --- | --- | --- |
| `line` | A stroked polyline | The range of the data |
| `area` | The same line, filled to the baseline | The range of the data |
| `columns` | One column per record | **Extended to include zero** |

That difference is deliberate. A column encodes magnitude by its length, so a
column chart on a non-zero baseline lies about the ratios between its bars. A
sparkline encodes *shape*, and zero-baselining a series running from 101.2 to
101.9 flattens the only thing it had to say. Switching chart type therefore
changes what the picture means.

Two consequences worth knowing: a series whose values are all identical is drawn
down the middle of the band rather than along its floor, because "every reading
is the minimum" is a claim the data does not make; and a genuine zero in a
column chart is drawn as a hairline rather than as nothing, so that it can be
told apart from a record with no value at all.

## Height

`chartHeight` is a fallback, not a setting. The control calls
`mode.trackContainerResize(true)`, so any host that reports an allocated height
wins — that is canvas, where the maker drags the component's box. A model-driven
form reports `-1` forever, and there `chartHeight` is what decides.
