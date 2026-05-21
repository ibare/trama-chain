import { memo, Suspense, type LazyExoticComponent } from 'react';
import type { ValueNode } from '@trama/core';
import type { BooleanSkinComponent } from '../skin/types.js';
import { SKIN_SCALE_MAX, SKIN_SCALE_MIN, type NodeLayout } from '@trama/layout';
import { SkinResizeHandle } from './SkinResizeHandle.js';

interface Props {
  node: ValueNode;
  layout: NodeLayout;
  isSelected: boolean;
  on: boolean;
  /** 진행 시 lag=0 입력이 있어 사용자의 직접 토글이 의미 없을 때 true. */
  disabled: boolean;
  onToggle: (() => void) | undefined;
  onLabelClick: () => void;
  SkinLazy: LazyExoticComponent<BooleanSkinComponent>;
}

function resolveSkinScale(node: ValueNode): number {
  const raw = node.skin?.params.scale;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.max(SKIN_SCALE_MIN, Math.min(SKIN_SCALE_MAX, raw));
}

/**
 * 스킨이 적용된 boolean ValueNode 의 콘텐츠.
 *
 * ValueNodeSkin 의 boolean 대응 — 노드 영역 전체가 스킨 visual 이 되고, 카드
 * 배경·라벨·토글은 스킨 안으로 흡수된다. 외곽 silhouette 은 공통 원형 보더로
 * 통일해 numeric/boolean 양쪽 스킨이 동일 추상으로 선택 stroke·엣지 앵커를
 * 노출한다.
 *
 * 비율 유지 resize: ValueNodeSkin 과 동일 패턴 — wrapper 의 transform="scale(s)"
 * 가 스킨 본체를 통째로 균일 스케일링. SkinLazy 에는 base(scale=1) halfW/halfH 전달.
 */
function BooleanValueNodeSkinImpl({
  node,
  layout,
  isSelected,
  on,
  disabled,
  onToggle,
  onLabelClick,
  SkinLazy,
}: Props): JSX.Element {
  const scale = resolveSkinScale(node);
  const baseHalfW = layout.halfW / scale;
  const baseHalfH = layout.halfH / scale;
  return (
    <>
      <g transform={`scale(${scale})`}>
        <Suspense fallback={null}>
          <SkinLazy
            node={node}
            on={on}
            halfW={baseHalfW}
            halfH={baseHalfH}
            onToggle={onToggle}
            disabled={disabled}
            onLabelClick={onLabelClick}
          />
        </Suspense>
      </g>
      {layout.skinBorder && (
        <circle
          className={`trama-skin-border${isSelected ? ' is-selected' : ''}`}
          cx={layout.skinBorder.cx}
          cy={layout.skinBorder.cy}
          r={layout.skinBorder.r}
          pointerEvents="none"
        />
      )}
      <SkinResizeHandle node={node} layout={layout} isSelected={isSelected} />
    </>
  );
}

export const BooleanValueNodeSkin = memo(BooleanValueNodeSkinImpl);
