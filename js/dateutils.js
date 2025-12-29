/**
 * @module dateutils
 * @description
 * Utility module providing various date-related helper functions for parsing,
 * formatting, and calculating calendar data.
 * All functions are pure and return `undefined` on invalid input instead of throwing errors.
 *
 * @functions
 * - {@link parse()}                – Normalizes various input formats into a valid JS Date object.
 * - {@link isLeapYear()}           – Determines whether a given year is a leap year.
 * - {@link daysInMonth()}          – Returns the number of days in the month of the given date.
 * - {@link weeksPerMonth()}        – Calculates the number of ISO calendar weeks in the given month.
 * - {@link getISOWeek()}           – Returns the ISO week number for a given date.
 * - {@link getDateFromWeek()}      – Returns the date corresponding to a specific ISO week and weekday.
 * - {@link firstWeekdayInMonth()}  – Finds the first occurrence of a weekday within a given month.
 * - {@link getDayOfTheYear()}      – Returns the ordinal day of the year (1–366) for the given date.
 * - {@link isWorkday()}            – Checks whether a date is a valid workday (optionally ignoring holidays).
 * - {@link getWorkdays()}          – Counts the number of workdays in the month of the given date.
 * - {@link getEasterSunday()}      – Calculates the Easter Sunday date for a given year (Oudin algorithm).
 * - {@link isHoliday()}            – Determines if a date is a public holiday (by country and region).
 * - {@link getHolidaysOfMonth()}   – Lists all holidays of a given month as formatted strings.
 *
 * @constants
 * - OBJ_HOLIDAYS           – Object containing fixed-date public holidays for DE, CH, and AT.
 *
 */


/**
 * Converts various date formats into a valid JS Date object.
 * Accepts:
 *   - existing Date objects (returned as-is)
 *   - valid date strings like "18.12.2002", "12/18/2002", "18-12-2002"
 * Returns undefined for invalid or unparsable inputs.
 *
 * @private
 * @param {Date|string|number} date - The date value to parse.
 * @returns {Date|undefined} A valid Date object or undefined if invalid.
 */
export function parse(date) {
    // Case 1: Already a Date object → return as-is
    if (date instanceof Date) return isNaN(date) ? undefined : date;

    // Case 2: Timestamp (milliseconds since epoch)
    if (typeof date === 'number') {
        const d = new Date(date);
        return isNaN(d) ? undefined : d;
    }

    // Case 3: String → try to normalize
    if (typeof date === 'string') {
        let str = date.trim();

        // Replace various separators (., -, /, space) with a single dash
        str = str.replace(/[\.\s\/]+/g, '-');

        // Try to detect dd-mm-yyyy or yyyy-mm-dd formats
        let parts = str.split('-').map(p => parseInt(p, 10)).filter(Boolean);

        let d;
        if (parts.length === 3) {
            // Case A: yyyy-mm-dd
            if (parts[0] > 1900 && parts[0] <= 9999) {
                d = new Date(parts[0], parts[1] - 1, parts[2]);
            }
            // Case B: dd-mm-yyyy
            else if (parts[2] > 1900 && parts[2] <= 9999) {
                d = new Date(parts[2], parts[1] - 1, parts[0]);
            }
        }

        if (d && !isNaN(d)) return d;
    }

    // Case 4: Anything else or invalid → undefined
    return undefined;
}


/**
 * Determines whether the given year is a leap year.
 *
 * @param {number} year - The year to check.
 * @returns {boolean|undefined} Returns true if the year is a leap year,
 * false if not, or undefined if the input is invalid.
 *
 * @example
 * isLeapYear(2024); // true
 * isLeapYear(2023); // false
 * isLeapYear('foo'); // undefined
 */
export function isLeapYear(year) {
    if (typeof year !== 'number' || !Number.isFinite(year)) return undefined;
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}


