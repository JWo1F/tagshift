/**
 * A value for a `${name}` placeholder. It is converted with `String()` and
 * inserted as text; `undefined` and `null` render as an empty string.
 */
export type PropValue = string | number | boolean | bigint | null | undefined;

/**
 * Content for a single slot. Strings become text nodes, fragments are
 * unpacked, and iterables such as arrays and NodeLists are inserted in order.
 * `undefined` shows the slot's fallback children.
 */
export type SlotContent = Node | string | Iterable<Node | string> | undefined;

export interface ComponentOptions {
  /** Values for `${name}` placeholders in text and attribute values. */
  props?: Record<string, PropValue>;

  /**
   * Content for each slot, keyed by slot name. `default` targets the
   * `<slot>` without a `name` attribute.
   */
  slots?: Record<string, SlotContent>;
}

/**
 * An instance of a class returned by `define()`.
 */
export interface Component<T extends Element = HTMLElement> {
  /** Values for `${name}` placeholders. Read on every `render()`. */
  props: Record<string, PropValue>;

  /**
   * Content for each slot. Read on every `render()`; a slot is refilled only
   * when its value is no longer the same (`Object.is`), so assign a new
   * array instead of changing one in place.
   */
  slots: Record<string, SlotContent>;

  /**
   * The rendered element as of the last `render()`, without updating it, or
   * `null` before the first `render()`.
   */
  readonly element: T | null;

  /**
   * Returns the rendered element, updated with the current `props` and
   * `slots`. The first call builds it; every call returns the same element.
   *
   * @throws {TemplateError} When content is passed to a slot the template
   * does not declare, or a slot name is declared twice.
   * @throws {TypeError} When slot content is not a Node, a string, or an
   * iterable of them.
   */
  render(): T;
}

/**
 * The class `define()` returns.
 */
export interface ComponentClass<T extends Element = HTMLElement> {
  new (options?: ComponentOptions): Component<T>;
}

/**
 * Thrown when a template cannot be rendered: it does not have exactly one
 * root element, content is passed to a slot it does not declare, or a slot
 * name is declared twice.
 */
export class TemplateError extends Error {
  name: 'TemplateError';
}

/**
 * Turns a `<template>` into a component class. The template is copied, so
 * later changes to it have no effect.
 *
 * @throws {TypeError} When `template` is not a `<template>` element.
 * @throws {TemplateError} When the template does not have exactly one root
 * element, or its root is a `<slot>`.
 */
export function define<T extends Element = HTMLElement>(template: HTMLTemplateElement): ComponentClass<T>;

/**
 * Escapes `&`, `<`, `>`, `"` and `'` for use in HTML text or a quoted
 * attribute value. Non-strings are converted with `String()`; `undefined`
 * and `null` become an empty string.
 */
export function escape(value: unknown): string;

/**
 * A template tag that parses its markup into a fragment, escaping every
 * interpolated value with `escape()`. The result can be passed as slot
 * content.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): DocumentFragment;
