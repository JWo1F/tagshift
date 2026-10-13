import { describe, expect, it, vi } from 'vitest';
import { define, TemplateError } from '../src/index.js';

let counter = 0;

// The custom element registry is global, so every test needs its own name.
function component(html) {
  const name = `test-component-${++counter}`;
  return { name, Component: define(name, template(html)) };
}

function template(html) {
  const element = document.createElement('template');
  element.innerHTML = html;
  return element;
}

// The element's markup without the empty comments that mark slot positions.
function html(element) {
  return element.innerHTML.replaceAll('<!---->', '');
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
  it('registers a custom element and returns its class', () => {
    const { name, Component } = component('<p>Hi</p>');

    const element = new Component({});

    expect(element).toBeInstanceOf(customElements.get(name));
    expect(element.tagName).toBe(name.toUpperCase());
    expect(html(element)).toBe('<p>Hi</p>');
    expect(element.parentNode).toBeNull();
  });

  it('renders the template into the light DOM, with any number of root nodes', () => {
    const { Component } = component('<h1>Title</h1> text <p>Body</p>');

    expect(html(new Component({}))).toBe('<h1>Title</h1> text <p>Body</p>');
    expect(new Component({}).shadowRoot).toBeNull();
  });

  it('copies the template, so later changes to it have no effect', () => {
    const source = template('<p>before</p>');
    const name = `test-component-${++counter}`;
    const Component = define(name, source);

    source.innerHTML = '<p>after</p>';

    expect(html(new Component({}))).toBe('<p>before</p>');
  });

  it('renders elements written in HTML', () => {
    const { name } = component('<p>Hello, ${name}!</p>');

    const element = mount(`<${name} name="Alex"></${name}>`);

    expect(html(element)).toBe('<p>Hello, Alex!</p>');
  });

  it('renders elements created with document.createElement once connected', () => {
    const { name } = component('<p>${name}</p>');
    const element = document.createElement(name);
    element.setAttribute('name', 'Alex');

    expect(html(element)).toBe('');
    document.body.append(element);

    expect(html(element)).toBe('<p>Alex</p>');
  });

  it('renders only once, even when moved', () => {
    const { Component } = component('<p><slot></slot></p>');
    const element = new Component({ slots: { default: 'x' } });

    document.body.append(element);
    document.body.prepend(element);

    expect(html(element)).toBe('<p>x</p>');
  });

  it('waits for the document to be parsed before rendering', () => {
    const { name } = component('<p><slot>fallback</slot></p>');
    const element = document.createElement(name);
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');

    document.body.append(element);
    element.append('parsed later');
    expect(html(element)).toBe('parsed later');

    readyState.mockRestore();
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(html(element)).toBe('<p>parsed later</p>');
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
      const { Component } = component('<p>Hello, ${name}!</p>');

      expect(new Component({ props: { name: 'Alex' } }).textContent).toBe('Hello, Alex!');
    });

    it('replaces placeholders in attribute values', () => {
      const { Component } = component('<a href="/users/${id}" class="link ${kind}"></a>');

      const link = new Component({ props: { id: 42, kind: 'primary' } }).firstElementChild;

      expect(link.getAttribute('href')).toBe('/users/42');
      expect(link.getAttribute('class')).toBe('link primary');
    });

    it('replaces placeholders in nested elements', () => {
      const { Component } = component('<ul><li><b>${a}</b></li><li title="${b}"></li></ul>');

      expect(html(new Component({ props: { a: 'first', b: 'second' } }))).toBe(
        '<ul><li><b>first</b></li><li title="second"></li></ul>',
      );
    });

    it('replaces every occurrence and allows whitespace inside braces', () => {
      const { Component } = component('${ x }-${x}-${y}');

      expect(new Component({ props: { x: 1, y: true } }).textContent).toBe('1-1-true');
    });

    it('stores props as attributes', () => {
      const { Component } = component('${name}');

      expect(new Component({ props: { name: 'Alex' } }).getAttribute('name')).toBe('Alex');
    });

    it('maps camelCase props to kebab-case attributes', () => {
      const { name, Component } = component('<p>${firstName}</p>');

      expect(customElements.get(name).observedAttributes).toEqual(['first-name']);
      expect(new Component({ props: { firstName: 'Alex' } }).getAttribute('first-name')).toBe('Alex');
      expect(mount(`<${name} first-name="Sam"></${name}>`).textContent).toBe('Sam');
    });

    it('sets props the template does not use as plain attributes', () => {
      const { Component } = component('<p></p>');

      const element = new Component({ props: { id: 'main', ariaLabel: 'Card' } });

      expect(element.id).toBe('main');
      expect(element.getAttribute('aria-label')).toBe('Card');
    });

    it('inserts values as text, not HTML', () => {
      const { Component } = component('<p>${html}</p>');

      const element = new Component({ props: { html: '<b>bold</b>' } });

      expect(element.querySelector('b')).toBeNull();
      expect(element.textContent).toBe('<b>bold</b>');
    });

    it('does not expand replacement patterns or nested placeholders in values', () => {
      const { Component } = component('<p>${a}</p>');

      expect(new Component({ props: { a: "$& $' ${b}", b: 'no' } }).textContent).toBe("$& $' ${b}");
    });

    it('accepts falsy values', () => {
      const { Component } = component('${a}|${b}|${c}');

      expect(new Component({ props: { a: 0, b: '', c: false } }).textContent).toBe('0||false');
    });

    it('renders a missing prop as an empty string', () => {
      const { Component } = component('<p title="[${a}]">[${a}]</p>');

      const element = new Component({ props: { a: undefined } });

      expect(element.hasAttribute('a')).toBe(false);
      expect(html(element)).toBe('<p title="[]">[]</p>');
    });

    it('leaves text without placeholders alone', () => {
      const { Component } = component('<p>$ {not} ${ } ${1x} ${$x}</p>');

      expect(new Component({}).textContent).toBe('$ {not} ${ } ${1x} ${$x}');
    });

    describe('when attributes change', () => {
      it('updates text and attribute values', () => {
        const { Component } = component('<p class="${kind}">Hello, ${name}!</p>');
        const element = new Component({ props: { name: 'Alex', kind: 'a' } });
        const paragraph = element.firstElementChild;

        element.setAttribute('name', 'Sam');
        element.setAttribute('kind', 'b');

        expect(element.firstElementChild).toBe(paragraph);
        expect(html(element)).toBe('<p class="b">Hello, Sam!</p>');
      });

      it('keeps the other placeholders in the same text', () => {
        const { Component } = component('${first} ${last}');
        const element = new Component({ props: { first: 'Alex', last: 'Ivashkin' } });

        element.setAttribute('first', 'Aleksandr');

        expect(element.textContent).toBe('Aleksandr Ivashkin');
      });

      it('clears a placeholder when its attribute is removed', () => {
        const { Component } = component('[${name}]');
        const element = new Component({ props: { name: 'Alex' } });

        element.removeAttribute('name');

        expect(element.textContent).toBe('[]');
      });

      it('updates placeholders in fallback content', () => {
        const { Component } = component('<slot>Hi, ${name}</slot>');
        const element = new Component({ props: { name: 'Alex' } });

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
      const { Component } = component('<div class="box"><slot></slot></div>');

      expect(html(new Component({ slots: { default: div('content') } }))).toBe(
        '<div class="box"><div>content</div></div>',
      );
    });

    it('fills a named slot with an array of nodes', () => {
      const { Component } = component('<header><slot name="title"></slot></header>');

      expect(html(new Component({ slots: { title: [div('a'), div('b')] } }))).toBe(
        '<header><div>a</div><div>b</div></header>',
      );
    });

    it('fills a slot with a string as text', () => {
      const { Component } = component('<p><slot></slot></p>');

      const element = new Component({ slots: { default: '<b>x</b>' } });

      expect(element.querySelector('b')).toBeNull();
      expect(element.textContent).toBe('<b>x</b>');
    });

    it('fills a slot with a mix of nodes and strings', () => {
      const { Component } = component('<p><slot></slot></p>');

      expect(html(new Component({ slots: { default: ['a', div('b'), 'c'] } }))).toBe('<p>a<div>b</div>c</p>');
    });

    it('fills a slot with a live NodeList', () => {
      const { Component } = component('<p><slot></slot></p>');
      const source = document.createElement('div');
      source.innerHTML = '<i>1</i><i>2</i><i>3</i>';

      expect(html(new Component({ slots: { default: source.childNodes } }))).toBe('<p><i>1</i><i>2</i><i>3</i></p>');
      expect(source.childNodes).toHaveLength(0);
    });

    it('fills a slot with a DocumentFragment', () => {
      const { Component } = component('<p><slot></slot></p>');
      const fragment = document.createDocumentFragment();
      fragment.append(div('a'), div('b'));

      expect(html(new Component({ slots: { default: fragment } }))).toBe('<p><div>a</div><div>b</div></p>');
    });

    it('moves the passed nodes rather than copying them', () => {
      const { Component } = component('<p><slot></slot></p>');
      const child = div('moved');

      const element = new Component({ slots: { default: child } });

      expect(child.parentNode).toBe(element.firstElementChild);
    });

    it('fills several slots at once', () => {
      const { Component } = component('<slot name="a"></slot>|<slot></slot>|<slot name="b"></slot>');

      const element = new Component({ slots: { a: 'A', default: 'D', b: 'B' } });

      expect(element.textContent).toBe('A|D|B');
      expect(element.querySelector('slot')).toBeNull();
    });

    it('treats an empty name attribute as the default slot', () => {
      const { Component } = component('<slot name=""></slot>');

      expect(new Component({ slots: { default: 'x' } }).textContent).toBe('x');
    });

    it('keeps fallback content when a slot is not filled', () => {
      const { Component } = component('<p><slot name="icon"><i>★</i></slot></p>');

      expect(html(new Component({}))).toBe('<p><i>★</i></p>');
    });

    it('keeps fallback content when a slot is explicitly undefined', () => {
      const { Component } = component('<p><slot>fallback</slot></p>');

      expect(html(new Component({ slots: { default: undefined } }))).toBe('<p>fallback</p>');
    });

    it('interpolates fallback content', () => {
      const { Component } = component('<slot>Hi, ${name}</slot>');

      expect(new Component({ props: { name: 'Alex' } }).textContent).toBe('Hi, Alex');
    });

    it('does not interpolate slotted content', () => {
      const { Component } = component('${name}<slot></slot>');

      const element = new Component({ props: { name: 'Alex' }, slots: { default: div('${name}') } });

      expect(html(element)).toBe('Alex<div>${name}</div>');
    });

    it('resolves interpolated slot names', () => {
      const { Component } = component('<slot name="${slot}"></slot>');

      expect(new Component({ props: { slot: 'body' }, slots: { body: 'x' } }).textContent).toBe('x');
    });

    it('allows an empty array to clear a slot', () => {
      const { Component } = component('<p><slot>fallback</slot></p>');

      expect(html(new Component({ slots: { default: [] } }))).toBe('<p></p>');
    });

    it('throws for content passed to an unknown slot', () => {
      const { Component } = component('<slot></slot>');

      expect(() => new Component({ slots: { title: 'x' } })).toThrow(new TemplateError('Unknown slot "title"'));
    });

    it('throws when a slot name is declared twice', () => {
      const { Component } = component('<slot></slot><slot></slot>');

      expect(() => new Component({})).toThrow(/declared more than once/);
    });

    it('throws for unsupported slot content', () => {
      const { Component } = component('<slot></slot>');

      expect(() => new Component({ slots: { default: 42 } })).toThrow(TypeError);
    });

    describe('in HTML', () => {
      it('assigns children by their slot attribute', () => {
        const { name } = component('<h1><slot name="title"></slot></h1><main><slot></slot></main>');

        const element = mount(`<${name}><b>body</b><span slot="title">Title</span> text</${name}>`);

        expect(html(element)).toBe('<h1><span slot="title">Title</span></h1><main><b>body</b> text</main>');
      });

      it('ignores whitespace and comments, so fallback content still shows', () => {
        const { name } = component('<slot>fallback</slot>|<slot name="x"></slot>');

        const element = mount(`<${name}>\n  <!-- note -->\n  <i slot="x">x</i>\n</${name}>`);

        expect(html(element)).toBe('fallback|<i slot="x">x</i>');
      });

      it('keeps the original children when a child targets an unknown slot', () => {
        const { name } = component('<slot></slot>');
        const element = document.createElement(name);
        element.innerHTML = '<i slot="nope">x</i>';

        // Called directly: browsers report errors thrown from lifecycle
        // callbacks instead of rethrowing them, and happy-dom rethrows.
        expect(() => element.connectedCallback()).toThrow(new TemplateError('Unknown slot "nope"'));
        expect(html(element)).toBe('<i slot="nope">x</i>');
      });
    });
  });

  describe('new Component()', () => {
    it('renders right away when given options', () => {
      const { Component } = component('<p>${name}</p>');

      expect(html(new Component({ props: { name: 'Alex' } }))).toBe('<p>Alex</p>');
    });

    it('renders on connection when given no options', () => {
      const { Component } = component('<p>${name}</p>');
      const element = new Component();
      element.props.name = 'Alex';

      expect(element.innerHTML).toBe('');
      document.body.append(element);

      expect(html(element)).toBe('<p>Alex</p>');
    });
  });

  describe('element.props', () => {
    it('reads attributes by camelCase name', () => {
      const { Component } = component('${firstName}');
      const element = new Component({ props: { firstName: 'Alex', count: 3 } });

      expect(element.props.firstName).toBe('Alex');
      expect(element.props.count).toBe('3');
      expect(element.props.missing).toBeUndefined();
      expect('firstName' in element.props).toBe(true);
      expect('missing' in element.props).toBe(false);
    });

    it('updates the rendered element when written', () => {
      const { Component } = component('<p title="${firstName}">${firstName}</p>');
      const element = new Component({ props: { firstName: 'Alex' } });

      element.props.firstName = 'Sam';

      expect(element.getAttribute('first-name')).toBe('Sam');
      expect(html(element)).toBe('<p title="Sam">Sam</p>');
    });

    it('removes the attribute for undefined, null, or delete', () => {
      const { Component } = component('[${a}${b}${c}]');
      const element = new Component({ props: { a: 1, b: 2, c: 3 } });

      element.props.a = undefined;
      element.props.b = null;
      delete element.props.c;

      expect(element.hasAttribute('a') || element.hasAttribute('b') || element.hasAttribute('c')).toBe(false);
      expect(element.textContent).toBe('[]');
    });

    it('reads symbol keys as undefined', () => {
      const { Component } = component('');

      expect(new Component({}).props[Symbol.toStringTag]).toBeUndefined();
    });
  });

  describe('element.slots', () => {
    it('replaces slot content in place', () => {
      const { Component } = component('<header><slot name="title"></slot></header><main><slot></slot></main>');
      const element = new Component({ slots: { title: 'Old', default: div('body') } });
      const header = element.firstElementChild;

      element.slots.title = [div('a'), 'b'];

      expect(element.firstElementChild).toBe(header);
      expect(html(element)).toBe('<header><div>a</div>b</header><main><div>body</div></main>');
    });

    it('can be replaced again and again', () => {
      const { Component } = component('<p><slot></slot></p>');
      const element = new Component({});

      element.slots.default = 'one';
      element.slots.default = [];
      element.slots.default = 'three';

      expect(html(element)).toBe('<p>three</p>');
    });

    it('restores fallback content for undefined or delete', () => {
      const { Component } = component('<p><slot>Hi, ${name}</slot></p><i><slot name="x">x</slot></i>');
      const element = new Component({ props: { name: 'Alex' }, slots: { default: 'custom', x: 'X' } });

      element.slots.default = undefined;
      delete element.slots.x;
      element.props.name = 'Sam';

      expect(html(element)).toBe('<p>Hi, Sam</p><i>x</i>');
    });

    it('reads the assigned nodes, or undefined while the fallback shows', () => {
      const { Component } = component('<slot></slot><slot name="x">fallback</slot>');
      const child = div('a');
      const element = new Component({ slots: { default: [child, 'b'] } });

      expect(element.slots.default).toHaveLength(2);
      expect(element.slots.default[0]).toBe(child);
      expect(element.slots.default[1].data).toBe('b');
      expect(element.slots.x).toBeUndefined();
      expect('x' in element.slots).toBe(true);
      expect('nope' in element.slots).toBe(false);
    });

    it('leaves nodes moved elsewhere where they are', () => {
      const { Component } = component('<slot></slot>');
      const child = div('moved');
      const element = new Component({ slots: { default: child } });
      const elsewhere = document.createElement('section');

      elsewhere.append(child);
      element.slots.default = 'new';

      expect(child.parentNode).toBe(elsewhere);
      expect(html(element)).toBe('new');
    });

    it('throws for an unknown slot', () => {
      const { Component } = component('<slot></slot>');
      const element = new Component({});

      expect(() => {
        element.slots.nope = 'x';
      }).toThrow(new TemplateError('Unknown slot "nope"'));
    });

    it('applies content assigned before rendering, over the children', () => {
      const { name } = component('<p><slot></slot></p><i><slot name="x"></slot></i>');
      const element = document.createElement(name);
      element.innerHTML = '<b>child</b><u slot="x">x</u>';

      element.slots.default = 'assigned';
      expect(element.slots.default).toBe('assigned');
      document.body.append(element);

      expect(html(element)).toBe('<p>assigned</p><i><u slot="x">x</u></i>');
    });
  });

  it('matches the documented example', () => {
    const element1 = div('one');
    const element2 = div('two');
    const { Component } = component(`
      <h1>Hello, \${name}!</h1>
      <main><slot></slot></main>
      <footer><slot name="another"></slot></footer>
    `);

    const element = new Component({
      slots: {
        default: document.createElement('div'),
        another: [element1, element2],
      },
      props: {
        name: 'Alex',
      },
    });

    expect(element.querySelector('h1').textContent).toBe('Hello, Alex!');
    expect(html(element.querySelector('main'))).toBe('<div></div>');
    expect(html(element.querySelector('footer'))).toBe('<div>one</div><div>two</div>');
  });
});
