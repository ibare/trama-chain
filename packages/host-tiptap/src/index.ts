import './styles.css';

export { TramaExtension, TRAMA_NODE_NAME } from './node.js';
export { createTramaNodeView } from './node-view.js';
export { mountTramaEditor } from './mount.js';
export type { TramaMountOptions, TramaMountHandle } from './mount.js';
export { bootstrapTrama } from './bootstrap.js';
export {
  TRAMA_FENCE_LANG,
  TRAMA_FENCE_RE,
  renderTramaFenceHTML,
  renderTramaFenceMeta,
  parseTramaFenceMeta,
  tramaNodeToMarkdown,
} from './markdown.js';
export type { TramaFenceMeta } from './markdown.js';
