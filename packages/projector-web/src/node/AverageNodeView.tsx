import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isAverageNode,
  isNumericValue,
  isSequence,
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

function formatAverage(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function AverageNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const currentValue = modelStore((s) => {
    const ev = s.executionState.values[id];
    if (ev === undefined || isSequence(ev)) return null;
    return unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
  });
  const isValid = modelStore((s) =>
    s.executionState.validOutputs.has(outputKey(id, 0)),
  );

  const updateNode = modelStore((s) => s.updateNode);
  const outputConnected = useOutputConnected(id);
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

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint,
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
  if (!isAverageNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { width, height, labelY, textX, valueY, panelCx, panelCy } = layout;
  const stateClass = isValid ? 'is-focal' : 'is-calm';

  const valueText =
    isValid && currentValue && isNumericValue(currentValue)
      ? formatAverage(currentValue.n)
      : '—';

  const showModeToggle = supportsDisplayModeToggle(node);

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
      className="trama-average-node"
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

      {layout.leftPin.sockets[0] && (
        <Socket
          cx={layout.leftPin.sockets[0].x}
          cy={layout.leftPin.sockets[0].y}
          connected={incomingCount > 0}
        />
      )}

      {showModeToggle && (
        <ModeToggle
          panelRight={panelCx + layout.panelWidth / 2}
          panelTop={panelCy - layout.panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
        />
      )}

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

export const AverageNodeView = memo(AverageNodeViewImpl);
