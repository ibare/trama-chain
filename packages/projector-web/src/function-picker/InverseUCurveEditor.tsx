import { useCallback, useMemo, useRef } from 'react';
import type { Edge } from '@trama/core';
import { useModelStore } from '../store/index.js';
import { resolveNodeUnit } from '../util/unit-resolver.js';
import { formatNodeValue } from '../util/format.js';

interface Props {
  edge: Edge;
}

interface InverseUParams {
  peak: number;
  width: number;
  height: number;
}

const VIEW_W = 300;
const VIEW_H = 200;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 28;
const PAD_B = 28;
const PLOT_W = VIEW_W - PAD_L - PAD_R;
const PLOT_H = VIEW_H - PAD_T - PAD_B;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * inverseU 전용 직접조작 에디터.
 *
 * A 노드(from) 단위를 x축, B 노드(to) 단위를 y축으로 한 도메인 좌표계 위에
 * 종 모양 곡선과 두 핸들(피크·폭)을 그린다.
 *
 * - 피크 핸들 드래그 → peak·height 동시 갱신 (좌우=A상 위치, 상하=B상 높이)
 * - 폭 핸들 드래그   → width 갱신 (피크에서의 수평 거리만 의미 있음)
 *
 * 곡선 토폴로지는 항상 종 모양으로 유지 — 사용자는 "어디서 피크가 뜨고
 * 얼마나 넓게 떨어지는가"만 결정한다.
 */
