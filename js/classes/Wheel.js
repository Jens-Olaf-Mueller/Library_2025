import { ListGenerator } from './ListGenerator.js';
import { NOT_FOUND } from '../constants.js';

/**
 * ===============================================================
 * Wheel — Scrollable wheel column with snap + 3D visual effect
 * ===============================================================
 *
 * Implements a single wheel/column inside the WheelPicker overlay.
 * The wheel renders a list of items (<li>) into an existing column structure
 * and provides scroll/click interaction with automatic snapping to the
 * nearest item. Optionally supports "wrap" behavior via cloning for an
 * endless-feeling scroll, or finite mode with dummy padding items.
 *
 * Core responsibilities:
 * - build the list from a role-specific wheel config (via ListGenerator)
 * - manage virtual vs. real indices for endless scroll
 * - detect scroll end and snap to nearest row
 * - apply the 3D transform styling based on active virtual position
 * - notify the WheelPicker via `onSnap` callback when the stable value changes
 * - provide programmatic snapping via `snapToValue()`
 *
 * ---------------------------------------------------------------
 * I. Public Methods
 * ---------------------------------------------------------------
 * snapToValue:         - programmatically scrolls/snaps to a given logical value
 *
 * ---------------------------------------------------------------
 * II. Private Methods
 * ---------------------------------------------------------------
 * #init:               - initializes wheel state, renders items, measures layout, attaches events, sets initial position
 * #cloneItems:         - creates the virtual item set (wrap clones or finite dummies) and replaces list DOM
 * #measure:            - measures item height, visible row count, center offset, and block size for recentering
 * #attachEvents:       - attaches scroll and click event handlers to column/list
 * #handleScroll:       - scroll handler; updates active state, recenters (wrap), and schedules snap
 * #handleItemClick:    - click handler; smooth-scrolls to clicked item’s virtual index
 * #updateFromScroll:   - derives active virtual index and real index from scrollTop; triggers 3D update
 * #apply3DEffect:      - applies per-item transforms/opacity and toggles active class around the center row
 * #recentreIfNeeded:   - keeps scrollTop inside the middle block in wrap mode to emulate endless scrolling
 * #scheduleSnap:       - debounce timer to detect scroll end and trigger snapping
 * #snapToNearest:      - computes the nearest virtual index and snaps to it
 * #scrollToVirtualIndex:- scrolls the column so the given virtual index lands in the selection window
 * #loadWheel:          - loads the role config, creates list items, and sets the start index for initial selection
 * #doHaptic:           - placeholder hook for haptic feedback integration
 */
export class Wheel extends ListGenerator {
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
        // this.haptic.tick();
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

        // Virtueller Index der Zeile im Auswahlfenster
        let activeVirtual = Math.round(rawIndex + this.centerOffset);
        activeVirtual = Math.max(0, Math.min(this.itemsCount - 1, activeVirtual));
        this.activeVirtualIndex = activeVirtual;

        // "Echter" Index (0..baseItemsCount-1)
        const realIndex = ((activeVirtual % this.baseItemsCount) + this.baseItemsCount) % this.baseItemsCount;
        this.valueIndex = realIndex;

        // → genau HIER den 3D-Helper aufrufen
        this.#apply3DEffect();
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
        this.haptic.tick();
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

    // =================================================================================
    // =====                            PRIVATE HELPERS                            =====
    // =================================================================================

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

    // ====== haptics dummy =====================================================

    #doHaptic(action = 'tick') {
        // TODO Haptik später implementieren
        // evl. in Picker?!
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