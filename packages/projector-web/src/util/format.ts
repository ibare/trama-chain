import type { ResolvedUnit } from '@trama/core';

/**
 * 값 표기는 단위 종류에 따라 형태가 다르다.
 *  - number : '값 suffix'           예: '70 kg'
 *  - scale  : '값 / max'             예: '7.0 / 10' — 척도라는 맥락을 분모로 노출
 *  - label  : 라벨 텍스트            예: '높음'
 *  - free   : '값' (소수 두 자리)
 *
 * NodeView는 본문에서 valuePrimary + valueAccessory로 두 조각을 그린다.
 */
export interface FormattedValue {
  primary: string;
  accessory: string;
}

export function formatNodeValue(value: number, unit: ResolvedUnit): FormattedValue {
  switch (unit.kind) {
    case 'number':
      return { primary: formatNumber(value), accessory: unit.suffix };
    case 'scale':
      return { primary: formatNumber(value), accessory: `/ ${unit.max}` };
    case 'label': {
      const idx = Math.round(value);
      const v = unit.labels[Math.max(0, Math.min(unit.labels.length - 1, idx))];
      return { primary: v ?? '', accessory: '' };
    }
    case 'free':
      return { primary: value.toFixed(2), accessory: '' };
  }
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 10_000) return (v / 1_000).toFixed(1) + 'k';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
