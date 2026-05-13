/**
 * picker에 노출되는 shape들의 카테고리 분류.
 *
 * - 'none' kind은 sentinel이라 카드로 노출하지 않는다 (선택 해제 버튼이 대신).
 * - 'linear'는 identity와 의미가 겹쳐 picker에서 영구 숨김.
 *
 * 새 shape를 추가할 때 이 표에 key를 등록하지 않으면 picker grid에 보이지 않는다.
 */
export interface ShapeCategory {
  id: 'monoUp' | 'monoDown' | 'nonMono' | 'free' | 'stochastic';
  labels: { ko: string; en: string };
  shapeKeys: readonly string[];
}

export const SHAPE_CATEGORIES: readonly ShapeCategory[] = [
  {
    id: 'monoUp',
    labels: { ko: '단조 증가', en: 'increasing' },
    shapeKeys: ['threshold', 'diminishing', 'accelerating', 'sigmoid', 'log', 'step'],
  },
  {
    id: 'monoDown',
    labels: { ko: '단조 감소', en: 'decreasing' },
    shapeKeys: ['decay', 'inverse', 'inverseThreshold'],
  },
  {
    id: 'nonMono',
    labels: { ko: '비단조', en: 'non-monotonic' },
    shapeKeys: ['inverseU', 'valley', 'sin'],
  },
  {
    id: 'free',
    labels: { ko: '자유', en: 'free-form' },
    shapeKeys: ['piecewise'],
  },
  {
    id: 'stochastic',
    labels: { ko: '확률', en: 'stochastic' },
    shapeKeys: ['stochastic', 'uniform', 'gaussian'],
  },
];

/** 어느 카테고리에도 속하지 않은(= picker 숨김) shape key 집합. */
export const HIDDEN_SHAPE_KEYS: ReadonlySet<string> = new Set(['none', 'linear']);

/** 카테고리 id 기준으로 어느 탭에 어떤 shape가 속하는지 빠르게 lookup. */
export function findCategoryOfShape(shapeKey: string): ShapeCategory | null {
  for (const cat of SHAPE_CATEGORIES) {
    if (cat.shapeKeys.includes(shapeKey)) return cat;
  }
  return null;
}