/**
 * Returns the number of days in the month of the given date.
 *
 * @param {Date|string} date - The date to evaluate. Can be a Date object or a parsable date string.
 * @returns {number|undefined} Returns the number of days in the month,
 * or undefined if the input date is invalid.
 *
 * @example
 * daysInMonth('2024-02-01'); // 29
 * daysInMonth(new Date(2025, 3, 15)); // 30 (April)
 */
export function daysInMonth(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return undefined;

    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based

    // Create a date pointing to day 0 of the next month → gives last day of current month
    return new Date(year, month + 1, 0).getDate();
}


/**
 * Returns the number of calendar weeks contained in the month of the given date.
 *
 * @param {Date|string} date - The date whose month should be evaluated.
 * @returns {number|undefined} Returns the number of ISO weeks in the month,
 * or undefined if the input date is invalid.
 *
 * @example
 * weeksPerMonth('2024-02-10'); // 5
 * weeksPerMonth(new Date(2025, 8, 15)); // 6 (September 2025)
 */
export function weeksPerMonth(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return undefined;

    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based

    // First and last day of the month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Get ISO week numbers for first and last day
    const firstWeek = getISOWeek(firstDay);
    const lastWeek = getISOWeek(lastDay);

    // Handle year-crossing edge cases (e.g. December -> week 1)
    let weeks = lastWeek - firstWeek + 1;
    if (weeks <= 0) {
        // December spilling into week 1 of next year, or ISO week reset
        const totalWeeks = getISOWeek(new Date(year, 11, 31));
        weeks = totalWeeks - firstWeek + lastWeek + 1;
    }

    return weeks;
}


/**
 * Returns the ISO week number of a given date.
 * @param {Date} date
 * @returns {number} ISO week number
 */
export function getISOWeek(date) {
    const dt = new Date(date.valueOf());
    dt.setDate(dt.getDate() + 3 - (dt.getDay() + 6) % 7);
    const firstThursday = dt.valueOf();
    dt.setMonth(0, 1);
    if (dt.getDay() !== 4) {
        dt.setMonth(0, 1 + ((4 - dt.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - dt) / 604800000);
}


/**
 * Returns the date for a specific ISO week and weekday within a given year.
 *
 * @param {number} week - ISO week number (1–53).
 * @param {number} [day=1] - Weekday (0=Sunday ... 6=Saturday) following the native JS schema.
 * @param {number} [year=new Date().getFullYear()] - Optional year. Defaults to current year.
 * @returns {Date|undefined} Returns a Date object for the specified week and weekday,
 * or undefined if parameters are invalid.
 *
 * @example
 * getDateFromWeek(1); // → Monday of week 1 in current year
 * getDateFromWeek(24, 5, 2025); // → Friday of week 24, 2025
 */
export function getDateFromWeek(week, day = 1, year = new Date().getFullYear()) {
    if (typeof week !== 'number' || week < 1 || week > 53) return undefined;
    if (typeof day !== 'number' || day < 0 || day > 6) return undefined;
    if (typeof year !== 'number' || !Number.isFinite(year)) return undefined;

    // Create a date for the 4th of January (guaranteed to be in week 1)
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7; // ISO: Monday=1 ... Sunday=7

    // Get the Monday of week 1
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - (jan4Day - 1));

    // Calculate target date: Monday + (weeks * 7 days) + weekday offset
    const targetDate = new Date(mondayWeek1);
    targetDate.setDate(mondayWeek1.getDate() + (week - 1) * 7 + (day === 0 ? 6 : day - 1));

    // Validate year (weeks 52/53 can spill over)
    if (isNaN(targetDate)) return undefined;

    return targetDate;
}

/**
 * Returns the date of the Monday that starts a given ISO week in a specific year.
 *
 * ISO weeks start on Monday and are defined so that the first week of the year
 * is the one containing the year's first Thursday.
 *
 * @private
 * @param {number} week - The ISO week number (1–53).
 * @param {number} year - The four-digit year (e.g. 2025).
 * @returns {Date|undefined} A Date object representing the Monday of the requested week,
 * or undefined if the parameters are invalid.
 *
 * @example
 * this.#getFirstDayOfISOWeek(1, 2025); // → Mon Dec 30 2024 (week 1 starts in 2024)
 * this.#getFirstDayOfISOWeek(15, 2025); // → Mon Apr 7 2025
 */
export function getFirstDayOfISOWeek(week, year) {
    if (typeof week !== 'number' || typeof year !== 'number' || week < 1 || week > 53)
        return undefined;

    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = new Date(simple); // clone to avoid mutating input

    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - dow + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - dow);
    }

    return ISOweekStart;
}


