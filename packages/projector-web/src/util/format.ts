import type { Unit } from '@trama/core';

export function formatValue(value: number, unit: Unit): string {
  switch (unit.kind) {
    case 'number':
      return formatNumberWithSuffix(value);
    case 'scale':
      return value.toFixed(2);
    case 'label': {
      const idx = Math.round(value);
      const v = unit.values[Math.max(0, Math.min(unit.values.length - 1, idx))];
      return v ?? '';
    }
    case 'free':
      return value.toFixed(2);
  }
}

export function unitSuffix(unit: Unit): string {
  if (unit.kind === 'number') return unit.suffix;
  return '';
}

function formatNumberWithSuffix(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(v) >= 10_000) return (v / 1_000).toFixed(1) + 'k';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
