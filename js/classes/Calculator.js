import $ from '../utils.js';
import { Parser } from './Parser.js';
import Library from './Library.js';

const NUM_REGEX = /[^-0-9,e+e-]|-$|\+$/g;

/**
 * @file Calculator.js
 * @module Calculator
 * @extends Library
 * @version 2.2.0
 * @author Jens-Olaf-Mueller
 *
 * Calculator - A self-contained, UI-integrated calculator widget.
 * ===============================================================
 *
 * Provides a fully functional math interface with persistent logic and a "Buddy System".
 * - Key Features:
 * - Buddy System: Seamlessly connects to HTML input elements for data exchange.
 * - Auto-Scanning: Detects DOM elements with `data-calculator="true"` for automatic icon injection.
 * - Math Logic: Sophisticated expression evaluation including unary functions, parentheses, and modulo.
 * - Smart UI: Features a Throttled MutationObserver for dynamic font-size adjustment (overflow prevention).
 * - Persistency: Maintains calculation states and supports repeated "equals" operations.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link show}             - Displays the calculator and optionally assigns a buddy input.
 * - {@link hide}             - Hides the calculator and dispatches the close event.
 * - {@link reset}            - Resets calculation state, displays, and internal memory.
 * - {@link deleteChar}       - Deletes the last character or multi-char operator from the input.
 * - {@link updateDisplay}    - Updates the UI with expressions, numeric results, or error messages.
 * - {@link executeMathFunction} - Executes unary operations (sqrt, power, factorial, etc.).
 * - {@link compute}          - Evaluates the current math expression using the internal Parser.
 * - {@link round}            - Performs symmetric rounding using EPSILON for high precision.
 * - {@link format$}          - Localizes number formatting with digit grouping.
 * - {@link isOperator}       - Validates if a string is a recognized math operator.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #init()            - Singleton initialization of UI, DOM caching, and MutationObserver.
 * - #autoScanBuddies()  - Scans the DOM for inputs requiring a calculator connection.
 * - #injectBuddyIcon() - Injects the SVG trigger icon next to connected input fields.
 * - #handleButtonClick() - Central event dispatcher for all UI button interactions.
 * - #adjustDisplay()    - Dynamic font-size reduction logic to prevent display overflow.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * @event calculatorclosed {@link CustomEvent} - Fires when the calculator is hidden.
 *
* ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * All variables are prefixed with '--calc-' and follow kebab-case naming.
 * - --calc-grid-gap                - Spacing between calculator buttons.
 * - --calc-button-width            - Standard width for calculator buttons.
 * - --calc-button-height           - Standard height for calculator buttons.
 * - --calc-button-border-radius    - Corner radius for standard buttons.
 * - --calc-button-double-border-radius - Corner radius for double-sized buttons.
 * - --calc-button-bg-color         - Background color of the buttons.
 * - --calc-button-text-color       - Text color of the buttons.
 * - --calc-button-special-color    - Color for special operator buttons.
 * - --calc-button-memory-color     - Color for memory-related buttons (MC, MR, etc.).
 * - --calc-display-bg-color        - Background color of the calculator display.
 * - --calc-display-color           - Text color of the main display.
 * - --calc-display-border-radius   - Corner radius of the display area.
 * - --calc-dark-shadow             - Darker shade for the neumorphic depth effect.
 * - --calc-light-shadow            - Lighter shade for the neumorphic depth effect.
 * - --calc-bg1                     - Primary background color stop for the calculator body.
 * - --calc-bg2                     - Secondary background color stop for the calculator body.
 * - --calc-icon-size               - Size of the injected SVG trigger icon.
 * - --calc-icon-color              - Color of the injected SVG trigger icon.
 */
export class Calculator extends Library {
    #observer;

