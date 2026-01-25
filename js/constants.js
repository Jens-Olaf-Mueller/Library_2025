/**
 * Central style and markup definition for all UI components.
 * Each top-level key corresponds to a component class name (lowercase).
 * Every subkey represents one DOM element belonging to that component.
 *
 * Conventions for attributes:
 *  - id not present        → ID is either going to be created from key "prefix" or the first three chars from HTML tag
 *  - id = null             → no ID at all!!!
 *  - class = ''            → derive class from element id (converted to kebab-case)
 *  - style                 → keys use camelCase, values are strings (CSS values)
 *
 * Special keys:
 *  - root:                 → defines the root element of the component
 *  - protected:            → defines that the style of the element is inline set (top most specifity)
 *  - events:               → { eventname: 'handlerFunction }
 *  - children:             → { object of child elements }
 *  - loop:                 → { object of similar child elements }
 *  - elements:             → [ String array representing each elements' properties (caption, value, classlist etc.)]
 *  - splitter:             → inside a loop used to determine element properties.
 *                            a numeric value for a key represents the index of the array
 *                            created by the splitter
 */
export const OBJ_COMPONENTS = {
    calendar: {
        children: [{
                element: 'CalendarPod',
                tag: 'div',
                class: '',          // empty string is assembled from element. becomes → 'calendar-pod'
                style: {
                    display: 'grid',
                    gridTemplateRows: 'auto auto 1fr auto',
                    position: 'relative',
                    width: '98%',
                    maxWidth: '28rem',
                    userSelect: 'none'
                },
                root: true,         // Root container of the calendar! Will be stored in: Library.rootElement
                protected: true,    // protected means that the element is going to be inline styled
                children: [
                    // ▼ Drop button (always visible, top-right)
                    {
                        element: 'CalendarDrop',
                        tag: 'button',
                        prefix: 'btn',
                        class: '',
                        type: 'button',
                        'aria-label': 'Kalender auf/zu',
                        'aria-expanded': 'false',
                        style: {
                            position: 'absolute',
                            top: 'clamp(0.25rem, 0.8vh, 0.6rem)',
                            right: 'clamp(0.25rem, 1vw, 0.6rem)',
                            width: 'var(--cal-calendar-drop-size, 2rem)',
                            aspectRatio: '1 / 1',
                            backgroundColor: 'transparent',
                            color: 'var(--cal-text-color, whitesmoke)',
                            zIndex: 999
                        },
                        protected: true,
                        events: { click: 'toggleOpen' }, // calls this.toggleOpen()
                        innerHTML: `
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="calendar-drop-arrow">
                            <path d="M20 35 l30 30 l30-30z"/>
                        </svg>`
                    },
                    // ▼ Settings icon (always visible, top-left)
                    {
                        element: 'CalendarSettings',
                        tag: 'button',
                        prefix: 'btn',
                        class: 'calendar-settings',
                        type: 'button',
                        style: {
                            position: 'absolute',
                            top: 'clamp(0.25rem, 1vh, 0.6rem)',
                            left: 'clamp(0.25rem, 1vw, 0.6rem)',
                            width: 'var(--cal-button-size, 2rem)',
                            aspectRatio: '1 / 1',
                            backgroundColor: 'transparent',
                            color: 'var(--cal-text-color, whitesmoke)',
                            border: 'none',
                            zIndex: 999
                        },
                        hidden: true,
                        protected: true,
                        events: { click: 'toggleSettings' },
                        innerHTML: `
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" class="calendar-gear" fill="currentcolor">
                            <path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
                        </svg>`
                    },
                    // ▼ Collapsible wrapper
                    {
                        element: 'CalendarCollapsible',
                        tag: 'div',
                        class: 'calendar-collapsible',
                        style: { overflow: 'hidden' },
                        protected: true,
                        children: [
                            {
                                element: 'CalendarTitle', tag: 'div',  class: '', protected: true,
                                style: {
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    fontWeight: 'bold'
                                },
                                children: { element: 'CalendarCaption', tag: 'h2', prefix: 'h2_'}
                            },
                            {
                                element: 'CalendarHead',tag: 'div',  class: '', protected: true,
                                style: {
                                    display: 'grid',
                                    gridColumn: '1 / -1',
                                    alignItems: 'center',
                                    height: 'clamp(2.25rem, 5vw, 3.5rem)',
                                    gridTemplateColumns: 'repeat(8, 1fr)'
                                },
                                events: { click: 'onHeaderClick' },
                                children: [
                                    {
                                        element: 'MonthPicker', tag: 'div',
                                        children: [
                                            {
                                                element: 'PrevMonth', tag:'button', prefix: 'btn',
                                                class: 'calendar-button',
                                                innerHTML: `
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                                                    <path d="M65 20 l-30 30 l30 30z"/>
                                                </svg>`,
                                                value: -1
                                            },
                                            {
                                                element: 'Month', tag: 'h2', prefix: 'h2_'
                                            },
                                            {
                                                element: 'NextMonth', tag:'button', prefix: 'btn',
                                                class: 'calendar-button',
                                                innerHTML: `
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                                                    <path d="M35 20 l30 30 l-30 30z"/>
                                                </svg>`,
                                                value: 1
                                            }
                                        ]
                                    },
                                    {element: 'YearPicker', tag: 'div',
                                        children: [
                                            {
                                                element: 'PrevYear', tag:'button', prefix: 'btn',
                                                class: 'calendar-button',
                                                innerHTML: `
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                                                    <path d="M65 20 l-30 30 l30 30z"/>
                                                </svg>`,
                                                value: -1
                                            },
                                            {
                                                element: 'Year', tag: 'h2', prefix: 'h2_'
                                            },
                                            {
                                                element: 'NextYear', tag:'button', prefix: 'btn',
                                                class: 'calendar-button',
                                                innerHTML: `
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                                                    <path d="M35 20 l30 30 l-30 30z"/>
                                                </svg>`,
                                                value: 1
                                            }
                                        ]
                                    }
                                ]
                            },
                            {
                                element: 'CalendarBody', tag: 'div', class: '', protected: true,
                                style: {
                                    display: 'grid',
                                    gridTemplateRows: 'repeat(7, 1fr)',
                                    gridTemplateColumns: 'repeat(8, 1fr)',
                                    aspectRatio: '8 / 7',
                                },
                                events: { click: 'onBodyClick' }
                            },
                            {
                                element: 'CalendarSettings',
                                tag: 'div',
                                class: '',
                                protected: true,
                                hidden: true,
                                style: {
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
                                    overflow: 'hidden',
                                    padding: '1rem',
                                    backgroundColor: 'var(--cal-footer-color, transparent)'
                                },
                                children: [
                                    {
                                        element: 'Country',
                                        tag: 'div',
                                        class: 'calendar-control',
                                        children: [
                                            {
                                                element: 'Country',
                                                tag: 'label',
                                                prefix: 'lbl',
                                                for: 'selCountry',
                                                text: 'Land'
                                            },
                                            {
                                                element: 'Country',
                                                tag: 'select',
                                                innerHTML: `
                                                <option value="de-DE">🇩🇪 Deutschland</option>
                                                <option value="de-CH">🇨🇭 Schweiz</option>
                                                <option value="de-AT">🇦🇹 Österreich</option>`
                                            }
                                        ],
                                        events: { change: 'updateStates' }
                                    },
                                    {
                                        element: 'State',
                                        tag: 'div',
                                        class: 'calendar-control',
                                        children: [
                                            {
                                                element: 'State',
                                                tag: 'label',
                                                prefix: 'lbl',
                                                for: 'selState',
                                                text: 'Bundesland / Kanton'
                                            },
                                            {
                                                element: 'State',
                                                tag: 'select'
                                            }
                                        ]
                                    },
                                    {
                                        element: 'ShowYearPicker',
                                        tag: 'label',
                                        prefix: 'lbl',
                                        innerHTML: `
                                        <input type="checkBox" id="chkShowYearPicker" name="showyearpicker" checked>
                                        Jahresauswahl anzeigen`
                                    },
                                    {
                                        element: 'StartOpened',
                                        tag: 'label',
                                        prefix: 'lbl',
                                        innerHTML: `
                                        <input type="checkBox" id="chkStartOpened" name="startopened">
                                        Start geöffnet`
                                    }
                                ]
                            },
                        ]
                    },
                    // ▼ Footer remains outside of the collapsibles
                    {
                        element: 'CalendarFooter',
                        tag: 'input',
                        class: '',
                        type: 'text',
                        name: 'currentDate',
                        readonly: true,
                        protected: true,
                        style: {
                            display: 'grid',
                            gridColumn: '1 / -1',
                            height: 'clamp(2.25rem, 5vw, 3.5rem)',
                            gridTemplateColumns: 'none',
                            border: 'none',
                            userSelect: 'none',
                            color: 'var(--cal-text-color, whitesmoke)',
                            textAlign: 'center',
                            backgroundColor: 'var(--cal-header-color, #444a70)',
                            font: 'inherit'
                        }
                    }
                ]
            }
        ],
        css: {
            prefix: 'cal',
            variables: [
                {backgroundColor: '#222'},
                {textColor: 'whitesmoke'},
                {headerColor: '#323234'},
                {footerColor: '#323234'},
                {highlightColor: '#323234'},
                {accentColor: '#5166d6'},
                {sundayColor: 'tomato'},
                {disabledColor: '#777'}, // assemble to: --cal-disabled-color: '#777';
                {calendarDropSize: '2rem'}
            ]
        }
    },
    messagebox: {
        children: [],
        css: {
            prefix: 'msg',
            variables: []
        }
    },
    calculator: {
        children: [{
                element: 'CalculatorPod',
                tag: 'div',
                class: '',
                style: {
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'calc(min(390px, 100%) - 12px)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, var(--calc-button-width, 3.4rem))',
                    justifyContent: 'center',
                    justifyItems: 'center',
                    gridGap: 'var(--calc-grid-gap, 0.9rem)',
                    background: 'linear-gradient(135deg, var(--calc-bg1), var(--calc-bg2))'
                },
                root: true,
                protected: true,
                hidden: '',
                children: [
                    {
                        element: 'Display',
                        tag: 'div',
                        class: '',
                        style: {

                        },
                        protected: true,
                        children: [
                            {
                                element: 'StatusBar',
                                tag: 'div',
                                class: '',
                                children: [
                                    {
                                        element: 'Memory',
                                        tag: 'div',
                                        class: 'flx-start'
                                    },
                                    {
                                        element: 'PrevOperand',
                                        tag: 'div',
                                        class: 'flx-end'
                                    }
                                ]
                            },
                            {
                                element: 'Input',
                                tag: 'div',
                                class: 'flx-end',
                                style: { fontSize: '36px' },
                                text: 0
                            }
                        ]
                    }

                ],
                loop: {
                    id: null,
                    tag: 'button',
                    class: 'calc-btn',
                    splitter: '|',
                    text: 0,
                    classList: 1,
                    events: 2, // optional
                    elements: [
                    'MR|memory', 'MS|memory', 'MC|memory', 'M+|memory', 'M-|memory',
                    'AC|all-clear meta', '(|', ')|', ' mod |operator', '⌫|meta', 'n!|operator',
                    'x²|operator', '√|operator', '±|operator', 'π|operator', '7|', '8|',
                    '9|', '÷|operator', '%|operator', '4|', '5|', '6|', '×|operator',
                    '1/x|operator', '1|', '2|', '3|', '-|operator', '=|equals meta', '0|zero',
                    ',|', '+|operator', '↵|equals buddy meta']
                }
            }
        ],
        css: {
            prefix: 'calc',
            variables: [
                {gridGap: '0.9rem'},
                {buttonWidth: '3.4rem'},
                {buttonHeigth: '2.75rem'},
                {buttonBorderRadius: '0.5rem'},
                {buttonDoubleBorderRadius: '0.5rem'},
                {buttonBgColor: '#ecf0f3'},
                {buttonTextColor: '#444'},
                {buttonSpecialColor: '#5166d6'},
                {buttonMemoryColor: '#bdbdbd'},
                {displayBgColor: '#ecf0f3'},
                {displayColor: '#5166d6'},
                {displayBorderRadius: '0.5rem'},
                {darkShadow: '#b0b0b0'},
                {lightShadow: '#fff'},
                {bg1: '#ddd'},
                {bg2: '#e1e1e4'},
                {iconSize: '1.25rem'},
                {iconColor: '#5166d6'}
            ]
        }
    },
    wheelpicker: {
        children: [{
            element: 'WheelOverlay',
                tag: 'div',
                class: '',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    userSelect: 'none',
                    pointerEvents: 'none'
                },
                root: true,  // root container
                protected: true,
                hidden: true,
                children: [
                    {
                        element: 'WheelBackdrop',
                        tag: 'div',
                        class: '',
                        style: {
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: 'var(--wheel-backdrop-color, rgba(0,0,0,0.15))',
                            pointerEvents: 'auto'
                        }
                    },
                    {
                        element: 'WheelDialog',
                        tag: 'div',
                        class: '',
                        style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            position: 'relative',
                            backgroundColor: 'var(--wheel-bg-color, #1e1e1e)',
                            color: 'var(--wheel-text-color, whitesmoke)',
                            borderRadius: 'var(--wheel-dialog-border-radius, 0.75rem)',
                            padding: '0.5rem',
                            boxShadow: 'var(--wheel-dialog-box-shadow, none)',
                            width: 'min(90vw, 360px)',
                            pointerEvents: 'auto'
                        },
                        children: [
                            {
                                element: 'WheelHeader',
                                tag: 'header',
                                prefix: 'hdr',
                                id: null,
                                class: '',
                                style: {
                                    display: 'flex',
                                    justifyContent: 'space-between'
                                },
                                children: [
                                    {
                                        element: 'WheelTitle',
                                        tag: 'span',
                                        prefix: 'spn',
                                        style: {fontWeight: 'bold'}
                                    },
                                    {
                                        element: 'CloseWheel',
                                        tag: 'button',
                                        prefix: 'btn',
                                        innerHTML: '&#10005;',
                                        type: 'button',
                                        style: {
                                            width: '1.25rem',
                                            aspectRatio: '1',
                                            borderRadius: '50%',
                                            backgroundColor: 'transparent',
                                            color: 'var(--wheel-text-color, whitesmoke)',
                                            border: 'none',
                                            cursor: 'pointer'
                                        },
                                        events: { pointerdown: 'onPointerDown' }
                                    }
                                ]
                            },
                            {
                                element: 'WheelBody',
                                tag: 'div',
                                style: {
                                    position: 'relative',
                                    padding: '0.25rem'
                                },
                                children: {
                                    element: 'WheelTrack',
                                    tag: 'div',
                                    style: {
                                        position: 'relative',
                                        display: 'flex',
                                        gap: '0.25rem',
                                        alignItems: 'stretch',
                                        justifyContent: 'center',
                                    },
                                    children: {
                                        element: 'WheelSelectionWindow',
                                        tag: 'div',
                                        class: '',
                                        style: {
                                            position: 'absolute',
                                            left: '0',
                                            right: '0',
                                            top: '50%',
                                            height: 'calc(var(--wheel-item-height) + 2px)',
                                            transform: 'translateY(-50%)',
                                            background: 'var(--wheel-selection-bg-color)',
                                            borderRadius: '0.18rem',
                                            border: '1px solid var(--wheel-grid-color, #ffffff40)',
                                            zIndex: 1,
                                            pointerEvents: 'none'
                                        }
                                    },
                                    loop: {
                                        tag: 'div',
                                        class: 'wheel-column',
                                        splitter: '|',
                                        dataWheelIndex: '${#}',
                                        hidden: 0,
                                        text: 1,
                                        style: {
                                            perspective: '475px',
                                            borderRadius: '0.6rem'
                                        },
                                        elements: ['|','|','|','|'],
                                        loop: {tag: 'ul', class: 'wheel-list', elements: ['|']}
                                    }
                                }
                            },
                            {
                                element: 'WheelFooter',
                                tag: 'footer',
                                prefix: 'ftr',
                                class: '',
                                style: {
                                    display: 'flex',
                                    justifyContent: 'flex-end',
                                    paddingTop: '0.5rem',
                                    borderTop: '1px solid var(--wheel-grid-color,rgba(255, 255, 255, 0.1))'
                                },
                                children: {
                                        element: 'WheelOk',
                                        tag: 'button',
                                        prefix: 'btn',
                                        innerHTML: 'OK',
                                        type: 'button',
                                        style: {
                                            width: '4rem',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '999px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            backgroundColor: 'var(--wheel-button-bg-color, #2ecc71)',
                                            color: 'var(--wheel-text-color, whitesmoke)',
                                            border: 'none',
                                            cursor: 'pointer'
                                        },
                                        events: { pointerdown: 'onPointerDown' }
                                }
                            }
                        ]
                    }
                ]
            }
        ],
        css: {
            prefix: 'wheel',
            variables: [
                {itemsVisible: '7'},
                {itemHeight: '1.8rem'},
                {backdropColor: 'rgba(0,0,0,0.15)'},
                {gridColor: 'silver'},        // 'rgba(255,255,255,0.15)'
                {bgColor: '#e5e0e0'},       // '#1e1e1e'
                {buttonBgColor: '#5166d6'}, // '#2ecc71'
                {textColor: '#1a1a1a'},     // 'whitesmoke'
                {accentColor: '#000080'},        // '#5166d6'
                {selectionBgColor: 'rgba(0,0,0,0.08)'}, // rgba(0,0,0,0.15)
                {dialogBorderRadius: '0.75rem'},
                {dialogBoxShadow: '0 0.75rem 2rem rgba(0, 0, 0, 0.6)'},
                {gradientDark: '#d5d0d0'},  // '#1f1f1f'
                {gradientLight: '#efefef'}, // '#212121'
            ]
        }
    }
};

export const NOT_FOUND = -1; // flag for array-methods that indicates an index has not been found