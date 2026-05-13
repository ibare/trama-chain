import { useEffect, useRef, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import {
  TramaParseError,
  documentToModel,
  modelToDocument,
  parseTrama,
  serializeTrama,
} from '@trama/core';
import './styles.css';
import { Canvas } from './canvas/Canvas.js';
import { FunctionPicker } from './function-picker/FunctionPicker.js';
import { UnitInspectorLayer } from './node/UnitInspectorLayer.js';
import { ExecutionControl } from './execution-control/ExecutionControl.js';
import { InsertNodeHandler } from './interactions/InsertNodeHandler.js';
import { useModelStore } from './store/index.js';
import { combinerRegistry, shapeRegistry } from './store/registries.js';

export interface EditorOptions {
  /** 자동 저장 디바운스. ms. 기본 1500. */
  autosaveDebounceMs?: number;
}

interface Props {
  initialJson: string;
  onChange?: (json: string) => void;
  options?: EditorOptions;
}

export function TramaEditor({ initialJson, onChange, options }: Props): JSX.Element {
  const setModel = useModelStore((s) => s.setModel);
  const model = useModelStore((s) => s.model);
  const setQuestion = useModelStore((s) => s.setQuestion);

  // initialJson이 바뀌거나(라우트 id 변경) store가 교체될 때마다(HMR이 모듈을
  // 재평가해 setModel 참조가 바뀔 때) 다시 로드한다. loadedRef로 영구 차단하면
  // HMR 후 store가 새 빈 모델(새 id, question=null)로 리셋되고 그 상태가
  // 디바운스 onChange를 통해 그대로 저장되어 새 "제목 없는 모델"이 매번 생긴다.
  useEffect(() => {
    try {
      const doc = parseTrama(initialJson, { shapeRegistry, combinerRegistry });
      setModel(documentToModel(doc));
    } catch (e) {
      if (e instanceof TramaParseError) {
        // eslint-disable-next-line no-console
        console.warn('TramaEditor: failed to parse initial JSON', e);
      }
    }
  }, [initialJson, setModel]);

  const debounceMs = options?.autosaveDebounceMs ?? 1500;
  const lastEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onChange) return;
    const timer = setTimeout(() => {
      const json = serializeTrama(modelToDocument(model));
      if (json !== lastEmittedRef.current) {
        lastEmittedRef.current = json;
        onChange(json);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [model, onChange, debounceMs]);

  const [editingQuestion, setEditingQuestion] = useState(false);

  return (
    <div data-trama-root>
      {model.question != null && !editingQuestion ? (
        <div
          className="trama-question"
          onDoubleClick={() => setEditingQuestion(true)}
          style={{ pointerEvents: 'auto' }}
        >
          {model.question}
        </div>
      ) : editingQuestion ? (
        <Form.Root
          className="trama-question"
          style={{ pointerEvents: 'auto' }}
          onSubmit={(e) => e.preventDefault()}
        >
          <Form.Field name="question">
            <Form.Control
              autoFocus
              className="trama-node-name-input"
              defaultValue={model.question ?? ''}
              onBlur={(e) => {
                setQuestion(e.currentTarget.value.trim() || null);
                setEditingQuestion(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingQuestion(false);
              }}
              style={{ width: 'min(520px, 60vw)' }}
            />
          </Form.Field>
        </Form.Root>
      ) : null}

      <Canvas />
      <FunctionPicker />
      <UnitInspectorLayer />
      <ExecutionControl />
      <InsertNodeHandler />
    </div>
  );
}
