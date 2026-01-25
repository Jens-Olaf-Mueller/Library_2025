import $, { format$ } from '../utils.js';
import { OBJ_COMPONENTS } from '../constants.js';

/**
 * Library — Universal base class for UI components
 * ===============================================================
 *
 * Provides a consistent foundation for UI components that need:
 * - a main DOM element reference (`element`) and an optional parent class or element (`parent`)
 * - a shared DOM cache (`this.DOM`) populated by `renderUI()`
 * - a visibility toggle that maps to the `hidden` attribute (`visible`)
 * - an enabled propery ( can be used for CSS styling )
 * - a safe element factory (`createElement()`) supporting:
 *   - event binding via `on*` keys
 *   - boolean attribute semantics (presence/absence)
 *   - style objects and text helpers
 *   - special handling for <li value="..."> to preserve non-integer values
 * - event dispatch helper (`_raiseEvent()`) for component communication
 * - string transformation utilities (`stringTo()`) used across components
 * - UI skeleton creation from `OBJ_COMPONENTS` via `renderUI()` with optional CSS injection
 *
 * Notes:
 * - `renderUI()` builds a component tree from `OBJ_COMPONENTS`, caches IDs into `this.DOM`,
 *   and stores the component root element in `this.rootElement`.
 * - `_injectCSS()` injects :root CSS variables from `OBJ_COMPONENTS` and applies protected inline defaults.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 *
 * - {@link properties}           - returns readable/writable property names (optionally includes read-only getters)
 *
 * - {@link isClassInstance}      - checks whether a value is a class instance (not a plain object)
 * - {@link arrayIsTypeOf}        - checks whether an array contains only a specific primitive/object type
 * - {@link toBoolean}            - coerces heterogeneous truthy values into a boolean
 * - {@link stringTo}             - converts a string to camel/kebab/snake/caps/camel-dash or parses to an object
 * - {@link createElement}        - creates/updates an element from an attribute map (props, attrs, events, booleans)
 * - {@link setCSSProperty}       - sets a CSS custom property on :root or an element
 * - {@link getCSSProperty}       - reads a CSS custom property from :root or an element
 * - {@link renderUI}             - builds and appends the component DOM tree from `OBJ_COMPONENTS` (recursive builder)
 * - {@link log}                  - global log system for debugging and component messages
 *
 * ---------------------------------------------------------------
 * II. Protected / Internal Methods
 * ---------------------------------------------------------------
 * - {@link _raiseEvent}          - dispatches a CustomEvent from element/parent/document with `detail`
 * - {@link _injectCSS}           - injects component CSS variables and applies protected inline defaults
 *
 * ---------------------------------------------------------------
 * III. Private Methods
 * ---------------------------------------------------------------
 * - {@link #setElement()}          - resolves a DOM reference from an HTMLElement or an ID string
 *
 *  @version 2.1.0
 */
