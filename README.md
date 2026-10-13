# tagshift

Turn a `<template>` into a component class: fill its `<slot>`s, interpolate `${props}`, and update the rendered element in place. No dependencies, no build step, no virtual DOM.

```sh
npm install tagshift
```

## Usage

```html
<template id="user-card">
  <article class="card card--${variant}">
    <h2>Hello, ${name}!</h2>
    <div class="body"><slot>Nothing here yet</slot></div>
    <footer><slot name="actions"></slot></footer>
  </article>
</template>
```

```js
import { define } from 'tagshift';

const UserCard = define(document.getElementById('user-card'));

const card = new UserCard({
  props: { name: 'Alex', variant: 'compact' },
  slots: {
    default: document.createElement('p'),
    actions: [followButton, messageButton],
  },
});

document.body.append(card.render());

card.props.name = 'Sam';
card.slots.actions = unfollowButton;
card.render(); // updates the same element
```

## API

### `define(template)`

Returns a component class for `template`. The template is copied, so later changes to it have no effect. It must contain exactly one root element, which is not a `<slot>`; whitespace and comments around it are ignored. Otherwise `define()` throws a `TemplateError`.

### `new Component({ props?, slots? })`

Creates an instance holding copies of `props` and `slots`. Nothing is rendered yet.

### `component.props`

Values for `${name}` placeholders. Change them, or replace the whole object, then call `render()`.

### `component.slots`

Content for each slot, keyed by slot name. Change them, or replace the whole object, then call `render()`.

### `component.render()`

Returns the rendered root element, updated with the current `props` and `slots`. The first call builds it; every later call updates the same element in place and returns it.

TypeScript users can name the root element type: `define<HTMLFormElement>(template)`.

### Props

- Placeholders work in text and in attribute values: `${name}`, `${ name }`. Names follow JavaScript identifier rules.
- Values are converted with `String()` and inserted as **text**, so `<b>` in a value is shown literally, never parsed as HTML.
- A missing, `undefined` or `null` prop renders as an empty string.
- `render()` writes only the text and attribute values whose result changed; nothing is re-created.

### Slots

- `<slot>` (or `<slot name="">`) is the `default` slot; `<slot name="x">` is slot `x`.
- Slot content can be a `Node`, a string, or any iterable of them: an array, a `NodeList`, a `DocumentFragment`. Strings are inserted as text. Passed nodes are **moved**, not copied.
- A slot without content keeps its fallback children, as in native Shadow DOM. Set it to `undefined` or `delete` it to bring the fallback back; set it to `[]` to empty it.
- A slot is refilled only when its value is no longer the same (`Object.is`). Assign a new array instead of changing one in place.
- Each `<slot>` is replaced with an empty comment that marks where its content goes, so the content can be swapped later. Comments do not affect `:empty`.
- Slotted content is never interpolated, so `${...}` inside it is left as is. A slot's name may use a placeholder; it is resolved on the first render.
- Content for a slot the template does not declare, or a slot name declared twice, makes `render()` throw a `TemplateError`. An update that throws leaves the element as it was.

### `TemplateError`

Thrown when the template and the component's props or slots do not match. Passing something other than a `<template>` to `define()`, or unsupported slot content, throws a `TypeError`.

## Example

[`example/index.html`](example/index.html) shows metric tiles that get new `props` and re-render every second. Serve the repository root with any static server and open `/example/`:

```sh
npx serve .
```

## License

[MIT](LICENSE) © Aleksandr Ivashkin
