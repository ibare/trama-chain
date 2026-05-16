import { useMemo } from 'react';
import type { Node } from '@trama/core';
import { getNodeLayout, type NodeDisplayMode, type NodeLayout } from './box.js';

interface Options {
  incomingCount: number;
  expressionSize?: { width: number; height: number } | null;
  /** 노드 디스플레이 모드. 호출자가 지정하지 않으면 box.ts 기본값(standard) 사용. */
  displayMode?: NodeDisplayMode;
}

/**
 * 노드 레이아웃 계산을 단일 메모이즈 출처로 통합한다.
 *
 * 종래 노드 뷰는 본문 렌더, 소켓 register effect, getStartPoint 콜백에서 각자
 * getNodeLayout을 따로 불렀다. 같은 입력으로 같은 결과를 세 번 계산하는 것도
 * 낭비지만, 더 큰 문제는 호출 순서/시점이 노드별로 달라 fields(예: textX)가
 * 산발적으로 inline 재계산되며 사용처가 일관성 계약을 잃는다는 점이다.
 *
 * 이 훅은 노드 뷰의 단일 진입점이 되어:
 *  - 같은 입력에 대해 같은 layout 객체 reference를 돌려줘 effect 재실행을 줄이고
 *  - 노드 뷰가 layout을 사용하는 모든 코드 경로(socket 등록, edge draft 시작점,
 *    렌더링)에서 한 번 계산된 동일 값을 공유하도록 강제한다.
 *
 * node가 undefined면 null을 반환 — caller가 early-return하면 된다.
 */
export function useNodeLayout(
  node: Node | undefined,
  opts: Options,
): NodeLayout | null {
  const { incomingCount, expressionSize, displayMode } = opts;
  return useMemo(() => {
    if (!node) return null;
    return getNodeLayout(node, {
      incomingCount,
      expressionSize: expressionSize ?? undefined,
      displayMode,
    });
  }, [node, incomingCount, expressionSize, displayMode]);
}
