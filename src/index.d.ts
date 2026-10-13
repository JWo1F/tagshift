/**
 * A value for a prop. It is converted with `String()` and stored as an
 * attribute; `undefined` or `null` removes the attribute.
 */
export type PropValue = string | number | boolean | bigint | null | undefined;

/**
 * Content for a single slot. Strings become text nodes, fragments are
 * unpacked, and iterables such as arrays and NodeLists are inserted in order.
 */
export type SlotContent = Node | string | Iterable<Node | string>;

export interface ComponentOptions {
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
 * An element created from a template registered with `define()`.
 */
export interface ComponentElement extends HTMLElement {
  /**
   * The element's attributes, read and written by camelCase prop name.
   * Reading returns the attribute's string value, or `undefined` when it is
   * missing. Writing updates the rendered placeholders in place.
   */
  readonly props: Record<string, PropValue>;

  /**
   * The content of each slot, by slot name. Writing replaces the slot's
   * content in place; `undefined` restores its fallback. Reading returns the
   * assigned nodes, or `undefined` while the fallback shows.
   */
  readonly slots: Record<string, SlotContent | undefined>;
}

/**
 * The class `define()` registers.
 */
export interface ComponentConstructor<T extends ComponentElement = ComponentElement> {
  /**
   * Creates the element. With options it is rendered right away; without
   * them it renders when first connected to the document.
   */
  new (options?: ComponentOptions): T;
  readonly observedAttributes: string[];
  readonly prototype: T;
}

/**
 * Thrown when a component cannot be rendered: content is passed to a slot
 * the template does not declare, or a slot name is declared twice.
 */
export class TemplateError extends Error {
  name: 'TemplateError';
}

/**
 * Registers a custom element rendered from a `<template>` into its light DOM,
 * and returns its class.
 *
 * `${propName}` placeholders show the `prop-name` attribute and update when
 * it changes. `<slot>` elements are replaced with the element's children,
 * assigned by their `slot` attribute.
 *
 * @throws {TypeError} When `template` is not a `<template>` element.
 * @throws {DOMException} When `name` is not a valid custom element name or is already defined.
 */
export function define<T extends ComponentElement = ComponentElement>(
  name: string,
  template: HTMLTemplateElement,
): ComponentConstructor<T>;
