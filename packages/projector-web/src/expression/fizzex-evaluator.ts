/**
 * fizzex 기반 동기 ExpressionEvaluator + 변수 추출기.
 *
 * 설계:
 *   - fizzex.parseLatex로 AST를 얻은 뒤, 표현식 트리를 자체 동기 평가기로 walking.
 *   - fizzex.evaluate(...)는 nerdamer 기반 비동기 CAS라 propagate(동기) 경로에 못 쓴다.
 *   - PoC 범위는 사칙연산, 분수, 거듭제곱, 괄호, 단항 부호, 그리고 일반적인
 *     단항 함수(sin/cos/tan/log/ln/exp/sqrt/abs). 그 외는 NaN을 반환해서
 *     디스크립터가 invalid로 처리하게 한다.
 */
import { parseLatex } from 'fizzex';
import type { MathNode, RootNode } from 'fizzex';
import type { ExpressionEvaluator } from '@trama/core';

/** 변수 이름이 등장 순서대로(중복 제거) 추출된 배열을 반환. */
export function extractVariables(latex: string): string[] {
  try {
    const result = parseLatex(latex);
    const seen = new Set<string>();
    const out: string[] = [];
    walkVariables(result.ast, (name) => {
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    });
    return out;
  } catch {
    return [];
  }
}

function walkVariables(node: MathNode | undefined, visit: (name: string) => void): void {
  if (!node) return;
  switch (node.type) {
    case 'variable':
      visit(node.name);
      return;
    case 'root':
    case 'row':
      node.children.forEach((c) => walkVariables(c, visit));
      return;
    case 'frac':
      node.numerator.forEach((c) => walkVariables(c, visit));
      node.denominator.forEach((c) => walkVariables(c, visit));
      return;
    case 'power':
      node.base.forEach((c) => walkVariables(c, visit));
      node.exponent.forEach((c) => walkVariables(c, visit));
      return;
    case 'paren':
    case 'abs':
      node.content.forEach((c) => walkVariables(c, visit));
      return;
    case 'sqrt':
      node.content.forEach((c) => walkVariables(c, visit));
      return;
    case 'func':
      node.argument.forEach((c) => walkVariables(c, visit));
      return;
    case 'subscript':
      // x_1 같은 첨자 변수는 base 이름만 단순 노출.
      node.base.forEach((c) => walkVariables(c, visit));
      return;
    default:
      return;
  }
}

/**
 * 수식 AST를 동기 평가. 평가 불가능하거나 비유한값이면 NaN.
 * 평가 순서: 좌→우, 일반 연산자 우선순위(*,/ > +,-).
 * 곱셈 묵음(인접 두 인자) 처리는 row 평가 안에서 구현.
 */
function evaluateNode(node: MathNode, vars: Record<string, number>): number {
  switch (node.type) {
    case 'number': {
      const n = parseFloat(node.value);
      return Number.isFinite(n) ? n : Number.NaN;
    }
    case 'variable': {
      const v = vars[node.name];
      return typeof v === 'number' ? v : Number.NaN;
    }
    case 'paren':
      return evaluateRow(node.content, vars);
    case 'abs':
      return Math.abs(evaluateRow(node.content, vars));
    case 'frac': {
      const num = evaluateRow(node.numerator, vars);
      const den = evaluateRow(node.denominator, vars);
      if (den === 0) return Number.NaN;
      return num / den;
    }
    case 'power': {
      const b = evaluateRow(node.base, vars);
      const e = evaluateRow(node.exponent, vars);
      return Math.pow(b, e);
    }
    case 'sqrt': {
      const c = evaluateRow(node.content, vars);
      if (node.index && node.index.length > 0) {
        const i = evaluateRow(node.index, vars);
        if (i === 0) return Number.NaN;
        return Math.pow(c, 1 / i);
      }
      return Math.sqrt(c);
    }
    case 'func':
      return applyFunc(node.name, evaluateRow(node.argument, vars));
    default:
      return Number.NaN;
  }
}

const FUNCS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  sqrt: Math.sqrt,
  abs: Math.abs,
};

