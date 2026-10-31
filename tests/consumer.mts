import { createElement } from 'react';
import {
  PathEditor,
  createDefaultPath,
  cubicPoint,
  type PathEditorProps,
  type Point,
} from '@lp-labs/react-path-editor';

const props: PathEditorProps = {
  value: createDefaultPath(),
  onChange(path, d) {
    const result: number = path.anchors.length + d.length;
    void result;
  },
};
createElement(PathEditor, props);
const point: Point = cubicPoint(
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 2, y: 2 },
  { x: 3, y: 3 },
  0.5,
);
// @ts-expect-error Coordinates are numeric.
const bad: Point = { x: '0', y: 0 };
void bad;
void point;
