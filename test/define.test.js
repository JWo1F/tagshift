import { describe, expect, it, vi } from 'vitest';
import { define, TemplateError } from '../src/index.js';

let counter = 0;

// The custom element registry is global, so every test needs its own name.
function component(html) {
  const name = `test-component-${++counter}`;
  return { name, create: define(name, template(html)) };
}

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

// Parses markup and connects it, then returns the first element. Parsing
// happens off-document because happy-dom, unlike browsers, connects custom
// elements during innerHTML before their children are parsed.
function mount(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  return container.firstElementChild;
}

describe('define', () => {
  it('registers a custom element and returns a factory for it', () => {
    const { name, create } = component('<p>Hi</p>');

    const element = create();

    expect(element).toBeInstanceOf(customElements.get(name));
    expect(element.tagName).toBe(name.toUpperCase());
    expect(element.innerHTML).toBe('<p>Hi</p>');
    expect(element.parentNode).toBeNull();
  });

  it('renders the template into the light DOM, with any number of root nodes', () => {
    const { create } = component('<h1>Title</h1> text <p>Body</p>');

    expect(create().innerHTML).toBe('<h1>Title</h1> text <p>Body</p>');
    expect(create().shadowRoot).toBeNull();
  });

  it('copies the template, so later changes to it have no effect', () => {
    const source = template('<p>before</p>');
    const name = `test-component-${++counter}`;
    const create = define(name, source);

    source.innerHTML = '<p>after</p>';

    expect(create().innerHTML).toBe('<p>before</p>');
  });

  it('renders elements written in HTML', () => {
    const { name } = component('<p>Hello, ${name}!</p>');

    const element = mount(`<${name} name="Alex"></${name}>`);

    expect(element.innerHTML).toBe('<p>Hello, Alex!</p>');
  });

  it('renders elements created with document.createElement once connected', () => {
    const { name } = component('<p>${name}</p>');
    const element = document.createElement(name);
    element.setAttribute('name', 'Alex');

    expect(element.innerHTML).toBe('');
    document.body.append(element);

    expect(element.innerHTML).toBe('<p>Alex</p>');
  });

  it('renders only once, even when moved', () => {
    const { create } = component('<p><slot></slot></p>');
    const element = create({ slots: { default: 'x' } });

    document.body.append(element);
    document.body.prepend(element);

    expect(element.innerHTML).toBe('<p>x</p>');
  });

  it('waits for the document to be parsed before rendering', () => {
    const { name } = component('<p><slot>fallback</slot></p>');
    const element = document.createElement(name);
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');

    document.body.append(element);
    element.append('parsed later');
    expect(element.innerHTML).toBe('parsed later');

    readyState.mockRestore();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(element.innerHTML).toBe('<p>parsed later</p>');
  });

  it('rejects anything that is not a <template>', () => {
    expect(() => define(`test-component-${++counter}`, document.createElement('div'))).toThrow(TypeError);
    expect(() => define(`test-component-${++counter}`, null)).toThrow(TypeError);
  });

  it('rejects a name that is already defined', () => {
    const { name } = component('<p></p>');

    expect(() => define(name, template('<p></p>'))).toThrow();
  });

  describe('props', () => {
    it('replaces placeholders in text', () => {
      const { create } = component('<p>Hello, ${name}!</p>');

      expect(create({ props: { name: 'Alex' } }).textContent).toBe('Hello, Alex!');
    });

    it('replaces placeholders in attribute values', () => {
      const { create } = component('<a href="/users/${id}" class="link ${kind}"></a>');

      const link = create({ props: { id: 42, kind: 'primary' } }).firstElementChild;

      expect(link.getAttribute('href')).toBe('/users/42');
      expect(link.getAttribute('class')).toBe('link primary');
    });

    it('replaces placeholders in nested elements', () => {
      const { create } = component('<ul><li><b>${a}</b></li><li title="${b}"></li></ul>');

      expect(create({ props: { a: 'first', b: 'second' } }).innerHTML).toBe(
        '<ul><li><b>first</b></li><li title="second"></li></ul>',
      );
    });

    it('replaces every occurrence and allows whitespace inside braces', () => {
      const { create } = component('${ x }-${x}-${y}');

      expect(create({ props: { x: 1, y: true } }).textContent).toBe('1-1-true');
    });

    it('stores props as attributes', () => {
      const { create } = component('${name}');

      expect(create({ props: { name: 'Alex' } }).getAttribute('name')).toBe('Alex');
    });

    it('maps camelCase props to kebab-case attributes', () => {
      const { name, create } = component('<p>${firstName}</p>');

      expect(customElements.get(name).observedAttributes).toEqual(['first-name']);
      expect(create({ props: { firstName: 'Alex' } }).getAttribute('first-name')).toBe('Alex');
      expect(mount(`<${name} first-name="Sam"></${name}>`).textContent).toBe('Sam');
    });

    it('sets props the template does not use as plain attributes', () => {
      const { create } = component('<p></p>');

      const element = create({ props: { id: 'main', ariaLabel: 'Card' } });

      expect(element.id).toBe('main');
      expect(element.getAttribute('aria-label')).toBe('Card');
    });

    it('inserts values as text, not HTML', () => {
      const { create } = component('<p>${html}</p>');

      const element = create({ props: { html: '<b>bold</b>' } });

      expect(element.querySelector('b')).toBeNull();
      expect(element.textContent).toBe('<b>bold</b>');
    });

    it('does not expand replacement patterns or nested placeholders in values', () => {
      const { create } = component('<p>${a}</p>');

      expect(create({ props: { a: "$& $' ${b}", b: 'no' } }).textContent).toBe("$& $' ${b}");
    });

    it('accepts falsy values', () => {
      const { create } = component('${a}|${b}|${c}');

      expect(create({ props: { a: 0, b: '', c: false } }).textContent).toBe('0||false');
    });

    it('renders a missing prop as an empty string', () => {
      const { create } = component('<p title="[${a}]">[${a}]</p>');

      const element = create({ props: { a: undefined } });

      expect(element.hasAttribute('a')).toBe(false);
      expect(element.innerHTML).toBe('<p title="[]">[]</p>');
    });

    it('leaves text without placeholders alone', () => {
      const { create } = component('<p>$ {not} ${ } ${1x} ${$x}</p>');

      expect(create().textContent).toBe('$ {not} ${ } ${1x} ${$x}');
    });

    describe('when attributes change', () => {
      it('updates text and attribute values', () => {
        const { create } = component('<p class="${kind}">Hello, ${name}!</p>');
        const element = create({ props: { name: 'Alex', kind: 'a' } });
        const paragraph = element.firstElementChild;

        element.setAttribute('name', 'Sam');
        element.setAttribute('kind', 'b');

        expect(element.firstElementChild).toBe(paragraph);
        expect(element.innerHTML).toBe('<p class="b">Hello, Sam!</p>');
      });

      it('keeps the other placeholders in the same text', () => {
        const { create } = component('${first} ${last}');
        const element = create({ props: { first: 'Alex', last: 'Ivashkin' } });

        element.setAttribute('first', 'Aleksandr');

        expect(element.textContent).toBe('Aleksandr Ivashkin');
      });

      it('clears a placeholder when its attribute is removed', () => {
        const { create } = component('[${name}]');
        const element = create({ props: { name: 'Alex' } });

        element.removeAttribute('name');

        expect(element.textContent).toBe('[]');
      });

      it('updates placeholders in fallback content', () => {
        const { create } = component('<slot>Hi, ${name}</slot>');
        const element = create({ props: { name: 'Alex' } });

        element.setAttribute('name', 'Sam');

        expect(element.textContent).toBe('Hi, Sam');
      });

      it('applies attributes set before the element is rendered', () => {
        const { name } = component('${name}');
        const element = document.createElement(name);

        element.setAttribute('name', 'early');
        document.body.append(element);

        expect(element.textContent).toBe('early');
      });
    });
  });

  describe('slots', () => {
    it('fills the default slot with a node', () => {
      const { create } = component('<div class="box"><slot></slot></div>');

      expect(create({ slots: { default: div('content') } }).innerHTML).toBe(
        '<div class="box"><div>content</div></div>',
      );
    });

    it('fills a named slot with an array of nodes', () => {
      const { create } = component('<header><slot name="title"></slot></header>');

      expect(create({ slots: { title: [div('a'), div('b')] } }).innerHTML).toBe(
        '<header><div>a</div><div>b</div></header>',
      );
    });

    it('fills a slot with a string as text', () => {
      const { create } = component('<p><slot></slot></p>');

      const element = create({ slots: { default: '<b>x</b>' } });

      expect(element.querySelector('b')).toBeNull();
      expect(element.textContent).toBe('<b>x</b>');
    });

    it('fills a slot with a mix of nodes and strings', () => {
      const { create } = component('<p><slot></slot></p>');

      expect(create({ slots: { default: ['a', div('b'), 'c'] } }).innerHTML).toBe('<p>a<div>b</div>c</p>');
    });

    it('fills a slot with a live NodeList', () => {
      const { create } = component('<p><slot></slot></p>');
      const source = document.createElement('div');
      source.innerHTML = '<i>1</i><i>2</i><i>3</i>';

      expect(create({ slots: { default: source.childNodes } }).innerHTML).toBe('<p><i>1</i><i>2</i><i>3</i></p>');
      expect(source.childNodes).toHaveLength(0);
    });

    it('fills a slot with a DocumentFragment', () => {
      const { create } = component('<p><slot></slot></p>');
      const fragment = document.createDocumentFragment();
      fragment.append(div('a'), div('b'));

      expect(create({ slots: { default: fragment } }).innerHTML).toBe('<p><div>a</div><div>b</div></p>');
    });

    it('moves the passed nodes rather than copying them', () => {
      const { create } = component('<p><slot></slot></p>');
      const child = div('moved');

      const element = create({ slots: { default: child } });

      expect(child.parentNode).toBe(element.firstElementChild);
    });

    it('fills several slots at once', () => {
      const { create } = component('<slot name="a"></slot>|<slot></slot>|<slot name="b"></slot>');

      const element = create({ slots: { a: 'A', default: 'D', b: 'B' } });

      expect(element.textContent).toBe('A|D|B');
      expect(element.querySelector('slot')).toBeNull();
    });

    it('treats an empty name attribute as the default slot', () => {
      const { create } = component('<slot name=""></slot>');

      expect(create({ slots: { default: 'x' } }).textContent).toBe('x');
    });

    it('keeps fallback content when a slot is not filled', () => {
      const { create } = component('<p><slot name="icon"><i>★</i></slot></p>');

      expect(create().innerHTML).toBe('<p><i>★</i></p>');
    });

    it('keeps fallback content when a slot is explicitly undefined', () => {
      const { create } = component('<p><slot>fallback</slot></p>');

      expect(create({ slots: { default: undefined } }).innerHTML).toBe('<p>fallback</p>');
    });

    it('interpolates fallback content', () => {
      const { create } = component('<slot>Hi, ${name}</slot>');

      expect(create({ props: { name: 'Alex' } }).textContent).toBe('Hi, Alex');
    });

    it('does not interpolate slotted content', () => {
      const { create } = component('${name}<slot></slot>');

      const element = create({ props: { name: 'Alex' }, slots: { default: div('${name}') } });

      expect(element.innerHTML).toBe('Alex<div>${name}</div>');
    });

    it('resolves interpolated slot names', () => {
      const { create } = component('<slot name="${slot}"></slot>');

      expect(create({ props: { slot: 'body' }, slots: { body: 'x' } }).textContent).toBe('x');
    });

    it('allows an empty array to clear a slot', () => {
      const { create } = component('<p><slot>fallback</slot></p>');

      expect(create({ slots: { default: [] } }).innerHTML).toBe('<p></p>');
    });

    it('throws for content passed to an unknown slot', () => {
      const { create } = component('<slot></slot>');

      expect(() => create({ slots: { title: 'x' } })).toThrow(new TemplateError('Unknown slot "title"'));
    });

    it('throws when a slot name is declared twice', () => {
      const { create } = component('<slot></slot><slot></slot>');

      expect(() => create()).toThrow(/declared more than once/);
    });

    it('throws for unsupported slot content', () => {
      const { create } = component('<slot></slot>');

      expect(() => create({ slots: { default: 42 } })).toThrow(TypeError);
    });

    describe('in HTML', () => {
      it('assigns children by their slot attribute', () => {
        const { name } = component('<h1><slot name="title"></slot></h1><main><slot></slot></main>');

        const element = mount(`<${name}><b>body</b><span slot="title">Title</span> text</${name}>`);

        expect(element.innerHTML).toBe('<h1><span slot="title">Title</span></h1><main><b>body</b> text</main>');
      });

      it('ignores whitespace and comments, so fallback content still shows', () => {
        const { name } = component('<slot>fallback</slot>|<slot name="x"></slot>');

        const element = mount(`<${name}>\n  <!-- note -->\n  <i slot="x">x</i>\n</${name}>`);

        expect(element.innerHTML).toBe('fallback|<i slot="x">x</i>');
      });

      it('keeps the original children when a child targets an unknown slot', () => {
        const { name } = component('<slot></slot>');
        const element = document.createElement(name);
        element.innerHTML = '<i slot="nope">x</i>';

        // Called directly: browsers report errors thrown from lifecycle
        // callbacks instead of rethrowing them, and happy-dom rethrows.
        expect(() => element.connectedCallback()).toThrow(new TemplateError('Unknown slot "nope"'));
        expect(element.innerHTML).toBe('<i slot="nope">x</i>');
      });
    });
  });

  it('matches the documented example', () => {
    const element1 = div('one');
    const element2 = div('two');
    const { create } = component(`
      <h1>Hello, \${name}!</h1>
      <main><slot></slot></main>
      <footer><slot name="another"></slot></footer>
    `);

    const element = create({
      slots: {
        default: document.createElement('div'),
        another: [element1, element2],
      },
      props: {
        name: 'Alex',
      },
    });

    expect(element.querySelector('h1').textContent).toBe('Hello, Alex!');
    expect(element.querySelector('main').innerHTML).toBe('<div></div>');
    expect(element.querySelector('footer').innerHTML).toBe('<div>one</div><div>two</div>');
  });
});
