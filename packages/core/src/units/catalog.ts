/**
 * 단위 카탈로그.
 *
 * 모델은 단위의 "정체"를 unitId로 참조하고, 카탈로그가 sensible defaults
 * (min·max·initial·step·suffix·labels)를 들고 있다. 노드 인스턴스는 카탈로그
 * 기본값을 그대로 쓰거나, unitOverride로 일부만 좁혀서 쓴다.
 *
 * 단위 종류(family)는 4가지로 통일:
 *  - number : 연속 수치 + 접미사 (kg, °C, 원 ...)
 *  - scale  : N점 척도. 분모 표기를 갖는 평가 단위 (7/10)
 *  - label  : 순서 있는 명목 라벨 (낮음·중간·높음)
 *  - free   : 자유 [0,1] (사실상 명시 단위 없음)
 */
export type UnitKind = 'number' | 'scale' | 'label' | 'free';

export type UnitCategory =
  | 'physical'
  | 'temperature'
  | 'time'
  | 'money'
  | 'count'
  | 'rating'
  | 'abstract'
  | 'electrical'
  | 'free';

/** 카탈로그 항목 — 한 단위의 sensible defaults 컨테이너. */
export interface UnitDef {
  /** 카탈로그 키 (예: 'kg', 'celsius', 'rating-10', 'confidence'). */
  id: string;
  category: UnitCategory;
  kind: UnitKind;
  /** UI 표시용 라벨. v1은 ko만. */
  label: { ko: string };
  /** number 한정: 값 뒤에 붙는 접미사. */
  suffix?: string;
  /** label 한정: 순서 있는 라벨 목록. */
  labels?: string[];
  /** 합리적 기본 범위와 시작값. 사용자는 노드별로 override 가능. */
  defaultMin: number;
  defaultMax: number;
  defaultInitial: number;
  /** 슬라이더·증감 자연 스텝. */
  defaultStep: number;
  /** 설명 — 인스펙터에 표시. */
  hint?: string;
}

/** 노드별 카탈로그 기본값 override. 지정되지 않은 키는 카탈로그를 그대로 따른다. */
export interface UnitOverride {
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  labels?: string[];
}

/**
 * 카탈로그 def + override를 합쳐 평가에 쓸 effective unit으로 환원.
 * normalize·denormalize·clampToUnit·formatValue가 받는 표준 형태.
 */
export interface ResolvedUnit {
  id: string;
  kind: UnitKind;
  suffix: string;
  labels: string[];
  min: number;
  max: number;
  step: number;
}

export function resolveUnit(def: UnitDef, override?: UnitOverride): ResolvedUnit {
  return {
    id: def.id,
    kind: def.kind,
    suffix: override?.suffix ?? def.suffix ?? '',
    labels: override?.labels ?? def.labels ?? [],
    min: override?.min ?? def.defaultMin,
    max: override?.max ?? def.defaultMax,
    step: override?.step ?? def.defaultStep,
  };
}

// ---------------------------------------------------------------------------
// 표준 카탈로그 시드
// ---------------------------------------------------------------------------

