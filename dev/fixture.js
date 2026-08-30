/*
 * The view the dev harness binds: columns and records, chosen for the edges.
 *
 * **This is not `demo/records.json`, and the difference is deliberate.** That
 * one is the hub's demo fixture — it exists to look like a working control on a
 * public page, so it is tidy and reads as a chart at a glance. This one exists
 * to break things:
 *
 *   - **`alias` differs from `name` on every column.** A property-set role is
 *     found on the column by `alias` and read off the record by `name`, and a
 *     fixture that sets the two to the same string resolves in both directions
 *     — so the control looks right here and renders nothing against a real
 *     view. That is exactly how the bug reached production in pcf-tag-list.
 *   - **fifteen records, twelve of them plottable.** A null and an empty string
 *     are missing data; the text "n/a" is a column bound to the wrong thing.
 *     They are different findings and the control counts them separately.
 *   - **a genuine zero and a negative**, the two values a chart most often
 *     mistakes for "no value" and "impossible".
 *   - **a formatted value that differs from the raw one** — 1204.75 against
 *     "$1,204.75". Without one, a control that plots the number and a control
 *     that plots the string are indistinguishable from any assertion.
 *   - **labels that are not in alphabetical order**, so a control that quietly
 *     sorted the series would draw a different picture from this one.
 *   - **a third column with no role at all**, because a real view carries
 *     columns this control was never pointed at.
 *
 * The named fixtures at the bottom are the shapes that have no vertices to
 * assert: one point, a flat series, nothing readable, nothing at all, and a
 * view where the required role was never mapped.
 *
 * Loaded by `harness.html` in a browser and by `smoke.js` in Node, so it
 * assigns both ways and depends on neither.
 */

(function (root, factory) {
    'use strict';

    var fixture = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = fixture;
    }

    if (root) {
        root.__pcfFixture = fixture;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    var COLUMNS = [
        {
            name: 'cr123_periodlabel',
            displayName: 'Period',
            dataType: 'SingleLine.Text',
            alias: 'categoryField',
            order: 0,
            visualSizeFactor: 120,
        },
        {
            name: 'cr123_revenue',
            displayName: 'Revenue',
            dataType: 'Currency',
            alias: 'valueField',
            order: 1,
            visualSizeFactor: 100,
        },
        {
            // No role. A real view has columns the control was never pointed at,
            // and `roleColumn` has to walk past them rather than take the first.
            name: 'cr123_note',
            displayName: 'Note',
            dataType: 'SingleLine.Text',
            alias: 'cr123_note',
            order: 2,
            visualSizeFactor: 150,
            isHidden: true,
        },
    ];

    function row(id, label, revenue, note, formatted) {
        var record = {
            id: id,
            values: {
                cr123_periodlabel: label,
                cr123_revenue: revenue,
                cr123_note: note || null,
            },
        };

        if (formatted !== undefined) {
            record.formatted = { cr123_revenue: formatted };
        }

        return record;
    }

    return {
        targetEntityType: 'cr123_monthlyrevenue',
        title: 'Revenue by month',
        columns: COLUMNS,

        records: [
            row('r01', 'Jan 2025', 820),
            row('r02', 'Feb 2025', 1045),
            row('r03', 'Mar 2025', null, 'not reported'),
            row('r04', 'Apr 2025', 1310),
            // The only row whose formatted value differs from its raw one.
            row('r05', 'May 2025', 1204.75, null, '$1,204.75'),
            // A real zero. A chart that treats falsy as missing loses this one.
            row('r06', 'Jun 2025', 0),
            // Below the baseline, which only the column chart can show.
            row('r07', 'Jul 2025', -260),
            row('r08', 'Aug 2025', '', 'awaiting close'),
            row('r09', 'Sep 2025', 640),
            row('r10', 'Oct 2025', 980),
            // Text where a number belongs: the column is bound to the wrong thing.
            row('r11', 'Nov 2025', 'n/a'),
            row('r12', 'Dec 2025', 1480),
            row('r13', 'Jan 2026', 1725),
            row('r14', 'Feb 2026', 1610),
            // No label at all, so the readout has to fall back to a point number.
            row('r15', '', 1890),
        ],

        /** One reading. A one-vertex polyline draws nothing, so this is a dot. */
        single: {
            records: [row('s01', 'Jan 2025', 1420)],
        },

        /** Every value identical: no range to scale into, and a division by zero. */
        flat: {
            records: [
                row('f01', 'Jan 2025', 42),
                row('f02', 'Feb 2025', 42),
                row('f03', 'Mar 2025', 42),
                row('f04', 'Apr 2025', 42),
                row('f05', 'May 2025', 42),
            ],
        },

        /** Nothing readable. Not the same message as an empty view. */
        unreadable: {
            records: [
                row('u01', 'Jan 2025', 'pending'),
                row('u02', 'Feb 2025', 'n/a'),
                row('u03', 'Mar 2025', 'tbc'),
            ],
        },

        /** No records at all. */
        empty: {
            records: [],
        },

        /**
         * A view where the required role was never mapped — which in canvas is
         * not a broken control but a maker who has not finished the Fields
         * flyout, and needs to be told so in words.
         */
        unmapped: {
            columns: [
                {
                    name: 'cr123_periodlabel',
                    displayName: 'Period',
                    dataType: 'SingleLine.Text',
                    alias: 'categoryField',
                    order: 0,
                    visualSizeFactor: 120,
                },
            ],
        },
    };
});
