import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isGeneratorNode,
  isSequence,
  resolveScalar,
  unwrap,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { ModeToggle } from './ModeToggle.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { Knob, SelectorKnob } from './knob/index.js';

/**
 * sine paradigm 주기(초) stops. 사용자 옵션 B — 주기는 의미 있는 프리셋만 노드
 * 표면에서 노출, 정밀 조정은 인스펙터 숫자 필드. omega 와 T 의 관계는
 * ω = 2π/T — Knob 은 T 단위로 표현하고 모델 저장은 omega 그대로.
 */
const SINE_PERIOD_STOPS_S: readonly number[] = [1, 2, 5, 10, 20, 60] as const;
/** sine paradigm 진폭 continuous 범위. */
const SINE_AMP_MIN = 0.1;
const SINE_AMP_MAX = 10;
const SINE_AMP_DEFAULT = 1;
const SINE_PERIOD_DEFAULT_S = 5;

/**
 * uniform paradigm 본문 Knob 의 min/max 표면 범위. 정밀 조정은 인스펙터로
 * 빠짐 — 본문 Knob 은 빠른 셋업용. 대칭 [-10, 10] · step 0.1 면 정수 모드의
 * 주사위(1~6) · 실수 모드 디폴트([0,1])를 모두 표현.
 */
const UNIFORM_RANGE_MIN = -10;
const UNIFORM_RANGE_MAX = 10;
const UNIFORM_STEP = 0.1;
const UNIFORM_MIN_DEFAULT = 0;
const UNIFORM_MAX_DEFAULT = 1;
/** SelectorKnob 정수/실수 stops — 인덱스 0=실수, 1=정수. 인스펙터 토글 순서와 일치. */
const UNIFORM_INTEGER_STOPS: readonly number[] = [0, 1] as const;

function formatUniformValue(v: number, integer: boolean): string {
  if (!Number.isFinite(v)) return '·';
  return integer ? String(Math.round(v)) : v.toFixed(1);
}

