import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import * as Form from '@radix-ui/react-form';
import { useCallback, useEffect, useState } from 'react';
import type { GeneratorNode, GeneratorParams } from '@trama-chain/core';
import { useTrama } from '../store/index.js';
import { NumberField } from '../util/NumberField.js';

interface Props {
  node: GeneratorNode;
}

type ParadigmKind = GeneratorParams['kind'];

/** counter paradigm 기본값. */
const COUNTER_DEFAULTS = { kind: 'counter' as const, start: 1, step: 1 };
/** 균등분포 기본값. */
const UNIFORM_DEFAULTS = {
  kind: 'uniform' as const,
  min: 0,
  max: 1,
  integer: false,
  seed: 0,
};
/** 정규분포 기본값 — 표준정규(평균 0, 표준편차 1). */
const NORMAL_DEFAULTS = {
  kind: 'normal' as const,
  mean: 0,
  stdev: 1,
  seed: 0,
};
/** 사인파 기본값 — 진폭 1, 주기 5s (ω = 2π/5). 위상·영점은 paradigm 내부 0 고정. */
const SINE_DEFAULTS = {
  kind: 'sine' as const,
  amplitude: 1,
  omega: (2 * Math.PI) / 5,
};
/** 스텝 기본값 — 1초 후 1을 계속 출력. */
const STEP_DEFAULTS = { kind: 'step' as const, startMs: 1000, value: 1 };
/** 펄스 기본값 — 0.5초마다 1을 한 tick 출력. */
const PULSE_DEFAULTS = { kind: 'pulse' as const, periodMs: 500, value: 1 };
/** 스케줄 기본값 — (0ms, 0) → (1000ms, 1) 두 점 시퀀스. */
const SCHEDULE_DEFAULTS = {
  kind: 'schedule' as const,
  points: [
    { tMs: 0, value: 0 },
    { tMs: 1000, value: 1 },
  ],
  loop: false,
};

function defaultsFor(kind: ParadigmKind): GeneratorParams {
  switch (kind) {
    case 'counter':
      return COUNTER_DEFAULTS;
    case 'uniform':
      return UNIFORM_DEFAULTS;
    case 'normal':
      return NORMAL_DEFAULTS;
    case 'sine':
      return SINE_DEFAULTS;
    case 'step':
      return STEP_DEFAULTS;
    case 'pulse':
      return PULSE_DEFAULTS;
    case 'schedule':
      return SCHEDULE_DEFAULTS;
  }
}

function isParadigmKind(v: string): v is ParadigmKind {
  return (
    v === 'counter' ||
    v === 'uniform' ||
    v === 'normal' ||
    v === 'sine' ||
    v === 'step' ||
    v === 'pulse' ||
    v === 'schedule'
  );
}

/**
 * Generator 노드 옆에 떠 있는 paradigm·매개변수 편집 패널.
 *
 * - paradigm: counter / 균등 / 정규 / 사인 / 스텝 / 펄스 / 스케줄 토글.
 *   변경 시 default params로 교체.
 * - counter: start·step.
 * - uniform: min·max·integer·seed.
 * - normal: mean·stdev·seed.
 * - sine: amplitude·omega. (위상·영점은 paradigm 내부 0 고정 — UI 미노출)
 * - step: startMs·value.
 * - pulse: periodMs·value.
 * - schedule: points[]·loop.
 *
 * 숫자 입력은 모두 NumberField 공통 컴포넌트 — scrub(상하 드래그)·dblclick→type·
 * 키보드 ↑/↓ 세 모드. 표시·증감 자릿수는 precision 으로 통일.
 *
 * 매개변수 변경은 model에만 즉시 반영. 실행 중인 cursor는 다음 emit 시 paradigm
 * 불일치가 감지되면 자동 재초기화되므로 (registry.ensureRuntimeMatchesParams 경로)
 * 매개변수만 바꿔도 안전. start·seed 변경을 즉시 반영하려면 노드의 ↺ 버튼.
 */
