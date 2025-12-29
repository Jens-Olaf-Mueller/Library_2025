# Library 2.0 - Demo


## Content
  * [Brief](#brief)
  * [Features](#features)
  * [How to Use](#how-to-use)
  * [Change Log](#change-log)
  * [ToDo](#todo)
  * [Screenshots](#screenshots)


## Brief
  This library provides a bunch of classes and utility function.


## Features
  * Library base class contains the folowing features:
    - properties        → public getter: returns readable/writable property names (optionally includes read-only getters)

    - isClassInstance   → public method: checks whether a passed expression is an instance of a class or not
    - arrayIsTypeOf     → public method: checks if a passed array is sort of the passed type (string, number etc.)
    - toBoolean         → public method: coerces heterogeneous truthy values into a boolean
    - stringTo          → public method: converts a string to camel/kebab/snake/caps/camel-dash or parses to an object
    - createElement     → public method: creates/updates an element from an attribute map (props, attrs, events, booleans)
    - setCSSProperty    → public method: sets a CSS custom property on :root or an element
    - getCSSProperty    → public method: reads a CSS custom property from :root or an element
    - renderUI          → public method: builds and appends the component DOM tree from `OBJ_COMPONENTS` (recursive builder)

    - _raiseEvent       → public method: dispatches a CustomEvent from element/parent/document with `detail`
    - _injectCSS        → public method: injects component CSS variables and applies protected inline defaults

    - #setElement:      → private method: resolves a DOM reference from an HTMLElement or an ID string

  * ...
  * ...


## How to use
  Simply copy the link and open the page in your browser.

  [https://link](#linktext)

  Then following these steps...


## Change Log
  * V0.0.1
    - first experimental version


## ToDo


## Screenshots