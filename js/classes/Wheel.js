import { WheelGenerator } from './WheelGenerator.js';
import { NOT_FOUND } from '../constants.js';

/**
 * @file Wheel.js
 * @module Wheel
 * @extends WheelGenerator
 * @version 1.0.0
 * @author Jens-Olaf-Mueller
 *
 * Wheel — Scrollable UI column with automated snapping and 3D visual effects.
 * ===========================================================================
 *
 * Implements a single interactive wheel/column within the WheelPicker.
 * It manages hardware-accelerated scrolling, localized snapping, and virtual infinite loops.
 * - Key Features:
 *   - 3D Transformation: Applies dynamic `rotateX`, `translateZ`, and `opacity` to simulate a physical cylinder.
 *   - Infinite Scroll (Wrap): Uses a triple-block cloning strategy and silent recentering to emulate endless rotation.
 *   - Snap Engine: Features a debounced scroll listener that automatically stabilizes the wheel on the nearest logical item.
 *   - Haptic Feedback: Triggers tactile 'tick' effects via the integrated Haptic engine during scroll updates.
 *   - Adaptive Layout: Automatically measures item heights and viewport constraints to center the selection window.
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * - {@link snapToValue} - Programmatically scrolls and snaps the wheel to a specific logical value.
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * - #init()                - Orchestrates the initial rendering, measurement, and event binding.
 * - #cloneItems()          - Prepares the DOM structure for either infinite wrapping or finite padded scrolling.
 * - #measure()             - Calculates critical layout metrics like item height and center offsets.
 * - #attachEvents()        - Binds native scroll and click listeners to the column and list elements.
 * - #handleScroll()        - Orchestrates 3D updates, recentering logic, and the snapping scheduler during interaction.
 * - #handleItemClick()     - Smoothly centers the wheel on a specifically clicked item.
 * - #updateFromScroll()    - Derives active indices from the current scroll position and triggers visual updates.
 * - #apply3DEffect()       - Applies CSS transforms and opacity based on an item's distance from the center row.
 * - #recentreIfNeeded()    - Silently resets scroll position in wrap-mode to maintain the infinite loop illusion.
 * - #scheduleSnap()        - Debounces the scroll-end detection to prevent premature snapping.
 * - #snapToNearest()       - Computes the final target position and initiates the snap animation.
 * - #scrollToVirtualIndex()- Performs the actual scroll operation (smooth or instant) to a specific index.
 * - #loadWheel()           - Populates the wheel with items based on the assigned role configuration.
 *
 * ---------------------------------------------------------------
 * III. Events
 * ---------------------------------------------------------------
 * This class uses the `onSnap` callback to communicate with the WheelPicker.
 * - onSnap {Object} - Includes role, logical value, index, and wheel reference.
 *
 * ---------------------------------------------------------------
 * IV. CSS Variables (Theming API)
 * ---------------------------------------------------------------
 * Theming is centrally managed by the `WheelPicker`. Individual wheels use the `--wheel-` variables.
 */
export class Wheel extends WheelGenerator {
    #snapTimer = null; // Intern: Timer zum Erkennen von "Scroll-Ende"
    #isSnapping = false;
    #blocks = 3;
    #middleBlock = 1;

