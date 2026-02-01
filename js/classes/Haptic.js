import Library from './Library.js';

/**
 * @author Jens-Olaf-Mueller
 * @file Haptic.js
 * @module Haptic
 * @extends Library
 * @version 1.0.0
 *
 * Haptic — Multi-platform tactile feedback utility for mobile and web.
 * ====================================================================
 *
 * Provides a unified interface for haptic interactions across different hardware engines.
 * - Key Features:
 * - Cross-Platform: Supports Android (Vibration API) and iOS (Checkbox-Switch Hack).
 * - Intelligent Throttling: Prevents hardware overwhelm by enforcing a minimum interval delay between pulses.
 * - Predefined Effects: Includes specific vibration patterns for 'tick', 'error', and 'whoosh'.
 * - Development Support: Provides comprehensive console logging for desktop environments.
 *
 * @see {@link https://github.com/itsMaz1n/tactus}
 * @see {@link https://github.com/tijnjh/ios-haptics/tree/main}
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link activate}   - Arms the haptic system; must be called within a user-initiated event.
 * - {@link execute}    - Triggers a specific predefined haptic feedback effect.
 * - {@link stop}       - Immediately cancels ongoing vibrations (Android only) and cleans up resources.
 * - {@link terminate}  - Removes the hidden DOM elements used for the iOS haptic workaround.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #pulse()                - Central dispatcher that handles the actual hardware communication and throttling.
 * - #createIOSSwitchElement() - Injects a hidden checkbox into the DOM to exploit the iOS haptic behavior.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * This component does not raise any custom events.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * This component does not provide any CSS variables.
 */
export class Haptic extends Library {

    /** @type {number} Timestamp of the last vibration triggered */
    #lastPulseTs = 0;

    /** @type {number} Minimum delay (ms) between pulses */
    get intervalDelay() {
        return this.engine === 'ios' ? 50 : 33;
    }


    /**
     * Creates a new Haptic instance and detects the platform.
     * @param {Object|HTMLElement|null} [parent=null] - Reference to the calling component or class.
     */
    constructor(parent = null) {
        super(parent);
        this.log(`${this.engine.toUpperCase()} engine initialized...`);
    }

    /**
     * Arms the haptic system. Must be called within a user-initiated event.
     */
    activate() {
        if (this.enabled) return;
        this.enabled = true;
        this.log('Haptic system armed and ready for pulses.');
    }

    /**
     * Executes a specific haptic feedback effect.
     * @param {'tick'|'error'|'whoosh'} effect - The name of the effect to trigger.
     * @returns {boolean}
     */
    execute(effect) {
        if (!this.enabled) return false;

        switch (effect) {
            case 'tick':
                return this.#pulse(33, 'tick');
                // return this.#pulse([33,5,0], 'tick');

            case 'error':
                return this.#pulse([75, 100, 75], 'error');

            case 'whoosh':
                return this.#pulse([60,5,20], 'whoosh');

            default:
                this.log(`Unknown effect requested: ${effect}`, true);
                return false;
        }
    }

    /**
     * Immediately cancels any ongoing vibration (Android only).
     */
    stop() {
        if (this.engine === 'android') navigator.vibrate(0);
        this.terminate();
        this.log('Stop signal sent.');
    }

    /**
     * Terminates and removes the iOS-switch (hack)
     */
    terminate() {
        if (this.engine === 'ios') {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
                this.element = null;
            }
        }
    }

    /**
     * Central pulse dispatcher.
     * @private
     * @param {number|number[]} pattern - The vibration pattern.
     * @param {string} label - The type of pulse (for logging).
     * @returns {boolean}
     */
    #pulse(pattern, label) {
        // Throttling prevents the hardware from being overwhelmed.
        if (label === 'tick') {
            const now = Date.now();
            if (now - this.#lastPulseTs < this.intervalDelay) return false;
            this.#lastPulseTs = now;
        }

        this.log(`${this.engine.toUpperCase()} → ${label.toUpperCase()} (${JSON.stringify(pattern)})`);

        if (this.engine === 'android') return navigator.vibrate(pattern);

        if (this.engine === 'ios') {
            this.#createIOSSwitchElement();
            this.element.click(); // trigger the label for the iOS-checkbox
            this.terminate();
            return true;
        }
        return false; // Explicit return for desktop/fallback
    }

    /**
     * Creates the hidden iOS haptic switch using the Library's helper.
     * @private
     */
    #createIOSSwitchElement() {
        if (this.element) return;

        const id = `chkIOS-${Math.random().toString(36).substr(2, 9)}`;
        this.element = this.createElement('label', {
            htmlFor: id,
            style: { display: 'none' }
        });
        this.element.appendChild(
            this.createElement('input', {
                type: 'checkbox',
                id,
                switch: 'true', // NOTE this is important to make it work in iOS!
            })
        );
        document.body.appendChild(this.element);
        this.log('Hidden iOS switch injected.');
    }
}