export function GeneratorInspector({ node }: Props): JSX.Element {
  const { modelStore, timeSettingsStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);
  const paused = timeSettingsStore((s) => s.paused);
  const disabled = !paused;

  const setParams = useCallback(
    (next: GeneratorParams) => {
      updateNode(node.id, { params: next });
    },
    [node.id, updateNode],
  );

  const onPickParadigm = useCallback(
    (kind: ParadigmKind) => {
      if (!kind || kind === node.params.kind) return;
      setParams(defaultsFor(kind));
    },
    [node.params.kind, setParams],
  );

  return (
    <>
      <header className="trama-unit-inspector-header">
        <span>생성기</span>
        <Popover.Close className="trama-unit-inspector-close" aria-label="닫기">
          ×
        </Popover.Close>
      </header>

      <div className="trama-observe-inspector-section">
        <div className="trama-unit-inspector-section-row">
          <span className="trama-unit-inspector-section-label">방식</span>
          <ToggleGroup.Root
            type="single"
            value={node.params.kind}
            onValueChange={(v) =>
              isParadigmKind(v) ? onPickParadigm(v) : undefined
            }
            className="trama-unit-inspector-categories"
            aria-label="생성 방식"
            disabled={disabled}
          >
            <ToggleGroup.Item value="counter" className="trama-unit-inspector-chip">
              카운터
            </ToggleGroup.Item>
            <ToggleGroup.Item value="uniform" className="trama-unit-inspector-chip">
              균등
            </ToggleGroup.Item>
            <ToggleGroup.Item value="normal" className="trama-unit-inspector-chip">
              정규
            </ToggleGroup.Item>
            <ToggleGroup.Item value="sine" className="trama-unit-inspector-chip">
              사인
            </ToggleGroup.Item>
            <ToggleGroup.Item value="step" className="trama-unit-inspector-chip">
              스텝
            </ToggleGroup.Item>
            <ToggleGroup.Item value="pulse" className="trama-unit-inspector-chip">
              펄스
            </ToggleGroup.Item>
            <ToggleGroup.Item value="schedule" className="trama-unit-inspector-chip">
              스케줄
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
      </div>

      <Separator.Root
        className="trama-unit-inspector-sep"
        decorative
        orientation="horizontal"
      />

      <div className="trama-observe-inspector-section">
        {node.params.kind === 'counter' ? (
          <CounterFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : node.params.kind === 'uniform' ? (
          <UniformFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : node.params.kind === 'normal' ? (
          <NormalFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : node.params.kind === 'sine' ? (
          <SineFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : node.params.kind === 'step' ? (
          <StepFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : node.params.kind === 'pulse' ? (
          <PulseFields params={node.params} disabled={disabled} onChange={setParams} />
        ) : (
          <ScheduleFields params={node.params} disabled={disabled} onChange={setParams} />
        )}
      </div>
    </>
  );
}

interface CounterProps {
  params: Extract<GeneratorParams, { kind: 'counter' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function CounterFields({ params, disabled, onChange }: CounterProps): JSX.Element {
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="시작"
        value={params.start}
        precision={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, start: v })}
      />
      <NumberField
        label="증분"
        value={params.step}
        precision={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, step: v })}
      />
    </div>
  );
}

interface UniformProps {
  params: Extract<GeneratorParams, { kind: 'uniform' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function UniformFields({ params, disabled, onChange }: UniformProps): JSX.Element {
  // integer 토글이 외부에 있어 precision 을 동적으로 — integer=true 이면 정수 모드.
  // false 이면 첫 value 에서 추론(=undefined). 토글 시 외부에서 min/max 가 정수로
  // 재정규화되어 들어오므로 NumberField 의 useEffect 가 새 자릿수로 draft 재포맷.
  const precision = params.integer ? 0 : undefined;
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="최소"
        value={params.min}
        precision={precision}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, min: v })}
      />
      <NumberField
        label="최대"
        value={params.max}
        precision={precision}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, max: v })}
      />

      <div className="trama-unit-inspector-section-row">
        <span className="trama-unit-inspector-section-label">정수</span>
        <ToggleGroup.Root
          type="single"
          value={params.integer ? 'int' : 'real'}
          onValueChange={(v) => {
            if (v !== 'int' && v !== 'real') return;
            const integer = v === 'int';
            if (integer !== params.integer) {
              // integer 켤 때 기존 min/max 도 정수로 재정규화. 본문 Knob 와 동일 정책.
              const min = integer ? Math.round(params.min) : params.min;
              const max = integer ? Math.round(params.max) : params.max;
              onChange({ ...params, integer, min, max });
            }
          }}
          className="trama-unit-inspector-categories"
          aria-label="정수 여부"
          disabled={disabled}
        >
          <ToggleGroup.Item value="real" className="trama-unit-inspector-chip">
            실수
          </ToggleGroup.Item>
          <ToggleGroup.Item value="int" className="trama-unit-inspector-chip">
            정수
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>

      <NumberField
        label="시드"
        value={params.seed}
        precision={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, seed: v })}
      />
    </div>
  );
}

interface NormalProps {
  params: Extract<GeneratorParams, { kind: 'normal' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function NormalFields({ params, disabled, onChange }: NormalProps): JSX.Element {
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="평균"
        value={params.mean}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, mean: v })}
      />
      <NumberField
        label="표준편차"
        value={params.stdev}
        min={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, stdev: v })}
      />
      <NumberField
        label="시드"
        value={params.seed}
        precision={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, seed: v })}
      />
    </div>
  );
}

interface SineProps {
  params: Extract<GeneratorParams, { kind: 'sine' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function SineFields({ params, disabled, onChange }: SineProps): JSX.Element {
  // 모델은 omega(rad/s) 그대로 저장. 인스펙터는 사용자 친화 단위 T(초)로 표시·입력.
  // T = 2π/ω, ω = 2π/T. 본문 Knob 와 동일 변환.
  const periodS = (2 * Math.PI) / params.omega;
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="진폭"
        value={params.amplitude}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, amplitude: v })}
      />
      <NumberField
        label="주기"
        value={periodS}
        unit="s"
        min={0.01}
        disabled={disabled}
        onChange={(T) => {
          if (T <= 0) return;
          onChange({ ...params, omega: (2 * Math.PI) / T });
        }}
      />
    </div>
  );
}

