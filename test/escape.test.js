import { describe, expect, it } from 'vitest';
import { define, escape, html } from '../src/index.js';

describe('escape', () => {
  it('escapes the characters special in HTML', () => {
    expect(escape(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });

  it('escapes an existing entity again', () => {
    expect(escape('&lt;')).toBe('&amp;lt;');
  });

  it('converts non-strings like placeholders do', () => {
    expect(escape(42)).toBe('42');
    expect(escape(false)).toBe('false');
    expect(escape(null)).toBe('');
    expect(escape(undefined)).toBe('');
  });
});

describe('html', () => {
  it('returns a fragment with the parsed markup', () => {
    const fragment = html`<b>bold</b> text`;
    const container = document.createElement('div');
    container.append(fragment);

    expect(fragment).toBeInstanceOf(DocumentFragment);
    expect(container.innerHTML).toBe('<b>bold</b> text');
  });

  it('inserts values as text, in content and in attributes', () => {
    const value = '"><script>alert(1)</script>';
    const container = document.createElement('div');
    container.append(html`<p title="${value}">${value}</p>`);
    const p = container.firstChild;

    expect(container.children).toHaveLength(1);
    expect(p.getAttribute('title')).toBe(value);
    expect(p.textContent).toBe(value);
  });

  it('can be passed as slot content', () => {
    const template = document.createElement('template');
    template.innerHTML = '<div><slot></slot></div>';
    const Component = define(template);
    const element = new Component({ slots: { default: html`<i>${'<b>'}</i>` } }).render();

    expect(element.innerHTML).toBe('<i>&lt;b&gt;</i><!---->');
  });
});