    #initDone = false;
    get initDone() { return this.#initDone; }

    #activeValue = undefined;
    get activeValue() { return this.#activeValue; }
    set activeValue(newVal) { this.#activeValue = newVal; }

    baseItems = [];
    startIndex = 0;

    get baseItemsCount () { return this.baseItems ? this.baseItems.length : 0; }

    /**
     * @param {HTMLElement} rootColumn  .wheel-column[data-wheel]
     * @param {Object} [options]
     * @param {Function} [options.onChange]    Optionaler Callback (value, index)
     */
    constructor(rootColumn, options = {}) {
        super(rootColumn, options);

        this.role = options.role;
        this.min = options.min;
        this.max = options.max;
        this.step = options.step;
        this.wrap = options.wrap ?? true;
        this.data = options.dataSource;
        this.activeValue = options.value;
        this.createElement = options.createElement;
        this.haptic = options.haptic;

        this.onSnap = options.onSnap; // callback to inform WheelPicker about changed value!
        this.column.hidden = false;
        this.list.setAttribute('role', this.role);
        this.#initDone = this.#init(this.role);
    }


    #init(role) {
        this.#loadWheel(role);
        if (this.itemsCount === 0) return false;
        this.baseItems = this.items;
        this.#measure();
        this.#cloneItems();
        // this.#measure();
        this.#attachEvents();

        // Basisidee: Block 0,1,2 → wir wollen Block 1 + activeIndex
        const initialVirtual = this.wrap
            ? (this.#middleBlock * this.baseItemsCount + (this.startIndex ?? 0))
            : (3 + this.startIndex);

        this.#scrollToVirtualIndex(initialVirtual, false);
        this.#updateFromScroll();
        return true;
    }


    /**
     * Inneres DOM aufbereiten: Items 3× klonen für "endlose" Schleife.
     */
    #cloneItems() {
        const frag = document.createDocumentFragment();

        if (this.wrap) {
            // ensure enough total items for smooth scrolling & recentering
            // rule of thumb: visible-window + 2 whole base-blocks around center
            const minTotal = (this.itemsVisible ?? 7) + 2 * this.baseItemsCount;
            this.#blocks = Math.max(3, Math.ceil(minTotal / this.baseItemsCount));
            this.#middleBlock = Math.floor(this.#blocks / 2);

            for (let i = 0; i < this.#blocks; i++) {
                this.baseItems.forEach(item => frag.appendChild(item.cloneNode(true)));
            }
        } else {
            // wrap=false: 1 block + dummies
            this.#blocks = 1;
            this.#middleBlock = 0;
            this.baseItems.forEach(item => frag.appendChild(item.cloneNode(true)));

            for (let i = 0; i < 3; i++) {
                const item = this._createListItem(i, Infinity, '', {
                    disabled: true, style: 'pointer-events:none;'
                });
                frag.prepend(item);
                frag.appendChild(item.cloneNode(true));
            }

            let index = 0;
            for (const it of frag.children) it.dataset.item = index++;
        }

        this.list.innerHTML = '';
        this.list.appendChild(frag);
    }


    /**
     * Maße ermitteln (Item-Höhe, sichtbare Anzahl, Winkel etc.).
     */
    #measure() {
        const firstItem = this.items[0];
        const rect = firstItem.getBoundingClientRect();
        this.itemHeight = rect.height || parseFloat(getComputedStyle(firstItem).height);

        const viewportHeight = this.column.clientHeight;
        this.itemsVisible = Math.max(1, Math.round(viewportHeight / this.itemHeight));

        // Mitte des Fensters (z. B. 3 bei 7 sichtbaren Items)
        this.centerOffset = Math.floor(this.itemsVisible / 2);

        // Winkel pro Schritt: -90° .. +90° über alle sichtbaren Items
        // this.angleStep = this.itemsVisible > 1 ? 180 / (this.itemsVisible - 1) : 0;

        // Block-Größe für "Re-Centering" (1 Block = 1× baseItems)
        this.blockSizePx = this.baseItemsCount * this.itemHeight;
    }


    /**
     * Event-Handler für Scroll und Click anhängen.
     */
    #attachEvents() {
        this._onScroll = this.#handleScroll.bind(this);
        this._onItemClick = this.#handleItemClick.bind(this);
        this.column.addEventListener('scroll', this._onScroll, { passive: true });
        this.list.addEventListener('click', this._onItemClick);
    }

    /**
     * Scroll-Handler: während des Scrollens 3D + aktive Zeile aktualisieren
     * und einen Snap-Timer setzen.
     */
    #handleScroll() {
        if (!this.#initDone) return;
        this.#updateFromScroll();
        this.#recentreIfNeeded();
        this.#scheduleSnap();
    }

    /**
     * Click auf ein Item → sanft so scrollen, dass das Item ins Fenster-Zentrum rutscht.
     */
    #handleItemClick(evt) {
        const li = evt.target.closest('.wheel-item');
        if (!li || !this.list.contains(li)) return;

        const virtualIndex = this.items.indexOf(li);
        if (virtualIndex === -1) return;

