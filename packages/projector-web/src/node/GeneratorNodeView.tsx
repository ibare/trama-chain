import { memo, useCallback } from 'react';
import { tokens } from '@trama/tokens';
import { isGeneratorNode, isNumericValue, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
const BUTTON_W = 36;
const BUTTON_GAP = 8;

function formatGeneratorValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1_000_000 || (abs > 0 && abs < 0.001)) return v.toExponential(2);
  return v.toFixed(3);
}

function GeneratorNodeViewImpl({ id }: Props): JSX.Element | null {
  const { modelStore, uiStore } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const enabled = modelStore(
    (s) => s.executionState.generatorRuntime[id]?.enabled ?? false,
  );
  const currentValue = modelStore((s) => s.executionState.values[id] ?? null);
  const setGeneratorEnabled = modelStore((s) => s.setGeneratorEnabled);
  const resetGenerator = modelStore((s) => s.resetGenerator);
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );
  const selectNode = uiStore((s) => s.selectNode);
  const openInspector = uiStore((s) => s.openUnitInspector);
  const outputConnected = useOutputConnected(id);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, { incomingCount: 0 });

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, {
      enabled: !!layout,
      getStartPoint: getOutputStartPoint,
    });

  const onPlay = useCallback(() => {
    setGeneratorEnabled(id, true);
  }, [id, setGeneratorEnabled]);
  const onStop = useCallback(() => {
    setGeneratorEnabled(id, false);
  }, [id, setGeneratorEnabled]);
  const onReset = useCallback(() => {
    resetGenerator(id);
  }, [id, resetGenerator]);

  const onBodyDoubleClick = useCallback(() => {
    selectNode(id);
    openInspector(id);
  }, [id, openInspector, selectNode]);

  if (!node) return null;
  if (!isGeneratorNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { width, height, labelY, textX, valueY, generatorBody } = layout;
  const stateClass = enabled ? 'is-focal' : 'is-calm';

  const valueText =
    currentValue && isNumericValue(currentValue)
      ? formatGeneratorValue(currentValue.n)
      : '—';

  // 컨트롤러 3개를 가로로 배치 — body 영역 중앙 정렬.
  const totalButtonsW = BUTTON_W * 3 + BUTTON_GAP * 2;
  const buttonsStartX = generatorBody
    ? generatorBody.x + (generatorBody.w - totalButtonsW) / 2
    : 0;
  const buttonsY = generatorBody ? generatorBody.y : 0;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      className={`trama-generator-node${enabled ? ' is-running' : ''}`}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={width}
        height={height}
        stateClass={stateClass}
        isSelected={isSelected}
      />

      <text className="trama-node-label" x={textX} y={labelY} textAnchor="start">
        {node.label}
      </text>

      <text
        className="trama-node-value"
        x={0}
        y={valueY}
        textAnchor="middle"
      >
        {valueText}
      </text>

      {generatorBody && (
        <>
          {/* ▶ 시작 */}
          <InteractiveArea
            x={buttonsStartX}
            y={buttonsY}
            width={BUTTON_W}
            height={generatorBody.h}
            rx={6}
            ry={6}
            hitClassName={`trama-generator-btn${enabled ? ' is-active' : ''}`}
            onClick={onPlay}
          >
            <text
              className="trama-generator-btn-glyph"
              x={buttonsStartX + BUTTON_W / 2}
              y={buttonsY + generatorBody.h / 2 + 5}
              textAnchor="middle"
            >
              {'▶'}
            </text>
          </InteractiveArea>

          {/* ■ 정지 */}
          <InteractiveArea
            x={buttonsStartX + BUTTON_W + BUTTON_GAP}
            y={buttonsY}
            width={BUTTON_W}
            height={generatorBody.h}
            rx={6}
            ry={6}
            hitClassName={`trama-generator-btn${!enabled ? ' is-active' : ''}`}
            onClick={onStop}
          >
            <text
              className="trama-generator-btn-glyph"
              x={buttonsStartX + BUTTON_W + BUTTON_GAP + BUTTON_W / 2}
              y={buttonsY + generatorBody.h / 2 + 5}
              textAnchor="middle"
            >
              {'■'}
            </text>
          </InteractiveArea>

          {/* ↺ 리셋 */}
          <InteractiveArea
            x={buttonsStartX + (BUTTON_W + BUTTON_GAP) * 2}
            y={buttonsY}
            width={BUTTON_W}
            height={generatorBody.h}
            rx={6}
            ry={6}
            hitClassName="trama-generator-btn"
            onClick={onReset}
          >
            <text
              className="trama-generator-btn-glyph"
              x={buttonsStartX + (BUTTON_W + BUTTON_GAP) * 2 + BUTTON_W / 2}
              y={buttonsY + generatorBody.h / 2 + 5}
              textAnchor="middle"
            >
              {'↺'}
            </text>
          </InteractiveArea>
        </>
      )}

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
