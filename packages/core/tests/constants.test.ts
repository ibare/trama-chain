import { describe, expect, it } from 'vitest';
import {
  ConstantRegistry,
  createDefaultConstantRegistry,
} from '../src/constants/index.js';

describe('ConstantRegistry', () => {
  const reg = createDefaultConstantRegistry();

  it('기본 상수 세트 등록', () => {
    expect(reg.has('pi')).toBe(true);
    expect(reg.has('e')).toBe(true);
    expect(reg.has('one-half')).toBe(true);
    expect(reg.has('one-third')).toBe(true);
    expect(reg.has('one-fourth')).toBe(true);
    expect(reg.has('g')).toBe(true);
    expect(reg.has('c')).toBe(true);
    expect(reg.has('custom')).toBe(true);
  });

  it('각 정의는 사람이 읽을 라벨과 심볼을 갖는다', () => {
    for (const d of reg.list()) {
      expect(d.labels.ko.length).toBeGreaterThan(0);
      expect(d.labels.en.length).toBeGreaterThan(0);
      expect(d.symbol.length).toBeGreaterThan(0);
    }
  });

  it('수치 값이 정확하다', () => {
    expect(reg.get('pi')?.value).toBe(Math.PI);
    expect(reg.get('e')?.value).toBe(Math.E);
    expect(reg.get('one-half')?.value).toBe(0.5);
    expect(reg.get('g')?.value).toBeCloseTo(9.80665);
    expect(reg.get('c')?.value).toBe(299_792_458);
  });

  it('카테고리별 묶음', () => {
    expect(reg.listByCategory('math').map((d) => d.key)).toEqual(
      expect.arrayContaining(['pi', 'e', 'one-half', 'one-third', 'one-fourth']),
    );
    expect(reg.listByCategory('physics').map((d) => d.key)).toEqual(
      expect.arrayContaining(['g', 'c']),
    );
    expect(reg.listByCategory('custom').map((d) => d.key)).toEqual(['custom']);
  });

  it('중복 등록은 거부한다', () => {
    const r = new ConstantRegistry();
    r.register({
      key: 'x',
      labels: { ko: 'X', en: 'X' },
      symbol: 'x',
      value: 1,
      category: 'math',
    });
    expect(() =>
      r.register({
        key: 'x',
        labels: { ko: 'X', en: 'X' },
        symbol: 'x',
        value: 2,
        category: 'math',
      }),
    ).toThrow();
  });
});
