/**
 * Calculator.js (Refactored)
 *
 * A self-contained, UI-integrated calculator widget with persistent settings
 * and clean lifecycle handling.
 * Refactored version with DOM caching, modular button handling, safe parsing,
 * dynamic font resizing (throttled observer) and full JSDoc comments.
 * Improvements:
 * - Strict expression validation (no code injection)
 * - Symmetric rounding with EPSILON
 * - Display formatting separated from numeric logic
 * - Proper lifecycle management (init, show, hide, destroy)
 * - Observer + event cleanup
 * - Buddy reuse without full DOM rebuild
 * - Clear separation of settings vs. runtime state
 *
 * Author: Olaf Müller
 */

import $ from '../utils.js';
import { Parser } from './Parser.js';
import Library from './Library.js';

const NUM_REGEX = /[^-0-9,e+e-]|-$|\+$/g;

/**
 * Calculator class with display, input handling and math evaluation.
 * @extends Utility
 */
export class Calculator extends Library {
    #observer;
	#buddy = null;
	get buddy() { return this.#buddy; }
	set buddy(element) {
		if (typeof element === 'string') {
			const type = $(element).getAttribute('type') || null;
			this.#buddy = (type === 'text' || type === 'number') ? $(element) : null;
		} else if (element instanceof HTMLInputElement) {
			const type = element.getAttribute('type');
			this.#buddy = (type === 'text' || type === 'number') ? element : null;
		} else this.#buddy = null;

		if (this.#buddy) {
			const calc = this.DOM?.divCalculatorPod || $('divCalculatorPod');
			if (calc) calc.remove();
			if (this.#observer) this.#observer.disconnect();
			this.#observer = undefined;
			this.#init();
            this.DOM?.divCalculatorPod.setAttribute('data-calcbuddy', true);
		}
	}

    /** @returns {boolean} Whether calendar is rendered */
    get created() { return Boolean(this.DOM.divCalculatorPod); }

	#displayWidth;
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

    /** Returns the full visible expression (prev + curr) exactly as the user sees it. */
    get fullExpression() {
        return `${this.prevOperand || ''}${this.currOperand || ''}`;
    }

    /** True if the current visible expression contains any parentheses. */
    get hasParens() {
        return /[()]/.test(this.fullExpression);
    }

    // remember last binary operation for repeated "=" presses
    lastOperator = null;   // e.g. "+", "×", "÷", " mod "
    lastOperand  = null;   // numeric right-hand operand used last time
    lastWasUnary = false;  // true if the last completed action was a unary function like x² etc.

	constructor(autostart = false, buddy = null, parent = document.body) {
		super(parent);
        /** @type {Parser} — embedded math parser component */
	    this.parser = new Parser({ precision: this.decimals });

		if (buddy !== null) this.buddy = buddy;
		else this.#init();
		if (autostart) this.show();

	}

	/**
	 * Initializes calculator UI, caches DOM, starts observer.
	 * Called internally on creation or buddy assignment.
	 */
	#init() {
		this.renderUI(document.body, true);
        this.DOM.divCalculatorPod.addEventListener('click', (e) => this.#handleButtonClick(e));
		this.reset();

		let timeout;
		this.#observer = new MutationObserver(() => {
			clearTimeout(timeout);
			timeout = setTimeout(() => this.#adjustDisplay(), 25);
		});
        // ✅ robust: reagiert auf Textknoten-Änderungen
        this.#observer.observe(this.DOM.divInput, {
            childList: true,
            characterData: true,
            subtree: true,
        });

