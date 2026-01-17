/**
 * @file messagebox_class.js
 * @description Configurable user message box (refactored version)
 * Compatible with PWA and standalone usage
 * @module MessageBox
 */


import Library from './Library.js';
import { ColorHandler } from './ColorHandler.js';

const OVERLAY_ID = 'msg-BoxOverlay',
      BTN_ID = 'msg-btn-',
      CLOSE_ID = 'msg-btn-close',
      Z_INDEX_TOP = 2147483647;

      // - {@link }

/**
 * MessageBox - Provides an interactive, configurable message dialog
 * =================================================================
 * Can be displayed modal or non-modal.
 * Supports keyboard navigation, accessibility attributes, auto-close timers, and optional fade animations.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - async {@link show}       - displays the defined dialog according to the passed parameters
 * - {@link reset}            - resets all settings
 *
 * ---------------------------------------------------------------
 * II. Properties
 * ---------------------------------------------------------------
 *
 * - modal
 * - closeButton
 * - caseSensitive
 * - adjustContrast
 * - fade
 */

export class MessageBox extends Library {
    /**
     * Determines whether the message box is modal or not.
     * A modal dialog can be closed only by button click.
     * @type {Boolean}
     * @default true
     */
    modal = true;

    /**
     * Determines whether the message box displays a close button (X).
     * If the message box is closed by the close button, it returns `false`.
     * @type {Boolean}
     * @default false
     */
    closeButton = false;

    /**
     * Determines whether the returned string (button caption) is case sensitive or not.
     * Default is false.
     * @type {Boolean}
     * @default false
     */
    caseSensitive = false;

    /**
     * Defines whether the title bar automatically adjusts the contrast color.
     * @type {Boolean}
     * @default true
     */
    adjustContrast = true;

    /**
     * Defines whether the message box fades in and out.
     * When enabled, the dialog uses CSS transitions for smooth visibility changes.
     * @type {Boolean}
     * @default false
     */
    fade = false;

    /**
     * Defines the automatic close time (in seconds).
     * If greater than 0, the message box closes automatically after the given duration.
     * @type {Number}
     * @default 0
     */
    autoClose = 0;

    /** @private */
    #value = null;

    /** @private */
    #prompt = '';

    /** @private */
    #title = document.title || 'Message';

    /** @private */
    #arrButtons = ['Ok'];

