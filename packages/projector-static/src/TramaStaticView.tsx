import { useMemo } from 'react';
import {
  captureSnapshot,
  documentToModel,
  initializeFromInitialValues,
  parseTrama,
  propagateOneStep,
  type CombinerRegistry,
  type EdgeId,
  type Model,
  type NodeId,
  type NodeSnapshot,
  type ShapeRegistry,
  type TramaDocument,
} from '@trama-chain/core';
import { getNodeLayout, type NodeLayout } from '@trama-chain/layout';
import { computeBounds } from './geometry.js';
import { buildSlotIndex } from './snapshot.js';
import {
  renderStaticNode,
  type StaticNodeRendererMap,
} from './render.js';
import { defaultStaticRenderers } from './renderers.js';
import { StaticEdge } from './edges/StaticEdge.js';

interface BaseProps {
  height?: number;
  showQuestion?: boolean;
  /** 사용자 정의 kind 분기 — 비워두면 [[defaultStaticRenderers]] 사용. */
  renderers?: StaticNodeRendererMap;
  registries: {
    shapes: ShapeRegistry;
    combiners: CombinerRegistry;
  };
}

interface JsonProps extends BaseProps {
  json: string;
  doc?: never;
  snapshot?: never;
  model?: never;
}

interface DocProps extends BaseProps {
  doc: TramaDocument;
  json?: never;
  snapshot?: never;
  model?: never;
}

interface PreparedProps extends BaseProps {
  model: Model;
  snapshot: NodeSnapshot;
  question?: string | null;
  json?: never;
  doc?: never;
}

type Props = JsonProps | DocProps | PreparedProps;

interface ResolvedState {
  ok: true;
  model: Model;
  snapshot: NodeSnapshot;
  question: string | null;
}

interface ResolvedError {
  ok: false;
  error: string;
}

function resolveState(props: Props): ResolvedState | ResolvedError {
  try {
    if ('model' in props && props.model) {
      return {
        ok: true,
        model: props.model,
        snapshot: props.snapshot,
        question: props.question ?? props.model.question ?? null,
      };
    }
    const doc: TramaDocument =
      'doc' in props && props.doc
        ? props.doc
        : parseTrama(props.json as string, {
            shapeRegistry: props.registries.shapes,
            combinerRegistry: props.registries.combiners,
          });

    const model = documentToModel(doc);
    const snapshot: NodeSnapshot =
      doc.snapshot ??
      (() => {
        const initial = initializeFromInitialValues(model);
        const next = propagateOneStep(initial, model, {
          shapeRegistry: props.registries.shapes,
          combinerRegistry: props.registries.combiners,
        });
        return captureSnapshot(next);
      })();
    return { ok: true, model, snapshot, question: model.question ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function TramaStaticView(props: Props): JSX.Element {
  const result = useMemo(() => resolveState(props), [props]);
  const height = props.height ?? 360;
  const showQuestion = props.showQuestion ?? true;

  if (!result.ok) {
    return (
      <div
        data-trama-root
        className="trama-static trama-static-error"
        style={{ height, padding: 12 }}
      >
        <p>모델을 불러올 수 없어요.</p>
        <pre style={{ fontSize: 11, opacity: 0.6 }}>{result.error}</pre>
      </div>
    );
  }

  const { model, snapshot, question } = result;
  const renderers = props.renderers ?? defaultStaticRenderers;

  const incomingMap: Record<NodeId, EdgeId[]> = {};
  for (const eid of model.edgeOrder) {
    const e = model.edges[eid];
    if (!e) continue;
    (incomingMap[e.to] ??= []).push(eid);
  }

  const layouts: Record<NodeId, NodeLayout> = {};
  for (const nid of model.nodeOrder) {
    const node = model.nodes[nid];
    if (!node) continue;
    layouts[nid] = getNodeLayout(node, {
      incomingCount: incomingMap[nid]?.length ?? 0,
    });
  }

  const positions = model.nodeOrder
    .map((id) => model.nodes[id]?.position)
    .filter((p): p is { x: number; y: number } => !!p);
  const bounds = computeBounds(positions);
  const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`;

  const slotIndex = buildSlotIndex(snapshot);

  return (
    <div data-trama-root className="trama-static" style={{ height }}>
      {showQuestion && question && (
        <div className="trama-static-question">{question}</div>
      )}
      <svg
        className="trama-static-canvas"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          className="trama-static-canvas-bg"
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.width}
          height={bounds.height}
        />
        {model.edgeOrder.map((eid) => (
          <StaticEdge
            key={eid}
            edgeId={eid}
            model={model}
            layouts={layouts}
            incomingMap={incomingMap}
            snapshot={snapshot}
            slotIndex={slotIndex}
          />
        ))}
        {model.nodeOrder.map((nid) => {
          const node = model.nodes[nid];
          const layout = layouts[nid];
          if (!node || !layout) return null;
          return renderStaticNode({
            key: nid,
            renderers,
            node,
            layout,
            snapshot,
            slotIndex,
            model,
            registries: props.registries,
          });
        })}
      </svg>
    </div>
  );
}
