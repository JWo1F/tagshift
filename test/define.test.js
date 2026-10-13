import { describe, expect, it } from 'vitest';
import { define, TemplateError } from '../src/index.js';

function template(html) {
  const element = document.createElement('template');
  element.innerHTML = html;
  return element;
}

// Renders a component built from `html` with the given options.
function render(html, options) {
  const Component = define(template(html));
  return new Component(options).render();
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

describe('define', () => {
  it('returns a class whose instances render the template', () => {
    const Component = define(template('<section class="card"><p>Hi</p></section>'));
    const component = new Component();

    expect(component).toBeInstanceOf(Component);
    expect(component.render().outerHTML).toBe('<section class="card"><p>Hi</p></section>');
  });

  it('does not register a custom element', () => {
    const element = render('<section></section>');

    expect(element.tagName).toBe('SECTION');
    expect(customElements.get('section')).toBeUndefined();
  });

  it('copies the template, so later changes to it have no effect', () => {
    const source = template('<p>before</p>');
    const Component = define(source);

    source.innerHTML = '<p>after</p>';

    expect(new Component().render().outerHTML).toBe('<p>before</p>');
  });

  it('leaves the template untouched', () => {
    const source = template('<p>${name}<slot></slot></p>');
    const Component = define(source);

    new Component({ props: { name: 'Alex' }, slots: { default: 'x' } }).render();

    expect(source.innerHTML).toBe('<p>${name}<slot></slot></p>');
  });

  it('rejects anything that is not a <template>', () => {
    expect(() => define(document.createElement('div'))).toThrow(TypeError);
    expect(() => define(null)).toThrow(TypeError);
  });

  describe('root element', () => {
    it('ignores whitespace and comments around it', () => {
      expect(render('\n  <!-- card -->\n  <article></article>\n').tagName).toBe('ARTICLE');
    });

    it('is checked when the class is defined', () => {
      expect(() => define(template('<p></p><p></p>'))).toThrow(/found several/);
      expect(() => define(template('   '))).toThrow(/found none/);
      expect(() => define(template('Hello <p></p>'))).toThrow(/text outside/);
      expect(() => define(template('<slot></slot>'))).toThrow(/must not be a <slot>/);
    });
  });

  describe('new Component()', () => {
    it('copies the props and slots it is given', () => {
      const Component = define(template('<p>${name}</p>'));
      const props = { name: 'Alex' };
      const component = new Component({ props });

      props.name = 'Sam';

      expect(component.props).not.toBe(props);
      expect(component.render().textContent).toBe('Alex');
    });

    it('works without options', () => {
      const Component = define(template('<p>[${name}]<slot>fallback</slot></p>'));
      const component = new Component();

      expect(component.props).toEqual({});
      expect(component.slots).toEqual({});
      expect(component.render().textContent).toBe('[]fallback');
    });

    it('creates independent instances', () => {
      const Component = define(template('<p>${name}</p>'));

      const first = new Component({ props: { name: 'Alex' } }).render();
      const second = new Component({ props: { name: 'Sam' } }).render();

      expect(first).not.toBe(second);
      expect(first.textContent).toBe('Alex');
      expect(second.textContent).toBe('Sam');
    });
  });

  describe('render()', () => {
    it('returns a detached element in the template’s document', () => {
      const element = render('<p></p>');

      expect(element.parentNode).toBeNull();
      expect(element.ownerDocument).toBe(document);
    });

    it('returns the same element on every call', () => {
      const Component = define(template('<p>${name}</p>'));
      const component = new Component();

      expect(component.render()).toBe(component.render());
    });

    it('updates the element in place with the current props', () => {
      const Component = define(template('<p class="${kind}">Hello, ${name}!</p>'));
      const component = new Component({ props: { name: 'Alex', kind: 'a' } });
      const element = component.render();
      const text = element.firstChild;

      component.props.name = 'Sam';
      component.props.kind = 'b';
      component.render();

      expect(element.outerHTML).toBe('<p class="b">Hello, Sam!</p>');
      expect(element.firstChild).toBe(text);
    });

    it('accepts a replaced props object', () => {
      const Component = define(template('<p>${name}</p>'));
      const component = new Component({ props: { name: 'Alex' } });

      component.props = { name: 'Sam' };

      expect(component.render().textContent).toBe('Sam');
    });

    it('writes only what changed', () => {
      const Component = define(template('<p title="${a}">${a}<b>${b}</b></p>'));
      const component = new Component({ props: { a: 1, b: 2 } });
      const element = component.render();
      const records = [];
      const observer = new MutationObserver((list) => records.push(...list));
      observer.observe(element, { subtree: true, attributes: true, characterData: true, childList: true });

      component.props.b = 3;
      component.render();
      records.push(...observer.takeRecords());
      observer.disconnect();

      expect(records).toHaveLength(1);
      expect(records[0].target.parentNode.tagName).toBe('B');
    });
  });

  describe('props', () => {
    it('replace placeholders in text', () => {
      expect(render('<p>Hello, ${name}!</p>', { props: { name: 'Alex' } }).textContent).toBe('Hello, Alex!');
    });

    it('replace placeholders in attribute values', () => {
      const element = render('<a href="/users/${id}" class="link ${kind}"></a>', {
        props: { id: 42, kind: 'primary' },
      });

      expect(element.getAttribute('href')).toBe('/users/42');
      expect(element.getAttribute('class')).toBe('link primary');
    });

    it('replace placeholders in nested elements', () => {
      const element = render('<ul><li><b>${a}</b></li><li title="${b}"></li></ul>', {
        props: { a: 'first', b: 'second' },
      });

      expect(element.innerHTML).toBe('<li><b>first</b></li><li title="second"></li>');
    });

    it('replace every occurrence and allow whitespace inside braces', () => {
      expect(render('<p>${ x }-${x}-${y}</p>', { props: { x: 1, y: true } }).textContent).toBe('1-1-true');
    });

    it('are inserted as text, not HTML', () => {
      const element = render('<p>${html}</p>', { props: { html: '<b>bold</b>' } });

      expect(element.children).toHaveLength(0);
      expect(element.textContent).toBe('<b>bold</b>');
    });

    it('do not expand replacement patterns or nested placeholders', () => {
      expect(render('<p>${a}</p>', { props: { a: "$& $' ${b}", b: 'no' } }).textContent).toBe("$& $' ${b}");
    });

    it('accept falsy values', () => {
      expect(render('<p>${a}|${b}|${c}</p>', { props: { a: 0, b: '', c: false } }).textContent).toBe('0||false');
    });

    it('render missing, undefined and null values as empty strings', () => {
      const element = render('<p title="[${a}]">[${a}${b}${c}]</p>', { props: { b: undefined, c: null } });

      expect(element.outerHTML).toBe('<p title="[]">[]</p>');
    });

    it('ignore inherited properties', () => {
      expect(render('<p>[${toString}]</p>').textContent).toBe('[]');
    });

    it('leave text without placeholders alone', () => {
      expect(render('<p>$ {not} ${ } ${1x}</p>').textContent).toBe('$ {not} ${ } ${1x}');
    });
  });

  describe('slots', () => {
    it('fill the default slot with a node', () => {
      const element = render('<div class="box"><slot></slot></div>', { slots: { default: div('content') } });

      expect(element.outerHTML).toBe('<div class="box"><div>content</div><!----></div>');
    });

    it('fill a named slot with an array of nodes', () => {
      const element = render('<header><slot name="title"></slot></header>', {
        slots: { title: [div('a'), div('b')] },
      });

      expect(html(element)).toBe('<div>a</div><div>b</div>');
    });

    it('fill a slot with a string as text', () => {
      const element = render('<p><slot></slot></p>', { slots: { default: '<b>x</b>' } });

      expect(element.children).toHaveLength(0);
      expect(element.textContent).toBe('<b>x</b>');
    });

    it('fill a slot with a mix of nodes and strings', () => {
      const element = render('<p><slot></slot></p>', { slots: { default: ['a', div('b'), 'c'] } });

      expect(html(element)).toBe('a<div>b</div>c');
    });

    it('fill a slot with a live NodeList', () => {
      const source = document.createElement('div');
      source.innerHTML = '<i>1</i><i>2</i><i>3</i>';

      const element = render('<p><slot></slot></p>', { slots: { default: source.childNodes } });

      expect(html(element)).toBe('<i>1</i><i>2</i><i>3</i>');
      expect(source.childNodes).toHaveLength(0);
    });

    it('fill a slot with a DocumentFragment', () => {
      const fragment = document.createDocumentFragment();
      fragment.append(div('a'), div('b'));

      const element = render('<p><slot></slot></p>', { slots: { default: fragment } });

      expect(html(element)).toBe('<div>a</div><div>b</div>');
    });

    it('move the passed nodes rather than copying them', () => {
      const child = div('moved');

      const element = render('<p><slot></slot></p>', { slots: { default: child } });

      expect(child.parentNode).toBe(element);
    });

    it('fill several slots at once', () => {
      const element = render('<div><slot name="a"></slot>|<slot></slot>|<slot name="b"></slot></div>', {
        slots: { a: 'A', default: 'D', b: 'B' },
      });

      expect(element.textContent).toBe('A|D|B');
      expect(element.querySelector('slot')).toBeNull();
    });

    it('treat an empty name attribute as the default slot', () => {
      expect(render('<p><slot name=""></slot></p>', { slots: { default: 'x' } }).textContent).toBe('x');
    });

    it('keep fallback content when not filled', () => {
      expect(html(render('<p><slot name="icon"><i>★</i></slot></p>'))).toBe('<i>★</i>');
    });

    it('keep fallback content when explicitly undefined', () => {
      expect(html(render('<p><slot>fallback</slot></p>', { slots: { default: undefined } }))).toBe('fallback');
    });

    it('interpolate fallback content', () => {
      expect(render('<p><slot>Hi, ${name}</slot></p>', { props: { name: 'Alex' } }).textContent).toBe('Hi, Alex');
    });

    it('do not interpolate slotted content', () => {
      const element = render('<p>${name}<slot></slot></p>', {
        props: { name: 'Alex' },
        slots: { default: div('${name}') },
      });

      expect(html(element)).toBe('Alex<div>${name}</div>');
    });

    it('resolve interpolated slot names', () => {
      const element = render('<p><slot name="${slot}"></slot></p>', {
        props: { slot: 'body' },
        slots: { body: 'x' },
      });

      expect(element.textContent).toBe('x');
    });

    it('can be emptied with an empty array', () => {
      expect(html(render('<p><slot>fallback</slot></p>', { slots: { default: [] } }))).toBe('');
    });

    it('throw for content passed to an unknown slot', () => {
      expect(() => render('<p><slot></slot></p>', { slots: { title: 'x' } })).toThrow(
        new TemplateError('Unknown slot "title"'),
      );
    });

    it('throw when a slot name is declared twice', () => {
      expect(() => render('<p><slot></slot><slot></slot></p>')).toThrow(/declared more than once/);
    });

    it('throw for unsupported content', () => {
      expect(() => render('<p><slot></slot></p>', { slots: { default: 42 } })).toThrow(TypeError);
    });

    describe('on later renders', () => {
      it('replace content that was reassigned', () => {
        const Component = define(template('<div><header><slot name="title"></slot></header><slot></slot></div>'));
        const component = new Component({ slots: { title: 'Old', default: div('body') } });
        const element = component.render();
        const header = element.firstElementChild;

        component.slots.title = [div('a'), 'b'];
        component.render();

        expect(element.firstElementChild).toBe(header);
        expect(html(element)).toBe('<header><div>a</div>b</header><div>body</div>');
      });

      it('can be replaced again and again', () => {
        const Component = define(template('<p><slot></slot></p>'));
        const component = new Component();
        const element = component.render();

        for (const value of ['one', [], 'three']) {
          component.slots.default = value;
          component.render();
        }

        expect(html(element)).toBe('three');
      });

      it('bring back fallback content for undefined or delete', () => {
        const Component = define(template('<div><p><slot>Hi, ${name}</slot></p><i><slot name="x">x</slot></i></div>'));
        const component = new Component({ props: { name: 'Alex' }, slots: { default: 'custom', x: 'X' } });
        const element = component.render();

        component.slots.default = undefined;
        delete component.slots.x;
        component.props.name = 'Sam';
        component.render();

        expect(html(element)).toBe('<p>Hi, Sam</p><i>x</i>');
      });

      it('leave a slot alone while its value stays the same', () => {
        const Component = define(template('<p><slot></slot></p>'));
        const child = div('a');
        const fragment = document.createDocumentFragment();
        fragment.append(child);
        const component = new Component({ slots: { default: fragment } });
        const element = component.render();

        component.render();

        expect(child.parentNode).toBe(element);
      });

      it('do not notice an array changed in place', () => {
        const Component = define(template('<p><slot></slot></p>'));
        const items = ['a'];
        const component = new Component({ slots: { default: items } });
        const element = component.render();

        items.push('b');
        component.render();
        expect(element.textContent).toBe('a');

        component.slots.default = [...items];
        component.render();
        expect(element.textContent).toBe('ab');
      });

      it('leave nodes moved elsewhere where they are', () => {
        const Component = define(template('<p><slot></slot></p>'));
        const child = div('moved');
        const component = new Component({ slots: { default: child } });
        const element = component.render();
        const elsewhere = document.createElement('section');

        elsewhere.append(child);
        component.slots.default = 'new';
        component.render();

        expect(child.parentNode).toBe(elsewhere);
        expect(html(element)).toBe('new');
      });

      it('leave the element untouched when the update is invalid', () => {
        const Component = define(template('<p>${name}<slot></slot></p>'));
        const component = new Component({ props: { name: 'Alex' }, slots: { default: 'x' } });
        const element = component.render();

        component.props.name = 'Sam';
        component.slots.default = 'y';
        component.slots.nope = 'z';

        expect(() => component.render()).toThrow(new TemplateError('Unknown slot "nope"'));
        expect(html(element)).toBe('Alexx');
      });
    });
  });

  it('matches the documented example', () => {
    const element1 = div('one');
    const element2 = div('two');
    const Greeting = define(template(`
      <div class="greeting">
        <h1>Hello, \${name}!</h1>
        <main><slot></slot></main>
        <footer><slot name="another"></slot></footer>
      </div>
    `));

    const greeting = new Greeting({
      slots: {
        default: document.createElement('div'),
        another: [element1, element2],
      },
      props: {
        name: 'Alex',
      },
    });
    const element = greeting.render();

    expect(element.querySelector('h1').textContent).toBe('Hello, Alex!');
    expect(html(element.querySelector('main'))).toBe('<div></div>');
    expect(html(element.querySelector('footer'))).toBe('<div>one</div><div>two</div>');

    greeting.props.name = 'Sam';
    expect(greeting.render().querySelector('h1').textContent).toBe('Hello, Sam!');
  });
});
