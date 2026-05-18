import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Separator from '@radix-ui/react-separator';
import * as Form from '@radix-ui/react-form';
import { useCallback, useEffect, useState } from 'react';
import type { GeneratorNode, GeneratorParams } from '@trama/core';
import { useTrama } from '../store/index.js';

interface Props {
  node: GeneratorNode;
}

// step·pulse·schedule paradigm은 5단계 UI 작업에서 정식 등록 예정 — 현 inspector는
// 4종 무시간 paradigm만 picker로 노출한다. 노드가 시간 기반 params를 갖더라도
// 모델은 정상 동작하고 inspector 필드만 null로 폴백한다.
type ParadigmKind = Exclude<GeneratorParams['kind'], 'step' | 'pulse' | 'schedule'>;

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
/** 사인파 기본값 — 진폭 1, 주기 20 emit (ω = 2π/20), 위상 0, 영점 0. */
const SINE_DEFAULTS = {
  kind: 'sine' as const,
  amplitude: 1,
  omega: (2 * Math.PI) / 20,
  phase: 0,
  offset: 0,
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
  }
}

function isParadigmKind(v: string): v is ParadigmKind {
  return v === 'counter' || v === 'uniform' || v === 'normal' || v === 'sine';
}

/**
 * Generator 노드 옆에 떠 있는 paradigm·매개변수 편집 패널.
 *
 * - paradigm: counter / 균등 / 정규 토글. 변경 시 default params로 교체.
 * - counter: start·step 숫자 입력.
 * - uniform: min·max·integer·seed.
 * - normal: mean·stdev·seed.
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
        ) : null}
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
  const [startDraft, setStartDraft] = useState(String(params.start));
  const [stepDraft, setStepDraft] = useState(String(params.step));
  useEffect(() => setStartDraft(String(params.start)), [params.start]);
  useEffect(() => setStepDraft(String(params.step)), [params.step]);

  return (
    <Form.Root
      className="trama-observe-inspector-size"
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="start" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">시작</Form.Label>
        <Form.Control
          type="number"
          value={startDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setStartDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.start) {
              onChange({ ...params, start: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="step" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">증분</Form.Label>
        <Form.Control
          type="number"
          value={stepDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setStepDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.step) {
              onChange({ ...params, step: v });
            }
          }}
        />
      </Form.Field>
    </Form.Root>
  );
}

interface UniformProps {
  params: Extract<GeneratorParams, { kind: 'uniform' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function UniformFields({ params, disabled, onChange }: UniformProps): JSX.Element {
  const [minDraft, setMinDraft] = useState(String(params.min));
  const [maxDraft, setMaxDraft] = useState(String(params.max));
  const [seedDraft, setSeedDraft] = useState(String(params.seed));
  useEffect(() => setMinDraft(String(params.min)), [params.min]);
  useEffect(() => setMaxDraft(String(params.max)), [params.max]);
  useEffect(() => setSeedDraft(String(params.seed)), [params.seed]);

  return (
    <Form.Root
      className="trama-observe-inspector-size"
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="min" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">최소</Form.Label>
        <Form.Control
          type="number"
          value={minDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setMinDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.min) {
              onChange({ ...params, min: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="max" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">최대</Form.Label>
        <Form.Control
          type="number"
          value={maxDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setMaxDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.max) {
              onChange({ ...params, max: v });
            }
          }}
        />
      </Form.Field>

      <div className="trama-unit-inspector-section-row">
        <span className="trama-unit-inspector-section-label">정수</span>
        <ToggleGroup.Root
          type="single"
          value={params.integer ? 'int' : 'real'}
          onValueChange={(v) => {
            if (v !== 'int' && v !== 'real') return;
            const integer = v === 'int';
            if (integer !== params.integer) onChange({ ...params, integer });
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

      <Form.Field name="seed" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">시드</Form.Label>
        <Form.Control
          type="number"
          value={seedDraft}
          step={1}
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setSeedDraft(next);
            const v = parseInt(next, 10);
            if (Number.isFinite(v) && v !== params.seed) {
              onChange({ ...params, seed: v });
            }
          }}
        />
      </Form.Field>
    </Form.Root>
  );
}

interface NormalProps {
  params: Extract<GeneratorParams, { kind: 'normal' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function NormalFields({ params, disabled, onChange }: NormalProps): JSX.Element {
  const [meanDraft, setMeanDraft] = useState(String(params.mean));
  const [stdevDraft, setStdevDraft] = useState(String(params.stdev));
  const [seedDraft, setSeedDraft] = useState(String(params.seed));
  useEffect(() => setMeanDraft(String(params.mean)), [params.mean]);
  useEffect(() => setStdevDraft(String(params.stdev)), [params.stdev]);
  useEffect(() => setSeedDraft(String(params.seed)), [params.seed]);

  return (
    <Form.Root
      className="trama-observe-inspector-size"
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="mean" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">평균</Form.Label>
        <Form.Control
          type="number"
          value={meanDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setMeanDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.mean) {
              onChange({ ...params, mean: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="stdev" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">표준편차</Form.Label>
        <Form.Control
          type="number"
          value={stdevDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setStdevDraft(next);
            const v = parseFloat(next);
            // 표준편차는 음수일 수 없다. 0은 dirac-delta(=mean 상수)로 해석.
            if (Number.isFinite(v) && v >= 0 && v !== params.stdev) {
              onChange({ ...params, stdev: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="seed" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">시드</Form.Label>
        <Form.Control
          type="number"
          value={seedDraft}
          step={1}
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setSeedDraft(next);
            const v = parseInt(next, 10);
            if (Number.isFinite(v) && v !== params.seed) {
              onChange({ ...params, seed: v });
            }
          }}
        />
      </Form.Field>
    </Form.Root>
  );
}

interface SineProps {
  params: Extract<GeneratorParams, { kind: 'sine' }>;
  disabled?: boolean;
  onChange: (next: GeneratorParams) => void;
}

function SineFields({ params, disabled, onChange }: SineProps): JSX.Element {
  const [ampDraft, setAmpDraft] = useState(String(params.amplitude));
  const [omegaDraft, setOmegaDraft] = useState(String(params.omega));
  const [phaseDraft, setPhaseDraft] = useState(String(params.phase));
  const [offsetDraft, setOffsetDraft] = useState(String(params.offset));
  useEffect(() => setAmpDraft(String(params.amplitude)), [params.amplitude]);
  useEffect(() => setOmegaDraft(String(params.omega)), [params.omega]);
  useEffect(() => setPhaseDraft(String(params.phase)), [params.phase]);
  useEffect(() => setOffsetDraft(String(params.offset)), [params.offset]);

  return (
    <Form.Root
      className="trama-observe-inspector-size"
      onSubmit={(e) => e.preventDefault()}
    >
      <Form.Field name="amplitude" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">진폭 A</Form.Label>
        <Form.Control
          type="number"
          value={ampDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setAmpDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.amplitude) {
              onChange({ ...params, amplitude: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="omega" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">각속도 ω</Form.Label>
        <Form.Control
          type="number"
          value={omegaDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setOmegaDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.omega) {
              onChange({ ...params, omega: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="phase" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">위상 φ</Form.Label>
        <Form.Control
          type="number"
          value={phaseDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setPhaseDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.phase) {
              onChange({ ...params, phase: v });
            }
          }}
        />
      </Form.Field>
      <Form.Field name="offset" className="trama-unit-inspector-range-row">
        <Form.Label className="trama-unit-inspector-range-label">영점 D</Form.Label>
        <Form.Control
          type="number"
          value={offsetDraft}
          step="any"
          disabled={disabled}
          className="trama-unit-inspector-range-input"
          onChange={(e) => {
            const next = e.currentTarget.value;
            setOffsetDraft(next);
            const v = parseFloat(next);
            if (Number.isFinite(v) && v !== params.offset) {
              onChange({ ...params, offset: v });
            }
          }}
        />
      </Form.Field>
    </Form.Root>
  );
}
