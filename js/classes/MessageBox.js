import $ from '../utils.js';
import Library from './Library.js';
import { ColorHandler } from './ColorHandler.js';

/**
 * @file MessageBox.js
 * @module MessageBox
 * @extends Library
 * @version 3.0.0
 * @author Jens-Olaf-Mueller
 *
 * MessageBox - A highly configurable, interactive message dialog component.
 * =========================================================================
 *
 * Supports modal/non-modal states, auto-close timers, and smooth fade animations.
 * - Key Features:
 *   - Intelligent Prompt: Supports both physical newlines and '\n' strings, converting them to [br/] tags.
 *   - Auto-Contrast: Dynamically adjusts titlebar text and close-button visibility based on background gradients.
 *   - Gradient Support: Automatically extracts colors from CSS gradients for contrast calculations.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link show}                 - Async: Displays the dialog. Accepts an options object or a simple prompt string.
 * - {@link reset}                - Restores all instance properties to their default values.
 * - {@link adjustTitlebarColor}  - Analyzes titlebar background and forces a contrast correction for text and icons.
 *
 * ---------------------------------------------------------------
 * II. Private Methods (Internal Logic)
 * ---------------------------------------------------------------
 * - #setParams(options)    - Smart-merges options into instance properties using the Library's property-accessor.
 * - #renderButtons()       - Normalizes button definitions and injects them into the DOM with value binding.
 * - #getEventDetails(val)  - Generates a consistent state snapshot for event listeners.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event beforeShow {@link MessageBoxEvent}     → fires before the UI is displayed
 * @event buttonClick {@link MessageBoxEvent}    → fires after a button has been clicked
 * @event close {@link MessageBoxEvent}          → fires when MessageBox is closed
 * @event cancel {@link MessageBoxEvent}         → fires when ESCAPE-key pressed or non-modal overlay was clicked
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * All variables are prefixed with '--msg-' and follow kebab-case naming.
 *   * --msg-text-color                 - General text color within the dialog.
 *   * --msg-font-weight                - Font weight for captions and buttons.
 *   * --msg-title-color                - Text color for the titlebar caption.
 *   * --msg-gradient-color-from        - Start color for the titlebar background gradient.
 *   * --msg-gradient-color-to          - End color for the titlebar background gradient.
 *   * --msg-shadow-color               - Color of the dialog's outer drop shadow.
 *   * --msg-background-color           - Background color of the main dialog body.
 *   * --msg-button-background-hover-color - Background color of buttons on hover.
 *   * --msg-button-text-hover-color    - Text color of buttons on hover.
 *   * --msg-button-color               - Default background color of buttons.
 *   * --msg-button-border-color        - Border color for dialog buttons.
 *   * --msg-button-border-radius       - Corner radius for dialog buttons.
 *   * --msg-close-button-hover-bg      - Background of the 'X' button on hover.
 *   * --msg-close-button-x             - Color of the 'X' icon itself.
 *   * --msg-border-radius              - Corner radius of the entire message box.
 *   * --msg-box-padding                - Internal spacing for dialog content.
 *   * --msg-fade-duration              - Duration of the show/hide transition.
 *   * --msg-fade-timing                - CSS easing function for animations.
 */
