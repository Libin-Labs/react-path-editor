import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  addAnchor,
  clientToViewBox,
  clonePath,
  createDefaultPath,
  moveAnchor,
  moveHandle,
  pathToD,
  removeAnchor,
  setSegmentKind,
  validatePath,
  validateViewBox,
  type PathData,
  type PathAnchor,
  type Point,
  type ViewBox,
} from './geometry.js';

export interface PathEditorProps {
  value?: PathData;
  defaultValue?: PathData;
  onChange?: (path: PathData, d: string) => void;
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelectionChange?: (id: string | null) => void;
  viewBox?: ViewBox;
  width?: number | string;
  height?: number | string;
  keyboardStep?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

type Target = 'anchor' | 'handleIn' | 'handleOut';
interface Drag {
  id: string;
  target: Target;
  pointerId: number;
  offset: Point;
}

const defaultBox: ViewBox = { x: 0, y: 0, width: 640, height: 360 };

export function PathEditor({
  value,
  defaultValue,
  onChange,
  selectedId,
  defaultSelectedId = null,
  onSelectionChange,
  viewBox = defaultBox,
  width = '100%',
  height = 360,
  keyboardStep = 1,
  disabled = false,
  label = 'Path editor',
  className = '',
  style,
}: PathEditorProps) {
  const [internal, setInternal] = useState(() => clonePath(defaultValue ?? createDefaultPath()));
  const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelectedId);
  const [drag, setDrag] = useState<Drag | null>(null);
  const path = value ?? internal;
  validatePath(path);
  validateViewBox(viewBox);
  if (!Number.isFinite(keyboardStep) || keyboardStep <= 0 || keyboardStep > 10000) {
    throw new RangeError('keyboardStep must be positive and at most 10000.');
  }
  const selection = selectedId === undefined ? internalSelected : selectedId;
  const selected = path.anchors.find((anchor) => anchor.id === selection);
  const svgRef = useRef<SVGSVGElement>(null);
  const instructions = useId();
  const latest = useRef({ path, value, onChange, viewBox, disabled });
  latest.current = { path, value, onChange, viewBox, disabled };

  function change(next: PathData) {
    if (disabled) return;
    if (value === undefined) setInternal(clonePath(next));
    onChange?.(clonePath(next), pathToD(next));
  }

  function select(id: string | null) {
    if (disabled) return;
    if (selectedId === undefined) setInternalSelected(id);
    onSelectionChange?.(id);
  }

