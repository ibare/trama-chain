import { useId, useMemo } from 'react';

/**
 * CRT scope 내부에 그릴 sin 파형 — bloom·halo·core 3겹 stroke 로 인광 잔상을
 * 표현한다. 좌상단(0,0) 기준 w×h 영역을 채우고, 진폭은 ampMax 에 맞춰
 * 세로로 정규화된다. 시간 윈도우(tWindowS) 만큼의 sin(omega · t) 를 샘플링.
 *
 * CrtScope children 으로 들어가는 것을 전제로 자체 transform 은 하지 않고,
 * (0,0) ~ (w,h) 좌표계에 직접 그린다.
 */
export interface WaveformProps {
  w: number;
  h: number;
  amplitude: number;
  omega: number;
  tWindowS: number;
  ampMax?: number;
  samples?: number;
}

const DEFAULT_AMP_MAX = 1;
const DEFAULT_SAMPLES = 120;
const VERTICAL_PAD = 3;

export function Waveform({
  w,
  h,
  amplitude,
  omega,
  tWindowS,
  ampMax = DEFAULT_AMP_MAX,
  samples = DEFAULT_SAMPLES,
}: WaveformProps) {
  const uid = useId();
  const bloomBlurId = `${uid}-bloom`;
  const haloBlurId = `${uid}-halo`;
  const d = useMemo(() => {
    const yMid = h / 2;
    const yRange = h / 2 - VERTICAL_PAD;
    const ampNorm = ampMax > 0 ? amplitude / ampMax : 0;
    const yScale = yRange * ampNorm;
    let path = '';
    for (let i = 0; i < samples; i++) {
      const u = i / (samples - 1);
      const t = u * tWindowS;
      const x = u * w;
      const y = yMid - yScale * Math.sin(omega * t);
      path += i === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)}` : ` L${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return path;
  }, [w, h, amplitude, omega, tWindowS, ampMax, samples]);
  return (
    <g pointerEvents="none">
      <defs>
        <filter id={bloomBlurId} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <filter id={haloBlurId} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="rgba(80,255,140,0.5)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${bloomBlurId})`}
      />
      <path
        d={d}
        fill="none"
        stroke="rgba(170,255,190,0.85)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${haloBlurId})`}
      />
      <path
        d={d}
        fill="none"
        stroke="#f0fff5"
        strokeWidth={0.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
