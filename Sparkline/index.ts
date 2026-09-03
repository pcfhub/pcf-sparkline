import { IInputs, IOutputs } from './generated/ManifestTypes';
import {
    ChartKind,
    Geometry,
    Point,
    VIEW_HEIGHT,
    VIEW_WIDTH,
    build,
    toNumber,
} from './geometry';

type DataSet = ComponentFramework.PropertyTypes.DataSet;
type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The platform's ceiling on a page. Not in the type definitions. */
const MAX_PAGE_SIZE = 250;

/** The property-set role names, as written in the manifest. */
const ROLE_VALUE = 'valueField';
const ROLE_CATEGORY = 'categoryField';

/** The height used where the host reports none and the maker set none. */
const FALLBACK_HEIGHT = 96;

/**
 * A sparkline over a view.
 *
 * Three commitments shape this file, and each one is a decision rather than a
 * habit.
 *
 * **The geometry is arithmetic, never a measurement.** Everything about where a
 * point sits lives in `geometry.ts`, which cannot see the DOM. The `<svg>` has a
 * constant `viewBox` and `width: 100%`, so the browser does the responsive work.
 * The reason is testability: `dev/dom.js` has no layout at all — no
 * `getBoundingClientRect`, no `getComputedStyle`, and an element from
 * `createElementNS` with no `getBBox` — so a chart that positions by measuring
 * cannot be asserted outside a browser, and its regressions reach customers.
 *
 * **A dataset has mutators, and `updateView` runs on every change including the
 * ones this control caused.** `setPageSize()` does nothing until the next fetch,
 * so it has to be followed by `refresh()` — and `refresh()` fires `updateView`.
 * `applyPageSize` is guarded on what *this control* asked for, never on
 * `paging.pageSize`, which will not equal the request until the refresh lands.
 * It is the only mutator here: this control never pages, never sorts, never
 * selects and never opens a record.
 *
 * **A render destroys whatever the user was focused on.** That is fine for the
 * chart, which changes wholesale, and wrong for the two persistent controls: the
 * expand button pays for it with `restoreFocus`, and the arrow-key path avoids
 * it entirely by mutating three attributes rather than re-rendering.
 */
