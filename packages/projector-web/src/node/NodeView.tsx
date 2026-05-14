import { memo } from 'react';
import type { NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { getNodeKindUI } from './kind-catalog.js';
import './register-default-kinds.js';

interface Props {
  id: NodeId;
  incomingCount: number;
}

/**
 * 노드 dispatcher — 카탈로그에서 kind 매칭으로 적절한 View 컴포넌트를 렌더.
 * 새 노드 종류 추가 시 register-default-kinds.ts에 디스크립터를 한 줄 추가하면
 * 자동으로 dispatcher·컨텍스트 메뉴가 인지한다.
 */
function NodeViewDispatchImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore } = useTrama();
  const kind = modelStore((s) => s.model.nodes[id]?.kind);
  if (!kind) return null;
  const ui = getNodeKindUI(kind);
  if (!ui) return null;
  const View = ui.View;
  return <View id={id} incomingCount={incomingCount} />;
}

export const NodeView = memo(NodeViewDispatchImpl);
