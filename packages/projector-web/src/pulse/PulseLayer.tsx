import { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { tokens } from '@trama-chain/tokens';
import { useTrama } from '../store/index.js';
import type { Pulse } from './pulse-registry.js';
import { cablePointAt } from '../edge/cable-physics.js';

const CORE_RADIUS = parseFloat(tokens.spacing.pulseCoreRadius);
const HALO_RADIUS = parseFloat(tokens.spacing.pulseHaloRadius);

/**
 * 활성 펄스를 SVG로 렌더링. <Canvas>의 컨텐츠 그룹 안에 위치해 viewport 변환을
 * 함께 받는다. 펄스 set이 바뀌면 React가 element를 spawn/remove하고, 위치는
 * 매 프레임 imperative하게 refs로 갱신해 React 리렌더링 없이 흐르게 한다.
 */
function PulseLayerImpl(): JSX.Element {
  const { pulseRegistry, cableRegistry } = useTrama();
  // 펄스 set 변화에 React 리렌더 (spawn/remove). getActive는 캐싱된 스냅샷을
  // 반환하므로 spawn/remove가 일어나기 전까지는 동일 참조 → 안정.
  const pulses = useSyncExternalStore(
    pulseRegistry.subscribeList,
    pulseRegistry.getActive,
    pulseRegistry.getActive,
  );

  // 각 펄스 SVG element ref. key=pulse.id로 안정.
  const refs = useRef<Map<string, { core: SVGCircleElement; halo: SVGCircleElement }>>(
    new Map(),
  );

  // 매 프레임 펄스 위치 업데이트.
  useEffect(() => {
    const tick = (): void => {
      const now = performance.now();
      for (const p of pulseRegistry.getActive()) {
        const els = refs.current.get(p.id);
        if (!els) continue;
        const cable = cableRegistry.get(p.edgeId);
        if (!cable) continue;
        const t = pulseRegistry.pulseProgress(p, now);
        const pt = cablePointAt(cable, t);
        els.core.setAttribute('cx', String(pt.x));
        els.core.setAttribute('cy', String(pt.y));
        els.halo.setAttribute('cx', String(pt.x));
        els.halo.setAttribute('cy', String(pt.y));
      }
    };
    return pulseRegistry.subscribeTick(tick);
  }, [cableRegistry, pulseRegistry]);

  // 첫 좌표 — mount 시 1프레임이라도 정확히 그리도록 init position 계산.
  const initialPositions = useMemo(() => {
    const now = performance.now();
    const m = new Map<string, { x: number; y: number }>();
    for (const p of pulses) {
      const cable = cableRegistry.get(p.edgeId);
      if (!cable) {
        m.set(p.id, { x: 0, y: 0 });
        continue;
      }
      m.set(p.id, cablePointAt(cable, pulseRegistry.pulseProgress(p, now)));
    }
    return m;
  }, [cableRegistry, pulseRegistry, pulses]);

  return (
    <g className="trama-pulse-layer">
      {pulses.map((p: Pulse) => {
        const init = initialPositions.get(p.id) ?? { x: 0, y: 0 };
        const setRef = (kind: 'core' | 'halo') => (el: SVGCircleElement | null) => {
          const existing = refs.current.get(p.id);
          if (el) {
            const next = existing ?? ({ core: el, halo: el } as { core: SVGCircleElement; halo: SVGCircleElement });
            next[kind] = el;
            refs.current.set(p.id, next);
          } else if (existing) {
            // 한쪽만 unmount되는 경우는 없지만 양쪽 다 사라지면 정리.
            refs.current.delete(p.id);
          }
        };
        return (
          <g key={p.id}>
            <circle
              ref={setRef('halo')}
              className="trama-pulse-halo"
              cx={init.x}
              cy={init.y}
              r={HALO_RADIUS}
            />
            <circle
              ref={setRef('core')}
              className="trama-pulse-core"
              cx={init.x}
              cy={init.y}
              r={CORE_RADIUS}
            />
          </g>
        );
      })}
    </g>
  );
}

export const PulseLayer = memo(PulseLayerImpl);
