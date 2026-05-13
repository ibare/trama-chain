import { memo, Suspense, useCallback, useEffect, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import { tokens } from '@trama/tokens';
import { isValueNode, type NodeId } from '@trama/core';
import { useModelStore, useUIStore } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { formatNodeValue } from '../util/format.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { getNodeLayout } from './box.js';
import { NodeBorderTrack } from './NodeBorderTrack.js';
import { NodeFrame } from './NodeFrame.js';
import { InteractiveArea } from './InteractiveArea.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { registerInputSocket } from '../canvas/socket-registry.js';
import { completeEdgeDraft } from '../canvas/edge-draft-actions.js';
import { getLazySkin } from '../skin/registry.js';
import '../skin/register-default-skins.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

const CARD_CORNER = parseFloat(tokens.spacing.cardCornerRadius);
const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function combinerSymbol(key: string): string {
  switch (key) {
    case 'sum':
      return '+';
    case 'product':
      return '×';
    case 'average':
      return 'Ø';
    case 'max':
      return '↑';
    default:
      return '·';
  }
}

function ValueNodeViewImpl({ id, incomingCount }: Props): JSX.Element | null {
  const node = useModelStore((s) => s.model.nodes[id]);
  const currentValue = useModelStore((s) => {
    const n = s.model.nodes[id];
    const fallback = n && isValueNode(n) ? n.initialValue : 0;
    return s.executionState.values[id] ?? fallback;
  });

  const updateNode = useModelStore((s) => s.updateNode);
  const scrubInitialValue = useModelStore((s) => s.scrubInitialValue);
  const outputConnected = useOutputConnected(id);
  const playbackStep = useModelStore((s) => s.playbackStep);
  const trajectoryLength = useModelStore((s) => s.trajectory.length);
  const selectNode = useUIStore((s) => s.selectNode);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditingNode = useUIStore((s) => s.setEditingNode);
  const startEdgeDraft = useUIStore((s) => s.startEdgeDraft);
  const openUnitInspector = useUIStore((s) => s.openUnitInspector);
  const isSelected = useUIStore(
    (s) => s.selection.kind === 'node' && s.selection.id === id,
  );

  // lag=0 인입 엣지가 하나라도 있으면 매 step마다 propagation이 값을 덮어쓰므로
  // initialValue 슬라이더는 사용자에게 거짓 affordance가 된다.
  const hasLag0Incoming = useModelStore((s) => {
    for (const eid of s.model.edgeOrder) {
      const e = s.model.edges[eid];
      if (e && e.to === id && e.lag === 0) return true;
    }
    return false;
  });

  const labelDraftSeed = node?.label ?? '';
  const pos = node?.position ?? { x: 200, y: 200 };

  // 인라인 편집 중에는 drag 시작을 막아 input 포커스가 끊기지 않게.
  const canStartDrag = useCallback(() => editingNodeId !== id, [editingNodeId, id]);

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  // 좌측 핀(입력) snap 후보 등록. ValueNode는 slot 개념이 없고 combiner로 묶이므로
  // slotIndex 없이 등록한다. 좌측 핀 중심은 항상 (-halfW, 0)로 incomingCount와 무관.
  useEffect(() => {
    if (!node || !isValueNode(node)) return;
    const layoutNow = getNodeLayout(node, { incomingCount });
    const unreg = registerInputSocket({
      nodeId: id,
      offset: { x: layoutNow.leftPin.cx, y: layoutNow.leftPin.cy },
    });
    return unreg;
  }, [id, incomingCount, node]);

  const onSocketPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!node) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const lag: 0 | 1 = e.altKey ? 1 : 0;
      const layoutNow = getNodeLayout(node, { incomingCount });
      const out = layoutNow.rightPin.sockets[0];
      const startPoint = out
        ? { x: pos.x + out.x, y: pos.y + out.y }
        : { x: pos.x, y: pos.y };
      startEdgeDraft({ fromNodeId: id, startPoint, pointer: startPoint, lag });
    },
    [id, incomingCount, node, pos.x, pos.y, startEdgeDraft],
  );

  const onSocketPointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    completeEdgeDraft({ dropScreen: { x: e.clientX, y: e.clientY } });
  }, []);

  const [nameDraft, setNameDraft] = useState(labelDraftSeed);
  useEffect(() => {
    if (editingNodeId === id && node) setNameDraft(node.label);
  }, [editingNodeId, id, node]);

  const commitName = useCallback(() => {
    if (!node) {
      setEditingNode(null);
      return;
    }
    const v = nameDraft.trim();
    if (v && v !== node.label) updateNode(id, { label: v }, 'rename-node', '이름 변경');
    setEditingNode(null);
  }, [id, nameDraft, node, setEditingNode, updateNode]);

  if (!node) return null;
  if (!isValueNode(node)) return null;

  const layout = getNodeLayout(node, { incomingCount });
  const { halfW, halfH, width, height } = layout;
  const unit = resolveNodeUnit(node);

  // 입력성 노드(외부 입력이 없는 ValueNode)는 사용자가 의미를 직접 정한 값이라
  // focal 톤으로 강조. 나머지는 차분한 기본 톤.
  const isInputNode = !hasLag0Incoming;
  const isFocal = node.isFocal;
  const stateClass = isInputNode ? 'is-focal' : 'is-calm';

  const formatted = formatNodeValue(currentValue, unit);
  const combiner = combinerRegistry.get(node.combiner);
  const combinerLabel = combiner?.labels.ko ?? node.combiner;
  const combinerSym = combinerSymbol(node.combiner);

  const SkinLazy = node.skin ? getLazySkin(node.skin.kind) : null;
  const hasSkin = SkinLazy !== null;
  // 스킨 본체가 값 표시 + 슬라이더 핸들을 통합 표현한다. 외부 입력이 있으면
  // 직접 조작이 의미 없으므로 onScrub을 넘기지 않아 핸들이 비활성화된다.
  const skinScrub = hasSkin && !hasLag0Incoming
    ? (v: number) => scrubInitialValue(id, v)
    : undefined;
  // 라벨 영역 클릭 = 선택 + 단위/스킨 인스펙터 진입. 스킨이 라벨 InteractiveArea를
  // 통해 호출한다.
  const onSkinLabelClick = useCallback(() => {
    selectNode(id);
    openUnitInspector(id);
  }, [id, openUnitInspector, selectNode]);

  return (
    <NodeFrame
      id={id}
      pos={pos}
      width={width}
      height={height}
      canStartDrag={canStartDrag}
      onBodyDoubleClick={onBodyDoubleClick}
    >
      {hasSkin && SkinLazy ? (
        // 스킨 모드: 카드 배경·라벨·값·combiner·슬라이더 트랙 모두 그리지 않는다.
        // 노드 영역 자체가 스킨의 시각 형상이고, NodeFrame이 잡은 drag-hit가
        // 본문 영역을 점유한다.
        <>
          <Suspense fallback={null}>
            <SkinLazy
              node={node}
              value={currentValue}
              unit={unit}
              halfW={halfW}
              halfH={halfH}
              onScrub={skinScrub}
              disabled={hasLag0Incoming}
              onLabelClick={onSkinLabelClick}
            />
          </Suspense>
          {/* 공통 원형 보더 — 평소 invisible, 선택 시 stroke로 시각화.
              엣지 앵커가 정렬되는 silhouette이고, 사용자가 노드 선택 상태를
              인지하는 단일 진실. 모든 스킨에 동일 추상으로 적용된다. */}
          {layout.skinBorder && (
            <circle
              className={`trama-skin-border${isSelected ? ' is-selected' : ''}`}
              cx={layout.skinBorder.cx}
              cy={layout.skinBorder.cy}
              r={layout.skinBorder.r}
              pointerEvents="none"
            />
          )}
        </>
      ) : (
        <>
          <rect
            className={`trama-node-body ${stateClass}${isSelected ? ' is-selected' : ''}`}
            x={-halfW}
            y={-halfH}
            width={width}
            height={height}
            rx={CARD_CORNER}
            ry={CARD_CORNER}
          />
          {editingNodeId === id ? (
            <foreignObject
              x={layout.textX}
              y={layout.labelY - 14}
              width={width - (layout.textX - -halfW) * 2}
              height={26}
            >
              <Form.Root onSubmit={(e) => e.preventDefault()}>
                <Form.Field name="label">
                  <Form.Control
                    className="trama-node-name-input"
                    value={nameDraft}
                    autoFocus
                    onChange={(e) => setNameDraft(e.currentTarget.value)}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitName();
                      if (e.key === 'Escape') setEditingNode(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </Form.Field>
              </Form.Root>
            </foreignObject>
          ) : (
            <text
              className="trama-node-label"
              x={layout.textX}
              y={layout.labelY}
              textAnchor="start"
            >
              {node.label}
            </text>
          )}

          <text
            className="trama-node-value"
            x={layout.textX}
            y={layout.valueY}
            textAnchor="start"
          >
            {formatted.primary}
            {formatted.accessory && (
              <tspan className="trama-node-unit" dx="6">
                {formatted.accessory}
              </tspan>
            )}
          </text>
          {/* 값+단위 영역을 InteractiveArea로 — 클릭 시 단위 인스펙터, 선택은 직접 처리. */}
          <InteractiveArea
            x={layout.textX}
            y={layout.valueY - 32}
            width={width - 36}
            height={44}
            hitClassName="trama-node-value-hit"
            onClick={() => {
              selectNode(id);
              openUnitInspector(id);
            }}
          />

          {layout.hasCombiner && layout.combinerCenterY !== null && (
            <CombinerChip
              symbol={combinerSym}
              label={combinerLabel}
              cy={layout.combinerCenterY}
            />
          )}
        </>
      )}

      {isFocal && playbackStep !== null && (
        <text className="trama-node-step-overlay" x={halfW + 6} y={-halfH + 10}>
          step {playbackStep + 1} / {trajectoryLength}
        </text>
      )}

      {/* 좌측 소켓은 incomingCount만큼 connected, 그 외(0 입력시 fallback 1개)는 비어있음. */}
      {layout.leftPin.sockets.map((s, i) => (
        <Socket key={`l${i}`} cx={s.x} cy={s.y} connected={i < incomingCount} />
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
      {isInputNode && editingNodeId !== id && !hasSkin && (
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

function CombinerChip({
  symbol,
  label,
  cy,
}: {
  symbol: string;
  label: string;
  cy: number;
}): JSX.Element {
  const text = `${symbol} ${label}`;
  const paddingX = parseFloat(tokens.spacing.combinerPaddingX);
  const fontSize = parseFloat(tokens.typography.textNodeUnit) * 16;
  const approxCharW = fontSize * 0.55;
  const innerW = text.length * approxCharW;
  const w = innerW + paddingX * 2;
  const h = parseFloat(tokens.spacing.combinerPaddingY) * 2 + fontSize + 2;
  const radius = Math.min(parseFloat(tokens.spacing.radiusCombiner), h / 2);
  return (
    <g pointerEvents="none">
      <rect
        className="trama-node-combiner"
        x={-w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
      />
      <text className="trama-node-combiner-text" x={0} y={cy + fontSize / 3} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}
