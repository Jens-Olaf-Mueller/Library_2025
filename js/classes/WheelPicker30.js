import $, { format$ } from '../utils.js';
import Library from './Library.js';
import { Haptic } from './Haptic.js';
import { Wheel } from './Wheel.js';
import { NOT_FOUND } from '../constants.js';

/**
 * @file WheelPicker30.js
 * @module WheelPicker
 * @extends Library
 * @version 3.0.0
 * @author Jens-Olaf-Mueller
 *
 * WheelPicker — A highly configurable, wheel-based selection overlay.
 * ==============================================================================
 *
 * Provides a modal interface for selecting values via one or more rotating wheels.
 * - Key Features:
 *   - Features dedicated logic for these modes:
 *     - 'time'
 *     - 'hours'
 *     - 'spin'
 *     - 'date'
 *     - 'custom'
 *   - Smart Parsing: Automatically resolves input values and formats output strings or objects per mode.
 *   - Dynamic Step Logic: Handles minute steps, fractional hours (e.g., 0.5h → 30m), and CSV-based value lists.
 *   - Flexible Data Sources: Accepts CSV strings, arrays, or object maps for custom wheel configurations.
 *   - Haptic Integration: Synchronizes with the `Haptic` engine for tactile feedback during scrolling and snapping.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link show}           - Renders the overlay UI, arms the haptic system, and initializes the wheels.
 * - {@link hide}           - Closes the overlay, applies the selection to the input, and fires events.
 * - {@link initWheels}     - Instantiates and configures the required `Wheel` objects based on the current mode.
 * - {@link onPointerDown}  - Central handler for the 'OK' and 'Cancel' button actions in the overlay.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #parseExternalValue()  - Deconstructs the connected input's string into internal active values.
 * - #parseDate()           - Robust date string parser supporting multiple regional formats.
 * - #getDaysOfMonth()      - Calculates the correct date-range for the day-wheel validation.
 * - #handleWheelSnap()     - Callback for wheel stabilization; updates values and validates cross-wheel dependencies.
 * - #formatValue()         - Reconstructs the internal state into the finalized output string or object.
 * - #coerceValue()         - Ensures values remain within specified min/max/clamping ranges before output.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event input {Object}   - Fires when the selection is confirmed (OK button).
 * @event cancel {Object}  - Fires when the overlay is closed without applying changes.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * All variables are prefixed with '--wheel-' and follow kebab-case naming.
 * - --wheel-items-visible      - Number of items shown simultaneously in the wheel view.
 * - --wheel-item-height        - The vertical height of a single selectable item.
 * - --wheel-backdrop-color     - Background color of the modal overlay backdrop.
 * - --wheel-grid-color         - Color of the separator lines within the picker.
 * - --wheel-bg-color           - Main background color of the picker dialog.
 * - --wheel-button-bg-color    - Background color for the confirmation (OK) button.
 * - --wheel-text-color         - Primary text color for wheel items and labels.
 * - --wheel-accent-color       - Accent color for the selected item or title.
 * - --wheel-selection-bg-color - Background highlight color for the selection area.
 * - --wheel-dialog-border-radius - Corner radius of the picker dialog.
 * - --wheel-dialog-box-shadow  - Shadow styling for the picker overlay.
 * - --wheel-gradient-dark      - The darker stop of the masking gradient overlay.
 * - --wheel-gradient-light     - The lighter stop of the masking gradient overlay.
 */
export class WheelPicker extends Library {

    /** @type {HTMLElement|null} */
    #overlay = null;