const PHYSICAL: UnitDef[] = [
  {
    id: 'kg',
    category: 'physical',
    kind: 'number',
    label: { ko: '무게 (kg)' },
    suffix: 'kg',
    defaultMin: 0,
    defaultMax: 200,
    defaultInitial: 70,
    defaultStep: 0.1,
    hint: '몸무게·짐·식재료 등 일반 무게',
  },
  {
    id: 'g',
    category: 'physical',
    kind: 'number',
    label: { ko: '무게 (g)' },
    suffix: 'g',
    defaultMin: 0,
    defaultMax: 1000,
    defaultInitial: 100,
    defaultStep: 1,
  },
  {
    id: 'cm',
    category: 'physical',
    kind: 'number',
    label: { ko: '길이 (cm)' },
    suffix: 'cm',
    defaultMin: 0,
    defaultMax: 250,
    defaultInitial: 100,
    defaultStep: 0.5,
  },
  {
    id: 'm',
    category: 'physical',
    kind: 'number',
    label: { ko: '길이 (m)' },
    suffix: 'm',
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 1,
    defaultStep: 0.1,
  },
  {
    id: 'km',
    category: 'physical',
    kind: 'number',
    label: { ko: '거리 (km)' },
    suffix: 'km',
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 5,
    defaultStep: 0.5,
  },
  {
    id: 'liter',
    category: 'physical',
    kind: 'number',
    label: { ko: '부피 (L)' },
    suffix: 'L',
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 1,
    defaultStep: 0.1,
  },
  {
    id: 'ml',
    category: 'physical',
    kind: 'number',
    label: { ko: '부피 (mL)' },
    suffix: 'mL',
    defaultMin: 0,
    defaultMax: 1000,
    defaultInitial: 100,
    defaultStep: 1,
    hint: '실험·요리에서 흔한 소량 부피',
  },
  {
    id: 'cm2',
    category: 'physical',
    kind: 'number',
    label: { ko: '넓이 (cm²)' },
    suffix: 'cm²',
    defaultMin: 0,
    defaultMax: 10000,
    defaultInitial: 100,
    defaultStep: 1,
    hint: '도형·종이·작은 면 넓이',
  },
  {
    id: 'm2',
    category: 'physical',
    kind: 'number',
    label: { ko: '넓이 (m²)' },
    suffix: 'm²',
    defaultMin: 0,
    defaultMax: 1000,
    defaultInitial: 30,
    defaultStep: 0.5,
    hint: '방·집·운동장 같은 큰 넓이',
  },
  {
    id: 'kmh',
    category: 'physical',
    kind: 'number',
    label: { ko: '속도 (km/h)' },
    suffix: 'km/h',
    defaultMin: 0,
    defaultMax: 200,
    defaultInitial: 60,
    defaultStep: 5,
    hint: '자동차·달리기 등 일상 속력',
  },
  {
    id: 'mps',
    category: 'physical',
    kind: 'number',
    label: { ko: '속도 (m/s)' },
    suffix: 'm/s',
    defaultMin: 0,
    defaultMax: 50,
    defaultInitial: 10,
    defaultStep: 0.5,
    hint: '과학 실험 속력 — 음속 ≈ 340 m/s',
  },
  {
    id: 'newton',
    category: 'physical',
    kind: 'number',
    label: { ko: '힘 (N)' },
    suffix: 'N',
    defaultMin: 0,
    defaultMax: 1000,
    defaultInitial: 10,
    defaultStep: 0.5,
    hint: '무게 1 kg 물체가 받는 중력 ≈ 9.8 N',
  },
  {
    id: 'joule',
    category: 'physical',
    kind: 'number',
    label: { ko: '일·에너지 (J)' },
    suffix: 'J',
    defaultMin: 0,
    defaultMax: 10000,
    defaultInitial: 100,
    defaultStep: 10,
    hint: '일·운동에너지·위치에너지의 단위',
  },
  {
    id: 'hpa',
    category: 'physical',
    kind: 'number',
    label: { ko: '기압 (hPa)' },
    suffix: 'hPa',
    defaultMin: 0,
    defaultMax: 1100,
    defaultInitial: 1013,
    defaultStep: 1,
    hint: '대기압 — 해수면 평균 1013 hPa',
  },
  {
    id: 'hertz',
    category: 'physical',
    kind: 'number',
    label: { ko: '주파수 (Hz)' },
    suffix: 'Hz',
    defaultMin: 0,
    defaultMax: 20000,
    defaultInitial: 440,
    defaultStep: 1,
    hint: '소리·전기 진동수 — 가청 20~20000 Hz, A4 음 440 Hz',
  },
  {
    id: 'degree',
    category: 'physical',
    kind: 'number',
    label: { ko: '각도 (°)' },
    suffix: '°',
    defaultMin: 0,
    defaultMax: 360,
    defaultInitial: 90,
    defaultStep: 1,
    hint: '도(°) 단위 평면 각도',
  },
  {
    id: 'decibel',
    category: 'physical',
    kind: 'number',
    label: { ko: '소음 (dB)' },
    suffix: 'dB',
    defaultMin: 0,
    defaultMax: 130,
    defaultInitial: 60,
    defaultStep: 1,
    hint: '도서관 30 · 대화 60 · 도로 80 · 청력손상 100+',
  },
];

