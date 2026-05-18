import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isObserveNode,
  isSequence,
  outputKey,
  resolveScalar,
  unwrap,
  type NodeId,
} from '@trama/core';
import type { SequenceSample } from '@trama/core';
import { useTrama } from '../store/index.js';
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
const EMPTY_BUFFER: SequenceSample[] = [];

function ObserveNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const samples = modelStore((s) => s.executionState.observeBuffers[id] ?? EMPTY_BUFFER);
  // 누적 버퍼는 Value[] 그대로지만 current 는 ExecValue 가 들어올 수 있다 —
  // 시각화는 alue 만 보면 충분하므로 unwrap 후 노출.
  const current = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    return unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
  });
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
