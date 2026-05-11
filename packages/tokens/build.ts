import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'src', 'tokens.json');
const OUT_DIR = join(here, 'dist');
const OUT_TS = join(OUT_DIR, 'tokens.ts');
const OUT_JS = join(OUT_DIR, 'tokens.js');
const OUT_DTS = join(OUT_DIR, 'tokens.d.ts');
const OUT_CSS = join(OUT_DIR, 'tokens.scoped.css');

type Primitive = string | number;
type TokenTree = { [key: string]: Primitive | TokenTree };

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function flattenForCss(tree: TokenTree, prefix: string[] = []): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = [...prefix, kebab(k)];
    if (typeof v === 'object' && v !== null) {
      out.push(...flattenForCss(v as TokenTree, path));
    } else {
      out.push([`--${path.join('-')}`, String(v)]);
    }
  }
  return out;
}

function renderTsLiteral(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map(v => renderTsLiteral(v, indent + 1)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const body = entries
      .map(([k, v]) => `${padInner}${JSON.stringify(k)}: ${renderTsLiteral(v, indent + 1)}`)
      .join(',\n');
    return `{\n${body},\n${pad}}`;
  }
  return 'undefined';
}

function main(): void {
  const raw = readFileSync(SRC, 'utf8');
  const data = JSON.parse(raw) as TokenTree;

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const tsBody = renderTsLiteral(data, 0);

  const tsSource = `// Auto-generated from src/tokens.json. Do not edit by hand.
export const tokens = ${tsBody} as const;

export type Tokens = typeof tokens;
`;
  writeFileSync(OUT_TS, tsSource, 'utf8');

  // Plain JS (ESM) for runtime consumers; TS code re-exports the type via .d.ts.
  const jsSource = `// Auto-generated from src/tokens.json. Do not edit by hand.
export const tokens = ${JSON.stringify(data, null, 2)};
`;
  writeFileSync(OUT_JS, jsSource, 'utf8');

  const dtsSource = `// Auto-generated from src/tokens.json. Do not edit by hand.
export declare const tokens: ${renderDtsType(data)};

export type Tokens = typeof tokens;
`;
  writeFileSync(OUT_DTS, dtsSource, 'utf8');

  const cssEntries = flattenForCss(data);
  const css =
    '/* Auto-generated from src/tokens.json. Do not edit by hand. */\n' +
    '[data-trama-root] {\n' +
    cssEntries.map(([k, v]) => `  ${k}: ${v};`).join('\n') +
    '\n}\n';
  writeFileSync(OUT_CSS, css, 'utf8');

  // eslint-disable-next-line no-console
  console.log(
    `tokens: wrote ${cssEntries.length} CSS vars, TS const with ${Object.keys(data).length} top-level families`,
  );
}

function renderDtsType(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `readonly [${value.map(renderDtsType).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const body = entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${renderDtsType(v)}`).join(';\n');
    return `{\n${body};\n}`;
  }
  return 'unknown';
}

main();
