/**
 * ComboBox Web Component (Hybrid: custom UL/LI + native SELECT fallback)
 *
 * Priorities:
 * - Preserve original API & comments as much as possible
 * - Fix real bugs; Each change is annotated with a German "Bugfix" comment
 * - No feature creep; extra UX/A11y later
 *
 * Modes:
 * - mode="auto" (default): iOS -> native, otherwise custom
 * - mode="custom": always UL/LI
 * - mode="native": always <select>
 *
 */

import Library from '../classes/Library.js';

const TMP_COMBOSTYLE = document.createElement('template'),
	TMP_PLUSSIGN = document.createElement('template'),
	TMP_ARROW = document.createElement('template'),
	TMP_CLOSE = document.createElement('template');

TMP_COMBOSTYLE.innerHTML = `
	<style>
		:host {
			display: inline-block;
			border: 1px solid silver;
			padding: 0;
			position: relative; /* needed for outside-click hit testing and stacking contexts */
		}

		/* Bugfix: Tippfehler korrigiert. Früher: :host:(input:disabled) — das war ungültig */
		:host(:disabled) {
			border: 2px solid red;
		}

		/* Hybrid: In native-Mode zeigen wir <select>, in custom-Mode den bisherigen Wrapper */
		:host([mode="native"]) #divCombo { display: none; }
		:host([mode="native"]) select.jom-select { display: inline-block; }
		:host([mode="custom"]) select.jom-select,
		:host([mode="auto"])   select.jom-select { display: none; }

		#divCombo.jom-combo {
			height: 100%;
			display: inline-block;
			position: relative;
			border-radius: inherit;
			width: 100%;
			box-sizing: border-box;
		}

		#inpCombo.jom-input {
			height: 100%;
			padding: 0 0 0 0.5rem;
			outline: none;
			border: none;
			border-radius: inherit;
			font: inherit;
			width: 100%;
			box-sizing: border-box;
		}

		.jom-input:disabled {
			background-color: field;
			color: fieldtext;
		}

		/* DropDown-Liste (Overlay) */
		.jom-combo ul {
			position: absolute;
			width: 100%;
			z-index: 1000;
			list-style: none;
			padding: unset;
			margin: unset;
			margin-top: 1px;
			overflow-y: hidden;
			box-sizing: border-box;
			background: var(--combo-list-background, field);
            /* smooth open-close animation via max-height */
            transition: max-height 180ms ease;
            will-change: max-height;
		}

		/* Bugfix: :has(li) entfernt (Support/Performance). Stattdessen toggeln wir .has-items per JS */
		.jom-combo ul.has-items {
			border-bottom: 1px solid silver;
		}

		.jom-combo ul.scroll {
			overflow-y: auto; /* Bugfix: 'scroll' -> 'auto' verhindert unnötige Scrollbars */
		}

        /* Bugfix: Während der Animation keine Scrollbars/Interaktion */
        .jom-combo ul.animating {
            overflow: hidden !important;
            pointer-events: none;
        }

		li.jom-list-item {
			display: flex;
			align-items: center;
			justify-content: space-between;
			border-left: 1px solid silver;
			border-right: 1px solid silver;
			background-color: var(--combo-list-background, field);
			padding: var(--combo-item-padding, 0.25rem 0.5rem);
		}

		li.jom-list-item:last-child {
			border-bottom: 1px solid silver;
		}

		li.jom-list-item[selected] {
			color: var(--combo-selected-color, white);
			background-color: var(--combo-selected-background-color, #0075ff);
		}

		.combo-icon {
			position: absolute;
			height: var(--combo-arrow-size, 1.25rem);
			width: var(--combo-arrow-size, 1.25rem);
			top: 50%;
			transform: translateY(-50%);
			right: 1px;
			cursor: pointer;
			z-index: 1001; /* Bugfix: z-index reduziert und leicht über UL */
		}

		#divArrow {
			transition: transform 350ms ease;
		}

		:host([open]) #divArrow {
			transform: rotate(180deg) translateY(50%)
		}

		.combo-delete {
			display: flex;
			align-items: center;
			justify-content: center;
			aspect-ratio: 1 / 1;
			height: 0.75rem;
			cursor: pointer;
		}

		.combo-delete:hover svg {
			mix-blend-mode: exclusion;
			fill: var(--combo-selected-color, white);
			transform: scale(1.25);
		}

		.combo-icon svg {
			stroke: var(--combo-accent-color, #0075ff);
			fill: var(--combo-accent-color, #0075ff);
		}

		:host([disabled]) svg {
			stroke: #aaa;
			fill: #aaa;
		}

		:host([hidden]), [hidden] {
			display: none;
		}

		/* Native SELECT Style (sichtbar nur in mode="native") */
		select.jom-select {
			height: 100%;
			width: 100%;
			font: inherit;
			border: none;
			background: field;
			color: fieldtext;
			border-radius: inherit;
			box-sizing: border-box;
			padding: 0 0.5rem;
		}
	</style>`;

TMP_PLUSSIGN.innerHTML = `
	<div id="divPlus" class="combo-icon" hidden>
		<svg xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			stroke-width="20">
			<path d="M40 100 h120 M100 40 v120z"/>
		</svg>
	</div>`;

TMP_ARROW.innerHTML = `
	<div id="divArrow" class="combo-icon" hidden>
		<svg xmlns="http://www.w3.org/2000/svg"
			id="svgArrow"
			viewBox="0 0 100 100">
			<path d="M20 35 l30 30 l30-30z"/>
		</svg>
	</div>`;

TMP_CLOSE.innerHTML = `
	<svg xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 16 16"
		fill="#000000A0">
		<path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
	</svg>`;

class ComboBox extends HTMLElement {
	#size = 6;
	#type = 'combo';
	#dropped = false;
	#listindex = -1;
	#options = null;
	#internals = null;
	#mode = 'auto'; // auto | custom | native
    // Bugfix: Animations-Status, verhindert Reentrancy bei schnellem Öffnen/Schließen
    #animating = false;

