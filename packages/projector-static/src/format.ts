import type { ResolvedUnit } from '@trama-chain/core';

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
