import { memo, useCallback, useEffect } from 'react';
import { tokens } from '@trama/tokens';
import {
  isNumericValue,
  isOutputPending,
  isSequence,
  isValueNode,
  resolveScalar,
  unwrap,
  type NodeId,
} from '@trama/core';
import { useTrama } from '../store/index.js';
import { combinerRegistry } from '../store/registries.js';
import { formatNodeValue } from '../util/format.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { useNodeLayout } from './use-node-layout.js';
import type { NodeLayout } from './box.js';
import { resolveDisplayMode, supportsDisplayModeToggle } from './display-mode.js';
import { ValueNodeSlider } from './ValueNodeSlider.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { NodeLabel } from './NodeLabel.js';
import { ModeToggle } from './ModeToggle.js';
import { InteractiveArea } from './InteractiveArea.js';
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
  // 사용자 매뉴얼 송출기 UI 는 초기/재생/일시정지 모두 항상 노출한다. paused 중
  // 변경된 값은 ▶ 재진입 시 pausedTransitionHandler 가 snapshot 비교로 1회 송출
  // (model-store.ts) — 효과는 펄스 도착에서만 발현되어 trama 사상과 일치.
  const currentValue = modelStore((s) => {
    const n = s.model.nodes[id];
    const fallbackVal =
      n && isValueNode(n) && isNumericValue(n.initialValue) ? n.initialValue.n : 0;
    const ev = s.executionState.values[id];
    if (ev && !isSequence(ev)) {
      const v = unwrap(resolveScalar(ev, s.executionState.simulationTimeMs));
      if (isNumericValue(v)) return v.n;
    }
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

  // pending — 토폴로지 정상, 첫 신호 미도착. 멈춤 상태에서 엣지가 연결돼
  // initialValue 권위를 잃었지만 아직 어떤 펄스도 받지 못한 상태.
  const isPending = modelStore((s) => isOutputPending(s.executionState, id, 0));

  // 좌표는 아래 가드 `!node || !node.position`이 통과해야만 의미를 갖는다.
  // hook 순서를 깨지 않기 위한 primitive 폴백 — 화면에는 도달하지 않는다.
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

  const currentMode = node ? resolveDisplayMode(node) : 'standard';
  const onToggleMode = useCallback(() => {
    if (uiStore.getState().readOnly) return;
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, uiStore, updateNode]);

  if (!node) return null;
  if (!isValueNode(node)) return null;
  if (!node.position) return null;
  if (!layout) return null;

  const { halfW, halfH, width, height } = layout;
  const unit = resolveNodeUnit(node);

  // 입력성 노드(외부 입력이 없는 ValueNode)는 사용자가 의미를 직접 정한 값이라
  // focal 톤으로 강조. 나머지는 차분한 기본 톤.
  // pending 상태는 "토폴로지 정상, 첫 신호 미도착" — 점선 보더로 표준화한다.
  const isInputNode = !hasLag0Incoming;
  const isFocal = node.isFocal;
  const stateClass = isPending ? 'is-pending' : isInputNode ? 'is-focal' : 'is-calm';

  const SkinLazy = node.skin ? getLazySkin(node.skin.kind) : null;
  const hasSkin = SkinLazy !== null;
  // 스킨 본체가 값 표시 + 슬라이더 핸들을 통합 표현한다. 외부 입력이 있으면
  // 직접 조작이 의미 없으므로 onScrub을 넘기지 않아 핸들이 비활성화된다.
  const skinScrub = hasSkin && !hasLag0Incoming
    ? (v: number) => scrubInitialValue(id, v)
    : undefined;

  const isCompactNumeric =
    !hasSkin && currentMode === 'compact' && node.initialValue.kind === 'numeric';

  return (
    <NodeFrame
      id={id}
      pos={node.position}
      width={width}
      height={height}
      panelCx={layout.panelCx}
      panelCy={layout.panelCy}
      panelWidth={layout.panelWidth}
      panelHeight={layout.panelHeight}
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
      ) : isCompactNumeric ? (
        <NumericCompactBody
          layout={layout}
          isSelected={isSelected}
          isEditing={isEditing}
          stateClass={stateClass}
          label={node.label}
          currentValue={currentValue}
          unit={unit}
          onCommitLabel={commitLabel}
          onCancelLabel={cancelLabel}
          onValueAreaClick={onValueAreaClick}
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

      {supportsDisplayModeToggle(node) && !isEditing && (
        <ModeToggle
          panelRight={layout.panelCx + layout.panelWidth / 2}
          panelTop={layout.panelCy - layout.panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
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
      {isCompactNumeric && layout.hasCombiner && layout.combinerCenterY !== null && (
        <NumericCompactCombinerChip
          combinerKey={node.combiner}
          cy={layout.combinerCenterY}
        />
      )}
      {isInputNode && !isEditing && !hasSkin && !(isCompactNumeric && layout.hasCombiner) && (
        <ValueNodeSlider
          node={node}
          halfW={isCompactNumeric ? layout.panelWidth / 2 : halfW}
          sliderY={layout.sliderY}
          mode={isCompactNumeric ? 'compact' : 'standard'}
        />
      )}
    </NodeFrame>
  );
}

export const ValueNodeView = memo(ValueNodeViewImpl);

interface NumericCompactBodyProps {
  layout: NodeLayout;
  isSelected: boolean;
  isEditing: boolean;
  stateClass: string;
  label: string;
  currentValue: number;
  unit: ReturnType<typeof resolveNodeUnit>;
  onCommitLabel: (next: string) => void;
  onCancelLabel: () => void;
  onValueAreaClick: () => void;
}

/**
 * numeric ValueNode compact 본문.
 *
 * 패널 위 외곽 라벨 슬롯 + 패널 안 현재값(+단위) + 값 영역 클릭 hit. compact의
 * 라벨/슬라이더/combiner 분리 패턴은 boolean ValueNode와 동일 — 패널 *밖* 슬롯을
 * 활용해 패널 안을 "결과 단일 표현"만으로 유지한다.
 */
function NumericCompactBody({
  layout,
  isSelected,
  isEditing,
  stateClass,
  label,
  currentValue,
  unit,
  onCommitLabel,
  onCancelLabel,
  onValueAreaClick,
}: NumericCompactBodyProps): JSX.Element {
  const formatted = formatNodeValue(currentValue, unit);
  // compact는 "현재 값"만 노출이 규칙. scale 단위의 "/ max" 같은 척도 분모는
  // standard에서 맥락 정보로 보이지만 compact에서는 떼어낸다. 단위 suffix(kg 등)는
  // 값의 일부로 간주해 유지 — "현재값과 단위만"이 이전 합의.
  const compactAccessory = unit.kind === 'number' ? formatted.accessory : '';
  const isPending = stateClass === 'is-pending';
  return (
    <>
      <NodeBody
        width={layout.panelWidth}
        height={layout.panelHeight}
        cx={layout.panelCx}
        cy={layout.panelCy}
        stateClass={stateClass}
        isSelected={isSelected}
      />
      <NodeLabel
        text={label}
        x={layout.panelCx}
        y={layout.labelY}
        width={layout.panelWidth}
        textAnchor="middle"
        isEditing={isEditing}
        onCommit={onCommitLabel}
        onCancel={onCancelLabel}
      />
      <text
        className="trama-node-value is-compact"
        x={layout.panelCx}
        y={layout.panelCy}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {isPending ? (
          '…'
        ) : (
          <>
            {formatted.primary}
            {compactAccessory && (
              <tspan className="trama-node-unit" dx="6">
                {compactAccessory}
              </tspan>
            )}
          </>
        )}
      </text>
      <InteractiveArea
        x={layout.panelCx - layout.panelWidth / 2 + 8}
        y={layout.panelCy - layout.panelHeight / 2 + 8}
        width={layout.panelWidth - 16}
        height={layout.panelHeight - 16}
        hitClassName="trama-node-value-hit"
        onClick={onValueAreaClick}
      />
    </>
  );
}

/**
 * compact의 외곽 컨트롤 슬롯에 그리는 combiner 칩. 슬라이더 자리를 차지한다 —
 * lag=0 입력 2개 이상이면 사용자 직접 조작이 의미 없으므로 칩으로 자리 교체.
 */
function NumericCompactCombinerChip({
  combinerKey,
  cy,
}: {
  combinerKey: string;
  cy: number;
}): JSX.Element {
  const combiner = combinerRegistry.get(combinerKey);
  const label = combiner?.labels.ko ?? combinerKey;
  const symbol = combinerSymbol(combinerKey);
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
      <text
        className="trama-node-combiner-text"
        x={0}
        y={cy + fontSize / 3}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

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