interface StepProps {
  params: Extract<GeneratorParams, { kind: 'step' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function StepFields({ params, disabled, onChange }: StepProps): JSX.Element {
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="시작"
        value={params.startMs}
        unit="ms"
        precision={0}
        min={0}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, startMs: v })}
      />
      <NumberField
        label="값"
        value={params.value}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, value: v })}
      />
    </div>
  );
}

interface PulseProps {
  params: Extract<GeneratorParams, { kind: 'pulse' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function PulseFields({ params, disabled, onChange }: PulseProps): JSX.Element {
  return (
    <div className="trama-unit-inspector-range">
      <NumberField
        label="주기"
        value={params.periodMs}
        unit="ms"
        precision={0}
        min={1}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, periodMs: v })}
      />
      <NumberField
        label="값"
        value={params.value}
        disabled={disabled}
        onChange={(v) => onChange({ ...params, value: v })}
      />
    </div>
  );
}

interface ScheduleProps {
  params: Extract<GeneratorParams, { kind: 'schedule' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

/**
 * 스케줄은 (tMs, value) 짝 timeline. JSON 텍스트 영역으로 편집 — 파싱 성공 시에만
 * 모델에 반영, 실패 시 입력 그대로 두고 에러 메시지를 보여준다. loop는 토글.
 *
 * 정렬·중복 해소는 paradigm이 입력 그대로 선형 스캔하므로(schedule.ts 주석 참고)
 * 사용자가 시각 오름차순으로 입력하는 책임. UI에서 자동 정렬하지 않는다 — 명시적으로
 * 그린 것만 다룬다는 원칙.
 */
function ScheduleFields({ params, disabled, onChange }: ScheduleProps): JSX.Element {
  const [pointsDraft, setPointsDraft] = useState(formatPoints(params.points));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPointsDraft(formatPoints(params.points));
    setError(null);
  }, [params.points]);

  return (
    <Form.Root
      className="trama-unit-inspector-range"
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="points" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">시점·값</Form.Label>
        <Form.Control asChild>
          <textarea
            value={pointsDraft}
            disabled={disabled}
            rows={Math.max(2, params.points.length + 1)}
            className="trama-unit-inspector-range-input"
            placeholder="0, 0&#10;1000, 1"
            onChange={(e) => {
              const next = e.currentTarget.value;
              setPointsDraft(next);
              const parsed = parsePoints(next);
              if (parsed.ok) {
                setError(null);
                if (!samePoints(parsed.value, params.points)) {
                  onChange({ ...params, points: parsed.value });
                }
              } else {
                setError(parsed.error);
              }
            }}
          />
        </Form.Control>
      </Form.Field>
      {error ? (
        <div className="trama-unit-inspector-range-row" role="alert">
          <span className="trama-unit-inspector-range-label">에러</span>
          <span className="trama-unit-inspector-range-input">{error}</span>
        </div>
      ) : null}

      <div className="trama-unit-inspector-section-row">
        <span className="trama-unit-inspector-section-label">반복</span>
        <ToggleGroup.Root
          type="single"
          value={params.loop ? 'on' : 'off'}
          onValueChange={(v) => {
            if (v !== 'on' && v !== 'off') return;
            const loop = v === 'on';
            if (loop !== params.loop) onChange({ ...params, loop });
          }}
          className="trama-unit-inspector-categories"
          aria-label="반복 여부"
          disabled={disabled}
        >
          <ToggleGroup.Item value="off" className="trama-unit-inspector-chip">
            한 번
          </ToggleGroup.Item>
          <ToggleGroup.Item value="on" className="trama-unit-inspector-chip">
            반복
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
    </Form.Root>
  );
}

function formatPoints(points: readonly { tMs: number; value: number }[]): string {
  return points.map((p) => `${p.tMs}, ${p.value}`).join('\n');
}

function parsePoints(
  text: string,
):
  | { ok: true; value: { tMs: number; value: number }[] }
  | { ok: false; error: string } {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { ok: false, error: '한 줄 이상 필요' };
  const out: { tMs: number; value: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i]!.split(',').map((p) => p.trim());
    if (parts.length !== 2) {
      return { ok: false, error: `${i + 1}행: "tMs, value" 형식` };
    }
    const tMs = parseFloat(parts[0]!);
    const value = parseFloat(parts[1]!);
    if (!Number.isFinite(tMs) || !Number.isFinite(value)) {
      return { ok: false, error: `${i + 1}행: 숫자 파싱 실패` };
    }
    out.push({ tMs, value });
  }
  return { ok: true, value: out };
}

function samePoints(
  a: readonly { tMs: number; value: number }[],
  b: readonly { tMs: number; value: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.tMs !== b[i]!.tMs || a[i]!.value !== b[i]!.value) return false;
  }
  return true;
}
