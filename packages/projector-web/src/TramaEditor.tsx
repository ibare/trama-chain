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
import { MiniPlayer } from './mini-player/MiniPlayer.js';
import {
  TramaInstanceProvider,
  createTramaInstance,
  useTrama,
  type TramaInstance,
} from './store/trama-instance.js';
import { combinerRegistry, shapeRegistry } from './store/registries.js';

export interface EditorOptions {
  /** 자동 저장 디바운스. ms. 기본 1500. */
  autosaveDebounceMs?: number;
}

interface Props {
  /**
   * Controlled: 직렬화된 trama JSON. 변경 시 내부 모델이 다시 로드된다.
   * onChange로 방금 발산한 echo와는 비교해 무시 — 외부 변경(호스트 undo 등)만 반영.
   */
  value: string;
  onChange?: (json: string) => void;
  options?: EditorOptions;
  /**
   * 읽기 전용 모드. true면 모든 변경 인터랙션이 잠긴다 (드래그·소켓·메뉴·편집 등).
   * pan/zoom·셀렉션·실행 시각화는 유지. 호스트(Tiptap 등) 임배딩에서 노드 뷰가
   * `editor.options.editable === false`일 때 켜는 용도.
   */
  readOnly?: boolean;
}

export function TramaEditor(props: Props): JSX.Element {
  // 인스턴스별 store/registry 컨테이너를 생성하여 한 페이지 N개의 에디터가
  // 서로 격리된 상태를 갖도록 한다. dispose는 unmount 시 RAF·구독을 정리.
  const [instance] = useState<TramaInstance>(() => createTramaInstance());
  useEffect(() => {
    return () => {
      instance.dispose();
    };
  }, [instance]);

  return (
    <TramaInstanceProvider instance={instance}>
      <TramaEditorInner {...props} />
    </TramaInstanceProvider>
  );
}

function TramaEditorInner({ value, onChange, options, readOnly = false }: Props): JSX.Element {
  const { modelStore, uiStore } = useTrama();
  const setModel = modelStore((s) => s.setModel);
  const model = modelStore((s) => s.model);
  const setQuestion = modelStore((s) => s.setQuestion);
  const setReadOnly = uiStore((s) => s.setReadOnly);
  const isReadOnly = uiStore((s) => s.readOnly);

  // readOnly prop을 UI store에 동기화. mount + prop 변경 시.
  useEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly, setReadOnly]);

  // controlled `value`를 source of truth로 둔다.
  // - mount + 외부 변경 시 parse → setModel
  // - 직전에 onChange로 발산한 echo는 lastEmittedRef와 동일하므로 skip (loop 차단)
  const lastEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    try {
      const doc = parseTrama(value, { shapeRegistry, combinerRegistry });
      setModel(documentToModel(doc));
    } catch (e) {
      if (e instanceof TramaParseError) {
        // eslint-disable-next-line no-console
        console.warn('TramaEditor: failed to parse value', e);
      }
    }
  }, [value, setModel]);

  const debounceMs = options?.autosaveDebounceMs ?? 1500;
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
    <div data-trama-root data-trama-readonly={isReadOnly ? 'true' : undefined}>
      {model.question != null && !editingQuestion ? (
        <div
          className="trama-question"
          onDoubleClick={() => {
            if (isReadOnly) return;
            setEditingQuestion(true);
          }}
          style={{ pointerEvents: 'auto' }}
        >
          {model.question}
        </div>
      ) : editingQuestion && !isReadOnly ? (
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
      {!isReadOnly && <FunctionPicker />}
      {!isReadOnly && <UnitInspectorLayer />}
      {!isReadOnly && <ExecutionControl />}
      {!isReadOnly && <MiniPlayer />}
    </div>
  );
}
