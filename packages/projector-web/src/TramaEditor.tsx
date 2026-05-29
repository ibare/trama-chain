import { useEffect, useRef, useState } from 'react';
import * as Form from '@radix-ui/react-form';
import {
  TramaParseError,
  documentToModel,
  modelToDocument,
  parseTrama,
  serializeTrama,
} from '@trama-chain/core';
import './styles.css';
import { Canvas } from './canvas/Canvas.js';
import { CanvasResizeHandle } from './canvas/CanvasResizeHandle.js';
import { FunctionPicker } from './function-picker/FunctionPicker.js';
import { UnitInspectorLayer } from './node/UnitInspectorLayer.js';
import { BooleanInspectorLayer } from './node/BooleanInspectorLayer.js';
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
  /**
   * 캔버스 휠 줌 모드. 기본 'modifier'.
   * - 'modifier': ctrl/meta 누른 휠만 줌. 그 외 휠은 호스트로 전파 — Tiptap 등
   *   임베드 환경에서 호스트 페이지 스크롤이 캔버스 위에서 끊기지 않게 한다.
   * - 'always': 모든 휠이 줌. 캔버스가 페이지 전체를 차지하는 풀스크린
   *   (Playground 등)에서 자연스러운 동작.
   * - 'never': 줌 비활성. 휠은 호스트로 그대로 전파. 정적 시연 용도.
   */
  wheelZoom?: 'modifier' | 'always' | 'never';
  /**
   * 캔버스 마운트 시 1회 자동 정렬. 기본 'none'.
   * - 'content': 노드 위치 평균을 캔버스 중앙으로 끌어와 panX/panY 보정. 가변 폭
   *   호스트에 임베드된 시연 모델이 좌상단으로 쏠리는 걸 막는다.
   * - 'none': 보정 없음. 빈 캔버스로 시작하는 Playground 동작.
   * 사용자가 한 번 패닝/줌하면 이후엔 적용되지 않는다 (mount-only one-shot).
   */
  initialFit?: 'content' | 'none';
  /**
   * 캔버스 높이(px) — controlled. 호스트가 값을 들고 onHeightChange 로 갱신을 받는다.
   * 정의되면 root 인라인 height + 하단 resize 핸들 노출. 미정의면 부모 컨테이너에
   * 위임(height:100% via base.css) + 핸들 비노출 — 풀스크린 사용 케이스.
   *
   * trama 는 height 를 영속하지 않는다 — 호스트(Tiptap attrs, 별도 store 등)의
   * 책임. 마크다운 round-trip 권장 포맷은 fence info-string 의 Pandoc 스타일
   * `\`\`\`trama {height=N}` — host-tiptap 의 parseTramaFenceMeta 헬퍼 참고.
   */
  height?: number;
  /** height 변경 콜백. resize 핸들 mouseup 시 클램프된 최종값 1회. */
  onHeightChange?: (height: number) => void;
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

function TramaEditorInner({
  value,
  onChange,
  options,
  readOnly = false,
  wheelZoom = 'modifier',
  initialFit = 'none',
  height,
  onHeightChange,
}: Props): JSX.Element {
  const { modelStore, uiStore } = useTrama();
  const setModel = modelStore((s) => s.setModel);
  const model = modelStore((s) => s.model);
  const setQuestion = modelStore((s) => s.setQuestion);
  const setReadOnly = uiStore((s) => s.setReadOnly);
  const setWheelZoom = uiStore((s) => s.setWheelZoom);
  const isReadOnly = uiStore((s) => s.readOnly);
  const rootRef = useRef<HTMLDivElement>(null);

  // readOnly prop을 UI store에 동기화. mount + prop 변경 시.
  useEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly, setReadOnly]);

  // wheelZoom prop을 UI store에 동기화.
  useEffect(() => {
    setWheelZoom(wheelZoom);
  }, [wheelZoom, setWheelZoom]);

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
    <div
      data-trama-root
      data-trama-readonly={isReadOnly ? 'true' : undefined}
      ref={rootRef}
      style={height != null ? { height } : undefined}
    >
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

      <Canvas initialFit={initialFit} />
      {!isReadOnly && <FunctionPicker />}
      {!isReadOnly && <UnitInspectorLayer />}
      {!isReadOnly && <BooleanInspectorLayer />}
      {!isReadOnly && <ExecutionControl />}
      {!isReadOnly && <MiniPlayer />}
      {height != null && onHeightChange != null && !isReadOnly && (
        <CanvasResizeHandle
          committedHeight={height}
          onCommit={onHeightChange}
          rootRef={rootRef}
        />
      )}
    </div>
  );
}
