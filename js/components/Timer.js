import Library from '../classes/Library.js';

/**
 * @file Timer.js
 * @module Timer
 * @version 2.0.0
 * @author Jens-Olaf-Mueller
 *
 * Timer — Autonomous WebComponent for time keeping and count downs.
 * ==============================================================================
 *
 * A compact, Shadow-DOM encapsulated Web Component (`<timer-box>`) that combines a
 * running clock with an independent countdown mechanism.
 * - Key Features:
 *   - Dual Mode: Operates as a standard clock ('time') or countdown timer ('countdown'), or switches automatically ('auto').
 *   - Batched Rendering: Uses `requestAnimationFrame` to decouple logic ticks from DOM updates for performance.
 *   - Encapsulation: Fully isolated style and markup via Shadow DOM, customizable via CSS variables.
 *   - Event-Driven: Dispatches composed CustomEvents (`timer`, `countdown`, `timeout`) that bubble through the shadow boundary.
 *
 * ---------------------------------------------------------------
 * I. Public API
 * ---------------------------------------------------------------
 * - {@link start}        - Starts the clock ticker.
 * - {@link stop}         - Stops the clock ticker.
 * - {@link reset}        - Resets the clock to the current system time.
 * - {@link countDown}    - Starts or stops a precise countdown based on a target duration.
 * - {@link setTime}      - Manually sets the internal clock time.
 * - {@link setAlertTime} - Sets a specific time at which the `timerexpired` event will fire.
 * - Properties: `mode`, `format`, `showHours`, `showMinutes`, `timeRemaining`.
 *
 * ---------------------------------------------------------------
 * II. Internal Logic
 * ---------------------------------------------------------------
 * - #createTemplate()    - Initializes the Shadow DOM structure and internal CSS.
 * - #render()            - Updates the display text; synchronized via `requestAnimationFrame`.
 * - #raiseEvent()        - Helper to dispatch CustomEvents with appropriate detail data.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event timer {Object}        - Fires on every second tick of the clock.
 * @event countdown {Object}    - Fires on every tick of the countdown with remaining time.
 * @event timeout {Object}      - Fires when the countdown reaches zero.
 * @event timerexpired {Object} - Fires when the clock reaches the configured alert time.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * - --timer-border   - Border style of the component host.
 * - --timer-bg       - Background color of the component.
 * - --timer-color    - Text color.
 * - --timer-font     - Font family used for the display.
 *
 * ---------------------------------------------------------------
 * V. ToDo / Technical Debt
 * ---------------------------------------------------------------
 * 1. Architecture Mismatch: The class imports `Library.js` but extends `HTMLElement`.
 * Refactor to either use a Mixin pattern or remove the Library dependency to make it a standalone Web Component.
 * 2. Clock Drift: The clock uses a simple `setInterval` counter (`#sec++`), which is prone to drift over time.
 * Unify logic to use `Date.now()` delta calculation similar to the countdown implementation.
 * 3. Alert Reliability: The current alert check uses strict equality (`===`) on seconds.
 * If the main thread lags, the exact second might be missed. Switch to timestamp comparison (`>=`).
 * 4. Reflection Logic: The attribute/property synchronization relies on manual guards (`#updatingFromCode`).
 * Refactor to standard Web Component patterns to avoid potential feedback loops.
 */
class Timer extends HTMLElement {
	#timerID = null;
	#countDownID = null;
	#countDownStart = 0;
	#countDownEnd = 0;
	#secRemaining = 0;

	#hrs = 0;
	#min = 0;
	#sec = 0;
	#startTime = new Date();
	#alertTimestamp = null;
    #alertTarget = null; // [h, m, s] – feuert 1x bei Gleichheit

	#mode = 'time';					// 'time' | 'countdown' | 'auto'
	#format = '24';					// '24' | '12' | 'intl'
	#displaySource = null;			// 'timer' | 'countdown' (used when mode === 'auto')
	#autostart = false;

	// visibility flags for hour and minute sections; default: true
	#showHours = true;
	#showMinutes = true;

	// rAF batching flags
	#renderPending = false;
	#needsRender = false;

	// Reentrancy/loop guard for attribute ↔ property synchronization
	#updatingFromCode = false;

	/**
	 * Optional alert time (formatted) for external inspection.
	 * @type {string|undefined}
	 */
	alertTime = undefined;

