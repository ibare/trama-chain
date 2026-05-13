/**
 * fizzex 기반 동기 ExpressionEvaluator.
 *
 * 설계:
 *   - 식 LaTeX 1개당 parseLatex → AST + 정적 분석(바인딩/평가가능성)을 1회만 수행
 *     하고 cache에 보관. evaluate/diagnose/analyze가 같은 핸들을 공유한다.
 *   - 핫패스 evaluate는 fizzex.evaluateSync에 그대로 위임 (number | undefined).
 *   - 콜드패스 diagnose는 fizzex.evaluate(EvalResult)를 trama의 EvalDiagnosis로 변환.
 *   - analyze는 analyzeBindings + analyzeEvaluability를 결합.
 *
 * 호환:
 *   - 이전 export `extractVariables`는 binding.required 와 동일 (자유변수만).
 *   - 새 export `extractVariablesAndConstants`는 required + constants 둘 다 반환.
 */
import {
  parseLatex,
  evaluateSync,
  evaluate,
  analyzeBindings,
  analyzeEvaluability,
} from 'fizzex';
import type { RootNode } from 'fizzex';
import type {
  BindingAnalysis,
  EvaluabilityAnalysis,
  ExpressionEvaluator,
} from '@trama/core';

interface CompiledExpression {
  ast: RootNode | null;
  binding: BindingAnalysis;
  evaluability: EvaluabilityAnalysis;
}

const EMPTY_COMPILED: CompiledExpression = {
  ast: null,
  binding: { required: [], constants: [] },
  evaluability: { evaluable: false, unsupported: [] },
};

const cache = new Map<string, CompiledExpression>();

function compile(latex: string): CompiledExpression {
  const cached = cache.get(latex);
  if (cached) return cached;
  try {
    const result = parseLatex(latex);
    if (result.hasErrors || !result.ast || result.ast.children.length === 0) {
      cache.set(latex, EMPTY_COMPILED);
      return EMPTY_COMPILED;
    }
    const ast = result.ast;
    const binding = analyzeBindings(ast);
    const evaluability = analyzeEvaluability(ast);
    const compiled: CompiledExpression = { ast, binding, evaluability };
    cache.set(latex, compiled);
    return compiled;
  } catch {
    cache.set(latex, EMPTY_COMPILED);
    return EMPTY_COMPILED;
  }
}

/** 자유변수 이름 배열 (정규화·정렬·중복 제거). */
export function extractVariables(latex: string): string[] {
  return [...compile(latex).binding.required];
}

/** 자유변수 + 등장 상수 + 평가가능성을 한 번에 반환. */
export function extractVariablesAndConstants(
  latex: string,
): BindingAnalysis & EvaluabilityAnalysis {
  const { binding, evaluability } = compile(latex);
  return {
    required: binding.required,
    constants: binding.constants,
    evaluable: evaluability.evaluable,
    unsupported: evaluability.unsupported,
  };
}

export const fizzexExpressionEvaluator: ExpressionEvaluator = {
  evaluate(latex, variables) {
    const { ast } = compile(latex);
    if (!ast) return undefined;
    return evaluateSync(ast, variables);
  },
  diagnose(latex, variables) {
    const { ast } = compile(latex);
    if (!ast) {
      return { ok: false, status: 'unsupported', reason: 'parse-failed' };
    }
    const result = evaluate(ast, variables);
    if (result.ok) return { ok: true, value: result.value };
    return {
      ok: false,
      status: result.status,
      variable: result.detail?.variable,
      nodeType: result.detail?.nodeType,
      reason: result.detail?.reason,
    };
  },
  analyze(latex) {
    return extractVariablesAndConstants(latex);
  },
};
