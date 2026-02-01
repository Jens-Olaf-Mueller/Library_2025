/**
 * @file utils.js
 * @module utils
 * @version 1.5.0
 * @author Jens-Olaf-Mueller
 *
 * utils — Universal functional toolkit for DOM, Math, and Strings.
 * ===============================================================
 *
 * A collection of stateless utility functions providing a robust abstraction layer for common web tasks.
 * - Key Features:
 * - Unified Selector: The `$` function simplifies DOM queries (ID, Class, Tag, Selector) into a single interface.
 * - Localization: `format$` provides high-precision currency and number formatting with auto-decimal padding.
 * - Math Extensions: Extends the native Math object with precision rounding (`roundDec`).
 * - Template Loader: `includeHTML` enables asynchronous injection of HTML fragments into the DOM.
 *
 * ---------------------------------------------------------------
 * I. Exported Functions
 * ---------------------------------------------------------------
 * - {@link $}             - Universal DOM selector for IDs, classes, tags, and CSS-queries.
 * - {@link format$}       - Formats numbers into localized currency or decimal strings with grouping.
 * - {@link includeHTML}   - Asynchronously loads and injects external HTML templates into the document.
 * - {@link Math.roundDec} - Static extension to round numbers to a specific number of decimal places.
 *
 * ---------------------------------------------------------------
 * II. Internal Helper Methods
 * ---------------------------------------------------------------
 * - none
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * This utility module does not raise custom events.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * This module does not provide any CSS variables.
 */

/**
 * Universal 'all-in-one' function that unites the DOM-functions
 *  - document.getElementById
 *  - document.getElementsByTagName
 *  - document.getElementsByClassName
 *  - document.getElementsByName
 *  - document.querySelector
 *  - document.querySelectorAll
 *
 * prepend 'export' if you wanna import the function in a module!
 *
 * @param {string} selector any valid CSS selector
 * @param {number|'~'|':last-child'} child optional,
 * determines which child of the found nodelist or HTML-collection
 * is supposed to be returned. A number returns the child of the given index. A tilde '~' or the
 * string expression ':last-child' returns the last child of the list / collection.
 * @returns {HTMLElement|HTMLElement[]|NodeList|null} a single element (if selector is a valid ID or child is specified)
 * in all other cases a zero-based nodelist or HTML-collection, matching the selector-parameter
 * If the list contains ONLY ONE element, this element is returned only!
 * @example $('main-content')     -   returns an element with ID 'main-content'
 *          $('div','~')          -   returns the last div-container of the document
 *          $('a',0)              -   returns the first link (<a>-element</a>)
 *          $('div.myClass')      -   returns a list from all divs that have the CSS_class "myClass".
 *          $('div.myClass','~')  -   returns last div containing CSS_class "myClass".
 *          $('.clsNames',3)      -   returns the 4th(!) child of the wanted class_list
 *          $('input[type=text]') -   returns a list with all input elements, being text fields
 *          $('[name]')           -   returns a list with all elements, having a 'name' attribute
 */
export default function $(selector, returnArray = false, child) {
    // defining two helper functions:
    const getElements = (nodeList, child, returnArray) => {
        // we don't return a node list, with only ONE element!
        // but this single element instead, except from param "returnArray == true"
        if (nodeList.length == 1 && returnArray === false) return nodeList[0];
        // is the last child wanted?
        if (child == '~' || child == ':last-child') child = nodeList.length - 1;
        // do we have a valid child-index?
        child = (Number.isFinite(parseInt(child)) && child >= 0) ? Number(child) : false;
        if (returnArray) {
             // ATTENTION! 'if (child)...' does not work since child can be 0!
            if (child === false) return Array.from(nodeList);
            // return Array.from(nodeList)[child];
            return nodeList[child];
        }
        // return (child === false) ? nodeList : nodeList[child];
        if (nodeList.length == 0 ) return null;
        return (child === false) ? nodeList : nodeList[child];
    }

    // allows a shorthand syntax of just the selector and the child: $('.myclass', 1)
    if (typeof returnArray === 'string' || typeof returnArray === 'number') {
        child = returnArray;
        returnArray = false;
    }

    // query-selector provided?
    const querySelector = ['[', '.', '#', ':', '>'].some(char => {return selector.includes(char)});
    if (querySelector) {
        return getElements(document.querySelectorAll(selector), child, returnArray);
    }

    // now search for ID...
    const element = document.getElementById(selector);
    if (element) return element; // ID was found!

    // no ID! continue in HTML-tags...
    const htmlTags = document.getElementsByTagName(selector);
    if (htmlTags.length > 0) return getElements(htmlTags, child, returnArray);

    // is the selector a class...?
    const classNames = document.getElementsByClassName(selector);
    if (classNames.length > 0) return getElements(classNames, child, returnArray);

    // ...or is it a name finally?
    const names = document.getElementsByName(selector);
    if (names.length > 0) return getElements(names, child, returnArray);
    return null;
}

