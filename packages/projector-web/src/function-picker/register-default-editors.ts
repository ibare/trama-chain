import { registerShapeEditor } from './editor-registry.js';
import { LinearCurveEditor } from './LinearCurveEditor.js';
import { ThresholdCurveEditor } from './ThresholdCurveEditor.js';
import { DiminishingCurveEditor } from './DiminishingCurveEditor.js';
import { AcceleratingCurveEditor } from './AcceleratingCurveEditor.js';
import { InverseUCurveEditor } from './InverseUCurveEditor.js';
import { PiecewiseEditor } from './PiecewiseEditor.js';
import { StochasticEditor } from './StochasticEditor.js';

/**
 * 기본 7개 shape의 인라인 편집기 등록.
 *
 * Side-effect import: FunctionPicker가 레지스트리를 조회하기 전에 등록이
 * 끝나야 하므로 모듈 최상위에서 즉시 호출.
 */
registerShapeEditor('linear', LinearCurveEditor);
registerShapeEditor('threshold', ThresholdCurveEditor);
registerShapeEditor('diminishing', DiminishingCurveEditor);
registerShapeEditor('accelerating', AcceleratingCurveEditor);
registerShapeEditor('inverseU', InverseUCurveEditor);
registerShapeEditor('piecewise', PiecewiseEditor);
registerShapeEditor('stochastic', StochasticEditor);
