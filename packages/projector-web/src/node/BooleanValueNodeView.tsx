import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import { isValueNode, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { useNodeLayout } from './use-node-layout.js';
import { NodeBody } from './NodeBody.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeLabel } from './NodeLabel.js';
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
 * 단위·스킨·슬라이더 트랙·scrub은 의미가 없으므로 모두 제거하고, 본문에 "참"/
 * "거짓" 텍스트만 표시한다. combiner chip을 클릭하면 boolean combiner
 * (and/or/xor) 사이를 순환해 인스펙터 진입 없이도 의도를 바꿀 수 있다.
 *
 * ValueNodeView가 dispatcher 역할로 initialValue.kind에 따라 이 컴포넌트로
 * 라우팅한다 — 모델은 같은 'value' kind를 공유하고 view 레이어에서만 ValueKind
 * 별 표현을 분기한다.
 */
function BooleanValueNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
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
  const outputConnected = useOutputConnected(id);
  const selectNode = uiStore((s) => s.selectNode);
  const readOnly = uiStore((s) => s.readOnly);
  const isEditing = uiStore((s) => s.editingNode?.id === id);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );

  // 좌표 폴백 — hook 순서를 위해 노드/위치 가드 전에 호출.
  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, { incomingCount });

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

  if (!node || !isValueNode(node) || !node.position || !layout) return null;
  if (node.initialValue.kind !== 'boolean') return null;

  const { halfW, width, height, textX, labelY, valueY } = layout;
  const valueText = currentBoolean ? '참' : '거짓';
  const stateClass = currentBoolean ? 'is-focal' : 'is-calm';
  const combiner = combinerRegistry.getOfKind(node.combiner, 'boolean');
  const combinerLabel = combiner?.labels.ko ?? node.combiner;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={width}
        height={height}
        stateClass={stateClass}
        isSelected={isSelected}
      />
      <NodeLabel
        text={node.label}
        x={textX}
        y={labelY}
        width={width - (textX - -halfW) * 2}
        isEditing={isEditing}
        onCommit={commitLabel}
        onCancel={cancelLabel}
      />
      <text
        className="trama-node-value"
        x={textX}
        y={valueY}
        textAnchor="start"
      >
        {valueText}
      </text>

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