function nearestStop(value: number, stops: readonly number[]): number {
  let best = stops[0]!;
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < stops.length; i++) {
    const d = Math.abs(value - stops[i]!);
    if (d < bestDist) {
      bestDist = d;
      best = stops[i]!;
    }
  }
  return best;
}

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function formatGeneratorValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function GeneratorNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  // FunctionHandle.peek 은 매 호출 새 Value 객체를 만든다. selector 가 객체를 반환하면
  // zustand useSyncExternalStore 가 한 render 에서 두 번의 getSnapshot 결과를 다르게 보고
  // 무한 update 루프를 띄운다. UI 는 수치 표시만 필요하므로 primitive 로 환원한다.
  const currentNumber = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    const v = unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
    return v.kind === 'numeric' ? v.n : null;
  });
  const updateNode = modelStore((s) => s.updateNode);
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );
  const selectNode = uiStore((s) => s.selectNode);
  const openInspector = uiStore((s) => s.openUnitInspector);
  const outputConnected = useOutputConnected(id);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, {
    incomingCount,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

  // 좌측 입력 socket을 socket registry에 등록 — 엣지 드롭이 이 위치로 맞춰 들어온다.
  useEffect(() => {
    if (!layout) return;
    return socketRegistry.register({
      nodeId: id,
      offset: { x: layout.leftPin.cx, y: layout.leftPin.cy },
    });
  }, [id, layout, socketRegistry]);

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint,
    });

  const currentMode = node ? resolveDisplayMode(node) : 'compact';
  const onToggleMode = useCallback(() => {
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, updateNode]);

  const onBodyDoubleClick = useCallback(() => {
    selectNode(id);
    openInspector(id);
  }, [id, openInspector, selectNode]);

  if (!node) return null;
  if (!isGeneratorNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { width, height, labelY, textX, valueY, panelCx, panelCy } = layout;

  const valueText =
    currentNumber !== null ? formatGeneratorValue(currentNumber) : '—';

  const isSine = node.params.kind === 'sine';
  const isUniform = node.params.kind === 'uniform';
  // sine paradigm 본문 — knob 두 개(주기·진폭) 배치.
  // 주기는 stepped (사용자 옵션 B), 진폭은 continuous.
  // compact 모드는 패널이 좁아 knob 위쪽 라벨("주기"/"진폭")을 끄고 centerLabel
  // (값+단위)만 남긴다 — 좌·우 위치로 두 knob 을 식별.
  const sineKnobs = (() => {
    if (!isSine) return null;
    const body = layout.generatorBody;
    if (!body) return null;
    const params = node.params;
    if (params.kind !== 'sine') return null;
    const periodS = (2 * Math.PI) / params.omega;
    const periodSnap = nearestStop(periodS, SINE_PERIOD_STOPS_S);
    const cy = body.y + body.h / 2;
    const leftCx = body.x + body.w * 0.28;
    const rightCx = body.x + body.w * 0.72;
    const knobSize = currentMode === 'compact' ? 'compact' : 'standard';
    const showLabel = currentMode !== 'compact';
    const setPeriod = (T: number) => {
      const omega = (2 * Math.PI) / T;
      updateNode(id, { params: { ...params, omega } });
    };
    const setAmplitude = (a: number) => {
      updateNode(id, { params: { ...params, amplitude: a } });
    };
    return (
      <>
        <Knob
          cx={leftCx}
          cy={cy}
          size={knobSize}
          value={periodSnap}
          mode={{ kind: 'stepped', stops: SINE_PERIOD_STOPS_S }}
          defaultValue={SINE_PERIOD_DEFAULT_S}
          onChange={setPeriod}
          ariaLabel="주기"
          label={showLabel ? '주기' : undefined}
          centerLabel={`${periodSnap}s`}
        />
        <Knob
          cx={rightCx}
          cy={cy}
          size={knobSize}
          value={params.amplitude}
          mode={{ kind: 'continuous', min: SINE_AMP_MIN, max: SINE_AMP_MAX }}
          defaultValue={SINE_AMP_DEFAULT}
          step={0.1}
          onChange={setAmplitude}
          ariaLabel="진폭"
          label={showLabel ? '진폭' : undefined}
          centerLabel={params.amplitude.toFixed(1)}
        />
      </>
    );
  })();

  // uniform paradigm 본문 — standard·compact 동일하게 min·max·정수실수 3개.
  // min/max 는 continuous Knob (정밀 조정은 인스펙터), 정수/실수 토글은 2-stop
  // SelectorKnob. compact 에서는 사이즈만 축소하고 라벨(상단 텍스트)을 끈다.
  const uniformKnobs = (() => {
    if (!isUniform) return null;
    const body = layout.generatorBody;
    if (!body) return null;
    const params = node.params;
    if (params.kind !== 'uniform') return null;
    const cy = body.y + body.h / 2;
    const knobSize = currentMode === 'compact' ? 'compact' : 'standard';
    const showLabel = currentMode !== 'compact';
    const setMin = (v: number) => {
      updateNode(id, { params: { ...params, min: v } });
    };
    const setMax = (v: number) => {
      updateNode(id, { params: { ...params, max: v } });
    };
    const setInteger = (sel: number) => {
      const integer = sel === 1;
      if (integer !== params.integer) {
        updateNode(id, { params: { ...params, integer } });
      }
    };
    const continuousMode = {
      kind: 'continuous' as const,
      min: UNIFORM_RANGE_MIN,
      max: UNIFORM_RANGE_MAX,
    };
    const integerSelectorValue = params.integer ? 1 : 0;
    const integerCenterLabel = params.integer ? '정수' : '실수';
    // body.w 를 6:8:14 / 16 비율로 좌·중·우 배치 — standard·compact 공통.
    const cx0 = body.x + body.w * (3 / 16);
    const cx1 = body.x + body.w * (8 / 16);
    const cx2 = body.x + body.w * (13 / 16);
    return (
      <>
        <Knob
          cx={cx0}
          cy={cy}
          size={knobSize}
          value={params.min}
          mode={continuousMode}
          defaultValue={UNIFORM_MIN_DEFAULT}
          step={UNIFORM_STEP}
          onChange={setMin}
          ariaLabel="최소"
          label={showLabel ? '최소' : undefined}
          centerLabel={formatUniformValue(params.min, params.integer)}
        />
        <Knob
          cx={cx1}
          cy={cy}
          size={knobSize}
          value={params.max}
          mode={continuousMode}
          defaultValue={UNIFORM_MAX_DEFAULT}
          step={UNIFORM_STEP}
          onChange={setMax}
          ariaLabel="최대"
          label={showLabel ? '최대' : undefined}
          centerLabel={formatUniformValue(params.max, params.integer)}
        />
        <SelectorKnob
          cx={cx2}
          cy={cy}
          size={knobSize}
          value={integerSelectorValue}
          stops={UNIFORM_INTEGER_STOPS}
          defaultValue={0}
          onChange={setInteger}
          ariaLabel="수형"
          label={showLabel ? '수형' : undefined}
          centerLabel={integerCenterLabel}
        />
      </>
    );
  })();

  const bodyKnobs = sineKnobs ?? uniformKnobs;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      panelCx={panelCx}
      panelCy={panelCy}
      panelWidth={layout.panelWidth}
      panelHeight={layout.panelHeight}
      className="trama-generator-node"
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={layout.panelWidth}
        height={layout.panelHeight}
        cx={panelCx}
        cy={panelCy}
        stateClass="is-focal"
        isSelected={isSelected}
      />

      <text
        className="trama-node-label"
        x={layout.labelAnchor === 'middle' ? 0 : textX}
        y={labelY}
        textAnchor={layout.labelAnchor}
      >
        {node.label}
      </text>

      {bodyKnobs ?? (
        <text
          className={`trama-node-value${currentMode === 'compact' ? ' is-compact' : ''}`}
          x={0}
          y={valueY}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {valueText}
        </text>
      )}

      {/* 좌측 입력 socket — boolean gate. incoming이 있으면 connected 표시. */}
      {layout.leftPin.sockets[0] && (
        <Socket
          cx={layout.leftPin.sockets[0].x}
          cy={layout.leftPin.sockets[0].y}
          connected={incomingCount > 0}
        />
      )}

      <ModeToggle
        panelRight={panelCx + layout.panelWidth / 2}
        panelTop={panelCy - layout.panelHeight / 2}
        mode={currentMode}
        onToggle={onToggleMode}
      />

      {/* 우측 단일 출력 소켓 */}
      {layout.rightPin.sockets[0] && (
        <>
          <Socket
            cx={layout.rightPin.sockets[0].x}
            cy={layout.rightPin.sockets[0].y}
            connected={outputConnected}
          />
          <circle
            className="trama-node-socket-hit"
            cx={layout.rightPin.sockets[0].x}
            cy={layout.rightPin.sockets[0].y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown}
            onPointerUp={onSocketPointerUp}
          />
        </>
      )}
    </NodeFrame>
  );
}

export const GeneratorNodeView = memo(GeneratorNodeViewImpl);