  useEffect(() => {
    if (!drag) return;
    if (disabled) {
      setDrag(null);
      return;
    }
    function move(event: globalThis.PointerEvent) {
      if (event.pointerId !== drag!.pointerId) return;
      const current = latest.current;
      const svg = svgRef.current;
      if (
        !svg ||
        current.disabled ||
        !current.path.anchors.some((anchor) => anchor.id === drag!.id)
      ) {
        setDrag(null);
        return;
      }
      event.preventDefault();
      try {
        const point = clientToViewBox(
          { x: event.clientX, y: event.clientY },
          svg.getBoundingClientRect(),
          current.viewBox,
        );
        point.x += drag!.offset.x;
        point.y += drag!.offset.y;
        const next =
          drag!.target === 'anchor'
            ? moveAnchor(current.path, drag!.id, point)
            : moveHandle(current.path, drag!.id, drag!.target, point);
        if (current.value === undefined) setInternal(clonePath(next));
        current.onChange?.(clonePath(next), pathToD(next));
      } catch (reason) {
        if (!(reason instanceof RangeError)) throw reason;
      }
    }
    function end(event: globalThis.PointerEvent) {
      if (event.pointerId === drag!.pointerId) setDrag(null);
    }
    function cancel() {
      setDrag(null);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') cancel();
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, [drag, disabled]);

  function start(event: PointerEvent<SVGCircleElement>, anchor: PathAnchor, target: Target) {
    if (disabled || event.button !== 0 || drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    event.preventDefault();
    event.currentTarget.focus();
    select(anchor.id);
    const point = target === 'anchor' ? anchor : anchor[target];
    if (!point) return;
    try {
      const cursor = clientToViewBox(
        { x: event.clientX, y: event.clientY },
        svg.getBoundingClientRect(),
        viewBox,
      );
      setDrag({
        id: anchor.id,
        target,
        pointerId: event.pointerId,
        offset: { x: point.x - cursor.x, y: point.y - cursor.y },
      });
    } catch (reason) {
      if (!(reason instanceof RangeError)) throw reason;
    }
  }

  function key(event: KeyboardEvent<SVGCircleElement>, anchor: PathAnchor, target: Target) {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(anchor.id);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && target === 'anchor') {
      event.preventDefault();
      change(removeAnchor(path, anchor.id));
      select(null);
      return;
    }
    const vectors: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const vector = vectors[event.key];
    if (!vector) return;
    event.preventDefault();
    const current = target === 'anchor' ? anchor : anchor[target];
    if (!current) return;
    const delta = keyboardStep * (event.shiftKey ? 10 : 1);
    const point = { x: current.x + vector.x * delta, y: current.y + vector.y * delta };
    try {
      change(
        target === 'anchor'
          ? moveAnchor(path, anchor.id, point)
          : moveHandle(path, anchor.id, target, point),
      );
    } catch (reason) {
      if (!(reason instanceof RangeError)) throw reason;
    }
  }

  return (
    <fieldset className={`lp-path-editor ${className}`} style={style} disabled={disabled}>
      <legend>{label}</legend>
      <p id={instructions}>
        Select an anchor or handle. Drag to move, or use arrow keys; Shift moves 10 steps. Delete
        removes an anchor. Escape ends a drag.
      </p>
      <svg
        ref={svgRef}
        role="group"
        aria-label="Path canvas"
        aria-describedby={instructions}
        width={width}
        height={height}
        preserveAspectRatio="none"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="lp-path-editor__canvas"
      >
        <path d={pathToD(path)} className="lp-path-editor__path" />
        {path.anchors.map((anchor, index) => (
          <g key={anchor.id}>
            {(['handleIn', 'handleOut'] as const).map(
              (side) =>
                anchor[side] && (
                  <g key={side}>
                    <line
                      x1={anchor.x}
                      y1={anchor.y}
                      x2={anchor[side]!.x}
                      y2={anchor[side]!.y}
                      className="lp-path-editor__guide"
                    />
                    <circle
                      cx={anchor[side]!.x}
                      cy={anchor[side]!.y}
                      r={5}
                      role="button"
                      aria-label={`Anchor ${index + 1} ${side === 'handleIn' ? 'incoming' : 'outgoing'} handle`}
                      aria-disabled={disabled}
                      tabIndex={disabled ? -1 : 0}
                      className="lp-path-editor__handle"
                      onPointerDown={(event) => start(event, anchor, side)}
                      onClick={() => select(anchor.id)}
                      onKeyDown={(event) => key(event, anchor, side)}
                    />
                  </g>
                ),
            )}
            <circle
              cx={anchor.x}
              cy={anchor.y}
              r={7}
              role="button"
              aria-label={`Anchor ${index + 1}`}
              aria-pressed={selected?.id === anchor.id}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              className="lp-path-editor__anchor"
              onPointerDown={(event) => start(event, anchor, 'anchor')}
              onClick={() => select(anchor.id)}
              onKeyDown={(event) => key(event, anchor, 'anchor')}
            />
          </g>
        ))}
      </svg>
      <div className="lp-path-editor__toolbar">
        <button
          type="button"
          disabled={disabled || path.anchors.length >= 1000}
          onClick={() => {
            let n = 1;
            while (path.anchors.some((anchor) => anchor.id === `point-${n}`)) n += 1;
            const anchor: PathAnchor = {
              id: `point-${n}`,
              x: viewBox.x + viewBox.width / 2,
              y: viewBox.y + viewBox.height / 2,
              kind: 'line',
            };
            change(addAnchor(path, anchor));
            select(anchor.id);
          }}
        >
          Add anchor
        </button>
        <button
          type="button"
          disabled={disabled || !selected}
          onClick={() => {
            if (selected) {
              change(removeAnchor(path, selected.id));
              select(null);
            }
          }}
        >
          Remove anchor
        </button>
        <label>
          <input
            type="checkbox"
            checked={path.closed}
            onChange={(event) => change({ ...path, closed: event.target.checked })}
          />
          Closed path
        </label>
      </div>
      {selected && (
        <div className="lp-path-editor__toolbar">
          {(['x', 'y'] as const).map((coordinate) => (
            <label key={coordinate}>
              Anchor {coordinate.toUpperCase()}
              <input
                type="number"
                step={keyboardStep}
                min={-1e6}
                max={1e6}
                value={Number(selected[coordinate].toFixed(3))}
                onChange={(event) => {
                  const n = event.target.valueAsNumber;
                  if (Number.isFinite(n) && Math.abs(n) <= 1e6) {
                    try {
                      change(moveAnchor(path, selected.id, { ...selected, [coordinate]: n }));
                    } catch (reason) {
                      if (!(reason instanceof RangeError)) throw reason;
                    }
                  }
                }}
              />
            </label>
          ))}
          <label>
            Incoming segment
            <select
              value={selected.kind}
              onChange={(event) =>
                change(setSegmentKind(path, selected.id, event.target.value as PathAnchor['kind']))
              }
            >
              <option value="line">Line</option>
              <option value="cubic">Cubic</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const span = Math.min(40, viewBox.width / 10);
              try {
                const next = moveHandle(path, selected.id, 'handleIn', {
                  x: selected.x - span,
                  y: selected.y,
                });
                change(
                  moveHandle(next, selected.id, 'handleOut', {
                    x: selected.x + span,
                    y: selected.y,
                  }),
                );
              } catch (reason) {
                if (!(reason instanceof RangeError)) throw reason;
              }
            }}
          >
            Reset handles
          </button>
        </div>
      )}
      <label>
        SVG path data
        <textarea readOnly rows={3} value={pathToD(path)} />
      </label>
    </fieldset>
  );
}