/**
 * Returns the first occurrence of a specific weekday within the month of the given date.
 *
 * @param {Date|string} date - The date whose month should be used as reference.
 * @param {number} weekday - Target weekday (0 = Sunday ... 6 = Saturday).
 * @returns {Date|undefined} Returns the first occurrence of that weekday,
 * or undefined if parameters are invalid.
 *
 * @example
 * firstWeekdayInMonth('2025-10-01', 0); // → Sun Oct 05 2025
 * firstWeekdayInMonth(new Date(2025, 9, 1), 1); // → Mon Oct 06 2025
 */
export function firstWeekdayInMonth(date, weekday) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d) || typeof weekday !== 'number' || weekday < 0 || weekday > 6) return undefined;

    const year = d.getFullYear();
    const month = d.getMonth();

    // Start at the 1st of the month
    const firstDay = new Date(year, month, 1);
    const firstDayWeekday = firstDay.getDay(); // 0 = Sunday ... 6 = Saturday

    // Calculate offset to reach the desired weekday
    const offset = (weekday - firstDayWeekday + 7) % 7;
    const result = new Date(year, month, 1 + offset);

    return result;
}


/**
 * Returns the ordinal day of the year for the given date.
 * (e.g. January 1st = 1, December 31st = 365 or 366)
 *
 * @param {Date|string} date - The date to evaluate.
 * @returns {number|undefined} The day number within the year (1–366),
 * or undefined if the input date is invalid.
 *
 * @example
 * getDayOfTheYear('2025-01-01'); // 1
 * getDayOfTheYear('2025-12-31'); // 365
 * getDayOfTheYear(new Date(2024, 1, 29)); // 60 (leap year)
 */
export function getDayOfTheYear(date) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return undefined;

    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const diffInMs = d - startOfYear;

    // Convert milliseconds to days and add 1 because Jan 1 = 1
    const dayOfYear = Math.floor(diffInMs / 86400000) + 1;

    return dayOfYear;
}


/**
 * Determines whether the given date is a workday.
 * Sundays are never workdays. Saturdays can optionally count as workdays.
 * Holidays (from isHoliday) are not workdays unless explicitly ignored.
 *
 * @param {Date|string} date - The date to evaluate.
 * @param {boolean} [saturdayIsWorkday=false] - Whether Saturdays are considered workdays.
 * @param {boolean} [ignoreHolidays=false] - If true, holidays are ignored (treated as workdays).
 * @returns {boolean|undefined} True if workday, false if not, undefined for invalid date.
 *
 * @example
 * isWorkday('2025-10-11'); // false (Saturday, default = not workday)
 * isWorkday('2025-10-11', true); // true  (Saturday as workday)
 * isWorkday('2025-12-25'); // false (holiday, if isHoliday() implemented)
 */
export function isWorkday(date, saturdayIsWorkday = false, ignoreHolidays = false) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return undefined;

    const weekday = d.getDay(); // 0 = Sunday, 6 = Saturday

    // Sundays are never workdays
    if (weekday === 0) return false;

    // Saturdays optionally count as workdays
    if (weekday === 6 && !saturdayIsWorkday) return false;

    // If holiday logic exists and not ignored, exclude holidays
    if (!ignoreHolidays && typeof isHoliday === 'function') {
        const holidayName = isHoliday(d);
        if (holidayName) return false; // "" is falsy → no holiday
    }

    return true;
}


