import $ from '../utils.js';
import { isHoliday as _isHoliday, getEasterSunday, getFirstDayOfISOWeek, OBJ_HOLIDAYS } from '../dateutils.js';
import Library from './Library.js';

/**
 * @file Calendar.js
 * @module Calendar
 * @extends Library
 * @version 1.0.0
 * @author Jens-Olaf-Mueller
 *
 * Calendar - A universal, localized month-view calendar component.
 * ===============================================================
 *
 * Displays a grid-based month view with week numbers, holidays, and integrated settings.
 * - Key Features:
 * - Localized View: Supports internationalization for weekdays and month names via `country` codes.
 * - Holiday Support: Highlights holidays (DACH region) using internal date utilities.
 * - Persistency: Saves and loads user preferences like country and year-picker visibility from localStorage.
 * - Collapsible UI: Features an animated dropdown and settings overlay.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link update}             - Renders the current month into the calendar body grid.
 * - {@link dateAdd}            - Adds a specified number of days to a date.
 * - {@link getEasterSunday}    - Calculates Easter Sunday for a given year.
 * - {@link isHoliday}          - Checks if a specific date is a holiday in the given state/country.
 * - {@link getISOWeek}         - Calculates the ISO week number for a date.
 * - {@link getFirstDayOfISOWeek} - Returns the Monday of a specific ISO week.
 * - {@link toggleOpen}         - Toggles the collapsed/expanded state of the calendar.
 * - {@link toggleSettings}     - Switches between the calendar view and the settings menu.
 * - {@link updateStates}       - Updates the state/region dropdown based on the selected country.
 * - {@link onHeaderClick}      - Handles month and year navigation via header buttons.
 * - {@link onBodyClick}        - Handles selection of dates and week numbers in the body grid.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #loadSettings()            - Retrieves stored user settings from localStorage.
 * - #saveSettings()            - Persists current settings to localStorage.
 * - #changeDatePart()          - Logic for shifting months or years.
 * - #showFullDate()            - Formats and displays the selected date in the footer.
 * - #startOfWeek()             - Calculates the Monday of the week containing a specific date.
 * - #applyOpenState()          - Handles the CSS transitions for expanding/collapsing the component.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event calendarupdate {@link CalendarUpdateEvent} - Fires when the displayed month or year is changed.
 * @event ondateclick {@link CalendarDateEvent}      - Fires when a specific date cell is clicked.
 * @event onweekclick {@link CalendarWeekEvent}      - Fires when a week number cell is clicked.
 * @event expand {@link CalendarEvent}               - Fires when the calendar is opened.
 * @event collapse {@link CalendarEvent}             - Fires when the calendar is closed.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * All variables are prefixed with '--cal-' and follow kebab-case naming.
 * - --cal-background-color     - Main background of the calendar component.
 * - --cal-text-color           - Default text color for labels and dates.
 * - --cal-header-color         - Background color for the month/year navigation bar.
 * - --cal-footer-color         - Background color for the date display at the bottom.
 * - --cal-highlight-color      - Background color for current date or hovered cells.
 * - --cal-accent-color         - Primary accent color (e.g. for the selected date).
 * - --cal-sunday-color         - Text color for Sundays and holidays.
 * - --cal-disabled-color       - Color for dates outside the current month.
 * - --cal-calendar-drop-size   - Size of the dropdown toggle button.
 */
