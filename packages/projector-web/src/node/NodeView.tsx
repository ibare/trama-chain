import { memo } from 'react';
import { isValueNode, type NodeId } from '@trama/core';
import { useTrama } from '../store/index.js';
import { BooleanValueNodeView } from './BooleanValueNodeView.js';
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
 *
 * ValueKind 분기: 모델은 'value' kind 하나로 numeric/boolean ValueNode를 공유
 * 하지만, 표현은 단위·스킨·슬라이더가 의미를 갖느냐로 갈리므로 dispatcher가
 * initialValue.kind를 보고 별도 view로 라우팅한다.
 */
function NodeViewDispatchImpl({ id, incomingCount }: Props): JSX.Element | null {
  const { modelStore } = useTrama();
  const node = modelStore((s) => s.model.nodes[id]);
  if (!node) return null;
  if (isValueNode(node) && node.initialValue.kind === 'boolean') {
    return <BooleanValueNodeView id={id} incomingCount={incomingCount} />;
  }
  const ui = getNodeKindUI(node.kind);
  if (!ui) return null;
  const View = ui.View;
  return <View id={id} incomingCount={incomingCount} />;
}

export const NodeView = memo(NodeViewDispatchImpl);
