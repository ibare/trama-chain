import { memo, Suspense, type LazyExoticComponent } from 'react';
import type { ValueNode } from '@trama/core';
import type { BooleanSkinComponent } from '../skin/types.js';
import type { NodeLayout } from '@trama/layout';
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

/**
 * 스킨이 적용된 boolean ValueNode 의 콘텐츠.
 *
 * ValueNodeSkin 의 boolean 대응 — 노드 영역 전체가 스킨 visual 이 되고, 카드
 * 배경·라벨·토글은 스킨 안으로 흡수된다. 외곽 silhouette 은 공통 원형 보더로
 * 통일해 numeric/boolean 양쪽 스킨이 동일 추상으로 선택 stroke·엣지 앵커를
 * 노출한다.
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
  return (
    <>
      <Suspense fallback={null}>
        <SkinLazy
          node={node}
          on={on}
          halfW={layout.halfW}
          halfH={layout.halfH}
          onToggle={onToggle}
          disabled={disabled}
          onLabelClick={onLabelClick}
        />
      </Suspense>
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
