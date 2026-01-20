import Library from './Library.js';
import { CSS_COLORS } from '../css_colors.js';

/**
 * ColorHandler — Unified color parsing, conversion, and analysis
 * ===============================================================
 *
 * Provides a single interface for working with colors in multiple formats:
 * - CSS color names (via `CSS_COLORS`)
 * - HEX (#RGB, #RRGGBB, #RRGGBBAA)
 * - rgb()/rgba()
 * - hsl()/hsla()
 * - arrays ([r,g,b,a?]) and plain objects ({r,g,b,a?})
 *
 * The class internally validates and normalizes colors using a 1×1 canvas context.
 * It supports an optional strict validation mode (`strictMode`):
 * - strictMode=true  → invalid inputs return `undefined`
 * - strictMode=false → invalid inputs fall back to transparent/black defaults
 *
 * Notes:
 * - Normalization returns channel data (r,g,b,a), derived HEX, optional CSS name,
 *   YIQ brightness, and WCAG relative luminance (linearized sRGB).
 * - This class extends {@link Library} and uses {@link Library.toBoolean} for coercion.
 *
 * ---------------------------------------------------------------
 * I. Public API
 * ---------------------------------------------------------------
 *
 * - {@link strictMode}           - get/set strict validation behavior
 *
 * - {@link toHex}                - converts any supported color input to HEX
 * - {@link toRGB}                - converts to rgb()/rgba()
 * - {@link toHSL}                - converts to hsl()/hsla()
 * - {@link toYIQ}                - returns YIQ brightness (0–255)
 *
 * - {@link getLuminance}         - returns WCAG relative luminance (0–1)
 * - {@link getBrightness}        - returns derived brightness (0–100)
 * - {@link getContrastRatio}     - returns contrast ratio (1–21) between two colors
 * - {@link getAutoTextColor}     - returns '#000' or '#fff' for readable text on a background
 *
 * - {@link invert}               - returns complementary color as HEX
 * - {@link isValid}              - validates whether an input can be parsed as a color
 * - {@link mix}                  - mixes two colors by ratio (0–1), returns HEX
 * - {@link randomColor}          - generates a random HEX color
 *
 * ---------------------------------------------------------------
 * II. Private Methods / Internals
 * ---------------------------------------------------------------
 * - {@link #parseColor}          - parses/normalizes input to {r,g,b,a,hex,name,yiq,luminance}
 * - {@link #getRGBA_Array}       - resolves a fillStyle to [R,G,B,A] via canvas sampling
 *
 * @version 1.0.0
 */
export class ColorHandler extends Library {
	#canvas;
	#ctx;