        this.#isSnapping = true;
        this.#scrollToVirtualIndex(virtualIndex, true);
    }

    /**
     * Ermittelt aus scrollTop den virtuellen Index der aktiven Zeile,
     * berechnet den "echten" Index und wendet 3D-Transform + Active-Klasse an.
     */
    #updateFromScroll() {
        const scrollTop = this.column.scrollTop;
        const rawIndex  = scrollTop / this.itemHeight;

        let activeVirtual = Math.round(rawIndex + this.centerOffset);
        activeVirtual = Math.max(0, Math.min(this.itemsCount - 1, activeVirtual));

        // Nur wenn der Index sich wirklich geändert hat!
        if (this.activeVirtualIndex !== activeVirtual) {
            this.activeVirtualIndex = activeVirtual;
            const realIndex = ((activeVirtual % this.baseItemsCount) + this.baseItemsCount) % this.baseItemsCount;
            this.valueIndex = realIndex;
            // INFO:  .
            // REVIEW requestAnimationFrame(() => this.#apply3DEffect()); ???
            this.#apply3DEffect();
            // apply possible haptic effect
            if (this.haptic && this.#initDone) this.haptic.execute('tick');
        }
    }

    #apply3DEffect() {
        const {
            baseLineHeight,
            lineOffset,
            rotateX,
            shiftY,
            opacity,
            translateZ,
            fontSize
        } = wheel3D;

        this.items.forEach((item, idx) => {
            const offset = idx - this.activeVirtualIndex;           // < 0 = oberhalb, > 0 = unterhalb
            const capped = Math.min(Math.abs(offset), lineOffset.length - 1);

            let lineHeight = baseLineHeight,
                angle      = 0,
                dy         = 0,
                font       = 1;

            if (offset < 0) { // above centre...
                lineHeight = baseLineHeight - lineOffset[capped];
                angle = rotateX[capped];
                dy = shiftY[capped];
                font = fontSize[capped];
            } else if (offset > this.centerOffset) {
                item.removeAttribute('style');
                return;
            } else if (offset > 0) { // below centre...
                lineHeight = baseLineHeight + lineOffset[capped];
                angle = -rotateX[capped];
                dy = -shiftY[capped];
                font = -fontSize[capped];
            }

            const depth = translateZ[capped];   // Z-Achse
            item.style.lineHeight = `${lineHeight}rem`;
            item.style.transform  = `rotateX(${angle}deg) translateZ(${depth}px) translateY(${dy}px)`;
            item.style.opacity    = String(opacity[capped]); // Transparenz
            item.style.fontSize   = `${font}rem`;
            item.classList.toggle('wheel-item--active', (offset === 0));
        });
    }


    /**
     * Hält scrollTop in der Mitte der 3 Blöcke, damit man gefühlt endlos scrollen kann.
     */
    #recentreIfNeeded() {
        if (!this.wrap) return;

        const scrollTop = this.column.scrollTop;
        const block = this.blockSizePx;
        const low  = (this.#middleBlock - 0.5) * block;
        const high = (this.#middleBlock + 0.5) * block;

        if (scrollTop < low) {
            this.column.scrollTop = Math.min(scrollTop + block, this.column.scrollHeight - this.column.clientHeight);
        } else if (scrollTop > high) {
            this.column.scrollTop = Math.max(scrollTop - block, 0);
        }
    }


    /**
     * Timer setzen: wenn für kurze Zeit kein Scroll-Event kommt, snappen wir auf die nächste Zeile.
     */
    #scheduleSnap() {
        if (this.#isSnapping) return;

        clearTimeout(this.#snapTimer);
        this.#snapTimer = setTimeout(() => {
            this.#snapToNearest();
        }, 75); // 75ms "Pause" = Scroll beendet
    }

    /**
     * Snap auf die nächste ganze Zeile (virtueller Index).
     */
    #snapToNearest() {
        this.#isSnapping = true;

        const scrollTop = this.column.scrollTop;
        const rawIndex = scrollTop / this.itemHeight;
        const targetVirtual = Math.round(rawIndex + this.centerOffset);

        this.#scrollToVirtualIndex(targetVirtual, true);
    }

    /**
     * Scrollt so, dass ein bestimmter virtueller Index im Fensterzentrum landet.
     * @param {number} virtualIndex
     * @param {boolean} smooth
     */
    #scrollToVirtualIndex(virtualIndex, smooth = false) {
        const targetRawIndex = virtualIndex - this.centerOffset;
        const targetScrollTop = targetRawIndex * this.itemHeight;

        if ('scrollTo' in this.column) {
            this.column.scrollTo({
                top: targetScrollTop,
                behavior: smooth ? 'smooth' : 'auto',
            });
        } else {
            this.column.scrollTop = targetScrollTop;
        }

        // Nach kurzer Zeit Zustand aktualisieren (nach Smooth-Scroll)
        setTimeout(() => {
            this.#updateFromScroll();
            this.#recentreIfNeeded();
            this.#isSnapping = false;

            // HIER: Picker informieren
            if (typeof this.onSnap === 'function') {
                this.onSnap({
                    role: this.role,           // 'day' | 'month' | 'year' | 'spin' | ...
                    value: this.value,         // logischer Wert
                    index: this.valueIndex,    // 0..baseItemsCount-1
                    wheel: this                // Referenz, falls nötig
                });
            }
        }, smooth ? 75 : 0); // 150 ??
    }

    /**
     * Programmatically snap the wheel so that the item with the given logical
     * value lands in the selection window.
     *
     * @param {number|string} value  Logical value of the item (matches <li>.value)
     * @param {boolean} [smooth=false] Use smooth scrolling animation
     */
    snapToValue(value, smooth = false) {
         // 1) Index im Basis-Block finden (0..baseItemsCount-1)
        const baseIndex = this.baseItems.findIndex(item => item.value === value);
        if (baseIndex === NOT_FOUND) return;

        const candidates = [];

        // 2) Mögliche virtuelle Indizes in den 3 Blöcken sammeln
        for (let block = 0; block < this.#blocks; block++) {
            const idx = block * this.baseItemsCount + baseIndex;
            if (idx >= 0 && idx < this.itemsCount) candidates.push(idx);
        }

        if (!candidates.length) return;

        // 3) Den Kandidaten wählen, der dem aktuellen activeVirtualIndex am nächsten ist
        let virtualIndex = candidates[0];
        if (Number.isFinite(this.activeVirtualIndex)) {
            const current = this.activeVirtualIndex;
            virtualIndex = candidates.reduce((best, idx) =>
                Math.abs(idx - current) < Math.abs(best - current) ? idx : best, candidates[0]
            );
        }

        // 4) Auf diesen virtuellen Index scrollen
        this.#scrollToVirtualIndex(virtualIndex, smooth);

        setTimeout(() => {
            this.#updateFromScroll();
        }, smooth ? 180 : 0);
    }


    #loadWheel(role) {
        const whlConfig = this._getWheelConfig(role);
        // Merken, welches Basis-Item "logisch aktiv" ist
        this.startIndex = whlConfig.activeIndex ?? 0;

        for (let i = 0; i < whlConfig.length; i++) {
            const val = whlConfig.values[i];
            const caption = ('captions' in whlConfig) ? whlConfig.captions[i] : whlConfig.format(val);
            this.addItem(val, caption, i);
        }
    }
} // END CLASS

