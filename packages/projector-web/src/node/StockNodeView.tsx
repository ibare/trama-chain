import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isSequence,
  isStockNode,
  outputKey,
  resolveScalar,
  unwrap,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode, supportsDisplayModeToggle } from './display-mode.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { ModeToggle } from './ModeToggle.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function formatLevel(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function StockNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  // ExecValue 는 wrapped·function-handle 가능 — primitive 수치만 추출해 selector
  // 안정화 (AverageNodeView 와 동일 패턴).
  const currentNumber = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    const v = unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
    return v.kind === 'numeric' ? v.n : null;
  });
  const isLevelValid = modelStore((s) =>
    s.executionState.validOutputs.has(outputKey(id, 0)),
  );

  const updateNode = modelStore((s) => s.updateNode);
  const outputLevelConnected = useOutputConnected(id, 0);
  const outputOverflowConnected = useOutputConnected(id, 1);
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
    return socketRegistry.register({
      nodeId: id,
      offset: { x: layout.leftPin.cx, y: layout.leftPin.cy },
    });
  }, [id, layout, socketRegistry]);

  const getLevelStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const getOverflowStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[1];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const {
    onPointerDown: onLevelSocketPointerDown,
    onPointerUp: onLevelSocketPointerUp,
  } = useEdgeDraftSource(id, {
    enabled: !!layout,
    getStartPoint: getLevelStartPoint,
    sourceSlotIndex: 0,
  });
  const {
    onPointerDown: onOverflowSocketPointerDown,
    onPointerUp: onOverflowSocketPointerUp,
  } = useEdgeDraftSource(id, {
    enabled: !!layout,
    getStartPoint: getOverflowStartPoint,
    sourceSlotIndex: 1,
  });

  const currentMode = node ? resolveDisplayMode(node) : 'standard';
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
  if (!isStockNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { width, height, labelY, textX, valueY, panelCx, panelCy } = layout;
  const stateClass = isLevelValid ? 'is-focal' : 'is-calm';

  const valueText =
    isLevelValid && currentNumber !== null ? formatLevel(currentNumber) : '—';

  const showModeToggle = supportsDisplayModeToggle(node);

  // 좌측 핀 두 슬롯: 0=inflow, 1=outflow.
  const inflowSocket = layout.leftPin.sockets[0];
  const outflowSocket = layout.leftPin.sockets[1];
  // 우측 핀 두 슬롯: 0=level, 1=overflow.
  const levelSocket = layout.rightPin.sockets[0];
  const overflowSocket = layout.rightPin.sockets[1];

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
      className="trama-stock-node"
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={layout.panelWidth}
        height={layout.panelHeight}
        cx={panelCx}
        cy={panelCy}
        stateClass={stateClass}
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

      <text
        className={`trama-node-value${currentMode === 'compact' ? ' is-compact' : ''}`}
        x={layout.labelAnchor === 'middle' ? 0 : textX}
        y={valueY}
        textAnchor={layout.labelAnchor}
        dominantBaseline={currentMode === 'compact' ? 'central' : undefined}
      >
        {valueText}
      </text>

      {inflowSocket && (
        <Socket cx={inflowSocket.x} cy={inflowSocket.y} connected={incomingCount > 0} />
      )}
      {outflowSocket && (
        <Socket cx={outflowSocket.x} cy={outflowSocket.y} connected={incomingCount > 0} />
      )}

      {showModeToggle && (
        <ModeToggle
          panelRight={panelCx + layout.panelWidth / 2}
          panelTop={panelCy - layout.panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
        />
      )}

      {levelSocket && (
        <>
          <Socket
            cx={levelSocket.x}
            cy={levelSocket.y}
            connected={outputLevelConnected}
          />
          <circle
            className="trama-node-socket-hit"
            cx={levelSocket.x}
            cy={levelSocket.y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onLevelSocketPointerDown}
            onPointerUp={onLevelSocketPointerUp}
          />
        </>
      )}
      {overflowSocket && (
        <>
          <Socket
            cx={overflowSocket.x}
            cy={overflowSocket.y}
            connected={outputOverflowConnected}
          />
          <circle
            className="trama-node-socket-hit"
            cx={overflowSocket.x}
            cy={overflowSocket.y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onOverflowSocketPointerDown}
            onPointerUp={onOverflowSocketPointerUp}
          />
        </>
      )}
    </NodeFrame>
  );
}

export const StockNodeView = memo(StockNodeViewImpl);