const ELECTRICAL: UnitDef[] = [
  {
    id: 'volt',
    category: 'electrical',
    kind: 'number',
    label: { ko: '전압 (V)' },
    suffix: 'V',
    defaultMin: 0,
    defaultMax: 250,
    defaultInitial: 220,
    defaultStep: 1,
    hint: '가정용 220 V, 건전지 1.5 V',
  },
  {
    id: 'ampere',
    category: 'electrical',
    kind: 'number',
    label: { ko: '전류 (A)' },
    suffix: 'A',
    defaultMin: 0,
    defaultMax: 30,
    defaultInitial: 1,
    defaultStep: 0.1,
    hint: '도선에 흐르는 전류량',
  },
  {
    id: 'watt',
    category: 'electrical',
    kind: 'number',
    label: { ko: '전력 (W)' },
    suffix: 'W',
    defaultMin: 0,
    defaultMax: 3000,
    defaultInitial: 60,
    defaultStep: 10,
    hint: '전구 60 W · 헤어드라이어 1500 W',
  },
  {
    id: 'ohm',
    category: 'electrical',
    kind: 'number',
    label: { ko: '저항 (Ω)' },
    suffix: 'Ω',
    defaultMin: 0,
    defaultMax: 10000,
    defaultInitial: 100,
    defaultStep: 10,
    hint: '도체의 전기 저항 — 옴의 법칙 V = IR',
  },
  {
    id: 'kwh',
    category: 'electrical',
    kind: 'number',
    label: { ko: '전기에너지 (kWh)' },
    suffix: 'kWh',
    defaultMin: 0,
    defaultMax: 1000,
    defaultInitial: 200,
    defaultStep: 10,
    hint: '가정 월 전력 사용량 — 1 kWh = 1 kW × 1 h',
  },
];

const TEMPERATURE: UnitDef[] = [
  {
    id: 'celsius',
    category: 'temperature',
    kind: 'number',
    label: { ko: '온도 (°C)' },
    suffix: '°C',
    defaultMin: -10,
    defaultMax: 40,
    defaultInitial: 20,
    defaultStep: 0.5,
  },
];

const TIME: UnitDef[] = [
  {
    id: 'minute',
    category: 'time',
    kind: 'number',
    label: { ko: '시간 (분)' },
    suffix: '분',
    defaultMin: 0,
    defaultMax: 240,
    defaultInitial: 30,
    defaultStep: 1,
  },
  {
    id: 'hour',
    category: 'time',
    kind: 'number',
    label: { ko: '시간 (시간)' },
    suffix: '시간',
    defaultMin: 0,
    defaultMax: 24,
    defaultInitial: 1,
    defaultStep: 0.5,
  },
  {
    id: 'day',
    category: 'time',
    kind: 'number',
    label: { ko: '기간 (일)' },
    suffix: '일',
    defaultMin: 0,
    defaultMax: 365,
    defaultInitial: 7,
    defaultStep: 1,
  },
];

const MONEY: UnitDef[] = [
  {
    id: 'krw',
    category: 'money',
    kind: 'number',
    label: { ko: '금액 (원)' },
    suffix: '원',
    defaultMin: 0,
    defaultMax: 1_000_000,
    defaultInitial: 10_000,
    defaultStep: 1_000,
  },
  {
    id: 'usd',
    category: 'money',
    kind: 'number',
    label: { ko: '금액 (USD)' },
    suffix: '$',
    defaultMin: 0,
    defaultMax: 10_000,
    defaultInitial: 100,
    defaultStep: 10,
  },
];

const COUNT: UnitDef[] = [
  {
    id: 'count',
    category: 'count',
    kind: 'number',
    label: { ko: '횟수 (회)' },
    suffix: '회',
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 1,
    defaultStep: 1,
  },
  {
    id: 'people',
    category: 'count',
    kind: 'number',
    label: { ko: '인원 (명)' },
    suffix: '명',
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 1,
    defaultStep: 1,
  },
  {
    id: 'percentage',
    category: 'count',
    kind: 'number',
    label: { ko: '비율 (%)' },
    suffix: '%',
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 50,
    defaultStep: 1,
  },
];

