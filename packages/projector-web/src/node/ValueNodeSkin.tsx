import { memo, Suspense, type LazyExoticComponent } from 'react';
import type { ValueNode, ResolvedUnit } from '@trama-chain/core';
import type { NumericSkinComponent } from '../skin/types.js';
import { SKIN_SCALE_MAX, SKIN_SCALE_MIN, type NodeLayout } from '@trama-chain/layout';
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

function resolveSkinScale(node: ValueNode): number {
  const raw = node.skin?.params.scale;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.max(SKIN_SCALE_MIN, Math.min(SKIN_SCALE_MAX, raw));
}

/**
 * 스킨이 적용된 ValueNode의 콘텐츠.
 *
 * 노드 영역 전체가 스킨 visual(캡슐·다이얼·LCD 등)이 되고, 카드 배경·라벨·값/단위·
 * combiner는 모두 스킨 안으로 흡수된다. 외곽 silhouette은 공통 원형 보더 하나로
 * 통일 — 모든 스킨이 동일 추상으로 선택 stroke와 엣지 앵커를 노출한다.
 *
 * 스킨 visual 은 SkinLazy 한 컴포넌트가 자체 좌표계로 그리는데, 좌표·폰트가
 * hardcoded 인 경우가 많아 halfW/halfH props 만 갱신해선 비율 변경이 시각에
 * 반영되지 않는다. 그래서 wrapper `<g>` 에 transform="scale(s)" 를 적용해
 * 스킨 본체를 통째로 균일 스케일링한다 — hardcoded 좌표·폰트·hit-area 모두 일관.
 * SkinLazy 에는 *base*(scale=1) halfW/halfH 를 넘겨 자기 좌표계 그대로 그리게 한다.
 *
 * skinBorder/resize 핸들은 wrapper 밖에 그대로 둔다 — layout 의 좌표는 이미
 * spec*scale 로 계산돼 있어 절대 좌표로 정확히 자리잡는다.
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
  const scale = resolveSkinScale(node);
  const baseHalfW = layout.halfW / scale;
  const baseHalfH = layout.halfH / scale;
  return (
    <>
      <g transform={`scale(${scale})`}>
        <Suspense fallback={null}>
          <SkinLazy
            node={node}
            value={currentValue}
            unit={unit}
            halfW={baseHalfW}
            halfH={baseHalfH}
            onScrub={onScrub}
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

export const ValueNodeSkin = memo(ValueNodeSkinImpl);
