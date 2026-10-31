import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import * as api from '../dist/esm/index.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
class PointerEvent extends dom.window.MouseEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
  }
}
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  PointerEvent,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.PointerEvent = PointerEvent;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = await import('react-dom/client');
const roots = new Set();
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});
function mount(props = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  const render = (next) => act(() => root.render(createElement(api.PathEditor, next)));
  render(props);
  const svg = container.querySelector('svg');
  svg.getBoundingClientRect = () => ({ left: 10, top: 20, width: 320, height: 180 });
  const unmount = () => {
    act(() => root.unmount());
    roots.delete(root);
  };
  return { container, svg, render, unmount };
}
function pointer(target, type, x = 50, y = 140, pointerId = 1) {
  act(() =>
    target.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        pointerId,
        button: 0,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
function key(target, name, shiftKey = false) {
  act(() =>
    target.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: name,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
function click(container, text) {
  act(() =>
    [...container.querySelectorAll('button')].find((button) => button.textContent === text).click(),
  );
}

test('SVG export supports lines, cubics, closing segments and empty paths without mutation', () => {
  const path = api.createDefaultPath();
  assert.equal(api.pathToD(path), 'M 80 240 C 180 40 260 320 360 120 L 560 240');
  path.closed = true;
  assert.match(api.pathToD(path), /L 560 240 Z$/);
  path.anchors[0].kind = 'cubic';
  path.anchors[0].handleIn = { x: 50, y: 200 };
  assert.match(api.pathToD(path), /C 560 240 50 200 80 240 Z$/);
  assert.equal(api.pathToD({ anchors: [], closed: false }), '');
  const missingHandles = {
    anchors: [
      { id: 'x', x: 0, y: 0, kind: 'line' },
      { id: 'y', x: 10, y: 10, kind: 'cubic' },
    ],
    closed: false,
  };
  assert.equal(api.pathToD(missingHandles), 'M 0 0 C 0 0 10 10 10 10');
});

test('line and cubic geometry have correct endpoints and midpoint', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 100 };
  assert.deepEqual(api.linePoint(a, b, 0.5), { x: 50, y: 50 });
  assert.deepEqual(api.cubicPoint(a, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }, 0.5), {
    x: 50,
    y: 75,
  });
  assert.deepEqual(api.cubicPoint(a, a, b, b, 0), a);
  assert.deepEqual(api.cubicPoint(a, a, b, b, 1), b);
  assert.throws(() => api.linePoint(a, b, -0.1), RangeError);
  assert.throws(() => api.cubicPoint(a, a, b, b, NaN), RangeError);
});

test('immutable anchor and handle operations preserve geometry and enforce invariants', () => {
  const path = api.createDefaultPath();
  const moved = api.moveAnchor(path, 'a', { x: 90, y: 250 });
  assert.equal(path.anchors[0].x, 80);
  assert.deepEqual(moved.anchors[0].handleOut, { x: 190, y: 50 });
  assert.deepEqual(api.moveAnchor(path, 'a', { x: 90, y: 250 }, false).anchors[0].handleOut, {
    x: 180,
    y: 40,
  });
  const handled = api.moveHandle(path, 'a', 'handleIn', { x: 10, y: 20 });
  assert.deepEqual(handled.anchors[0].handleIn, { x: 10, y: 20 });
  assert.equal(path.anchors[0].handleIn, undefined);
  const added = api.addAnchor(path, { id: 'd', x: 1, y: 2, kind: 'line' }, 1);
  assert.equal(added.anchors[1].id, 'd');
  assert.equal(api.removeAnchor(added, 'd').anchors.length, 3);
  assert.equal(api.setSegmentKind(path, 'c', 'cubic').anchors[2].kind, 'cubic');
  assert.throws(() => api.addAnchor(path, path.anchors[0]), TypeError);
  assert.throws(() => api.addAnchor(path, { id: 'd', x: 1, y: 2, kind: 'line' }, 5), RangeError);
  assert.throws(() => api.moveAnchor(path, 'missing', { x: 1, y: 2 }), RangeError);
  assert.throws(() => api.moveHandle(path, 'a', 'wrong', { x: 1, y: 2 }), TypeError);
  assert.throws(() =>
    api.validatePath({ anchors: [{ id: 'a', x: Infinity, y: 0, kind: 'line' }], closed: false }),
  );
  assert.throws(() =>
    api.validatePath({ anchors: [{ id: 'a', x: 0, y: 0, kind: 'arc' }], closed: false }),
  );
});

test('pointer coordinate conversion handles viewBox offset and nonuniform scaling', () => {
  assert.deepEqual(
    api.clientToViewBox(
      { x: 110, y: 70 },
      { left: 10, top: 20, width: 200, height: 100 },
      { x: -50, y: -25, width: 400, height: 100 },
    ),
    { x: 150, y: 25 },
  );
  assert.throws(
    () =>
      api.clientToViewBox(
        { x: 0, y: 0 },
        { left: 0, top: 0, width: 0, height: 1 },
        { x: 0, y: 0, width: 1, height: 1 },
      ),
    RangeError,
  );
  assert.throws(() => api.validateViewBox({ x: 0, y: 0, width: -1, height: 1 }), RangeError);
});

test('keyboard selection, anchor and handle movement, add/remove and SVG output work', () => {
  const changes = [];
  const selections = [];
  const { container } = mount({
    onChange: (path, d) => changes.push({ path, d }),
    onSelectionChange: (id) => selections.push(id),
  });
  const anchor = container.querySelector('[aria-label="Anchor 1"]');
  key(anchor, 'Enter');
  assert.equal(selections.at(-1), 'a');
  assert.equal(anchor.getAttribute('aria-pressed'), 'true');
  key(anchor, 'ArrowRight');
  assert.equal(changes.at(-1).path.anchors[0].x, 81);
  key(anchor, 'ArrowUp', true);
  assert.equal(changes.at(-1).path.anchors[0].y, 230);
  const handle = container.querySelector('[aria-label="Anchor 1 outgoing handle"]');
  key(handle, 'ArrowDown');
  assert.equal(changes.at(-1).path.anchors[0].handleOut.y, 31);
  click(container, 'Add anchor');
  assert.equal(changes.at(-1).path.anchors.length, 4);
  assert.match(changes.at(-1).d, /L 320 180$/);
  click(container, 'Remove anchor');
  assert.equal(changes.at(-1).path.anchors.length, 3);
  key(anchor, 'Delete');
  assert.equal(changes.at(-1).path.anchors.length, 2);
});

test('pointer dragging uses canvas coordinates, translates handles and ignores other pointers', () => {
  const changes = [];
  const { container } = mount({ onChange: (path) => changes.push(path) });
  const anchor = container.querySelector('[aria-label="Anchor 1"]');
  pointer(anchor, 'pointerdown');
  pointer(window, 'pointermove', 60, 150, 2);
  assert.equal(changes.length, 0);
  pointer(window, 'pointermove', 60, 150);
  assert.equal(changes.at(-1).anchors[0].x, 100);
  assert.equal(changes.at(-1).anchors[0].y, 260);
  assert.deepEqual(changes.at(-1).anchors[0].handleOut, { x: 200, y: 60 });
  pointer(window, 'pointerup', 60, 150, 2);
  pointer(window, 'pointermove', 65, 155);
  assert.equal(changes.at(-1).anchors[0].x, 110);
  pointer(window, 'pointerup', 65, 155);
  const count = changes.length;
  pointer(window, 'pointermove', 80, 160);
  assert.equal(changes.length, count);
  const handle = container.querySelector('[aria-label="Anchor 1 outgoing handle"]');
  pointer(handle, 'pointerdown', 115, 55);
  pointer(window, 'pointermove', 120, 60);
  assert.deepEqual(changes.at(-1).anchors[0].handleOut, { x: 220, y: 80 });
  pointer(window, 'pointercancel');
  const afterCancel = changes.length;
  pointer(window, 'pointermove', 130, 70);
  assert.equal(changes.length, afterCancel);
});

test('pointer listeners are cleaned on Escape, blur, disabled transitions and unmount', () => {
  const active = new Map();
  const types = ['pointermove', 'pointerup', 'pointercancel', 'blur', 'keydown'];
  const add = window.addEventListener;
  const remove = window.removeEventListener;
  window.addEventListener = function (type, callback, options) {
    if (types.includes(type)) active.set(type, callback);
    return add.call(this, type, callback, options);
  };
  window.removeEventListener = function (type, callback, options) {
    active.delete(type);
    return remove.call(this, type, callback, options);
  };
  try {
    let calls = 0;
    const props = { onChange: () => calls++ };
    const { container, render, unmount } = mount(props);
    const anchor = container.querySelector('[aria-label="Anchor 1"]');
    pointer(anchor, 'pointerdown');
    assert.equal(active.size, 5);
    key(window, 'Escape');
    assert.equal(active.size, 0);
    pointer(anchor, 'pointerdown');
    act(() => window.dispatchEvent(new dom.window.Event('blur')));
    assert.equal(active.size, 0);
    pointer(anchor, 'pointerdown');
    render({ ...props, disabled: true });
    assert.equal(active.size, 0);
    pointer(window, 'pointermove', 70, 160);
    key(anchor, 'ArrowRight');
    assert.equal(calls, 0);
    render(props);
    pointer(anchor, 'pointerdown');
    assert.equal(active.size, 5);
    unmount();
    assert.equal(active.size, 0);
    pointer(window, 'pointermove', 80, 170);
    assert.equal(calls, 0);
  } finally {
    window.addEventListener = add;
    window.removeEventListener = remove;
  }
});

test('controlled path and controlled selection emit proposals but wait for parent props', () => {
  const value = api.createDefaultPath();
  let proposal;
  let selection;
  const props = {
    value,
    selectedId: null,
    onChange: (path) => {
      proposal = path;
    },
    onSelectionChange: (id) => {
      selection = id;
    },
  };
  const { container, render } = mount(props);
  const anchor = container.querySelector('[aria-label="Anchor 1"]');
  key(anchor, 'Enter');
  assert.equal(selection, 'a');
  assert.equal(anchor.getAttribute('aria-pressed'), 'false');
  key(anchor, 'ArrowRight');
  assert.equal(proposal.anchors[0].x, 81);
  assert.equal(value.anchors[0].x, 80);
  assert.equal(anchor.getAttribute('cx'), '80');
  render({ ...props, value: proposal, selectedId: selection });
  assert.equal(anchor.getAttribute('cx'), '81');
  assert.equal(anchor.getAttribute('aria-pressed'), 'true');
});

test('ESM and CJS exports match', () => {
  const cjs = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(api).sort());
  assert.equal(cjs.pathToD(cjs.createDefaultPath()), api.pathToD(api.createDefaultPath()));
});