/**
 * Calculates the number of workdays within the month of the given date.
 * Optionally counts holidays during that period.
 *
 * @param {Date|string} date - Any date within the target month.
 * @param {boolean} [countHolidays=false] - If true, returns an object including the number of holidays.
 * @param {boolean} [saturdayIsWorkday=false] - Whether Saturdays are considered workdays.
 * @returns {number|Object|undefined}
 * Returns:
 *   - number → count of workdays in that month
 *   - object → { workdays, holidays } if countHolidays = true
 *   - undefined → invalid input
 *
 * @example
 * getWorkdays('2025-10-01');
 * // → 23
 *
 * getWorkdays('2025-12-01', true);
 * // → { workdays: 22, holidays: 2 }
 */
export function getWorkdays(date, countHolidays = false, saturdayIsWorkday = false) {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d)) return undefined;

    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let workdays = 0;
    let holidays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const weekday = currentDate.getDay();

        // Skip Sundays
        if (weekday === 0) continue;

        // Skip Saturdays if not counted
        if (weekday === 6 && !saturdayIsWorkday) continue;

        // Handle holidays
        let isHolidayToday = false;
        if (typeof isHoliday === 'function') {
            const holidayName = isHoliday(currentDate);
            isHolidayToday = Boolean(holidayName);
        }

        if (isHolidayToday) {
            holidays++;
            continue; // skip from workdays count
        }

        workdays++;
    }

    if (countHolidays) return { workdays, holidays };
    return workdays;
}

/**
 * Calculate Easter Sunday for a given year.
 * Algorithm by Oudin (1940).
 * @param {number} year
 * @returns {Date}
 */
export function getEasterSunday(year) {
    const f = Math.floor;
    const G = year % 19;
    const C = f(year / 100);
    const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
    const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
    const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
    const L = I - J;
    const month = 3 + f((L + 40) / 44);
    const day = L + 28 - 31 * f(month / 4);
    return new Date(year, month - 1, day);
}


/**
 * Determines if a given date is a public holiday in the configured country and region.
 * Returns the holiday name as a string or an empty string if the date is not a holiday.
 *
 * Requires:
 *  - country  → 'de-DE' | 'de-CH' | 'de-AT'
 *  - getEasterSunday(year)
 *  - OBJ_HOLIDAYS (imported)
 *
 * @param {Date|string} date - Date to check.
 * @param {string} [region='global'] - Region key (lowercase, e.g. 'bayern', 'zürich', 'wien').
 * @returns {string} Holiday name or empty string if no holiday applies.
 */
