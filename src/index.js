/**
 * The slot name used for `<slot>` elements without a `name` attribute, and
 * for children without a `slot` attribute.
 */
const DEFAULT_SLOT = 'default';

/**
 * Matches `${name}` placeholders. Whitespace inside the braces is allowed.
 * Names are limited to characters that are also valid in attribute names.
 */
const PLACEHOLDER = /\$\{\s*([A-Za-z_]\w*)\s*\}/g;

/**
 * Thrown when a component cannot be rendered: content is passed to a slot
 * the template does not declare, or a slot name is declared twice.
 */
export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Registers a custom element rendered from a `<template>` and returns a
 * factory that creates it.
 *
 * Every `${propName}` in the template's text and attribute values shows the
 * element's `prop-name` attribute and follows its changes. Every `<slot>` is
 * replaced with the matching children of the element, or with its own
 * fallback children when there are none. The template is copied at
 * definition time, so later changes to it have no effect.
 *
 * @param {string} name A valid custom element name, e.g. `user-card`.
 * @param {HTMLTemplateElement} template
 * @returns {(options?: { props?: Record<string, unknown>, slots?: Record<string, unknown> }) => HTMLElement}
 */
export function define(name, template) {
  if (template?.tagName !== 'TEMPLATE') {
    throw new TypeError('define() expects a <template> element');
  }

  const document = template.ownerDocument;
  const content = template.content.cloneNode(true);
  const propsByAttribute = new Map(
    [...collectProps(content)].map((prop) => [toAttribute(prop), prop]),
  );

  // Bindings of every rendered element. An element without an entry has not
  // been rendered yet.
  const rendered = new WeakMap();

  function render(element, slots = slotsFromChildren(element)) {
    if (rendered.has(element)) return;

    // importNode, unlike cloneNode, adopts the nodes into the document, so
    // custom elements inside the template get upgraded.
    const fragment = document.importNode(content, true);
    const bindings = bind(fragment);

    for (const binding of bindings) apply(binding, element);
    fillSlots(fragment, slots);

    element.replaceChildren(fragment);
    rendered.set(element, bindings);
  }

  class Component extends HTMLElement {
    static observedAttributes = [...propsByAttribute.keys()];

    connectedCallback() {
      // An element in the page's own HTML is connected as soon as its start
      // tag is parsed, before its children are. Waiting for the document to
      // finish parsing gives the slots their content.
      if (this.ownerDocument.readyState === 'loading') {
        this.ownerDocument.addEventListener('DOMContentLoaded', () => render(this), { once: true });
      } else {
        render(this);
      }
    }

    attributeChangedCallback(attribute) {
      const prop = propsByAttribute.get(attribute);

      for (const binding of rendered.get(this) ?? []) {
        if (binding.props.has(prop)) apply(binding, this);
      }
    }
  }

  customElements.define(name, Component);

  return function create({ props = {}, slots = {} } = {}) {
    const element = document.createElement(name);

    for (const [prop, value] of Object.entries(props)) {
      if (value !== undefined) element.setAttribute(toAttribute(prop), String(value));
    }

    render(element, slots);
    return element;
  };
}

/**
 * Converts a camelCase prop name to its kebab-case attribute name.
 */
function toAttribute(prop) {
  return prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Returns the names of all placeholders used under `root`.
 */
function collectProps(root) {
  const props = new Set();

  for (const { source } of bind(root)) {
    for (const [, prop] of source.matchAll(PLACEHOLDER)) props.add(prop);
  }

  return props;
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
  const props = new Set(Array.from(source.matchAll(PLACEHOLDER), ([, prop]) => prop));
  if (props.size > 0) bindings.push({ node, attribute, source, props });
}

/**
 * Re-renders a binding with the element's current attribute values. Values
 * are inserted as plain text, never parsed as HTML. A missing attribute
 * renders as an empty string, the same as an empty attribute.
 */
function apply({ node, attribute, source }, element) {
  const value = source.replace(
    PLACEHOLDER,
    (_, prop) => element.getAttribute(toAttribute(prop)) ?? '',
  );

  if (attribute) {
    node.setAttribute(attribute, value);
  } else {
    node.data = value;
  }
}

/**
 * Groups the element's children by their `slot` attribute, the same way
 * native Shadow DOM assigns them. Whitespace-only text and comments are
 * left out, so formatting in HTML does not hide a slot's fallback content.
 */
function slotsFromChildren(element) {
  const slots = {};

  for (const node of element.childNodes) {
    if (node.nodeType === Node.COMMENT_NODE) continue;
    if (node.nodeType === Node.TEXT_NODE && node.data.trim() === '') continue;

    const name = (node.nodeType === Node.ELEMENT_NODE && node.getAttribute('slot')) || DEFAULT_SLOT;
    (slots[name] ??= []).push(node);
  }

  return slots;
}

/**
 * Replaces each `<slot>` with the content passed for it, or with the slot's
 * own children when nothing was passed — the same fallback rule as native
 * Shadow DOM slots.
 */
function fillSlots(root, slots) {
  const found = new Map();

  for (const slot of root.querySelectorAll('slot')) {
    const name = slot.getAttribute('name') || DEFAULT_SLOT;
    if (found.has(name)) {
      throw new TemplateError(`Slot "${name}" is declared more than once`);
    }
    found.set(name, slot);
  }

  for (const name of Object.keys(slots)) {
    if (slots[name] !== undefined && !found.has(name)) {
      throw new TemplateError(`Unknown slot "${name}"`);
    }
  }

  for (const [name, slot] of found) {
    const content = slots[name];
    slot.replaceWith(...(content === undefined ? slot.childNodes : toNodes(content)));
  }
}

/**
 * Normalizes slot content into a list `replaceWith` accepts. Iterables are
 * copied first, because a live NodeList shrinks as its nodes are moved.
 */
function toNodes(content) {
  if (typeof content === 'string' || content instanceof Node) {
    return [content];
  }
  if (content != null && typeof content[Symbol.iterator] === 'function') {
    return Array.from(content);
  }
  throw new TypeError('Slot content must be a Node, a string, or an iterable of them');
}