export default class Library {
    #rootElement = null;
    /**
     * Determines the root element (i.e. overlay) for a visual component.
     * Set by renderUI()
     * @type {HTMLElement|null}
     */
    get rootElement() { return this.#rootElement; }
    set rootElement(elmt) {
        this.#rootElement = this.#setElement(elmt);
    }

    /** @returns {boolean} Whether a component has been rendered already */
    get created() { return Boolean(this.rootElement); }

    #element = null;
    /**
     * Returns the currently assigned main DOM element.
     * @type {HTMLElement|null}
     */
    get element() { return this.#element; }
    set element(expression) {
        this.#element = this.#setElement(expression);
    }

    #includeReadOnlyProperties = false; // default behaviour
    /**
     * Whether `.properties` should include read-only getters.
     * @type {boolean}
     */
    get includeReadOnlyProperties() { return this.#includeReadOnlyProperties; }
    set includeReadOnlyProperties(flag) {
        if (typeof flag === 'boolean') this.#includeReadOnlyProperties = flag;
    }

    /**
     * Returns all readable and writable property names of this instance.
     * Includes read-only getters only if `includeReadOnlyProperties` is true.
     * @returns {string[]}
     */
    get properties() {
        const props = [];
        let proto = this.constructor.prototype;
        const descriptors = {};

        // collect all prototypes in the chain
        while (proto && proto !== Object.prototype) {
            Object.assign(descriptors, Object.getOwnPropertyDescriptors(proto));
            proto = Object.getPrototypeOf(proto);
        }
        for (const [key, d] of Object.entries(descriptors)) {
            const hasGetter = typeof d.get === 'function';
            const hasSetter = typeof d.set === 'function';
            if (hasGetter && (hasSetter || this.includeReadOnlyProperties)) {
                props.push(key);
            }
        }

        // Add instance (public) fields
        for (const key of Object.keys(this)) {
            if (!props.includes(key)) props.push(key);
        }
        return props;
    }

    #parent = null;
    /**
     * Gets or sets the parent element of this instance.
     * @type {String | HTMLElement | Class | null}
     */
    get parent() { return this.#parent; }
    set parent(expression) {
        const elmt = this.#setElement(expression);
        if (this.isClassInstance(expression)) {
            this.#parent = expression;
        } else if (elmt instanceof HTMLElement || elmt === null) {
            this.#parent = elmt;
        } else {
            console.warn('[Library] Parent element not found:', expression);
        }
    }

    /**
     * Returns the current project folder path.
     * Example: "/Library_2025/"
     * @returns {string}
     */
    get projectFolder() {
        const path = window.location.pathname;
        return path.substring(0, path.lastIndexOf('/') + 1);
    }

    /** @type {'ios'|'android'|'desktop'|null} */
    static #detectedEngine = null;
    /**
     * Detects the current operating system/engine.
     * Uses a static cache to avoid redundant parsing of the UserAgent.
     * * @returns {'ios'|'android'|'desktop'}
     */
    get engine() {
        if (Library.#detectedEngine) return Library.#detectedEngine;

        const ua = navigator.userAgent || navigator.vendor || window.opera;

        // iOS Detection (iPhone, iPad, iPod)
        // NOTE  Modern iPads might report as "MacIntel", so we check for touch support.
        if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
            Library.#detectedEngine = 'ios';
        } else if (/android/i.test(ua)) {
            // Android Detection
            Library.#detectedEngine = 'android';
        } else {
            // Fallback for Windows, macOS, Linux
            Library.#detectedEngine = 'desktop';
        }
        return Library.#detectedEngine;
    }

    #visible = false;
    /**
     * Controls component visibility.
     * Automatically calls show() / hide() if available,
     * and synchronizes with the 'hidden' DOM attribute.
     * @type {boolean}
     */
    get visible() { return this.#visible; }
    set visible(flag) {
        const state = this.toBoolean(flag);
        if (this.#visible === state) return; // avoid endless loop by .show() / .hide()
        this.#visible = state;

        const priorElement = this.rootElement ? this.rootElement : this.#element;
        if (priorElement) priorElement.toggleAttribute('hidden', !state);

        if (state && typeof this.show === 'function') this.show();
        else if (!state && typeof this.hide === 'function') this.hide();
    }

    /** @type {boolean} Global toggle to mute / unmute haptics */
    #enabled = false;
    get enabled() { return this.#enabled; }
    set enabled(flag) { this.#enabled = this.toBoolean(flag); }


    #debugMode = false || location.hostname === 'localhost' ||
                          location.hostname === '127.0.0.1' ||
                          location.hostname === '::1';
    /**
     * Determines the component's debug mode.
     * By default it is switched off in web applications and on on locals hosts.
     * @type {boolean}
     */
    get debugMode() { return this.#debugMode; }
    set debugMode(flag) {
        this.#debugMode = this.toBoolean(flag);
    }

    /**
     * Provides a list of all HTML boolean attributes
     * Used in Method {@link createElement()}
     *
     * REVIEW eventually we need to add 'switch' to the list for iOS
     */
    get booleanAttributes() {
        return new Set([
            'disabled', 'checked', 'readonly', 'required', 'hidden',
            'multiple', 'selected', 'autofocus', 'open'
        ]);
    }


    /**
     * @constructor Creates a new base Library instance.     *
     * @param {string | HTMLElement | Class | null} parent parent of the instance
     * - string:    → represents an ID for the parent element
     * - HTML:      → element is the parent itself
     * - Class:     → declares the parent class of a component
     * - null:      → no parent set
     */
    constructor(parent = null) {
        this.parent = parent;
        this.DOM = {};
    }

    /**
     * Resolves whether a given expression is meant to be an ID for an HTML element
     * or the element itself. If an ID does not exist, 'null' is gonna be returned
     * @param {string|HTMLElement|null} expression
     * @returns {HTMLElement|undefined}
     */
    #setElement(expression) {
        if (!expression) return null;

        let elmt = null;
        if (typeof expression === 'string') elmt = $(expression);
        else if (expression instanceof HTMLElement) elmt = expression;
        return elmt || null;
    }

    /**
     * Dispatches a custom event with optional details.
     * Used internally for communication between modules or DOM hooks.
     * @param {string} type - The event type.
     * @param {object} [detail={}] - Additional event data.
     * @returns {boolean} Whether the event was not canceled.
     */
    _raiseEvent(type, detail = {}, cancelable = true) {
        if (!(this instanceof Library)) {
            throw new Error('Unauthorised access to this method. Only Library subclasses may raise events.');
        }
        if (typeof type !== 'string' || !type.length) return false;
        const event = new CustomEvent(type, {
            detail,
            bubbles: true,
            cancelable: cancelable,
            composed: true
        });
        const target = this.#element || this.#parent || document;
        return target.dispatchEvent(event);
    }

    /**
     * Determines whether a given object is an instance of any class
     * (user-defined or built-in), as opposed to a plain object.
     * @param {*} object - The value to check.
     * @returns {boolean} True if it's a class instance, false otherwise.
     */
    isClassInstance(object) {
        if (object == null || typeof object !== 'object') return false;
        const proto = Object.getPrototypeOf(object);
        // null prototype (Object.create(null)) and
        // plain object check: prototype is exactly Object.prototype
        if (!proto || proto === Object.prototype) return false;
        // everything else that has a constructor is a class instance
        return typeof proto.constructor === 'function';
    }

    /**
     * Checks if an array contains only values of the given type
     * @param {Array} arr array to be checked
     * @param {'string' | 'number' | 'boolean' | 'object' | 'array'} type the type of the checked array
     * @see {@link Array.prototype.isTypeOf} Array.prototype-extention
     * @returns {Boolean} true | false
     */
    arrayIsTypeOf(arr, type = 'string') {
        const map = {
            string:   v => typeof v === 'string',
            number:   v => typeof v === 'number' && !Number.isNaN(v),
            boolean:  v => typeof v === 'boolean',
            array:    v => Array.isArray(v),
            object:   v => v !== null && typeof v === 'object' &&
                        Object.prototype.toString.call(v) === '[object Object]'
        };

        return Array.isArray(arr) && map[type]?.call(null, arr[0]) !== undefined
            ? arr.every(map[type])
            : false;
    }

	/**
	 * Coerce heterogeneous "truthy" inputs into booleans.
     *
	 * Accepts:
     * - true | false
     * - 1 | 0
     * - "true" | "yes" | "on" | "1" => true
	 * @param {any} expression any expression to be checked if it is a valid boolean value
	 * @returns {boolean} true | false
	 */
	toBoolean(expression) {
		if (typeof expression === 'boolean') return expression;
		if (typeof expression === 'number') return Boolean(expression);
		if (typeof expression === 'string') {
			switch (expression.toLowerCase().trim()) {
				case 'true': case '1': case 'yes': case 'on': return true;
			}
		}
		return false;
	}

    /**
     * Transforms a given string into a specific case or object format.
     * Auto-detects the source format when no mode is given.
     *
     * @param {string} str - The input string to transform.
     * @param {'camel'|'kebab'|'caps'|'snake'|'camel-dash'|'object'} [mode] - Transformation mode.
     * @returns {string|Object} - Transformed string or object.
     */
    stringTo(str, mode) {
        if (typeof str !== 'string') return str;

        const normalize = s => s.trim();

        // Auto-detect mode if not specified
        if (!mode) {
            if (/^[a-z]+([A-Z][a-z]*)+$/.test(str)) mode = 'kebab';        // camelCase → kebab
            else if (str.includes('-')) mode = 'camel';                    // kebab-case → camel
            else if (str.includes('_')) mode = 'camel';                    // snake_case → camel
            else if (str.includes(':') && str.includes(',')) mode = 'object';
            else mode = 'caps';                                            // fallback
        }

        switch (mode) {
            case 'camel': // "div-calendar-footer" → "divCalendarFooter"
                return normalize(str).toLowerCase()
                    .replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
            case 'kebab': // "divCalendarFooter" → "div-calendar-footer"
                return normalize(str)
                    .replace(/([a-z])([A-Z])/g, '$1-$2')
                    .replace(/[\s_]+/g, '-')
                    .toLowerCase();
            case 'camel-dash': // "schleswigHolstein" → "Schleswig-Holstein"
                return normalize(str)
                    .replace(/([a-z])([A-Z])/gu, '$1-$2')
                    .replace(/^.|(?<=-)\p{L}/gu, c => c.toUpperCase());
            case 'snake': // "divCalendarFooter" → "div_calendar_footer"
                return normalize(str)
                    .replace(/([a-z])([A-Z])/g, '$1_$2')
                    .replace(/[\s-]+/g, '_')
                    .toLowerCase();
            case 'caps': // Fixed Umlaut bug (Unicode-aware)
                // old: /\b\w/g  → fails on 'ö', 'ä', 'ü'
                // new: /(^|\s|-)\p{L}/gu → matches any Unicode letter after space/hyphen/start
                return normalize(str)
                    .toLowerCase()
                    .replace(/(^|\s|-)\p{L}/gu, str => str.toUpperCase());
            case 'object': // "display:flex, flexDirection:column" → {display:'flex', flexDirection:'column'}
                return Object.fromEntries(
                    str.split(',')
                    .map(s => s.split(':').map(v => v.trim())));
            default:
                this.log(`Library.stringTo(): Unknown mode "${mode}"`, 'warn');
                return str;
        }
    }

    /**
     * Creates or updates an element with attributes, properties and events.
     * - "on*" keys with functions attach event listeners.
     * - Known DOM properties are set as properties (booleans rely on reflection).
     * - Unknown keys fall back to HTML attributes (with boolean semantics).
     *
     * @param {HTMLElement | string} tagOrElement - The element or its tag name.
     * @param {object} [attributes={}] - Key/value pairs.
     * @returns {HTMLElement|undefined}
     */
    createElement(tagOrElement, attributes = {}) {
        if (tagOrElement == null) return undefined;
        let element = tagOrElement;
        if (typeof tagOrElement === 'string') {
            element = document.createElement(tagOrElement);
        } else if (!(tagOrElement instanceof HTMLElement)) {
            return undefined;
        }

        const toBool = (val) => val === '' || val === true || val === 'true' || val === 1 || val === '1';

        // Filter: only allow valid values or Boolean special cases
        const cleanAttrs = Object.fromEntries(
            Object.entries(attributes).filter(([key, val]) => {
                if (this.booleanAttributes.has(key)) return true;       // may be empty!
                return val != null && val !== '';                       // keep 'real' values
            })
        );

        for (const [key, value] of Object.entries(cleanAttrs)) {
            if (key.startsWith('on') && typeof value === 'function') {
                // 1) Event listeners
                const event = key.slice(2).toLowerCase();
                element.addEventListener(event, value);
            } else if (this.booleanAttributes.has(key)) {
                if (value === false || value === 'false') continue;     // do not set "false"
                element.setAttribute(key, '');                          // empty = true
            } else if (key === 'style' && value && typeof value === 'object') {
                // 2) Style object convenience
                Object.assign(element.style, value);
            } else if (key === 'text' || key === 'textContent') {
                element.textContent = value ?? '';
            } else if (key === 'value' && element instanceof HTMLLIElement) {
                // special case: value of <li>-element must be set as attribute!!!
                // otherwise it will be converted by the browser to integer: (value = 2.75  => 2)!!!
                element.setAttribute('value', value);
            } else if (key in element) {
                // 3) Known DOM property
                if (typeof element[key] === 'boolean') {
                    element[key] = toBool(value);
                } else {
                    element[key] = value;
                    // 🔽 PATCH: cache sub-elements with IDs (for innerHTML blocks like checkboxes)
                    if (key === 'innerHTML' && this.DOM && element.querySelectorAll) {
                        element.querySelectorAll('[id]').forEach(child => {
                            this.DOM[child.id] = child;
                        });
                    }
                }
            } else if (value === false || value == null) {
                // 4) Remove falsy attributes
                element.removeAttribute(key);
            } else if (value === true || value === '') {
                // 5) Boolean attribute presence
                element.setAttribute(key, '');
            } else {
                // 6) Fallback to string conversion
                element.setAttribute(key, String(value));
            }
        }
        return element;
    }

    /**
     * Sets a CSS custom property (variable) on the given target element.
     * If no target is specified, the variable will be applied globally (":root").
     * @param {string} name - The CSS variable name (must start with "--").
     * @param {string|number} value - The value to assign.
     * @param {HTMLElement|string} [target='root'] - Optional target element or "root".
     * @returns {boolean} true | false depending on success or failure
     */
    setCSSProperty(name, value, target = 'root') {
        if (typeof name !== 'string') return false;
        const cssVar = this.#cssNormalizeVariable(name),
              elmt = this.#cssGetVarTarget(target);
        if (!elmt) return false;
        elmt.style.setProperty(cssVar, String(value));
        return true;
    }

    /**
     * Returns the current value of a CSS custom property (variable).
     * Reads from the specified target or globally from ":root".
     * @param {string} name - The CSS variable name (must start with "--").
     * @param {HTMLElement|string} [target='root'] - Optional target element or "root".
     * @returns {string|undefined} The variable value, or undefined if not found.
     */
    getCSSProperty(name, target = 'root') {
        if (typeof name !== 'string') return undefined;
        const cssVar = this.#cssNormalizeVariable(name),
              elmt = this.#cssGetVarTarget(target);
        if (!elmt) return undefined;
        const style = getComputedStyle(elmt);
        return style.getPropertyValue(cssVar)?.trim() || undefined;
    }

    /**
     * Returns the computed style value of a given property for an element.
     * Uses the internal stringTo() method for consistent property naming.
     * @param {HTMLElement|string} expression - Element or ID string.
     * @param {string} styleProp - CSS property name (e.g., 'font-size' or 'backgroundColor').
     * @returns {string|undefined}
     */
    getStyle(expression, styleProp) {
        const elmt = (expression instanceof HTMLElement) ? expression : (this.DOM[expression] || $(expression));
        if (!elmt) return undefined;

        const cssProperty = this.stringTo(styleProp, 'kebab');
        if (window.getComputedStyle) {
            return window.getComputedStyle(elmt, null).getPropertyValue(cssProperty);
        }

        // Fallback for very old environments or inline styles in camelCase
        return elmt.style[this.stringTo(styleProp, 'camel')];
    }

    /**
     * Makes sure that we get or set a valid CSS variable name
     * @param {string} name CSS variable name to be normalized
     * @returns {string} a valid CSS-varname
     */
    #cssNormalizeVariable(name) {
        return name.startsWith('--') ? name.trim() : `--${name.trim()}`;
    };

    /**
     * Determines where a CSS variable is located:
     * On the specified target or globally from ":root".
     * @param {HTMLElement|string} [target='root'] - Optional target element or "root"
     * @returns {HTMLElement|undefined}
     */
    #cssGetVarTarget(target = 'root') {
        return target === 'root'
            ? document.documentElement
            : (target instanceof HTMLElement ? target : this.#element);
    }

    /**
     * Internal logging helper
     * @param {string} expression the expression to be logged out
     * @param {'log'|'warn'|'error'|'info'|'dir'|'table'|'assert'|'time'|'trace'|'count'} method the console method to be executed
     * @param {boolean} bold determines whether expression is printed bold or not
     */
    log(expression, method = 'log', bold = false) {
        if (this.debugMode) {
            if (this.isClassInstance(expression) || typeof expression === 'object') {
                console.log(expression);
            } else if (typeof expression === 'string') {
                method = method.toLowerCase();
                const methods = ['log','warn','error','info','dir','table','assert','time','trace','count']
                const component = this.constructor.name || null;
                const isError = (method === 'error');
                const color = {
                    WheelPicker: '#ffff00',
                    Calculator:  '#d2b48c',
                    MessageBox:  '#daa520',
                    Calendar:    '#00ffff',
                    Haptic:      '#00ff00'
                }
                let style = isError ? 'color: #ff0000;': `color: ${color[component] || '#666'};`;
                style += (bold || color[component] === undefined) && !isError ? ' font-weight: bold;' : '';

                if (methods.includes(method)) {
                    if (component) console.group(`%c${component}`, style);
                    console[method](`%c${expression}`, style);
                    if (component) console.groupEnd();
                } else {
                    // fallback
                    console.log(`%c[${component}] ${expression}`, style);
                }
            }
        }
    }

   /**
     * Recursively creates all DOM elements for the current component
     * using the hierarchical definition from OBJ_COMPONENTS.
     *
     * Rules:
     * - Each node defines one HTML element (tag required)
     * - `prefix` (optional) overrides the default 3-letter prefix from tag
     * - IDs are generated as `${prefix}${name}`
     * - `children` (if present) is an array or single object → built recursively
     * - If `protected: true`, sets data-protected="true" for _injectCSS()
     * - The root node (root:true) will be appended to `root` (default: this.parent)
     *
     * @param {HTMLElement} [root=this.parent] - Parent element to attach the root node.
     */
    renderUI(root = this.parent, createStyleSheet = false) {
        const key = this.constructor.name.toLowerCase();
        const component = OBJ_COMPONENTS[key];
        if (!component) throw new Error(`OBJ_COMPONENTS: missing component definition for '${key}'.`);

        // Recursive builder function
        const buildTree = (node, parentElmt) => {
            if (!node.tag) throw new Error(`Missing 'tag' in node definition for ${key}`);

            // Determine ID (optional)
            let id;
            if ('id' in node) {
                // ID explicitly set
                if (node.id === '') {
                    // Generate auto-ID only if an element name is present!
                    if (node.element) {
                        const prefix = node.prefix || node.tag.slice(0, 3);
                        id = `${prefix}${node.element}`;
                    }
                } else if (node.id != null) {
                    // explizite ID (non-null, non-undefined)
                    id = node.id;
                }
            } else if (node.element) {
                // No ID key, but an element name → classic auto-ID
                const prefix = node.prefix || node.tag.slice(0, 3);
                id = `${prefix}${node.element}`;
            }

            // Determine class (optional)
            let cls = node.class;
            // empty string indicates an auto-generated class name:
            if (cls === '') cls = this.stringTo(node.element, 'kebab');

            // Collect standard attributes
            const attrs = {
                class: cls,
                style: node.style || {},
                innerHTML: node.innerHTML || '',
                text: node.text || ''
            };
            if (id) attrs.id = id;

            // add other primitive values (z. B. value, type, element …)
            const IGNORE_TAGS = ['tag', 'element', 'prefix', 'class', 'style', 'innerHTML', 'text',
                                 'children', 'loop', 'events', 'protected', 'root'];
            for (const [key, val] of Object.entries(node)) {
                if (!IGNORE_TAGS.includes(key))  attrs[key] = val;
            }

            const elmt = this.createElement(node.tag, attrs);

            // Handle inline flags
            if (node.protected) elmt.dataset.protected = 'true';
            if (node.root) elmt.dataset.root = 'true';

            // Handle events (supports string, function, or array)
            if (node.events) {
                Object.entries(node.events).forEach(([evt, handler]) => {
                    const bindHandler = fn => {
                        if (typeof fn === 'string' && typeof this[fn] === 'function') {
                            // String → method name of current instance
                            elmt.addEventListener(evt, this[fn].bind(this));
                        } else if (typeof fn === 'function') {
                            // Direct function → bind context
                            elmt.addEventListener(evt, fn.bind(this));
                        } else {
                            this.log(`Invalid handler for "${evt}" in "${id}"`, 'warn');
                        }
                    };
                    if (Array.isArray(handler)) {
                        handler.forEach(fn => bindHandler(fn));
                    } else {
                        bindHandler(handler);
                    }
                });
            }

            // Cache the element reference
            if (id) this.DOM[id] = elmt;

            // Recursively process children (accept single object or array)
            if (node.children) {
                const children = Array.isArray(node.children) ? node.children : [node.children];
                children.forEach(childNode => buildTree(childNode, elmt));
            }

            // Handle loop definitions
            if (node.loop && Array.isArray(node.loop.elements)) {
                const { tag, id: loopId, splitter = '|', elements } = node.loop;
                const baseClass = node.loop.className ?? node.loop.class ?? '';
                const LOOP_META = ['tag', 'id', 'class', 'className', 'splitter', 'elements'];

                // All dynamic mappings: key → index or key → literal
                const mappings = Object.entries(node.loop).filter(([key]) => !LOOP_META.includes(key));

                elements.forEach((entry, index) => {
                    const parts = String(entry).split(splitter).map(p => p.trim());
                    const resolvePlaceholders = str =>
                        typeof str === 'string' ? str.replace(/\$\{#\}/g, String(index)) : str;
                    const attrs = {tag, class: baseClass };

                    // ID processing in the loop: only valid ID strings with “${#}” generate an ID
                    if (typeof loopId === 'string' && loopId.length) {
                        if (loopId.includes('${#}')) attrs.id = resolvePlaceholders(loopId);
                    }

                    // Dynamic assignments (incl. data*, classList, events, etc.)
                    for (const [mapKey, rawDescriptor] of mappings) {
                        // filter meta-keys once more for safety reasons
                        if (LOOP_META.includes(mapKey)) continue;
                        let value;
                        if (Number.isInteger(rawDescriptor)) {
                            value = parts[rawDescriptor]; // Index in parts[]
                        } else {
                            // Literal (i.e. '${#}', '${#} mm', 'fixerText')
                            value = resolvePlaceholders(rawDescriptor);
                        }

                        let attrKey = mapKey;
                        // ignore empty strings if attribute is NOT a boolean attribute
                        if (value == null || (value === '' && !this.booleanAttributes.has(attrKey))) continue;

                        // dataCamelCase → data-kebab-case
                        if (attrKey.startsWith('data') && attrKey.length > 4 && /[A-Z]/.test(attrKey[4])) {
                            const suffix = attrKey.slice(4);
                            attrKey = 'data-' + this.stringTo(suffix, 'kebab');
                        }
                        if (attrKey.startsWith('text')) {
                            attrs.text = value;
                        } else if (attrKey === 'classList') {
                            attrs.class = attrs.class ? `${attrs.class} ${value}` : value;
                        } else if (attrKey === 'events') {
                            attrs.events = { click: value }; // handler-name(s) → click
                        } else {
                            // all others straight as attribute: hidden, data-*, value, type, etc.
                            attrs[attrKey] = value;
                        }
                    }
                    buildTree(attrs, elmt);
                });
            }

            // Append to DOM
            if (node.root) {
                // Root-level node → append to supplied root (e.g. document.body)
                root.appendChild(elmt);
                this.rootElement = elmt;
            } else if (parentElmt) {
                parentElmt.appendChild(elmt);
            }
            return elmt;
        };

        // Build all children of the component
        if (Array.isArray(component.children)) {
            component.children.forEach(child => buildTree(child, root));
        }

        // create a basic CSS style-tag in the head if wanted
        if (createStyleSheet) this._injectCSS();
    }

    /**
     * Ensures base CSS variables and inline protected styles are applied.
     * - Reads CSS prefix and variable definitions from OBJ_COMPONENTS
     * - Creates a <style> block in <head> with :root-scoped CSS variables
     * - Applies inline styles for elements marked with data-protected="true"
     * - Cleans up markers afterwards
     *
     */
    _injectCSS() {
        const ctorName = this.constructor.name.toLowerCase();
        const component = OBJ_COMPONENTS[ctorName];
        if (!component) {
            this.log(`_injectCSS(): no component definition for "${ctorName}"`, 'warn');
            return;
        }

        // Retrieve CSS metadata
        const cssInfo = component.css || {};
        const prefix = cssInfo.prefix || ctorName.slice(0, 3);
        const variables = Array.isArray(cssInfo.variables) ? cssInfo.variables : [];

        // Create CSS variable definitions
        const varLines = variables.map(obj => {
            const [key, value] = Object.entries(obj)[0];
            // convert e.g. backgroundColor → background-color
            const kebab = this.stringTo(key, 'kebab');
            return `--${prefix}-${kebab}: ${value};`;
        });

        // Inject CSS variables into <style> (if not already present)
        const styleId = `${prefix}StyleSheet`;
        const styleSheetExists = ($(styleId) !== null);
        if (!styleSheetExists) {
            const styleElmt = this.createElement('style', {
                id: styleId,
                textContent: `:root {\n  ${varLines.join('\n  ')}\n}`
            });
            document.head.appendChild(styleElmt);
        }

        // Apply inline styles for protected elements
        const protectedElements = $('[data-protected="true"]', true);

        protectedElements.forEach(elmt => {
            const inlineDefaults = {
                boxSizing: 'border-box',
                position: elmt.style.position || 'relative'
            };
            Object.assign(elmt.style, inlineDefaults);

            // remove marker after styling
            elmt.removeAttribute('data-protected');
        });

        // Log confirmation (useful during dev)
        if (!styleSheetExists) {
            this.log(`_injectCSS():
                ${protectedElements.length} protected elements styled.
                Applied ${variables.length} new CSS "--${prefix}-..." variables to:
                <style id="${styleId}">`.replace(/^[ \t]+/gm, '')
                // NOTE regEx removes tabs + spaces in template string!
            );
        }
    }
} // END: class Library


/**
 * Extends the Array prototype.
 *
 * NOTE : this is considered to be "bad practice", but it works properly.
 * If any conflicts occur, take a note on this to solve them.
 *
 * Checks if an Array instance contains only items of the passed type
 * @param {String} type "string" | "number" | "boolean" | "function" | "object" | "class"
 * @returns {Boolean} true | false
 */
Array.prototype.isTypeOf = function(type) {
    const map = {
        string:   v => typeof v === 'string',
        number:   v => typeof v === 'number' && !Number.isNaN(v),
        boolean:  v => typeof v === 'boolean',
        function: v => typeof v === 'function',
        array:    v => Array.isArray(v),
        object:   v => v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object Object]',
        class:    v => {
            if (v == null || typeof v !== 'object') return false;
            const proto = Object.getPrototypeOf(v);
            // null prototype? (Object.create(null))
            // check for plain object: prototype is exactly Object.prototype
            if (!proto || proto === Object.prototype) return false;
            // everything else that has a constructor is a class instance
            return typeof proto.constructor === 'function';
        }
    };

    return Array.isArray(this) && map[type]?.call(null, this[0]) !== undefined
        ? this.every(map[type])
        : false;
}