import { NOT_FOUND } from '../constants.js';

/**
 * =================================================================
 * ListGenerator — Generic list/collection helper for wheel-based UI
 * =================================================================
 *
 * Provides a reusable abstraction around a single <ul> element and its
 * <li> children. It exposes a small, VB6-Collection–like API that is used
 * by higher-level components (notably Wheel) to generate, access, and
 * manage list items in a consistent way.
 *
 * The class itself is UI-agnostic: it does not implement scrolling,
 * snapping, or interaction logic. Its sole responsibility is structured
 * creation, lookup, and removal of list items, plus delegation to
 * role-specific wheel configuration builders.
 *
 * Core responsibilities:
 * - manage a <ul> element and its <li> children
 * - provide indexed and text-based lookup
 * - create list items in a consistent, overridable way
 * - expose wheel configuration factories used by Wheel
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * addItem:             - creates and appends a new <li> item to the list
 * removeItem:          - removes an item by index or text key
 * getItem:             - retrieves an item by numeric index or text content
 * clear:               - removes all items from the list
 *
 * ---------------------------------------------------------------
 * II. Private / Internal Methods
 * ---------------------------------------------------------------
 * _createListItem:     - creates a single <li> element with value, text and attributes
 * _getWheelConfig:     - dispatches to the appropriate wheel-config builder by role
 *
 * #buildSpinWheel:     - builds configuration for numeric spinner wheels
 * #buildDecimalWheel: - builds configuration for decimal/hour-based wheels
 * #buildHoursWheel:   - builds configuration for hour wheels (0–23)
 * #buildMinutesWheel: - builds configuration for minute wheels with padding logic
 * #buildDateWheel:    - builds configuration for day/month/year wheels
 * #buildCustomWheel:  - builds configuration for custom data sources (array, CSV, object)
 * #coerceValue:       - normalizes incoming active values per role before building configs
 */
export class ListGenerator {

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
	get items() {
		return this.list ? Array.from(this.list.children) : [];
	}


	/**
	 * Number of items currently in the list.
	 * @returns {number}
	 */
	get itemsCount() {
		return this.list ? this.items.length : 0;
	}


    get activeItem() {
        return this.list.querySelector('.wheel-item--active') || null;
    }


    get value() {
        // return this.activeItem ? this.activeItem.value: undefined;
        if (this.activeItem) {
            const strVal = this.activeItem.getAttribute('value'),
                  value = strVal.replace(',','.');
            if (isNaN(Number(value))) return strVal;
            return Number(value);
        }
        return undefined;
    }


	constructor(column, options) {
        this.#column = column;
		this.#list = column.firstChild;
        if ('stringTo' in options) this.stringTo = options.stringTo;
	}


	// ---------------------------------------------------------------------
	// Collection-API
	// ---------------------------------------------------------------------

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
     *           solution: later allow "style" key only
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


    // ---------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------

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