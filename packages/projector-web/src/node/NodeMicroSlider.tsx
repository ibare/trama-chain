import { useCallback } from 'react';
import type { Node, Unit } from '@trama/core';
import { useModelStore } from '../store/index.js';
import { formatValue } from '../util/format.js';

interface Props {
  node: Node;
  halfW: number;
  halfH: number;
}

interface SliderBounds {
  min: number;
  max: number;
  step: number;
}

function boundsFor(unit: Unit): SliderBounds {
  switch (unit.kind) {
    case 'scale':
    case 'number':
      return { min: unit.min, max: unit.max, step: (unit.max - unit.min) / 100 };
    case 'label':
      return { min: 0, max: unit.values.length - 1, step: 1 };
    case 'free':
      return { min: -1, max: 1, step: 0.01 };
  }
}

const SLIDER_WIDTH = 160;
const SLIDER_HEIGHT = 36;
const SLIDER_GAP = 8;

export function NodeMicroSlider({ node, halfW: _halfW, halfH }: Props): JSX.Element {
  void _halfW;
  const scrubInitialValue = useModelStore((s) => s.scrubInitialValue);
  const { min, max, step } = boundsFor(node.unit);
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
        <span className="trama-node-slider-readout">{formatValue(value, node.unit)}</span>
      </div>
    </foreignObject>
  );
}
