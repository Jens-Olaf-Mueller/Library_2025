import Library from './Library.js';

/**
 * Haptic — Feedback utility for mobile devices.
 * ===============================================================
 * Provides tactile feedback for UI interactions.
 * - Android: Uses the Web Vibration API with specific patterns.
 * - iOS: Uses the "Switch-Hack" (toggling a hidden checkbox).
 * - Desktop: Provides console logs for development.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link activate}  - Arms the system (required after user gesture)
 * - {@link execute}   - Triggers a specific haptic effect ('tick', 'error', 'whoosh')
 * - {@link stop}      - Immediately cancels ongoing vibrations (Android)
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #detectEngine:    - Detects platform (android, ios, noop)
 * - #pulse:           - Central dispatcher for hardware interaction
 * - #passThrottle:    - Ensures hardware isn't flooded by rapid pulses
 * - #createIOSSwitchElement: - Prepares the hidden DOM element for iOS hack
 * ===============================================================
 */
export class Haptic extends Library {

    /** @type {boolean} Global toggle to mute/unmute haptics */
    #enabled = true;
    get enabled() { return this.#enabled; }
    set enabled(flag) { this.#enabled = this.toBoolean(flag); }

    /** @type {'android'|'ios'|'noop'} The detected hardware engine */
    #engine = 'noop';
    get engine() { return this.#engine; }

    /** @type {boolean} Flag indicating if the system is armed and ready */
    #active = false;
    get active() { return this.#active; }

    /** @type {number} Timestamp of the last vibration triggered */
    #lastPulseTs = 0;

    /** @type {number} Minimum delay (ms) between pulses */
    #minIntervalMs = 15;

    /**
     * Creates a new Haptic instance and detects the platform.
     * @param {Object|HTMLElement|null} [parent=null] - Reference to the calling component or class.
     */
    constructor(parent = null) {
        super(parent);
        this.#engine = this.#detectEngine();
        this.log(`${this.#engine.toUpperCase()} engine initialized...`);
    }

    /**
     * Arms the haptic system. Must be called within a user-initiated event.
     */
    activate() {
        if (this.#active) return;
        this.#active = true;

        if (this.#engine === 'ios') this.#createIOSSwitchElement();
        this.log('Haptic system armed and ready for pulses.');
    }

    /**
     * Executes a specific haptic feedback effect.
     * @param {'tick'|'error'|'whoosh'} effect - The name of the effect to trigger.
     * @returns {boolean}
     */
    execute(effect) {
        if (!this.#enabled || !this.#active) return false;

        switch (effect) {
            case 'tick':
                return this.#pulse(10, 'tick');

            case 'error':
                return this.#pulse([50, 100, 50], 'error');

            case 'whoosh':
                return this.#pulse(35, 'whoosh');

            default:
                this.log(`Unknown effect requested: ${effect}`, true);
                return false;
        }
    }

    /**
     * Immediately cancels any ongoing vibration (Android only).
     */
    stop() {
        if (this.#engine === 'android') navigator.vibrate(0);
        this.log('Stop signal sent.');
    }

    /**
     * Detects the environment and chooses the best engine.
     * @private
     * @returns {'android'|'ios'|'noop'}
     */
    #detectEngine() {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) return 'ios';
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') return 'android';
        return 'noop';
    }

    /**
     * Central pulse dispatcher.
     * @private
     * @param {number|number[]} pattern - The vibration pattern.
     * @param {string} label - The type of pulse (for logging).
     * @returns {boolean}
     */
    #pulse(pattern, label) {
        if (label === 'tick' && !this.#passThrottle()) return false;

        this.log(`${this.#engine.toUpperCase()} execution -> ${label.toUpperCase()} (${JSON.stringify(pattern)})`);

        if (this.#engine === 'android') {
            return navigator.vibrate(pattern);
        }

        if (this.#engine === 'ios' && this.element) {
            this.element.checked = !this.element.checked;
            return true;
        }

        return false;
    }

    /**
     * Prevents the hardware from being overwhelmed.
     * @private
     * @returns {boolean}
     */
    #passThrottle() {
        const now = Date.now();
        if (now - this.#lastPulseTs < this.#minIntervalMs) return false;
        this.#lastPulseTs = now;
        return true;
    }

    /**
     * Creates the hidden iOS haptic switch using the Library's helper.
     * @private
     */
    #createIOSSwitchElement() {
        if (this.element) return;

        this.element = this.createElement('input', {
            type: 'checkbox',
            ariaHidden: 'true',
            tabIndex: -1,
            style: {
                position: 'fixed',
                width: 0,
                height: 0,
                opacity: 0,
                pointerEvents: 'none'
            }
        });

        const container = (this.parent && this.parent.rootElement)
            ? this.parent.rootElement
            : document.body;

        container.appendChild(this.element);
        this.log('Hidden checkbox for iOS injected into DOM...');
    }
}