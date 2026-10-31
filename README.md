# @lp-labs/react-path-editor

Package version: `0.1.0`.

A React editor for one SVG contour made from straight lines and cubic Bezier
segments. Drag anchors or absolute control handles, edit with the keyboard,
add/remove anchors, close the contour, and copy SVG path data. Pure typed
geometry helpers are also included. ESM, CommonJS and declarations are
provided; React 18.2 or 19 is the only peer and there are no runtime dependencies.

## Install and use

```sh
npm install @lp-labs/react-path-editor react
```

```tsx
import { useState } from "react";
import {
  PathEditor, createDefaultPath, pathToD, type PathData,
} from "@lp-labs/react-path-editor";
import "@lp-labs/react-path-editor/style.css";

export function ShapeDesigner() {
  const [path, setPath] = useState<PathData>(createDefaultPath);
  return (
    <>
      <PathEditor value={path} onChange={setPath} />
      <svg viewBox="0 0 640 360">
        <path d={pathToD(path)} fill="none" stroke="currentColor" />
      </svg>
    </>
  );
}
```

Uncontrolled usage: `<PathEditor />` or `<PathEditor defaultValue={path} />`.
Defaults are used only on mount. Do not switch controlled/uncontrolled modes
during a mount. Controlled edits propose copied data and a `d` string; rendering
waits for the parent's updated `value`. Selection can independently be controlled.

## Data model

```ts
interface Point { x: number; y: number }
interface PathAnchor extends Point {
  id: string;
  kind: "line" | "cubic";
  handleIn?: Point;
  handleOut?: Point;
}
interface PathData {
  anchors: PathAnchor[];
  closed: boolean;
}
interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

All coordinates and handles are **absolute SVG user coordinates**, not offsets.
`kind` describes the segment **arriving at** an anchor. A cubic segment uses
the previous anchor's `handleOut` and the destination's `handleIn`; an absent
handle falls back to its anchor. On an open contour the first `kind` is unused.
On a closed contour it controls the segment from the last anchor to the first.
Line segments ignore handles, but keep them for later switching to cubic.
Handles are independent; moving one does not mirror the other.

IDs are unique nonempty strings. A path has 0-1000 anchors. Every coordinate
must be finite in `[-1000000, 1000000]`. Empty paths export `""`; a single
anchor exports only `M` (and `Z` when closed).

`createDefaultPath()` returns a fresh open model:

```ts
{
  closed: false,
  anchors: [
    { id: "a", x: 80, y: 240, kind: "line", handleOut: { x: 180, y: 40 } },
    { id: "b", x: 360, y: 120, kind: "cubic", handleIn: { x: 260, y: 320 } },
    { id: "c", x: 560, y: 240, kind: "line" }
  ]
}
```

## Component API

`PathEditor(props: PathEditorProps)` is a named export.

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `value` | `PathData` | Omit for internal state |
| `defaultValue` | `PathData` | `createDefaultPath()`; initial only |
| `onChange` | `(path: PathData, d: string) => void` | Valid edit requests, not on mount; independent copy |
| `selectedId` | `string \| null` | Omit for local selection; `null` controls no selection |
| `defaultSelectedId` | `string \| null` | `null`; initial local selection |
| `onSelectionChange` | `(id: string \| null) => void` | Selection requests; not on mount |
| `viewBox` | `ViewBox` | `{ x: 0, y: 0, width: 640, height: 360 }` |
| `width` | `number \| string` | `"100%"`; SVG width attribute |
| `height` | `number \| string` | `360`; SVG height attribute |
| `keyboardStep` | `number` | `1`; finite, positive, at most 10000 |
| `disabled` | `boolean` | `false`; disables edits and SVG tab stops |
| `label` | `string` | `"Path editor"` |
| `className` | `string` | `""`; appended to root |
| `style` | `React.CSSProperties` | Optional root styles |

`Point`, `PathAnchor`, `PathData`, `ViewBox`, and `PathEditorProps` are exported
types. ViewBox dimensions must be finite, positive and at most 1000000;
its origin and far corner must be within the supported coordinate range.
Unknown selection IDs display no selection without changing the model.

### Interaction

- Click an anchor or handle to select its anchor. Enter/Space also selects it.
  Pointer-down may emit a selection request followed by a click request for the
  same ID; callbacks are requests, not deduplicated change notifications.
- Drag with the primary pointer. Anchor movement translates its existing
  handles by the same delta. Handle movement changes only that handle.
- Focus any anchor/handle and use arrows to move it by `keyboardStep`; Shift
  multiplies by ten. SVG positive Y points downward.
- Delete/Backspace on a focused anchor removes it. Handle deletion by keyboard
  is not supported. The toolbar also removes the selected anchor.
- Add anchor appends a line anchor at the viewBox center with the first unused
  `point-N` ID, selects it, and stops at 1000 anchors. It does not split a curve.
- Selected anchors have exact X/Y number inputs and an incoming segment select.
  Displayed coordinates are rounded to three decimals; model precision is kept.
- Reset handles creates/replaces both handles horizontally, using a span of
  `min(40, viewBox.width / 10)`. Set the destination's incoming kind to cubic
  to make those handles affect its preceding segment.
- Closed path toggles the closing segment. SVG output is read-only/selectable.

Global pointer listeners exist only while dragging. Only the initiating pointer
can move/end that drag. Pointer-up, pointer-cancel, Escape, window blur,
disabling, and unmounting release listeners. Escape/cancel end the drag at its
current position; they do not undo emitted edits. If an externally removed
anchor is dragged, the next move ends that drag.

The SVG uses `preserveAspectRatio="none"` so pointer coordinates map through
its bounding rectangle, including a nonzero viewBox origin and nonuniform
resizing. This may visually stretch paths. Pointer coordinates are not clamped
to the viewBox; anchors may be moved outside the visible canvas. Edits exceeding
the supported coordinate range or made with a zero-size canvas are ignored.

## Pure helpers

All helpers are named, DOM-independent exports. Model operations validate and
return independent copies; input models are not mutated.

```ts
validatePoint(point: Point): void
validateViewBox(box: ViewBox): void
validatePath(value: unknown): asserts value is PathData
clonePath(path: PathData): PathData
createDefaultPath(): PathData
pathToD(path: PathData): string

