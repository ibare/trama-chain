// @ts-check
/**
 * @trama-chain/static-projector — rollup 설정.
 *
 * 정책:
 *  - 단일 ESM entry (static-projector.js) + 자동 chunk 추론.
 *  - external: react — 호스트 단일 인스턴스.
 *  - manualChunks: projector-static / trama-core 두 청크로 분리.
 *    bundle visualizer로 사이즈 회귀 점검 가능.
 *  - CSS: projector-static의 styles.css는 `@import '@trama-chain/tokens/css'`를 포함한다.
 *    rollup-plugin-postcss + postcss-import로 펼친 뒤 `inject: true`로 번들 import
 *    시점에 head에 `<style>` 1회 삽입. trama-* prefix가 셀렉터에 깔려 있어
 *    호스트 전역과 충돌 위험 낮음.
 *  - .d.ts는 별도 패스(rollup-plugin-dts)로 단일 dist/static-projector.d.ts.
 *  - sourcemap: true.
 *  - VISUALIZE=1일 때 stats.html 생성.
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import esbuild from 'rollup-plugin-esbuild';
import dts from 'rollup-plugin-dts';
import postcss from 'rollup-plugin-postcss';
import postcssImport from 'postcss-import';
import { visualizer } from 'rollup-plugin-visualizer';
import { createRequire } from 'node:module';
import path from 'node:path';

// postcss-import 의 npm subpath (`@trama-chain/tokens/css`) resolution 용.
const require = createRequire(import.meta.url);

const VISUALIZE = process.env.VISUALIZE === '1';

const external = [
  /^react$/,
  /^react\/.*/,
];

/**
 * chunk 의미 분리. id는 절대 경로로 들어옴.
 *
 * - @trama-chain/projector-static: 정적 렌더러. 별도 chunk.
 * - @trama-chain/core + @trama-chain/layout: 모델·레이아웃 계산. 함께 trama-core 청크.
 * - tokens 는 projector-static의 styles.css가 @import로만 끌어쓰는 CSS 토큰이라
 *   JS 사이드 의존이 거의 없어 projector-static 청크에 합쳐 순환을 끊는다.
 */
function manualChunks(id) {
  if (/\/packages\/projector-static\//.test(id)) return 'projector-static';
  if (/\/packages\/tokens\//.test(id)) return 'projector-static';
  if (/\/packages\/layout\//.test(id)) return 'trama-core';
  if (/\/packages\/core\//.test(id)) return 'trama-core';
  return undefined;
}

function chunkFileName(info) {
  const name = info.name ?? 'chunk';
  return `chunks/${name}-[hash].js`;
}

const jsBundle = {
  input: 'src/index.ts',
  external,
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: 'static-projector.js',
    chunkFileNames: chunkFileName,
    inlineDynamicImports: false,
    sourcemap: true,
    generatedCode: 'es2015',
    manualChunks,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
    }),
    nodeResolve({
      extensions: ['.ts', '.tsx', '.mjs', '.js'],
      preferBuiltins: false,
    }),
    commonjs(),
    json(),
    postcss({
      // projector-static/styles.css 는 @trama-chain/tokens/css 등을 @import 로
      // 끌어쓴다. postcss-import 가 @import 를 *번들 시점에 모두 펼쳐 한 문자열*
      // 로 만들어야 styleInject 가 head <style> 에 실제 CSS rule 을 박는다.
      // 빠지면 head 에 @import 디렉티브만 들어가 브라우저가 npm 패키지 경로를
      // fetch 시도하다 404 — 호스트가 dist 를 받아 쓸 때 정적 SVG 가 토큰 없이
      // 렌더된다.
      plugins: [
        postcssImport({
          // bare specifier (`@trama-chain/tokens/css`) 는 Node resolution 으로
          // package.json 의 exports map (`./css` → `./dist/tokens.scoped.css`)
          // 을 따라 실제 파일 경로로 해석. 상대 경로는 basedir 기준 절대 경로.
          // postcss-import v16 은 항상 string 반환 요구.
          resolve(id, basedir) {
            if (id.startsWith('.') || id.startsWith('/') || path.isAbsolute(id)) {
              return path.resolve(basedir, id);
            }
            try {
              return require.resolve(id, { paths: [basedir] });
            } catch {
              return id;
            }
          },
        }),
      ],
      extract: false,
      inject: true,
      minimize: true,
    }),
    esbuild({
      target: 'es2022',
      sourceMap: true,
      tsconfig: '../../tsconfig.base.json',
      jsx: 'automatic',
    }),
    VISUALIZE &&
      visualizer({
        filename: 'stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    warn(warning);
  },
};

const dtsBundle = {
  input: 'src/index.ts',
  external,
  output: {
    file: 'dist/static-projector.d.ts',
    format: 'es',
  },
  plugins: [dts({ respectExternal: true })],
};

export default [jsBundle, dtsBundle];
