/**
 * A value for a prop. It is converted with `String()` and stored as an
 * attribute; `undefined` leaves the attribute out.
 */
export type PropValue = string | number | boolean | bigint | undefined;

/**
 * Content for a single slot. Strings become text nodes; iterables such as
 * arrays and NodeLists are inserted in order.
 */
export type SlotContent = Node | string | Iterable<Node | string>;

export interface CreateOptions {
  /**
   * Attribute values, keyed by camelCase prop name: `userName` sets the
   * `user-name` attribute that `${userName}` shows. Props the template does
   * not use are still set as attributes, e.g. `id` or `class`.
   */
  props?: Record<string, PropValue>;

  /**
   * Content for each slot, keyed by slot name. `default` targets the
   * `<slot>` without a `name` attribute. A slot with no entry keeps its
   * fallback children.
   */
  slots?: Record<string, SlotContent | undefined>;
}

/**
 * Creates a rendered instance of a component registered with `define()`.
 */
export type Component<T extends HTMLElement = HTMLElement> = (options?: CreateOptions) => T;

/**
 * Thrown when a component cannot be rendered: content is passed to a slot
 * the template does not declare, or a slot name is declared twice.
 */
export class TemplateError extends Error {
  name: 'TemplateError';
}

/**
 * Registers a custom element rendered from a `<template>` into its light DOM,
 * and returns a factory that creates it.
 *
 * `${propName}` placeholders show the `prop-name` attribute and update when
 * it changes. `<slot>` elements are replaced with the element's children,
 * assigned by their `slot` attribute.
 *
 * @throws {TypeError} When `template` is not a `<template>` element.
 * @throws {DOMException} When `name` is not a valid custom element name or is already defined.
 */
export function define<T extends HTMLElement = HTMLElement>(
  name: string,
  template: HTMLTemplateElement,
): Component<T>;
