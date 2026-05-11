import { useEffect, useRef, useState } from 'react';
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

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
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
        <div className="trama-question" style={{ pointerEvents: 'auto' }}>
          <input
            autoFocus
            className="trama-node-name-input"
            defaultValue={model.question ?? ''}
            onBlur={(e) => {
              setQuestion(e.target.value.trim() || null);
              setEditingQuestion(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingQuestion(false);
            }}
            style={{ width: 'min(520px, 60vw)' }}
          />
        </div>
      ) : null}

      <Canvas />
      <FunctionPicker />
      <ExecutionControl />
      <InsertNodeHandler />
    </div>
  );
}