export class MessageBox extends Library {
    #modal = true;
    /**
     * Determines whether the message box is modal or not.
     * A modal dialog can be closed only by button click.
     * @type {Boolean}
     */
    get modal() { return this.#modal; }
    set modal(flag) { this.#modal = this.toBoolean(flag); }

    #closeButton = false;
    /**
     * Determines whether the message box displays a close button (X).
     * If the MessageBox is closed by the close button, it returns `null`.
     * @type {Boolean}
     */
    get closeButton() { return this.#closeButton; }
    set closeButton(flag) { this.#closeButton = this.toBoolean(flag); }

    #caseSensitive = false;
    /**
     * Determines whether the returned string (button caption) is case sensitive or not.
     * Default is false.
     * @type {Boolean}
     */
    get caseSensitive() { return this.#caseSensitive; }
    set caseSensitive(flag) { this.#caseSensitive = this.toBoolean(flag); }

    #adjustContrast = true;
    /**
     * Defines whether the title bar automatically adjusts the contrast color.
     * @type {Boolean}
     */
    get adjustContrast() { return this.#adjustContrast; }
    set adjustContrast(flag) { this.#adjustContrast = this.toBoolean(flag); }

  #fade = true;
    /**
     * Defines whether the message box fades in and out.
     * When enabled, the dialog uses CSS transitions for smooth visibility changes.
     * @type {Boolean}
     */
    get fade() { return this.#fade; }
    set fade(flag) { this.#fade = this.toBoolean(flag); }

    #autoClose = 0;
    /**
     * Defines the automatic close time (in seconds).
     * If greater than 0, the message box closes automatically after the given duration.
     * @type {Number} a value between 0 (means autoClose = off) and 300000 ms (= 5 mins)
     */
    get autoClose() { return this.#autoClose; }
    set autoClose(newVal) {
        if (typeof newVal === 'number' && newVal > -1 && newVal < 300001) this.#autoClose = newVal;
    }

    #value = null;
    /**
     * Returns the value of the user action:
     * - a string (the caption of the clicked button)
     * - false - if the close button was clicked
     * - null - if a non-modal box was closed by clicking outside
     * @readonly
     * @type {String|Boolean|null}
     */
    get value() { return this.#value; }

    #prompt = '';
    /**
     * Gets or sets the text for the displayed message.
     * To add line breaks, use `\n` in the text.
     * @type {String}
     */
    get prompt() { return this.#prompt; }
    set prompt(text) {
        this.#prompt = text == null ? this.#prompt : text;
        // this.#prompt = this.#prompt.replace(/\\n|\\r\\n|\\r/g, '<br/>');
        this.#prompt = String(text).replace(/\n|\\n|\r|\\r/g, '<br/>');
    }

    #title = document.title || 'Message';
    /**
     * Gets or sets the title of the message box.
     * @type {String}
     */
    get title() { return this.#title; }
    set title(text) {
        this.#title = text == null || text.length == 0 ? this.#title : text;
    }

    #arrButtons = ['Ok'];
    /**
     * Gets or sets the displayed buttons.
     * Accepts either an array or a comma-separated string.
     * @type {String|String[]}
     */
    get buttons() { return this.#arrButtons; }
    /**
     * Normalizes button input (CSV, Array, or Luxus-Objects) into a strict internal format.
     * Only allows: caption, value, cancel, and default.
     */
    set buttons(value) {
        let raw = [];

        // 1. Input-Normalizing
        if (Array.isArray(value)) {
            raw = value;
        } else if (typeof value === 'string') {
            raw = (value.trim().length === 0) ? ['Ok'] : value.split(',').map(s => s.trim());
        } else {
            raw = ['Ok'];
        }

        // 2. Strict Mapping & Gatekeeping
        this.#arrButtons = raw.map((btn, i) => {
            // Case A: Buttons are passed as objects
            if (btn !== null && typeof btn === 'object') {
                const defCaption = 'Button' + i;
                return {
                    caption: String(btn.caption || defCaption),
                    // only if key "value" exists, otherwise fallback to caption!
                    value:   'value' in btn ? btn.value : (btn.caption || defCaption),
                    cancel:  !!btn.cancel,
                    default: !!btn.default
                };
            }
            // Case B: Buttons are strings
            const strVal = String(btn);
            return {
                caption: strVal,
                value:   strVal,
                cancel:  false,
                default: false
            };
        });
    }

    /** @private ColorHandler component to adjust titlebar constrast */
    #colors = new ColorHandler(this);

    /**
     * Returns only properties defined directly in MessageBox, excluding inherited Library defaults.
     */
    get properties() {
        return super.properties.filter(prop => {
            const desc = Object.getOwnPropertyDescriptor(MessageBox.prototype, prop);
            return !!desc;
        });
    }


    /**
     * @constructor
     * @param {object}  [options={}] - Configuration for the manager.
     * @param {String} [options.prompt=''] - Message to be displayed.
     * @param {String} [options.title=document.title] - Dialog title (if omitted, uses page title).
     * @param {String|Array} [options.buttons=['Ok']] - Comma-separated string or string array defining buttons.
     * @param {Boolean} [options.modal=true] - Whether the dialog is modal.
     * @param {Boolean} [options.closeButton=false} - Whether the dialog includes a close button.
     */
    // constructor({prompt='', title=document.title, buttons=['Ok'], modal=true, closeButton=false} = {}) {
    constructor(options = {prompt: '', title: document.title, buttons: ['Ok'], modal: true, closeButton: false}) {
        super(document.body);
        this.reset(); // initialize defaults
        this.#setParams(options);
        this.log(this); // logs the class in debug mode only
    }

    /**
     * Resets the MessageBox to its default values.
     */
    reset() {
        this.#value = null;
        this.#prompt = '';
        this.#title = document.title || this.constructor.name;
        this.#arrButtons = ['Ok'];
    }

   /**
     * Displays the message box asynchronously.
     * All parameters are optional; default values are used otherwise.
     * @async
     * @param {Object} [options]                    - Configuration options
     * @param {string} [options.prompt]             - The message text
     * @param {string} [options.title]              - Dialog title
     * @param {string|string[]} [options.buttons]   - Button definitions
     * @param {boolean} [options.modal]             - Modal state
     * @param {boolean} [options.closeButton]       - Whether the box has a close button or not
     * @param {boolean} [options.fade]              - Enable fade animation
     * @param {boolean} [options.adjustContrast]    - Adjust contrast of the titlebar depending on the gradient
     * @param {boolean} [options.caseSensitive]     - Whether the returned value is case sensitive or not
     * @param {number} [options.autoClose]          - Timer in ms
     * @returns {Promise<String|Boolean|null>} Returns user choice.
     */
    async show(options = {}) {
        // special case: if .show() is called with a string: use it as prompt!
        if (typeof options === 'string') options = { prompt: options };
        this.#setParams(options);

        // event before rendering
        this._raiseEvent('beforeShow', this.#getEventDetails());
        this.renderUI(document.body, true);
        this.DOM.msgCaption.textContent = this.title;
        this.DOM.msgPrompt.innerHTML = this.prompt;
        this.DOM.btnCloseButton.toggleAttribute('hidden', !this.closeButton);
        this.DOM.msgBoxOverlay.style.backgroundColor = this.modal ? '#00000040' : 'transparent';
        this.#renderButtons();
        requestAnimationFrame(() => { if (this.adjustContrast) this.adjustTitlebarColor({}) });

        // fade-mode ?
        if (this.fade) {
            this.DOM.msgDialog.classList.add('fade');
            requestAnimationFrame(() => this.DOM.msgDialog.classList.add('visible'));
        }

        return new Promise((resolve) => {
            let timerID = null;

            const closeBox = (value) => {
                if (timerID) clearTimeout(timerID);
                document.removeEventListener('keydown', keyHandler);
                this.#value = value;
                const evtType = this.escape ? 'cancel' : 'close';
                this._raiseEvent(evtType, this.#getEventDetails(value));
                this.DOM.msgBoxOverlay.remove();
                resolve(value);
            };

            // focus handling
            requestAnimationFrame(() => {
                if (this.defaultButton) this.defaultButton.focus();
                else $('.msg-button', 0)?.focus();
            });

            // autoclose mode?
            if (this.autoClose > 0) timerID = setTimeout(() => closeBox(undefined), this.autoClose);

            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    this.escape = true;
                    if (this.cancelButton) this.cancelButton.click();
                    else if (!this.modal) closeBox(undefined);
                }
                if (e.key === 'Enter') {
                    const targetBtn = document.activeElement.closest('.msg-button') || this.defaultButton;
                    if (targetBtn) {
                        e.preventDefault();
                        targetBtn.click();
                    }
                }
                this.escape = false;
            };

            // button evaluation
            const btnHandler = (e) => {
                let res = (e.target === this.DOM.msgBoxOverlay && !this.modal) ? undefined : Infinity;
                const btn = e.target.closest('button');
                this.escape = (btn === null && res === undefined); // triggers cancel event
                if (btn) {
                    if (btn === this.DOM.btnCloseButton) res = null;
                    else res = ('_msgValue' in btn) ? btn._msgValue : btn.textContent;
                }
                if (res !== Infinity) {
                    if (!this.escape) this._raiseEvent('buttonClick', this.#getEventDetails(res));
                    closeBox(res);
                }
            };

            this.DOM.msgBoxOverlay.addEventListener('click', btnHandler);
            document.addEventListener('keydown', keyHandler);
        });
    }

    /**
     * Button creation loop with value binding
     */
    #renderButtons() {
        this.buttons.forEach((btn, index) => {
            const button = this.createElement('button', {
                id: `msgButton${index}`,
                classList: 'msg-button',
                text: btn.caption
            });

            // Attach the raw value directly to the element object
            button._msgValue = btn.value;
            if (btn.default) button.setAttribute('data-msg-default','');
            if (btn.cancel) button.setAttribute('data-msg-cancel','');
            this.DOM.msgDialog.appendChild(button);
        });

        // store the default- & cancel button as class property
        this.defaultButton = $('[data-msg-default]');
        this.cancelButton = $('[data-msg-cancel]') || (this.closeButton ? this.DOM.btnCloseButton : null);
    }

    /**
     * Applies parameters to the current instance.
     * We use the properties-accessor of the Library to iterate over all valid setters
     */
     #setParams(options = {}) {
        this.properties.forEach(prop => {
            if (prop in options) this[prop] = options[prop];
        });
    }

    /**
     * Returns a universal details-object for all fired events
     * @param {string|boolean|null|undefined} value the current value of the MessageBox
     * @returns {object} details object for the events
     */
    #getEventDetails(value) {
        return {
            autoClose: this.autoClose,
            buttons: this.buttons,
            modal: this.modal,
            closeButton: this.closeButton,
            caseSensitive: this.caseSensitive,
            value: value
        }
    }

    /**
     * Adjusts titlebar color contrast automatically.
     * Tries computed background-color first. If transparent (typical for gradients),
     * extracts the first color stop from background-image. As a final fallback,
     * uses the CSS variable --msg-gradient-color-from (or defaultGradient).
     * Chooses black or whitesmoke text based on background luminance if contrast is insufficient.
     */
    adjustTitlebarColor({defaultGradient='#000080', darkText='#000', lightText='#f5f5f5'}) {
        const style = this.getStyle(this.DOM.msgTitlebar);

        // 1. Zentrale Farbsuche (Global Match)
        const bgImg = style.backgroundImage || style.background;
        const allColors = bgImg ? bgImg.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/gi) : null;

        // first try to get plain background color
        let bgColor = style.backgroundColor;

        // 1st fallback: extract first color from background-image (gradient)
        if ((bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') && allColors) {
            bgColor = allColors[0];
        } else if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
            // final fallback: CSS var or default navy
            const cssVar = this.getStyle(document.documentElement).getPropertyValue('--msg-gradient-color-from').trim();
            bgColor = cssVar || defaultGradient;
        }

        // If contrast is insufficient, pick black or whitesmoke by luminance
        // black on light, whitesmoke (#f5f5f5) on dark
        const textColor = this.getStyle(this.DOM.msgCaption).color;
        if (this.#colors.getContrastRatio(textColor, bgColor) < 4.5) {
            const lum = this.#colors.getLuminance(bgColor);
            this.setCSSProperty('--msg-title-color', lum > 0.5 ? darkText : lightText);
        }

        // set specific CSS variables for the close button
        // Decisions based on the background color at the far right
        const bgColorRight = allColors && allColors.length > 1 ? allColors[allColors.length - 1] : bgColor;
        const isDark = this.#colors.toYIQ(bgColorRight) < 128;
        this.setCSSProperty('--msg-close-button-hover-bg', isDark ? '#ffffff33' : '#0000001a');
        this.setCSSProperty('--msg-close-button-x', isDark ? lightText : darkText);
    }
}

/**
 * @summary `Events, raised by the MessageBox class`
 *
 * - {@link beforeShow}
 * - {@link buttonClick}
 * - {@link close}
 * - {@link cancel}
 *
 * @typedef {Object} MessageBoxEvent
 * @property {number} autoClose
 * @property {boolean} closeButton
 * @property {boolean} modal
 * @property {boolean} caseSensitive
 * @property {string|string[]} buttons
 * @property {string|boolean|null|undefined} value
 */