/**
 * Checks properly (!), if the given expression is numeric.
 * recognizes: undefined, NaN, Null, infinity etc.
 * @param {number | numeric string} expression
 * @param {boolean} allowStringNumbers optional, tells if string literals are allowed or not (default)
 * @returns true | false
 */
export function isNumeric(expression, allowStringNumbers) {
    if (allowStringNumbers == true) return Number.isFinite(parseFloat(expression));
    return Number.isFinite(expression);
}


/**
 * Global event listener.
 * Can be enhanced by a string-array of events to install a bunch of different events at once
 * @param {string} type the type of the event (i.e. 'input', 'click' etc.)
 * @param {string} selector a valid CSS selector that defines the target for the listener
 * @param {function} callback the event handler
 * @param {HTMLElement} parent element the event listener is supposed to be installed on
 * @param {object} options common ev.-listener options like {bubbles: true}
 * @see {@link https://www.mediaevent.de/javascript/event-delegation.html}
 */
export function addGlobalEventListeners(type, selector, callback, parent = document, options) {
    parent?.addEventListener(type, e => {
        if (e.target.matches(selector)) callback(e);
    }, options);
}


/**
 * Formats a date or number according to the given format string and locale.
 * @param {Date|number|string} expression - Value to be formatted
 * @param {string} [format='#,##'] - Format string (e.g. 'dd.mm.yyyy' or '#,##.00')
 * @param {string} [locale='de-DE'] - Locale string
 * @returns {string} Formatted output
 * @see {@link https://www.youtube.com/watch?v=cdGxTJo5cNI}
 */
// export function format$(expression, format = '#,##', options = {locale:'de-DE', useGrouping: false}) {
//     // for legacy reasons:
//     if (typeof options === 'string') {
//         const opt$ = options;
//         options = {};
//         options.locale = opt$;
//         console.warn(`[utils.format$]: Deprecated call!\nChange parameter "options" to object in calling function!\nUse: options.locale = '${opt$}' instead!`)
//     }

//     const pad = val => val.toString().padStart(2, '0');
//     // determine decimal separator and thousand group char
//     const getSeparator = (type) => new Intl.NumberFormat(options.locale)
//         .formatToParts(1000.1).find(p => p.type === type)?.value;
//     const decimalSep = getSeparator('decimal');
//     const groupSep   = getSeparator('group');
//     const separators = (format.split(decimalSep).length - 1);

//     // Handle empty or missing input as zero
//     if (expression === '' || expression === undefined) expression = 0;

//     // === DATE FORMATTING ===
//     if (expression instanceof Date) {
//         if (format.includes('#')) format = 'dd.mm.yyyy'; // fallback
//         const tokens = {
//             yyyy: expression.getFullYear(),
//             mmmm: expression.toLocaleString(options.locale, { month: 'long' }),
//             mm: pad(expression.getMonth() + 1),
//             m: expression.getMonth() + 1,
//             dddd: expression.toLocaleString(options.locale, { weekday: 'long' }),
//             ddd: expression.toLocaleString(options.locale, { weekday: 'short' }),
//             dd: pad(expression.getDate()),
//             d: expression.getDate(),
//             HH: pad((expression.getHours() % 12) || 12),
//             H: (expression.getHours() % 12) || 12,
//             hh: pad(expression.getHours()),
//             h: expression.getHours(),
//             nn: pad(expression.getMinutes()),
//             n: expression.getMinutes(),
//             ss: pad(expression.getSeconds()),
//             s: expression.getSeconds(),
//             aa: expression.getHours() >= 12 ? 'pm' : 'am'
//         };
//         return format.replace(new RegExp(Object.keys(tokens).join('|'), 'g'), m => tokens[m]);
//     }

//     const isMask = typeof format === 'string' && format.includes('#') && (separators === 0 || separators > 1);

//     // === MASKED FORMAT (VB6 Style) ===
//     if (isMask) {
//         // Remove all non-numeric characters from expression and convert to string
//         let digits = String(expression).replace(/\D/g, '');