    /**
     * Returns the value of the user action:
     * - a string (the caption of the clicked button)
     * - false - if the close button was clicked
     * - null - if a non-modal box was closed by clicking outside
     * @readonly
     * @type {String|Boolean|null}
     */
    get value() { return this.#value; }

    /**
     * Gets or sets the text for the displayed message.
     * To add line breaks, use `\n` in the text.
     * @type {String}
     */
    get prompt() { return this.#prompt; }
    set prompt(text) {
        this.#prompt = text == null ? this.#prompt : text;
        this.#prompt = this.#prompt.replace(/\\n|\\r\\n|\\r/g, '<br/>');
    }

    /**
     * Gets or sets the title of the message box.
     * @type {String}
     */
    get title() { return this.#title; }
    set title(text) {
        this.#title = text == null || text.length == 0 ? this.#title : text;
    }

    /**
     * Gets or sets the displayed buttons.
     * Accepts either an array or a comma-separated string.
     * @type {String[]|String}
     */
    get buttons() { return this.#arrButtons; }
    set buttons(buttons) {
        if (buttons instanceof Array) {
            this.#arrButtons = buttons.filter(btn => btn.trim());
        } else if (typeof buttons == 'string') {
            if (buttons.trim().length == 0) buttons = 'Ok';
            this.#arrButtons = buttons.split(',').map(btn => btn.trim());
        }
    }


    /** @private ColorHandler component to adjust titlebar constrast */
    #colors = new ColorHandler(this);


    /**
     * @constructor
     * @param {String} prompt - Message to be displayed.
     * @param {String} title - Dialog title (if omitted, uses page title).
     * @param {String|Array} buttons - Comma-separated string or string array defining buttons.
     * @param {Boolean} modal - Whether the dialog is modal.
     * @param {Boolean} closeButton - Whether the dialog includes a close button.
     */
    constructor({prompt='', title=document.title, buttons=['Ok'], modal=true, closeButton=false} = {}) {
        super();
        this.prompt = prompt;
        this.title = title;
        this.buttons = buttons;
        this.modal = modal;
        this.closeButton = closeButton;

        // this.#setParams(prompt, title, buttons, modal, closeButton);
    }

    /**
     * Displays the message box asynchronously.
     * All parameters are optional; default values are used otherwise.
     * @async
     * @param {String} prompt - Message to display.
     * @param {String} title - Title of the dialog.
     * @param {String|Array} buttons - Comma-separated string or array of captions.
     * @param {Boolean} modal - Modal or not.
     * @param {Boolean} closeButton - Whether a close button is displayed.
     * @returns {Promise<String|Boolean|null>} Returns user choice.
     */
    async show(prompt, title, buttons, modal, closeButton) {
        this.#setParams(prompt, title, buttons, modal, closeButton);
        this.#injectCSS(); // ensure styles are available
        this.#createOverlay();
        this._raiseEvent('beforeShow', this.#getEventDetails());
        this.#renderBox();

        const $this = this;
        const overlay = document.getElementById(OVERLAY_ID);

        // 🎹 Keyboard support
        const keyHandler = this.#keyHandler.bind(this);
        document.addEventListener('keydown', keyHandler);

        return new Promise((resolve) => {
            /**
             * @note Debugging timeout - closes the dialog automatically after 10 seconds
             * when window.DEBUGGINGMODE === true.
             */
            if (window.DEBUGGINGMODE === true) {
                setTimeout(() => {
                    if (document.getElementById(OVERLAY_ID)) {
                        console.warn('MessageBox auto-closed (debugging timeout)');
                        $this.#value = null;
                        $this.#removeBox(btnHandler, keyHandler);
                        resolve(null);
                    }
                }, 10000);
            }

            /**
             * @note Auto-close timer.
             * Closes the box automatically if autoClose > 0.
             */
            if (this.autoClose > 0) {
                setTimeout(() => {
                    if (document.getElementById(OVERLAY_ID)) {
                        $this.#value = null;
                        $this.#removeBox(btnHandler, keyHandler);
                        resolve(null);
                    }
                }, this.autoClose * 1000);
            }

            function btnHandler(evt) {
                const target = evt.target.id;
                if (target.startsWith(BTN_ID)) {
                    const text = document.getElementById(target).innerText;
                    const retVal = $this.caseSensitive ? text : text.toLowerCase();
                    $this.#value = (retVal !== '✕' ? retVal : false);
                    $this.#removeBox(btnHandler, keyHandler);
                    resolve($this.value);
                } else if (target === OVERLAY_ID && !$this.modal) {
                    $this.#value = null;
                    $this.#removeBox(btnHandler, keyHandler);
                    resolve(null);
                }
            }

            // 🧱 Event delegation only on overlay
            overlay.addEventListener('click', btnHandler);
        });
    }

    /**
     * Resets the MessageBox to its default values.
     */
    reset() {
        this.#value = null;
        this.#prompt = '';
        this.#title = document.title || 'Message';
        this.#arrButtons = ['Ok'];
    }

    /**
     * Generates the dialog DOM structure and applies contrast correction and fade-in if enabled.
     * @private
     */
    #renderBox(overlay = document.getElementById(OVERLAY_ID)) {
        overlay.innerHTML = `
        <div id="msgDialog" class="msg-dialog" role="dialog"
            aria-modal="${this.modal}"
            aria-labelledby="msgCaption"
            aria-describedby="msgPrompt">
            <div class="msg-titlebar">
                <h2 id="msgCaption">${this.title}</h2>
            </div>
            <p id="msgPrompt" class="msg-Prompt">${this.prompt}</p>
            ${this.#renderButtons()}
        </div>`;

        if (this.fade) { // ◀️ NEW: fade-mode ?
            const dialog = document.getElementById('msgDialog');
            dialog.classList.add('fade');
            requestAnimationFrame(() => dialog.classList.add('visible'));
        }
        // adjust contrast synchrone!
        requestAnimationFrame(() => { if (this.adjustContrast) this.#adjustTitlebarColor() });
    }

    /**
     * Removes the message box and its event handlers from the DOM.
     * @param {Function} handler - The click event handler.
     * @param {Function} keyHandler - The keyboard event handler.
     * @private
     */
    #removeBox(handler, keyHandler) {
        const evtType = this.value ? 'buttonClick' : 'cancel';
        this._raiseEvent(evtType, this.#getEventDetails());
        this._raiseEvent('beforeClose', this.#getEventDetails());

        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;

        overlay.removeEventListener('click', handler);
        document.removeEventListener('keydown', keyHandler);
        overlay.remove(); // Remove immediately — no fade-out
    }

    #getEventDetails() {
        return {
            autoClose: this.autoClose,
            buttons: this.buttons,
            modal: this.modal,
            closeButton: this.closeButton,
            caseSensitive: this.caseSensitive,
            value: this.value
        }
    }

    /**
     * Handles keyboard input (ENTER and ESC keys).
     * ENTER triggers the first button; ESC closes the box if allowed.
     * @param {KeyboardEvent} evt
     * @private
     */
    #keyHandler(evt) {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;
        if (evt.key === 'Enter') {
            const firstBtn = overlay.querySelector('.msg-button');
            if (firstBtn) firstBtn.click();
        } else if (evt.key === 'Escape') {
            if (this.closeButton || !this.modal) {
                document.getElementById(CLOSE_ID)?.click();
            }
        }
    }

    /**
     * Creates the overlay container in the document body.
     * @private
     */
    #createOverlay() {
        const overlay = this.createElement('div', {
            id: OVERLAY_ID,
            style: {
                zIndex: Z_INDEX_TOP,
                position: 'fixed',
                inset: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                userSelect: 'none',
                backgroundColor: this.modal ? '#00000040' : 'transparent'
            }
        });
        document.body.appendChild(overlay);
    }

    /**
     * Renders all buttons defined in the dialog.
     * @returns {String} HTML string of buttons.
     * @private
     */
    #renderButtons() {
        let btnCode = '';
        for (let i = 0; i < this.buttons.length; i++) {
            btnCode += `<button id="${BTN_ID}${i}" class="msg-button">${this.buttons[i]}</button>`;
        }
        if (this.closeButton) btnCode += `<button id="${CLOSE_ID}">&#10005;</button>`;
        return btnCode;
    }

    /**
     * Applies parameters to the current instance.
     * @private
     */
    #setParams(prompt, title, buttons, modal, closeButton) {
        this.prompt = prompt;
        this.title = title;
        this.buttons = buttons;
        if (modal != null) this.modal = typeof modal == 'boolean' ? modal : true;
        if (closeButton != null) this.closeButton = typeof closeButton == 'boolean' ? closeButton : false;
    }


    /**
     * Adjusts titlebar color contrast automatically.
     * Tries computed background-color first. If transparent (typical for gradients),
     * extracts the first color stop from background-image. As a final fallback,
     * uses the CSS variable --msg-gradient-color-from (or '#000080').
     * Chooses black or whitesmoke text based on background luminance if contrast is insufficient.
     * @private
     */
    #adjustTitlebarColor() {
        const caption = document.getElementById('msgCaption');
        if (!caption) return;

        const parent = caption.parentElement;
        const style = getComputedStyle(parent);

        // 1) primary: plain background color
        let bgColor = style.backgroundColor;

        // 2) fallback: extract first color from background-image (gradient)
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
            const bgImg = style.backgroundImage || style.background;
            // match first rgb/rgba(...) or hex color
            const match = bgImg && bgImg.match(/(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8})/);
            if (match) {
                bgColor = match[1];
            } else {
                // 3) final fallback: CSS var or default navy
                const fromVar = getComputedStyle(document.documentElement)
                    .getPropertyValue('--msg-gradient-color-from').trim();
                bgColor = fromVar || '#000080'; // navy
            }
        }

