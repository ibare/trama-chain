import { useCallback } from 'react';
import type { Node } from '@trama/core';
import { useModelStore } from '../store/index.js';
import { formatNodeValue } from '../util/format.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';

interface Props {
  node: Node;
  halfW: number;
  halfH: number;
}

const SLIDER_WIDTH = 160;
const SLIDER_HEIGHT = 36;
const SLIDER_GAP = 8;

export function NodeMicroSlider({ node, halfW: _halfW, halfH }: Props): JSX.Element {
  void _halfW;
  const scrubInitialValue = useModelStore((s) => s.scrubInitialValue);
  const unit = resolveNodeUnit(node);
  const { min, max, step } = boundsForSlider(unit);
  const value = node.initialValue;

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) scrubInitialValue(node.id, v);
    },
    [node.id, scrubInitialValue],
  );

  // 캔버스 hover/drag 영향 차단
  const stop = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const formatted = formatNodeValue(value, unit);

  return (
    <foreignObject
      x={-SLIDER_WIDTH / 2}
      y={halfH + SLIDER_GAP}
      width={SLIDER_WIDTH}
      height={SLIDER_HEIGHT}
    >
      <div
        className="trama-node-slider"
        onPointerDown={stop}
        onPointerMove={stop}
        onPointerUp={stop}
        onMouseDown={stop}
        onClick={stop}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
        />
        <span className="trama-node-slider-readout">
          {formatted.primary}
          {formatted.accessory && <span className="trama-readout-accessory"> {formatted.accessory}</span>}
        </span>
      </div>
    </foreignObject>
  );
}

function boundsForSlider(unit: ReturnType<typeof resolveNodeUnit>) {
  if (unit.kind === 'label') {
    return { min: 0, max: Math.max(0, unit.labels.length - 1), step: 1 };
  }
  if (unit.kind === 'free') {
    return { min: 0, max: 1, step: 0.01 };
  }
  return { min: unit.min, max: unit.max, step: unit.step };
}
