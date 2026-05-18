import type { GeneratorParams, Value } from '../model/index.js';
import { counterParadigm } from './counter.js';
import { uniformParadigm } from './uniform.js';
import { normalParadigm } from './normal.js';
import { sineParadigm } from './sine.js';
import { stepParadigm } from './step.js';
import { pulseParadigm } from './pulse.js';
import { scheduleParadigm } from './schedule.js';
import type { GeneratorCursor, GeneratorParadigm, GeneratorRuntime } from './types.js';

/**
 * 패러다임 레지스트리 — kind('counter'·'uniform'·'normal'·...)로 paradigm을 조회.
 *
 * 새 패러다임 추가 시 paradigm 객체 한 개 + GeneratorParams sum type에 case 추가 +
 * GeneratorCursor sum type에 cursor case 추가만으로 라우팅이 완성된다.
 */
export class GeneratorRegistry {
  private readonly map = new Map<GeneratorParams['kind'], GeneratorParadigm>();

  register(paradigm: GeneratorParadigm): this {
    this.map.set(paradigm.kind, paradigm);
    return this;
  }

  get(kind: GeneratorParams['kind']): GeneratorParadigm | undefined {
    return this.map.get(kind);
  }

  /** params에 맞는 paradigm을 찾아 cursor 초기값 생성. 미등록이면 throw. */
  initCursor(params: GeneratorParams, simulationTimeMs: number = 0): GeneratorCursor {
    const p = this.map.get(params.kind);
    if (!p) throw new Error(`GeneratorRegistry: unknown paradigm "${params.kind}"`);
    return p.initCursor(params as never, simulationTimeMs);
  }

  /** params·cursor로 한 번 emit. cursor.kind와 params.kind가 불일치면 cursor를 재초기화. */
  emit(
    params: GeneratorParams,
    cursor: GeneratorCursor,
    simulationTimeMs: number,
  ): { value: Value | undefined; nextCursor: GeneratorCursor } {
    const p = this.map.get(params.kind);
    if (!p) throw new Error(`GeneratorRegistry: unknown paradigm "${params.kind}"`);
    // 패러다임이 바뀌어 cursor 모양이 다르면(사용자가 params.kind를 바꾼 직후) 재초기화.
    const c =
      cursor.kind === params.kind
        ? cursor
        : p.initCursor(params as never, simulationTimeMs);
    return p.emit(params as never, c as never, simulationTimeMs);
  }

  /** cursor를 진행시키지 않고 다음 emit 값만 본다. emit과 동일 라우팅. */
  peek(
    params: GeneratorParams,
    cursor: GeneratorCursor,
    simulationTimeMs: number,
  ): Value | undefined {
    const p = this.map.get(params.kind);
    if (!p) throw new Error(`GeneratorRegistry: unknown paradigm "${params.kind}"`);
    const c =
      cursor.kind === params.kind
        ? cursor
        : p.initCursor(params as never, simulationTimeMs);
    return p.peek(params as never, c as never, simulationTimeMs);
  }
}

export function createDefaultGeneratorRegistry(): GeneratorRegistry {
  return new GeneratorRegistry()
    .register(counterParadigm)
    .register(uniformParadigm)
    .register(normalParadigm)
    .register(sineParadigm)
    .register(stepParadigm)
    .register(pulseParadigm)
    .register(scheduleParadigm);
}

/** 라이브러리 내부 폴백 — 옵션 미주입 경로에서 사용된다. */
export const defaultGeneratorRegistry = createDefaultGeneratorRegistry();

/**
 * paradigm 변경 같은 외부 이벤트 후 runtime을 재정합화하기 위한 헬퍼.
 * params.kind와 cursor.kind가 다르면 cursor를 paradigm.initCursor로 재초기화.
 */
export function ensureRuntimeMatchesParams(
  runtime: GeneratorRuntime,
  params: GeneratorParams,
  registry: GeneratorRegistry = defaultGeneratorRegistry,
): GeneratorRuntime {
  if (runtime.cursor.kind === params.kind) return runtime;
  return { enabled: runtime.enabled, cursor: registry.initCursor(params) };
}
