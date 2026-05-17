import { memo, useCallback, useEffect, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import { tokens } from '@trama/tokens';
import { isConstantNode, isNumericValue, numericValue, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { useNodeLayout } from './use-node-layout.js';
import { resolveDisplayMode } from './display-mode.js';
import { NodeFrame } from './NodeFrame.js';
import { NodeBody } from './NodeBody.js';
import { ModeToggle } from './ModeToggle.js';
import { BooleanStateIcon } from './BooleanStateIcon.js';
import { InlineSvgInput } from './InlineSvgInput.js';
import { Socket } from './Socket.js';
import { useOutputConnected } from './use-socket-connections.js';
import { useEdgeDraftSource } from '../canvas/use-edge-draft-source.js';

interface Props {
  id: NodeId;
}

const SOCKET_SIZE = parseFloat(tokens.spacing.socketSize);

function formatConstantValue(v: number): string {
  if (!Number.isFinite(v)) return '·';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return v.toExponential(3);
  if (abs >= 100) return v.toFixed(2);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(4);
}

function ConstantNodeViewImpl({ id }: Props): JSX.Element | null {
  const { modelStore, uiStore } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  const updateNode = modelStore((s) => s.updateNode);
  const selection = uiStore((s) => s.selection);
  const isEditing = uiStore((s) => s.editingNode?.id === id);
  const setEditingNode = uiStore((s) => s.setEditingNode);
  const outputConnected = useOutputConnected(id);

  const posX = node?.position?.x ?? 0;
  const posY = node?.position?.y ?? 0;
  const labelDraftSeed = node?.label ?? '';
  const constantNumeric =
    node && isConstantNode(node) && isNumericValue(node.value) ? node.value.n : 0;
  const isBooleanConstant =
    node && isConstantNode(node) && node.value.kind === 'boolean';
  const constantBoolean =
    node && isConstantNode(node) && node.value.kind === 'boolean'
      ? node.value.b
      : false;
  const valueDraftSeed = constantNumeric;
  const isCustom = node && isConstantNode(node) && (node.constantKey ?? '') === 'custom';

  const layout = useNodeLayout(node, {
    incomingCount: 0,
    displayMode: node ? resolveDisplayMode(node) : undefined,
  });

  const onBodyDoubleClick = useCallback(() => {
    setEditingNode(id);
  }, [id, setEditingNode]);

  const getOutputStartPoint = useCallback(() => {
    const out = layout?.rightPin.sockets[0];
    return out ? { x: posX + out.x, y: posY + out.y } : { x: posX, y: posY };
  }, [layout, posX, posY]);
  const { onPointerDown: onSocketPointerDown, onPointerUp: onSocketPointerUp } =
    useEdgeDraftSource(id, { getStartPoint: getOutputStartPoint });

  const [nameDraft, setNameDraft] = useState(labelDraftSeed);
  const [valueDraft, setValueDraft] = useState(String(valueDraftSeed));
  useEffect(() => {
    if (isEditing && node) {
      setNameDraft(node.label);
      if (isConstantNode(node) && isNumericValue(node.value)) {
        setValueDraft(String(node.value.n));
      }
    }
  }, [isEditing, node]);

  const currentMode = node ? resolveDisplayMode(node) : 'compact';
  const onToggleMode = useCallback(() => {
    updateNode(id, {
      displayMode: currentMode === 'compact' ? 'standard' : 'compact',
    });
  }, [currentMode, id, updateNode]);

  const commitEdit = useCallback(() => {
    if (!node || !isConstantNode(node)) {
      setEditingNode(null);
      return;
    }
    const patch: { label?: string; value?: ReturnType<typeof numericValue> } = {};
    const v = nameDraft.trim();
    if (v && v !== node.label) patch.label = v;
    if (isCustom && isNumericValue(node.value)) {
      const parsed = parseFloat(valueDraft);
      if (Number.isFinite(parsed) && parsed !== node.value.n) {
        patch.value = numericValue(parsed, node.value.unitId);
      }
    }
    if (Object.keys(patch).length > 0) {
      updateNode(id, patch);
    }
    setEditingNode(null);
  }, [id, isCustom, nameDraft, node, setEditingNode, updateNode, valueDraft]);

  if (!node || !isConstantNode(node) || !node.position || !layout) return null;

  const { width, height, labelY, valueY, panelCx, panelCy, panelWidth, panelHeight } = layout;
  const isSelected = selection.kind === 'node' && selection.id === id;
  const stateClass = 'is-focal';

  const valueText = isBooleanConstant
    ? null
    : formatConstantValue(constantNumeric);

  const out = layout.rightPin.sockets[0];

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
      className="trama-constant-node"
      onBodyDoubleClick={onBodyDoubleClick}
    >
      <NodeBody
        width={panelWidth}
        height={panelHeight}
        cx={panelCx}
        cy={panelCy}
        stateClass={stateClass}
        isSelected={isSelected}
      />

      <text
        className="trama-node-label"
        x={layout.labelAnchor === 'middle' ? panelCx : layout.textX}
        y={labelY}
        textAnchor={layout.labelAnchor}
      >
        {node.label}
      </text>

      {isEditing ? (
        <foreignObject
          x={panelCx - panelWidth / 2 + 10}
          y={panelCy - panelHeight / 2 + 6}
          width={panelWidth - 20}
          height={panelHeight - 12}
        >
          <Form.Root
            className="trama-constant-editor"
            onSubmit={(e) => e.preventDefault()}
          >
            <InlineSvgInput
              name="label"
              className="trama-node-name-input"
              value={nameDraft}
              autoFocus
              placeholder="라벨"
              onChange={setNameDraft}
              onCommit={commitEdit}
              onCancel={() => setEditingNode(null)}
              commitOnEnter={!isCustom}
            />
            {isCustom && (
              <InlineSvgInput
                name="value"
                className="trama-node-name-input"
                value={valueDraft}
                type="number"
                step="any"
                placeholder="수치"
                onChange={setValueDraft}
                onCommit={commitEdit}
                onCancel={() => setEditingNode(null)}
              />
            )}
          </Form.Root>
        </foreignObject>
      ) : isBooleanConstant ? (
        <BooleanStateIcon cx={panelCx} cy={valueY} on={constantBoolean} />
      ) : (
        <text
          className={`trama-node-value${currentMode === 'compact' ? ' is-compact' : ''}`}
          x={layout.labelAnchor === 'middle' ? panelCx : layout.textX}
          y={panelCy}
          textAnchor={layout.labelAnchor}
          dominantBaseline="central"
        >
          {valueText}
        </text>
      )}

      {out && (
        <>
          <Socket cx={out.x} cy={out.y} connected={outputConnected} />
          <circle
            className="trama-node-socket-hit"
            cx={out.x}
            cy={out.y}
            r={Math.max(SOCKET_SIZE, 12)}
            onPointerDown={onSocketPointerDown}
            onPointerUp={onSocketPointerUp}
          />
        </>
      )}

      {!isEditing && (
        <ModeToggle
          panelRight={panelCx + panelWidth / 2}
          panelTop={panelCy - panelHeight / 2}
          mode={currentMode}
          onToggle={onToggleMode}
        />
      )}
    </NodeFrame>
  );
}

export const ConstantNodeView = memo(ConstantNodeViewImpl);