	#buddy = null;
    /**
     * Gets or sets the connected input element (buddy).
     * @type {HTMLElement|null}
     */
    set buddy(element) {
        let resolved = null;
        if (typeof element === 'string') {
            const input = $(element);
            if (input) {
                const type = input.getAttribute('type');
                resolved = (type === 'text' || type === 'number') ? input : null;
            }
        } else if (element instanceof HTMLInputElement) {
            const type = element.getAttribute('type');
            resolved = (type === 'text' || type === 'number') ? element : null;
        }
        this.#buddy = resolved;

        if (this.#buddy) {
            if (!this.created) this.#init();
            // Upgrade manual buddy to data-calculator status
            if (this.#buddy.dataset.calculator !== 'true') {
                this.#buddy.dataset.calculator = 'true';
            }
            this.#injectBuddyIcon(this.#buddy);
            this.DOM?.divCalculatorPod.setAttribute('data-calcbuddy', true);
        }
    }
    get buddy() { return this.#buddy; }

    #displayBuddyIcon = false;
    /**
     * Toggles automatic buddy icon scanning and injection.
     * @type {boolean}
     */
    get displayBuddyIcon() { return this.#displayBuddyIcon; }
    set displayBuddyIcon(flag) {
        this.#displayBuddyIcon = this.toBoolean(flag);
        if (this.#displayBuddyIcon) this.#autoScanBuddies();
    }

	#displayWidth;
    /** @type {number} The available width of the display input */
	get displayWidth() { return this.#displayWidth; }

	memory = 0;
	groupDigits = true;
	decimals = 10;
	error = false;
	operationPending = false;
	calcDone = false;
	currentButton;
	buttonStyle = 0;
	DEF_FONTSIZE = 36;

    /** * Returns the full visible expression (prev + curr) exactly as the user sees it.
     * @type {string}
     */
    get fullExpression() {
        return `${this.prevOperand || ''}${this.currOperand || ''}`;
    }

    /** * True if the current visible expression contains any parentheses.
     * @type {boolean}
     */
    get hasParens() { return /[()]/.test(this.fullExpression); }

    // remember last binary operation for repeated "=" presses
    lastOperator = null;   // e.g. "+", "×", "÷", " mod "
    lastOperand  = null;   // numeric right-hand operand used last time
    lastWasUnary = false;  // true if the last completed action was a unary function like x² etc.

    /** @type {string} Previous operand display value */
	get prevOperand() { return this.#getText('divPrevOperand'); }
	set prevOperand(v = '') { this.#setText('divPrevOperand', v); }

    /** @type {string} Current operand display value */
	get currOperand() { return this.#getText('divInput'); }
	set currOperand(v = '0') { this.#setText('divInput', v); }

    /** @type {string} Memory indicator state */
	get memDisplay() { return this.#getText('divMemory'); }
	set memDisplay(v) { this.#setText('divMemory', v); }

    /** @type {number} Numeric representation of current operand */
	get currValue() { return Number(this.currOperand.replace(NUM_REGEX, '').replace(/,/g, '.')); }
    /** @type {number} Numeric representation of previous operand */
	get prevValue() { return Number(this.prevOperand.replace(NUM_REGEX, '').replace(/,/g, '.')); }

    /** @type {boolean} True if an open bracket is present in current operand */
	get termIsOpen() { return this.currOperand.includes(BRACKET_OPEN); }
    /** @type {boolean} True if the currently pressed button is a digit or PI */
	get isNumeric() {
        return typeof this.currentButton === 'string' && (!isNaN(this.currentButton) || this.currentButton === 'π');
    }
    /** @type {boolean} True if the current button is a bracket */
	get isBracket() { return '()'.includes(this.currentButton); }
    /** @type {string} The last character entered into the display */
	get lastInput() { return this.currOperand.slice(-1); }


    /**
     * @constructor
     * @param {boolean} [autostart=false] - If true, show the calculator immediately.
     * @param {HTMLElement|string|null} [buddy=null] - Initial input element to connect.
     * @param {HTMLElement} [parent=document.body] - Container for the UI.
     */
	constructor(autostart = false, buddy = null, parent = document.body) {
		super(parent);
        /** @type {Parser} — embedded math parser component */
	    this.parser = new Parser({ precision: this.decimals });
        if (buddy !== null) this.buddy = buddy;
        this.#init();
		if (autostart) this.show();
	}

	/**
	 * Initializes calculator UI, caches DOM, starts observer.
	 * Called internally on creation or buddy assignment.
     * Initializes calculator UI exactly once.
     * @private
	 */
    #init() {
        if (this.created) return; // guard for singleton

        this.renderUI(document.body, true);
        this.DOM.divCalculatorPod.addEventListener('click', (e) => this.#handleButtonClick(e));
        this.reset();
        let timeout;
        this.#observer = new MutationObserver(() => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.#adjustDisplay(), 25);
        });

        this.#observer.observe(this.DOM.divInput, {
            childList: true,
            characterData: true,
            subtree: true,
        });

        const fs = this.getStyle(this.DOM.divInput, 'font-size');
        this.DEF_FONTSIZE = fs ? fs.replace(/\D/g, '') : 36;
        this.#autoScanBuddies();
    }

    /**
     * Scans the document for inputs with [data-calculator="true"]
     * and attaches the buddy icon and logic.
     * @private
     */
    #autoScanBuddies() {
        const calcBuddies = $('input[data-calculator="true"]', true);
        calcBuddies.forEach(buddy => this.#injectBuddyIcon(buddy));
    }

    /**
     * Injects the SVG icon as a trigger next to the buddy input.
     * @param {HTMLElement} input - The input field to attach the icon to.
     * @private
     */
    #injectBuddyIcon(input) {
        // Check if icon already exists to avoid duplicates
        if (input.nextElementSibling?.classList.contains('calc-buddy-icon')) return;

        const disabled = input.hasAttribute('disabled');
        const spanIcon = this.createElement('span', {
            classList: 'svg-icon calc-buddy-icon',
            style: { cursor: 'pointer', color: 'var(--calc-icon-color, inherit)' },
            innerHTML: ASSETS.icon,
            onclick: () => {
                if (this.visible || disabled) return;
                this.buddy = input;
                this.show();
            }
        });
        spanIcon.toggleAttribute('disabled', disabled);
        input.after(spanIcon);
    }

    /**
     * Handles keyboard input with advanced shortcuts for functions and memory.
     * Maps physical keys and combinations to calculator buttons.
     *
     * Keyboard Shortcuts:
     * -------------------
     * Standard:
     * - 0-9, +, -, *, /   → Standard Keys (Numpad or Top Row)
     * - =                 → Enter
     * - AC (Clear)        → Escape | Delete
     * - ⌫ (Backspace)     → Backspace
     * - ± (Sign Toggle)   → Space
     * - , | .             → Decimal Separator
     *
     * Advanced Math:
     * - ↵ (Apply to Buddy)→ SHIFT + Enter
     * - n!                → SHIFT + 1
     * - %                 → SHIFT + 5
     * - ( )               → ( ) or SHIFT + 8/9
     * - x²                → AltGr + 2
     * - √                 → AltGr + Q
     *
     * Memory (CTRL + SHIFT):
     * - MC                → C
     * - MR                → R
     * - MS                → S
     * - M+                → +
     * - M-                → -
     *
     * @param {KeyboardEvent} e event
     */
    #handleKeyboard(e) {
        if (!this.visible) return;

        let targetKey = null;
        const code = e.code;
        const key = e.key;
        const isShift = e.shiftKey;
        const isCtrl = e.ctrlKey || e.metaKey; // Mac-Support
        // AltGr ist technisch oft Ctrl+Alt, oder via getModifierState abfragbar
        const isAltGr = e.getModifierState('AltGraph') || (isCtrl && e.altKey);

        // 1. === MEMORY KEYS (CTRL + SHIFT + Letter) ===
        if (isCtrl && isShift) {
            if (code === 'KeyR') targetKey = 'MR';
            else if (code === 'KeyS') targetKey = 'MS';
            else if (code === 'KeyC') targetKey = 'MC';
            else if (key === '+' || code === 'Equal' || code === 'BracketRight') targetKey = 'M+'; // '+' liegt oft verschieden
            else if (key === '-' || code === 'Slash' || code === 'Minus') targetKey = 'M-';
        }

        // 2. === SPECIAL FUNCTIONS (AltGr or Specific Shift-Combos) ===
        else if (isAltGr) {
            if (code === 'Digit2' || key === '²') targetKey = 'x²'; // AltGr+2
            if (code === 'KeyQ' || key === '@')   targetKey = '√';  // AltGr+Q
        }

        // 3. === SHIFT FUNCTION SHORTCUTS ===
        else if (isShift) {
            // Priority Mappings für User-Wünsche
            if (code === 'Enter')  targetKey = '↵';   // Shift+Enter -> Buddy
            else if (code === 'Digit1') targetKey = 'n!';  // Shift+1 -> Fakultät
            else if (code === 'Digit5') targetKey = '%';   // Shift+5 -> Prozent

            // Standard Symbole (Klammern etc.) über den produzierten Key abfangen
            else if (key === '(') targetKey = '(';
            else if (key === ')') targetKey = ')';
            else if (key === '*') targetKey = '×';
            else if (key === '/') targetKey = '÷';
            else if (key === ':') targetKey = '÷'; // Manche Tastaturen
        }

        // 4. === STANDARD KEYS (No modifiers or simple typing) ===
        else {
            if (code === 'Space') targetKey = '±'; // Leertaste toggelt Vorzeichen
            else if (key === 'Enter') targetKey = '=';
            else if (key === 'Escape') targetKey = 'AC';
            else if (key === 'Backspace') targetKey = '⌫';
            else if (key === 'Delete') targetKey = 'AC';

            // Standard Operatoren & Zahlen
            else if (key === '+') targetKey = '+';
            else if (key === '-') targetKey = '-';
            else if (key === '*') targetKey = '×';
            else if (key === '/') targetKey = '÷';
            else if (key === ',' || key === '.') targetKey = ',';
            else if (/\d/.test(key)) targetKey = key; // Zahlen 0-9
        }

        // 5. === EXECUTE ===
        if (targetKey) {
            // Button im DOM suchen (via TextContent)
            // Wir nutzen Array.from, um .find() nutzen zu können
            const buttons = Array.from(this.DOM.divCalculatorPod.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent === targetKey);

            if (btn) {
                e.preventDefault(); // Wichtig: Verhindert z.B. Scrollen bei Space
                btn.click();

                // Visuelles Feedback
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 100);
            }
        }
    }

    /**
     * Shows the calculator.
     * @param {HTMLElement|string|null} [buddy=null] - Optional connected HTML input element.
     * - null           → no buddy assigned
     * - HTMLElement    → input element to display the result
     * - string         → represents the ID of the input element
     */
	show(buddy = null) {
		if (buddy !== null) this.buddy = buddy;
        this.reset();
        super.visible = true; // better than "this.visible" since it shows intention to set initial state!
		this.#displayWidth = this.DOM.divInput.clientWidth;
        if (this.buddy) {
            const value = this.parser.parse(this.buddy.value);
            this.currOperand = (value instanceof Error) ? 0 : value.toString().replace('.', ',');;
        }
        this.#adjustDisplay();

        // Keyboard Listener
        if (!this._onKeyDown) this._onKeyDown = this.#handleKeyboard.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
        $('.all-clear').focus();
        this.log(this);
	}

	/**
     * Hides calculator and dispatches closed event.
     */
	hide() {
        this.visible = false;
        if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
		document.dispatchEvent(new CustomEvent('calculatorclosed'));
	}

	/**
     * Resets current calculation, operands, and memory repetition flags.
     */
	reset() {
		this.currOperand = '0';
		this.prevOperand = '';
		this.memDisplay = (this.memory === 0) ? '' : 'M';
		this.currentButton = null;
		this.error = false;
		this.operationPending = false;
		this.calcDone = false;
		// clear the repeat "=" memory
        this.lastOperator = null;
        this.lastOperand = null;
        this.lastWasUnary = false;
	}

	/**
	 * Deletes the last character (or operator) from the current operand.
	 * Automatically handles multi-character operators like ' mod '.
	 * Resets `operationPending` if the deleted portion matches the active operator.
	 */
	deleteChar() {
		if (!this.currOperand) return;

		const op = this.operationPending;
		const len = (typeof op === 'string' && op.length > 0) ? -op.length : -1;

		if (op && this.currOperand.slice(len) === op)
			this.operationPending = false;

		this.currOperand = this.currOperand.slice(0, len);
		if (!this.currOperand.length) this.currOperand = '0';
	}

	// === GETTERS / SETTERS (Proxy via helper methods) ===

    /** @private */
	#getText(ref) { return this.DOM[ref].textContent; }
    /** @private */
	#setText(ref, val) { this.DOM[ref].textContent = val; }

	/**
	 * Main click handler dispatching to specialized button handlers.
	 * @param {Event} e - Pointer event from the button container.
     * @private
	 */
	#handleButtonClick(e) {
        const btn = e.target.closest('button')?.textContent;
        if (!btn) return;
		this.currentButton = btn;
		if (this.#handleMeta(btn)) return;
		if (this.error) return;
		if (this.#handleMemory(btn)) return;
		if (this.#handleNumeric(btn)) return;
		if (this.#handleOperator(btn)) return;
        if (this.#handleSeparator(btn)) return;
        if (this.#handleBrackets(btn)) return;
		if (this.#handleFunction(btn)) return;
	}

	/** * Handles meta buttons like AC, Delete, and Equals.
     * @param {string} btn - Button label.
     * @returns {boolean} True if handled.
     * @private
     */
	#handleMeta(btn) {
		if (btn === 'AC') { this.reset(); return true; }
		if (btn === '⌫') { this.deleteChar(); return true; }
        if (btn === '=') { this.compute(); return true; }
        if (btn === '↵') {
            if (!this.lastWasUnary) this.compute(); // safe: computes if needed, ignores repeat if calcDone
            if (this.buddy) {
                this.buddy.value = this.currValue.toString().replace('.', ',');
                this.buddy.dispatchEvent(new CustomEvent('input'));
            }
            this.hide();
            return true;
        }
		return false;
	}

	/** * Handles memory operations (MC, MR, MS, M+, M-).
     * @param {string} btn - Button label.
     * @returns {boolean} True if handled.
     * @private
     */
	#handleMemory(btn) {
		if (!btn.startsWith('M')) return false;
		this.currentButton = btn;
		const op = btn.slice(-1);
		if (this.error) return true;
		if (op === 'C') this.memory = 0;
		if (op === 'R' && this.memory !== 0) {
			if (this.operationPending) this.prevOperand = this.currOperand;
			this.currOperand = this.format$(this.memory);
		}
		if (op === 'S') this.memory = this.currValue;
		if (op === '+') this.memory += this.currValue;
		if (op === '-') this.memory -= this.currValue;
		this.memDisplay = (this.memory === 0) ? '' : 'M';
		return true;
	}

	/** * Handles numeric digit inputs.
     * @param {string} btn - Digit or PI.
     * @returns {boolean} True if handled.
     * @private
     */
	#handleNumeric(btn) {
		if (!this.isNumeric) return false;
		if (this.isOperator() || this.calcDone) {
			if (!this.termIsOpen) {
				this.prevOperand = this.currOperand;
				this.currOperand = '';
			}
		}
		this.updateDisplay(btn);
        this.lastWasUnary = false; // user continues typing; leave unary mode
		return true;
	}

	/** * Handles operator selection and chaining.
     * @param {string} btn - Operator label.
     * @returns {boolean} True if handled.
     * @private
     */
	#handleOperator(btn) {
		if (!this.isOperator(btn)) return false;
		if (this.isOperator()) {
			const len = this.operationPending === MODULO ? -5 : -1;
			this.currOperand = this.currOperand.slice(0, len);
		} else if (this.operationPending && !this.termIsOpen) {
			this.compute();
		} else if (this.lastInput === BRACKET_OPEN && btn !== '-') return true;
		if (this.calcDone) this.calcDone = false;
		this.operationPending = btn;
		this.updateDisplay(btn);
        this.lastWasUnary = false; // user continues typing; leave unary mode
		return true;
	}

    /**
     * Handles decimal separator input with context-aware leading zero injection.
     * @param {string} btn - The separator character.
     * @returns {boolean} True if handled.
     * @private
     */
    #handleSeparator(btn) {
        if (btn !== SEPARATOR) return false;

        // Case A: inside parentheses → allow one separator in the innermost term
        if (this.termIsOpen) {
            // prevent double separators like "0,,"
            if (this.lastInput === SEPARATOR) return true;

            // if the last char is "(" or an operator, prepend leading zero
            if (this.lastInput === BRACKET_OPEN || this.isOperator()) this.currOperand += '0';

            // allow only one separator within the innermost "( ... )"
            const expressionIfAdded = this.currOperand + SEPARATOR;
            const lastOpenIdx = this.currOperand.lastIndexOf(BRACKET_OPEN);
            const sepIsValid = expressionIfAdded.lastIndexOf(SEPARATOR) > lastOpenIdx;
            if (sepIsValid) this.updateDisplay(SEPARATOR);
            return true;
        }

        // Case B: no parentheses open
        // If an operator is pending and divPrevOperand is not yet set,
        // shift current → divPrevOperand and start a fresh "0,"
        if (this.operationPending && this.prevOperand === '') {
            this.prevOperand = this.currOperand;
            this.currOperand = '0';
            this.updateDisplay(SEPARATOR);
            return true;
        }

        // If current is empty, or last was an operator, prepend leading zero
        if (!this.currOperand || this.isOperator()) this.currOperand += '0';

        // Only one separator in the current operand (outside of parentheses)
        if (!this.currOperand.includes(SEPARATOR)) this.updateDisplay(SEPARATOR);
        return true;
    }

    /**
     * Handles bracket inputs.
     * @param {string} btn - "(" or ")".
     * @returns {boolean} True if handled.
     * @private
     */
    #handleBrackets(btn) {
        if (!this.isBracket) return false;
        this.updateDisplay(btn);
        return true;
    }

	/** * Handles specialized functions like √, %, n!, etc.
     * @param {string} btn - Function label.
     * @returns {boolean} True if handled.
     * @private
     */
	#handleFunction(btn) {
		if (!FUNCTIONS.includes(btn)) return false;
		this.updateDisplay(this.executeMathFunction(btn));
		return true;
	}

	/**
	 * Updates the calculator display with a given expression or result.
	 * Handles formatting, overflow, and error states automatically.
	 * @param {string|Error|number} expression - The expression or result to display.
	 */
	updateDisplay(expression) {
		if (expression === undefined) return;
		if (expression instanceof Error) {
			this.prevOperand = 'Error';
			this.currOperand = expression.message;
			this.error = true;
		} else if (expression === 'π') {
			this.currOperand = this.format$(this.round(Math.PI));
		} else if (this.currOperand === '0' && this.isNumeric || this.calcDone) {
			this.currOperand = expression;
			this.prevOperand = this.calcDone ? '' : this.prevOperand;
			this.calcDone = false;
		} else if (expression === ',' || this.isOperator(expression) || expression === BRACKET_OPEN) {
			this.currOperand += expression;
		} else if (this.currOperand.length < ASSETS.maxInput) {
			this.currOperand += expression;
			this.currOperand = this.format$(this.currOperand);
		}
	}

	/**
	 * Executes mathematical single-value functions (Unary operations).
	 * @param {string} fnc - Function name.
	 * @returns {string|Error|void} Result string or Error.
	 */
	executeMathFunction(fnc) {
		let result = null;
		switch (fnc) {
			case 'x²':
				result = this.round(this.currValue * this.currValue);
				if (result === Infinity) return new Error(ERR_OVERFLOW);
				this.prevOperand = `(${this.currOperand})²`;
				break;
			case '√':
				if (this.currValue < 0) return new Error(ERR_NEGATIVE_ROOT);
				this.prevOperand = `√(${this.currOperand})`;
				result = Math.sqrt(this.currValue);
				break;
			case '±':
				this.currOperand = this.currOperand.charAt(0) === '-' ?
					this.currOperand.slice(1) : '-' + this.currOperand;
				break;
			case '%':
				if (this.calcDone) this.prevOperand = '';
				if (this.prevValue) {
					const tmp = this.prevOperand + this.format$(this.currValue) + ' %';
					this.currOperand = this.format$(this.currValue / 100);
					result = this.compute();
					this.prevOperand = tmp;
				} else {
					result = this.currValue / 100;
					this.prevOperand = this.format$(this.currValue) + ' %';
				}
				break;
			case '1/x':
				if (this.currValue === 0) return new Error(ERR_DIV_BY_ZERO);
				this.prevOperand = `reciproc(${this.currOperand})`;
				result = 1 / this.currValue;
				break;
			case 'n!':
				if (this.currValue < 0 || parseInt(this.currValue) != this.currValue)
					return new Error(ERR_UNDEFINED);
				result = this.factorial(this.currValue);
				if (result === Infinity) return new Error(ERR_OVERFLOW);
				this.prevOperand = `fact(${this.currOperand})`;
				break;
		}
		if (result) this.currOperand = this.format$(result);
		this.calcDone = result !== null;
        // mark that a unary computation just completed (result may be 0 — still unary!)
        // important for repeated ENTER-logic!
        this.lastWasUnary = (result !== null);
	}

    /**
     * Calculates the factorial of a given number.
     * @param {number} number
     * @returns {number}
     */
	factorial(number) {
		if (number > 170) return Infinity;
		if (number === 0 || number === 1) return 1;
		let result = number;
		while (number > 1) { number--; result *= number; }
		return result;
	}

    /**
     * Computes the current expression using the Parser or internal evaluation.
     * Handles complex parentheses, shorthand logic, and repeated equals presses.
     * @returns {number|void}
     */
    compute() {
        const expr = this.fullExpression;
        // R) Repeat "=" case: user keeps pressing "=" after a completed calc
        // We expect: no pending operator, calcDone = true, and we remember lastOperator/lastOperand
        if (!this.operationPending && this.calcDone && this.lastOperator !== null && this.lastOperand !== null) {
            const a  = this.currValue;          // current displayed result
            const op = this.lastOperator;       // last used operator (string as shown, e.g. "×", " mod ")
            const b  = this.lastOperand;        // last right-hand operand

            let result = this.parser
                ? this.parser.parse(`${a}${op}${b}`)
                : this.evaluate(`${a}${op}${b}`);

            if (result === Infinity) result = new Error(ERR_DIV_BY_ZERO);
            if (result instanceof Error) {
                this.updateDisplay(result);
                return;
            }
            result = this.round(result);

            // show echoed expression and new result
            this.prevOperand = `${this.format$(a)}${op}${this.format$(b)}`;
            this.currOperand = this.format$(result);
            this.calcDone = true;               // still a completed calc
            this.lastWasUnary = false;          // binary calc succeeded → not a unary state anymore
            // lastOperator/lastOperand remain the same → more "=" will continue repeating
            return result;
        }

        // A) Any parentheses present → parser handles full expression on "=" / "↵"
        if (this.hasParens && this.parser) {
            let result = this.parser.parse(expr);
            if (result instanceof Error) {
                // if the previous step was a unary function result, soft-recover: reset instead of error
                if (this.lastWasUnary) {
                    this.reset();
                    return;
                }
                this.updateDisplay(result);
                return;
            }
            result = this.round(result);
            this.prevOperand = expr;                 // keep what the user typed
            this.currOperand = this.format$(result);
            this.calcDone = true;
            this.operationPending = false;

            // We do NOT infer a "last operation" from a complex expression → disable repeat "="
            this.lastOperator = null;
            this.lastOperand  = null;
            return result;
        }

        // B) Shorthand: "a op =" → treat as "a op a"
        if (this.operationPending && (this.isOperator() || this.prevOperand === '')) {
            const a  = this.currValue;
            const op = this.operationPending;

            let result = this.parser
                ? this.parser.parse(`${a}${op}${a}`)
                : this.evaluate(`${a}${op}${a}`);

            if (result === Infinity) result = new Error(ERR_DIV_BY_ZERO);
            if (result instanceof Error) {
                this.updateDisplay(result);
                return;
            }
            result = this.round(result);

            this.prevOperand = `${this.format$(a)}${op}${this.format$(a)}`;
            this.currOperand = this.format$(result);
            this.calcDone = true;
            this.lastWasUnary = false;   // binary calc succeeded → not a unary state anymore
            this.operationPending = false;

            // remember for repeated "="
            this.lastOperator = op;
            this.lastOperand  = a;
            return result;
        }

        // C) Classic binary evaluation (no parentheses)
        if ((this.prevValue === 0 && this.currValue === 0) || !this.operationPending) return;

        let operation = this.operationPending.replace(/[0-9]/g, '');
        if (operation.length > 1 && operation.startsWith('-')) operation = operation.slice(-1);

        // preserve right-hand operand BEFORE we overwrite currOperand with the result
        const right = this.currValue;
        const expression = this.prevValue.toString() + operation + right.toString();

        let result = this.parser ? this.parser.parse(expression) : this.evaluate(expression);
        if (result === Infinity) result = new Error(ERR_DIV_BY_ZERO);
        if (result instanceof Error) {
            this.updateDisplay(result);
            return;
        }
        result = this.round(result);

        this.prevOperand += this.format$(right);
        this.currOperand = this.format$(result);
        this.calcDone = true;
        this.lastWasUnary = false;   // binary calc succeeded → not a unary state anymore
        this.operationPending = false;

        // remember for repeated "=" (a op b .. then .. res op b ..)
        this.lastOperator = this.operationPending || operation;  // keep original op token (e.g. "×" or " mod ")
        this.lastOperand  = right;
        return result;
    }

	/**
	 * Performs symmetric rounding on a number to a specified number of decimal places.
	 * @param {number} num - The number to round.
	 * @param {number} [decimalPlaces=this.decimals] - Precision.
	 * @returns {number} The rounded value.
	 */
	round(num, decimalPlaces = this.decimals) {
		if (Number.isInteger(num)) return num;
		const p = Math.pow(10, decimalPlaces);
		const n = (num * p) * (1 + Number.EPSILON);
		return Math.round(n) / p;
	}

	/**
	 * Formats a numeric expression to a localized string with digit grouping.
	 * @param {string|number} expression - The value to format.
	 * @returns {string} The formatted localized string.
	 */
	format$(expression) {
		if (this.groupDigits) {
            // skip formatting if expression contains anything non-numeric, commas or brackets/operators
            if (typeof expression === 'string' && /[^\d,.\-]/.test(expression)) return expression;
			if (typeof expression === 'number') expression = expression.toString().replaceAll('.', ',');
			else if (this.termIsOpen) return expression;
			else expression = expression.replaceAll('.', '');
			const numParts = expression.split(','),
				int = Number(numParts[0]),
				integers = (int > Math.pow(10, 20)) ? int : int.toLocaleString(),
				decimals = numParts[1];
			return decimals ? integers + ',' + decimals : integers;
		}
		return expression.toString().replace('.', ',');
	}

    /**
     * TODO
     * REVIEW eventually implement new format$()-Method (inherit from Library)
     *   - Problem currently: Math expressions like 12e-125 crash the MutationsObserver !
     *
     * Formats a numeric expression to a localized string with digit grouping.
     * Uses the Library's universal format$ for integer grouping logic.
     * @param {string|number} expression - The value to format.
     * @returns {string} The formatted localized string.
     */
    // format$(expression) {
    //     // 1. Guard
    //     if (typeof expression === 'string' && /[^\d,.\-]/.test(expression)) return expression;
    //     if (this.termIsOpen) return expression;
    //     if (expression === '' || expression == null) return '0';

    //     // 2. Split am Dezimal-Komma (Eingabe ist z.B. "1.000,9")
    //     const str = expression.toString();
    //     const parts = str.split(',');

    //     // 3. SANITIZE: Alle Punkte aus dem Ganzzahl-Teil entfernen!
    //     // Aus "1.000" wird "1000". Das ist entscheidend!
    //     const intRaw = parts[0].replace(/\./g, '');

    //     // 4. Formatierung (Nur Ganzzahl)
    //     // Wir nutzen '#,' um den "Number Mode" zu erzwingen (1 Separator).
    //     // Das sorgt dafür, dass isMask = false ist.
    //     const intFmt = super.format$(intRaw, '#,##', {
    //         useGrouping: this.groupDigits,
    //         locale: 'de-DE'
    //     });

    //     // 5. Merge mit Original-Nachkommastellen
    //     // Das Komma fügen wir manuell wieder an, falls es im Original da war
    //     if (parts.length > 1) return intFmt + ',' + parts[1];

    //     return intFmt;
    // }

	/**
	 * Checks if a character is a recognized math operator.
	 * @param {string} [expression=this.lastInput] - Character to check.
	 * @returns {boolean}
	 */
	isOperator(expression = this.lastInput) { return OPERATORS.includes(expression); }

	/**
	 * Adjusts the font size of the display input to ensure text fits the container width.
     * @private
	 */
	#adjustDisplay() {
		let fntSize = this.DEF_FONTSIZE;
		const output = this.DOM.divInput;
		output.style.fontSize = `${this.DEF_FONTSIZE}px`;
		while (output.clientWidth > this.displayWidth) {
			fntSize--;
			if (fntSize < 16) break;
			output.style.fontSize = `${fntSize}px`;
		}
	}
}

// === ASSETS + CONSTANTS ===
/** @type {Object} Static assets and configuration constants for the calculator */
export const ASSETS = {
	errors: [
		'Wrong parameter type', 'Overflow', 'Negative root', 'Division by zero',
		'Invalid expression', 'Not defined'
	],
	mathOps: [' mod ', '+-×÷ mod ', 'n! x² √ ± % 1/x', ',', '(', ')'],
	maxInput: 21,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
            <g id="svgCalculator" data-name="icon-calculator">
                <path d="M16.5,21.937h-9a2.5,2.5,0,0,1-2.5-2.5V4.563a2.5,2.5,0,0,1,2.5-2.5h9a2.5,2.5,0,0,1,2.5,2.5V19.437A2.5,2.5,0,0,1,16.5,21.937ZM7.5,3.063A1.5,1.5,0,0,0,6,4.563V19.437a1.5,1.5,0,0,0,1.5,1.5h9a1.5,1.5,0,0,0,1.5-1.5V4.563a1.5,1.5,0,0,0-1.5-1.5Z"/>
                <path d="M14.5,9.757h-5A1.5,1.5,0,0,1,8,8.257V6.563a1.5,1.5,0,0,1,1.5-1.5h5a1.5,1.5,0,0,1,1.5,1.5V8.257A1.5,1.5,0,0,1,14.5,9.757Zm-5-3.694a.5.5,0,0,0-.5.5V8.257a.5.5,0,0,0,.5.5h5a.5.5,0,0,0,.5-.5V6.563a.5.5,0,0,0-.5-.5Z"/>
                <circle cx="12" cy="11.508" r="0.75"/>
                <circle cx="15.25" cy="11.508" r="0.75"/>
                <circle cx="8.75" cy="11.508" r="0.75"/>
                <circle cx="12" cy="14.848" r="0.75"/>
                <circle cx="15.25" cy="14.848" r="0.75"/>
                <circle cx="8.75" cy="14.848" r="0.75"/>
                <circle cx="15.25" cy="18.187" r="0.75"/>
                <path d="M12.248,18.687H8.5a.5.5,0,0,1,0-1h3.744a.5.5,0,1,1,0,1Z"/>
            </g>
        </svg>`
};

const [MODULO, OPERATORS, FUNCTIONS, SEPARATOR, BRACKET_OPEN, BRACKET_CLOSE] = ASSETS.mathOps;
const [ERR_TYPEMISMATCH, ERR_OVERFLOW, ERR_NEGATIVE_ROOT, ERR_DIV_BY_ZERO, ERR_INVALID_EXP, ERR_UNDEFINED] = ASSETS.errors;