	/**
	 * @summary `getter`
	 * Returns an array of all <kbd>getters</kbd> and <kbd>setters</kbd> of this class.
	 * If only <kbd>getters</kbd> are wanted, the code must be changed from:
	 * <kbd>...=> typeof descriptor.set  === 'function' TO: ...=> typeof descriptor.<strong>get</strong> === 'function'</kbd>
	 * @memberof ComboBox
	 * @member {String.<Array>} properties
	 * @readonly
	 * @see {@link https://stackoverflow.com/questions/39310890/get-all-static-getters-in-a-class}
	 */
	get properties() {
		const props = Object.entries(Object.getOwnPropertyDescriptors(ComboBox.prototype))
			.filter(([key, descriptor]) => typeof descriptor.set === 'function')
			.map(([key]) => key);
		return props;
	}

	/**
	 * @summary `getter | setter`
	 * Returns or assigns the displayed list items.
	 * Returns null if list is empty.
	 * @memberof ComboBox
	 * @member {String | String.<Array>} options
	 */
	get options() {
		if (this.#options) return this.#options;
		if (this.hasAttribute('options')) return this.getAttribute('options');
		return null;
	}
	set options(newOpts) {
		if (newOpts == null) return;
		// Bugfix: Kein destruktives Entfernen von Sonderzeichen mehr.
		// - Früher Regex, der z. B. Apostrophe/Bindestriche entfernte.
		// - Jetzt: JSON-Parse versuchen; sonst an Kommas splitten und trimmen.
		if (typeof newOpts === 'string') {
			let parsed = null;
			const trimmed = newOpts.trim();
			if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
				try { parsed = JSON.parse(trimmed); } catch {}
			}
			if (!parsed) {
				parsed = newOpts.split(',').map(s => s.trim());
			}
			newOpts = parsed;
		}
		this.#options = Array.from(new Set(newOpts.map(opt => String(opt)))); // Unique by value (wie bisher implizit erwartet)
		if (this.#options.length == 0) {
			this.showIcon(false);
			return;
		}
		const attrOpts = this.#options.join(',');
		const icon = this.value.length > 0 && !this.#options.includes(this.value) ? 'plus' : 'arrow';
		this.showIcon(icon);
		if (!this.hasAttribute('options')) this.setAttribute('options', attrOpts);

		// Native select synchronisieren (falls aktiv/angelegt)
		if (this.DOM?.select) {
			this.#syncSelectOptions();
		}
	}

