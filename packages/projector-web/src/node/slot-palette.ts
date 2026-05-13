import { tokens } from '@trama/tokens';

/**
 * 멀티슬롯 노드의 슬롯 식별색.
 *
 * 슬롯 1개 노드는 기본 edge 색을 그대로 쓰고, 2개 이상부터 slot 0은 default,
 * slot 1..k 에 palette[0..k-1]을 매핑한다. slot ring · 연결 엣지 stroke · 화살촉
 * fill · 식 노드 변수 라벨 텍스트가 같은 색을 공유해 시각 동일성을 만든다.
 *
 * feedback·strained 같은 시맨틱 상태 색은 식별색보다 우선한다 (CSS specificity).
 */
const PALETTE: readonly string[] = [
  tokens.color.slot1,
  tokens.color.slot2,
  tokens.color.slot3,
  tokens.color.slot4,
  tokens.color.slot5,
  tokens.color.slot6,
  tokens.color.slot7,
  tokens.color.slot8,
  tokens.color.slot9,
];

/** 슬롯 인덱스 → 색. 단일슬롯이거나 slot 0이면 null (기본색 유지). */
export function slotColor(slotIndex: number, totalSlots: number): string | null {
  if (totalSlots < 2) return null;
  if (slotIndex <= 0) return null;
  return PALETTE[(slotIndex - 1) % PALETTE.length] ?? null;
}
