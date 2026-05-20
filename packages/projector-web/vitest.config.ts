import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    environment: 'happy-dom',
    server: {
      // fizzex dist 의 내부 import 가 확장자 누락(`./editor`) 이라 vitest 의
      // 기본 node ESM resolver 가 해결하지 못한다. inline 으로 vite transform 을
      // 거치게 해 의존성 그래프를 정상 해석.
      deps: { inline: ['fizzex'] },
    },
  },
});
