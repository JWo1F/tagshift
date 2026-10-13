# tagshift

Turn a `<template>` into a ready-to-use element: fill its `<slot>`s and interpolate `${props}`. No dependencies, no build step, no virtual DOM.

```sh
npm install tagshift
```

## Usage

```html
<template id="user-card">
  <article class="card card--${variant}">
    <h2>Hello, ${name}!</h2>
    <div class="body"><slot></slot></div>
    <footer><slot name="actions">No actions</slot></footer>
  </article>
</template>
```

```js
import { create } from 'tagshift';

const template = document.getElementById('user-card');

const element = create(template, {
  slots: {
    default: document.createElement('div'),
    actions: [saveButton, cancelButton],
  },
  props: {
    name: 'Alex',
    variant: 'compact',
  },
});

document.body.append(element);
```

## API

### `create(template, options?)`

Returns the template's root element, detached and ready to insert. The template itself is never modified, so it can be reused.

- `template` — an `HTMLTemplateElement`.
- `options.props` — values for `${name}` placeholders.
- `options.slots` — content for `<slot>` elements, keyed by slot name.

TypeScript users can name the returned element type: `create<HTMLFormElement>(template)`.

### Props

- Placeholders work in text and in attribute values: `${name}`, `${ name }`. Names follow JavaScript identifier rules.
- Values (strings, numbers, booleans, bigints) are converted with `String()` and inserted as **text**, so `<b>` in a value is shown literally, never parsed as HTML.
- A placeholder with no matching prop throws a `TemplateError`, so typos surface immediately.

### Slots

- `<slot>` (or `<slot name="">`) is the `default` slot; `<slot name="x">` is slot `x`.
- Slot content can be a `Node`, a string, or any iterable of them: an array, a `NodeList`, a `DocumentFragment`. Strings are inserted as text.
- Passed nodes are **moved** into the element, not copied.
- A slot without content keeps its fallback children, as in native Shadow DOM. Pass `[]` to empty it.
- Slotted content is inserted after interpolation, so `${...}` inside it is left as is.
- Content for a slot the template does not declare, or a slot name declared twice, throws a `TemplateError`.

### Root element

The template must contain exactly one root element. Whitespace and comments around it are ignored; anything else throws a `TemplateError`. A root `<slot>` is allowed, as long as its content resolves to a single element.

### `TemplateError`

Thrown when the template and the options do not match. Passing something other than a `<template>`, or unsupported slot content, throws a `TypeError`.

## License

[MIT](LICENSE) © Aleksandr Ivashkin