addAnchor(path: PathData, anchor: PathAnchor, index?: number): PathData
removeAnchor(path: PathData, id: string): PathData
moveAnchor(path: PathData, id: string, point: Point, moveHandles?: boolean): PathData
moveHandle(path: PathData, id: string,
           side: "handleIn" | "handleOut", point: Point): PathData
setSegmentKind(path: PathData, id: string, kind: "line" | "cubic"): PathData

linePoint(from: Point, to: Point, t: number): Point
cubicPoint(from: Point, control1: Point, control2: Point, to: Point, t: number): Point
clientToViewBox(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  viewBox: ViewBox
): Point
```

`addAnchor` defaults to appending; the insertion index must be an integer from
0 through the current count. `moveAnchor` defaults `moveHandles` to `true`;
`false` leaves handles at their existing absolute coordinates.
`moveHandle` can create a previously missing handle. `t` is finite in `[0, 1]`.
`clientToViewBox` maps client coordinates against a finite rectangle with
positive width/height, using the same nonuniform mapping as the component.

`pathToD` emits absolute `M`, `L`, `C`, `Z` commands with at most three decimal
places, without rounding stored data. A line closure uses `Z`; a cubic closure
emits the closing `C` before `Z`. This is a path-data value, not complete SVG XML.

Malformed models, duplicate IDs and unsupported segment/handle types throw
`TypeError`. Invalid coordinates, viewBoxes, geometry fractions, indices and
unknown anchor IDs throw `RangeError`. The 1000-anchor cap is reported as
`TypeError` by `validatePath`. Invalid component models/viewBox/keyboardStep
throw during render; validate external models before passing props.

Standalone geometry/export example:

```ts
import { createDefaultPath, moveAnchor, pathToD, cubicPoint } from "@lp-labs/react-path-editor";

const original = createDefaultPath();
const moved = moveAnchor(original, "b", { x: 380, y: 120 });
console.log(pathToD(moved));
console.log(cubicPoint(
  { x: 0, y: 0 }, { x: 0, y: 100 },
  { x: 100, y: 100 }, { x: 100, y: 0 }, 0.5
)); // { x: 50, y: 75 }
```

## Styles and accessibility

Import `style.css` once or supply your own scoped styling. Public CSS hooks:

```css
.my-editor {
  --lp-path-accent: #0369a1;
  --lp-path-surface: #ffffff;
  --lp-path-text: #172033;
  --lp-path-stroke: #be123c;
  max-width: 64rem;
}
```

Pass `className="my-editor"`. Classes use the `lp-path-editor` prefix with
`__canvas`, `__path`, `__guide`, `__anchor`, `__handle` and `__toolbar` elements.
Keep `touch-action: none` on the canvas if replacing CSS and using touch drag.

The canvas is a labeled group with instructions. Anchors/handles are focusable,
labeled SVG buttons, selected anchors expose pressed state, native toolbar
controls have labels, and focus is visible. Number fields offer an alternative
to dragging. SVG keyboard/screen-reader behavior varies; a browser/accessibility
audit is still appropriate for a particular application.

## Explicit scope limits

There is **no SVG path-string parser/importer**. Supply the typed model.
Only one contour is supported; output uses absolute **M, L, C, Z**.
Relative commands, multiple subpaths, **H, V, Q, T, S, A**, elliptical arcs and
quadratic curves are unsupported (including their lowercase variants).
There is no smoothing/mirrored-handle constraint, curve splitting, snapping,
pan/zoom, undo/redo, geometric bounds/length calculation, fill-rule editor or
SVG-file import/export. Closing a path does not detect intersections.
Arbitrary CSS rotation/skew transforms of the canvas are not supported by the
bounding-rectangle pointer mapping. Very small handles can be difficult touch
targets; keyboard controls are provided. No production or cross-browser
accessibility certification is claimed.

Import starts no browser work. Geometry helpers are synchronous and need no DOM,
though the root module still resolves React. There is no AbortSignal or worker
API; ending a gesture does not undo edits already emitted. Model cloning,
validation, export, and SVG rendering scan anchors/handles; the 1000-anchor cap
limits size but does not guarantee frame time during pointer updates.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
