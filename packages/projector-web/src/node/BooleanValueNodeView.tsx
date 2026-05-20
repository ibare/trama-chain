import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import { isValueNode, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeBody } from './NodeBody.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeLabel } from './NodeLabel.js';
import { ModeToggle } from './ModeToggle.js';
import { InteractiveArea } from './InteractiveArea.js';
import { BooleanStateIcon } from './BooleanStateIcon.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { slotColor } from './slot-palette.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

/**
 * boolean ValueNode 전용 view.
 *
 * 본문 좌측에 결과 아이콘(✓/✗), 우측에 토글 스위치를 둔다. 토글 클릭으로
 * 참/거짓을 뒤집어 `scrubInitialValue`로 모델에 반영 — numeric ValueNode의
 * 슬라이더 scrub과 동일 채널.
 *
 * 외부 입력(lag=0 incoming)이 연결되면 사용자의 직접 조작은 의미를 잃으므로
 * 토글을 숨긴다. 이건 numeric 슬라이더 트랙이 입력 연결 시 사라지는 것과 같은
 * 패턴 — boolean도 동일하게 맞춘다. 아이콘은 propagation 값을 그대로 보여준다.
 *
 * ValueNodeView가 dispatcher 역할로 initialValue.kind에 따라 이 컴포넌트로
 * 라우팅한다 — 모델은 같은 'value' kind를 공유하고 view 레이어에서만 ValueKind
 * 별 표현을 분기한다.
 */
function BooleanValueNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry, timeSettingsStore } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  // 사용자 매뉴얼 송출기 UI 가시성 — numeric ValueNodeView 와 동일 정책.
  // 초기(t=0)이거나 재생 중일 때만 토글 노출. 일시정지엔 미렌더.
  const paused = timeSettingsStore((s) => s.paused);
  const isInitial = modelStore((s) => s.executionState.simulationTimeMs === 0);
  const userAuthoredVisible = isInitial || !paused;
  const currentBoolean = modelStore((s) => {
    const n = s.model.nodes[id];
    const fallback =
      n && isValueNode(n) && n.initialValue.kind === 'boolean'
        ? n.initialValue.b
        : false;
    const v = s.executionState.values[id];
    if (v && v.kind === 'boolean') return v.b;
    return fallback;
  });
  const updateNode = modelStore((s) => s.updateNode);
  const scrubInitialValue = modelStore((s) => s.scrubInitialValue);
  const emitValueOutput = modelStore((s) => s.emitValueOutput);
  const outputConnected = useOutputConnected(id);
  const selectNode = uiStore((s) => s.selectNode);
  const readOnly = uiStore((s) => s.readOnly);
  const isEditing = uiStore((s) => s.editingNode?.id === id);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );

  // numeric ValueNode와 동일 — lag=0 입력 엣지가 있으면 사용자가 직접 토글할
  // 의미가 사라지므로 토글 UI 자체를 숨긴다.
  const hasLag0Incoming = modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === id && e.lag === 0) return true;
    }
    return false;
  });

  // 좌표 폴백 — hook 순서를 위해 노드/위치 가드 전에 호출.
  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, {
    incomingCount,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

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

  const commitLabel = useCallback(
    (next: string) => {
      if (node && next !== node.label) updateNode(id, { label: next });
      setEditingNode(null);
    },
    [id, node, setEditingNode, updateNode],
  );
  const cancelLabel = useCallback(
    () => setEditingNode(null),
    [setEditingNode],
  );

  const onCombinerClick = useCallback(() => {
    if (readOnly) return;
    if (!node || !isValueNode(node)) return;
    const list = combinerRegistry.listForKind('boolean');
    if (list.length === 0) return;
    const idx = list.findIndex((d) => d.key === node.combiner);
    const next = list[(idx + 1) % list.length]!;
    selectNode(id);
    updateNode(id, { combiner: next.key });
  }, [id, node, readOnly, selectNode, updateNode]);

  const onToggleClick = useCallback(() => {
    if (readOnly) return;
    scrubInitialValue(id, !currentBoolean);
    // 토글은 단일 click — drag 단계 없이 즉시 다운스트림 emit.
    emitValueOutput(id);
  }, [id, currentBoolean, readOnly, scrubInitialValue, emitValueOutput]);

  const currentMode = node ? resolveDisplayMode(node) : 'compact';
  const onToggleMode = useCallback(() => {
    if (readOnly) return;
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, readOnly, updateNode]);

  if (!node || !isValueNode(node) || !node.position || !layout) return null;
  if (node.initialValue.kind !== 'boolean') return null;

  const { halfW, width, height, valueY, panelCx, panelCy, outerControlSlot } = layout;
  const stateClass = currentBoolean ? 'is-focal' : 'is-calm';
  const combiner = combinerRegistry.getOfKind(node.combiner, 'boolean');
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const isInputNode = !hasLag0Incoming;

  // compact일 때 토글은 패널 *밖* 외곽 컨트롤 슬롯으로. standard일 때는 패널 안쪽
  // 오른편(기존 동작 유지).
  const iconCx = outerControlSlot ? panelCx : -halfW + 32;
  const toggleCx = outerControlSlot ? panelCx : halfW - 40;
  const toggleCy = outerControlSlot ? outerControlSlot.cy : valueY;

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
      <NodeLabel
        text={node.label}
        x={layout.labelAnchor === 'middle' ? 0 : layout.textX}
        y={layout.labelY}
        width={width - (layout.textX - -halfW) * 2}
        textAnchor={layout.labelAnchor}
        isEditing={isEditing}
        onCommit={commitLabel}
        onCancel={cancelLabel}
      />

      <BooleanStateIcon cx={iconCx} cy={outerControlSlot ? panelCy : valueY} on={currentBoolean} />

      {!readOnly && !isEditing && (
        <ModeToggle
          panelRight={panelCx + layout.panelWidth / 2}
          panelTop={panelCy - layout.panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
        />
      )}

      {isInputNode && userAuthoredVisible && (
        <BooleanToggleSwitch
          cx={toggleCx}
          cy={toggleCy}
          on={currentBoolean}
          onClick={onToggleClick}
        />
      )}

      {layout.hasCombiner && layout.combinerCenterY !== null && (
        <BooleanCombinerChip
          label={combinerLabel}
          cy={layout.combinerCenterY}
          onClick={onCombinerClick}
        />
      )}

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
    </NodeFrame>
  );
}