//         // Count required digits in mask
//         const requiredDigets = (format.match(/#/g) || []).length;
//         digits = digits.padStart(requiredDigets, '0'); // Left-pad with zeros if necessary

//         let result = '';
//         // Iterate through the mask
//         for (let i = 0, idx = 0; i < format.length; i++) {
//             const char = format[i];
//             if (char === '#') {
//                 result += digits[idx] || ''; // Replace # with current digit
//                 idx++;
//             } else {
//                 result += char; // Keep literal characters (-, space, DE, etc.)
//             }
//         }
//         return result;
//     }

//     // === NUMBER FORMAT ===
//     const value = parseFloat(expression);
//     if (!Number.isFinite(value)) return String(expression);
//     const [intPartRaw, fracPartRaw = ''] = value
//         .toLocaleString(options.locale, { useGrouping: false })
//         .replace('.', decimalSep)
//         .split(decimalSep);

//     const [fmtInt = '', fmtFrac = ''] = format.split(decimalSep);

//     // Pad integer part
//     let intFormatted = '',
//         intPart = intPartRaw.padStart(fmtInt.replace(/[^#]/g, '').length, '0'),
//         i = intPart.length - 1,
//         digitCount = 0;
//     // iterating backwards over the formatted integer part of the expression
//     for (let c = fmtInt.length - 1; c >= 0; c--) {
//         const fmtChar = fmtInt[c];
//         if (fmtChar === '#') {
//             const digit = i >= 0 ? intPart[i] : '0';
//             intFormatted = digit + intFormatted;
//             i--;
//             digitCount++;
//             // as long as we got digits, add the group char after every 3rd
//             if (digitCount % 3 === 0 && i >= 0) intFormatted = groupSep + intFormatted;
//         } else {
//             // other chars in format string (i. e. currency signs)
//             intFormatted = fmtChar + intFormatted;
//         }
//     }

//     // Remaining digits (if intPart is longer than formatInt)
//     while (i >= 0) {
//         if (digitCount % 3 === 0) intFormatted = groupSep + intFormatted;
//         intFormatted = intPart[i] + intFormatted;
//         i--;
//         digitCount++;
//     }

//     // Format fraction part
//     let fracFormatted = '';
//     for (let c = 0; c < fmtFrac.length; c++) {
//         fracFormatted += (fmtFrac[c] === '#' ? fracPartRaw[c] || '0' : fmtFrac[c]);
//     }
//     return intFormatted + (fracFormatted ? decimalSep + fracFormatted : '');
// }

/**
 * Universal formatting utility for dates, masked strings, and numbers.
 * Supports localized number formatting with optional digit grouping (thousands separator).
 *
 * @param {Date|number|string} expression - The value to be formatted.
 * @param {string} [format='#,##'] - The format pattern or mask.
 * @param {object} [options] - Configuration object.
 * @param {string} [options.locale='de-DE'] - Locale for names and separators.
 * @param {boolean} [options.useGrouping=false] - Whether to use thousands separators in numbers.
 * @returns {string} The formatted output.
 */
