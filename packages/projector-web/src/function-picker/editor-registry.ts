import type { ComponentType } from 'react';
import type { Edge } from '@trama/core';

/**
 * Shape key → 인라인 편집기 컴포넌트 매핑.
 *
 * FunctionPicker는 edge.shape.kind를 이 레지스트리에서 찾아 그대로 렌더한다.
 * 등록이 없으면 ShapeParamEditor(paramFields 기반 number input)가 폴백으로 붙는다.
 *
 * 새 shape이 추가될 때:
 *   1) core에 ShapeDefinition 등록 (compute/previewPath/paramFields)
 *   2) projector-web에서 인라인 편집기를 만들고 이 레지스트리에 register
 *  paramFields만으로 충분하면 register 자체를 생략해도 동작.
 */

export interface ShapeEditorProps {
  edge: Edge;
}

export type ShapeEditorComponent = ComponentType<ShapeEditorProps>;

const editors = new Map<string, ShapeEditorComponent>();

export function registerShapeEditor(
  kind: string,
  component: ShapeEditorComponent,
): void {
  editors.set(kind, component);
}

export function getShapeEditor(kind: string): ShapeEditorComponent | undefined {
  return editors.get(kind);
}
