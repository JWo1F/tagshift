# tagshift

Turn a `<template>` into a custom element. Slots are filled from the element's children, `${props}` come from its attributes and update when they change. No dependencies, no build step, no Shadow DOM.

```sh
npm install tagshift
```

## Usage

```html
<template id="user-card">
  <article class="card card--${variant}">
    <h2>Hello, ${firstName}!</h2>
    <div class="body"><slot>Nothing here yet</slot></div>
    <footer><slot name="actions"></slot></footer>
  </article>
</template>
```

```js
import { define } from 'tagshift';

const UserCard = define('user-card', document.getElementById('user-card'));
```

Use it in HTML:

```html
<user-card first-name="Alex" variant="compact">
  <p>Joined in 2026.</p>
  <button slot="actions">Follow</button>
</user-card>
```

Or create it from JavaScript:

```js
const card = new UserCard({
  props: { firstName: 'Alex', variant: 'compact' },
  slots: {
    default: document.createElement('p'),
    actions: [followButton, messageButton],
  },
});

document.body.append(card);

card.props.firstName = 'Sam';        // the heading updates
card.slots.actions = unfollowButton; // the footer's content is replaced
```

## API

### `define(name, template)`

Registers a custom element called `name` that renders `template` into its own children (light DOM), and returns its class. The template is copied at definition time, so later changes to it have no effect. Throws if `name` is not a valid custom element name or is already defined.

### `new Component({ props?, slots? })`

Returns a new, already rendered element, ready to insert.

- `props` — attribute values, keyed by camelCase name: `firstName` sets `first-name`. Props the template does not use are still set as attributes, so `id`, `class` or `ariaLabel` work too. `undefined` or `null` leaves the attribute out.
- `slots` — content for each slot, keyed by slot name.

Without options (`new Component()`, `document.createElement`, or HTML) the element renders when first connected to the document.

### `element.props`

Reads and writes the element's attributes by camelCase name. Reading returns the attribute's string value, or `undefined` when it is missing. Writing updates the rendered placeholders in place; `undefined`, `null` or `delete` removes the attribute. Changing the attribute directly works the same way.

### `element.slots`

Reads and writes each slot's content by slot name. Writing replaces the content in place; `undefined` or `delete` brings back the slot's fallback. Reading returns the assigned nodes as an array, or `undefined` while the fallback shows. Before the element is rendered, assigned content waits and takes priority over its children.

TypeScript users can name the element type: `define<UserCardElement>('user-card', template)`, where `UserCardElement extends ComponentElement`.

### Props

- Placeholders work in text and in attribute values: `${firstName}`, `${ firstName }`. A placeholder shows the matching kebab-case attribute of the element.
- When the attribute changes, only the text and attribute values that use it are updated; nothing is re-created.
- Values are inserted as **text**, so `<b>` in a value is shown literally, never parsed as HTML.
- A missing attribute renders as an empty string, the same as an empty one.

### Slots

- `<slot>` (or `<slot name="">`) is the `default` slot; `<slot name="x">` is slot `x`.
- In HTML, children go to the slot named by their `slot` attribute, or to the default slot. Whitespace and comments between them are ignored, so formatting does not hide fallback content.
- From JavaScript, slot content can be a `Node`, a string, or any iterable of them: an array, a `NodeList`, a `DocumentFragment`. Strings are inserted as text. Passed nodes are **moved**, not copied.
- Each `<slot>` is replaced with an empty comment that marks where its content goes, so the content can be swapped later. Comments do not affect `:empty`.
- A slot without content keeps its fallback children, as in native Shadow DOM. Pass `[]` to empty it.
- Slotted content is never interpolated, so `${...}` inside it is left as is.
- Content for a slot the template does not declare, or a slot name declared twice, throws a `TemplateError`. In HTML the error is reported to the console and the element keeps its original children.
- A slot's name is resolved once, when the element renders.

### Rendering

An element renders once: when created with options, or when first connected to the document. Moving it later does not render it again. An element in the page's own HTML waits until the document has finished parsing, so its children are in place before the slots are filled. Children appended after rendering stay where they are added; use `element.slots` to change slot content.

## Example

[`example/index.html`](example/index.html) shows a component used in HTML, updated through `props` and `slots`, and created with `new`. Serve the repository root with any static server and open `/example/`:

```sh
npx serve .
```

## License

[MIT](LICENSE) © Aleksandr Ivashkin