export const BooleanValueNodeView = memo(BooleanValueNodeViewImpl);

/**
 * 토글 스위치 — 캡슐 track + 원형 handle. 클릭 시 onClick 발화.
 *
 * 노드 본문과 다른 인터랙션이므로 InteractiveArea로 hit-area를 분리한다.
 * pointerdown/pointermove stopPropagation·시각 자식 pointer-events:none이
 * 자동 적용되어 본체 drag 핸들러로 이벤트가 새지 않는다.
 */
function BooleanToggleSwitch({
  cx,
  cy,
  on,
  onClick,
}: {
  cx: number;
  cy: number;
  on: boolean;
  onClick: () => void;
}): JSX.Element {
  const w = 44;
  const h = 22;
  const handleR = 8;
  const handleCx = on ? cx + w / 2 - handleR - 3 : cx - w / 2 + handleR + 3;
  const trackCls = on
    ? 'trama-boolean-toggle-track is-on'
    : 'trama-boolean-toggle-track is-off';
  return (
    <InteractiveArea
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={h / 2}
      ry={h / 2}
      hitClassName="trama-boolean-toggle-hit"
      onClick={onClick}
    >
      <rect
        className={trackCls}
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={h / 2}
        ry={h / 2}
      />
      <circle
        className="trama-boolean-toggle-handle"
        cx={handleCx}
        cy={cy}
        r={handleR}
      />
    </InteractiveArea>
  );
}

function BooleanCombinerChip({
  label,
  cy,
  onClick,
}: {
  label: string;
  cy: number;
  onClick: () => void;
}): JSX.Element {
  const paddingX = parseFloat(tokens.spacing.combinerPaddingX);
  const fontSize = parseFloat(tokens.typography.textNodeUnit) * 16;
  const approxCharW = fontSize * 0.55;
  const innerW = label.length * approxCharW;
  const w = innerW + paddingX * 2;
  const h = parseFloat(tokens.spacing.combinerPaddingY) * 2 + fontSize + 2;
  const radius = Math.min(parseFloat(tokens.spacing.radiusCombiner), h / 2);
  return (
    <g
      className="trama-node-combiner-cycle"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <rect
        className="trama-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text
        className="trama-node-combiner-text"
        x={0}
        y={cy + fontSize / 3}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}
