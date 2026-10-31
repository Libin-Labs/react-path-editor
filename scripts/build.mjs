import { copyFile, mkdir, writeFile } from 'node:fs/promises';

await mkdir(new URL('../dist/cjs/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n');
await copyFile(
  new URL('../src/style.css', import.meta.url),
  new URL('../dist/style.css', import.meta.url),
);
