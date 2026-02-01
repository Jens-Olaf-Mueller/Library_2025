import { NOT_FOUND } from '../constants.js';

/**
 * @file WheelGenerator.js
 * @module ListGenerator
 * @version 1.0.1
 * @author Jens-Olaf-Mueller
 *
 * WheelGenerator — Parent class and logic engine for {@link Wheel}.
 * ===============================================================
 *
 * Lightweight helper that manages a <ul> list inside a column and handles the mathematical generation of wheel items.
 * - Key Features:
 *   - DOM Management: Creates, appends, and removes <li> items with specialized classes like `.wheel-item--active`.
 *   - Versatile Generators: Includes dedicated builders for:
 *     - 'spin',
 *     - 'decimal',
 *     - 'hours',
 *     - 'minutes',
 *     - 'date',
 *     - 'custom' wheels.
 *   - Precision Logic: Handles floating-point corrections and step-based rounding for numeric wheels.
 *   - Custom Data Mapping: Converts CSV strings, arrays, or objects into displayable wheel captions and values.
 *
 * ---------------------------------------------------------------
 * I. Public API
 * ---------------------------------------------------------------
 * - {@link column}      - Read-only reference to the owning column container.
 * - {@link list}        - Shorthand reference to the underlying <ul> element.
 * - {@link items}       - Returns an array of current <li> elements.
 * - {@link itemsCount}  - Returns the number of items currently in the list.
 * - {@link activeItem}  - Returns the currently active <li> ('.wheel-item--active').
 * - {@link value}       - Returns the parsed value of the active item (number or string).
 * - {@link addItem}     - Creates and appends a new <li> item at a specific position.
 * - {@link removeItem}  - Removes an item by index or by exact text match.
 * - {@link getItem}     - Retrieves an item by its index or text content.
 * - {@link clear}       - Removes all items from the list.
 *
 * ---------------------------------------------------------------
 * II. Internal / Helper Methods
 * ---------------------------------------------------------------
 * - {@link _createListItem} - Creates a wheel <li> element via an injected `createElement` factory.
 * - {@link _getWheelConfig} - Resolves and executes the appropriate builder based on the wheel's role.
 *
 * ---------------------------------------------------------------
 * III. Private Methods (Builders)
 * ---------------------------------------------------------------
 * - #buildSpinWheel()    - Generates values for numeric spinners, supporting open-ended max values.
 * - #buildDecimalWheel() - Builds minute-based wheels for decimal-hour representation.
 * - #buildHoursWheel()   - Generates a standard 00–23 hour list.
 * - #buildMinutesWheel() - Generates minute steps (0–59) with optional padding for small lists.
 * - #buildDateWheel()    - Builds numeric ranges for day, month (localized), or year wheels.
 * - #buildCustomWheel()  - Parses custom data sources into captions and internal values.
 * - #coerceValue()       - Normalizes and clamps input values based on the specific wheel role.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * This logic class does not provide CSS variables. Theming is managed by the `WheelPicker`.
 */
export class WheelGenerator {

    createElement;

