import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import { isGeneratorNode, isNumericValue, unwrap, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { ModeToggle } from './ModeToggle.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { PhosphorGlyph } from '../icon/phosphor.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);
// BUTTON_SIZE 는 box.ts 의 GENERATOR_CONTROLS_H(=26) 슬롯 안에 정확히 들어가는
// 값. compact 모드의 외곽 컨트롤 슬롯(36)에서는 위·아래 여유가 자연스럽게 남는다.
const BUTTON_SIZE = 26;
const BUTTON_GAP = 10;
const GLYPH_SIZE = 16;

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
  const enabled = modelStore(
    (s) => s.executionState.generatorRuntime[id]?.enabled ?? false,
  );
  // executionState.values 는 ExecValue — UI 표시는 alue 만 필요하므로 selector 에서 unwrap.
  const currentValue = modelStore((s) => {
    const ev = s.executionState.values[id];
    return ev === undefined ? null : unwrap(ev);
  });
  const setGeneratorEnabled = modelStore((s) => s.setGeneratorEnabled);
  const resetGenerator = modelStore((s) => s.resetGenerator);
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

  const onToggle = useCallback(() => {
    setGeneratorEnabled(id, !enabled);
  }, [enabled, id, setGeneratorEnabled]);
  const onReset = useCallback(() => {
    resetGenerator(id);
  }, [id, resetGenerator]);

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

  const { width, height, labelY, textX, valueY, generatorBody, panelCx, panelCy } = layout;
  const stateClass = enabled ? 'is-focal' : 'is-calm';

  const valueText =
    currentValue && isNumericValue(currentValue)
      ? formatGeneratorValue(currentValue.n)
      : '—';

  // 원형 토글 ▶/⏸ + ↺ 리셋 2버튼을 가로로 배치 — body 영역 중앙 정렬.
  // 미니플레이어와 동일 결: 재생/정지는 한 자리에서 글리프만 토글.
  const totalButtonsW = BUTTON_SIZE * 2 + BUTTON_GAP;
  const buttonsStartX = generatorBody
    ? generatorBody.x + (generatorBody.w - totalButtonsW) / 2
    : 0;
  const buttonY = generatorBody
    ? generatorBody.y + (generatorBody.h - BUTTON_SIZE) / 2
    : 0;
  const buttonRadius = BUTTON_SIZE / 2;

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
        x={0}
        y={valueY}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {valueText}
      </text>

      {/* 좌측 입력 socket — boolean gate. incoming이 있으면 connected 표시. */}
      {layout.leftPin.sockets[0] && (
        <Socket
          cx={layout.leftPin.sockets[0].x}
          cy={layout.leftPin.sockets[0].y}
          connected={incomingCount > 0}
        />
      )}

      {/* 입력 연결되면 사용자 토글 컨트롤은 의미를 잃으므로 숨김 — gate가 emit을 결정. */}
      {generatorBody && incomingCount === 0 && (
        <>
          {/* play/pause 토글 — enabled에 따라 글리프만 바뀜. 원형 hit-area. */}
          <InteractiveArea
            x={buttonsStartX}
            y={buttonY}
            width={BUTTON_SIZE}
            height={BUTTON_SIZE}
            rx={buttonRadius}
            ry={buttonRadius}
            hitClassName="trama-generator-btn"
            onClick={onToggle}
          >
            <PhosphorGlyph
              name={enabled ? 'pause' : 'play'}
              cx={buttonsStartX + BUTTON_SIZE / 2}
              cy={buttonY + BUTTON_SIZE / 2}
              size={GLYPH_SIZE}
              className="trama-generator-btn-glyph"
            />
          </InteractiveArea>

          {/* reset — 원형 hit-area. */}
          <InteractiveArea
            x={buttonsStartX + BUTTON_SIZE + BUTTON_GAP}
            y={buttonY}
            width={BUTTON_SIZE}
            height={BUTTON_SIZE}
            rx={buttonRadius}
            ry={buttonRadius}
            hitClassName="trama-generator-btn"
            onClick={onReset}
          >
            <PhosphorGlyph
              name="reset"
              cx={buttonsStartX + BUTTON_SIZE + BUTTON_GAP + BUTTON_SIZE / 2}
              cy={buttonY + BUTTON_SIZE / 2}
              size={GLYPH_SIZE}
              className="trama-generator-btn-glyph"
            />
          </InteractiveArea>
        </>
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