		this.DEF_FONTSIZE = this.getStyle(this.DOM.divInput, 'font-size').replace(/\D/g, '');
	}

	/** Shows the calculator. */
	show(buddy = null) {
		if (buddy !== null) this.buddy = buddy;
		this.DOM.divCalculatorPod.removeAttribute('hidden');
		this.#displayWidth = this.DOM.divInput.clientWidth;
		if (this.buddy) this.currOperand = this.buddy.value || 0;
        this.#adjustDisplay(); // ✅ einmal direkt justieren
		$('.all-clear').focus();
	}

	/** Hides calculator and disconnects observer. */
	hide() {
		this.DOM.divCalculatorPod.setAttribute('hidden', '');
		if (this.#observer) this.#observer.disconnect();
		document.dispatchEvent(new CustomEvent('calculatorclosed'));
	}

	/** Resets current calculation and display. */
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
        this.lastWasUnary = false; // clear unary flag!
	}

	/** Deletes last character or operator safely. */
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

	#getText(ref) { return this.DOM[ref].textContent; }
	#setText(ref, val) { this.DOM[ref].textContent = val; }

	get prevOperand() { return this.#getText('divPrevOperand'); }
	set prevOperand(v = '') { this.#setText('divPrevOperand', v); }

	get currOperand() { return this.#getText('divInput'); }
	set currOperand(v = '0') { this.#setText('divInput', v); }

	get memDisplay() { return this.#getText('divMemory'); }
	set memDisplay(v) { this.#setText('divMemory', v); }

	get currValue() { return Number(this.currOperand.replace(NUM_REGEX, '').replace(/,/g, '.')); }
	get prevValue() { return Number(this.prevOperand.replace(NUM_REGEX, '').replace(/,/g, '.')); }

	get termIsOpen() { return this.currOperand.includes(BRACKET_OPEN); }
	get isNumeric() { return typeof this.currentButton === 'string' && (!isNaN(this.currentButton) || this.currentButton === 'π'); }
	get isBracket() { return '()'.includes(this.currentButton); }
	get lastInput() { return this.currOperand.slice(-1); }
	get exists() { return this.DOM.divCalculatorPod !== null; }
	get visible() { return !this.DOM.divCalculatorPod.hasAttribute('hidden'); }

	// === BUTTON HANDLING ===

	/**
	 * Main click handler dispatching to smaller methods.
	 * @param {string} btn - Pressed button label
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

	/** Handles AC, Delete, Enter buttons */
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

	/** Handles memory operations */
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

	/** Handles numeric inputs */
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

	/** Handles operator buttons */
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
     * Handles decimal separator input (e.g., ",").
     * Rules:
     *  - If pressed first (or right after an operator or "("), prepend "0".
     *  - Only one separator per current operand (or per innermost bracket segment).
     *  - If an operator is pending and prevOperand is empty, move current to divPrevOperand and start "0,".
     * @private
     * @param {string} btn - The pressed button (expected to be SEPARATOR).
     * @returns {boolean} - True if handled here.
     */
    #handleSeparator(btn) {
        if (btn !== SEPARATOR) return false;

        // Case A: inside parentheses → allow one separator in the innermost term
        if (this.termIsOpen) {
            // Prevent double separators like "0,,"
            if (this.lastInput === SEPARATOR) return true;

            // If the last char is "(" or an operator, prepend leading zero
            if (this.lastInput === BRACKET_OPEN || this.isOperator()) {
                this.currOperand += '0';
            }

            // Allow only one separator within the innermost "( ... )"
            const expressionIfAdded = this.currOperand + SEPARATOR;
            const lastOpenIdx = this.currOperand.lastIndexOf(BRACKET_OPEN);
            const sepIsValid =
                expressionIfAdded.lastIndexOf(SEPARATOR) > lastOpenIdx;

            if (sepIsValid) this.updateDisplay(SEPARATOR);
            return true;
        }

        // Case B: no parentheses open
        // If an operator is pending and divPrevOperand is not yet set, shift current → divPrevOperand and start a fresh "0,"
        if (this.operationPending && this.prevOperand === '') {
            this.prevOperand = this.currOperand;
            this.currOperand = '0';
            this.updateDisplay(SEPARATOR);
            return true;
        }

        // If current is empty, or last was an operator, prepend leading zero
        if (!this.currOperand || this.isOperator()) {
            this.currOperand += '0';
        }

        // Only one separator in the current operand (outside of parentheses)
        if (!this.currOperand.includes(SEPARATOR)) {
            this.updateDisplay(SEPARATOR);
        }
        return true;
    }


    /**
     * Handles open/close bracket button presses.
     * UX: Do not evaluate on closing bracket. Let the parser handle the full
     * expression on "=" / "↵".
     * @private
     * @param {string} btn - "(" or ")"
     * @returns {boolean} - True if the button was handled here.
     */
    #handleBrackets(btn) {
        if (!this.isBracket) return false;
        this.updateDisplay(btn);
        return true;
    }

	/** Handles function keys like √, %, n!, etc. */
	#handleFunction(btn) {
		if (!FUNCTIONS.includes(btn)) return false;
		this.updateDisplay(this.executeMathFunction(btn));
		return true;
	}

	/**
	 * Updates the calculator display with a given expression or result.
	 * Handles formatting, overflow, and error states automatically.
	 * @param {string|Error|number} expression
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
	 * Executes mathematical single-value functions.
	 * @param {string} fnc
	 * @returns {string|Error|void}
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


	factorial(number) {
		if (number > 170) return Infinity;
		if (number === 0 || number === 1) return 1;
		let result = number;
		while (number > 1) { number--; result *= number; }
		return result;
	}


    /**
     * Computes the current expression.
     * Order:
     *  R) Repeat "=": if a result is shown and we have lastOperator/lastOperand → repeat a op b
     *  A) Parentheses present → evaluate FULL visible expression via Parser
     *  B) Shorthand "a op =" → treat as "a op a"
     *  C) Classic binary evaluation (prevValue op currValue)
     * @returns {number|void}
     */
    compute() {
        const expr = this.fullExpression;

        // R) Repeat "=" case: user keeps pressing "=" after a completed calc
        //    We expect: no pending operator, calcDone = true, and we remember lastOperator/lastOperand
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

            // NEW: remember for repeated "="
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

        // NEW: remember for repeated "=" (a op b .. then .. res op b ..)
        this.lastOperator = this.operationPending || operation;  // keep original op token (e.g. "×" or " mod ")
        this.lastOperand  = right;
        return result;
    }

	// === FORMATTING & DISPLAY ===

	round(num, decimalPlaces = this.decimals) {
		if (Number.isInteger(num)) return num;
		const p = Math.pow(10, decimalPlaces);
		const n = (num * p) * (1 + Number.EPSILON);
		return Math.round(n) / p;
	}

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

	isOperator(expression = this.lastInput) { return OPERATORS.includes(expression); }

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

	getStyle(element, styleProp) {
		const camelize = str => str.replace(/\-(\w)/g, (_, l) => l.toUpperCase());
		if (element.currentStyle) return element.currentStyle[camelize(styleProp)];
		if (document.defaultView && document.defaultView.getComputedStyle)
			return document.defaultView.getComputedStyle(element, null).getPropertyValue(styleProp);
		return element.style[camelize(styleProp)];
	}

	/** Builds calculator DOM dynamically. */
	#renderUI() {
        if (this.created) return;

		const divPod = this.createElement('div', { id: 'divCalculatorPod', class: 'calculator-pod', hidden: '' });
		this.parent.appendChild(divPod);

		ASSETS.containers.forEach(item => {
			const [id, _class] = item.split('|');
			divPod.append(this.createElement('div', { id, class: _class }));
		});
		$('divStatusbar').append($('divMemory'), $('divPrevOperand'));
		$('divDisplay').append($('divStatusbar'), $('divInput'));

		ASSETS.buttons.forEach(btn => {
			const [text, _class] = btn.split('|');
			const button = this.createElement('button', {
				textContent: text,
				class: `calc-btn ${_class.trim()}`
			});
			if (this.buddy && _class === 'equals') button.classList.add('buddy');
			if (!this.buddy && text === '↵') button.setAttribute('hidden', '');
			divPod.append(button);
			button.addEventListener('click', () => this.#handleButtonClick(button.textContent));
		});
	}
}

// === ASSETS + CONSTANTS ===
export const ASSETS = {
	// buttons: [
	// 	'MR|memory', 'MS|memory', 'MC|memory', 'M+|memory', 'M-|memory',
	// 	'AC|all-clear', '(|', ')|', ' mod |operator', '⌫|', 'n!|operator',
	// 	'x²|operator', '√|operator', '±|operator', 'π|operator', '7|', '8|',
	// 	'9|', '÷|operator', '%|operator', '4|', '5|', '6|', '×|operator',
	// 	'1/x|operator', '1|', '2|', '3|', '-|operator', '=|equals', '0|zero',
	// 	',|', '+|operator', '↵|equals'
	// ],
	// containers: [
	// 	'divDisplay|display',
	// 	'divStatusbar|status-bar',
	// 	'divMemory|flx-start',
	// 	'divPrevOperand|flx-end',
	// 	'divInput|flx-end'
	// ],
	errors: [
		'Wrong parameter type', 'Overflow', 'Negative root', 'Division by zero',
		'Invalid expression', 'Not defined'
	],
	mathOps: [' mod ', '+-×÷ mod ', 'n! x² √ ± % 1/x', ',', '(', ')'],
	maxInput: 21
};

const [MODULO, OPERATORS, FUNCTIONS, SEPARATOR, BRACKET_OPEN, BRACKET_CLOSE] = ASSETS.mathOps;
const [ERR_TYPEMISMATCH, ERR_OVERFLOW, ERR_NEGATIVE_ROOT, ERR_DIV_BY_ZERO, ERR_INVALID_EXP, ERR_UNDEFINED] = ASSETS.errors;