	#strictMode = true;
	get strictMode() { return this.#strictMode; }
	/**
	 * Sets the strict mode state.
	 * @param {Boolean} flag whether to enable or disable strict mode
	 */
	set strictMode(flag) { this.#strictMode = this.toBoolean(flag); }

	/**
     * @constructor Creates a ColorHandler instance and initializes the validation canvas.
     * @param {string | HTMLElement | Class | null} parent parent of the instance
	 */
	constructor(parent) {
        super(parent);
		this.#canvas = document.createElement('canvas');
		this.#ctx = this.#canvas.getContext('2d', { willReadFrequently: true });
	}


	/**
	 * Parses any valid CSS color format into a normalized object.
	 * Supports HEX, RGB(A), HSL(A), arrays, objects and color names.
	 * Returns `undefined` for invalid values in strictMode.
	 * @param {String | Array | Object} expression - Any CSS-valid color value.
	 * @returns {Object | undefined} normalized color data
	 */
	#parseColor(expression) {
		if (!expression) return this.#strictMode ? undefined : { r: 0, g: 0, b: 0, a: 0 };

		let r = 0, g = 0, b = 0, a = 1, hex = '', name = '';

		const clamp = (n, min = 0, max = 255) => Math.min(Math.max(n, min), max);
		const hslToRgb = (h, s, l) => {
			s /= 100; l /= 100;
			const k = n => (n + h / 30) % 12;
			const a = s * Math.min(l, 1 - l);
			const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
			return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
		};
		const getYIQ = (r, g, b) => Math.round((r * 299 + g * 587 + b * 114) / 1000);

		if (Array.isArray(expression)) {
			[r, g, b, a] = expression;
			a = a === undefined ? 1 : a;
		}
		else if (typeof expression === 'object') {
			r = expression.r ?? 0;
			g = expression.g ?? 0;
			b = expression.b ?? 0;
			a = expression.a ?? 1;
		}
		else if (typeof expression === 'string') {
			expression = expression.trim().toLowerCase();

			if (CSS_COLORS[expression]) {
				hex = '#' + CSS_COLORS[expression];
				name = expression;
			}
			else if (/^#([a-f0-9]{3,8})$/i.test(expression)) {
				let hexDigits = expression.slice(1);
				if (hexDigits.length === 3 || hexDigits.length === 4)
					hexDigits = hexDigits.split('').map(h => h + h).join('');
				if (hexDigits.length === 6) hex = '#' + hexDigits;
				if (hexDigits.length === 8) {
					hex = '#' + hexDigits.slice(0, 6);
					a = parseInt(hexDigits.slice(6, 8), 16) / 255;
				}
				[r, g, b] = [
					parseInt(hexDigits.slice(0, 2), 16),
					parseInt(hexDigits.slice(2, 4), 16),
					parseInt(hexDigits.slice(4, 6), 16)
				];
			}
			else if (/^rgba?\(/.test(expression)) {
				const nums = expression.match(/[\d.]+/g);
				if (nums) {
					[r, g, b, a] = nums.map(Number);
					a = a === undefined ? 1 : a > 1 ? a / 255 : a;
				}
			}
			else if (/^hsla?\(/.test(expression)) {
				const nums = expression.match(/[\d.]+/g);
				if (nums) {
					let [h, s, l, alpha] = nums.map(Number);
					[r, g, b] = hslToRgb(h, s, l);
					a = alpha === undefined ? 1 : alpha;
				}
			}
			else {
				this.#ctx.fillStyle = '#00000000';
				this.#ctx.fillStyle = expression;
				if (this.#ctx.fillStyle !== '#00000000') {
					const data = this.#getRGBA_Array(this.#ctx.fillStyle);
					[r, g, b, a] = data;
					a = +(a / 255).toFixed(2);
					hex = this.toHex(`rgba(${r},${g},${b},${a})`);
				} else if (this.#strictMode) return undefined;
			}
		}

		r = clamp(r); g = clamp(g); b = clamp(b);
		a = a > 1 ? +(a / 255).toFixed(2) : +a.toFixed(2);
		if (!hex) hex = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
		if (!name) name = Object.keys(CSS_COLORS).find(k => CSS_COLORS[k] === hex.slice(1));
		const yiq = getYIQ(r, g, b);
		// const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const toLinear = v => {
            const srgb = v / 255;
            return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
        };
        // WCAG relative luminance (sRGB → linear → Y).
        const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

		return { r, g, b, a, hex, name, yiq, luminance };
	}

	/**
	 * Converts a given color to a HEX string.
	 * @param {String | Array | Object} color - Any valid color format
	 * @returns {String | undefined} HEX color string
	 */
	toHex(color) {
		const c = this.#parseColor(color);
		return c ? c.hex : undefined;
	}

	/**
	 * Converts a given color to an RGB(A) string.
	 * @param {String | Array | Object} color - Any valid color format
	 * @param {Boolean} alpha - Whether to include alpha channel
	 * @returns {String | undefined} RGB(A) string
	 */
	toRGB(color, alpha = false) {
		const c = this.#parseColor(color);
		if (!c) return undefined;
		const prefix = alpha ? 'rgba' : 'rgb';
		const suffix = alpha ? `, ${c.a})` : ')';
		return `${prefix}(${c.r}, ${c.g}, ${c.b}${suffix}`;
	}

	/**
	 * Converts a given color to an HSL(A) string.
	 * @param {String | Array | Object} color - Any valid color format
	 * @param {Boolean} alpha - Whether to include alpha channel
	 * @returns {String | undefined} HSL(A) string
	 */
	toHSL(color, alpha = false) {
		const c = this.#parseColor(color);
		if (!c) return undefined;
		const r = c.r / 255, g = c.g / 255, b = c.b / 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		let h, s, l = (max + min) / 2;
		if (max === min) h = s = 0;
		else {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			switch (max) {
				case r: h = (g - b) / d + (g < b ? 6 : 0); break;
				case g: h = (b - r) / d + 2; break;
				case b: h = (r - g) / d + 4; break;
			}
			h *= 60;
		}
		h = Math.round(h);
		s = Math.round(s * 100);
		l = Math.round(l * 100);
		return alpha ? `hsla(${h}, ${s}%, ${l}%, ${c.a})` : `hsl(${h}, ${s}%, ${l}%)`;
	}

	/**
	 * Converts a given color to its YIQ brightness value.
	 * @param {String | Array | Object} color - Any valid color format
	 * @returns {Number | undefined} numeric YIQ value
	 */
	toYIQ(color) {
		const c = this.#parseColor(color);
		return c ? c.yiq : undefined;
	}

	/**
	 * Calculates the luminance of a color (0 to 1).
	 * @param {String | Array | Object} color - Any valid color format
	 * @returns {Number | undefined} luminance value
	 */
	getLuminance(color) {
		const c = this.#parseColor(color);
		return c ? c.luminance : undefined;
	}

	/**
	 * Calculates the brightness of a color (0 to 100).
	 * @param {String | Array | Object} color - Any valid color format
	 * @returns {Number | undefined} brightness value
	 */
	getBrightness(color) {
		const c = this.#parseColor(color);
		return c ? Math.pow(c.luminance, 0.68) * 100 : undefined;
	}

	/**
	 * Calculates the contrast ratio between two colors (1–21).
	 * @param {String | Array | Object} color1
	 * @param {String | Array | Object} color2
	 * @returns {Number | undefined} contrast ratio
	 */
	getContrastRatio(color1, color2) {
		const c1 = this.#parseColor(color1);
		const c2 = this.#parseColor(color2);
		if (!c1 || !c2) return undefined;
		return (Math.max(c1.luminance, c2.luminance) + 0.05) /
			   (Math.min(c1.luminance, c2.luminance) + 0.05);
	}

	/**
	 * Determines an automatic readable text color (black or white)
	 * based on the given background color.
	 * @param {String | Array | Object} bgColor - Background color
	 * @returns {String} '#000' or '#fff'
	 */
	getAutoTextColor(bgColor) {
		const c = this.#parseColor(bgColor);
		if (!c) return '#000';
		return c.yiq > 128 ? '#000' : '#fff';
	}

	/**
	 * Inverts the given color (returns its complementary color).
	 * @param {String | Array | Object} color - Any valid color format
	 * @returns {String | undefined} inverted HEX color string
	 */
	invert(color) {
		const c = this.#parseColor(color);
		if (!c) return undefined;
		return `#${[255 - c.r, 255 - c.g, 255 - c.b]
			.map(v => v.toString(16).padStart(2, '0')).join('')}`;
	}

	/**
	 * Checks whether a given value is a valid color.
	 * @param {String | Array | Object} color - Any potential color value
	 * @returns {Boolean} true if valid, false otherwise
	 */
	isValid(color) {
		return !!this.#parseColor(color);
	}

	/**
	 * Mixes two colors together in the given ratio.
	 * @param {SString | Array | Object} color1 - First color
	 * @param {String | Array | Object} color2 - Second color
	 * @param {Number} ratio - Mixing ratio (0–1)
	 * @returns {String | undefined} mixed color (HEX)
	 */
	mix(color1, color2, ratio = 0.5) {
		const c1 = this.#parseColor(color1);
		const c2 = this.#parseColor(color2);
		if (!c1 || !c2) return undefined;
		const mix = (a, b) => Math.round(a + (b - a) * ratio);
		return `#${[mix(c1.r, c2.r), mix(c1.g, c2.g), mix(c1.b, c2.b)]
			.map(v => v.toString(16).padStart(2, '0')).join('')}`;
	}

	/**
	 * Generates a random color in HEX format.
	 * @returns {String} random HEX color
	 */
	randomColor() {
		return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
	}

	/**
	 * Converts any valid fillStyle into a Uint8ClampedArray [R,G,B,A].
	 * Invalid styles return [0,0,0,0].
	 * @param {String} color
	 * @returns {Uint8ClampedArray}
	 * @private
	 */
	#getRGBA_Array(color) {
		this.#ctx.fillStyle = '#00000000';
		this.#ctx.clearRect(0, 0, 1, 1);
		this.#ctx.fillStyle = color;
		this.#ctx.fillRect(0, 0, 1, 1);
		return this.#ctx.getImageData(0, 0, 1, 1).data;
	}
}