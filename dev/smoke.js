/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/Sparkline/bundle.js` the way a form would, binds it to the
 * fifteen-record view in `dev/fixture.js`, and asserts what the control did —
 * both what it drew and what it asked the platform for.
 *
 * **Why a chart can be asserted here at all.** Every coordinate this control
 * draws is arithmetic over the data, computed in a constant viewBox, so the
 * exact `points` string is a fact about the control rather than about the
 * browser it happened to run in. That is a design constraint rather than a
 * happy accident: `dev/dom.js` has no layout — no `getBoundingClientRect`, no
 * `getComputedStyle`, and an element from `createElementNS` with no `getBBox` —
 * so a chart that positioned itself by measuring could not be checked outside a
 * browser at all, and its regressions would be found by customers.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: half of what a
 * dataset control does is ask the platform for things, and a rendered picture
 * shows none of it. Whether the page size settles or loops, whether Expand
 * actually asked for full screen, whether `destroy` handed it back — those are
 * decisions, they are what regresses, and here they are assertions with an exit
 * code.
 *
 * **What passing here does NOT mean.** Every record below is supplied by this
 * file, and nothing here has looked at the picture. It cannot tell you that a
 * real view hands over what this fixture hands over, that the chart is legible,
 * that the colours have contrast, or that full screen looks like anything. Keep
 * those in SPEC.md under "Not verified", and use `npm run harness` for the half
 * that has to be seen.
 *
 * **The quirks default to the platform's observed misbehaviour, not to its
 * documentation**, and that is load-bearing. See the header of `dev/host.js`.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');
const fixture = require('./fixture.js');

const BUNDLE = path.join(root, 'out', 'controls', 'Sparkline', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/Sparkline. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here — no injectable clock parameter, and therefore no production
 * code bent to suit a harness.
 *
 * This control takes no timer. The teardown assertion at the bottom is written
 * against one anyway, so it starts passing for a real reason the moment
 * somebody adds a refresh interval.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * No platform libraries to supply, and nothing to render deeply.
 *
 * The dataset template's smoke suite reads React and Fluent globals out of the
 * bundle and renders the returned element with `react-dom/server`, because a
 * virtual control's component does not run until something renders it. This is
 * a standard control: `updateView` writes into the container, so the container
 * *is* the result, and both of those mechanisms are gone rather than left
 * inert. If this control is ever converted to `react_virtual`, take them back
 * from `_template/variants/dataset/dev/smoke.js`.
 */
vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source".
const marked = (key) => `resx:${key}`;

/*
 * The five strings that carry `{0}` placeholders, repeated here as shapes.
 *
 * A marked key has no placeholders in it, so a control doing the substitution
 * correctly and one doing nothing at all produce the same string. These are not
 * a copy of the translation — they are the token layout the control has to
 * fill, which is the part that breaks.
 */
const TEMPLATES = {
    Sparkline_Readout: '{0}: {1}',
    Sparkline_PointOf: 'Point {0} of {1}',
    Sparkline_SummaryLine: 'Line chart of {0}. {1} points, from {2} to {3}.',
    Sparkline_SummaryColumns: 'Column chart of {0}. {1} points, from {2} to {3}.',
    Sparkline_SummaryFlat: '{0} holds the same value at every point: {1}.',
    Sparkline_SkippedBlank: 'Records with no value: {0}.',
    Sparkline_SkippedUnreadable: 'Records holding text that is not a number: {0}.',
};

const speaks = (key) => (TEMPLATES[key] !== undefined ? TEMPLATES[key] : marked(key));

/*
 * What every `bind()` starts from, and both halves are corrections to
 * `dev/host.js`'s defaults rather than preferences.
 *
 * **`pageSize`** there is five, which is right for a table with a pager and
 * wrong for a series: the control would chart the first four readings and every
 * expectation below would be about a truncated view. A hundred is the control's
 * own default.
 *
 * **`inputs`** there is empty, so a declared property arrives as `undefined`
 * rather than as its manifest default — which the platform never does. Reading
 * `context.parameters.chartType.raw` would throw here and work on a form, so
 * the fix belongs in the harness: these are the manifest's own `default-value`s,
 * and they have to be kept in step with it.
 */
const MANIFEST_DEFAULTS = {
    chartType: 'line',
    chartHeight: 96,
    allowFullScreen: true,
};

/**
 * Every control bound and not yet destroyed.
 *
 * A suite that binds and walks away is testing something other than what it
 * says: an abandoned control keeps its listeners, so the next section's counts
 * include them. That is the leak the teardown assertion exists to catch, and
 * asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function bind(options = {}) {
    const handle = host.createHost(fixture, {
        getString: marked,
        pageSize: 100,
        ...options,
        inputs: { ...MANIFEST_DEFAULTS, ...(options.inputs || {}) },
    });
    const container = dom.createElement('div');
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(
        handle.context,
        () => {
            notifications += 1;
        },
        {},
        container,
    );

    let driven = host.drive(instance, handle, 10);

    const view = {
        instance,
        container,
        handle,
        calls: () => handle.state.calls,
        notifications: () => notifications,
        outputs: () => (instance.getOutputs ? instance.getOutputs() : {}),
        find: (selector) => container.querySelector(selector),
        findAll: (selector) => container.querySelectorAll(selector),
        get driven() {
            return driven;
        },
        /** Let the platform catch up after something the control asked for. */
        settle: () => {
            driven = host.drive(instance, handle, 10);

            return driven;
        },
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(view);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
    };

    live.push(view);

    return view;
}

/** A keyboard event, as `dev/dom.js` delivers one: no bubbling, no synthesis. */
function press(element, key) {
    element.dispatchEvent({ type: 'keydown', key, target: element, preventDefault: () => {} });
}

const points = (view) => view.find('.Sparkline-line').getAttribute('points');
const ys = (view) =>
    points(view)
        .split(' ')
        .map((pair) => Number(pair.split(',')[1]));

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ------------------------------------------------------ what it asked for */

const view = bind();

/*
 * **One pass, where this used to be two.** The second was the page size: the
 * property carried `default-value="100"`, so every mount called `setPageSize`
 * and `refresh()` — a round trip, and an override of however many rows the host
 * had already decided to fetch. With no default there is nothing to ask for.
 */
check(
    'settles instead of refreshing forever',
    !view.driven.looping && view.driven.passes === 1,
    `${view.driven.passes} passes, ${view.driven.looping ? 'still owed' : 'settled'}`,
);

check(
    'asks to be told its allocated size',
    view.calls().includes('trackContainerResize(true)'),
    view.calls().join(' '),
);

view.settle();
view.settle();

/*
 * The assertion about a call that must **not** happen.
 *
 * This file used to require exactly one `setPageSize`, which was the defect
 * written down as a test: a maker who never touched the property still produced
 * a control that told the host how many rows to fetch. A chart wants as many
 * points as it can get, and that is still not a reason to override a number the
 * host has already settled — the maker who wants a longer series sets it.
 */
check(
    'an unset page size overrides nothing — the host is already paging',
    view.calls().filter((call) => call.startsWith('setPageSize')).length === 0,
    view.calls().join(' '),
);

const overriding = bind({ inputs: { pageSize: 3 } });

overriding.settle();
overriding.settle();

check(
    'a page size the maker did set is asked for once and then left alone',
    overriding.calls().filter((call) => call.startsWith('setPageSize')).length === 1,
    overriding.calls().join(' '),
);

/*
 * A main grid answers the width and never the height — `-1` for the life of the
 * control, however politely it asks. This chart already treats `-1` and `0` as
 * "no answer" on the height, which is the rule it wrote down; the switch is
 * what turns that from a claim into an assertion.
 */
const unmeasured = bind({ width: 900, quirks: { heightUnmeasured: true } });

check(
    'renders on a host that measures a width and never a height',
    unmeasured.handle.context.mode.allocatedHeight === -1 && !unmeasured.driven.looping,
    `allocatedHeight ${unmeasured.handle.context.mode.allocatedHeight}`,
);

check(
    'never turns a page: the whole series is one fetch',
    !view.calls().some((call) => /loadNextPage|loadPreviousPage|loadExactPage/.test(call)),
    view.calls().join(' '),
);

check(
    'and never sorts, because the order is the view’s to decide',
    view.handle.dataset.sorting.length === 0 && !view.calls().includes('paging.reset'),
    `sorting: ${JSON.stringify(view.handle.dataset.sorting)}`,
);

/* -------------------------------------------------------------- the shape */

check(
    'spreads twelve readings across the viewBox at exactly the coordinates the arithmetic says',
    points(view) ===
        '3,39.83 29.73,32.08 56.45,22.96 83.18,26.59 109.91,68.05 136.64,77 163.36,46.02 190.09,34.32 216.82,17.11 243.55,8.68 270.27,12.64 297,3',
    points(view),
);

check(
    'puts the highest reading at the top of the band and the lowest on its floor',
    Math.min(...ys(view)) === 3 && Math.max(...ys(view)) === 77,
    `${Math.min(...ys(view))} … ${Math.max(...ys(view))}`,
);

/*
 * The claim the whole design rests on. A control that measured its container
 * would draw something different in these two, and could not be checked here at
 * all — see the header.
 */
check(
    'never measures: the same coordinates whether the host allocated a width or not',
    points(bind({ width: -1 })) === points(bind({ width: 640 })),
);

check(
    'and the same again at a different allocated height',
    points(bind({ height: -1 })) === points(bind({ height: 900 })),
);

/* --------------------------------------------------------- the edge cases */

const flat = bind({ records: fixture.flat.records });

check(
    'draws a series with no range down the middle of the band, not along its floor',
    ys(flat).every((y) => y === 40),
    points(flat),
);

const flatColumns = bind({
    records: fixture.flat.records,
    inputs: { chartType: 'columns' },
});

/*
 * The one place the two chart types disagree on purpose. A column encodes
 * magnitude by length, so it starts at zero or it lies about ratios; a line
 * encodes shape, and zero-baselining a flat series at 42 would flatten the only
 * thing it had to say. Same data, two domains, and docs/limitations.md says so.
 */
check(
    'zero-baselines columns and leaves the line’s domain to the data',
    flatColumns.find('.Sparkline-column').getAttribute('height') === '74' &&
        ys(flat)[0] === 40,
    `column height ${flatColumns.find('.Sparkline-column').getAttribute('height')}, line y ${ys(flat)[0]}`,
);

const single = bind({ records: fixture.single.records });

check(
    'draws one reading as a dot, because a one-vertex polyline draws nothing',
    single.find('.Sparkline-line') === null && single.find('.Sparkline-marker') !== null,
);

check(
    'and puts that dot in the middle rather than in the corner',
    single.find('.Sparkline-marker').getAttribute('style') === 'left: 50%; top: 50%',
    single.find('.Sparkline-marker').getAttribute('style'),
);

check(
    'skips a record with no value and joins the two either side of it',
    ys(view).length === 12,
    `${fixture.records.length} records in, ${ys(view).length} vertices out`,
);

const columns = bind({ inputs: { chartType: 'columns' } });
const bars = columns.findAll('.Sparkline-column');

check(
    'treats a zero as a reading and not as a blank',
    bars.length === 12 && bars[4].getAttribute('height') === '0.75',
    `${bars.length} columns, the zero is ${bars[4].getAttribute('height')} tall`,
);

check(
    'hangs a negative column below the baseline the positive ones stand on',
    bars[5].classList.contains('Sparkline-column--negative') &&
        bars[5].getAttribute('y') === '68.05' &&
        Number(bars[0].getAttribute('y')) < 68.05,
    `negative at y ${bars[5].getAttribute('y')}, positive at y ${bars[0].getAttribute('y')}`,
);

const area = bind({ inputs: { chartType: 'area' } });
const d = area.find('.Sparkline-area').getAttribute('d');

check(
    'closes the area on the baseline rather than leaving it open',
    d.startsWith('M3,68.05 ') && d.endsWith('L297,68.05 Z'),
    d.slice(0, 20) + ' … ' + d.slice(-20),
);

/* ------------------------------------------------------ reading the values */

const readable = bind({ getString: speaks });

readable.findAll('.Sparkline-hit')[3].dispatchEvent({ type: 'mouseenter' });

check(
    'plots the number and reads out the formatted string, never the other way round',
    ys(readable)[3] === 26.59 && readable.find('.Sparkline-readout').textContent === 'May 2025: $1,204.75',
    `y ${ys(readable)[3]}, readout "${readable.find('.Sparkline-readout').textContent}"`,
);

check(
    'refuses text that is not a number rather than plotting it as zero',
    ys(view).indexOf(77) === 5,
    'the floor of the band is the -260 reading, not the "n/a" one',
);

check(
    'says the column holds no numbers rather than saying the view is empty',
    bind({ records: fixture.unreadable.records }).find('.Sparkline-message').textContent ===
        'resx:Sparkline_NoNumbers',
);

check(
    'and says the view is empty when it is',
    bind({ records: fixture.empty.records }).find('.Sparkline-message').textContent ===
        'resx:Sparkline_Empty',
);

check(
    'says it is loading rather than saying there is nothing',
    bind({ loading: true, records: fixture.empty.records }).find('.Sparkline-message')
        .textContent === 'resx:Sparkline_Loading',
);

check(
    'reports an error the platform handed down',
    bind({ error: true }).find('.Sparkline-message').textContent ===
        'The records could not be loaded.',
);

/*
 * A canvas app supplies only the columns picked in the Items Fields flyout, so
 * a required role that was never mapped is a maker mid-configuration rather
 * than a broken control — and an empty box tells them nothing.
 */
check(
    'tells the maker when the value column was never mapped',
    bind({ columns: fixture.unmapped.columns }).find('.Sparkline-message').textContent ===
        'resx:Sparkline_NoValueColumn',
);

check(
    'draws the series in the view’s order rather than in the label’s',
    view.findAll('.Sparkline-hit')[0].getAttribute('aria-label') === 'Jan 2025',
    view.findAll('.Sparkline-hit')[0].getAttribute('aria-label'),
);

/* ---------------------------------------------------------- the size given */

const styleOf = (v) => v.find('.Sparkline-plot').getAttribute('style');

check(
    'takes its height from the host where the host has one to give',
    styleOf(bind({ height: 900 })) === '--Sparkline-height: 900px',
    styleOf(bind({ height: 900 })),
);

check(
    'and falls back to the maker’s height where the host reports none',
    styleOf(bind({ height: -1, inputs: { chartHeight: 200 } })) ===
        '--Sparkline-height: 200px',
    styleOf(bind({ height: -1, inputs: { chartHeight: 200 } })),
);

/* ------------------------------------------------------------ full screen */

const expandable = bind();

expandable.find('.Sparkline-expand').click();

check(
    'asks the platform for full screen when Expand is clicked',
    expandable.calls().includes('setFullScreen(true)'),
    expandable.calls().join(' '),
);

check(
    'renames the button once the chart is expanded',
    expandable.find('.Sparkline-expand').getAttribute('aria-label') === 'resx:Sparkline_Collapse',
    expandable.find('.Sparkline-expand').getAttribute('aria-label'),
);

check(
    'and puts focus back on the button the render its own click destroyed',
    dom.document.activeElement === expandable.find('.Sparkline-expand'),
);

expandable.find('.Sparkline-expand').click();

check(
    'asks to leave it again on the second click',
    expandable.calls().includes('setFullScreen(false)'),
    expandable.calls().join(' '),
);

/*
 * The host that has no full screen to give. Canvas is the known case, and the
 * hub's demo harness is the one the public sees.
 */
const noFullScreen = bind({ quirks: { hasFullScreen: false } });

noFullScreen.find('.Sparkline-expand').click();

check(
    'expands in place on a host that has no setFullScreen, rather than throwing',
    noFullScreen.container.classList.contains('Sparkline--fullscreen') &&
        !noFullScreen.calls().some((call) => call.startsWith('setFullScreen')),
    noFullScreen.calls().join(' '),
);

check(
    'offers no Expand button when the maker turned it off',
    bind({ inputs: { allowFullScreen: false } }).find('.Sparkline-expand') === null,
);

/*
 * The string, not the boolean. A manifest `default-value` reaches PCFHub's demo
 * harness as raw XML text, and `Boolean("false")` is `true` — so this is the
 * one that goes wrong on the surface the public sees.
 */
check(
    'and reads the string "false" a host may hand over as false, not as truthy',
    bind({ inputs: { allowFullScreen: 'false' } }).find('.Sparkline-expand') === null,
);

const held = bind();
held.find('.Sparkline-expand').click();
held.destroy();

check(
    'hands the screen back when it is destroyed while still holding it',
    held.calls().filter((call) => call === 'setFullScreen(false)').length === 1,
    held.calls().join(' '),
);

/* ------------------------------------------------- reading it without eyes */

const svg = view.find('.Sparkline-svg');

check(
    'gives the picture a name rather than leaving it an unlabelled image',
    svg.getAttribute('role') === 'img' && (svg.getAttribute('aria-label') || '').length > 0,
    svg.getAttribute('aria-label'),
);

check(
    'names every reading, so the series is reachable without touching the picture',
    view.findAll('.Sparkline-hit').length === 12 &&
        view.findAll('.Sparkline-hit').every((hit) => (hit.getAttribute('aria-label') || '') !== ''),
);

check(
    'is one tab stop, not one per reading',
    view.findAll('.Sparkline-hit').filter((hit) => hit.getAttribute('tabindex') === '0').length === 1,
);

const keyboard = bind({ getString: speaks });
const polyline = keyboard.find('.Sparkline-line');
const hits = keyboard.findAll('.Sparkline-hit');

press(hits[0], 'ArrowRight');

check(
    'moves to the next reading on ArrowRight',
    hits[1].getAttribute('tabindex') === '0' && hits[0].getAttribute('tabindex') === '-1',
);

check(
    'without rebuilding the chart under the key the user is holding',
    keyboard.find('.Sparkline-line') === polyline,
);

check(
    'and moves the marker with it',
    keyboard.find('.Sparkline-marker').getAttribute('style') === 'left: 9.91%; top: 40.1%',
    keyboard.find('.Sparkline-marker').getAttribute('style'),
);

press(hits[1], 'End');
check('End reaches the last reading', hits[11].getAttribute('tabindex') === '0');

press(hits[11], 'ArrowRight');
check(
    'and stops there rather than wrapping round to the first',
    hits[11].getAttribute('tabindex') === '0',
);

press(hits[11], 'Home');
check('Home reaches the first', hits[0].getAttribute('tabindex') === '0');

check(
    'reads the value into a polite live region',
    keyboard.find('.Sparkline-readout').getAttribute('aria-live') === 'polite' &&
        keyboard.find('.Sparkline-readout').textContent === 'Jan 2025: 820',
    keyboard.find('.Sparkline-readout').textContent,
);

check(
    'keeps the name on the point and the value in the readout, so neither is said twice',
    hits[0].getAttribute('aria-label') === 'Jan 2025',
    hits[0].getAttribute('aria-label'),
);

press(hits[0], 'End');

check(
    'numbers a reading whose label column is empty rather than announcing nothing',
    keyboard.find('.Sparkline-readout').textContent === 'Point 12 of 12: 1890',
    keyboard.find('.Sparkline-readout').textContent,
);

check(
    'owns up in the caption to everything it dropped',
    keyboard.find('.Sparkline-caption').textContent ===
        'Records with no value: 2. Records holding text that is not a number: 1.',
    keyboard.find('.Sparkline-caption').textContent,
);

/* ------------------------------------------------------------- the theme */

check(
    'takes no position on the theme when the host publishes none',
    !bind({ host: 'canvas' }).container.classList.contains('Sparkline--dark'),
);

check(
    'and follows the host into dark when it publishes one',
    bind({ dark: true }).container.classList.contains('Sparkline--dark'),
);

/* ---------------------------------------------------- what destroy owes */

/*
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. The interval
 * keeps firing against a container the platform has already thrown away; the
 * document listener keeps the whole control reachable, so nothing about it is
 * ever collected.
 *
 * This control takes neither, and that is itself a decision worth holding: the
 * expand fallback deliberately installs no document-level Esc handler, because
 * a component that is not modal has no business taking Esc from the form.
 */
disposeAll();

const timersBefore = time.pending();
const listeners = () =>
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
const listenersBefore = listeners();

bind().destroy();

check(
    'destroy() releases every timer the control took',
    time.pending() === timersBefore,
    `${timersBefore} → ${time.pending()}`,
);

check(
    'and every document-level listener',
    listeners() === listenersBefore,
    `${listenersBefore} → ${listeners()}`,
);

const rerendered = bind();
const afterFirst = time.pending();

rerendered.settle();
rerendered.settle();
rerendered.settle();

check(
    'and re-rendering does not add another one',
    time.pending() === afterFirst,
    `${afterFirst} → ${time.pending()}`,
);

disposeAll();

report();

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real view still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
