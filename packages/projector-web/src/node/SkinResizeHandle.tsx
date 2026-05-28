import { memo, useCallback, useRef } from 'react';
import type { ValueNode } from '@trama-chain/core';
import { SKIN_SCALE_MAX, SKIN_SCALE_MIN, type NodeLayout } from '@trama-chain/layout';
import { useTrama } from '../store/index.js';

const HANDLE_SIZE = 10;
const HIT_PAD = 6;

interface Props {
  node: ValueNode;
  layout: NodeLayout;
  isSelected: boolean;
}

/**
 * 스킨이 적용된 ValueNode 의 비율 유지 리사이즈 핸들.
 *
 * 노드 bbox 우하단 모서리에 단일 핸들로 노출된다. 비율은 단일 스칼라
 * `node.skin.params.scale` 로 표현되고, SKIN_LAYOUTS spec 의 width/height/
 * circleR/circleCy 에 동일하게 곱해진다 — 그래서 한 모서리 한 방향만으로
 * 충분.
 *
 * 인터랙션 패턴(S-node): 자체 hit-rect + pointerdown stopPropagation +
 * setPointerCapture. NodeFrame 의 drag-hit 위에 별도의 hit 영역을 깔아
 * 드래그가 시작되지 않게 한다.
 *
 * 시각 element 는 `<g pointer-events="none">` 로 감싸 hit 만 받지 않도록 분리.
 */
function SkinResizeHandleImpl({ node, layout, isSelected }: Props): JSX.Element | null {
  const { modelStore, viewport, uiStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);

  const moveRef = useRef<{
    startClientX: number;
    startClientY: number;
    startScale: number;
    startDiag: number;
    zoom: number;
    pointerId: number;
    captured: boolean;
    lastScale: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!node.skin) return;
      if (uiStore.getState().readOnly) return;
      e.stopPropagation();
      const rawScale = node.skin.params.scale;
      const startScale = typeof rawScale === 'number' && Number.isFinite(rawScale) ? rawScale : 1;
      moveRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScale,
        // 노드 bbox 대각선(현재 layout 의). 우하단 방향 변위를 이 대각선 증분으로
        // 환산해 scale 변화율을 계산한다.
        startDiag: Math.hypot(layout.width, layout.height),
        zoom: viewport.getCurrentZoom(),
        pointerId: e.pointerId,
        captured: false,
        lastScale: startScale,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      moveRef.current.captured = true;
    },
    [node.skin, layout.width, layout.height, viewport, uiStore],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      if (!m || !node.skin) return;
      e.stopPropagation();
      const dxClient = e.clientX - m.startClientX;
      const dyClient = e.clientY - m.startClientY;
      // 우하단 방향(+X +Y) 단위 벡터에 대한 변위 성분(스칼라). 좌상단으로 끌면 음수.
      const along = (dxClient + dyClient) / Math.SQRT2 / m.zoom;
      const newDiag = Math.max(1, m.startDiag + along);
      let next = m.startScale * (newDiag / m.startDiag);
      next = Math.max(SKIN_SCALE_MIN, Math.min(SKIN_SCALE_MAX, next));
      if (next === m.lastScale) return;
      m.lastScale = next;
      updateNode(node.id, {
        skin: { kind: node.skin.kind, params: { ...node.skin.params, scale: next } },
      });
    },
    [node.id, node.skin, updateNode],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const m = moveRef.current;
      moveRef.current = null;
      if (m?.captured) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    },
    [],
  );

  if (!isSelected || !node.skin) return null;

  const cx = layout.halfW;
  const cy = layout.halfH;
  const half = HANDLE_SIZE / 2;
  const hitHalf = half + HIT_PAD;

  return (
    <g className="trama-skin-resize-handle">
      <g pointer-events="none">
        <rect
          className="trama-skin-resize-handle-visual"
          x={cx - half}
          y={cy - half}
          width={HANDLE_SIZE}
          height={HANDLE_SIZE}
          rx={2}
          ry={2}
        />
      </g>
      <rect
        x={cx - hitHalf}
        y={cy - hitHalf}
        width={hitHalf * 2}
        height={hitHalf * 2}
        fill="transparent"
        style={{ cursor: 'nwse-resize' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </g>
  );
}

export const SkinResizeHandle = memo(SkinResizeHandleImpl);