export function InverseUCurveEditor({ edge }: Props): JSX.Element | null {
  const updateEdge = useModelStore((s) => s.updateEdge);
  const model = useModelStore((s) => s.model);

  const fromNode = model.nodes[edge.from];
  const toNode = model.nodes[edge.to];

  const aUnit = useMemo(() => (fromNode ? resolveNodeUnit(fromNode) : null), [fromNode]);
  const bUnit = useMemo(() => (toNode ? resolveNodeUnit(toNode) : null), [toNode]);

  const params = edge.shape.params as Partial<InverseUParams>;
  const peak = typeof params.peak === 'number' ? clamp01(params.peak) : 0.5;
  const width = typeof params.width === 'number' ? Math.max(0.02, params.width) : 0.35;
  const height = typeof params.height === 'number' ? clamp01(params.height) : 1;

  const xN2Px = useCallback((xn: number) => PAD_L + xn * PLOT_W, []);
  const yN2Px = useCallback((yn: number) => PAD_T + (1 - yn) * PLOT_H, []);

  const curvePath = useMemo(() => {
    const STEPS = 64;
    const parts: string[] = [];
    const sigma = Math.max(0.001, width);
    for (let i = 0; i <= STEPS; i++) {
      const xn = i / STEPS;
      const z = (xn - peak) / sigma;
      const yn = clamp01(height * Math.exp(-(z * z)));
      parts.push(`${i === 0 ? 'M' : 'L'} ${xN2Px(xn).toFixed(2)} ${yN2Px(yn).toFixed(2)}`);
    }
    return parts.join(' ');
  }, [peak, width, height, xN2Px, yN2Px]);

  const peakPx = { x: xN2Px(peak), y: yN2Px(height) };
  // 폭 핸들은 1-시그마 지점에 둔다 (y = height/e). 시각적으로 곡선 위에 정확히 앉음.
  const widthXn = Math.min(1, peak + width);
  const widthYn = clamp01(height * Math.exp(-1));
  const widthPx = { x: xN2Px(widthXn), y: yN2Px(widthYn) };

  const dragRef = useRef<'peak' | 'width' | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const commit = useCallback(
    (next: Partial<InverseUParams>) => {
      updateEdge(
        edge.id,
        {
          shape: {
            kind: 'inverseU',
            params: { peak, width, height, ...next },
          },
        },
        'change-shape',
        '곡선 조정',
      );
    },
    [edge.id, peak, width, height, updateEdge],
  );

  const localFromEvent = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const lx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const ly = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    return { x: lx, y: ly };
  }, []);

  const onHandleDown = (which: 'peak' | 'width') => (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = which;
  };

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const which = dragRef.current;
      if (!which) return;
      const local = localFromEvent(e);
      if (!local) return;
      const xn = clamp01((local.x - PAD_L) / PLOT_W);
      const yn = clamp01(1 - (local.y - PAD_T) / PLOT_H);
      if (which === 'peak') {
        commit({ peak: xn, height: yn });
      } else {
        const dist = Math.max(0.02, Math.abs(xn - peak));
        commit({ width: dist });
      }
    },
    [commit, peak, localFromEvent],
  );

  const onUp = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 이미 release된 경우 무시
    }
    dragRef.current = null;
  };

  if (!fromNode || !toNode || !aUnit || !bUnit) return null;

  // 도메인 라벨 (축 끝점)
  const aMinLbl = formatNodeValue(aUnit.min, aUnit);
  const aMaxLbl = formatNodeValue(aUnit.max, aUnit);
  const bMinLbl = formatNodeValue(bUnit.min, bUnit);
  const bMaxLbl = formatNodeValue(bUnit.max, bUnit);

  const peakAVal = aUnit.min + peak * (aUnit.max - aUnit.min);
  const peakBVal = bUnit.min + height * (bUnit.max - bUnit.min);
  const peakALbl = formatNodeValue(peakAVal, aUnit);
  const peakBLbl = formatNodeValue(peakBVal, bUnit);

  return (
    <div className="trama-curve-editor" style={{ gridColumn: '1 / -1' }}>
      <svg
        ref={svgRef}
        width={VIEW_W}
        height={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onPointerMove={onMove}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ touchAction: 'none', display: 'block' }}
      >
        {/* 축 */}
        <line
          className="trama-curve-axis"
          x1={PAD_L}
          y1={VIEW_H - PAD_B}
          x2={VIEW_W - PAD_R}
          y2={VIEW_H - PAD_B}
        />
        <line
          className="trama-curve-axis"
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={VIEW_H - PAD_B}
        />

        {/* x축 도메인 라벨 (A: from 노드) */}
        <text
          className="trama-curve-axis-label"
          x={PAD_L}
          y={VIEW_H - 8}
          textAnchor="start"
        >
          {aMinLbl.primary}
          {aUnit.kind === 'number' ? aMinLbl.accessory : ''}
        </text>
        <text
          className="trama-curve-axis-label"
          x={VIEW_W - PAD_R}
          y={VIEW_H - 8}
          textAnchor="end"
        >
          {aMaxLbl.primary}
          {aUnit.kind === 'number' ? aMaxLbl.accessory : ''}
        </text>
        <text
          className="trama-curve-axis-name"
          x={(PAD_L + VIEW_W - PAD_R) / 2}
          y={VIEW_H - 8}
          textAnchor="middle"
        >
          {fromNode.label}
        </text>

        {/* y축 도메인 라벨 (B: to 노드) */}
        <text
          className="trama-curve-axis-label"
          x={PAD_L - 6}
          y={VIEW_H - PAD_B}
          textAnchor="end"
        >
          {bMinLbl.primary}
        </text>
        <text
          className="trama-curve-axis-label"
          x={PAD_L - 6}
          y={PAD_T + 4}
          textAnchor="end"
        >
          {bMaxLbl.primary}
        </text>
        <text
          className="trama-curve-axis-name"
          x={4}
          y={PAD_T + PLOT_H / 2}
          textAnchor="start"
        >
          {toNode.label}
        </text>

        {/* 가이드 라인 (피크 위치) */}
        <line
          className="trama-curve-guide"
          x1={peakPx.x}
          y1={peakPx.y}
          x2={peakPx.x}
          y2={VIEW_H - PAD_B}
        />
        <line
          className="trama-curve-guide"
          x1={PAD_L}
          y1={peakPx.y}
          x2={peakPx.x}
          y2={peakPx.y}
        />

        {/* 곡선 */}
        <path d={curvePath} className="trama-curve-line" />

        {/* 폭 핸들 (피크 오른쪽 1-시그마 지점) */}
        <circle
          className="trama-curve-handle is-secondary"
          cx={widthPx.x}
          cy={widthPx.y}
          r={6}
          onPointerDown={onHandleDown('width')}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {/* 피크 핸들 */}
        <circle
          className="trama-curve-handle"
          cx={peakPx.x}
          cy={peakPx.y}
          r={8}
          onPointerDown={onHandleDown('peak')}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />

        {/* 피크 좌표 라벨 */}
        <text
          className="trama-curve-handle-label"
          x={peakPx.x}
          y={Math.max(PAD_T - 8, peakPx.y - 14)}
          textAnchor="middle"
        >
          {peakALbl.primary}
          {peakALbl.accessory ? ` ${peakALbl.accessory}` : ''} →{' '}
          {peakBLbl.primary}
          {peakBLbl.accessory ? ` ${peakBLbl.accessory}` : ''}
        </text>
      </svg>
    </div>
  );
}
