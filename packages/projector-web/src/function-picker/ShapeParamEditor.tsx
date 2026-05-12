import { useCallback } from 'react';
import type { Edge, ShapeParamField } from '@trama/core';
import { useModelStore } from '../store/index.js';

interface Props {
  edge: Edge;
  fields: ShapeParamField[];
}

/**
 * shape definition의 paramFields를 읽어 number 입력들을 자동 생성한다.
 * 입력값은 즉시 edge.shape.params에 반영. preview 카드와 캔버스 결과가
 * 같이 갱신된다.
 */
export function ShapeParamEditor({ edge, fields }: Props): JSX.Element {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const params = edge.shape.params as Record<string, unknown>;

  const setField = useCallback(
    (key: string, raw: string) => {
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) return;
      updateEdge(
        edge.id,
        { shape: { kind: edge.shape.kind, params: { ...params, [key]: v } } },
        'change-shape',
        '파라미터 변경',
      );
    },
    [edge.id, edge.shape.kind, params, updateEdge],
  );

  return (
    <div className="trama-shape-editor" style={{ gridColumn: '1 / -1' }}>
      {fields.map((f) => {
        const current = typeof params[f.key] === 'number' ? (params[f.key] as number) : 0;
        return (
          <label key={f.key} title={f.hint?.ko ?? ''}>
            <span>{f.labels.ko}</span>
            <input
              type="number"
              value={current}
              min={f.min}
              max={f.max}
              step={f.step ?? 0.01}
              onChange={(e) => setField(f.key, e.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}