export function isHoliday(date, region = 'global', country = 'de-DE') {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d) || !country) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const key = `${month}-${day}`;
    // const country = this.country;
    const reg = region?.toLowerCase() || 'global';

    // helper function for combining global + regional holidays
    const getLocalHolidays = (ctry, region) => {
        const map = OBJ_HOLIDAYS[ctry];
        if (!map) return {};
        return {...map.global, ...(map[region] || {})};
    };

    const holidays = getLocalHolidays(country, reg);

    // --- 1. Check fixed-date holidays ----------------------------------------
    if (holidays[key]) return holidays[key];

    // --- 2. Handle movable holidays (based on Easter) ------------------------
    const easter = getEasterSunday(year);
    const msPerDay = 86400000;

    const offset = (days) => new Date(easter.getTime() + days * msPerDay);
    const equals = (a, b) =>
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear();

    const movable = [];

    switch (country) {
        // ---------------------------------------------------------------------
        // 🇩🇪 Germany
        // ---------------------------------------------------------------------
        case 'de-DE': {
            movable.push(
                { date: offset(-2), name: 'Karfreitag' },
                { date: easter, name: 'Ostersonntag' },
                { date: offset(1), name: 'Ostermontag' },
                { date: offset(39), name: 'Christi Himmelfahrt' },
                { date: offset(49), name: 'Pfingstsonntag' },
                { date: offset(50), name: 'Pfingstmontag' }
            );

            // Fronleichnam (regional)
            if (['bayern','badenwürttemberg','saarland','nordrheinwestfalen','hessen','rheinlandpfalz','sachsen','thüringen']
                .includes(reg)) {
                movable.push({ date: offset(60), name: 'Fronleichnam' });
            }

            // Buß- und Bettag (Sachsen): 4. Advent - 32 Tage
            if (reg === 'sachsen') {
                const fourthAdvent = (() => {
                    const dec25 = new Date(year, 11, 25);
                    let weekday = dec25.getDay();
                    const sundayBeforeXmas = new Date(dec25);
                    sundayBeforeXmas.setDate(dec25.getDate() - ((weekday + 1) % 7));
                    const fourth = new Date(sundayBeforeXmas);
                    fourth.setDate(sundayBeforeXmas.getDate() - 21);
                    return fourth;
                })();
                const bussBettag = new Date(fourthAdvent.getTime() - 32 * msPerDay);
                movable.push({ date: bussBettag, name: 'Buß- und Bettag' });
            }
            break;
        }

        // ---------------------------------------------------------------------
        // 🇨🇭 Switzerland
        // ---------------------------------------------------------------------
        case 'de-CH': {
            movable.push(
                { date: offset(-2), name: 'Karfreitag' },
                { date: easter, name: 'Ostersonntag' },
                { date: offset(1), name: 'Ostermontag' },
                { date: offset(39), name: 'Auffahrt' },
                { date: offset(49), name: 'Pfingstsonntag' },
                { date: offset(50), name: 'Pfingstmontag' }
            );

            // Fronleichnam (regional)
            if (['aargau','appenzellai','freiburg','graubünden','jura','luzern','neuenburg','nidwalden','obwalden','schwyz','solothurn','tessin','uri','wallis','zug']
                .includes(reg)) {
                movable.push({ date: offset(60), name: 'Fronleichnam' });
            }

            // Genfer Bettag (nur Genf) – Donnerstag nach dem 1. Sonntag im September
            if (reg === 'genf') {
                const firstSept = new Date(year, 8, 1);
                const firstSunday = new Date(firstSept);
                while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);
                const genferBettag = new Date(firstSunday);
                genferBettag.setDate(firstSunday.getDate() + 4);
                movable.push({ date: genferBettag, name: 'Genfer Bettag' });
            }

            // Eidgenössischer Dank-, Buss- und Bettag: 3. Sonntag im September
            const firstSept = new Date(year, 8, 1);
            const firstSunday = new Date(firstSept);
            while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);
            const eidgBettag = new Date(firstSunday);
            eidgBettag.setDate(firstSunday.getDate() + 14);
            movable.push({ date: eidgBettag, name: 'Eidgenössischer Dank-, Buss- und Bettag' });
            break;
        }

        // ---------------------------------------------------------------------
        // 🇦🇹 Austria
        // ---------------------------------------------------------------------
        case 'de-AT': {
            movable.push(
                { date: offset(-2), name: 'Karfreitag' },
                { date: easter, name: 'Ostersonntag' },
                { date: offset(1), name: 'Ostermontag' },
                { date: offset(39), name: 'Christi Himmelfahrt' },
                { date: offset(49), name: 'Pfingstsonntag' },
                { date: offset(50), name: 'Pfingstmontag' },
                { date: offset(60), name: 'Fronleichnam' }
            );
            break;
        }
    }

    // --- 3. Check against movable holiday list -------------------------------
    for (const h of movable) {
        if (equals(h.date, d)) return h.name;
    }

    // Not a holiday
    return '';
}


/**
 * Returns all holidays of the given month as an array of formatted strings.
 * Example: ["Neujahr (01.01.2025)", "Heilige Drei Könige (06.01.2025)"]
 *
 * Relies on:
 *  - country  → 'de-DE' | 'de-CH' | 'de-AT'
 *  - region   → lowercase region string (e.g. 'bayern', 'zürich', 'wien')
 *  - isHoliday(date)
 *
 * @param {Date|string} date - Any date within the target month.
 * @param {Object} [format] - Optional Intl.DateTimeFormat options (default: { day:'2-digit', month:'2-digit', year:'numeric' }).
 * @returns {string[]} List of holidays for that month, formatted as "Holiday (dd.mm.yyyy)".
 */
