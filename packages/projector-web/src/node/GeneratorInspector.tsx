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

/** counter paradigm 기본값. */
const COUNTER_DEFAULTS = { kind: 'counter' as const, start: 1, step: 1 };
/** random paradigm 기본값. */
const RANDOM_DEFAULTS = {
  kind: 'random' as const,
  min: 0,
  max: 1,
  integer: false,
  seed: 0,
};

/**
 * Generator 노드 옆에 떠 있는 paradigm·매개변수 편집 패널.
 *
 * - paradigm: counter / random 토글. 변경 시 default params로 교체.
 * - counter: start·step 숫자 입력.
 * - random: min·max·integer·seed.
 *
 * 매개변수 변경은 model에만 즉시 반영. 실행 중인 cursor는 다음 emit 시 paradigm
 * 불일치가 감지되면 자동 재초기화되므로 (registry.ensureRuntimeMatchesParams 경로)
 * 매개변수만 바꿔도 안전. start·seed 변경을 즉시 반영하려면 노드의 ↺ 버튼.
 */
export function GeneratorInspector({ node }: Props): JSX.Element {
  const { modelStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);

  const setParams = useCallback(
    (next: GeneratorParams) => {
      updateNode(node.id, { params: next });
    },
    [node.id, updateNode],
  );

  const onPickParadigm = useCallback(
    (kind: 'counter' | 'random') => {
      if (!kind || kind === node.params.kind) return;
      setParams(kind === 'counter' ? COUNTER_DEFAULTS : RANDOM_DEFAULTS);
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
              v === 'counter' || v === 'random' ? onPickParadigm(v) : undefined
            }
            className="trama-unit-inspector-categories"
            aria-label="생성 방식"
          >
            <ToggleGroup.Item value="counter" className="trama-unit-inspector-chip">
              카운터
            </ToggleGroup.Item>
            <ToggleGroup.Item value="random" className="trama-unit-inspector-chip">
              랜덤
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
          <CounterFields params={node.params} onChange={setParams} />
        ) : (
          <RandomFields params={node.params} onChange={setParams} />
        )}
      </div>
    </>
  );
}

interface CounterProps {
  params: Extract<GeneratorParams, { kind: 'counter' }>;
  onChange: (next: GeneratorParams) => void;
}

function CounterFields({ params, onChange }: CounterProps): JSX.Element {
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

interface RandomProps {
  params: Extract<GeneratorParams, { kind: 'random' }>;
  onChange: (next: GeneratorParams) => void;
}

function RandomFields({ params, onChange }: RandomProps): JSX.Element {
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
