import * as Popover from '@radix-ui/react-popover';
import * as Separator from '@radix-ui/react-separator';
import { useCallback, useMemo } from 'react';
import type { ValueNode } from '@trama-chain/core';
import { useTrama } from '../store/index.js';
import { listSkinsForValueKind } from '../skin/registry.js';
import type { SkinDefinition } from '../skin/types.js';
import { TramaCardStrip } from '../util/TramaCardStrip.js';
import { PhosphorIcon } from '../icon/phosphor.js';

interface Props {
  /** BooleanInspector 는 boolean ValueNode 전용. 호출처에서 initialValue.kind === 'boolean' 가드. */
  node: ValueNode;
}

/**
 * boolean ValueNode 의 스킨 선택 패널.
 *
 * UnitInspector 와 분리한 이유 — boolean 은 단위·범위 개념이 없어 패널 구성이
 * 단순(스킨 카드 + 해제만). 한 패널에 분기 로직을 두면 두 종류의 노드 흐름이
 * 서로의 코드 경로에 새기 때문에 별도 컴포넌트로 둔다.
 */
export function BooleanInspector({ node }: Props): JSX.Element {
  const { modelStore, timeSettingsStore } = useTrama();
  const updateNode = modelStore((s) => s.updateNode);
  const paused = timeSettingsStore((s) => s.paused);

  const skinCandidates = useMemo<SkinDefinition[]>(
    () => listSkinsForValueKind('boolean'),
    [],
  );
  const currentSkinKey = node.skin?.kind ?? null;

  const onPickSkin = useCallback(
    (key: string) => {
      const def = skinCandidates.find((d) => d.key === key);
      if (!def) return;
      const initialParams = {
        ...(def.defaultParams ? def.defaultParams() : {}),
        scale: def.defaultScale,
      };
      updateNode(node.id, {
        skin: { kind: def.key, params: initialParams },
      });
    },
    [node.id, skinCandidates, updateNode],
  );

  const onClearSkin = useCallback(() => {
    updateNode(node.id, { skin: undefined });
  }, [node.id, updateNode]);

  return (
    <>
      <header className="trama-unit-inspector-header">
        <span>스킨</span>
        <Popover.Close className="trama-unit-inspector-close" aria-label="닫기">
          ×
        </Popover.Close>
      </header>

      {skinCandidates.length > 0 ? (
        <>
          <Separator.Root
            className="trama-unit-inspector-sep"
            decorative
            orientation="horizontal"
          />
          <div className="trama-unit-inspector-skins">
            <div className="trama-unit-inspector-section-row">
              <span className="trama-unit-inspector-section-label">스킨</span>
              {currentSkinKey && (
                <button
                  type="button"
                  className="trama-unit-inspector-clear"
                  onClick={onClearSkin}
                  disabled={!paused}
                >
                  해제
                </button>
              )}
            </div>
            <TramaCardStrip
              ariaLabel="스킨"
              value={currentSkinKey}
              onValueChange={onPickSkin}
              disabled={!paused}
              items={skinCandidates.map((s) => ({
                key: s.key,
                label: s.labels.ko,
                icon: s.icon ? <PhosphorIcon name={s.icon} size={28} /> : undefined,
              }))}
            />
          </div>
        </>
      ) : (
        <div className="trama-unit-inspector-empty">사용 가능한 스킨이 없습니다.</div>
      )}
    </>
  );
}
