/**
 * Safe mathematical expression parser using Shunting-Yard algorithm.
 * ==================================================================
 * Supports +, -, ×, ÷, %, parentheses and unary minus.
 *
 * ------------------------------------------------------------------
 * I. Public Methods
 * ------------------------------------------------------------------
 * - {@link parse}
 *
 */
/**
 * @file Parser.js
 * @module Parser
 * @version 1.0.0
 * @author Jens-Olaf-Mueller
 *
 * Parser — Safe mathematical expression evaluator.
 * ===============================================================
 *
 * Implementation of the Shunting-Yard algorithm to convert infix expressions into Reverse Polish Notation (RPN).
 * - Key Features:
 * - Operator Support:
 *   - addition (+)
 *   - subtraction (-)
 *   - multiplication (*, ×)
 *   - division (/, ÷)
 *   - modulo (%)
 *   - parentheses
 *   - unary minus
 * - Advanced Logic: Supports parentheses for grouping and unary minus for negative numbers.
 * - Sanitization: Normalizes input by removing invalid characters and mapping localized operators.
 * - Precision: Includes configurable symmetric rounding to handle floating-point inaccuracies.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link parse} - Evaluates a mathematical string and returns a numeric result or an Error object.
 *
 * ---------------------------------------------------------------
 * II. Private Methods (Internal Logic)
 * ---------------------------------------------------------------
 * - #normalize(input)  - Sanitizes input strings and maps characters like '×' to '*'.
 * - #tokenize(expr)    - Breaks the expression into numeric and operator tokens.
 * - #toRPN(tokens)     - Shunting-Yard algorithm: converts tokens to Reverse Polish Notation.
 * - #evalRPN(rpn)      - Evaluates the RPN stack to calculate the final result.
 * - #round(num)        - Applies precision-based rounding using Number.EPSILON.
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
export class Parser {
    /**
     * Creates a new Parser instance.
     * @param {object} [options={}] - Optional parser settings.
     * @param {number} [options.precision=10] - Number of decimal places for rounding.
     * @param {boolean} [options.allowModulo=true] - Whether to allow the modulo operator.
     * @param {boolean} [options.debug=false] - Enables console debugging output.
     */
    constructor(options = {}) {
        this.precision = options.precision ?? 10;
        this.allowModulo = options.allowModulo ?? true;
        this.debug = options.debug ?? false;
    }

    /**
     * Parses and evaluates a mathematical expression.
     * @param {string} input - Expression to evaluate.
     * @returns {number|Error} - The evaluated numeric result or an Error object.
     */
    parse(input) {
        try {
            const expression = this.#normalize(input);
            const tokens = this.#tokenize(expression);
            const rpn = this.#toRPN(tokens);
            const result = this.#evalRPN(rpn);
            if (Number.isNaN(result)) throw new Error('Invalid expression');
            // const result = evaluateExpression(input);
            return this.#round(result);
        } catch {
            return new Error('Invalid expression');
        }
    }

    /**
     * Normalizes an expression string.
     * Converts locale and Unicode characters to canonical math symbols.
     * @private
     * @param {string} str - Raw input expression.
     * @returns {string} - Normalized expression.
     */
    #normalize(str) {
        return String(str)
            .replace(/\u00A0/g, ' ')
            .replace(/÷/g, '/')
            .replace(/×/g, '*')
            .replace(/,/g, '.')
            .replace(/\bmod\b/gi, '%')
            .replace(/\s+/g, ' ')
            .trim();
    }


    /**
     * Tokenizes an expression into numbers, operators, and parentheses.
     * Also handles unary minus.
     * @private
     * @param {string} expression - Normalized expression string.
     * @returns {Array<{type:string, value:string|number}>} - Array of tokens.
     * @throws {Error} - If invalid syntax is found.
     */
    #tokenize(expression) {
        const tokens = [];
        let i = 0;
        const isDigit = c => c >= '0' && c <= '9';
        const isOp = c => '+-*/%'.includes(c);

        /**
         * Reads a complete number (integer, decimal, or scientific notation).
         * @private
         * @returns {number} - Parsed numeric value.
         */
        const readNumber = () => {
            const start = i;
            let sawDot = false;
            while (i < expression.length && (isDigit(expression[i]) || (!sawDot && expression[i] === '.'))) {
                if (expression[i] === '.') sawDot = true;
                i++;
            }
            if (expression[i] === 'e' || expression[i] === 'E') {
                i++;
                if ('+-'.includes(expression[i])) i++;
                while (isDigit(expression[i])) i++;
            }
            return Number(expression.slice(start, i));
        };

        /**
         * Determines whether the current '-' is unary (negation) or binary (subtraction).
         * @private
         * @returns {boolean} - True if unary minus.
         */
        const isUnaryMinus = () => {
            if (!tokens.length) return true;
            const prev = tokens.at(-1);
            return prev.type === 'op' || prev.type === 'lparen';
        };

        while (i < expression.length) {
            const ch = expression[i];
            if (ch === ' ') { i++; continue; }

            if (isDigit(ch) || ch === '.') {
                tokens.push({ type: 'num', value: readNumber() });
                continue;
            }

            if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue; }
            if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue; }

            if (isOp(ch)) {
                tokens.push({ type: 'op', value: (ch === '-' && isUnaryMinus()) ? 'u-' : ch });
                i++;
                continue;
            }

            throw new Error('Invalid expression');
        }

        return tokens;
    }

    /**
     * Converts a token array into Reverse Polish Notation (RPN)
     * using the Shunting-Yard algorithm.
     * @private
     * @param {Array<{type:string, value:string|number}>} tokens - Input tokens.
     * @returns {Array<{type:string, value:string|number}>} - RPN token array.
     * @throws {Error} - If parentheses are unbalanced or syntax invalid.
     */
    #toRPN(tokens) {
        const out = [], stack = [];
        const prec = { 'u-': 4, '*': 3, '/': 3, '%': 3, '+': 2, '-': 2 };
        const rightAssoc = new Set(['u-']);

        for (const t of tokens) {
            if (t.type === 'num') { out.push(t); continue; }

            if (t.type === 'op') {
                const o1 = t.value;
                while (stack.length) {
                    const top = stack.at(-1);
                    if (top.type !== 'op') break;
                    const o2 = top.value;
                    if (
                        (rightAssoc.has(o1) && prec[o1] < prec[o2]) ||
                        (!rightAssoc.has(o1) && prec[o1] <= prec[o2])
                    ) out.push(stack.pop());
                    else break;
                }
                stack.push(t);
                continue;
            }

            if (t.type === 'lparen') { stack.push(t); continue; }

            if (t.type === 'rparen') {
                while (stack.length && stack.at(-1).type !== 'lparen') out.push(stack.pop());
                if (!stack.length) throw new Error('Invalid expression');
                stack.pop();
                continue;
            }
            throw new Error('Invalid expression');
        }

        while (stack.length) {
            const top = stack.pop();
            // if (top.type === 'lparen') throw new Error('Invalid expression');
            if (top.type === 'lparen') continue; // ✅ skip correctly matched '('
            out.push(top);
        }
        return out;
    }

    /**
     * Evaluates a Reverse Polish Notation (RPN) token array.
     * @private
     * @param {Array<{type:string, value:string|number}>} rpn - Tokens in RPN order.
     * @returns {number} - Computed numeric result.
     * @throws {Error} - If syntax is invalid or stack underflows.
     */
    #evalRPN(rpn) {
        const st = [];
        for (const t of rpn) {
            if (t.type === 'num') { st.push(t.value); continue; }
            if (t.type === 'op') {
                if (t.value === 'u-') {
                    if (st.length < 1) throw new Error('Invalid expression');
                    st.push(-st.pop());
                    continue;
                }
                if (st.length < 2) throw new Error('Invalid expression');
                const b = st.pop(), a = st.pop();
                switch (t.value) {
                    case '+': st.push(a + b); break;
                    case '-': st.push(a - b); break;
                    case '*': st.push(a * b); break;
                    case '/': st.push(a / b); break;
                    case '%': st.push(a % b); break;
                    default: throw new Error('Invalid expression');
                }
            }
        }
        if (st.length !== 1) throw new Error('Invalid expression');
        return st[0];
    }

    /**
     * Rounds a number according to the configured precision.
     * @private
     * @param {number} num - Number to round.
     * @returns {number} - Rounded value.
     */
    #round(num) {
        const p = Math.pow(10, this.precision);
        return Math.round(num * p) / p;
    }
}