export class Calendar extends Library {
    #country = 'de-CH';
    get country() { return this.#country; }
    set country(value) {
        if (typeof value === 'string') this.#country = value;
    }

    #state = 'Zug';
    get state() { return this.#state; }
    set state(value) {
        if (typeof value === 'string') this.#state = value;
    }

    #currentDate = new Date();
    get currentDate() { return this.#currentDate; }
    set currentDate(date) {
        if (date instanceof Date) {
            this.#currentDate = date;
        } else if (typeof date === 'string') {
            // Format: 13.06.2024 → 2024-06-13
            this.#currentDate = new Date(date.replace(/(\d+)\.(\d+)\.(\d+)/, '$3-$2-$1'));
        } else {
            this.#currentDate = new Date();
        }
    }

    get weekday() { return this.currentDate.toLocaleString(this.#country, { weekday: 'long' }); }
    get month() { return this.currentDate.getMonth(); }
    get monthName() { return this.currentDate.toLocaleString(this.#country, { month: 'long' }); }
    get year() { return this.currentDate.getFullYear(); }
    get firstOfMonth() { return new Date(this.year, this.month, 1); }

    #showYear = true;
    get showYear() { return this.#showYear; }
    set showYear(flag) {
        this.#showYear = this.toBoolean(flag);
        // set effect to elements:
        this.DOM.divYearPicker.toggleAttribute('hidden', !this.#showYear);
        this.DOM.divMonthPicker.style.gridColumn = `1 / ${this.#showYear ? 6 : -1}`;
    }

    #open = false; // dropdown state (default: closed)
    get open() { return this.#open; }
    set open(flag) {
        const next = this.toBoolean(flag);
        if (next === this.#open) return;
        this.#open = next;
        this.DOM.inpCalendarFooter?.toggleAttribute('open', this.#open);
        this.#applyOpenState({ animate: true });
        const evtName = this.#open ? 'expand' : 'collapse';
        this._raiseEvent(evtName, { open: this.#open });
    }

    #showSettings = false;
    get showSettings() { return this.#showSettings; }
    set showSettings(flag) {
        this.#showSettings = this.toBoolean(flag);
        this.DOM.btnCalendarSettings?.toggleAttribute('hidden', !this.#showSettings);
    }

    #settingsOpen = false; // default
    #_collapsible = null;  // NEW: ref to wrapper
    #_dropBtn = null;      // NEW: ref to arrow button


    constructor(date = new Date(), parent = document.body, init = { country: 'de-CH', state: 'Zug' }) {
        super(parent);
        this.currentDate = date;
        // const { country = 'de-CH', state = 'Zug'} = init; // with destructoring...
        this.country = init.country ?? 'de-CH';
        this.state   = init.state   ?? 'Zug';
        if (!this.created) {
            this.renderUI(parent, true);
            this.#_collapsible = this.DOM.divCalendarCollapsible;
            this.#_dropBtn = this.DOM.btnCalendarDrop;
        }
        this.#loadSettings();
        this.update();
        this.#showFullDate(date);
        console.log(this);
    }

    /**
     * Render current month into calendar body grid
     */
    update() {
        const picker = this.DOM.divCalendarBody;
        picker.innerHTML = '';
        // Update captions
        this.DOM.h2_CalendarCaption.textContent = `Kalender ${this.year}`;
        this.DOM.h2_Month.textContent = `${this.firstOfMonth.toLocaleString(this.country,{ month: 'long' })}`;
        this.DOM.h2_Year.textContent = `${this.year}`;

        // Start at first visible date (Monday of first row)
        let datum = this.#startOfWeek(this.firstOfMonth);

        for (let d = 0; d < 56; d++) {
            const cell = this.createElement('div', { class: 'calendar-cell' });
            picker.appendChild(cell);
            if (d < 8) {
                // Header row
                if (d === 0) {
                    cell.textContent = 'KW';
                } else {
                    const dt = new Date(datum);
                    dt.setDate(dt.getDate() + d - 1);
                    cell.textContent = dt.toLocaleString(this.country, {weekday: 'short'});
                }
                cell.setAttribute('data-column','');
            } else if (d % 8 === 0) {
                // Week number
                this.createElement(cell, {
                    textContent: this.getISOWeek(datum),
                    'data-week': this.getISOWeek(datum),
                });
            } else {
                // Day cell
                cell.textContent = datum.getDate();
                cell.dataset.date = datum.toLocaleDateString(this.country);

                if (datum.getMonth() !== this.month)
                    cell.setAttribute('disabled', '');
                if (datum.toDateString() === new Date().toDateString())
                    cell.classList.add('current-day');

                const holiday = this.isHoliday(datum);
                if (holiday && !cell.hasAttribute('disabled')) {
                    cell.classList.add('sunday');
                    cell.dataset.holiday = holiday;
                }
                datum = this.dateAdd(1, datum);
            }
        }

        this.cells = $('.calendar-cell[data-date]', true); // update cells
    }

    /**
     * Adds a number of days to a date (returns a new Date).
     * @param {number} days Days to add (can be negative)
     * @param {Date|string} date Base date or string (e.g. "13.06.2024")
     * @returns {Date} New Date
     */
    dateAdd(days, date) {
        if (!date) date = this.currentDate;
        if (typeof date === 'string') {
            date = new Date(date.replace(/(\d+)\.(\d+)\.(\d+)/, '$3-$2-$1'));
        }
        if (!(date instanceof Date)) date = new Date();
        const dtNew = new Date(date);
        dtNew.setDate(dtNew.getDate() + days);
        return dtNew;
    }

    /**
     * Calculate Easter Sunday for a given year.
     * Algorithm by Oudin (1940).
     * @param {number} year
     * @returns {Date}
     */
    getEasterSunday(year) {
        return getEasterSunday(year);
    }

    isHoliday(date, state = this.state, country = this.country) {
        return _isHoliday(date, state, country);
    }

    /**
     * Returns the ISO week number of a given date.
     * @param {Date} date
     * @returns {number} ISO week number
     */
    getISOWeek(date) {
        const dt = new Date(date.valueOf());
        dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
        const firstThursday = dt.valueOf();
        dt.setMonth(0, 1);
        if (dt.getDay() !== 4) {
            dt.setMonth(0, 1 + ((4 - dt.getDay() + 7) % 7));
        }
        return 1 + Math.ceil((firstThursday - dt) / 604800000);
    }

    /**
     * Returns the date of the Monday that starts a given ISO week in a specific year.
     */
    getFirstDayOfISOWeek(week, year = this.year) {
        return getFirstDayOfISOWeek(week, year);
    }

    // Event set in OBJ_COMPONENTS !!!
    toggleOpen(e) {
        this.open = !this.open; // triggers animation
        // keep aria-expanded up to date
        const btn = e?.currentTarget || this.DOM?.btnCalendarDrop;
        if (btn) btn.setAttribute('aria-expanded', String(this.open));
    }

    // NEW
    toggleSettings() {
        const wrap = this.DOM.divCalendarCollapsible;
        // Falls der Kalender geschlossen ist, öffne ihn zuerst
        if (!this.#open) {
            wrap.setAttribute('data-wasclosed', true);
            this.open = true;
        }
        // make sure we don't hide the whole calendar!
        this.DOM.btnCalendarDrop.toggleAttribute('hidden');

        const fullHeight = wrap.scrollHeight;        // aktuelle volle Kalenderhöhe
        this.DOM.divCalendarSettings.style.minHeight = `${fullHeight}px`;
        // Dann den internen Settings-Zustand toggeln
        this.#settingsOpen = !this.#settingsOpen;
        this.DOM.btnCalendarSettings.classList.toggle('is-open', this.#settingsOpen);
        const showSettings = this.#settingsOpen;
        const settings = this.DOM.divCalendarSettings;
        const head  = this.DOM.divCalendarHead;
        const body  = this.DOM.divCalendarBody;
        const footer= this.DOM.inpCalendarFooter;

        // per zIndex / hidden umschalten
        settings.style.zIndex = showSettings ? 5 : '';
        settings.toggleAttribute('hidden', !showSettings);
        [head, body, footer].forEach(elmt => elmt?.toggleAttribute('hidden', showSettings));

        // close settings:
        if (showSettings === false) {
            settings.style.minHeight = '';
            this.#saveSettings();
            this.#loadSettings(); // immediately apply!
            if (wrap.hasAttribute('data-wasclosed')) {
                wrap.removeAttribute('data-wasclosed');
                this.open = false;
            } else {
                this.open = true;
            }
        }
    }

    #loadSettings() {
        try {
            const data = JSON.parse(localStorage.getItem('CalendarSettings')) || {};
            if (data.country) this.country = data.country;
            if (data.state) this.state = data.state;
            this.DOM.selCountry.value = this.country;
            this.updateStates(this.country);
            if (typeof data.showYear === 'boolean') this.showYear = data.showYear;
            this.DOM.chkShowYearPicker.checked = this.showYear;
            if (typeof data.startOpened === 'boolean') this.open = data.startOpened;
            this.DOM.chkStartOpened.checked = this.open;
        } catch { /* ignore */ }
    }

    #saveSettings() {
        const data = {
            country: this.DOM.selCountry.value,
            state: this.DOM.selState.value,
            showYear: this.DOM.chkShowYearPicker.checked,
            startOpened: this.DOM.chkStartOpened.checked,
        };
        localStorage.setItem('CalendarSettings', JSON.stringify(data));
    }

    onHeaderClick(e) {
        const btn = e.target.closest('button');
        if (!btn || !this.DOM.divCalendarHead.contains(btn)) return;
        const offset = Number(btn.value) || 0;

        if (btn.id.includes('Month')) this.#changeDatePart(offset, 'month'); // month buttons clicked...
        if (btn.id.includes('Year')) this.#changeDatePart(offset, 'year');   // year buttons clicked...
    }


    #changeDatePart(offset = 0, part = 'month') {
        const prev = this.currentDate;
        if (part === 'month') this.currentDate.setMonth(this.month + offset);
        if (part === 'year') this.currentDate.setFullYear(this.year + offset);
        this.update();
        this._raiseEvent('calendarupdate', {
            date: this.currentDate,
            previousDate: prev,
            week: this.getISOWeek(this.currentDate),
        });
    }

    updateStates(e) {
        const keyObj = (e instanceof Event) ? OBJ_HOLIDAYS[e.target.value] : OBJ_HOLIDAYS[e];
        const states = Object.keys(keyObj)
            .filter(k => k !== 'global')
            .map(k => this.stringTo(k, 'camel-dash'))
            .sort((a, b) => a.localeCompare(b));
        const list = this.DOM.selState;
        list.innerHTML = '';
        // Optionen generieren
        states.forEach(key => {
            const opt = this.createElement('option', {text: key});
            list.appendChild(opt);
        });
        list.value = this.state;
        if (list.value == '') list.selectedIndex = 0;
    }

    onBodyClick(e) {
        let cell = e.target.closest('.calendar-cell[data-date]');
        const week = e.target.closest('.calendar-cell[data-week]');

        if (week) {
            const weekNo = Number(week.dataset.week);
            const monday = this.getFirstDayOfISOWeek(weekNo);
            this._raiseEvent('onweekclick', {
                week: weekNo,
                firstDay: monday,
                lastDay: this.dateAdd(6, monday),
            });
        } else if (cell) {
            const dtString = cell.dataset.date.replace(/(\d+)\.(\d+)\.(\d+)/, '$2/$1/$3');
            const date = new Date(dtString);
            // if another month (or year!) was clicked...
            let diff = date.getMonth() - this.currentDate.getMonth(); // difference (positive or negative)
            if (diff) {
                // year has also changed by cell-click: December ---> January
                if (Math.abs(diff) > 1) this.#changeDatePart( diff > 1 ? diff - 12 : diff + 12, 'year');
                this.#changeDatePart(diff);
                cell = this.cells.find((c) =>
                    c.dataset.date.replace(/(\d+)\.(\d+)\.(\d+)/, '$2/$1/$3') === dtString
                );
            }
            this.cells.forEach((day) => day.classList.remove('date-selected'));
            cell.classList.add('date-selected');
            this.#showFullDate(date);

            this._raiseEvent('ondateclick', {
                date,
                dateString: dtString,
                day: date.getDate(),
                month: date.getMonth(),
                year: date.getFullYear(),
                week: this.getISOWeek(date),
                weekday: date.toLocaleString(this.#country, { weekday: 'long' }),
                monthName: date.toLocaleString(this.#country, { month: 'long' }),
                holiday: cell.dataset.holiday || ''
            });
        }
    }

    /**
     * Displays the full date on the footer including holiday name if one
     */
    #showFullDate(date) {
        const day = date.toLocaleString(this.country, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        const holiday = this.isHoliday(date) ? `, ${this.isHoliday(date)}` : '';
        this.DOM.inpCalendarFooter.value = day + holiday;
        //synchronisze input event for possible form handling
        this.DOM.inpCalendarFooter.dispatchEvent( new Event('input', { bubbles: true }) );
    }

    #startOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    /**
     * Applies the open/closed state to the collapsible area.
     * @param {{animate: boolean}} options
     * @private
     */
    #applyOpenState({ animate = true } = {}) {
        const box = this.#_collapsible;
        const btn = this.#_dropBtn;
        if (!box || !btn) return;

        btn.classList.toggle('is-open', this.#open);
        btn.setAttribute('aria-expanded', String(this.#open));

        const start = this.#open ? 0 : box.scrollHeight;
        const end = this.#open ? box.scrollHeight : 0;

        if (!animate) box.style.transition = 'none';
        box.style.maxHeight = `${start}px`;

        requestAnimationFrame(() => {
            box.style.maxHeight = `${end}px`;
            if (!animate) requestAnimationFrame(() => box.style.transition = '');
        });

        box.addEventListener('transitionend',() => {
                box.style.maxHeight = this.#open ? `${box.scrollHeight}px` : '0px';
                box.style.overflow = this.#open ? 'visible' : 'hidden';
            }, { once: true }
        );
    }
}

/**
 * @typedef {Object} CalendarEvent
 * @property {boolean} open - Whether the calendar is opened or not
 */

/**
 * @typedef {Object} CalendarUpdateEvent
 * @property {Date} date - The newly selected/displayed date.
 * @property {Date} previousDate - The date before the update.
 * @property {number} week - ISO week of the new date.
 */

/**
 * @typedef {Object} CalendarDateEvent
 * @property {Date} date - Selected Date object.
 * @property {string} dateString - Localized date string.
 * @property {number} day - Day of the month.
 * @property {number} month - Zero-based month index.
 * @property {number} year - Full year.
 * @property {number} week - ISO week number.
 * @property {string} weekday - Full name of the weekday.
 * @property {string} monthName - Full name of the month.
 * @property {string} holiday - Name of the holiday (if any).
 */

/**
 * @typedef {Object} CalendarWeekEvent
 * @property {number} week - The clicked ISO week number.
 * @property {Date} firstDay - Monday of the selected week.
 * @property {Date} lastDay - Sunday of the selected week.
 */