    #column = null;
    get column() { return this.#column; }

	#list = null;
    /**
	 * Shorthand property for the underlying <ul>.
	 * @returns {HTMLUListElement}
	 */
	get list() { return this.#list; }

	/**
	 * Array of <li> items (this.list.children).
	 * @returns {HTMLCollectionOf<HTMLLIElement>}
	 */
	get items() { return this.list ? Array.from(this.list.children) : []; }

	/**
	 * Number of items currently in the list.
	 * @returns {number}
	 */
	get itemsCount() { return this.list ? this.items.length : 0; }

    /**
     * Returns the current active item.
     * @returns {HTMLLIElement|null}
     */
    get activeItem() { return this.list.querySelector('.wheel-item--active') || null; }

    /**
     * Returns the current value of a wheel.
     * @returns {number|string|undefined} a numeric value or a numeric string or undefined
     */
    get value() {
        if (this.activeItem) {
            const strVal = this.activeItem.getAttribute('value'),
                  value = strVal.replace(',','.');
            if (isNaN(Number(value))) return strVal;
            return Number(value);
        }
        return undefined;
    }


    /**
     * @constructor ListGenerator
     * @param {HTMLElement | Class | null} column column that contains the actual <ul> list element
     * @param {object} [options] optional config
     * @param {function} [options.stringTo] Library function to convert string formats
	 */
	constructor(column, options) {
        this.#column = column;
		this.#list = column.firstChild;
        if ('stringTo' in options) this.stringTo = options.stringTo;
	}


	/**
	 * Adds a new <li> item at the end of the list.
	 *
	 * Default implementation:
	 *  - creates <li class="list-item"> with:
	 *      • value attribute = value
	 *      • textContent     = text (or value if text omitted)
	 *
	 * @param {string|number} value - Logical value for the item.
	 * @param {string} [text] - Optional display text (defaults to String(value)).
	 * @param {Record<string, any>} [attributes] - Optional extra attributes (e.g. dataset, className).
	 * @returns {HTMLLIElement} The newly created item.
	 */
	addItem(value, text, index = null, attributes = {}) {
        if (index === null) index = this.itemsCount;
        const li = this._createListItem(index, value, text, attributes);
		this.#list.appendChild(li);
		return li;
	}

	/**
	 * Removes an item by index or by text key.
	 *
	 * @param {number|string} key
	 * @returns {boolean} true if an item was removed, otherwise false.
	 */
	removeItem(key) {
		if (!this.list) return false;

		const item = this.getItem(key);
		if (!item) return false;

		this.list.removeChild(item);
		return true;
	}

	/**
	 * Returns an item by index or by text key.
	 *
	 * - numeric key: treated as index (0..itemsCount-1)
	 * - string key:  first item whose textContent.trim() equals key
	 *
	 * @param {number|string} key
	 * @returns {HTMLLIElement|null}
	 */
	getItem(key) {
		// numeric index
		if (typeof key === 'number') {
			if (key < 0 || key >= this.itemsCount) return undefined;
			return this.items[key];
		} else if (typeof key === 'string') {
            // string key: search by textContent
            const strKey = String(key).trim();
            for (const item of this.items) {
                if ((item.textContent || '').trim() === strKey) return item;
            }
        }
		return undefined;
	}

	/**
	 * Removes all items from the list.
	 */
	clear() {
		while (this.#list.firstChild) {
			this.#list.removeChild(this.#list.firstChild);
		}
	}

    /**
     * Private helper function.
     * // REVIEW attributes may overwrite core keys eventually
     *           solution: later allow "style" key only in attributes object
     *
     * Creates a list item for a wheel. Used from #loadWheels()
     * and when an endless spin requires a new item
     * @param {number} index the data-item number
     * @param {number|string} value the value of the created item
     * @param {string} text the displayed text for the user
     * @returns {HTMLListElement}
     */
    _createListItem(index, value, text = '', attributes = {}) {
        return this.createElement('li', Object.assign({
            className: 'wheel-item',
            'data-item': String(index),
            value: String(value),
            text
        }, attributes));
    }

    /**
     * Creates the configuration for the current wheel (child class)
     * @param {'spin'|'decimal'|'hours'|'minutes'|'day'|'month'|'year'|'custom'} role string value
     * @returns {object} the wheel configuration
     */
    _getWheelConfig(role) {
        switch (role) {
            case 'spin':  return this.#buildSpinWheel();
            case 'decimal': return this.#buildDecimalWheel();
            case 'hours': return this.#buildHoursWheel();
            case 'minutes':  return this.#buildMinutesWheel();
            case 'day':  return this.#buildDateWheel(role);
            case 'month':  return this.#buildDateWheel(role);
            case 'year':  return this.#buildDateWheel(role);
            case 'custom':return this.#buildCustomWheel(this.data);
            default:
                console.warn(`[Wheel.#getWheelConfig]: illegal role "${role}"`);
        }
    }

    #buildSpinWheel() {
        const EPS = 1e-9;
        const current = this.#coerceValue('spin');

        let end;
        if (Number.isFinite(this.max)) {
            // common spinner
            end = this.max;
            if (current > end) end = current;
        } else {
            // SPIN-INFINITY: wir brauchen nur bis current + 3*step
            end = current + 3 * this.step;
        }

        const values = [];
        for (let v = this.min; v <= end + EPS; v += this.step) values.push(v);

        // find active index (tolerant for floating-point errors)
        let activeIndex = values.findIndex(v => Math.abs(v - current) < EPS);

        // precision for formatting derived from step
        const step$ = String(this.step);
        const idx = step$.indexOf('.');
        const dec = idx >= 0 ? step$.length - idx - 1 : 0;

        return {
            values,
            length: values.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (val) => val.toFixed(dec).replace('.', ',')
        };
    }

    #buildDecimalWheel() {
        const min = Math.round(this.min * 60);
        const max = Math.round(this.max * 60);
        const values = [];

        for (let i = min; i <= max; i += this.step) { values.push(i); }
        let activeIndex = values.indexOf(this.#coerceValue('decimal'));

        return {
            values,
            length: values.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (minutes) => (minutes / 60).toFixed(2).replace('.', ',')
        };
    }

    #buildHoursWheel() {
        const hours = [];

        for (let h = 0; h < 24; h++) hours.push(h);
        let activeIndex = Math.max(0, Math.min(hours.length - 1, hours.indexOf(this.#coerceValue('hours'))));

        return {
            values: hours,
            length: hours.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (n) => String(n).padStart(2, '0')
        };
    }

    #buildMinutesWheel() {
        let minutes = [];
        for (let m = 0; m < 60; m += this.step) minutes.push(m);
        let activeIndex = minutes.indexOf(this.#coerceValue('minutes'));

        if (minutes.length && minutes.length < 7) {
            const baseLen = minutes.length;
            const padded = [];
            const center = Math.floor(7 / 2); // Index, der im Fenster mittig liegt
            for (let i = 0; i < 7; i++) {
                const offset = i - center;
                let idx = (activeIndex + offset) % baseLen;
                if (idx < 0) idx += baseLen;
                padded[i] = minutes[idx];
            }
            minutes = padded;
            activeIndex = center;
        } else {
            activeIndex = Math.max(0, Math.min(minutes.length - 1, activeIndex) );
        }

        return {
            values: minutes,
            length: minutes.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (n) => String(n).padStart(2, '0')
        };
    }

    #buildDateWheel(role) {
        const values = [];
        const year = new Date().getFullYear() - 50;
        const min = (role === 'year') ? year : 1;
        const max = (role === 'day') ? 32 : (role === 'month') ? 13 : year + 100;

        for (let i = min; i < max; i++) values.push(i);
        let activeIndex = values.indexOf(this.#coerceValue(role));

        return {
            values,
            length: values.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (n) => {
                return role === 'month'
                ? new Date(2000, n - 1).toLocaleString('de-DE', { month: 'long' })
                : String(n).padStart(2, '0')
            }
        };
    }

    #buildCustomWheel(data) {
        let values = [], captions = null;

        if (Array.isArray(data)) {
            values = data;
        } else if (typeof data === 'string') {
            values = data.split(',').map(s => s.trim()).filter(Boolean);
        } else if (data && typeof data === 'object') {
            captions = []
            for (const [key, value] of Object.entries(data)) {
                captions.push(this.stringTo(key,'caps'));
                values.push(value);
            }
        }

        let activeIndex = values.indexOf(this.activeValue);
        const wheelConfig = {
            values,
            length: values.length,
            activeIndex: (activeIndex === NOT_FOUND) ? 0 : activeIndex,
            format: (val) => String(val)
        }
        if (captions) wheelConfig.captions = captions; //assign only when data is an object
        return wheelConfig;
    }

    #coerceValue(role) {
        switch (role) {
            case 'hours':
                const hrs = Number.isFinite(this.activeValue) ? this.activeValue : 0;
                return  Math.max(0, Math.min(23, hrs));

            case 'minutes':
                const mins = Number.isFinite(this.activeValue) ? this.activeValue : 0;
                return  Math.max(0, Math.min(59, mins));

            case 'decimal':
                let total = this.activeValue;
                if (!Number.isFinite(total) || total < 0) total = 0;
                const maxMinutes = (this.max ?? 23) * 60;
                return Math.min(maxMinutes, total);

            case 'spin':
                let val = Number.isFinite(this.activeValue) ? this.activeValue : this.min;
                const max = Number.isFinite(this.max) ? this.max : Infinity;
                if (val < this.min) val = this.min;
                if (val > max) val = max;
                return val;

            case 'day':
                let day = Number.isFinite(this.activeValue) ? this.activeValue : 1;
                return Math.max(1, Math.min(31, day));

            case 'month':
                let month = Number.isFinite(this.activeValue) ? this.activeValue : 1;
                return Math.max(1, Math.min(12, month));

            case 'year':
                const thisYear = new Date().getFullYear();
                const minYear = thisYear - 50;
                const maxYear = thisYear + 50;

                let year = Number.isFinite(this.activeValue) ? this.activeValue : thisYear;
                if (year < minYear) year = minYear;
                if (year > maxYear) year = maxYear;
                return year;

            case 'custom':
                return;
            default:
                console.warn(`[Wheel.#coerceValue]: illegal role "${role}"`);
        }
    }
}