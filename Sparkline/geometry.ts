/*
 * The chart, as arithmetic.
 *
 * Nothing here touches the DOM, reads `context`, or measures anything, and that
 * is the constraint the whole control is built around rather than a tidiness
 * preference. `dev/dom.js` — the only thing that can run the built bundle
 * outside a browser — has no layout: no getBoundingClientRect, no
 * getComputedStyle, and an element from createElementNS with no getBBox and no
 * viewBox.baseVal. A chart that derives its coordinates by measuring cannot be
 * asserted there at all, so its regressions are found by customers instead.
 *
 * So the coordinate space is a constant and CSS does the responsive work: the
 * <svg> is width:100% with a fixed viewBox and preserveAspectRatio="none", and
 * every stroked element carries vector-effect: non-scaling-stroke so the
 * non-uniform scale does not draw a line fat horizontally and thin vertically.
 */

/** The drawing space. 15:4, which is about the proportion a sparkline reads at. */
export const VIEW_WIDTH = 300;
export const VIEW_HEIGHT = 80;

/**
 * Half the widest stroke plus the marker's radius, so a point at either
 * extreme is not clipped by the edge of the viewBox.
 */
export const PAD = 3;

/** One column spanning the whole box reads as a block, not as a column. */
export const MAX_COLUMN_WIDTH = 32;
/** Below this a column disappears; a hairline is better than nothing. */
export const MIN_COLUMN_WIDTH = 0.5;
/**
 * A rect of height 0 draws nothing at all, so a genuine zero would be
 * indistinguishable from a record that had no value. A hairline says
 * "measured, and it was nothing".
 */
export const MIN_COLUMN_HEIGHT = 0.75;

/** The fraction of each slot left empty, so columns are separable. */
export const COLUMN_GAP = 0.25;

export type ChartKind = 'line' | 'area' | 'columns';

export interface Point {
    /** The record id, so a readout can name the row it came from. */
    readonly id: string;
    /** Position in the series *as the view ordered it*, 0-based. */
    readonly index: number;
    /** The parsed y. */
    readonly value: number;
    /**
     * What the platform prints for the y column — currency symbol, grouping and
     * all. Shown, never parsed back into a number.
     */
    readonly valueText: string;
    /** What the platform prints for the x column; '' when no role is bound. */
    readonly categoryText: string;
}

export interface Scale {
    readonly min: number;
    readonly max: number;
    /**
     * Where y = 0 lands, clamped into the band. Columns grow from here and an
     * area fills to here.
     */
    readonly zero: number;
    /** The width of one column's slot, in view units. 0 for line and area. */
    readonly slot: number;
    readonly columnWidth: number;
}

export interface Plotted {
    readonly x: number;
    readonly y: number;
    readonly point: Point;
}

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly negative: boolean;
    readonly point: Point;
}

export interface Geometry {
    readonly kind: ChartKind;
    readonly scale: Scale;
    readonly plotted: readonly Plotted[];
    /** `points` for the <polyline>. '' when there are fewer than two points. */
    readonly line: string;
    /** `d` for the area <path>. '' unless the kind is 'area' with two or more points. */
    readonly area: string;
    /** One per point. Empty unless the kind is 'columns'. */
    readonly columns: readonly Rect[];
    /**
     * A single point is all there is. A one-vertex polyline draws nothing, so
     * the caller draws a dot instead.
     */
    readonly single: boolean;
    /** Every value identical. The caller says so in words. */
    readonly flat: boolean;
}

/**
 * A number, or nothing.
 *
 * Deliberately not a parser. Nothing here strips a currency symbol or
 * un-groups a thousands separator, because both are locale guesses that are
 * wrong somewhere: "1 204" is a French thousand and an English pair of
 * numbers, and a control that guesses draws a wrong chart confidently. The
 * number comes from `record.getValue()`, which on a Currency or Decimal column
 * is already a number; the string branch is for hosts and fixtures that hand
 * over an unconverted value.
 */
