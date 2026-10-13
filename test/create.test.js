import { describe, expect, it } from 'vitest';
import { create, TemplateError } from '../src/index.js';

function template(html) {
  const element = document.createElement('template');
  element.innerHTML = html;
  return element;
}

function div(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element;
}

describe('create', () => {
  it('returns the root element of the template, detached', () => {
    const element = create(template('<section class="card"><p>Hi</p></section>'));

    expect(element.tagName).toBe('SECTION');
    expect(element.outerHTML).toBe('<section class="card"><p>Hi</p></section>');
    expect(element.parentNode).toBeNull();
    expect(element.ownerDocument).toBe(document);
  });

  it('ignores whitespace and comments around the root element', () => {
    const element = create(template('\n  <!-- card -->\n  <article></article>\n'));

    expect(element.tagName).toBe('ARTICLE');
  });

  it('leaves the template untouched so it can be reused', () => {
    const source = template('<p>${name}<slot></slot></p>');

    const first = create(source, { props: { name: 'Alex' }, slots: { default: 'one' } });
    const second = create(source, { props: { name: 'Sam' } });

    expect(first.textContent).toBe('Alexone');
    expect(second.textContent).toBe('Sam');
    expect(source.innerHTML).toBe('<p>${name}<slot></slot></p>');
  });

  it('rejects anything that is not a <template>', () => {
    expect(() => create(document.createElement('div'))).toThrow(TypeError);
    expect(() => create(null)).toThrow(TypeError);
  });

  describe('root element', () => {
    it('throws when there are several root elements', () => {
      expect(() => create(template('<p></p><p></p>'))).toThrow(TemplateError);
    });

    it('throws when there is no root element', () => {
      expect(() => create(template('   '))).toThrow(/found none/);
    });

    it('throws when there is text next to the root element', () => {
      expect(() => create(template('Hello <p></p>'))).toThrow(/text outside/);
    });

    it('may be produced by a slot', () => {
      const element = create(template('<slot></slot>'), { slots: { default: div('x') } });

      expect(element.outerHTML).toBe('<div>x</div>');
    });
  });

  describe('props', () => {
    it('replaces placeholders in text', () => {
      const element = create(template('<p>Hello, ${name}!</p>'), { props: { name: 'Alex' } });

      expect(element.textContent).toBe('Hello, Alex!');
    });

    it('replaces placeholders in attribute values', () => {
      const element = create(template('<a href="/users/${id}" class="link ${kind}"></a>'), {
        props: { id: 42, kind: 'primary' },
      });

      expect(element.getAttribute('href')).toBe('/users/42');
      expect(element.getAttribute('class')).toBe('link primary');
    });

    it('replaces placeholders in nested elements', () => {
      const element = create(template('<ul><li><b>${a}</b></li><li title="${b}"></li></ul>'), {
        props: { a: 'first', b: 'second' },
      });

      expect(element.innerHTML).toBe('<li><b>first</b></li><li title="second"></li>');
    });

    it('replaces every occurrence and allows whitespace inside braces', () => {
      const element = create(template('<p>${ x }-${x}-${y}</p>'), { props: { x: 1, y: true } });

      expect(element.textContent).toBe('1-1-true');
    });

    it('inserts values as text, not HTML', () => {
      const element = create(template('<p>${html}</p>'), { props: { html: '<b>bold</b>' } });

      expect(element.children).toHaveLength(0);
      expect(element.textContent).toBe('<b>bold</b>');
    });

    it('does not expand replacement patterns or nested placeholders in values', () => {
      const element = create(template('<p>${a}</p>'), { props: { a: "$& $' ${b}" } });

      expect(element.textContent).toBe("$& $' ${b}");
    });

    it('accepts falsy values', () => {
      const element = create(template('<p>${a}|${b}|${c}</p>'), { props: { a: 0, b: '', c: false } });

      expect(element.textContent).toBe('0||false');
    });

    it('leaves text without placeholders alone', () => {
      const element = create(template('<p>$ {not} ${ } ${1x}</p>'));

      expect(element.textContent).toBe('$ {not} ${ } ${1x}');
    });

    it('throws for a placeholder without a prop', () => {
      expect(() => create(template('<p>${missing}</p>'))).toThrow(new TemplateError('Missing prop "missing"'));
    });

    it('throws for a prop that is explicitly undefined', () => {
      expect(() => create(template('<p>${a}</p>'), { props: { a: undefined } })).toThrow(TemplateError);
    });

    it('ignores inherited properties', () => {
      expect(() => create(template('<p>${toString}</p>'), { props: {} })).toThrow(TemplateError);
    });
  });

  describe('slots', () => {
    it('fills the default slot with a node', () => {
      const element = create(template('<div class="box"><slot></slot></div>'), {
        slots: { default: div('content') },
      });

      expect(element.outerHTML).toBe('<div class="box"><div>content</div></div>');
    });

    it('fills a named slot with an array of nodes', () => {
      const element = create(template('<div><header><slot name="title"></slot></header></div>'), {
        slots: { title: [div('a'), div('b')] },
      });

      expect(element.innerHTML).toBe('<header><div>a</div><div>b</div></header>');
    });

    it('fills a slot with a string as text', () => {
      const element = create(template('<p><slot></slot></p>'), { slots: { default: '<b>x</b>' } });

      expect(element.children).toHaveLength(0);
      expect(element.textContent).toBe('<b>x</b>');
    });

    it('fills a slot with a mix of nodes and strings', () => {
      const element = create(template('<p><slot></slot></p>'), { slots: { default: ['a', div('b'), 'c'] } });

      expect(element.innerHTML).toBe('a<div>b</div>c');
    });

    it('fills a slot with a live NodeList', () => {
      const source = document.createElement('div');
      source.innerHTML = '<i>1</i><i>2</i><i>3</i>';

      const element = create(template('<p><slot></slot></p>'), { slots: { default: source.childNodes } });

      expect(element.innerHTML).toBe('<i>1</i><i>2</i><i>3</i>');
      expect(source.childNodes).toHaveLength(0);
    });

    it('fills a slot with a DocumentFragment', () => {
      const fragment = document.createDocumentFragment();
      fragment.append(div('a'), div('b'));

      const element = create(template('<p><slot></slot></p>'), { slots: { default: fragment } });

      expect(element.innerHTML).toBe('<div>a</div><div>b</div>');
    });

    it('moves the passed nodes rather than copying them', () => {
      const child = div('moved');

      const element = create(template('<p><slot></slot></p>'), { slots: { default: child } });

      expect(child.parentNode).toBe(element);
    });

    it('fills several slots at once', () => {
      const element = create(
        template('<div><slot name="a"></slot>|<slot></slot>|<slot name="b"></slot></div>'),
        { slots: { a: 'A', default: 'D', b: 'B' } },
      );

      expect(element.textContent).toBe('A|D|B');
      expect(element.querySelector('slot')).toBeNull();
    });

    it('treats an empty name attribute as the default slot', () => {
      const element = create(template('<p><slot name=""></slot></p>'), { slots: { default: 'x' } });

      expect(element.textContent).toBe('x');
    });

    it('keeps fallback content when a slot is not filled', () => {
      const element = create(template('<p><slot name="icon"><i>★</i></slot></p>'));

      expect(element.innerHTML).toBe('<i>★</i>');
    });

    it('keeps fallback content when a slot is explicitly undefined', () => {
      const element = create(template('<p><slot>fallback</slot></p>'), { slots: { default: undefined } });

      expect(element.innerHTML).toBe('fallback');
    });

    it('interpolates fallback content', () => {
      const element = create(template('<p><slot>Hi, ${name}</slot></p>'), { props: { name: 'Alex' } });

      expect(element.textContent).toBe('Hi, Alex');
    });

    it('does not interpolate slotted content', () => {
      const element = create(template('<p>${name}<slot></slot></p>'), {
        props: { name: 'Alex' },
        slots: { default: div('${name}') },
      });

      expect(element.innerHTML).toBe('Alex<div>${name}</div>');
    });

    it('resolves interpolated slot names', () => {
      const element = create(template('<p><slot name="${slot}"></slot></p>'), {
        props: { slot: 'body' },
        slots: { body: 'x' },
      });

      expect(element.textContent).toBe('x');
    });

    it('allows an empty array to clear a slot', () => {
      const element = create(template('<p><slot>fallback</slot></p>'), { slots: { default: [] } });

      expect(element.innerHTML).toBe('');
    });

    it('throws for content passed to an unknown slot', () => {
      expect(() => create(template('<p><slot></slot></p>'), { slots: { title: 'x' } })).toThrow(
        new TemplateError('Unknown slot "title"'),
      );
    });

    it('throws when a slot name is declared twice', () => {
      expect(() => create(template('<p><slot></slot><slot></slot></p>'))).toThrow(/declared more than once/);
    });

    it('throws for unsupported slot content', () => {
      expect(() => create(template('<p><slot></slot></p>'), { slots: { default: 42 } })).toThrow(TypeError);
    });
  });

  it('matches the documented example', () => {
    const element1 = div('one');
    const element2 = div('two');

    const element = create(
      template(`
        <div class="greeting">
          <h1>Hello, \${name}!</h1>
          <main><slot></slot></main>
          <footer><slot name="another"></slot></footer>
        </div>
      `),
      {
        slots: {
          default: document.createElement('div'),
          another: [element1, element2],
        },
        props: {
          name: 'Alex',
        },
      },
    );

    expect(element.querySelector('h1').textContent).toBe('Hello, Alex!');
    expect(element.querySelector('main').innerHTML).toBe('<div></div>');
    expect(element.querySelector('footer').innerHTML).toBe('<div>one</div><div>two</div>');
  });
});