function applyFunc(name: string, x: number): number {
  const fn = FUNCS[name];
  return fn ? fn(x) : Number.NaN;
}

/**
 * row(가로 나열) 평가. 토큰을 좌→우 스캔해 곱셈 묵음을 처리하면서
 * 표준 셰처 계산기처럼 +,- 우선순위 분리. 단항 +/-, 묵음 곱셈 포함.
 */
function evaluateRow(children: MathNode[], vars: Record<string, number>): number {
  type Token =
    | { kind: 'num'; value: number }
    | { kind: 'op'; op: '+' | '-' | '*' | '/' };

  // 1) 노드를 토큰열로 변환. 인접한 두 값 토큰 사이엔 묵음 곱셈을 삽입.
  const tokens: Token[] = [];
  let expectValue = true;
  for (const child of children) {
    if (child.type === 'operator') {
      const op = child.operator;
      if (op === '+' || op === '-') {
        if (expectValue) {
          // 단항 부호: 0과 op로 시작했다고 본다.
          tokens.push({ kind: 'num', value: 0 });
        }
        tokens.push({ kind: 'op', op });
        expectValue = true;
      } else if (op === '*' || op === '\\cdot' || op === '\\times' || op === '·') {
        tokens.push({ kind: 'op', op: '*' });
        expectValue = true;
      } else if (op === '/' || op === '\\div' || op === '÷') {
        tokens.push({ kind: 'op', op: '/' });
        expectValue = true;
      } else {
        // 미지 연산자 → 평가 실패 신호
        return Number.NaN;
      }
      continue;
    }
    if (!expectValue) {
      // 두 값 토큰이 연달아 오면 묵음 곱셈.
      tokens.push({ kind: 'op', op: '*' });
    }
    tokens.push({ kind: 'num', value: evaluateNode(child, vars) });
    expectValue = false;
  }

  if (tokens.length === 0) return 0;
  if (expectValue) return Number.NaN; // 댕글링 연산자

  // 2) *,/ 먼저 축약.
  const stage: Token[] = [];
  for (const t of tokens) {
    if (
      t.kind === 'op' && (t.op === '*' || t.op === '/') &&
      stage.length > 0 && stage[stage.length - 1]!.kind === 'num'
    ) {
      stage.push(t);
      continue;
    }
    if (
      stage.length >= 2 &&
      stage[stage.length - 1]!.kind === 'op' &&
      (stage[stage.length - 1] as { kind: 'op'; op: string }).op !== '+' &&
      (stage[stage.length - 1] as { kind: 'op'; op: string }).op !== '-' &&
      stage[stage.length - 2]!.kind === 'num' &&
      t.kind === 'num'
    ) {
      const op = (stage.pop() as { kind: 'op'; op: '*' | '/' }).op;
      const a = (stage.pop() as { kind: 'num'; value: number }).value;
      const b = t.value;
      const r = op === '*' ? a * b : b === 0 ? Number.NaN : a / b;
      stage.push({ kind: 'num', value: r });
      continue;
    }
    stage.push(t);
  }

  // 3) 좌→우 +,- 축약.
  let acc = 0;
  let pendingOp: '+' | '-' = '+';
  let started = false;
  for (const t of stage) {
    if (t.kind === 'num') {
      acc = started ? (pendingOp === '+' ? acc + t.value : acc - t.value) : t.value;
      started = true;
    } else if (t.op === '+' || t.op === '-') {
      pendingOp = t.op;
    }
  }
  return acc;
}

const cache = new Map<string, RootNode | null>();

function parseCached(latex: string): RootNode | null {
  if (cache.has(latex)) return cache.get(latex) ?? null;
  try {
    const result = parseLatex(latex);
    if (result.hasErrors) {
      cache.set(latex, null);
      return null;
    }
    cache.set(latex, result.ast);
    return result.ast;
  } catch {
    cache.set(latex, null);
    return null;
  }
}

export const fizzexExpressionEvaluator: ExpressionEvaluator = {
  evaluate(latex, variables) {
    const ast = parseCached(latex);
    if (!ast) return undefined;
    const out = evaluateRow(ast.children, variables);
    return Number.isFinite(out) ? out : undefined;
  },
};
