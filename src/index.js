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
 * Thrown when a template cannot be turned into an element: a placeholder has
 * no matching prop, a slot is unknown or declared twice, or the template does
 * not have exactly one root element.
 */
export class TemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Builds an element from a `<template>`.
 *
 * Every `${name}` in text and attribute values is replaced with
 * `props[name]`, then every `<slot>` is replaced with the matching entry of
 * `slots`. Slot content is inserted after interpolation, so placeholders
 * inside it are left untouched. The template itself is never modified.
 *
 * @param {HTMLTemplateElement} template
 * @param {{ slots?: Record<string, unknown>, props?: Record<string, unknown> }} [options]
 * @returns {Element}
 */
export function create(template, { slots = {}, props = {} } = {}) {
  if (template?.tagName !== 'TEMPLATE') {
    throw new TypeError('create() expects a <template> element');
  }

  // importNode, unlike cloneNode, adopts the nodes into the document, so
  // custom elements inside the template get upgraded.
  const fragment = template.ownerDocument.importNode(template.content, true);

  interpolate(fragment, props);
  fillSlots(fragment, slots);

  return extractRoot(fragment);
}

/**
 * Replaces placeholders in every text node and attribute value under `root`.
 */
function interpolate(root, props) {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.data = substitute(node.data, props);
    } else {
      for (const attribute of node.attributes) {
        attribute.value = substitute(attribute.value, props);
      }
    }
  }
}

/**
 * Replaces placeholders in a single string. Values are inserted as plain
 * text, never parsed as HTML.
 */
function substitute(input, props) {
  if (!input.includes('${')) return input;

  return input.replace(PLACEHOLDER, (_, name) => {
    if (!Object.hasOwn(props, name) || props[name] === undefined) {
      throw new TemplateError(`Missing prop "${name}"`);
    }
    return String(props[name]);
  });
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

/**
 * Returns the single root element of `fragment`, detached from it.
 * Whitespace and comments around the root are ignored.
 */
function extractRoot(fragment) {
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

  fragment.removeChild(root);
  return root;
}