const RATING: UnitDef[] = [
  {
    id: 'rating-5',
    category: 'rating',
    kind: 'scale',
    label: { ko: '5점 척도' },
    defaultMin: 0,
    defaultMax: 5,
    defaultInitial: 3,
    defaultStep: 1,
    hint: '0~5 사이 정수 척도',
  },
  {
    id: 'rating-10',
    category: 'rating',
    kind: 'scale',
    label: { ko: '10점 척도' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
    hint: '0~10 사이 척도',
  },
  {
    id: 'rating-100',
    category: 'rating',
    kind: 'scale',
    label: { ko: '100점 척도' },
    defaultMin: 0,
    defaultMax: 100,
    defaultInitial: 50,
    defaultStep: 1,
  },
  {
    id: 'agree-5',
    category: 'rating',
    kind: 'label',
    label: { ko: '동의 5단계' },
    labels: ['전혀 아님', '아님', '보통', '그러함', '매우 그러함'],
    defaultMin: 0,
    defaultMax: 4,
    defaultInitial: 2,
    defaultStep: 1,
  },
];

const ABSTRACT: UnitDef[] = [
  {
    id: 'attractiveness',
    category: 'abstract',
    kind: 'scale',
    label: { ko: '매력' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
  },
  {
    id: 'confidence',
    category: 'abstract',
    kind: 'scale',
    label: { ko: '자신감' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
  },
  {
    id: 'mood',
    category: 'abstract',
    kind: 'scale',
    label: { ko: '기분' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
    hint: '오늘의 기분 점수 등',
  },
  {
    id: 'stress',
    category: 'abstract',
    kind: 'scale',
    label: { ko: '스트레스' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
  },
  {
    id: 'energy',
    category: 'abstract',
    kind: 'scale',
    label: { ko: '에너지' },
    defaultMin: 0,
    defaultMax: 10,
    defaultInitial: 5,
    defaultStep: 0.5,
  },
];

const FREE: UnitDef[] = [
  {
    id: 'free',
    category: 'free',
    kind: 'free',
    label: { ko: '자유 (0~1)' },
    defaultMin: 0,
    defaultMax: 1,
    defaultInitial: 0.5,
    defaultStep: 0.01,
    hint: '단위 없이 0~1 정규화 척도로만 다룸',
  },
  {
    id: 'raw',
    category: 'free',
    kind: 'number',
    label: { ko: '계산 결과 (단위 없음)' },
    defaultMin: -1_000_000_000,
    defaultMax: 1_000_000_000,
    defaultInitial: 0,
    defaultStep: 1,
    hint: '함수 결과 등 단위가 정해지지 않은 값을 그대로 표기',
  },
];

const ALL: UnitDef[] = [
  ...PHYSICAL,
  ...ELECTRICAL,
  ...TEMPERATURE,
  ...TIME,
  ...MONEY,
  ...COUNT,
  ...RATING,
  ...ABSTRACT,
  ...FREE,
];

// ---------------------------------------------------------------------------
// 카탈로그 인터페이스
// ---------------------------------------------------------------------------

export interface UnitCatalog {
  get(id: string): UnitDef | undefined;
  require(id: string): UnitDef;
  has(id: string): boolean;
  list(): readonly UnitDef[];
  byCategory(): ReadonlyMap<UnitCategory, readonly UnitDef[]>;
}

function buildCatalog(defs: readonly UnitDef[]): UnitCatalog {
  const map = new Map<string, UnitDef>();
  for (const d of defs) {
    if (map.has(d.id)) throw new Error(`Duplicate unit id: ${d.id}`);
    map.set(d.id, d);
  }
  const byCat = new Map<UnitCategory, UnitDef[]>();
  for (const d of defs) {
    const arr = byCat.get(d.category) ?? [];
    arr.push(d);
    byCat.set(d.category, arr);
  }
  return {
    get: (id) => map.get(id),
    require: (id) => {
      const d = map.get(id);
      if (!d) throw new Error(`Unknown unit id: ${id}`);
      return d;
    },
    has: (id) => map.has(id),
    list: () => defs,
    byCategory: () => byCat as ReadonlyMap<UnitCategory, readonly UnitDef[]>,
  };
}

/** 기본 카탈로그 — 시드된 표준 단위들. */
export const defaultUnitCatalog: UnitCatalog = buildCatalog(ALL);

/** 사용자 정의 단위까지 더해 새 카탈로그 만들기. */
export function extendCatalog(extra: readonly UnitDef[]): UnitCatalog {
  return buildCatalog([...ALL, ...extra]);
}

/** 카테고리별 한국어 라벨 — 인스펙터에서 그룹 헤더로 쓰임. */
export const categoryLabels: Record<UnitCategory, string> = {
  physical: '물리량',
  electrical: '전기',
  temperature: '온도',
  time: '시간',
  money: '금액',
  count: '횟수·비율',
  rating: '척도',
  abstract: '추상',
  free: '자유',
};
