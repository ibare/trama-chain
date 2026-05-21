import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { tokens } from '@trama/tokens';
import {
  booleanValue,
  functionHandle,
  isFunctionHandle,
  isObserveNode,
  isSequence,
  numericValue,
  observeBufferToArray,
  outputKey,
  resolveScalar,
  unwrap,
  type FunctionHandle,
  type NodeId,
  type ObserveBuffer,
  type Value,
} from '@trama/core';
import type { SequenceSample } from '@trama/core';
import { useTrama } from '../store/index.js';
import { selectCableMedium } from '../store/edge-selectors.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeBody } from './NodeBody.js';
import { NodeFrame } from './NodeFrame.js';
import { ModeToggle } from './ModeToggle.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { slotColor } from './slot-palette.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { getObserveVisualization } from '../observe/registry.js';
import '../observe/register-default-visualizations.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const EMPTY_SAMPLES: SequenceSample[] = [];

function ObserveNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  // selector는 ObserveBuffer 그대로 받고(ref 안정성), array 변환은 ref 기반 useMemo로
  // 한 번만 — propagate 한 step마다 buf ref가 갱신될 때만 새 array를 만든다.
  const buffer: ObserveBuffer | undefined = modelStore(
    (s) => s.executionState.observeBuffers[id],
  );
  // sequence source 면 본체 자체가 sample 시퀀스이므로 누적 버퍼 대신 source
  // SequenceValue 의 samples 를 그대로 노출한다. ref 안정성은 propagate 가 매 step
  // 새 SequenceValue 객체를 만드므로 step 단위 갱신만 발생.
  const sourceSequenceSamples = modelStore((s) => {
    const ev = s.executionState.values[id];
    return ev && isSequence(ev) ? ev.samples : null;
  });
  const samples = useMemo(
    () =>
      sourceSequenceSamples ??
      (buffer ? observeBufferToArray(buffer) : EMPTY_SAMPLES),
    [buffer, sourceSequenceSamples],
  );
  // 누적 버퍼는 Value[] 그대로지만 current 는 ExecValue 가 들어올 수 있다 —
  // 시각화는 alue 만 보면 충분하므로 unwrap 후 노출. FunctionHandle.peek 은 매 호출
  // 새 Value 객체를 만들기에 selector 가 객체를 그대로 흘리면 useSyncExternalStore 가
  // 무한 update 루프를 감지한다. selector 는 primitive(kind + 원시값)만 반환하고
  // Value 객체는 useMemo 로 재구성.
  const currentKind = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    return unwrap(resolveScalar(ev, s.executionState.simulationTimeMs)).kind;
  });
  const currentNumber = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    const v = unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
    return v.kind === 'numeric' ? v.n : null;
  });
  const currentBoolean = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    const v = unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
    return v.kind === 'boolean' ? v.b : null;
  });
  const current = useMemo<Value | null>(() => {
    if (currentKind === 'numeric' && currentNumber !== null)
      return numericValue(currentNumber, 'free');
    if (currentKind === 'boolean' && currentBoolean !== null)
      return booleanValue(currentBoolean);
    return null;
  }, [currentKind, currentNumber, currentBoolean]);
  // FunctionHandle source — peek(t) 로 임의 시각의 Value 를 계산할 수 있는 closure.
  // 시각이 windowed 시간 도메인을 dense peek 해 sub-frame 매끄러운 곡선을 그릴 때
  // 사용. propagate 가 매 step 새 핸들 객체를 만들므로 ref 가 step 마다 갱신된다.
  const functionSource = modelStore((s) => {
    const ev = s.executionState.values[id];
    return ev && isFunctionHandle(ev) ? (ev as FunctionHandle) : null;
  });
  // 상류 source 가 continuous paradigm 인지(sin·stock 처럼 매 tick 변하는 신호).
  // 판정: body slot 0 으로 들어오는 첫 edge 의 cable medium.
  const upstreamIsContinuous = modelStore((s) => {
    const model = s.model;
    for (const eid of model.edgeOrder) {
      const e = model.edges[eid];
      if (!e || e.to !== id || e.lag !== 0) continue;
      if ((e.slotIndex ?? 0) !== 0) continue;
      return selectCableMedium(model, e.from, e.sourceSlotIndex ?? 0) === 'undulation';
    }
    return false;
  });
  // 시간축이 필요한 시각화가 current 를 sample 처럼 다룰 때의 t.
  // 동결 조건: 상류가 continuous 패러다임인데 현재 source 가 closure 가 아니다
  // (=generator gate OFF 직후 closing transition 으로 scalar 로 환원된 상태).
  // currentT 를 마지막 sample 의 t 로 고정해 sparkline windowed 도메인이 우→좌
  // sliding 을 멈추고, 신호 단절 시점의 그래프가 그대로 유지되게 한다 — 시간은
  // 흐르지만 신호 관측이 끊긴 상태의 시각적 표현. discrete source(counter 등)
  // 는 medium='particle' 이라 이 분기를 안 타고 sliding 유지.
  const lastSampleT = modelStore((s) => {
    const buf = s.executionState.observeBuffers[id];
    if (!buf) return null;
    const arr = observeBufferToArray(buf);
    return arr.length > 0 ? (arr[arr.length - 1]?.t ?? null) : null;
  });
  const simulationTimeMs = modelStore((s) => s.executionState.simulationTimeMs);
  const frozen = upstreamIsContinuous && functionSource === null && lastSampleT !== null;
  // currentT 는 항상 sim time 으로 둔다 — frozen 동안에도 window 가 자연스럽게 sliding
  // 해 ON 재개 시 window 가 갑자기 windowMs 전체로 펼쳐지는 jump 가 없게.
  const currentT = simulationTimeMs;
  // ON 동안 본 마지막 FunctionHandle 을 캐시. frozen 일 때 t > lastSampleT 영역은
  // 마지막 값에서 hold 하도록 clamp wrapper 로 감싼다 — "신호가 멎고 마지막 값이
  // 유지된다" 의 시각. sin paradigm 은 결정적 순수 함수라 cache 의 lifetime 동안
  // params 변경 없으면 같은 결과를 반환.
  const cachedFnRef = useRef<FunctionHandle | null>(null);
  if (functionSource) cachedFnRef.current = functionSource;
  const effectiveFunctionSource = useMemo<FunctionHandle | null>(() => {
    if (functionSource) return functionSource;
    if (!frozen) return null;
    const cached = cachedFnRef.current;
    if (!cached || lastSampleT === null) return null;
    const cap = lastSampleT;
    return functionHandle((t: number) => cached.peek(t < cap ? t : cap));
  }, [functionSource, frozen, lastSampleT]);
  const updateNode = modelStore((s) => s.updateNode);
  const outputConnected = useOutputConnected(id, 0);
  const extractionConnected = useOutputConnected(id, 1);
  // 누적 추출 슬롯의 valid 여부 — invalid면 socket을 흐리게 표시해 "아직 발사 없음" 시그널.
  const extractionValid = modelStore((s) =>
    s.executionState.validOutputs.has(outputKey(id, 1)),
  );
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );
  const selectNode = uiStore((s) => s.selectNode);
  const openInspector = uiStore((s) => s.openUnitInspector);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, {
    incomingCount,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

  useEffect(() => {
    if (!layout) return;
    const unreg = socketRegistry.register({
      nodeId: id,
      offset: { x: layout.leftPin.cx, y: layout.leftPin.cy },
    });
    return unreg;
  }, [id, layout, socketRegistry]);

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out
      ? { x: posX + out.x, y: posY + out.y }
      : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint,
    });
  const getExtractionStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[1];
    return out
      ? { x: posX + out.x, y: posY + out.y }
      : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const {
    onPointerDown: onExtractionPointerDown,
    onPointerUp: onExtractionPointerUp,
  } = useEdgeDraftSource(id, {
    enabled: !!layout,
    getStartPoint: getExtractionStartPoint,
    sourceSlotIndex: 1,
  });

  const onBodyDoubleClick = useCallback(() => {
    selectNode(id);
    openInspector(id);
  }, [id, openInspector, selectNode]);

  const currentMode = node && isObserveNode(node) ? resolveDisplayMode(node) : 'standard';
  const onToggleMode = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, uiStore, updateNode]);

  if (!node) return null;
  if (!isObserveNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { width, height, labelY, textX, observeBody, labelAnchor, panelCx, panelWidth, panelHeight, panelCy } = layout;
  const vis = getObserveVisualization(node.visualization);
  const Render = vis?.Render;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      panelCx={panelCx}
      panelCy={panelCy}
      panelWidth={panelWidth}
      panelHeight={panelHeight}
      className="trama-observe-node"
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={layout.panelWidth}
        height={layout.panelHeight}
        cx={layout.panelCx}
        cy={layout.panelCy}
        stateClass="is-calm"
        isSelected={isSelected}
      />

      <text
        className="trama-node-label"
        x={labelAnchor === 'middle' ? panelCx : textX}
        y={labelY}
        textAnchor={labelAnchor}
      >
        {node.label}
      </text>

      {observeBody && Render ? (
        <g transform={`translate(0 ${observeBody.y + observeBody.h / 2})`}>
          <Render
            node={node}
            samples={samples}
            current={current}
            currentT={currentT}
            functionSource={effectiveFunctionSource}
            frozen={frozen}
            halfW={observeBody.w / 2}
            halfH={observeBody.h / 2}
            compact={currentMode === 'compact'}
          />
        </g>
      ) : observeBody ? (
        <text
          className="trama-observe-empty-label"
          x={0}
          y={observeBody.y + observeBody.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          시각화 없음
        </text>
      ) : null}

      {layout.leftPin.sockets.map((s, i) => (
        <Socket
          key={`l${i}`}
          cx={s.x}
          cy={s.y}
          connected={i < incomingCount}
          color={slotColor(i, incomingCount)}
        />
      ))}

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

      {/* 누적 추출 슬롯(슬롯 1) — 노드 우상단에 분리 배치. 클래스로 시퀀스 채널임을
          표시해 별도 시각을 부여한다. invalid(아직 발사 없음) 면 흐림. */}
      {layout.rightPin.sockets[1] && (
        <g
          className={`trama-observe-extraction${extractionValid ? '' : ' is-pending'}`}
        >
          <Socket
            cx={layout.rightPin.sockets[1].x}
            cy={layout.rightPin.sockets[1].y}
            connected={extractionConnected}
          />
          <circle
            className="trama-node-socket-hit"
            cx={layout.rightPin.sockets[1].x}
            cy={layout.rightPin.sockets[1].y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onExtractionPointerDown}
            onPointerUp={onExtractionPointerUp}
          />
        </g>
      )}

      <ModeToggle
        panelRight={panelCx + panelWidth / 2}
        panelTop={panelCy - panelHeight / 2}
        mode={currentMode}
        onToggle={onToggleMode}
      />
    </NodeFrame>
  );
}

export const ObserveNodeView = memo(ObserveNodeViewImpl);
