import Library from './Library.js';

/**
 * Haptic feedback helper.
 * Minimal API: tick, error, whoosh.
 * Platform strategy (to be implemented step-by-step):
 * - Android/Chrome: Web Vibration API (navigator.vibrate)
 * - iOS/Safari: iOS "switch input toggle" workaround (like ios-haptics)
 * - Desktop/unsupported: no-op
 * - ioS:
 * @see {@link https://github.com/tijnjh/ios-haptics}
 * @see {@link https://www.reddit.com/r/javascript/comments/1ldh5z9/built_a_library_for_adding_haptic_feedback_to_web/}
 */
export class Haptic extends Library {
    #enabled = true;
    get enabled() { return this.#enabled; }
    /**
     * Enable or disable haptic output globally for this instance.
     * @param {boolean} flag
     */
    set enabled(flag) {
        this.#enabled = this.toBoolean(flag);
    }

    /** @type {'auto'|'android'|'ios'|'noop'} */
    #engine = 'auto';

    /** @type {boolean} */
    #active = false;

    /** @type {number} */
    #lastPulseTs = 0;

    /** @type {number} */
    #minIntervalMs = 0;

    /** @type {HTMLElement|null} */
    #switchEl = null;

    /** @type {boolean} */
    #debug = false;

    /**
     * Create a Haptic instance.
     * The constructor only prepares internal state.
     * No haptic feedback is triggered here.
     *
     * Responsibilities:
     * - Forward parent to Library
     * - Detect runtime platform (engine)
     * - Initialize default state
     *
     * @param {HTMLElement|Document|null} parent - Host component reference
     */
    constructor(parent = null) {
        super(parent);
        // Detect and store which engine should be used on this device
        this.#engine = this.#detectEngine();
    }


    /**
     * Mark the haptic system as armed.
     *
     * Once armed, haptic feedback is allowed to run.
     * This should be called exactly once after a valid user gesture
     * (e.g. touchstart, pointerdown, click).
     */
    activate() {
        this.#active = true;
    }

    /**
     * Emit a short "tick" feedback.
     * Intended for wheel scrolling steps.
     *
     * Behaviour:
     * - Respects enabled flag
     * - Requires prior activation
     * - Android: short vibration
     * - iOS / noop: no-op (for now)
     *
     * @returns {boolean} True if a haptic attempt was made
     */
    tick() {
        if (!this.#enabled) return false;
        if (!this.#ensureActive()) return false;

        switch (this.#engine) {
            case 'android':
                // NOTE eventually a Getter / Setter "tickDuration"; default 8ms
                // Very short pulse; safe for frequent use
                navigator.vibrate(8); // 8ms
                console.log('Android: tick!');
                return true;

            case 'ios':
                // iOS implementation comes later
                console.log('iOS: tick!');
                return false;

            case 'noop':
            default:
                return false;
        }
    }



    /**
     * Emit an "error" feedback (e.g., invalid input, required field missing).
     * Typically a short, noticeable pattern.
     * @returns {boolean} True if a pulse was attempted, otherwise false.
     */
    error() {
        return false;
    }

    /**
     * Emit a "whoosh" feedback (e.g., page swipe transition).
     * Typically a slightly longer/stronger single pulse or short pattern.
     * @returns {boolean} True if a pulse was attempted, otherwise false.
     */
    whoosh() {
        return false;
    }

    /**
     * Optional: stop any ongoing vibration (Android) if supported.
     * On unsupported platforms this is a no-op.
     */
    stop() {
        // Step-by-step: for Android vibrate, call vibrate(0).
    }

    // =========================================================
    // Private methods (internal)
    // =========================================================

    /**
     * Detect which haptic engine should be used for the current runtime.
     *
     * Decision rules (intentionally conservative):
     * - Android / Chromium with Vibration API  → 'android'
     * - iOS (Safari)                           → 'ios'
     * - Everything else (desktop, unsupported) → 'noop'
     *
     * No haptic feedback is triggered here.
     * @private
     * @returns {'android'|'ios'|'noop'}
     */
    #detectEngine() {
        // iOS detection (Safari / WKWebView)
        if (this.#isIOSSafari()) return 'ios';
        // Android / Chromium-based browsers with Vibration API
        if (this.#hasVibrationAPI()) return 'android';
        // Fallback: no haptic support
        return 'noop';
    }


    /**
     * Ensure haptics are allowed to run.
     * Many mobile browsers require a prior user gesture (touch/click) before
     * vibration-like effects are permitted.
     *
     * This method does not register listeners (we can add that next).
     * It only checks whether the instance is already armed.
     *
     * @private
     * @returns {boolean} True if haptics may run, otherwise false.
     */
    #ensureActive() {
        return (this.#active === true);
    }


    /**
     * Apply throttling to avoid overly frequent pulses (useful for wheel scrolling).
     * @private
     * @returns {boolean} True if enough time elapsed, else false.
     */
    #passThrottle() {
        return false;
    }

    /**
     * Trigger a pulse using the currently selected engine.
     * This is the single internal entry point used by tick/error/whoosh.
     * @private
     * @param {number|number[]} pattern - Duration in ms or vibration pattern array.
     * @returns {boolean} True if a pulse was attempted, otherwise false.
     */
    #pulse(pattern) {
        return false;
    }

    /**
     * Trigger vibration via Web Vibration API (Android/Chrome).
     * @private
     * @param {number|number[]} pattern
     * @returns {boolean}
     */
    #pulseAndroid(pattern) {
        return false;
    }

    /**
     * Trigger haptic feedback via iOS Safari workaround (switch input toggle).
     * @private
     * @returns {boolean}
     */
    #pulseIOS() {
        return false;
    }

    /**
     * Create the hidden "switch" input element used for iOS haptic workaround.
     * @private
     * @returns {HTMLElement} The created input element.
     */
    #createIOSSwithElement() {
        return /** @type {any} */ (null);
    }

    /**
     * Clean up any DOM artifacts created for iOS workaround.
     * @private
     */
    #cleanupIOS() {
        // Step-by-step: remove #switchEl if present.
    }


    /**
     * Detect whether the current runtime is iOS Safari (or iOS WebView).
     *
     * Reasoning:
     * - iOS devices report as iPhone / iPad / iPod
     * - iPadOS pretends to be macOS but still has touch points
     *
     * This is a heuristic, but stable enough for platform routing.
     *
     * @private
     * @returns {boolean}
     */
    #isIOSSafari() {
        // Classic iOS devices
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
        // iPadOS (reports as Mac, but has touch support)
        return (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? true : false;
    }


    /**
     * Check whether the Web Vibration API is available in this environment.
     *
     * Notes:
     * - Availability does NOT guarantee that vibration is actually felt.
     * - On iOS this usually exists as a no-op or is missing entirely.
     * - On Android/Chromium this is typically functional.
     *
     * @private
     * @returns {boolean}
     */
    #hasVibrationAPI() {
        return (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');
    }


    /**
     * Internal logger (only active if #debug is true).
     * @private
     * @param {...any} args
     */
    #log(...args) {
        void args;
    }
}