export class Sparkline implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;

    /**
     * Kept so `destroy()` can hand back a full screen it is still holding.
     * Nothing else reads it outside a render.
     */
    private context: ComponentFramework.Context<IInputs> | null = null;

    /**
     * The page size this control has already asked the platform for.
     *
     * Guarding on this rather than on `ds.paging.pageSize` is the whole trick:
     * the platform's own value will not equal the requested one until the
     * refresh lands, so comparing against it re-fires at least once more — and
     * if the platform clamps the request, it never converges at all.
     */
    private appliedPageSize = 0;

    /**
     * Full screen is a mode with no getter. Nothing on `context` reports
     * whether the control is in it, so the control remembers what it asked for.
     */
    private expanded = false;

    /** Which point the keyboard is on. Clamped against the series each render. */
    private active = 0;

    /* Rebuilt by every render; the arrow-key path mutates these in place. */
    private hits: HTMLElement[] = [];
    private readout: HTMLElement | null = null;
    private marker: HTMLElement | null = null;
    private geometry: Geometry | null = null;

    /** The expand button is destroyed by the render its own click caused. */
    private restoreFocus = false;

    public init(
        context: ComponentFramework.Context<IInputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.container.classList.add('Sparkline');

        /*
         * Ask to be told how much room we were given.
         *
         * Without this call `allocatedHeight` is not populated at all. With it,
         * a canvas maker who drags the control's box gets a chart that fills the
         * box they drew, and the `chartHeight` property becomes what it says it
         * is: a fallback for the hosts that report nothing. A model-driven form
         * reports -1 forever, which is why the property still has to exist.
         *
         * Width is deliberately not read: the viewBox does that job, and a
         * pixel width would only be a second source of truth for it.
         *
         * Feature-detected because it is typed as always present, which is a
         * claim about the type definitions rather than about the host.
         */
        if (typeof context.mode.trackContainerResize === 'function') {
            context.mode.trackContainerResize(true);
        }
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;

        this.applyTheme(context);
        this.applyPageSize(context, context.parameters.records);
        this.render(context);
    }

    /**
     * No outputs. This control reads a view and draws it; nothing it does is
     * worth reporting back to a form or a canvas app.
     */
    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        /*
         * Hand the screen back. The platform gave this control the whole form
         * area and has no reason to take it back on its own — a control that
         * disappears while holding it leaves the form with nothing on it.
         */
        if (this.expanded && this.context && typeof this.context.mode.setFullScreen === 'function') {
            this.context.mode.setFullScreen(false);
        }

        this.expanded = false;
        this.hits = [];
        this.readout = null;
        this.marker = null;
        this.geometry = null;
        this.context = null;

        /*
         * No timer was ever taken and no listener was ever put on `document` —
         * every one is on an element inside `container`, which the platform
         * removes. The container itself is reused, so it still has to be
         * cleared.
         */
        this.container.innerHTML = '';
    }

    /**
     * Picks which set of colour fallbacks the stylesheet uses.
     *
     * Only the fallbacks. The stylesheet reads Fluent's design tokens through
     * `var()`, and a model-driven form already mounts a `FluentProvider` above
     * every code component on the page — so where the host publishes them this
     * changes nothing, which is what stops the control fighting a host that
     * knows its own theme better than this code does. It matters on the hosts
     * that publish nothing: a canvas app, or PCFHub's demo harness.
     *
     * `@media (prefers-color-scheme: dark)` is the obvious hook and it is the
     * wrong question: a model-driven app carries its own theme and the user's OS
     * setting says nothing about it. Absent means absent — no class, light
     * fallbacks, the same guess the host made by not saying.
     */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('Sparkline--dark', isDarkTheme);
    }

    /** Ask for a page size, but only when it actually changed. */
    private applyPageSize(context: ComponentFramework.Context<IInputs>, dataset: DataSet): void {
        const raw = context.parameters.pageSize.raw;

        /*
         * **The platform already has a page size, and it is usually the right
         * one.** `paging.pageSize` is the size the host is actually retrieving
         * with — a main grid's *Rows per page* personalisation, a subgrid's
         * form-designer setting, the canvas default.
         *
         * So the property carries no `default-value`, and this is the half of
         * that decision written in code: unset, adopt what the host is doing and
         * **never call `setPageSize` at all**; set, override. Adopting still
         * records the number, because the page slice and the pager label both
         * need to know how big a page is — reading it is not the same as asking
         * for it. See the manifest for why the default was removed.
         */
        if (raw === null || raw === undefined) {
            // `0` is "the host did not say", not "one row per page". A fallback
            // of `1` is a page size the platform never has, and the slice would
            // cut the view down to it — twenty rows arriving and one drawn.
            this.appliedPageSize = dataset.paging.pageSize > 0 ? dataset.paging.pageSize : 0;

            return;
        }

        const wanted = Math.min(Math.max(Math.trunc(raw), 1), MAX_PAGE_SIZE);

        if (wanted === this.appliedPageSize) {
            return;
        }

        this.appliedPageSize = wanted;
        dataset.paging.setPageSize(wanted);
        dataset.refresh();
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        const getString = (id: string): string => context.resources.getString(id);
        const dataset = context.parameters.records;

        this.container.innerHTML = '';
        this.hits = [];
        this.readout = null;
        this.marker = null;

        // Canvas relies on this; a model-driven form hides the section itself.
        if (!context.mode.isVisible) {
            return;
        }

        if (dataset.error) {
            this.message(dataset.errorMessage || getString('Sparkline_Error'));
            return;
        }

        const value = this.roleColumn(dataset, ROLE_VALUE);

        /*
         * A canvas app supplies only the columns picked in the Items Fields
         * flyout, so "the role is not filled" is a state a maker can author
         * rather than an impossible one — and an empty box reads as a broken
         * control rather than as a configuration that is not finished.
         */
        if (!value) {
            this.message(getString('Sparkline_NoValueColumn'));
            return;
        }

        const category = this.roleColumn(dataset, ROLE_CATEGORY);
        const series = this.points(dataset, value, category);

        if (series.points.length === 0) {
            /*
             * `loading` is true on the first updateView, before any record has
             * arrived, so saying "no records" here would flash on every load.
             */
            this.message(
                dataset.loading
                    ? getString('Sparkline_Loading')
                    : series.unreadable > 0
                      ? getString('Sparkline_NoNumbers')
                      : getString('Sparkline_Empty'),
            );
            return;
        }

        const kind = this.chartKind(context);
        this.geometry = build(series.points, kind);
        this.active = Math.min(this.active, series.points.length - 1);

        this.container.classList.toggle('Sparkline--fullscreen', this.expanded);
        this.container.classList.toggle('Sparkline--line', kind === 'line');
        this.container.classList.toggle('Sparkline--area', kind === 'area');
        this.container.classList.toggle('Sparkline--columns', kind === 'columns');

        this.container.appendChild(this.head(context, getString));
        this.container.appendChild(this.plot(context, value, getString));
        this.container.appendChild(this.readoutRow(getString));
        this.container.appendChild(this.caption(series, getString));

        if (this.restoreFocus) {
            this.restoreFocus = false;
            const button = this.container.querySelector('.Sparkline-expand');
            if (button) {
                (button as HTMLElement).focus();
            }
        }
    }

    /**
     * Find a bound column by its role.
     *
     * **By `alias`, and read by `name`.** `alias` is the property-set name from
     * the manifest; `name` is the schema name of whichever real column the maker
     * mapped to it. Backwards, `find` never matches, the control renders nothing
     * against a real view, and nothing errors — which is how this reached
     * production in pcf-tag-list. The fixtures here set the two to different
     * strings so a mistake fails where it can be seen.
     *
     * `columns` is typed as required and `npm start` supplies `undefined`, the
     * same claim-about-the-types that `dataset.sorting` breaks.
     */
    private roleColumn(dataset: DataSet, alias: string): Column | undefined {
        return (dataset.columns ?? []).find((column) => column.alias === alias);
    }

    /**
     * The series, in the order the view handed it over.
     *
     * Nothing here sorts. A client-side sort would reorder the records this
     * control happens to hold and not the view behind them, so the second page
     * of a sorted series would be wrong in a way nobody could see.
     */
    private points(
        dataset: DataSet,
        value: Column,
        category: Column | undefined,
    ): { points: Point[]; blank: number; unreadable: number } {
        const points: Point[] = [];
        let blank = 0;
        let unreadable = 0;

        (dataset.sortedRecordIds ?? []).forEach((id, index) => {
            const record = dataset.records[id];
            if (!record) {
                return;
            }

            /*
             * The number comes from `getValue`, the readout from
             * `getFormattedValue`, and never the other way round. A formatted
             * value carries a currency symbol and a grouping separator that
             * would have to be un-guessed per locale to get a number back; a
             * raw value carries no symbol at all and would read wrong.
             */
            const raw = record.getValue(value.name);
            const parsed = toNumber(raw);
            const text = record.getFormattedValue(value.name);

            if (parsed === null) {
                /*
                 * Blank and unreadable are different findings. One is data the
                 * maker does not have; the other is a column bound to the wrong
                 * thing, and only the second is worth anybody's attention.
                 */
                if (raw === null || raw === undefined || String(raw).trim() === '') {
                    blank += 1;
                } else {
                    unreadable += 1;
                }
                return;
            }

            points.push({
                id,
                index,
                value: parsed,
                // A host that formats nothing hands back ''. Falling back to the
                // number keeps the readout from announcing an empty string.
                valueText: text === '' || text === null ? String(parsed) : text,
                categoryText: category ? (record.getFormattedValue(category.name) ?? '') : '',
            });
        });

        return { points, blank, unreadable };
    }

    private chartKind(context: ComponentFramework.Context<IInputs>): ChartKind {
        const raw = context.parameters.chartType.raw;
        return raw === 'area' || raw === 'columns' ? raw : 'line';
    }

    /**
     * The height the plot gets, in pixels.
     *
     * The host wins where it reports one. `-1` means "no limit" and `0` means
     * "not laid out yet"; neither is a height, so both fall through to the
     * maker's property, and that in turn falls through to a constant.
     */
    private height(context: ComponentFramework.Context<IInputs>): number {
        const allocated = context.mode.allocatedHeight;
        if (typeof allocated === 'number' && allocated > 0) {
            return allocated;
        }

        const raw = context.parameters.chartHeight.raw;
        return typeof raw === 'number' && raw > 0 ? Math.trunc(raw) : FALLBACK_HEIGHT;
    }

    private message(text: string): void {
        const p = document.createElement('p');
        p.className = 'Sparkline-message';
        p.textContent = text;
        this.container.appendChild(p);
    }

    private head(
        context: ComponentFramework.Context<IInputs>,
        getString: (id: string) => string,
    ): HTMLElement {
        const head = document.createElement('div');
        head.className = 'Sparkline-head';

        const title = document.createElement('span');
        title.className = 'Sparkline-title';
        title.textContent = context.parameters.records.getTitle();
        head.appendChild(title);

        if (asBoolean(context.parameters.allowFullScreen.raw, true)) {
            head.appendChild(this.expandButton(context, getString));
        }

        return head;
    }

    private expandButton(
        context: ComponentFramework.Context<IInputs>,
        getString: (id: string) => string,
    ): HTMLElement {
        const button = document.createElement('button');
        button.className = 'Sparkline-expand';
        button.type = 'button';

        /*
         * No `aria-pressed`. The platform's own chrome can leave full screen
         * without telling the control, and a stuck `aria-pressed="true"` would
         * then lie about a state this code cannot read back. The label is the
         * state, and focus returns to the button, so the change is announced.
         */
        const label = getString(this.expanded ? 'Sparkline_Collapse' : 'Sparkline_Expand');
        button.setAttribute('aria-label', label);
        button.title = label;

        button.appendChild(expandGlyph(this.expanded));
        button.addEventListener('click', () => this.toggleExpand(context));

        return button;
    }

    private toggleExpand(context: ComponentFramework.Context<IInputs>): void {
        this.expanded = !this.expanded;
        this.restoreFocus = true;

        /*
         * Typed as always present, which is a claim about the type definitions
         * and not about the host — the same claim `paging.loadExactPage` makes
         * and does not keep.
         */
        if (typeof context.mode.setFullScreen === 'function') {
            context.mode.setFullScreen(this.expanded);
        }

        /*
         * Rendered here either way, and not branching is the point.
         *
         * Where `setFullScreen` exists the platform re-lays-out and calls
         * `updateView` — but nothing promises when, and until it does the button
         * under the user's finger still carries the old label. Where it does not
         * exist, nothing is going to call `updateView` at all. One synchronous
         * render covers both, and a second one from the platform is idempotent.
         */
        this.render(context);
    }

    private plot(
        context: ComponentFramework.Context<IInputs>,
        value: Column,
        getString: (id: string) => string,
    ): HTMLElement {
        const geometry = this.geometry as Geometry;

        const plot = document.createElement('div');
        plot.className = 'Sparkline-plot';
        /*
         * The one number the host gets a say in, and it is set as a custom
         * property rather than a height so the stylesheet keeps ownership of
         * what happens to it when the chart is expanded.
         */
        plot.setAttribute('style', `--Sparkline-height: ${this.height(context)}px`);

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'Sparkline-svg');
        svg.setAttribute('viewBox', `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
        /*
         * The chart stretches to whatever box it is given. That is what makes
         * the viewBox constant possible, and it is why every stroked element
         * carries `vector-effect: non-scaling-stroke` in the stylesheet: without
         * it a wide short box draws a line fat on one axis and thin on the other.
         */
        svg.setAttribute('preserveAspectRatio', 'none');
        /*
         * One image with one name, rather than a tree of anonymous shapes. The
         * points are reachable as buttons below; the picture itself is a picture.
         */
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', this.summary(value, getString));
        svg.setAttribute('focusable', 'false');

        if (geometry.area !== '') {
            const area = document.createElementNS(SVG_NS, 'path');
            area.setAttribute('class', 'Sparkline-area');
            area.setAttribute('d', geometry.area);
            svg.appendChild(area);
        }

        if (geometry.line !== '') {
            const line = document.createElementNS(SVG_NS, 'polyline');
            line.setAttribute('class', 'Sparkline-line');
            line.setAttribute('points', geometry.line);
            svg.appendChild(line);
        }

        for (const rect of geometry.columns) {
            const bar = document.createElementNS(SVG_NS, 'rect');
            bar.setAttribute(
                'class',
                rect.negative ? 'Sparkline-column Sparkline-column--negative' : 'Sparkline-column',
            );
            bar.setAttribute('x', String(rect.x));
            bar.setAttribute('y', String(rect.y));
            bar.setAttribute('width', String(rect.width));
            bar.setAttribute('height', String(rect.height));
            svg.appendChild(bar);
        }

        plot.appendChild(svg);
        plot.appendChild(this.hitLayer(getString));

        return plot;
    }

    /**
     * The points, as buttons layered over the picture.
     *
     * Real `<button>`s rather than SVG elements with a delegated `mousemove`,
     * for three reasons and all three are load-bearing. Mapping a pointer to a
     * point needs `getBoundingClientRect`, which the test DOM does not have, and
     * its events do not bubble, so a delegated handler could not be driven from
     * a test at all. A button is focusable and in the host's tab order for free.
     * And each one carries its own accessible name, so a screen reader walks the
     * series without the live region being involved.
     *
     * Positioned as a percentage of the view box, so the layer scales with the
     * picture and still nothing is measured.
     */
    private hitLayer(getString: (id: string) => string): HTMLElement {
        const geometry = this.geometry as Geometry;

        const layer = document.createElement('div');
        layer.className = 'Sparkline-hits';
        layer.setAttribute('role', 'group');
        layer.setAttribute('aria-label', getString('Sparkline_PointsGroup'));

        geometry.plotted.forEach((plotted, index) => {
            const hit = document.createElement('button');
            hit.className = 'Sparkline-hit';
            hit.type = 'button';

            if (geometry.kind === 'columns') {
                hit.className = 'Sparkline-hit Sparkline-hit--slot';
                hit.setAttribute(
                    'style',
                    `left: ${percent(plotted.x - geometry.scale.slot / 2, VIEW_WIDTH)}%;` +
                        ` width: ${percent(geometry.scale.slot, VIEW_WIDTH)}%`,
                );
            } else {
                hit.setAttribute('style', `left: ${percent(plotted.x, VIEW_WIDTH)}%`);
            }

            /*
             * The name is what the point *is*; the value goes to the readout.
             * Putting both here would have a screen reader say the value twice
             * on every arrow press, once from the name and once from the live
             * region.
             */
            hit.setAttribute(
                'aria-label',
                plotted.point.categoryText !== ''
                    ? plotted.point.categoryText
                    : format(getString('Sparkline_PointOf'), index + 1, geometry.plotted.length),
            );

            /*
             * A roving tabindex: the chart is one tab stop, not one per point. A
             * hundred-point series with a hundred tab stops is a trap in the
             * middle of a form.
             */
            hit.setAttribute('tabindex', index === this.active ? '0' : '-1');

            hit.addEventListener('focus', () => this.moveTo(index, getString, false));
            hit.addEventListener('mouseenter', () => this.moveTo(index, getString, false));
            hit.addEventListener('keydown', (event) => this.onKeyDown(event, index, getString));

            this.hits.push(hit);
            layer.appendChild(hit);
        });

        /*
         * The marker rides in this layer rather than in the picture, and that is
         * not tidiness: `preserveAspectRatio="none"` scales the two axes
         * differently, so an SVG circle arrives as an ellipse in every box that
         * is not 15:4. A positioned element is round whatever the box does.
         *
         * It is also the whole drawing when there is a single point, since a
         * one-vertex polyline draws nothing at all.
         */
        const marker = document.createElement('div');
        marker.className = 'Sparkline-marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.setAttribute('style', this.markerStyle(this.active));
        this.marker = marker;
        layer.appendChild(marker);

        return layer;
    }

    private markerStyle(index: number): string {
        const plotted = (this.geometry as Geometry).plotted[index];
        return `left: ${percent(plotted.x, VIEW_WIDTH)}%; top: ${percent(plotted.y, VIEW_HEIGHT)}%`;
    }

    private onKeyDown(event: Event, index: number, getString: (id: string) => string): void {
        const geometry = this.geometry as Geometry;
        const last = geometry.plotted.length - 1;
        const key = (event as KeyboardEvent).key;

        /*
         * Stops at the ends rather than wrapping. A series has a first and a
         * last reading, and a chart that jumps from December to January on one
         * more arrow press invents a continuity the data does not have.
         */
        let target: number;
        switch (key) {
            case 'ArrowRight':
                target = Math.min(index + 1, last);
                break;
            case 'ArrowLeft':
                target = Math.max(index - 1, 0);
                break;
            case 'Home':
                target = 0;
                break;
            case 'End':
                target = last;
                break;
            default:
                return;
        }

        if (typeof event.preventDefault === 'function') {
            event.preventDefault();
        }

        this.moveTo(target, getString, true);
    }

    /**
     * Move the readout to a point **without re-rendering**.
     *
     * Three mutations and nothing else: the two `tabindex` attributes, the
     * marker's centre, and the readout's text. A render here would destroy the
     * button the user is holding down mid-keystroke — the failure the expand
     * button's `restoreFocus` exists to repair, avoided rather than repaired.
     */
    private moveTo(index: number, getString: (id: string) => string, focus: boolean): void {
        const geometry = this.geometry;
        if (!geometry || index < 0 || index >= geometry.plotted.length) {
            return;
        }

        const previous = this.hits[this.active];
        if (previous) {
            previous.setAttribute('tabindex', '-1');
        }

        this.active = index;

        const current = this.hits[index];
        if (current) {
            current.setAttribute('tabindex', '0');
            if (focus) {
                current.focus();
            }
        }

        if (this.marker) {
            this.marker.setAttribute('style', this.markerStyle(index));
        }

        if (this.readout) {
            this.readout.textContent = this.readoutText(index, getString);
        }
    }

    private readoutText(index: number, getString: (id: string) => string): string {
        const geometry = this.geometry as Geometry;
        const point = geometry.plotted[index].point;

        const label =
            point.categoryText !== ''
                ? point.categoryText
                : format(getString('Sparkline_PointOf'), index + 1, geometry.plotted.length);

        return format(getString('Sparkline_Readout'), label, point.valueText);
    }

    private readoutRow(getString: (id: string) => string): HTMLElement {
        const readout = document.createElement('p');
        readout.className = 'Sparkline-readout';
        /*
         * Polite, not assertive: a value changing under an arrow key is not an
         * interruption, and `assertive` would cut off whatever the reader was
         * saying about the button that caused it.
         */
        readout.setAttribute('aria-live', 'polite');
        readout.setAttribute('aria-atomic', 'true');
        readout.textContent = this.readoutText(this.active, getString);

        this.readout = readout;
        return readout;
    }

    /** What the picture says, for a reader who is not looking at it. */
    private summary(value: Column, getString: (id: string) => string): string {
        const geometry = this.geometry as Geometry;
        const points = geometry.plotted;
        const name = value.displayName || value.name;

        if (geometry.flat) {
            return format(getString('Sparkline_SummaryFlat'), name, points[0].point.valueText);
        }

        const key =
            geometry.kind === 'area'
                ? 'Sparkline_SummaryArea'
                : geometry.kind === 'columns'
                  ? 'Sparkline_SummaryColumns'
                  : 'Sparkline_SummaryLine';

        return format(
            getString(key),
            name,
            points.length,
            points[0].point.valueText,
            points[points.length - 1].point.valueText,
        );
    }

    /**
     * The visually hidden caption, which is where anything the picture dropped
     * gets said out loud. A chart that silently skips four records is a chart
     * that lies by omission.
     */
    private caption(
        series: { blank: number; unreadable: number },
        getString: (id: string) => string,
    ): HTMLElement {
        const caption = document.createElement('p');
        caption.className = 'Sparkline-caption';

        const parts: string[] = [];
        if (series.blank > 0) {
            parts.push(format(getString('Sparkline_SkippedBlank'), series.blank));
        }
        if (series.unreadable > 0) {
            parts.push(format(getString('Sparkline_SkippedUnreadable'), series.unreadable));
        }

        caption.textContent = parts.join(' ');
        return caption;
    }
}

/**
 * A TwoOptions the platform may hand over as a string.
 *
 * `default-value="false"` arrives at PCFHub's demo harness as the string
 * "false", which is truthy — so a control reading `raw` directly gets the
 * opposite of its own declared default on the one surface the public sees.
 */
function asBoolean(raw: unknown, fallback: boolean): boolean {
    if (typeof raw === 'boolean') {
        return raw;
    }
    if (raw === 'false' || raw === '0' || raw === 0) {
        return false;
    }
    if (raw === 'true' || raw === '1' || raw === 1) {
        return true;
    }
    return fallback;
}

/** `{0}`-style substitution, which is what the .resx files are written in. */
function format(template: string, ...values: (string | number)[]): string {
    return template.replace(/\{(\d+)\}/g, (match, index: string) => {
        const value = values[Number(index)];
        return value === undefined ? match : String(value);
    });
}

/** A view-unit coordinate as a percentage of the box, to two decimals. */
function percent(value: number, of: number): number {
    return Math.round((value / of) * 10000) / 100;
}

/**
 * The expand glyph, inline.
 *
 * Never an `<img src>`, file or data URL. An image behind `src` renders as an
 * isolated document that cannot see this control's stylesheet, so `currentColor`
 * inside it resolves to black and a dark form gets a black glyph on a dark
 * background. pcf-file-drop shipped exactly that and it was found on a real form.
 */
function expandGlyph(expanded: boolean): Element {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'Sparkline-glyph');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute(
        'd',
        expanded
            ? 'M8.5 3.5v5h-5M11.5 16.5v-5h5M8.5 8.5L3 14M11.5 11.5L17 6'
            : 'M12.5 3.5h4v4M7.5 16.5h-4v-4M16.5 3.5L11 9M3.5 16.5L9 11',
    );
    svg.appendChild(path);

    return svg;
}