    #columns = [];
    /** @type {HTMLElement []} */
    get columns() { return this.#columns; }

    /** @type {Class Wheel []} */
    #wheels = [];
    get wheels() { return this.#wheels; }

    #mode = 'time'; // default
    get mode() { return /** @type any */ (this.#mode); }
    /**
     * Sets the picker mode.
     * Invalid values are ignored.
     * @param {'time'|'hours'|'spin'|'date'|'custom'} val a valid string
     */
    set mode(val) {
        const validMode = String(val).toLowerCase().trim();
        if (!['time','hours','spin','date','custom'].includes(validMode)) return;
        this.#mode = validMode;
    }

    #onCustomModeReturn = 'value';
    get onCustomModeReturn() { return this.#onCustomModeReturn; }
    /**
     * Defines what kind of value will be returned in custom mode.
     *  @param {'text'|'value'|'object'} val a valid string
     */
    set onCustomModeReturn(val) {
        const valid = String(val).toLowerCase().trim();
        if (['text','value','object'].includes(valid)) this.#onCustomModeReturn = valid;
    }

    #wrap = true;
    get wrap() {  return this.#wrap; }
    set wrap(flag) {
        // if (this.mode === 'spin') this.#wrap = this.toBoolean(flag);
        // for debugging we allow all modi:
        this.#wrap = this.toBoolean(flag);
    }

    #step = 1;
    get step() { return this.#step; }
    /**
     * Sets the step configuration for the wheel picker.
     *
     * Behavior depends on the current mode:
     *
     * - **time**:
     *     - Numeric values are interpreted as minute steps (0..59).
     *     - Fractional hour values such as "0.5" or "0,25" are converted
     *       to minutes (0.5h → 30m, 0.25h → 15m).
     *
     * - **hours**:
     *     - Numeric values are used directly as hour-steps (e.g. 0.25, 0.5, 1).
     *
     * - **spin/custom**:
     *     - `step` may be:
     *         • a number → numeric step
     *         • an array → explicit value list
     *         • a CSV string → value list ("A,B,C" or "1, 2, 3")
     *     - Numeric values fall through to the shared numeric branch.
     *
     * Invalid values are ignored silently.
     *
     * @param {number|string|Array<string|number>} val
     */
    set step(val) {
        if (val == null) return;

        const mode = this.#mode;
        const applyNumeric = (num, mode) => {
            if (['hours', 'spin'].includes(mode)) return num;
            if (mode === 'time') {
                // interpret as minutes 0..59
                let minutes = Math.round(num);
                return (minutes < 0) ? 0 : (minutes > 59) ? 59 : minutes;
            }
        };

        // Special cases for spin/custom (arrays, CSV strings)
        if (mode === 'spin' || mode === 'custom') {
            // 1) Arrays: use directly as a value list
            if (Array.isArray(val)) {
                const list = val
                    .map(v => typeof v === 'string' ? v.trim() : v)
                    .filter(v => v !== '' && v != null);

                if (list.length) this.#step = list;
                return;
            }
            // 2) Strings that are NOT a simple number → interpret as CSV list
            if (typeof val === 'string') {
                const num = Number(val.replace(',', '.')); // "0,5" → 0.5

                // If not a valid number → try CSV
                if (!Number.isFinite(num)) {
                    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
                    if (!parts.length) return;
                    const list = parts.map(p => {
                        const n = Number(p.replace(',', '.'));
                        return Number.isFinite(n) ? n : p;
                    });
                    if (list.length) this.#step = list;
                    return;
                }
            }
        } else if (mode === 'time' || mode === 'hours') {
            // Special case: fractional hours for minute stepping
            // HTML: step="0,5" / step="0.25" JS:   step = 0.5
            let frac;
            if (typeof val === 'string' && /[.,]/.test(val)) {
                const num = Number(val.replace(',', '.'));
                if (Number.isFinite(num) && num > 0) frac = num;
            } else if (typeof val === 'number' && val > 0 && val < 1) {
                frac = val;
            }
            if (frac) {
                this.#step = applyNumeric(frac * 60, mode); // 0.25h → 15min etc.
                return; // important!
            }
        }

        if (typeof val === 'string' || typeof val === 'number') {
            const num = (typeof val === 'number') ? val : Number(val.replace(',', '.')); // "0,5" → 0.5
            if (!Number.isFinite(num) || num <= 0) return;
            this.#step = applyNumeric(num, mode);
        }
    }

    #min = 0;
    /** @returns {number} */
    get min() { return this.#min; }
    /**
     * Sets the minimum value for the picker.
     *
     * - Accepts number or string (e.g. "0", "-5", "1,5").
     * - Ignores null/undefined and invalid numbers.
     * - Negative values are allowed if explicitly provided.
     *
     * @param {number|string|null} val
     */
    set min(val) {
        if (val == null) return;
        let n;
        if (typeof val === 'number') {
            n = val;
        } else if (typeof val === 'string') {
            n = Number(val.replace(',', '.'));
        } else {
            return;
        }

        if (!Number.isFinite(n)) return;

        this.#min = n;
    }

    #max = Infinity;
    /** @returns {number} */
    get max() { return this.#max; }
    /**
     * Sets the maximum value for the picker.
     *
     * - Accepts number or string (e.g. "12", "12,5").
     * - Ignores null/undefined and uses a sensible default:
     *     • in modes "time" and "hours" → 23
     *     • in other modes              → Infinity
     * - In modes "time" and "hours" values above 23
     *   are clamped down to 23.
     *
     * @param {number|string|null} val
     */
    set max(val) {
        // null/undefined → default per mode
        if (val == null) {
            if (['time', 'hours'].includes(this.#mode)) {
                this.#max = 23;
            } else {
                this.#max = Infinity;
            }
            return;
        }

        let num;
        if (typeof val === 'number') {
            num = val;
        } else if (typeof val === 'string') {
            const parsed = Number(val.replace(',', '.'));
            // invalid string (e.g. "foo") → treat as "no max" → Infinity
            num = Number.isFinite(parsed) ? parsed : Infinity;
        } else {
            // any other type → treat as "no max"
            num = Infinity;
        }

        if (['time', 'hours'].includes(this.#mode)) {
            // for time/hours: clamp to 23, and if Infinity or NaN → also 23
            if (!Number.isFinite(num) || num > 23) {
                this.#max = 23;
            } else {
                this.#max = num;
            }
        } else {
            // spin/custom: Infinity is a valid "unbounded" marker
            this.#max = num;
        }
    }

    #dataSource = null;
    get dataSource() { return this.#dataSource; }
    /**
     * Stores the raw data in custom mode.
     * @param {string|Array<string>|object|Array<object>|null} data can be one of the following types:
     *
     * - CSV string         → creates ONE wheel, comma separated values represent the items
     * - CSV string array   → creates "array.length" wheels (max. 4), items are CSV strings like before
     * - object             → creates ONE wheel: keys are displayed item captions, values represent the item value
     * - object array       → creates "array.length" wheels (max. 4)
     */
    set dataSource(data) {
        this.#dataSource = data;
    }

    #title = null;
    /**
     * Title resolving:
     *
     *  - If a title is explicit set this will be used as title for the picker
     *  - If the input element is connected to a label element (by for attribute or nested)
     *    the caption of the label element is used.
     */
    get title() {
        if (this.#title) return this.#title;
        const id = this.input.id;
        if (id) {
            const byFor = $(`label[for="${id}"]`);
            if (byFor) return byFor.textContent?.trim() || '';
        }
        const parent = this.input.parentElement;
        if (parent && parent.tagName === 'LABEL') {
            return parent.textContent?.trim() || '';
        }
        return '';
    }
    set title(caption) {
        if (caption && typeof caption == 'string') this.#title = caption;
    }

    /**
     * Returns the formatted value that would be written to the input.
     * For now this returns a string based on internal active values.
     * @returns {string}
     */
    get value() { return this.#formatValue(); }
    /**
     * Sets the value programmatically and syncs internal active values.
     * For now supports basic "time" (HH:MM) and "hours" ("7,50"/"7.50") formats.
     * @param {string} val
     */
    set value(val) {
        this.#parseExternalValue(val);
    }

    /** @type {Array<number>} */
    #activeValues = []; // per wheel
    /**
     * Returns the raw per-wheel values (e.g. [hour, minute] or [minutesTotal]).
     * @returns {Array<number>}
     */
    get values() { return [...this.#activeValues]; }

    /**
     * @returns {Boolean} flag, that tells us whether we are in infinite spin mode or not
     */
    get isInfiniteSpinner() { return (
        this.#mode === 'spin' &&
        this.#wrap === false &&
        !Number.isFinite(this.#max));
    }

    haptic = null;

    /**
     * @param {HTMLInputElement} input - The associated input element (type="text", role="wheel", readonly).
     * @param {Object} [options] - Optional configuration overrides.
     * @param {'time'|'hours'|'spin'|'date'|'custom'} [options.mode='time']
     * @param {number} [options.min]
     * @param {number} [options.max]
     * @param {number} [options.step]
     * @param {boolean} [options.wrap=true]
     * @param {string|Array<string>|object|Array<object>|null} [options.dataSource]
     * @param {'text'|'value'|'object'} [options.onCustomModeReturn]
     */
    constructor(input, options = {}) {
        super(input);
        if (!(input instanceof HTMLInputElement)) return;
        this.input = this.element = input;

        // read HTML attribute first
        this.mode = this.input.getAttribute('data-mode');
        this.min = this.input.getAttribute('min');
        this.max = this.input.getAttribute('max');
        this.step = this.input.getAttribute('step');
        this.wrap = this.input.getAttribute('data-wrap'); // for testing only now
        this.dataSource = this.input.getAttribute('data-source');

        // mode and data from options overrides HTML properties!
        if ('mode' in options) this.mode = options.mode;
        if ('min'  in options) this.min  = options.min;
        if ('max'  in options) this.max  = options.max;
        if ('step' in options) this.step = options.step;
        if ('wrap' in options) this.wrap = options.wrap;
        if ('dataSource' in options) this.dataSource = options.dataSource;
        if ('onCustomModeReturn' in options) this.onCustomModeReturn = options.onCustomModeReturn;

        // parsing a pre-set input value
        this.#parseExternalValue(this.input.value);
        this.haptic = new Haptic(this);
    }


    /**
     * Shows the picker overlay for this input.
     */
    show() {
        if (this.#overlay) return; // already open
        this.renderUI(document.body, true);
        this.haptic.activate();
        this.#overlay = this.DOM.divWheelOverlay; // Cache overlay root
        this.DOM.spnWheelTitle.textContent = this.title; // assign the title
        this.#columns = Array.from(this.DOM.divWheelTrack.querySelectorAll('.wheel-column'));
        this.visible = this.initWheels(this.mode);
        this.log(this);
    }

    /**
     * Creates the actual wheel datas according to the mode and other settings (min, max, step etc.)
     * @param {'spin'|'hours'|'time'|'date'|'custom'} mode a valid string value
     * @returns {boolean}
     * - true   → success
     * - false  → error
     */
    initWheels(mode) {
        //  IMPORTANT!  make measurable BEFORE wheels init/measure
        this.rootElement.removeAttribute('hidden');
        const columns = this.columns;
        // creation options for the wheel
        const makeOpts = (role, value) => ({
            role,
            min:  this.min,
            max:  this.max,
            step: this.step,
            wrap: this.wrap,
            value,
            stringTo: this.stringTo.bind(this),
            createElement: this.createElement.bind(this),
            onSnap: (payload) => this.#handleWheelSnap(payload),
            haptic: this.haptic // provide the haptic for each wheel!
        });

        if (mode === 'spin') {
            const opts = makeOpts(mode, this.#activeValues[0]);
            this.#wheels.push(new Wheel(columns[0], opts));
        } else if (mode === 'hours') {
            const opts = makeOpts('decimal', this.#activeValues[0]);
            this.#wheels.push(new Wheel(columns[0], opts));
        } else if (mode === 'time') {
            for (let i = 0; i < 2; i++) {
                const opts = makeOpts(['hours','minutes'][i], this.#activeValues[i]);
                this.#wheels.push(new Wheel(columns[i], opts));
            }
        } else if (mode === 'date') {
            for (let i = 0; i < 3; i++) {
                const opts = makeOpts(['day','month','year'][i], this.#activeValues[i]);
                this.#wheels.push(new Wheel(columns[i], opts));
            }
        } else if (mode === 'custom') {
            let data = this.dataSource, wheels = 1; // default
            if (data instanceof Array) {
                // NOTE : Array.prototype has been expanded: Array.prototype.isTypeOf
                /** On errors see at the END: class → {@link Library} */
                // LINK "./Library.js"
                if (data.isTypeOf('object')) {
                    wheels = Math.min(data.length, 4);
                } else {
                    data = Array.of(data); // creates "one item array" inside array for loop
                }
            } else {
                data = Array.of(data);
            }
            // create the wheels
            for (let i = 0; i < wheels; i++) {
                const opts = makeOpts(mode, this.#activeValues[i]);
                opts.dataSource = data[i];
                this.#wheels.push(new Wheel(columns[i], opts));
            }
        }
        // make sure that ALL wheels are valid!
        return this.wheels.every(whl => whl.initDone === true);
    }

    /**
     * Closes the picker overlay.
     * @param {boolean} [apply=false] - true to apply the current value to the connected input element.
     */
    hide(apply = false) {
        if (!this.#overlay) return;
        if (apply) {
            const newValue = this.#formatValue();
            if (this.#mode === 'custom') {
                if (this.onCustomModeReturn === 'text') this.input.value = newValue.captions;
                if (this.onCustomModeReturn === 'value') this.input.value = newValue.values;
                if (this.onCustomModeReturn === 'object') this.input.value = newValue;
            } else {
                this.input.value = newValue;
            }
            this._raiseEvent('input', {
                value: this.value,
                values: this.values,
                mode: this.mode}, false
            );
        } else {
            this._raiseEvent('cancel', {previousValue: this.input.value}, false);
            // no data available for the WheelPicker!
            // set the focus to the input element!
            if (!this.visible) {
                this.input.removeAttribute('readonly');
                this.input.focus();
            }
        }
        if (this.haptic) this.haptic.stop();
        this.#overlay.remove();
        this.#overlay = null;
        this.#columns = [];
        this.#activeValues = [];
    }

    /**
     * Eventhandler of the component handles the close button and the OK confirmation
     * @param {event} e pointerevent
     */
    onPointerDown(e) {
        e.preventDefault();
        if (e.target instanceof HTMLButtonElement) {
            const flag = (e.target === this.DOM.btnWheelOk);
            this.hide(flag);
        }
    }


    #parseExternalValue(strVal) {
        switch (this.#mode) {
            case 'time':
                const match = /^(\d{1,2}):(\d{2})$/.exec(strVal.trim());
                if (!match) {
                    this.#activeValues = [0, 0];
                    return;
                }
                let h = Number(match[1]);
                let m = Number(match[2]);
                if (!Number.isFinite(h)) h = 0;
                if (!Number.isFinite(m)) m = 0;
                h = Math.max(0, Math.min(23, h));
                m = Math.max(0, Math.min(59, m));
                this.#activeValues = [h, m];
                return;

            case 'hours':
                // accept '7,50' / '7.50'
                const hrs = Number(strVal.replace(',', '.'));
                if (!Number.isFinite(hrs) || hrs < 0) {
                    this.#activeValues = [0];
                    return;
                }
                const maxHours = this.#max ?? 23;
                const clamped = Math.min(maxHours, hrs);
                this.#activeValues = [Math.round(clamped * 60)]; // store minutes
                return;

            case 'spin':
                const normalized = String(strVal).replace(',', '.').trim();
                const no = Number(normalized);
                if (!Number.isFinite(no)) {
                    this.#activeValues = [this.#min];
                    return;
                }
                const max = isFinite(this.#max) ? this.#max : no; // spinner: wrap = false
                const clamp = Math.min(Math.max(no, this.#min), max);
                this.#activeValues = [clamp];
                return;

            case 'date':
                const today = new Date();
                const startYear = today.getFullYear() - 50;

                // parse date value from string
                const parsed = this.#parseDate(strVal);

                let year = Number.isFinite(parsed.year) ? parsed.year : today.getFullYear();
                year = Math.max(startYear, Math.min(startYear + 100, year));

                let month = Number.isFinite(parsed.month) ? parsed.month : today.getMonth() + 1;
                month = Math.max(1, Math.min(12, month));

                let day = Number.isFinite(parsed.day) ? parsed.day : today.getDate();
                const lastDay = this.#getDaysOfMonth(month, year);
                day = Math.max(1, Math.min(lastDay, day));

                this.#activeValues = [day, month, year];
                return;

            case 'custom':
                // Normalize incoming value string
                const raw = (strVal ?? '').trim();

                // Helper: get "first value" per wheel from dataSource
                const getDefaultsFromSource = () => {
                    const src = this.dataSource; // getter (raw/original)
                    if (src == null) return [];  // no source -> no defaults possible here

                    // 1 Wheel: CSV string in data-source
                    if (typeof src === 'string') {
                        const arr = src.split(',').map(s => s.trim()).filter(Boolean);
                        return arr.length ? [arr[0]] : [];
                    }

                    // 1 Wheel: Array
                    if (Array.isArray(src)) {
                        const first = src.find(v => v != null && String(v).trim() !== '');
                        return (first != null) ? [typeof first === 'string' ? first.trim() : first] : [];
                    }

                    // 1 Wheel: Object map {text:value}
                    if (src && typeof src === 'object') {
                        const keys = Object.keys(src);
                        return keys.length ? [keys[0]] : []; // default = first key text
                    }
                    return [];
                };

                // A) If no value provided -> always default to first element of source
                if (!raw) {
                    const defaults = getDefaultsFromSource();
                    this.#activeValues = defaults.length ? defaults : [];
                    return;
                }

                // B) Multi-wheel value via separator (e.g. "A|B|C")
                if (raw.includes('|')) {
                    this.#activeValues = raw.split('|').map(s => s.trim());
                    return;
                }

                // C) JSON support (server-friendly)
                if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            this.#activeValues = parsed.map(v => (typeof v === 'string' ? v.trim() : v));
                            return;
                        }
                        if (parsed && typeof parsed === 'object') {
                            // deterministic: keep key order as given by JSON.parse (usually insertion),
                            // or sort if you prefer.
                            this.#activeValues = Object.values(parsed).map(v => (typeof v === 'string' ? v.trim() : v));
                            return;
                        }
                    } catch { /* fall through */ }
                }

                // D) Single wheel: value is a single token ("Samstag")
                this.#activeValues = [raw];
                return;
            default:
        }
    }

    /**
     * Parses a given date string. Supports date formats like:
     *
     * - "dd.mm.yyyy" | "d.m.yyyy"
     * - "yyyy-mm-dd" | "yyyy-mm-d"
     * - other valid browser formats
     *
     * @param {string} expression the date string to be parsed
     * @returns {object} {day: 'dd', month: 'mm', year: 'yyyy'}
     */
    #parseDate(expression) {
        const str = expression?.trim();
        // "dd.mm.yyyy" | "d.m.yyyy"
        let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(str);
        if (m) {
            const dd = Number(m[1]);
            const mm = Number(m[2]);
            const yyyy = Number(m[3]);
            if (Number.isFinite(dd) && Number.isFinite(mm) && Number.isFinite(yyyy)) {
                return { day: dd, month: mm, year: yyyy };
            }
        }
        // "yyyy-mm-dd" | "yyyy-mm-d"
        m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
        if (m) {
            const yyyy = Number(m[1]);
            const mm = Number(m[2]);
            const dd = Number(m[3]);
            if (Number.isFinite(dd) && Number.isFinite(mm) && Number.isFinite(yyyy)) {
                return { day: dd, month: mm, year: yyyy };
            }
        }
        // Fallback: Date.parse (let try the browser)
        const dt = Date.parse(str);
        const dtDefault = Number.isNaN(dt) ? new Date() : new Date(dt);
        return {
            day: dtDefault.getDate(),
            month: dtDefault.getMonth() + 1,
            year: dtDefault.getFullYear()
        };
    }


    #getDaysOfMonth(month, year) {
        return new Date(year, month, 0).getDate();
    }


    /**
     * @private Called by a Wheel when it has snapped to a stable value
     */
    #handleWheelSnap(payload) {
        this.#activeValues = this.#wheels.map(whl => whl.value);
        // validate the day-wheel when we are in date-mode
        if (this.mode === 'date') {
            const [dayWheel, monthWheel, yearWheel] = this.#wheels;
            const lastDayOfMonth = new Date(yearWheel.value, monthWheel.value, 0).getDate();

            // TODO
            // REVIEW evl. neu-rendern des dayWheels...!
            dayWheel.items.forEach(item => item.toggleAttribute('disabled', (item.value > lastDayOfMonth)));

            // correct if current day is greater than days of the month
            if (dayWheel.value > lastDayOfMonth) dayWheel.snapToValue(lastDayOfMonth);
        }
    }

    /**
     * @private Formats the selected value for the output.
     * @param {'time'|'hours'|'spin'|'date'|'custom'} mode a valid string value
     */
    #formatValue(mode = this.#mode) {
        switch (mode) {
            case 'time':
                const [h, m] = this.#coerceValue(mode);
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2,'0')}`;

            case 'hours':
                const hours = this.#coerceValue(mode) / 60;
                return hours.toFixed(2).replace('.', ',');

            case 'spin':
                return String(this.#coerceValue(mode));

            case 'date':
                const [dd, mm, yyyy] = this.#coerceValue(mode);
                return `${String(dd).padStart(2, '0')}.${String(mm).padStart(2,'0')}.${String(yyyy)}`;

            case 'custom':
                let retVal = {captions: [], values: []};
                for (let i = 0; i < this.wheels.length; i++) {
                    retVal.captions[i] = this.wheels[i].activeItem.textContent;
                    retVal.values[i] = this.wheels[i].value;
                }
                return retVal;
            default:
                this.log(`.#formatValue: illegal mode "${mode}"`,'warn');
        }
    }

    /**
     * @private Ensures the value is in a valid range
     * @param {'time'|'hours'|'spin'|'date'|'custom'} mode a valid string value
     */
    #coerceValue(mode) {
        switch (mode) {
            case 'time':
                if (!Array.isArray(this.#activeValues) || this.#activeValues.length < 2 ) return [0, 0];
                let [h, m] = this.#activeValues;
                if (!Number.isFinite(h)) h = 0;
                if (!Number.isFinite(m)) m = 0;
                h = Math.max(0, Math.min(23, h));
                m = Math.max(0, Math.min(59, m));
                return [h, m];

            case 'hours':
                if (!Array.isArray(this.#activeValues) || this.#activeValues.length < 1 ) return 0;
                let total = this.#activeValues[0];
                if (!Number.isFinite(total) || total < 0) total = 0;
                const maxMinutes = (this.#max ?? 23) * 60;
                return Math.min(maxMinutes, total);

            case 'spin':
                if (!Array.isArray(this.#activeValues) || this.#activeValues.length < 1) return this.#min;
                let v = this.#activeValues[0];
                if (!Number.isFinite(v)) v = this.#min;
                const max = Number.isFinite(this.#max) ? this.#max : Infinity;
                if (v < this.#min) v = this.#min;
                if (v > max) v = max;
                return v;

            case 'date':
                if (!(this.#activeValues instanceof Array) || this.#activeValues.length < 3) {
                    const today = new Date();
                    return [today.getDate(), today.getMonth() + 1, today.getFullYear()];
                }
                let [day, month, year] = this.#activeValues;
                return [day, month, year];

            case 'custom:':
                return; // do nothing...

            default:
                this.log(`.#coerceValue: illegal mode "${mode}"`,'warn');
        }
    }
}