        const textColor = getComputedStyle(caption).color;
        const contrast = this.#colors.getContrastRatio(textColor, bgColor);

        // If contrast is insufficient, pick black or whitesmoke by luminance
        if (contrast < 4.5) {
            const lumBG = this.#colors.getLuminance(bgColor);
            const newColor = lumBG > 0.5 ? '#000' : '#f5f5f5'; // black on light, white on dark
            this.setCSSProperty('--msg-title-color', newColor);
            this.setCSSProperty('--msg-button-text-hover-color', newColor);
        }
    }


    /**
     * Ensures the message box CSS is available.
     * Injects a minimal fallback stylesheet if none exists.
     * Includes fade & scale animation with customizable duration and timing.
     * @private
     */
    #injectCSS() {
        if (document.getElementById('msgStyleSheet')) return;
        const style = this.createElement('style', {
            id: 'msgStyleSheet',
            textContent: `
            :root {
                --msg-fade-duration: 300ms;
                --msg-fade-timing: ease;
            }
            /* Default: visible without fade */
            .msg-dialog {
                position: relative;
                opacity: 1;
                transform: none;
            }
            /* Fade mode only when .fade class is present */
            .msg-dialog.fade {
                opacity: 0;
                transform: scale(0.95);
                transition: opacity var(--msg-fade-duration, 300ms) var(--msg-fade-timing, ease),
                            transform var(--msg-fade-duration, 300ms) var(--msg-fade-timing, ease);
            }
            .msg-dialog.fade.visible {
                opacity: 1;
                transform: scale(1);
            }`
        })
        document.head.appendChild(style);
    }
}