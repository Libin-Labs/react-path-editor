import { createElement } from 'react';
import {
  PathEditor,
  createDefaultPath,
  pathToD,
  type PathEditorProps,
} from '@lp-labs/react-path-editor';

const props: PathEditorProps = {
  value: createDefaultPath(),
  onChange(next) {
    const d: string = pathToD(next);
    void d;
  },
};
createElement(PathEditor, props);