	/**
	 * Cached DOM references (filled in connectedCallback).
	 * @type {{divTimer?: HTMLDivElement}}
	 */
	DOM = {};

	/**
	 * Attributes that the component observes.
	 * @returns {string[]}
	 */
	static get observedAttributes() {
		return ['hidden', 'time', 'alert', 'countdown', 'hours', 'minutes', 'format', 'mode'];
	}

    	/**
	 * Returns the timer's internal interval id (or null).
	 * @type {number|null}
	 * @readonly
	 */
	get id() { return this.#timerID; }

	/**
	 * Current time format.
	 * - '24'   → 24-hour format (default)
	 * - '12'   → 12-hour format with AM/PM
	 * - 'intl' → localized output via Intl.DateTimeFormat
	 * @type {'24'|'12'|'intl'}
	 */
	get format() { return this.#format; }
	set format(val) {
		const v = String(val || '').toLowerCase();
		this.#format = (['24', '12', 'intl'].includes(v)) ? v : '24';
		this.#requestRender();
	}

	/**
	 * Display mode determining which value is shown in the component's single display.
	 * - 'time' → show clock
	 * - 'countdown' → show countdown
	 * - 'auto' → show whichever started first
	 * @type {'time'|'countdown'|'auto'}
	 */
	get mode() { return this.#mode; }
	set mode(val) {
		const v = String(val || '').toLowerCase();
		this.#mode = (['time', 'countdown', 'auto'].includes(v)) ? v : 'time';
		this.#displaySource = null; // reset auto decision
		this.#requestRender();
	}

	/**
	 * Whether the timer (clock) is currently running.
	 * @type {boolean}
	 * @readonly
	 */
	get isRunning() { return this.#timerID !== null; }

	/**
	 * Show minutes section in formatted output.
	 * @type {boolean}
	 */
	get showMinutes() { return this.#showMinutes; }
	set showMinutes(flag) {
		this.#showMinutes = this.toBoolean(flag);
		this.#requestRender();
	}

	/**
	 * Show hours section in formatted output.
	 * @type {boolean}
	 */
	get showHours() { return this.#showHours; }
	set showHours(flag) {
		this.#showHours = this.toBoolean(flag);
		this.#requestRender();
	}

	/**
	 * Returns hours of the running clock.
	 * @type {number}
	 * @readonly
	 */
	get hours() { return this.#hrs; }

	/**
	 * Returns minutes of the running clock.
	 * @type {number}
	 * @readonly
	 */
	get minutes() { return this.#min; }

	/**
	 * Returns seconds of the running clock.
	 * @type {number}
	 * @readonly
	 */
	get seconds() { return this.#sec; }

	/**
	 * Remaining countdown time formatted `hh:mm:ss`.
	 * @type {string}
	 * @readonly
	 */
	get timeRemaining() {
		const [h, m, s] = this.#secondsToTime(this.#secRemaining);
		return this.#formatTime(h, m, s);
	}

	/**
	 * Convenience: reflect the 'hidden' attribute as a boolean property.
	 * Note: Setting the property will reflect to the attribute with a guard.
	 * @type {boolean}
	 */
	get hidden() { return this.hasAttribute('hidden'); }
	set hidden(flag) {
		const val = Boolean(flag);
		if (val === this.hidden) return;
		this.#updatingFromCode = true;
		this.toggleAttribute('hidden', val);
		this.#updatingFromCode = false;
	}

	/**
	 * Create a Timer element.
	 * @param {string|number|Array<number|string>} [time]	- Optional initial time (clock) as "hh:mm[:ss]", seconds number, or [h,m(,s)].
	 * @param {boolean} [run=false]							- If true (or time is omitted) the timer autostarts.
	 */
	constructor(time, run = false) {
		super();
		this.attachShadow({ mode: 'open', delegatesFocus: true });
		this.#createTemplate();
		this.setTime(time);
		this.#autostart = (run === true || time === undefined);
	}

	/**
	 * Called when the element is connected to the document.
	 * Initializes DOM refs, applies initial attributes and renders once.
	 */
	connectedCallback() {
		this.#cacheDOM();
		this.#applyInitialAttributes();
		this.#requestRender();
		if (this.#autostart) this.start();
	}

	/**
	 * Called whenever an observed attribute changes.
	 *
	 * DEUTSCHER HINWEIS:
	 * ----------------------------------------------------------------
	 * Wir trennen DOM → State (attributeChangedCallback) strikt von
	 * JS → State (Property-Setter). attributeChangedCallback schreibt
	 * nur in interne Felder / ruft Methoden, die NICHT wiederum das
	 * gleiche Attribut setzen. Falls Settern eine Attribut-Reflexion
	 * durchführen, wird dies mit einem Guard (#updatingFromCode)
	 * geschützt, damit keine Endlosschleifen entstehen.
	 * ----------------------------------------------------------------
	 *
	 * @param {string} name
	 * @param {string|null} oldVal
	 * @param {string|null} newVal
	 */
	attributeChangedCallback(name, oldVal, newVal) {
		if (oldVal === newVal || this.#updatingFromCode) return;

		switch (name) {
			case 'hidden':
				// Reflect DOM attribute to property without re-writing attribute
				// (host CSS already reacts to :host([hidden])).
				// We avoid property->attribute reflection here on purpose.
				break;

			case 'hours':
				this.showHours = (newVal === '' || this.toBoolean(newVal));
				break;

			case 'minutes':
				this.showMinutes = (newVal === '' || this.toBoolean(newVal));
				break;

			case 'time':
				this.setTime(newVal);
				break;

			case 'alert':
				this.setAlertTime(newVal);
				break;

			case 'countdown':
				this.countDown(newVal);
				break;

			case 'format':
				this.format = newVal;
				break;

			case 'mode':
				this.mode = newVal;
				break;
		}
	}

	/**
	 * Start the clock-timer (or resume it). If already running, it's restarted cleanly.
	 * @fires timer
	 * @fires timerexpired
	 */
	start() {
		if (this.isRunning) clearInterval(this.#timerID);
		this.#startTime = new Date();

		this.#timerID = setInterval(() => {
			this.#sec++;
			if (this.#sec === 60) {
				this.#sec = 0; this.#min++;
				if (this.#min === 60) { this.#min = 0; this.#hrs = (this.#hrs + 1) % 24; }
			}

			this.#raiseEvent(EVT_TIMER);

			// Alert check via timestamp (precise, not string-equality-based)
			// if (this.#alertTimestamp && Date.now() >= this.#alertTimestamp) {
			// 	this.#raiseEvent(EVT_EXPIRED, { alertAt: this.alertTime });
			// 	this.#alertTimestamp = null;
			// }
            if (this.#alertTarget &&
                this.#hrs === this.#alertTarget[0] &&
                this.#min === this.#alertTarget[1] &&
                this.#sec === this.#alertTarget[2]) {
                this.#raiseEvent(EVT_EXPIRED, { alertAt: this.alertTime });
                this.#alertTarget = null; // One-Shot; bei Bedarf weglassen für tägliche Wiederholung
            }

			this.#requestRender();
		}, 1000);

		if (this.#mode === 'auto' && !this.#displaySource)
			this.#displaySource = 'timer';
	}

	/**
	 * Stop the clock-timer (does not affect the countdown).
	 */
	stop() {
		this.#timerID = clearInterval(this.#timerID);
	}

	/**
	 * Reset the clock-timer to current system time and stop it.
	 */
	reset() {
		this.#timerID = clearInterval(this.#timerID);
		const t = new Date();
		this.#hrs = t.getHours();
		this.#min = t.getMinutes();
		this.#sec = t.getSeconds();
		this.#displaySource = null;
		this.#requestRender();
	}

	/**
	 * Alias for start(); provided for API parity.
	 */
	resume() { this.start(); }

	/**
	 * Start or stop the countdown.
	 * - Passing "stop", `false` or `0` stops the countdown.
	 * - Any valid time (string/array/number) starts it.
	 *
	 * Uses drift-compensated timestamps to keep the countdown precise even under load.
	 *
	 * @param {string|number|Array<number|string>|boolean} time
	 * @returns {true|false|Error} true on started/stopped; false if duration ≤ 0; Error if invalid time.
	 * @fires countdown
	 * @fires timeout
	 */
	countDown(time) {
		// Stop requests
		if (time === 'stop' || time === false || time === 0) {
			this.#stopCountDown();
			return true;
		}

		const arr = this.#parseTime(time);
		if (!arr) return new Error('Invalid time for countdown.');

		this.#secRemaining = arr[0] * 3600 + arr[1] * 60 + arr[2];
		if (this.#secRemaining <= 0) return false;

		this.#countDownStart = Date.now();
		this.#countDownEnd = this.#countDownStart + this.#secRemaining * 1000;

		this.#countDownID = setInterval(() => {
			const now = Date.now();
			const diff = Math.round((this.#countDownEnd - now) / 1000);
			this.#secRemaining = Math.max(0, diff);

			this.#raiseEvent(EVT_COUNTDOWN, { remaining: this.#secRemaining });
			this.#requestRender();

			if (this.#secRemaining <= 0) {
				this.#raiseEvent(EVT_TIMEOUT);
				this.#stopCountDown();
			}
		}, 250);

		if (this.#mode === 'auto' && !this.#displaySource)
			this.#displaySource = 'countdown';

		return true;
	}

	/**
	 * Private helper: stops countdown and clears remaining seconds.
	 * @private
	 */
	#stopCountDown() {
		this.#countDownID = clearInterval(this.#countDownID);
		this.#secRemaining = 0;
		this.#displaySource = null;
		this.#requestRender();
	}

	/**
	 * Set the clock time. If omitted, current system time is used.
	 * Does NOT start the clock; call {@link Timer#start} for that.
	 *
	 * @param {string|number|Array<number|string>|undefined} time
	 * @returns {true|Error} true on success, Error on invalid input
	 */
	setTime(time) {
		if (time === undefined) {
			const d = new Date();
			this.#hrs = d.getHours();
			this.#min = d.getMinutes();
			this.#sec = d.getSeconds();
			return true;
		}
		const arr = this.#parseTime(time);
		if (!arr) return new Error('Invalid time format.');
		[this.#hrs, this.#min, this.#sec] = arr;
		this.#requestRender();
		return true;
	}

	/**
	 * Set alert time for the clock. When reached, {@link EVT_EXPIRED} fires.
	 * @param {string|number|Array<number|string>} time
	 * @returns {true|Error} true on success, Error on invalid input
	 */
	// setAlertTime(time) {
	// 	const arr = this.#parseTime(time);
	// 	if (!arr) return new Error('Invalid alert time.');
	// 	const now = new Date();
	// 	const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), ...arr);
	// 	this.alertTime = this.#formatTime(...arr);
	// 	this.#alertTimestamp = target.getTime();
	// 	return true;
	// }

    setAlertTime(time) {
        const arr = this.#parseTime(time);
        if (!arr) return new Error('Invalid alert time.');
        this.alertTime = this.#formatTime(...arr);
        this.#alertTarget = arr; // numerisches Ziel, keine Wall-Clock
        return true;
    }

	/**
	 * Validate a time tuple or tuple-like inputs (numbers or numeric strings).
	 * Hours: 0..23, Minutes: 0..59, Seconds: 0..59.
	 * @param {number|string} h
	 * @param {number|string} m
	 * @param {number|string} s
	 * @returns {boolean}
	 */
	validateTime(h, m, s) {
		h = Number(h); m = Number(m); s = Number(s);
		return (
			Number.isInteger(h) && Number.isInteger(m) && Number.isInteger(s) &&
			h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60
		);
	}

	/**
	 * Convert an amount of seconds to a `[h, m, s]` tuple.
	 * Returns [0,0,0] if seconds cannot form a valid time tuple.
	 * @private
	 * @param {number} seconds
	 * @returns {number[]} `[hours, minutes, seconds]`
	 */
	#secondsToTime(seconds) {
		const h = Math.floor(seconds / 3600),
			  m = Math.floor((seconds % 3600) / 60),
			  s = Math.floor(seconds % 60);
		return this.validateTime(h, m, s) ? [h, m, s] : [0, 0, 0];
	}

	/**
	 * Parse various time inputs into a normalized `[h, m, s]` tuple.
	 * Accepts arrays, "hh:mm[:ss]" strings, or a number representing seconds.
	 * Returns `undefined` on invalid input.
	 * @private
	 * @param {string|number|Array<number|string>} time
	 * @returns {number[]|undefined}
	 */
	// #parseTime(time) {
	// 	if (Array.isArray(time)) {
	// 		const parts = time.map(Number);
	// 		while (parts.length < 3) parts.push(0);
	// 		return this.validateTime(...parts) ? parts : undefined;
	// 	}
	// 	if (typeof time === 'string') {
	// 		if (/^\d+$/.test(time)) return this.#secondsToTime(Number(time));
	// 		const parts = time.split(':').map(Number);
	// 		while (parts.length < 3) parts.push(0);
	// 		return this.validateTime(...parts) ? parts : undefined;
	// 	}
	// 	if (typeof time === 'number') return this.#secondsToTime(time);
	// 	return undefined;
	// }

    #parseTime(time) {
        if (Array.isArray(time)) {
            const parts = time.map(Number);
            while (parts.length < 3) parts.push(0);
            return this.validateTime(...parts) ? parts : undefined;
        }

        if (typeof time === 'string') {
            const s = time.trim();
            // reine Sekundenangabe
            if (/^\d+$/.test(s)) return this.#secondsToTime(Number(s));
            // muss ein ":" enthalten, sonst kein hh:mm[:ss]
            if (!s.includes(':')) return undefined;

            const lead = s.startsWith(':');
            // leere Segmente als 0 interpretieren (z. B. ":30" => [0,30])
            let parts = s.split(':').map(v => v === '' ? 0 : Number(v));

            // Links- vs. Rechts-Auffüllen je nach Schreibweise
            if (lead) { while (parts.length < 3) parts.unshift(0); }
            else { while (parts.length < 3) parts.push(0); }

            return this.validateTime(...parts) ? parts : undefined;
        }

        if (typeof time === 'number') return this.#secondsToTime(time);
        return undefined;
    }

	/**
	 * Coerce heterogeneous "truthy" inputs into booleans.
	 * Accepts true/false, 1/0, "true/yes/on/1".
	 * @param {any} expression
	 * @returns {boolean}
	 */
	toBoolean(expression) {
		if (typeof expression === 'boolean') return expression;
		if (typeof expression === 'number') return Boolean(expression);
		if (typeof expression === 'string') {
			switch (expression.toLowerCase().trim()) {
				case 'true': case 'yes': case 'on': case '1': return true;
			}
		}
		return false;
	}

	/**
	 * Format a given time tuple using the current {@link Timer#format},
	 * respecting {@link Timer#showHours} and {@link Timer#showMinutes}.
	 * If no arguments are provided, the current internal clock time is used.
	 * @private
	 * @param {number} [h=this.#hrs]
	 * @param {number} [m=this.#min]
	 * @param {number} [s=this.#sec]
	 * @param {'24'|'12'|'intl'} [format=this.#format]
	 * @returns {string}
	 */
	#formatTime(h = this.#hrs, m = this.#min, s = this.#sec, format = this.#format) {
		if (format === 'intl') {
			const d = new Date();
			d.setHours(h, m, s, 0);
			return new Intl.DateTimeFormat(undefined, {
				hour: '2-digit',
				minute: this.showMinutes ? '2-digit' : undefined,
				second: (this.showMinutes || this.showHours) ? '2-digit' : undefined
				// hour12 left to the runtime locale preference
			}).format(d);
		}

		const is12h = (format === '12');
		const apm = is12h ? (h < 12 ? ' AM' : ' PM') : '';
		const hrs = ('0' + (is12h ? (h % 12 || 12) : h)).slice(-2);
		let t = `${hrs}:${('0'+m).slice(-2)}:${('0'+s).slice(-2)}`;

		if (!this.showMinutes) return t.slice(-2) + apm;
		if (!this.showHours)   return t.slice(-5) + apm;
		return t + apm;
	}

	/**
	 * Return the current clock time in different shapes.
	 * @param {'string'|'array'|'object'} [returnAs='string']
	 * @returns {string|number[]|{hours:number,minutes:number,seconds:number}|undefined}
	 */
	getTime(returnAs = 'string') {
		if (returnAs === 'array')  return [this.#hrs, this.#min, this.#sec];
		if (returnAs === 'object') return { hours: this.#hrs, minutes: this.#min, seconds: this.#sec };
		if (returnAs === 'string') return this.#formatTime();
		return undefined;
	}

	/**
	 * Dispatch a CustomEvent that crosses the shadow boundary.
	 * @private
	 * @param {string} type
	 * @param {Object} [extra]
	 * @fires timer
	 * @fires countdown
	 * @fires timeout
	 * @fires timerexpired
	 */
	#raiseEvent(type, extra = {}) {
		/** @type {TimerEventDetail} */
		const detail = {
			time: this.getTime(),
			elapsed: Date.now() - this.#startTime.getTime(),
			countdown: this.timeRemaining,
			...extra
		};
		this.dispatchEvent(new CustomEvent(type, { composed: true, detail }));
	}

	/**
	 * Request a render on the next animation frame.
	 * Batches multiple updates within a frame.
	 * @private
	 */
	#requestRender() {
		this.#needsRender = true;
		if (this.#renderPending) return;
		this.#renderPending = true;
		requestAnimationFrame(() => this.#render());
	}

	/**
	 * Update the visible text according to the current mode.
	 * Uses `.textContent` (faster, no layout read) for performance.
	 * @private
	 */
	#render() {
		this.#renderPending = false;
		if (!this.#needsRender || !this.isConnected) return;
		this.#needsRender = false;

		let displayValue = '';
		switch (this.#mode) {
			case 'countdown':
				displayValue = this.timeRemaining;
				break;
			case 'auto':
				if (!this.#displaySource) {
					if (this.isRunning) this.#displaySource = 'timer';
					else if (this.#countDownID) this.#displaySource = 'countdown';
				}
				displayValue = (this.#displaySource === 'countdown')
					? this.timeRemaining
					: this.getTime();
				break;
			default:
				displayValue = this.getTime();
		}

		this.DOM.divTimer.textContent = displayValue ?? '';
	}

	/**
	 * Cache frequently used shadow DOM elements.
	 * @private
	 */
	#cacheDOM() {
		this.DOM.divTimer = /** @type {HTMLDivElement} */ (this.shadowRoot.getElementById('divTimer'));
	}

	/**
	 * Apply initial attributes once on connect (DOM → State only).
	 * Avoids attribute/property feedback loops by calling methods that
	 * do not re-write the same attributes.
	 * @private
	 */
	#applyInitialAttributes() {
		if (this.hasAttribute('hours'))   this.showHours = (this.getAttribute('hours') === '' || this.toBoolean(this.getAttribute('hours')));
		if (this.hasAttribute('minutes')) this.showMinutes = (this.getAttribute('minutes') === '' || this.toBoolean(this.getAttribute('minutes')));
		if (this.hasAttribute('format'))  this.format = this.getAttribute('format');
		if (this.hasAttribute('mode'))    this.mode = this.getAttribute('mode');
		if (this.hasAttribute('time'))    this.setTime(this.getAttribute('time'));
		if (this.hasAttribute('alert'))   this.setAlertTime(this.getAttribute('alert'));
		if (this.hasAttribute('countdown')) this.countDown(this.getAttribute('countdown'));
	}

	/**
	 * Create and attach the component's local template.
	 *
	 * DEUTSCHER HINWEIS:
	 * ----------------------------------------------------------------
	 * Das Template wird absichtlich *lokal* in der Klasse definiert
	 * (und nicht als globales Singleton), um
	 * - die Lebensdauer pro Instanz zu kapseln,
	 * - Seiteneffekte durch globale Mutationen zu vermeiden und
	 * - Shadow-DOM-Isolation konsequent beizubehalten.
	 * Das Styling nutzt `--timer-*` CSS-Variablen (analog zur MessageBox).
	 * ----------------------------------------------------------------
	 *
	 * @private
	 */
	#createTemplate() {
		const tmpl = document.createElement('template');
		tmpl.innerHTML = `
			<style>
				:host {
					display: inline-block;
					min-height: 1rem;
					width: auto;
					border: var(--timer-border, 1px solid silver);
					background-color: var(--timer-bg, field);
					color: var(--timer-color, currentColor);
					font-family: var(--timer-font, monospace);
				}
				#divTimer {
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 0.125rem 0.25rem;
					font: inherit;
				}
				:host([hidden]) { display: none !important; }
			</style>
			<div id="divTimer" class="timer-display" part="display"></div>
		`;
		this.shadowRoot.append(tmpl.content.cloneNode(true));
	}
}

customElements.define('timer-box', Timer);

/**
 * Timer tick event name.
 * @type {string}
 */
const EVT_TIMER = 'timer';

/**
 * Countdown tick event name.
 * @type {string}
 */
const EVT_COUNTDOWN = 'countdown';

/**
 * Countdown finished event name.
 * @type {string}
 */
const EVT_TIMEOUT = 'timeout';

/**
 * Alert-time reached event name (for the clock).
 * @type {string}
 */
const EVT_EXPIRED = 'timerexpired';