	/**
	 * @summary `getter | setter`
	 * Determines whether the ComboBox works as a simple dropdown list or if it provides the full new functionality.
	 * The type may contain one of these values:
	 * - combo (default)
	 * - list
	 * @memberof ComboBox
	 * @member {String} type
	 */
	get type() { return this.#type; }
	set type(newType) {
		newType = newType?.trim();
		if (!'list combo'.includes(newType)) return;
		this.#type = newType;
		this.setAttribute('type', newType);
		if (this.input) {
			this.input.toggleAttribute('disabled', (newType === 'list') || this.disabled);
			if (newType === 'list') this.input.value = '';
		}
	}

	/**
	 * @summary `getter | setter`
	 * <strong>true | false</strong>
	 * Returns or determines whether the dropdown list can be extended by new entries or not.
	 * If property is <strong>true</strong> or the corresponding HTML attribute is set,
	 * a new entry can be added by pressing the <kbd>ENTER</kbd> key or clicking the + symbol
	 * that appears on the right side of the control.
	 * @memberof ComboBox
	 * @member {Boolean} extendable
	 */
	get extendable() { return this.hasAttribute('extendable'); }
	set extendable(flag) {
		this.toggleAttribute('extendable', this.toBoolean(flag));
	}

	/**
	 * @summary `getter | setter`
	 * Returns or determines if the displayed dropdown list is sorted or not.
	 * <strong>true | false</strong>
	 * @memberof ComboBox
	 * @member {Boolean} sorted
	 */
	get sorted() { return this.hasAttribute('sorted'); }
	set sorted(flag) {
		this.toggleAttribute('sorted', this.toBoolean(flag));
	}

	/**
	 * @summary `getter | setter`
	 * Returns or sets the control's disabled state. <strong>true | false</strong>
	 * @memberof ComboBox
	 * @member {Boolean} disabled
	 */
	get disabled() { return this.hasAttribute('disabled'); }
	set disabled(flag) {
		this.toggleAttribute('disabled', this.toBoolean(flag));
		if (this.input) this.input.toggleAttribute('disabled', this.toBoolean(flag));
		if (this.DOM?.select) this.DOM.select.toggleAttribute('disabled', this.toBoolean(flag));
	}

	/**
	 * @summary `getter | setter`
	 * <strong>true | false</strong>
	 * Tells us, if the dropdown list is open or closed and toggles the arrow button on the right side.
	 * Toggles the <strong>open</strong> attribute in HTML.
	 * @memberof ComboBox
	 * @member {Boolean} isDropped
	 */
	get isDropped() { return this.#dropped; }
	set isDropped(flag) {
		this.#dropped = this.toBoolean(flag);
		this.toggleAttribute('open', this.#dropped);
		this.#updateAriaExpanded();
	}

	/**
	 * @summary `getter | setter`
	 * Returns or determines the count of displayed list items in the dropdown list.
	 * Default value is 6.
	 * @memberof ComboBox
	 * @member {Number} size
	 */
	get size() { return this.#size; }
	set size(newSize) {
		this.#size = Number(newSize);
		if (!this.hasAttribute('size')) this.setAttribute('size', newSize);
	}

	/**
	 * @summary `getter | setter`
	 * Returns or set's the value of the ComboBox.
	 * @memberof ComboBox
	 * @member {String} value
	 */
	// get value() {
	// 	if (this.isNative) {
	// 		return this.DOM.select ? String(this.DOM.select.value ?? '') : '';
	// 	}
	// 	return this.input ? this.input.value : '';
	// }

    get value() {
        // Bugfix: Fallback nutzen, falls this.DOM noch nicht gesetzt ist (z. B. sehr frühe Attributänderung)
        if (this.isNative) {
            const sel = this.DOM?.select ?? this.shadowRoot?.getElementById('selCombo');
            return sel ? String(sel.value ?? '') : '';
        }
        return this.input ? this.input.value : '';
    }

	set value(newVal) {
		if (!this.hasAttribute('value') && newVal !== '') this.setAttribute('value', newVal);
		const plus = this.getElement('divPlus');
		if (this.isNative) {
			if (this.DOM?.select) this.DOM.select.value = String(newVal ?? '');
		} else {
			if (this.input) this.input.value = newVal ?? '';
			if (this.extendable && newVal !== '') {
				if (!this.#options || !this.#options.includes(newVal)) {
					if (plus) this.showIcon('plus');
				}
			}
		}
		this.#internals?.setFormValue(this.value, this.value);
	}

	/**
	 * @summary `getter | setter`
	 * Returns or sets the name attribute of the element.
	 * @memberof ComboBox
	 * @member {String} name
	 */
	get name() { return this.input ? this.input.name : (this.DOM?.select?.name ?? ''); }
	set name(newName) {
		if (!this.hasAttribute('name')) this.setAttribute('name', newName);
		if (this.input) this.input.name = newName;
		if (this.DOM?.select) this.DOM.select.name = newName;
	}

	/**
	 * @summary `getter | setter`
	 * Supplies the placeholder attribute to the internal input field.
	 * @memberof ComboBox
	 * @member {String} placeholder
	 */
	get placeholder() { return this.hasAttribute('placeholder') ? this.getAttribute('placeholder') : ''; }
	set placeholder(newVal) {
		if (this.input) this.input.placeholder = newVal ?? '';
		// Native <select> hat kein echtes placeholder-Konzept; bewusst unverändert (Feature später)
		if (!this.hasAttribute('placeholder')) this.setAttribute('placeholder', newVal ?? '');
	}

	/**
	 * Returns a reference to the component's list element.
	 * @readonly
	 * @ignore
	 */
	get list() { return this.getElement('lstCombo'); }

	/**
	 * Returns the current selected list item.
	 * @readonly
	 * @ignore
	 */
	get selectedItem() { return this.shadowRoot.querySelector('li[selected]'); }

	/**
	 * Returns a reference to the component's input element.
	 * @readonly
	 * @ignore
	 */
	get input() { return this.getElement('inpCombo'); }

	/**
	 * Hybrid mode getter/setter
	 */
	get mode() { return this.#mode; }
	set mode(val) {
		const v = (val ?? 'auto').toLowerCase();
		if (!['auto','custom','native'].includes(v)) return;
		this.#mode = v;
		this.setAttribute('mode', v);
		this.#applyMode();
	}

	/**
	 * True if native SELECT should be used
	 * @readonly
	 */
	get isNative() {
		if (this.#mode === 'native') return true;
		if (this.#mode === 'custom') return false;
		// auto: iOS Detection (conservative)
		const ua = navigator.userAgent || '';
		const isIOS = /iPad|iPhone|iPod/.test(ua);
		return isIOS; // auf iOS -> native Select
	}

	/**
	 * @summary `getter`
	 * Returns a list of all attributes to be observed.
	 * Any attribute contained in this list will trigger the attributeChangedCallback method.
	 * @see {@link # attributeChangedCallback}
	 * @memberof ComboBox
	 * @member {Array.<String>} observedAttributes
	 * @readonly
	 */
	static get observedAttributes() {
		return ['options','type','size','value','name','extendable','sorted','placeholder','disabled','mode'];
	}

	/**
	 * Connects the control with HTML forms so that it's value will be submitted.
	 * @readonly
	 * @ignore
	 */
	static formAssociated = true;

	/**
	 * @classdesc
	 * Creates a new HTML element that unites the features of the input, select- and the datalist-element.
	 * The control provides a few additional features:
	 * - assigning the list as string or string array
	 * - adding new entries to the list if property 'extendable' is set to 'true'
	 * - setting the length of the displayed dropdown list
	 * - displaying the list sorted or unsorted
	 * @version 1.3.0 (hybrid)
	 * @constructor ComboBox
	 * @example
	 * <COMBO-BOX extendable
	 *            size="8"
	 *            options="United States, Germany, United Kingdom"
	 *            placeholder="-- select a country --">
	 * </COMBO-BOX>// creates a new ComboBox element with these attributes:
	 *
	 * // - extendable  - new items can be added to the list
	 * // - size = "8"  - if expanded, the list displays max. 8 items without scrollbar
	 * // - options     - this is the list to be displayed when dropped
	 * // - placeholder - shows a placeholder, when the INPUT field is empty
	 *
	 * @example
	 * const combo = new ComboBox();
	 * combo.options = ['Germany','United Kingdom','Panama','Netherlands','Portugal','Italy'];
	 * combo.size = 8; // display 8 list items max. (default = 6)
	 * combo.addListItem('Mexico'); // add a new item to the list
	 * combo.removeListItem(2); // removes the second item (='Panama') from list
	 * combo.value = 'Egypt'; // set the value of the ComboBox. If not in list it can be added!
	 */
	constructor() {
		super();
		this.attachShadow({mode: 'open', delegatesFocus: true});
		this.#createChildren();
        // Bugfix: DOM schon im Konstruktor cachen, damit attributeChangedCallback sicher auf this.DOM zugreifen kann
        this.#cacheDOM();
		this.onArrowClick = this.onArrowClick.bind(this);
		this.onInput = this.onInput.bind(this);
		this.onKeydown = this.onKeydown.bind(this);
		this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
		this.addListItem = this.addListItem.bind(this);
		this.removeListItem = this.removeListItem.bind(this);
		this.onSelectChange = this.onSelectChange.bind(this);
        // Bugfix: Event-Delegation – zentrale Handler an UL binden (statt pro LI)
        // (Nur Binding hier; Listener werden in connectedCallback registriert.)
        this.onListClick = this.onListClick.bind(this);
        this.onListPointerMove = this.onListPointerMove.bind(this);
		this.#internals = this.attachInternals();
	}

	/**
	 * Method is automatically called when the component is connected to the DOM.
	 * Right moment to add event listeners and updating HTML attributes.
	 * @ignore
	 */
	connectedCallback() {
		this.#updateProperties();
		if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', 0);

		this.mode = this.getAttribute('mode') || 'auto'; // triggers #applyMode

		const arrow = this.getElement('divArrow'),
			plus = this.getElement('divPlus'),
			size = `${this.input.clientHeight || this.clientHeight || 24}px`;
		this.setAttributes(plus, {height: size, width: size});
		this.setAttributes(arrow, {height: size, width: size});

		plus.addEventListener('pointerdown', this.addListItem);
		this.input.addEventListener('input', this.onInput);
		this.input.addEventListener('keydown', this.onKeydown);
		arrow.addEventListener('click', this.onArrowClick);

		document.addEventListener('pointerdown', this.onDocumentPointerDown, true);

		if (this.DOM.select) {
			this.DOM.select.addEventListener('change', this.onSelectChange);
		}
        this.list.addEventListener('click', this.onListClick);
        this.list.addEventListener('pointermove', this.onListPointerMove);
		this.#applyAriaBasics();
	}

	/**
	 * Method to clean up the event listeners and other stuff
	 * when the component is removed from DOM.
	 * @ignore
	 */
	disconnectedCallback() {
		const arrow = this.getElement('divArrow'),
			  plus = this.getElement('divPlus');
		plus.removeEventListener('pointerdown', this.addListItem);
		this.input.removeEventListener('input', this.onInput);
		this.input.removeEventListener('keydown', this.onKeydown);
		arrow.removeEventListener('click', this.onArrowClick);
		document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
		if (this.DOM.select) {
			this.DOM.select.removeEventListener('change', this.onSelectChange);
		}
        this.list.removeEventListener('click', this.onListClick);
        this.list.removeEventListener('pointermove', this.onListPointerMove);
	}

	/**
	 * @description This method is called when an attribute has been changed, is new assigned
	 * or right after the component is connected to the DOM.
	 * The attribute must be listed in the observedAttributes property.
	 * If the attribute's value has not been changed, the method has no effect.
	 * @example
	 * <COMBO-BOX name="surname"></COMBO-BOX> // setting the 'name' attribute to an element would trigger this method.
	 * @param {string} attrName name of the changed attribute.
	 * @param {any} oldVal old value of the attribute.
	 * @param {any} newVal new value of the attribute.
	 * @see #{@link observedAttributes}
	 */
	attributeChangedCallback(attrName, oldVal, newVal) {
		if (oldVal === newVal) return; // leave immediately if there are no changes!
		if (attrName == 'options') this.options = newVal;
		if (attrName == 'type') this.type = newVal;
		if (attrName == 'size') this.size = newVal;
		if (attrName == 'name') this.name = newVal;
		if (attrName == 'value') this.value = newVal;
		if (attrName == 'placeholder') this.placeholder = newVal;
		if (attrName == 'extendable') this.extendable = this.hasAttribute('extendable');
		if (attrName == 'sorted') this.sorted = this.hasAttribute('sorted');
		if (attrName == 'disabled') this.disabled = this.hasAttribute('disabled');
		if (attrName == 'mode') this.mode = newVal;
	}

	/**
	 * Method is called when the control is connected to a form element.
	 * Here can be applied some settings between the control an the form it's in.
	 * @param {HTMLElement} form The parent form of the control.
	 * @ignore
	 */
	formAssociatedCallback(form) {
		// console.log(form, new FormData(form))
		// for advanced purposes...
	}

	/**
	 * Adds a new entry to the list if the <strong>extendable</strong> attribute is set to <strong>true</strong>.
	 * If the list is expanded it will be collapsed after adding it.
	 * @param {Event | String | Number} item item to be added to the dropdown list.
	 * @see {@link extendable}
	 */
	addListItem(item) {
		let added = false;
		if (this.extendable && !this.isNative) {
			if (item instanceof PointerEvent || item == undefined) item = this.value;
			if (typeof item !== 'string') item = String(item ?? '');
			if (!item) return;
			if (this.#options == null) {
				this.#options = new Array(item);
				added = true;
			} else if (!this.#options.includes(item)) {
				this.#options.push(item);
				added = true;
			}
			this.showIcon('arrow');
		}
		if (added) this.#raiseEvent('addItem', item);
		if (added && this.DOM?.select) this.#syncSelectOptions();
		this.collapse();
	}

	/**
	 * Removes an existing list item from the options.
	 * @param {Event | String | Number} item list item to be removed.
	 */
	removeListItem(item) {
		let removeValue;
		if (item instanceof Event) {
			// Bugfix: Entfernen nach WERT, nicht nach (sortiertem) Index.
			// Früher: dataset.index -> #options[index], falsch bei sorted-Ansicht.
			removeValue = item.currentTarget?.dataset?.value || item.currentTarget?.closest('li')?.dataset?.value;
		} else if (typeof item === 'string') {
			removeValue = item;
		} else if (typeof item === 'number') {
			if (this.#options && item < this.#options.length) {
				removeValue = this.#options[item];
			}
		}
		if (!removeValue || !this.#options) return;

		const idx = this.#options.indexOf(removeValue);
		if (idx > -1) {
			this.#options.splice(idx, 1);
			this.#raiseEvent('removeItem', removeValue);
		}

		if (this.isDropped) this.expand();
		if (this.#options.length == 0) {
			this.value = '';
			this.showIcon(false);
		}
		if (this.DOM?.select) this.#syncSelectOptions();
	}

	/**
	 * Toggles the dropdown list.
	 * @ignore
	 */
	onArrowClick(evt) {
		if (this.disabled || this.isNative) return;
		evt.stopPropagation();
		if (this.isDropped) {
			this.collapse();
		} else {
			this.expand();
			this.input.setSelectionRange(0,0);
			this.#highlightSelectedItem(this.input.value);
		}
	}

	/**
	 * Takes over the active list-item in the input field.
	 * @ignore
	 */
	onItemClick(evt) {
		if (evt.target.nodeName === 'LI') {
			this.input.value = evt.target.innerText;
			this.#internals.setFormValue(this.value, this.value);
			this.#raiseEvent('select', this.value);
			this.collapse();
			this.input.blur();
		}
	}

	/**
	 * Provides keyboard support for the control:
	 * - ENTER-key takes over a new entry if the 'extendable' attribute is set.
	 * - If the dropdown list is displayed and an item is selected, ENTER takes over the item.
	 * - ARROW_UP | ARROW_DOWN applies scolling inside the list.
	 * - ESCAPE closes the open dropdown list.
	 * @param {event} evt Keydown event of the input element.
	 * @ignore
	 */
	onKeydown(evt) {
		if (this.disabled || this.isNative) return;
		const key = evt.key;
		if (this.isDropped) {
			if (key === 'Escape' || key === 'Delete') this.collapse();
			if (key.includes('Arrow')) {
				evt.preventDefault();
				this.#scroll(key);
			}
			if (key === 'Enter' && this.selectedItem) {
				this.input.value = this.selectedItem.innerText;
				this.collapse();
				this.#internals.setFormValue(this.value, this.value);
			}
		} else {
			if (key === 'Enter') this.addListItem();
			if (key === 'ArrowDown') {
				this.expand();
				this.#highlightSelectedItem(this.input.value);
			}
		}
		if (key === 'Delete') {
			this.input.value = '';
			this.showIcon('arrow');
		}
	}

	/**
	 * Filters, creates and displays the items of the list matching to the input.
	 * @param {event} evt The input event of the input element.
	 * @ignore
	 */
	onInput(evt) {
		if (this.disabled || this.isNative) {
			evt.preventDefault?.();
			if (this.isNative) return;
			this.input.value = '';
			return;
		}
		const searchFor = evt.target.value.toLowerCase(),
			arrMatches = [];
		this.collapse();
		this.showIcon(false);
		if (searchFor.length == 0) {
			if (this.options?.length > 0) this.showIcon('arrow');
			return;
		}
		if (!this.options) {
			if (this.extendable) this.showIcon('plus');
			return;
		}
		for (let i = 0; i < this.options.length; i++) {
			const item = this.options[i];
			if (item.substring(0, searchFor.length).toLowerCase() === searchFor) {
				arrMatches.push(item);
			}
		}
		this.#internals.setFormValue(this.value, this.value);
		if (arrMatches.length == 0) {
			if (this.extendable) {
				this.showIcon('plus');
			} else if (this.options) {
				this.showIcon('arrow');
			}
			this.#listindex = -1;
			return;
		}
		const icon = (arrMatches.length > 0) ? 'arrow' : false;
		this.showIcon(icon);
		this.expand(arrMatches);
	}

	/**
	 * Displays the selected item and synchronisizes the list-index.
	 * @ignore
	 */
	onMouseHover(evt) {
		if (evt.target.nodeName !== 'LI') return; // ignore the cross!
		if (this.selectedItem) this.selectedItem.removeAttribute('selected');
		evt.target.setAttribute('selected','');
		const list = this.shadowRoot.querySelectorAll('li.jom-list-item');
		this.#listindex = -1;
		do {
			this.#listindex++;
		} while (!list[this.#listindex].hasAttribute('selected'));
	}

    /**
     * Delegated click handling on the dropdown <ul>.
     * - Clicking .combo-delete removes the corresponding value.
     * - Clicking a <li> selects its value.
     *
     * Bugfix: Event-Delegation – ein Listener statt vieler pro <li>.
     */
    onListClick(evt) {
        // Ignore if the dropdown isn't open or we are in native mode
        if (!this.isDropped || this.isNative) return;

        const pathTarget = evt.target;
        if (!pathTarget) return;

        // 1) Delete-button inside an item?
        const deleteBtn = pathTarget.closest?.('.combo-delete');
        if (deleteBtn) {
            // Bugfix: Löschen nach WERT (stabil auch bei sorted)
            const val = deleteBtn.dataset.value || deleteBtn.closest('li')?.dataset?.value;
            if (val) this.removeListItem(val);
            evt.stopPropagation();
            return;
        }

        // 2) Click on a list item itself?
        const li = pathTarget.closest?.('li.jom-list-item');
        if (li && this.list.contains(li)) {
            this.input.value = li.innerText;
            this.#internals.setFormValue(this.value, this.value);
            this.#raiseEvent('select', this.value);
            this.collapse();
            this.input.blur();
        }
    }

    /**
     * Delegated pointer move/hover to track the "selected" item and index.
     * Keeps behavior consistent with previous per-<li> pointermove.
     *
     * Bugfix: Event-Delegation – reduziert Listener-Overhead bei langen Listen.
     */
    onListPointerMove(evt) {
        // Only when open, custom mode, and mouse-like pointer (avoid touch noise)
        if (!this.isDropped || this.isNative) return;
        if (evt.pointerType && evt.pointerType !== 'mouse') return;

        const pathTarget = evt.target;
        if (!pathTarget) return;

        const li = pathTarget.closest?.('li.jom-list-item');
        if (!li || !this.list.contains(li)) return;

        // Mirror previous onMouseHover() behavior
        // if (this.selectedItem) this.selectedItem.removeAttribute('selected');
        // li.setAttribute('selected', '');
        const prev = this.selectedItem;
        if (prev) {
            // Bugfix: ARIA – bisherigen Eintrag als nicht ausgewählt markieren
            prev.removeAttribute('selected');
            prev.setAttribute('aria-selected', 'false');
        }

        // Bugfix: ARIA – aktuellen Eintrag als ausgewählt markieren
        li.setAttribute('selected', '');
        li.setAttribute('aria-selected', 'true');

        // Update index based on current list
        const list = this.shadowRoot.querySelectorAll('li.jom-list-item');
        this.#listindex = -1;
        for (let i = 0; i < list.length; i++) {
            if (list[i].hasAttribute('selected')) {
                this.#listindex = i;
                break;
            }
        }
    }


	/**
	 * Enables or disables either the dropdown arrow or the plus symbol.
	 * @param {String | Boolean} type The icon to be displayed or disabled.
	 * - 'arrow'         - the dropdown icon is displayed
	 * - 'plus'          - displays the plus icon to indicate that an item can be added to the list
	 * - 'none' | false  - disables all icons (i.e. when the list is empty)
	 */
	showIcon(type) {
		const arrow = this.getElement('divArrow'),
			plus = this.getElement('divPlus');
		if (!(arrow && plus)) return;
		if (type === 'arrow' && !this.isNative) {
			arrow.removeAttribute('hidden');
			plus.setAttribute('hidden','');
		} else if (type === 'plus' && !this.isNative) {
			plus.removeAttribute('hidden');
			arrow.setAttribute('hidden','');
		} else if (type === false || type === 'none' || this.isNative) {
			arrow.setAttribute('hidden','');
			plus.setAttribute('hidden','');
		}
	}

	/**
	 * Shows the dropdown list.
	 * The method is called either by click on the arrow button or by making an input into the <code>INPUT</code> field.
	 * @param {String | String.<Array>} [options] String array of options to be displayed in the dropdown list.
	 * If omitted, the current assigned item list is going to be displayed.
	 */
	expand(options = this.#options) {
		if (this.isNative) return; // in native mode kein UL/LI
		this.isDropped = false; // prevents the 'collapse' event!
		this.collapse();
		const items = (!options || options.length === 0) ? [] : (this.sorted ? [...options].sort() : options);
		this.isDropped = (items.length > 0);

		let firstItemHeight = 0;
		this.list.classList.toggle('has-items', items.length > 0);

		for (let i = 0; i < items.length; i++) {
			const item = document.createElement('li');
			let cross;
			if (this.extendable && this.type === 'combo') {
				cross = document.createElement('div');
				cross.append(TMP_CLOSE.content.cloneNode(true));
				// Bugfix: statt Index den WERT speichern, damit sorted-Ansicht korrekt löscht
				this.setAttributes(cross, {"data-value": items[i], class: "combo-delete"});
			}
			item.className = 'jom-list-item';
			item.innerText = items[i];
			item.dataset.value = items[i]; // Bugfix: Wert auf LI mitschreiben (Löschen per Wert)
            // Bugfix: ARIA – Rolle & Anfangszustand für Listeneinträge
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');
			if (cross) item.appendChild(cross);
			this.list.appendChild(item);
			if (i === 0) firstItemHeight = item.clientHeight || 0;
			if (i >= this.size - 1 && !this.list.classList.contains('scroll')) {
				const height = (firstItemHeight || item.clientHeight) * this.size + 1;
				this.list.classList.add('scroll');
				this.setAttributes(this.list, {style: `max-height: ${height}px;`});
			}
		}

        // Bugfix: rAF-Animation beim Öffnen
        // Zielhöhe bestimmen: bei .scroll nutzen wir die gesetzte max-height, sonst die volle Listenhöhe
        const targetHeight = this.list.classList.contains('scroll')
            ? (parseInt(this.list.style.maxHeight, 10) || this.list.scrollHeight)
            : this.list.scrollHeight;

        // Animation starten (nur im Custom-Mode)
        if (!this.isNative) {
            this.#animateOpen(targetHeight);
        }

		if (this.isDropped) this.#raiseEvent('expand');
	}

    /**
     * Closes the dropdown list and set's the flag <strong>isDropped</strong> to false.
     */
    collapse() {
        // Bugfix: Native-Modus und „nicht offen“ sofort ohne Animation bereinigen
        if (this.isNative || !this.isDropped || !this.list) {
            this.list.innerHTML = '';
            this.list.classList.remove('scroll','has-items');
            if (this.isDropped) this.#raiseEvent('close');
            this.isDropped = false;
            return;
        }

        // Bugfix: Bei laufender Animation sofort hart schließen (kein Doppelstart)
        if (this.#animating) {
            this.list.innerHTML = '';
            this.list.classList.remove('scroll','has-items');
            if (this.isDropped) this.#raiseEvent('close');
            this.isDropped = false;
            return;
        }

        // Bugfix: Sanft schließen per rAF; Event-Reihenfolge wie zuvor beibehalten
        this.#animateClose(() => {
            this.list.innerHTML = '';
            this.list.classList.remove('scroll','has-items');
            if (this.isDropped) this.#raiseEvent('close');
            this.isDropped = false;
        });
    }


	/**
	 * Imports a CSS stylesheet with the specific attribute: "data-control".
	 * Since the parameter can be changed, any other flag can be used as marker
	 * for the component to recognize the wanted stylesheet.
	 * @param {string} selector An attribute given in the stylesheet link
	 * to recognize it for this component.
	 * @ignore
	 * @deprecated
	 */
	importStyleSheet(selector = 'link[data-control]') {
		const link = document.querySelector(selector);
		if (link) this.shadowRoot.innerHTML += link.outerHTML;
	}

	/**
	 * Raises an event of the component.
	 * @param {String} type the type of the raised event.
	 */
    #raiseEvent(type, item) {
        // Bugfix: Parität zwischen Custom- und Native-Mode für 'selectedItem'.
        // - Bei 'addItem' / 'removeItem' bleibt selectedItem absichtlich NULL (wie bisher im Custom-Mode).
        // - Bei 'select' ermitteln wir im Native-Mode das sichtbare Label der Option.
        let selectedDisplay = null;
        if (type !== 'addItem' && type !== 'removeItem') {
            if (this.isNative) {
                const opt = this.DOM?.select?.selectedOptions?.[0];
                selectedDisplay = opt ? opt.textContent : null; // Label (wie innerText im LI)
            } else {
                selectedDisplay = this.selectedItem?.innerText || null;
            }
        }

        this.dispatchEvent(new CustomEvent(type, {
            detail: {
                item: item,
                name: this.name,
                dropped: this.isDropped || type === 'collapse',
                listItems: this.options,
                selectedItem: selectedDisplay,   // <- hier konsistent setzen
                value: this.value
            },
            cancelable: true,
            bubbles: true
        }));
    }


	/**
	 * Private method.
	 * Highlightes the current selected item after expanding the dropdown list.
	 */
	#highlightSelectedItem(item) {
		if (item == '') return;
		const list = this.shadowRoot.querySelectorAll('li.jom-list-item');
		this.#listindex = this.#options ? this.#options.indexOf(item) : -1;
		if (this.sorted && this.#options && this.#listindex > -1) {
			// Bugfix: Bei sorted muss der Index im sortierten Array gesucht werden
			const sorted = [...this.#options].sort();
			this.#listindex = sorted.indexOf(item);
		}
		if (this.#listindex > -1 && list[this.#listindex]) {
            const el = list[this.#listindex];
            // Bugfix: ARIA – vorherige Auswahl zurücksetzen
            if (this.selectedItem) {
                this.selectedItem.removeAttribute('selected');
                this.selectedItem.setAttribute('aria-selected', 'false');
            }
            // Bugfix: Kein scrollIntoView (…)
            this.#scrollItemIntoView(el);
            // Bugfix: ARIA – aktuelle Auswahl markieren
            el.setAttribute('selected','');
            el.setAttribute('aria-selected', 'true');
        }
	}

	/**
	 * Creates the component's child elements:
	 * - div (wrapper)
	 * - input element
	 * - ul element (droplist)
	 * - drop arrow (svg-image)
	 * - plus sign (svg-image)
	 * - select element (native mode)
	 */
	#createChildren() {
		const wrapper = document.createElement('div'),
			input = document.createElement('input'),
			list = document.createElement('ul'),
			select = document.createElement('select');

		this.setAttributes(wrapper, {id: 'divCombo', class: 'jom-combo'});
		this.setAttributes(input, {type: 'text', id: 'inpCombo', class: 'jom-input', autocomplete: 'off'});
		this.setAttributes(list, {id: 'lstCombo', class: 'cbo-list'});
		this.setAttributes(select, {id: 'selCombo', class: 'jom-select'});

		wrapper.append(input, list,
			TMP_PLUSSIGN.content.cloneNode(true),
			TMP_ARROW.content.cloneNode(true));

		this.shadowRoot.append(wrapper, select, TMP_COMBOSTYLE.content.cloneNode(true));
	}

	/**
	 * Scrolls the list up or down.
	 * @param {string} key Arrowdown | ArrowUp
	 */
	#scroll(key) {
		const listItems = this.shadowRoot.querySelectorAll('li.jom-list-item'),
			list = this.list;
		if (!listItems.length) return;

		const step = (key === 'ArrowDown') ? 1 : -1;
		const maxIndex = listItems.length - 1;

		this.#listindex = Math.min(Math.max(this.#listindex + step, 0), maxIndex);

		// if (this.selectedItem) this.selectedItem.removeAttribute('selected');
		// const item = listItems[this.#listindex];
		// item.setAttribute('selected','');

        const prev = this.selectedItem;
        if (prev) {
            // Bugfix: ARIA – bisherigen Eintrag als nicht ausgewählt markieren
            prev.removeAttribute('selected');
            prev.setAttribute('aria-selected', 'false');
        }

        // Bugfix: ARIA – aktuellen Eintrag als ausgewählt markieren
        const item = listItems[this.#listindex];
        item.setAttribute('selected', '');
        item.setAttribute('aria-selected', 'true');

		// Bugfix: Kein scrollIntoView -> manuelles Scrollen innerhalb der UL
		const itemTop = item.offsetTop;
		const itemBottom = itemTop + item.offsetHeight;
		if (itemTop < list.scrollTop) {
			list.scrollTop = itemTop;
		} else if (itemBottom > list.scrollTop + list.clientHeight) {
			list.scrollTop = itemBottom - list.clientHeight;
		}
		// TODO maybe here is the reason for scrolling up the whole page on long lists (Original-Kommentar belassen)
	}

	/**
	 * Updates all HTML-given attributes after connectedCallback!
	 */
	#updateProperties() {
		Object.values(this.properties).forEach((prop) => {
			if (ComboBox.prototype.hasOwnProperty(prop)) {
				let value = this[prop];
				delete this[prop];
				this[prop] = value;
			}
		});
	}

	/**
	 * Helper function to set one ore more attributes to a single element.
	 * @param {HTMLElement} element Element the attributes to be set on.
	 * @param {object} attributes Object of attributes and values: {id: 'divID', class: 'active'} etc.
	 * @ignore
	 */
	setAttributes(element, attributes) {
		Object.keys(attributes).forEach(attr => {
			element.setAttribute(attr, attributes[attr]);
		});
	}

	/**
	 * Helper function to find a shadow root element.
	 * @param {String} id The id of the wanted child element from shadow root.
	 * @returns {HTMLElement | null} returns the shadow root element with the given id or 'null' if not found.
	 * @ignore
	 */
	getElement(id) {
		return this.shadowRoot.getElementById(id);
	}

	/**
	 * Helper function.
	 * Converts some specific epressions to Boolean.
	 * @param {any} expression The expression to be checked for true or false
	 * @returns true | false
	 * @ignore
	 */
	toBoolean(expression) {
		if (expression === false || expression === true) return expression;
		if (typeof expression === 'string') {
			expression = expression.toLowerCase().trim();
			switch(expression) {
				case 'true':
				case 'yes':
				case 'on':
				case '1':
					return true;
				default:
					return false;
			}
		} else {
			return Boolean(expression);
		}
	}

	/* =======================
	 * Hybrid / Native helpers
	 * ======================= */

	#applyMode() {
		this.setAttribute('mode', this.isNative ? 'native' : (this.#mode === 'auto' ? 'custom' : this.#mode));
		// Input disabled state in list-mode synchronisieren
		if (this.input) this.input.toggleAttribute('disabled', (this.type === 'list') || this.disabled || this.isNative);
		// Name in beide stecken
		if (this.DOM?.select && this.name) this.DOM.select.name = this.name;
		// Options zu SELECT spiegeln
		if (this.DOM?.select) this.#syncSelectOptions();
	}

	#syncSelectOptions() {
		if (!this.DOM?.select) return;
		const sel = this.DOM.select;
		sel.innerHTML = '';
		if (Array.isArray(this.#options)) {
			for (const v of (this.sorted ? [...this.#options].sort() : this.#options)) {
				const opt = document.createElement('option');
				opt.value = v;
				opt.textContent = v;
				sel.appendChild(opt);
			}
		}
		if (this.value != null) {
			sel.value = String(this.value ?? '');
		}
	}

	onSelectChange() {
		// Native change → FormValue setzen, Event spiegeln
		this.#internals.setFormValue(this.value, this.value);
		this.#raiseEvent('select', this.value);
	}

	#cacheDOM() {
		// Bugfix/Refactoring: Gecachte DOM-Referenzen im Objekt this.DOM (wie gewünscht)
		this.DOM = {
			wrapper: this.getElement('divCombo'),
			inputField: this.getElement('inpCombo'),
			list: this.getElement('lstCombo'),
			divArrow: this.getElement('divArrow'),
			divPlus: this.getElement('divPlus'),
			select: this.getElement('selCombo')
		};
	}

	#applyAriaBasics() {
		// Minimal, nicht invasiv (weitere A11y später)
		if (this.input) {
			this.input.setAttribute('role', 'combobox');
			this.input.setAttribute('aria-autocomplete', 'list');
			this.#updateAriaExpanded();
			this.input.setAttribute('aria-controls', 'lstCombo');
		}
		if (this.list) {
			this.list.setAttribute('role', 'listbox');
		}
	}

	#updateAriaExpanded() {
		if (this.input) {
			this.input.setAttribute('aria-expanded', this.isDropped ? 'true' : 'false');
		}
	}

	onDocumentPointerDown(evt) {
		// Klick außerhalb der Komponente schließt Dropdown
		if (!this.isDropped || this.isNative) return;
		const path = evt.composedPath();
		if (!path.includes(this)) {
			this.collapse();
		}
	}

	#scrollItemIntoView(itemEl) {
		const list = this.list;
		if (!itemEl || !list) return;
		const itemTop = itemEl.offsetTop;
		const itemBottom = itemTop + itemEl.offsetHeight;
		if (itemTop < list.scrollTop) {
			list.scrollTop = itemTop;
		} else if (itemBottom > list.scrollTop + list.clientHeight) {
			list.scrollTop = itemBottom - list.clientHeight;
		}
	}


    /**
     * Smoothly animate opening the dropdown list from 0 to target height.
     * Bugfix: rAF-Animation für sanftes Öffnen.
     * @param {number} targetHeight Target height in pixels.
     */
    #animateOpen(targetHeight) {
        const ul = this.list;
        if (!ul) return;

        this.#animating = true;
        ul.classList.add('animating');

        // Startzustand
        ul.style.maxHeight = '0px';
        // Reflow erzwingen, damit die Transition sauber startet
        void ul.offsetHeight;

        // Nächster Frame -> Zielhöhe setzen
        requestAnimationFrame(() => {
            ul.style.maxHeight = `${Math.max(0, targetHeight)}px`;
            const onEnd = (e) => {
                if (e && e.propertyName !== 'max-height') return;
                ul.removeEventListener('transitionend', onEnd);
                ul.classList.remove('animating');
                this.#animating = false;
            };
            ul.addEventListener('transitionend', onEnd, { once: true });
        });
    }

    /**
     * Smoothly animate collapsing the dropdown list to height 0, then cleanup.
     * Bugfix: rAF-Animation für sanftes Schließen.
     * @param {() => void} cleanup Called after the closing animation ends.
     */
    #animateClose(cleanup) {
        const ul = this.list;
        if (!ul) { cleanup?.(); return; }

        this.#animating = true;
        ul.classList.add('animating');

        // Ausgangshöhe fixieren (aktueller Zustand)
        const current = ul.getBoundingClientRect().height || ul.scrollHeight;
        ul.style.maxHeight = `${Math.max(0, current)}px`;
        void ul.offsetHeight; // Reflow

        requestAnimationFrame(() => {
            ul.style.maxHeight = '0px';
            const onEnd = (e) => {
                if (e && e.propertyName !== 'max-height') return;
                ul.removeEventListener('transitionend', onEnd);
                ul.classList.remove('animating');
                this.#animating = false;
                cleanup?.();
            };
            ul.addEventListener('transitionend', onEnd, { once: true });
        });
    }
}

// function mixinClass(targetCtor, sourceCtor) {
//     // Prototyp-Methoden (foo, get bar, set baz, Symbols, nicht-enumerable)
//     for (const key of Reflect.ownKeys(sourceCtor.prototype)) {
//         if (key === 'constructor') continue;
//         const desc = Object.getOwnPropertyDescriptor(sourceCtor.prototype, key);
//         Object.defineProperty(targetCtor.prototype, key, desc);
//     }
//     // Optional: statische Member mitnehmen (ohne Standard-Keys)
//     for (const key of Reflect.ownKeys(sourceCtor)) {
//         if (key === 'name' || key === 'length' || key === 'prototype') continue;
//         const desc = Object.getOwnPropertyDescriptor(sourceCtor, key);
//         Object.defineProperty(targetCtor, key, desc);
//     }
// }


// NOTE This order is mandatory !!!
Object.assign(ComboBox.prototype, Library.prototype); // inject (mixin) Library methods to the ComboBox-element!
// mixinClass(ComboBox, Library);
customElements.define('combo-box', ComboBox);

/**
 * @summary `Events, raised by the ComboBox class`
 * It can be one of the following events:
 * - {@link addItem}
 * - {@link removeItem}
 * - {@link select}
 * - {@link dropDown}
 * - {@link close}
 *
 * @typedef {Object} ComboBoxEvent
 * @property {String} type the name of the event
 * @property {String} item the item to be added or removed
 * @property {String} name the name of the element
 * @property {Boolean} dropped indicates whether the list is dropped or not
 * @property {String.<Array>} items the whole list of items
 */

/**
 * The event raises always when an item has been selected.
 * @event select
 * @type {ComboBoxEvent}
 */

/**
 * The event raises always when a new item has been added to the list.
 * @event addItem
 * @type {ComboBoxEvent}
 */

/**
 * The event raises always when a new item has been removed from the list.
 * @event removeItem
 * @type {ComboBoxEvent}
 */

/**
 * The event raises when the dropdown list has been opened.
 * @event dropDown
 * @type {ComboBoxEvent}
 */

/**
 * The event raises when the dropdown list has been closed.
 * @event close
 * @type {ComboBoxEvent}
 */