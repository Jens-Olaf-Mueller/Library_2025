# Library 2.0 - Demo


## Content
  * [Brief](#brief)
  * [Features](#features)
  * [How to Use](#how-to-use)
  * [Change Log](#change-log)
  * [ToDo](#todo)
  * [Screenshots](#screenshots)


## Brief
  This library provides a bunch of classes and utility functions.


## Features
  ### Classes:
  * `Library`               → base class contains the following features:
    - properties            → public getter: returns readable/writable property names (optionally includes read-only getters)

    - isClassInstance       → public method: checks whether a passed expression is an instance of a class or not
    - arrayIsTypeOf         → public method: checks if a passed array is sort of the passed type (string, number etc.)
    - toBoolean             → public method: coerces heterogeneous truthy values into a boolean
    - stringTo              → public method: converts a string to camel/kebab/snake/caps/camel-dash or parses to an object
    - createElement         → public method: creates/updates an element from an attribute map (props, attrs, events, booleans)
    - setCSSProperty        → public method: sets a CSS custom property on :root or an element
    - getCSSProperty        → public method: reads a CSS custom property from :root or an element
    - renderUI              → public method: builds and appends the component DOM tree from `OBJ_COMPONENTS` (recursive builder)

    - _raiseEvent           → public method: dispatches a CustomEvent from element/parent/document with "detail"
    - _injectCSS            → public method: injects component CSS variables and applies protected inline defaults

    - #setElement:          → private method: resolves a DOM reference from an HTMLElement or an ID string


  * `Calculator`            → A self-contained, UI-integrated calculator widget with persistent settings
                            and clean lifecycle handling. Supports an HTML input element as correspondingg control (buddy).
  * `Parser`                → Parses math epressions. Helper class for calculator. Can also used as "standalone" component.
  * `Calendar`              → Calendar control that supports HTML form elements.
                            Knows ALL holidays in Germany, Austria and Switzerland,
  * `ColorHandler`          → Utility class to convert different color formats. Supports CSS color names.
  * `Haptic`                → Simple haptic class.
  * `MessageBox`            → Universal  dialog class.
  * `WheelPicker`           → Renders a modal/overlay picker for a single input element and manages
                            one or more `Wheel` instances depending on the selected mode.
  * `ListGenerator`         → Base class for Wheel.
  * `Wheel`                 → Scroll unit for the WheelPicker component.

  ### Components

  ### Utils

  ### Dependencies
    - `OBJ_COMPONENTS`      → Object. Used in `WheelPicker` class.
                            Holds built information about UI classes: Calculator, Calendar, WheelPicker
    - `CSS_COLORS`          → Object. Used in `ColorHandler` class. Contains all CSS color names and it's hex values.


## How to use
  Simply copy the link and open the page in your browser.

  [https://link](#linktext)

  Then following these steps...


## Change Log
  * V0.0.1
    - first experimental version


## ToDo


## Screenshots