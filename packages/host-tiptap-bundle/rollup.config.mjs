// @ts-check
/**
 * @trama-chain/tiptap — rollup 설정.
 *
 * 정책:
 *  - 단일 ESM entry (tiptap.js) + 자동 chunk 추론.
 *  - external: @tiptap/core, @tiptap/pm, react, react-dom — 호스트 단일 인스턴스.
 *  - manualChunks: trama-core / projector-web / fizzex / runtime 으로 의미 분리.
 *    bundle visualizer로 사이즈 회귀 점검 가능.
 *  - CSS: projector-web의 styles.css는 `@import '@trama-chain/tokens/css'`를 포함한다.
 *    rollup-plugin-postcss + postcss-import로 펼친 뒤 `inject: true`로 번들 import
 *    시점에 head에 `<style>` 1회 삽입. trama-* prefix가 셀렉터에 깔려 있어
 *    호스트 전역과 충돌 위험 낮음.
 *  - .d.ts는 별도 패스(rollup-plugin-dts)로 단일 dist/tiptap.d.ts.
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
  /^@tiptap\/core/,
  /^@tiptap\/pm(\/.*)?$/,
  /^react$/,
  /^react\/.*/,
  /^react-dom$/,
  /^react-dom\/.*/,
  /^fizzex$/,
  /^fizzex\/.*/,
];

/**
 * chunk 의미 분리. id는 절대 경로로 들어옴.
 *
 * - @trama-chain/projector-web: 편집기 UI. 별도 chunk.
 * - @trama-chain/core: 모델/직렬화. 별도 chunk (projector-web과 함께 쓰이지만 메티의
 *   미래 정적 뷰어가 core만 필요할 가능성 대비).
 *
 * fizzex 는 external 처리 — 호스트(메티)가 자체 fizzex 인스턴스를 제공.
 */
function manualChunks(id) {
  if (/\/packages\/projector-web\//.test(id)) return 'projector-web';
  // tokens는 projector-web의 styles.css가 @import로만 끌어쓰는 CSS 토큰이다.
  // JS 사이드 의존이 거의 없어 projector-web 청크에 합쳐 runtime ↔ projector-web
  // 순환을 끊는다.
  if (/\/packages\/tokens\//.test(id)) return 'projector-web';
  if (/\/packages\/core\//.test(id)) return 'trama-core';
  if (/\/packages\/host-tiptap\//.test(id)) return 'runtime';
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
    entryFileNames: 'tiptap.js',
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
      // projector-web/styles.css 는 @trama-chain/tokens/css 와 styles/*.css 를
      // @import 17 줄로 끌어쓴다. postcss-import 가 @import 를 *번들 시점에 모두
      // 펼쳐 한 문자열로* 만들어야 styleInject 가 head <style> 에 실제 CSS rule
      // 을 박는다. 빠지면 head 에 @import 디렉티브만 들어가, 브라우저가 페이지
      // URL 기준으로 npm 패키지 경로를 fetch 시도해 404 — 메티 같은 호스트가
      // dist 를 받아 쓸 때 캔버스가 300×150 intrinsic SVG 로 폴백된다.
      plugins: [
        postcssImport({
          // bare specifier (`@trama-chain/tokens/css`) 는 Node resolution 으로
          // package.json 의 exports map (`./css` → `./dist/tokens.scoped.css`)
          // 을 따라 실제 파일 경로로 해석. 상대 경로(`./styles/base.css`) 는
          // basedir 기준 절대 경로로 변환. postcss-import v16 은 항상 string
          // 반환 요구 — null 반환하면 path.isAbsolute 가 throw.
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
  // 경고 억제 정책:
  //  - CIRCULAR_DEPENDENCY: trama 내부 cross-chunk는 정상 동작.
  //  - MODULE_LEVEL_DIRECTIVE ("use client"): Radix UI가 React Server Components
  //    힌트로 박아두는 디렉티브. ESM 번들 시점에는 의미 없으니 침묵.
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    warn(warning);
  },
};

const dtsBundle = {
  input: 'src/index.ts',
  // dts 패스에서는 @trama-chain/* workspace 패키지의 .ts 소스를 끌어들여 인라인해야
  // 한다. peer + 부수효과 CSS 임포트는 external — dts 는 CSS 파싱 능력이 없다.
  external: [...external, /\.css$/],
  output: {
    file: 'dist/tiptap.d.ts',
    format: 'es',
  },
  // respectExternal: workspace 패키지(@trama-chain/host-tiptap, @trama-chain/core,
  // @trama-chain/projector-web)의 type 정의를 따라가 단일 d.ts에 포함시킨다.
  plugins: [dts({ respectExternal: true })],
};

export default [jsBundle, dtsBundle];