export function toNumber(raw: unknown): number | null {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed === '') {
            return null;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

/**
 * Two decimals. Short enough not to bloat the markup at 250 points, and stable
 * enough that dev/smoke.js can assert the attribute string itself.
 */
function round(value: number): number {
    return Math.round(value * 100) / 100;
}

export function scaleFor(values: readonly number[], kind: ChartKind): Scale {
    const sample = values.length > 0 ? values : [0];
    let min = Math.min(...sample);
    let max = Math.max(...sample);

    /*
     * Columns are zero-baselined; line and area are not.
     *
     * These are the two standard arguments and they genuinely point opposite
     * ways. A column encodes magnitude by length, so a column chart on a
     * non-zero baseline lies about ratios. A sparkline encodes *shape*, and
     * zero-baselining a series that runs 101.2 to 101.9 flattens the only thing
     * it had to say. Each chart type gets the domain its own encoding needs,
     * and docs/limitations.md says out loud that switching type therefore
     * changes what the picture means.
     */
    if (kind === 'columns') {
        min = Math.min(min, 0);
        max = Math.max(max, 0);
    }

    if (min === max) {
        /*
         * No range to scale into. Dividing by zero puts every point at NaN, and
         * collapsing to the band's floor reads as "every value is the minimum",
         * which is a claim the data does not make. Padding symmetrically puts
         * the flat line down the exact middle of the band, which is the honest
         * picture of "these are all the same".
         */
        const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.5 : 1;
        min -= pad;
        max += pad;
    }

    const inner = VIEW_WIDTH - 2 * PAD;
    const slot = kind === 'columns' ? inner / Math.max(sample.length, 1) : 0;
    const columnWidth =
        kind === 'columns'
            ? Math.min(Math.max(slot * (1 - COLUMN_GAP), MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
            : 0;

    const project = (value: number): number =>
        VIEW_HEIGHT - PAD - (VIEW_HEIGHT - 2 * PAD) * ((value - min) / (max - min));

    return {
        min,
        max,
        /*
         * Clamped rather than projected. For an all-positive series on a
         * data-range domain, y(0) is far below the box; an area should fill to
         * the band's floor, not to a coordinate off the canvas.
         */
        zero: round(Math.min(Math.max(project(0), PAD), VIEW_HEIGHT - PAD)),
        slot: round(slot),
        columnWidth: round(columnWidth),
    };
}

export function build(points: readonly Point[], kind: ChartKind): Geometry {
    if (points.length === 0) {
        return {
            kind,
            scale: scaleFor([], kind),
            plotted: [],
            line: '',
            area: '',
            columns: [],
            single: false,
            flat: false,
        };
    }

    const values = points.map((point) => point.value);
    const scale = scaleFor(values, kind);
    const inner = VIEW_WIDTH - 2 * PAD;
    const count = points.length;

    const y = (value: number): number =>
        round(
            VIEW_HEIGHT -
                PAD -
                (VIEW_HEIGHT - 2 * PAD) * ((value - scale.min) / (scale.max - scale.min)),
        );

    /*
     * Two x scales, chosen by chart type, and the difference is not cosmetic.
     *
     * A line joins points, so n points need n - 1 gaps and the first and last
     * sit on the edges of the box. A column occupies a band, so n columns need
     * n slots and each sits in the middle of its own. Using the point scale for
     * columns puts half of the first column outside the viewBox.
     */
    const x = (index: number): number => {
        if (kind === 'columns') {
            return round(PAD + scale.slot * index + scale.slot / 2);
        }
        /*
         * One point on a line has nowhere to be but the middle. At the left
         * edge it reads as a rendering fault rather than as a single reading.
         */
        if (count === 1) {
            return VIEW_WIDTH / 2;
        }
        return round(PAD + (inner * index) / (count - 1));
    };

    const plotted: Plotted[] = points.map((point, index) => ({
        x: x(index),
        y: y(point.value),
        point,
    }));

    const single = count === 1;
    const flat = values.every((value) => value === values[0]);

    const line = kind === 'columns' || single ? '' : plotted.map((p) => `${p.x},${p.y}`).join(' ');

    const area =
        kind === 'area' && !single
            ? `M${plotted[0].x},${scale.zero} ` +
              plotted.map((p) => `L${p.x},${p.y}`).join(' ') +
              ` L${plotted[count - 1].x},${scale.zero} Z`
            : '';

    const columns: Rect[] =
        kind === 'columns'
            ? plotted.map((p) => ({
                  x: round(p.x - scale.columnWidth / 2),
                  y: round(Math.min(p.y, scale.zero)),
                  width: scale.columnWidth,
                  height: round(Math.max(Math.abs(p.y - scale.zero), MIN_COLUMN_HEIGHT)),
                  negative: p.point.value < 0,
                  point: p.point,
              }))
            : [];

    return { kind, scale, plotted, line, area, columns, single, flat };
}
