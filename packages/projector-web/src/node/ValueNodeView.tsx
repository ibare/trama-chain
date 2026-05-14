import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import { isNumericValue, isValueNode, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { useNodeLayout } from './use-node-layout.js';
import { NodeBorderTrack } from './NodeBorderTrack.js';
import { NodeFrame } from './NodeFrame.js';
import { Socket } from './Socket.js';
import { ValueNodeCard } from './ValueNodeCard.js';
import { ValueNodeSkin } from './ValueNodeSkin.js';
import { useOutputConnected } from './use-socket-connections.js';
import { slotColor } from './slot-palette.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';
import { getLazySkin } from '../skin/registry.js';
import '../skin/register-default-skins.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function ValueNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore, uiStore, socketRegistry } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const currentValue = modelStore((s) => {
    const n = s.model.nodes[id];
    const fallbackVal =
      n && isValueNode(n) && isNumericValue(n.initialValue) ? n.initialValue.n : 0;
    const v = s.executionState.values[id];
    if (v && isNumericValue(v)) return v.n;
    return fallbackVal;
  });

  const updateNode = modelStore((s) => s.updateNode);
  const scrubInitialValue = modelStore((s) => s.scrubInitialValue);
  const outputConnected = useOutputConnected(id);
  const playbackStep = modelStore((s) => s.playbackStep);
  const trajectoryLength = modelStore((s) => s.trajectory.length);
  const selectNode = uiStore((s) => s.selectNode);
  const isEditing = uiStore((s) => s.editingNode?.id === id);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const openUnitInspector = uiStore((s) => s.openUnitInspector);
  const isSelected = uiStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );

  // lag=0 인입 엣지가 하나라도 있으면 매 step마다 propagation이 값을 덮어쓰므로
  // initialValue 슬라이더는 사용자에게 거짓 affordance가 된다.
  const hasLag0Incoming = modelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === id && e.lag === 0) return true;
    }
    return false;
  });

  // 좌표는 아래 가드 `!node || !node.position`이 통과해야만 의미를 갖는다.
  // hook 순서를 깨지 않기 위한 primitive 폴백 — 화면에는 도달하지 않는다.
  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const layout = useNodeLayout(node, { incomingCount });

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

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
    useEdgeDraftSource(id, { enabled: !!layout, getStartPoint: getOutputStartPoint });

  const commitLabel = useCallback(
    (next: string) => {
      if (node && next !== node.label) updateNode(id, { label: next });
      setEditingNode(null);
    },
    [id, node, setEditingNode, updateNode],
  );
  const cancelLabel = useCallback(() => setEditingNode(null), [setEditingNode]);

  const onValueAreaClick = useCallback(() => {
    selectNode(id);
    openUnitInspector(id);
  }, [id, openUnitInspector, selectNode]);

  const onSkinLabelClick = useCallback(() => {
    selectNode(id);
    openUnitInspector(id);
  }, [id, openUnitInspector, selectNode]);

  if (!node) return null;
  if (!isValueNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { halfW, halfH, width, height } = layout;
  const unit = resolveNodeUnit(node);

  // 입력성 노드(외부 입력이 없는 ValueNode)는 사용자가 의미를 직접 정한 값이라
  // focal 톤으로 강조. 나머지는 차분한 기본 톤.
  const isInputNode = !hasLag0Incoming;
  const isFocal = node.isFocal;
  const stateClass = isInputNode ? 'is-focal' : 'is-calm';

  const SkinLazy = node.skin ? getLazySkin(node.skin.kind) : null;
  const hasSkin = SkinLazy !== null;
  // 스킨 본체가 값 표시 + 슬라이더 핸들을 통합 표현한다. 외부 입력이 있으면
  // 직접 조작이 의미 없으므로 onScrub을 넘기지 않아 핸들이 비활성화된다.
  const skinScrub = hasSkin && !hasLag0Incoming
    ? (v: number) => scrubInitialValue(id, v)
    : undefined;

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      {hasSkin && SkinLazy ? (
        <ValueNodeSkin
          node={node}
          layout={layout}
          isSelected={isSelected}
          currentValue={currentValue}
          unit={unit}
          disabled={hasLag0Incoming}
          onScrub={skinScrub}
          onLabelClick={onSkinLabelClick}
          SkinLazy={SkinLazy}
        />
      ) : (
        <ValueNodeCard
          node={node}
          layout={layout}
          isSelected={isSelected}
          isEditing={isEditing}
          stateClass={stateClass}
          currentValue={currentValue}
          unit={unit}
          onCommitLabel={commitLabel}
          onCancelLabel={cancelLabel}
          onValueAreaClick={onValueAreaClick}
        />
      )}

      {isFocal && playbackStep !== null && (
        <text className="trama-node-step-overlay" x={halfW + 6} y={-halfH + 10}>
          step {playbackStep + 1} / {trajectoryLength}
        </text>
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
      {isInputNode && !isEditing && !hasSkin && (
        <NodeBorderTrack
          node={node}
          halfW={halfW}
          trackY={layout.trackY}
        />
      )}
    </NodeFrame>
  );
}

export const ValueNodeView = memo(ValueNodeViewImpl);
