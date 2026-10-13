import { define } from 'tagshift';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Briefly highlights the elements that the given mutation records touched,
 * so in-place updates are visible. Uses the Web Animations API rather than a
 * class, because a class change would itself be a mutation of an attribute
 * that tagshift renders.
 */
function flash(records, root) {
  if (reducedMotion.matches) return;

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const touched = new Set();

  for (const record of records) {
    const element = record.type === 'characterData' ? record.target.parentElement : record.target;
    if (element && element !== root) touched.add(element);
  }

  // An outline, unlike a background, never hides what the element paints.
  for (const element of touched) {
    element.animate(
      [
        { outline: `2px solid ${accent}`, outlineOffset: '2px' },
        { outline: '2px solid transparent', outlineOffset: '2px' },
      ],
      { duration: 900, easing: 'ease-out' },
    );
  }
}

function watch(root) {
  const observer = new MutationObserver((records) => flash(records, root));
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  return observer;
}

// Copy buttons

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    await navigator.clipboard.writeText(text);

    button.dataset.copied = '';
    button.setAttribute('aria-label', 'Copied');
    button.querySelector('use').setAttribute('href', '#i-check');

    setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute('aria-label', 'Copy install command');
      button.querySelector('use').setAttribute('href', '#i-copy');
    }, 1500);
  });
}

// Live demo: a random walk per metric, rendered every second.

const StatTile = define(document.getElementById('stat-tile'));
const tiles = document.getElementById('tiles');

const metrics = [
  { label: 'CPU', unit: '%', value: 35, min: 0, max: 100, step: 12 },
  { label: 'Memory', unit: '%', value: 62, min: 0, max: 100, step: 4 },
  { label: 'Requests', unit: '/s', value: 480, min: 0, max: 1000, step: 90 },
  { label: 'Latency', unit: 'ms', value: 120, min: 20, max: 400, step: 35 },
];

for (const metric of metrics) {
  metric.tile = new StatTile({ props: { label: metric.label, unit: metric.unit } });
}

function tick() {
  for (const metric of metrics) {
    const previous = metric.value;
    const next = previous + (Math.random() - 0.5) * 2 * metric.step;
    metric.value = Math.round(Math.min(metric.max, Math.max(metric.min, next)));

    const delta = metric.value - previous;
    Object.assign(metric.tile.props, {
      value: metric.value,
      delta: `${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`,
      trend: delta >= 0 ? 'up' : 'down',
      scale: ((metric.value - metric.min) / (metric.max - metric.min)).toFixed(3),
    });
    metric.tile.render();
  }
}

tick();
tiles.append(...metrics.map((metric) => metric.tile.render()));
watch(tiles);

// Ticking while nobody can see the tiles would only burn battery.
let timer = null;
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && !timer) {
    timer = setInterval(tick, 1000);
  } else if (!entry.isIntersecting && timer) {
    clearInterval(timer);
    timer = null;
  }
}).observe(tiles);

// Playground

const templateInput = document.getElementById('template-input');
const propsInput = document.getElementById('props-input');
const slotsInput = document.getElementById('slots-input');
const preview = document.getElementById('preview');
const status = document.getElementById('status');
const htmlOutput = document.getElementById('html-output');

const writes = new MutationObserver((records) => flash(records, preview));
writes.observe(preview, { subtree: true, childList: true, attributes: true, characterData: true });

let component = null;
let source = null;
let slotSources = {};

class InputError extends Error {
  constructor(input, message) {
    super(message);
    this.input = input;
  }
}

function parseObject(input, label) {
  let value;
  try {
    value = JSON.parse(input.value || '{}');
  } catch (error) {
    throw new InputError(input, `${label}: ${error.message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InputError(input, `${label}: expected a JSON object`);
  }
  return value;
}

function fragment(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

function setStatus(message, isError) {
  status.textContent = message;
  if (isError) {
    status.dataset.error = '';
  } else {
    delete status.dataset.error;
  }
}

function update() {
  for (const input of [templateInput, propsInput, slotsInput]) input.removeAttribute('aria-invalid');

  try {
    const props = parseObject(propsInput, 'Props');
    const slots = parseObject(slotsInput, 'Slots');
    let built = false;

    if (templateInput.value !== source) {
      const template = document.createElement('template');
      template.innerHTML = templateInput.value;
      try {
        component = new (define(template))();
      } catch (error) {
        throw new InputError(templateInput, error.message);
      }
      source = templateInput.value;
      slotSources = {};
      built = true;
    }

    component.props = props;

    // Reassign only the slots whose HTML changed, so the rest keep their
    // nodes and render() leaves them alone.
    for (const name of Object.keys(slotSources)) {
      if (!Object.hasOwn(slots, name)) {
        delete component.slots[name];
        delete slotSources[name];
      }
    }
    for (const [name, html] of Object.entries(slots)) {
      if (slotSources[name] !== html) {
        component.slots[name] = fragment(String(html));
        slotSources[name] = html;
      }
    }

    writes.takeRecords();
    const element = component.render();
    const records = writes.takeRecords();
    flash(records, preview);

    if (preview.firstElementChild !== element) {
      preview.replaceChildren(element);
      writes.takeRecords();
    }

    htmlOutput.textContent = element.outerHTML.replaceAll('<!---->', '');

    if (built) {
      setStatus('Built a new element from the template.', false);
    } else {
      const count = records.length;
      setStatus(count ? `Updated in place: ${count} DOM ${count === 1 ? 'write' : 'writes'}.` : 'Nothing changed.', false);
    }
  } catch (error) {
    if (error instanceof InputError) error.input.setAttribute('aria-invalid', 'true');
    setStatus(error.message, true);
  }
}

let pending = null;
for (const input of [templateInput, propsInput, slotsInput]) {
  input.addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(update, 150);
  });
}

update();