export function format$(expression, format = '#,##', options = {locale: 'de-DE', useGrouping: false}) {
    // for legacy reasons:
    if (typeof options === 'string') {
        const opt$ = options;
        options = { locale: opt$, useGrouping: false };
        console.warn(`[utils.format$]: Deprecated call!\nChange parameter "options" to object in calling function!\nUse: options.locale = '${opt$}' instead!`);
    }

    // ensure default values if options object is partially provided
    const locale = options.locale || 'de-DE';
    const useGrouping = options.useGrouping ?? false;

    const pad = val => val.toString().padStart(2, '0');
    // determine decimal separator and thousand group char
    const getSeparator = (type) => new Intl.NumberFormat(locale)
        .formatToParts(1000.1).find(p => p.type === type)?.value;
    const decimalSep = getSeparator('decimal');
    const groupSep   = getSeparator('group');
    const separators = (format.split(decimalSep).length - 1);

    // Handle empty or missing input as zero
    if (expression === '' || expression === undefined) expression = 0;

    // === DATE FORMATTING ===
    if (expression instanceof Date) {
        if (format.includes('#')) format = 'dd.mm.yyyy'; // fallback
        const tokens = {
            yyyy: expression.getFullYear(),
            mmmm: expression.toLocaleString(locale, { month: 'long' }),
            mm: pad(expression.getMonth() + 1),
            m: expression.getMonth() + 1,
            dddd: expression.toLocaleString(locale, { weekday: 'long' }),
            ddd: expression.toLocaleString(locale, { weekday: 'short' }),
            dd: pad(expression.getDate()),
            d: expression.getDate(),
            HH: pad((expression.getHours() % 12) || 12),
            H: (expression.getHours() % 12) || 12,
            hh: pad(expression.getHours()),
            h: expression.getHours(),
            nn: pad(expression.getMinutes()),
            n: expression.getMinutes(),
            ss: pad(expression.getSeconds()),
            s: expression.getSeconds(),
            aa: expression.getHours() >= 12 ? 'pm' : 'am'
        };
        return format.replace(new RegExp(Object.keys(tokens).join('|'), 'g'), m => tokens[m]);
    }

    const isMask = typeof format === 'string' && format.includes('#') && (separators === 0 || separators > 1);

    // === MASKED FORMAT (VB6 Style) ===
    if (isMask) {
        // Remove all non-numeric characters from expression and convert to string
        let digits = String(expression).replace(/\D/g, '');

        // Count required digits in mask
        const requiredDigets = (format.match(/#/g) || []).length;
        digits = digits.padStart(requiredDigets, '0'); // Left-pad with zeros if necessary

        let result = '';
        // Iterate through the mask
        for (let i = 0, idx = 0; i < format.length; i++) {
            const char = format[i];
            if (char === '#') {
                result += digits[idx] || ''; // Replace # with current digit
                idx++;
            } else {
                result += char; // Keep literal characters (-, space, DE, etc.)
            }
        }
        return result;
    }

    // === NUMBER FORMAT ===
    const value = parseFloat(expression);
    if (!Number.isFinite(value)) return String(expression);
    const [intPartRaw, fracPartRaw = ''] = value
        .toLocaleString(locale, { useGrouping: false })
        .replace('.', decimalSep)
        .split(decimalSep);

    const [fmtInt = '', fmtFrac = ''] = format.split(decimalSep);

    // Pad integer part
    let intFormatted = '',
        intPart = intPartRaw.padStart(fmtInt.replace(/[^#]/g, '').length, '0'),
        i = intPart.length - 1,
        digitCount = 0;
    // iterating backwards over the formatted integer part of the expression
    for (let c = fmtInt.length - 1; c >= 0; c--) {
        const fmtChar = fmtInt[c];
        if (fmtChar === '#') {
            const digit = i >= 0 ? intPart[i] : '0';
            intFormatted = digit + intFormatted;
            i--;
            digitCount++;
            if (useGrouping && digitCount % 3 === 0 && i >= 0) intFormatted = groupSep + intFormatted;
        } else {
            // other chars in format string (i. e. currency signs)
            intFormatted = fmtChar + intFormatted;
        }
    }

    // Remaining digits (if intPart is longer than formatInt)
    while (i >= 0) {
        if (useGrouping && digitCount % 3 === 0) intFormatted = groupSep + intFormatted;
        intFormatted = intPart[i] + intFormatted;
        i--;
        digitCount++;
    }

    // Format fraction part
    let fracFormatted = '';
    for (let c = 0; c < fmtFrac.length; c++) {
        fracFormatted += (fmtFrac[c] === '#' ? fracPartRaw[c] || '0' : fmtFrac[c]);
    }
    return intFormatted + (fracFormatted ? decimalSep + fracFormatted : '');
}

/**
 * @description
 * Extends the Math-Object by a special round-function that allows to
 * round a given number to a given amount of decimal digits
 * @param {number} number numeric expression
 * @param {number} decimals count of decimal digits
 * @returns the rounded number with assignet decimal digits
 */
Math.roundDec = function(number, decimals = 0) {
    const dec = decimals * 10;
    if (dec == 0) return Math.round(number + Number.EPSILON);
    return Math.round((number + Number.EPSILON) * dec) / dec;
}

/**
 * loads HTML-templates at run time to the page.
 * Iterates through all elements containing the attribute 'w3-include-html'.
 * i.e.:
 *
 * @example
 * <header w3-include-html="templates/header.html"/> // will load a given header
 */
export async function includeHTML() {
    const W3_ATTR = 'w3-include-html';
    let includeElements = document.querySelectorAll(`[${W3_ATTR}]`);
    if (includeElements.length == 0) return; // avoiding endless loop!
    for (let i = 0; i < includeElements.length; i++) {
        const element = includeElements[i];
        let file = element.getAttribute(W3_ATTR),
            response = await fetch(file);
        if (response.ok) {
            element.innerHTML = await response.text();
            element.removeAttribute(W3_ATTR);
        } else {
            element.innerHTML = `Page not found: "${file}"`;
        }
    }
    await includeHTML();
}