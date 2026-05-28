import { useCallback } from 'react';
import * as Form from '@radix-ui/react-form';
import type { Edge, ShapeParamField } from '@trama-chain/core';
import { useTrama } from '../store/index.js';

interface Props {
  edge: Edge;
  fields: ShapeParamField[];
}

/**
 * shape definition의 paramFields를 읽어 number 입력들을 자동 생성한다.
 * 입력값은 즉시 edge.shape.params에 반영. preview 카드와 캔버스 결과가
 * 같이 갱신된다.
 *
 * radix-form 기반 — Form.Field/Label/Control로 label-input association,
 * server validation 채널, aria 자동 부여.
 */
export function ShapeParamEditor({ edge, fields }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateEdge = modelStore((s) => s.updateEdge);
  const params = edge.shape.params as Record<string, unknown>;

  const setField = useCallback(
    (key: string, raw: string) => {
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) return;
      updateEdge(edge.id, {
        shape: { kind: edge.shape.kind, params: { ...params, [key]: v } },
      });
    },
    [edge.id, edge.shape.kind, params, updateEdge],
  );

  return (
    <Form.Root
      className="trama-shape-editor"
      onSubmit={(e) => e.preventDefault()}
      style={{ gridColumn: '1 / -1' }}
    >
      {fields.map((f) => {
        const current = typeof params[f.key] === 'number' ? (params[f.key] as number) : 0;
        return (
          <Form.Field
            key={f.key}
            name={f.key}
            className="trama-shape-editor-row"
            title={f.hint?.ko ?? ''}
          >
            <Form.Label className="trama-shape-editor-label">{f.labels.ko}</Form.Label>
            <Form.Control
              type="number"
              value={current}
              min={f.min}
              max={f.max}
              step={f.step ?? 0.01}
              className="trama-shape-editor-input"
              onChange={(e) => setField(f.key, e.currentTarget.value)}
            />
          </Form.Field>
        );
      })}
    </Form.Root>
  );
}
