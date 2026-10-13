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
 * Registers a custom element rendered from a `<template>` and returns its
 * class.
 *
 * Every `${propName}` in the template's text and attribute values shows the
 * element's `prop-name` attribute and follows its changes. Every `<slot>` is
 * replaced with the matching children of the element, or with its own
 * fallback children when there are none. The template is copied at
 * definition time, so later changes to it have no effect.
 *
 * @param {string} name A valid custom element name, e.g. `user-card`.
 * @param {HTMLTemplateElement} template
 * @returns {typeof HTMLElement}
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

  class Component extends HTMLElement {
    static observedAttributes = [...propsByAttribute.keys()];

    // Text and attribute values to update when attributes change; null until
    // the element is rendered.
    #bindings = null;

    // Rendered slots by name.
    #slots = new Map();

    // Slot content assigned before the element is rendered.
    #pendingSlots = {};

    // Symbol keys, such as the ones console.log and util.inspect probe,
    // have no attribute and read as undefined.
    #props = new Proxy({}, {
      get: (_, prop) => (typeof prop === 'string' ? this.getAttribute(toAttribute(prop)) ?? undefined : undefined),
      has: (_, prop) => typeof prop === 'string' && this.hasAttribute(toAttribute(prop)),
      set: (_, prop, value) => {
        if (value == null) {
          this.removeAttribute(toAttribute(prop));
        } else {
          this.setAttribute(toAttribute(prop), String(value));
        }
        return true;
      },
      deleteProperty: (_, prop) => {
        this.removeAttribute(toAttribute(prop));
        return true;
      },
    });

    #slotsProxy = new Proxy({}, {
      get: (_, name) => (this.#bindings ? this.#slots.get(name)?.assigned : this.#pendingSlots[name]),
      has: (_, name) => (this.#bindings ? this.#slots.has(name) : name in this.#pendingSlots),
      set: (_, name, value) => {
        this.#assignSlot(name, value);
        return true;
      },
      deleteProperty: (_, name) => {
        this.#assignSlot(name, undefined);
        return true;
      },
    });

    /**
     * Created with options, the element is rendered right away. Created
     * without them — by the HTML parser, `document.createElement`, or
     * `new` with no arguments — it renders when first connected.
     */
    constructor(options) {
      super();
      if (options === undefined) return;

      const { props = {}, slots = {} } = options;
      Object.assign(this.#props, props);
      this.#pendingSlots = { ...slots };
      this.#render();
    }

    /**
     * The element's attributes, read and written by camelCase prop name.
     * Values are stored as strings; `undefined` or `null` removes the
     * attribute.
     */
    get props() {
      return this.#props;
    }

    /**
     * The content of each slot, by slot name. Assigning replaces the slot's
     * content in place; `undefined` restores its fallback children. Reading
     * returns the assigned nodes, or `undefined` while the fallback shows.
     */
    get slots() {
      return this.#slotsProxy;
    }

    connectedCallback() {
      // An element in the page's own HTML is connected as soon as its start
      // tag is parsed, before its children are. Waiting for the document to
      // finish parsing gives the slots their content.
      if (this.ownerDocument.readyState === 'loading') {
        this.ownerDocument.addEventListener('DOMContentLoaded', () => this.#render(), { once: true });
      } else {
        this.#render();
      }
    }

    attributeChangedCallback(attribute) {
      const prop = propsByAttribute.get(attribute);

      for (const binding of this.#bindings ?? []) {
        if (binding.props.has(prop)) apply(binding, this);
      }
    }

    #render() {
      if (this.#bindings) return;

      const assigned = { ...slotsFromChildren(this), ...this.#pendingSlots };

      // importNode, unlike cloneNode, adopts the nodes into the document, so
      // custom elements inside the template get upgraded.
      const fragment = document.importNode(content, true);
      const bindings = bind(fragment);

      // Interpolate first, so slot names may use placeholders.
      for (const binding of bindings) apply(binding, this);
      const slots = mountSlots(fragment);

      for (const name of Object.keys(assigned)) {
        if (assigned[name] !== undefined && !slots.has(name)) {
          throw new TemplateError(`Unknown slot "${name}"`);
        }
      }

      // Resolve all content before moving anything, so invalid content
      // leaves the element untouched.
      const nodes = new Map([...slots.keys()].map((name) => [name, toNodes(assigned[name])]));

      for (const [name, slot] of slots) fillSlot(slot, nodes.get(name));

      this.replaceChildren(fragment);
      this.#bindings = bindings;
      this.#slots = slots;
      this.#pendingSlots = {};
    }

    #assignSlot(name, value) {
      if (!this.#bindings) {
        this.#pendingSlots[name] = value;
        return;
      }

      const slot = this.#slots.get(name);
      if (!slot) {
        if (value === undefined) return;
        throw new TemplateError(`Unknown slot "${name}"`);
      }

      fillSlot(slot, toNodes(value));
    }
  }

  customElements.define(name, Component);
  return Component;
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

  for (const binding of bind(root)) {
    for (const prop of binding.props) props.add(prop);
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

    slots.set(name, { marker, fallback, shown: [], assigned: undefined });
  }

  return slots;
}

/**
 * Shows `nodes` in place of the slot's current content, or the slot's
 * fallback when `nodes` is undefined — the same fallback rule as native
 * Shadow DOM slots.
 */
function fillSlot(slot, nodes) {
  const shown = nodes ?? slot.fallback;

  // Nodes moved elsewhere since they were slotted are left where they are.
  for (const node of slot.shown) {
    if (node.parentNode === slot.marker.parentNode) node.remove();
  }

  slot.marker.before(...shown);
  slot.shown = shown;
  slot.assigned = nodes && [...nodes];
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