// 3D configuration for the visual wheel effect.
// All values are derived from hand-tuned example:
// line-height from 0.6rem .. 3.0rem, rotateX +/- 60°, translateY +/- 16px, etc.
const wheel3D = Object.freeze({
    // Base line-height for the center row (in rem)
    baseLineHeight: 1.8,

    // Offsets relative to the base line-height for |offset| = 0,1,2,3
    // Effective line-height:
    //   offset === 0 → base
    //   offset  <  0 → base - lineOffset[|offset|]
    //   offset  >  0 → base + lineOffset[|offset|]
    lineOffset: [0.0, 0.4, 0.8, 1.2],

    // Rotation around the X axis in degrees for |offset| = 0,1,2,3
    // Sign depends on direction:
    //   above center  (offset < 0) → +rotateX[|offset|]
    //   below center  (offset > 0) → -rotateX[|offset|]
    rotateX: [0, 20, 35, 60],

    // Vertical shift (translateY) in px for |offset| = 0,1,2,3
    shiftY: [0, 4, 8, 16],

    // Opacity for |offset| = 0,1,2,3
    opacity: [1.0, 0.75, 0.5, 0.25],

    // Fixed Z-distance for the circular effect (px),
    // must match transform-origin Z in CSS as "radius"
    translateZ: [96, 92, 88, 84],

    fontSize:[1, 0.95, 0.85, 0.7]
});