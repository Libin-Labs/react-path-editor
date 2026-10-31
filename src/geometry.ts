export interface Point {
  x: number;
  y: number;
}

export interface PathAnchor extends Point {
  id: string;
  /** Segment arriving at this anchor, including the closing segment. */
  kind: 'line' | 'cubic';
  handleIn?: Point;
  handleOut?: Point;
}

export interface PathData {
  anchors: PathAnchor[];
  closed: boolean;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validatePoint(point: Point): void {
  if (
    !point ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > 1e6 ||
    Math.abs(point.y) > 1e6
  ) {
    throw new RangeError('Coordinates must be finite and between -1000000 and 1000000.');
  }
}

export function validateViewBox(box: ViewBox): void {
  validatePoint(box);
  if (
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.width > 1e6 ||
    box.height > 1e6
  ) {
    throw new RangeError('ViewBox dimensions must be positive and at most 1000000.');
  }
  validatePoint({ x: box.x + box.width, y: box.y + box.height });
}

export function validatePath(value: unknown): asserts value is PathData {
  if (!value || typeof value !== 'object') throw new TypeError('Expected path data.');
  const path = value as PathData;
  if (
    typeof path.closed !== 'boolean' ||
    !Array.isArray(path.anchors) ||
    path.anchors.length > 1000
  ) {
    throw new TypeError('Expected closed boolean and up to 1000 anchors.');
  }
  const ids = new Set<string>();
  for (const anchor of path.anchors) {
    validatePoint(anchor);
    if (typeof anchor.id !== 'string' || !anchor.id || ids.has(anchor.id))
      throw new TypeError('Anchor IDs must be unique and nonempty.');
    ids.add(anchor.id);
    if (anchor.kind !== 'line' && anchor.kind !== 'cubic')
      throw new TypeError('Only line and cubic segments are supported.');
    if (anchor.handleIn !== undefined) validatePoint(anchor.handleIn);
    if (anchor.handleOut !== undefined) validatePoint(anchor.handleOut);
  }
}

export function clonePath(path: PathData): PathData {
  validatePath(path);
  return {
    closed: path.closed,
    anchors: path.anchors.map((anchor) => ({
      ...anchor,
      ...(anchor.handleIn ? { handleIn: { ...anchor.handleIn } } : {}),
      ...(anchor.handleOut ? { handleOut: { ...anchor.handleOut } } : {}),
    })),
  };
}

export function createDefaultPath(): PathData {
  return {
    closed: false,
    anchors: [
      { id: 'a', x: 80, y: 240, kind: 'line', handleOut: { x: 180, y: 40 } },
      { id: 'b', x: 360, y: 120, kind: 'cubic', handleIn: { x: 260, y: 320 } },
      { id: 'c', x: 560, y: 240, kind: 'line' },
    ],
  };
}

function find(path: PathData, id: string): PathAnchor {
  const anchor = path.anchors.find((entry) => entry.id === id);
  if (!anchor) throw new RangeError('Unknown anchor ID.');
  return anchor;
}

export function addAnchor(
  path: PathData,
  anchor: PathAnchor,
  index = path.anchors.length,
): PathData {
  const next = clonePath(path);
  if (!Number.isInteger(index) || index < 0 || index > next.anchors.length)
    throw new RangeError('Invalid insertion index.');
  next.anchors.splice(index, 0, {
    ...anchor,
    ...(anchor.handleIn ? { handleIn: { ...anchor.handleIn } } : {}),
    ...(anchor.handleOut ? { handleOut: { ...anchor.handleOut } } : {}),
  });
  validatePath(next);
  return next;
}

export function removeAnchor(path: PathData, id: string): PathData {
  const next = clonePath(path);
  find(next, id);
  next.anchors = next.anchors.filter((anchor) => anchor.id !== id);
  return next;
}

export function moveAnchor(path: PathData, id: string, point: Point, moveHandles = true): PathData {
  validatePoint(point);
  const next = clonePath(path);
  const anchor = find(next, id);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  if (moveHandles) {
    for (const side of ['handleIn', 'handleOut'] as const) {
      const handle = anchor[side];
      if (handle) anchor[side] = { x: handle.x + dx, y: handle.y + dy };
    }
  }
  anchor.x = point.x;
  anchor.y = point.y;
  validatePath(next);
  return next;
}

export function moveHandle(
  path: PathData,
  id: string,
  side: 'handleIn' | 'handleOut',
  point: Point,
): PathData {
  validatePoint(point);
  if (side !== 'handleIn' && side !== 'handleOut') throw new TypeError('Unknown handle side.');
  const next = clonePath(path);
  find(next, id)[side] = { ...point };
  return next;
}

export function setSegmentKind(path: PathData, id: string, kind: 'line' | 'cubic'): PathData {
  const next = clonePath(path);
  find(next, id).kind = kind;
  validatePath(next);
  return next;
}

function fraction(t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('t must be from 0 to 1.');
}

export function linePoint(from: Point, to: Point, t: number): Point {
  validatePoint(from);
  validatePoint(to);
  fraction(t);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

export function cubicPoint(
  from: Point,
  control1: Point,
  control2: Point,
  to: Point,
  t: number,
): Point {
  [from, control1, control2, to].forEach(validatePoint);
  fraction(t);
  const u = 1 - t;
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * to.y,
  };
}

export function clientToViewBox(
  client: Point,
  rect: { left: number; top: number; width: number; height: number },
  viewBox: ViewBox,
): Point {
  validatePoint(client);
  validateViewBox(viewBox);
  if (
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    throw new RangeError('Canvas rectangle must have finite positive dimensions.');
  }
  const point = {
    x: viewBox.x + ((client.x - rect.left) / rect.width) * viewBox.width,
    y: viewBox.y + ((client.y - rect.top) / rect.height) * viewBox.height,
  };
  validatePoint(point);
  return point;
}

export function pathToD(path: PathData): string {
  validatePath(path);
  if (!path.anchors.length) return '';
  const n = (value: number) => String(Number(value.toFixed(3)));
  const xy = (point: Point) => `${n(point.x)} ${n(point.y)}`;
  const first = path.anchors[0];
  const commands = [`M ${xy(first)}`];
  function segment(from: PathAnchor, to: PathAnchor) {
    commands.push(
      to.kind === 'cubic'
        ? `C ${xy(from.handleOut ?? from)} ${xy(to.handleIn ?? to)} ${xy(to)}`
        : `L ${xy(to)}`,
    );
  }
  for (let i = 1; i < path.anchors.length; i += 1) segment(path.anchors[i - 1], path.anchors[i]);
  if (path.closed) {
    if (path.anchors.length > 1 && first.kind === 'cubic')
      segment(path.anchors[path.anchors.length - 1], first);
    commands.push('Z');
  }
  return commands.join(' ');
}
