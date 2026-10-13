/**
 * A value that can be interpolated into a template. It is converted with
 * `String()` and inserted as plain text.
 */
export type PropValue = string | number | boolean | bigint;

/**
 * Content for a single slot. Strings become text nodes; iterables such as
 * arrays and NodeLists are inserted in order.
 */
export type SlotContent = Node | string | Iterable<Node | string>;

export interface CreateOptions {
  /**
   * Content for each slot, keyed by slot name. `default` targets the
   * `<slot>` without a `name` attribute. A slot with no entry keeps its
   * fallback children.
   */
  slots?: Record<string, SlotContent | undefined>;

  /**
   * Values for `${name}` placeholders in text and attribute values.
   */
  props?: Record<string, PropValue>;
}

/**
 * Thrown when a template cannot be turned into an element: a placeholder has
 * no matching prop, a slot is unknown or declared twice, or the template does
 * not have exactly one root element.
 */
export class TemplateError extends Error {
  name: 'TemplateError';
}

/**
 * Builds an element from a `<template>`: interpolates `${name}` placeholders
 * with `props`, then replaces `<slot>` elements with `slots`. The template
 * itself is never modified.
 *
 * @throws {TemplateError} When the template and options do not match.
 * @throws {TypeError} When `template` is not a `<template>` element.
 */
export function create<T extends Element = HTMLElement>(
  template: HTMLTemplateElement,
  options?: CreateOptions,
): T;