export function getHolidaysOfMonth(date, format = { day: '2-digit', month: '2-digit', year: 'numeric' },
                                   region = 'global', country = 'de-DE') {
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d) || !country) return [];

    const year = d.getFullYear();
    const month = d.getMonth(); // 0-based
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const holidays = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const current = new Date(year, month, day);
        const name = isHoliday(current, region);
        if (name) {
            const formatted = current.toLocaleDateString(country, format);
            holidays.push(`${name} (${formatted})`);
        }
    }

    return holidays;
}


/**
 * List of fixed-date public holidays for Germany, Switzerland, and Austria.
 * Region keys are lowercase. Date keys follow the 'MM-DD' format.
 * Movable holidays (Easter, Pentecost, etc.) are handled separately.
 */
export const OBJ_HOLIDAYS = {
    // 🇩🇪 Germany
    'de-DE': {
        global: {
            '01-01': 'Neujahr',
            '05-01': 'Maifeiertag',
            '10-03': 'Tag der Deutschen Einheit',
            '12-25': '1. Weihnachtstag',
            '12-26': '2. Weihnachtstag'
        },
        badenWürttemberg: {
            '01-06': 'Heilige Drei Könige',
            '06-20': 'Fronleichnam',
            '11-01': 'Allerheiligen'
        },
        bayern: {
            '01-06': 'Heilige Drei Könige',
            '06-20': 'Fronleichnam',
            '11-01': 'Allerheiligen'
        },
        berlin: {
            // keine spezifischen Feiertage außer den globalen
        },
        brandenburg: {
            '10-31': 'Reformationstag'
        },
        bremen: {
            // keine spezifischen Feiertage
        },
        hamburg: {
            // keine spezifischen Feiertage
        },
        hessen: {
            '06-20': 'Fronleichnam'
        },
        mecklenburgVorpommern: {
            '10-31': 'Reformationstag'
        },
        niedersachsen: {
            '10-31': 'Reformationstag'
        },
        nordrheinWestfalen: {
            '06-20': 'Fronleichnam',
            '11-01': 'Allerheiligen'
        },
        rheinlandPfalz: {
            '06-20': 'Fronleichnam',
            '11-01': 'Allerheiligen'
        },
        saarland: {
            '08-15': 'Mariä Himmelfahrt',
            '06-20': 'Fronleichnam',
            '11-01': 'Allerheiligen'
        },
        sachsen: {
            '10-31': 'Reformationstag',
            // Buß- und Bettag wird dynamisch berechnet (Mittwoch vor dem 23.11.)
            '11-20': 'Buß- und Bettag'
        },
        sachsenAnhalt: {
            '10-31': 'Reformationstag'
        },
        schleswigHolstein: {
            '10-31': 'Reformationstag'
        },
        thüringen: {
            '10-31': 'Reformationstag',
            // nur in Thüringen zusätzlich Mariä Himmelfahrt?
            // nein, nur Reformationstag laut Liste
        }
    },

    // 🇨🇭 Switzerland
    'de-CH': {
        global: {
            '01-01': 'Neujahr',
            '08-01': 'Bundesfeier',
            '12-25': 'Weihnachtstag'
        },
        aargau: {
            '01-02': 'Berchtoldstag',
            '05-01': 'Tag der Arbeit',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis',
            '12-26': 'Stephanstag'
        },
        appenzellAR: {
            '08-15': 'Mariä Himmelfahrt'
        },
        appenzellAI: {
            '08-15': 'Mariä Himmelfahrt',
            '11-01': 'Allerheiligen',
            '12-08': 'Mariä Empfängnis'
        },
        baselLand: {
            '05-01': 'Tag der Arbeit',
            '12-26': 'Stephanstag'
        },
        baselStadt: {
            '05-01': 'Tag der Arbeit',
            '12-26': 'Stephanstag'
        },
        bern: {
            '01-02': 'Berchtoldstag'
        },
        freiburg: {
            '08-15': 'Mariä Himmelfahrt',
            '11-01': 'Allerheiligen',
            '12-08': 'Mariä Empfängnis'
        },
        genf: {
            // Genfer Bettag: Donnerstag nach 1. Sonntag im September (berechnet in isHoliday)
            '09-11': 'Genfer Bettag'
        },
        glarus: {
            '11-01': 'Allerheiligen',
            '12-26': 'Stephanstag'
        },
        graubünden: {
            '01-06': 'Heilige Drei Könige',
            '03-19': 'Josefstag',
            '06-29': 'Peter und Paul',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        jura: {
            '01-02': 'Berchtoldstag',
            '11-01': 'Allerheiligen'
        },
        luzern: {
            '03-19': 'Josefstag',
            '06-29': 'Peter und Paul',
            '12-08': 'Mariä Empfängnis',
            '12-26': 'Stephanstag'
        },
        neuenburg: {
            '05-01': 'Tag der Arbeit'
        },
        nidwalden: {
            '03-19': 'Josefstag',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        obwalden: {
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        stGallen: {
            '12-26': 'Stephanstag'
        },
        schaffhausen: {
            '05-01': 'Tag der Arbeit',
            '12-26': 'Stephanstag'
        },
        schwyz: {
            '01-06': 'Heilige Drei Könige',
            '03-19': 'Josefstag',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis',
            '12-26': 'Stephanstag'
        },
        solothurn: {
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis',
            '12-26': 'Stephanstag'
        },
        tessin: {
            '01-06': 'Heilige Drei Könige',
            '03-19': 'Josefstag',
            '06-29': 'Peter und Paul',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        thurgau: {
            '01-02': 'Berchtoldstag',
            '05-01': 'Tag der Arbeit'
        },
        uri: {
            '01-06': 'Heilige Drei Könige',
            '03-19': 'Josefstag',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        waadt: {
            '01-02': 'Berchtoldstag'
        },
        wallis: {
            '03-19': 'Josefstag',
            '08-15': 'Mariä Himmelfahrt',
            '12-08': 'Mariä Empfängnis'
        },
        zug: {
            '08-15': 'Mariä Himmelfahrt',
            '11-01': 'Allerheiligen',
            '12-08': 'Mariä Empfängnis'
        },
        zürich: {
            '01-02': 'Berchtoldstag',
            '05-01': 'Tag der Arbeit',
            '12-26': 'Stephanstag'
        }
    },

    // 🇦🇹 Austria
    'de-AT': {
        global: {
            '01-01': 'Neujahr',
            '01-06': 'Heilige Drei Könige',
            '05-01': 'Staatsfeiertag',
            '08-15': 'Mariä Himmelfahrt',
            '10-26': 'Nationalfeiertag',
            '11-01': 'Allerheiligen',
            '12-08': 'Mariä Empfängnis',
            '12-24': 'Heiliger Abend',
            '12-25': 'Christtag',
            '12-26': 'Stefanitag',
            '12-31': 'Silvester'
        },
        burgenland: {
            '11-11': 'St. Martin'
        },
        kärnten: {
            '03-19': 'Josefstag',
            '10-10': 'Tag der Volksabstimmung'
        },
        niederösterreich: {
            '03-19': 'Josefstag',
            '11-15': 'St. Leopold'
        },
        oberösterreich: {
            '03-19': 'Josefstag',
            '05-04': 'St. Florian'
        },
        salzburg: {
            '09-24': 'St. Rupert'
        },
        steiermark: {
            '03-19': 'Josefstag'
        },
        tirol: {
            '03-19': 'Josefstag'
        },
        vorarlberg: {
            '03-19': 'Josefstag'
        },
        wien: {
            '11-15': 'St. Leopold'
        }
    }
};