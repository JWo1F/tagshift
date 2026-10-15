/**
 * The slot name used for `<slot>` elements without a `name` attribute.
 */
const DEFAULT_SLOT = 'default';

/**
 * Matches `${name}` placeholders. Whitespace inside the braces is allowed,
 * and the name follows the rules of a JavaScript identifier.
 */
const PLACEHOLDER = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

/**
 * Marks a slot that has not been filled yet, so the first render fills
 * every slot, including the ones left to their fallback.
 */
const UNFILLED = Symbol('unfilled');

/**
 * Thrown when a template cannot be rendered: it does not have exactly one
 * root element, content is passed to a slot it does not declare, or a slot
 * name is declared twice.
 */
export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Turns a `<template>` into a component class.
 *
 * An instance holds `props` and `slots`; `render()` returns the rendered
 * element. The first call builds it, later calls update the same element in
 * place with the current `props` and `slots`. The template is copied here,
 * so later changes to it have no effect.
 *
 * @param {HTMLTemplateElement} template
 */
export function define(template) {
  if (template?.tagName !== 'TEMPLATE') {
    throw new TypeError('define() expects a <template> element');
  }

  const document = template.ownerDocument;
  const content = template.content.cloneNode(true);
  findRoot(content);

  return class Component {
    /**
     * Values for `${name}` placeholders. Read on every `render()`.
     * @type {Record<string, unknown>}
     */
    props;

    /**
     * Content for each slot, by slot name. Read on every `render()`; a slot
     * is refilled only when its value is no longer the same (`Object.is`).
     * @type {Record<string, unknown>}
     */
    slots;

    #element = null;
    #bindings = [];
    #slots = new Map();

    constructor({ props = {}, slots = {} } = {}) {
      this.props = { ...props };
      this.slots = { ...slots };
    }

    /**
     * The rendered element as of the last `render()`, without updating it,
     * or `null` before the first `render()`.
     *
     * @returns {Element | null}
     */
    get element() {
      return this.#element;
    }

    /**
     * Returns the rendered element, updated with the current `props` and
     * `slots`. Every call returns the same element.
     *
     * @returns {Element}
     */
    render() {
      if (!this.#element) this.#mount();
      this.#update();
      return this.#element;
    }

    #mount() {
      // importNode, unlike cloneNode, adopts the nodes into the document, so
      // custom elements inside the template get upgraded.
      const fragment = document.importNode(content, true);
      const bindings = bind(fragment);

      // Interpolate first, so slot names may use placeholders.
      for (const binding of bindings) apply(binding, this.props);
      const slots = mountSlots(fragment);

      this.#element = findRoot(fragment);
      this.#element.remove();
      this.#bindings = bindings;
      this.#slots = slots;
    }

    #update() {
      for (const name of Object.keys(this.slots)) {
        if (this.slots[name] !== undefined && !this.#slots.has(name)) {
          throw new TemplateError(`Unknown slot "${name}"`);
        }
      }

      // Resolve all changed content before touching the element, so invalid
      // content leaves it as it was.
      const changes = [];
      for (const [name, slot] of this.#slots) {
        const value = this.slots[name];
        if (!Object.is(value, slot.value)) changes.push([slot, value, toNodes(value)]);
      }

      for (const binding of this.#bindings) apply(binding, this.props);
      for (const [slot, value, nodes] of changes) fillSlot(slot, value, nodes);
    }
  };
}

/**
 * Returns the single root element of `fragment`. Whitespace and comments
 * around the root are ignored.
 */
function findRoot(fragment) {
  let root = null;

  for (const node of fragment.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (root) {
        throw new TemplateError('Template must have exactly one root element, found several');
      }
      root = node;
    } else if (node.nodeType === Node.TEXT_NODE && node.data.trim() !== '') {
      throw new TemplateError('Template must not have text outside its root element');
    }
  }

  if (!root) {
    throw new TemplateError('Template must have exactly one root element, found none');
  }
  if (root.localName === 'slot') {
    throw new TemplateError('Template root element must not be a <slot>');
  }

  return root;
}

/**
 * Finds every text node and attribute value under `root` that contains a
 * placeholder, and remembers its original text so it can be re-rendered.
 */
function bind(root) {
  const bindings = [];
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      addBinding(bindings, node, null, node.data);
    } else {
      for (const { name, value } of node.attributes) addBinding(bindings, node, name, value);
    }
  }

  return bindings;
}

function addBinding(bindings, node, attribute, source) {
  PLACEHOLDER.lastIndex = 0;
  if (PLACEHOLDER.test(source)) bindings.push({ node, attribute, source });
}

/**
 * Renders a binding with the current props, writing to the DOM only when the
 * text changed. Values are inserted as plain text, never parsed as HTML;
 * a missing, `undefined` or `null` prop renders as an empty string.
 */
function apply({ node, attribute, source }, props) {
  const value = source.replace(PLACEHOLDER, (_, name) => {
    const prop = Object.hasOwn(props, name) ? props[name] : undefined;
    return String(prop ?? '');
  });

  if (attribute) {
    if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
  } else if (node.data !== value) {
    node.data = value;
  }
}

/**
 * Replaces each `<slot>` under `root` with an empty comment that marks where
 * its content goes, so the content can be swapped later. The slot's
 * children are kept as its fallback.
 */
function mountSlots(root) {
  const slots = new Map();

  for (const element of root.querySelectorAll('slot')) {
    const name = element.getAttribute('name') || DEFAULT_SLOT;
    if (slots.has(name)) {
      throw new TemplateError(`Slot "${name}" is declared more than once`);
    }

    const marker = root.ownerDocument.createComment('');
    const fallback = [...element.childNodes];
    element.replaceWith(marker);

    slots.set(name, { marker, fallback, shown: [], value: UNFILLED });
  }

  return slots;
}

/**
 * Shows `nodes` in place of the slot's current content, or the slot's
 * fallback when `nodes` is undefined — the same fallback rule as native
 * Shadow DOM slots.
 */
function fillSlot(slot, value, nodes) {
  const shown = nodes ?? slot.fallback;

  // Nodes moved elsewhere since they were slotted are left where they are.
  for (const node of slot.shown) {
    if (node.parentNode === slot.marker.parentNode) node.remove();
  }

  slot.marker.before(...shown);
  slot.shown = shown;
  slot.value = value;
}

/**
 * Normalizes slot content into a list of nodes, or undefined for no content.
 * Strings become text nodes and fragments are unpacked. Iterables are copied
 * first, because a live NodeList shrinks as its nodes are moved.
 */
function toNodes(content) {
  if (content === undefined) return undefined;
  if (typeof content === 'string' || content instanceof Node) return toNodeList(content);

  if (content != null && typeof content[Symbol.iterator] === 'function') {
    return Array.from(content).flatMap(toNodeList);
  }
  throw new TypeError('Slot content must be a Node, a string, or an iterable of them');
}

function toNodeList(item) {
  if (typeof item === 'string') return [new Text(item)];
  if (item instanceof DocumentFragment) return [...item.childNodes];
  if (item instanceof Node) return [item];
  throw new TypeError('Slot content must be a Node, a string, or an iterable of them');
}
