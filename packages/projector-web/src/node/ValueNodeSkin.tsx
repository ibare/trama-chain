import { memo, Suspense, type LazyExoticComponent } from 'react';
import type { ValueNode, ResolvedUnit } from '@trama/core';
import type { NumericSkinComponent } from '../skin/types.js';
import type { NodeLayout } from '@trama/layout';
import { SkinResizeHandle } from './SkinResizeHandle.js';

interface Props {
  node: ValueNode;
  layout: NodeLayout;
  isSelected: boolean;
  currentValue: number;
  unit: ResolvedUnit;
  /** 진행 시 lag=0 입력이 있어 슬라이더 조작이 의미 없을 때 true. */
  disabled: boolean;
  onScrub: ((v: number) => void) | undefined;
  onLabelClick: () => void;
  SkinLazy: LazyExoticComponent<NumericSkinComponent>;
}

/**
 * 스킨이 적용된 ValueNode의 콘텐츠.
 *
 * 노드 영역 전체가 스킨 visual(캡슐·다이얼·LCD 등)이 되고, 카드 배경·라벨·값/단위·
 * combiner는 모두 스킨 안으로 흡수된다. 외곽 silhouette은 공통 원형 보더 하나로
 * 통일 — 모든 스킨이 동일 추상으로 선택 stroke와 엣지 앵커를 노출한다.
 *
 * 카드 모드와 분리한 이유는 ValueNodeCard 헤더 참조 — 한 모드의 변경이 다른
 * 모드의 코드 경로에 새지 않도록 격리.
 */
function ValueNodeSkinImpl({
  node,
  layout,
  isSelected,
  currentValue,
  unit,
  disabled,
  onScrub,
  onLabelClick,
  SkinLazy,
}: Props): JSX.Element {
  return (
    <>
      <Suspense fallback={null}>
        <SkinLazy
          node={node}
          value={currentValue}
          unit={unit}
          halfW={layout.halfW}
          halfH={layout.halfH}
          onScrub={onScrub}
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

export const ValueNodeSkin = memo(ValueNodeSkinImpl);
