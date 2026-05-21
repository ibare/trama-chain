import type { Node, Value } from '../../model/index.js';
import type { OutputInterpolation } from '../../generators/index.js';
import type { ResolvedUnit, UnitCatalog } from '../../units/index.js';
import type {
  PortTypeContext,
  PropagateContext,
} from './context.js';
import type { OutputSlotSpec, PortSpec } from './port-spec.js';

/**
 * 노드 종류별 동작을 한 곳에 모은 디스크립터.
 * 새 노드 종류 추가 시 디스크립터를 작성·등록하면 전파·초기화·피드백·단위
 * 해석이 모두 라우팅된다.
 */
export interface NodeKindDescriptor<N extends Node = Node> {
  kind: N['kind'];
  /** 초기 state.values에 기록할 Value. undefined면 미기록(propagate 단계에서 채움). */
  initialValue(node: N): Value | undefined;
  /**
   * 초기 validOutputs 에 포함시킬 슬롯 인덱스들. 단출력 노드의 즉시 valid 케이스는
   * `[0]`, 모든 슬롯 invalid 출발이면 `[]`. ConditionNode 처럼 슬롯별로 결정되는
   * 케이스를 일급화하기 위한 자리.
   */
  initialValidSlots(node: N): readonly number[];
  /** 이 노드의 출력 단위. raw 통과(outputsRaw=true)여도 시각화·클램프 폴백용으로 의미가 있다. */
  outputUnit(node: N, catalog: UnitCatalog): ResolvedUnit;
  /**
   * 이 노드가 받을 수 있는 입력 포트 명세 리스트. null 이면 입력을 받지 않는다
   * (예: Constant). 빈 배열은 의도된 "입력 슬롯은 있으나 어떤 spec 도 매칭 못함" —
   * 정상적으론 발생하지 않게 한다.
   *
   * 리스트의 모든 spec 은 OR 매칭 — source 의 출력 PortSpec 이 그 중 하나와
   * value(+meta) 가 일치하면 호환. Generator 같은 메타 인식 입력이 "boolean OR
   * numeric(meta:boolean)" 두 spec 을 동시에 advertise 하는 자리.
   *
   * passthrough 노드(ObserveNode)는 입력 엣지의 source spec 을 따라가야 하므로
   * optional ctx 로 모델·레지스트리를 받는다.
   */
  inputAccepts(node: N, ctx?: PortTypeContext): readonly PortSpec[] | null;
  /**
   * 이 노드의 출력 슬롯 명세. 인덱스 0..n-1 순서. 단출력 노드는 길이 1.
   * Condition 처럼 다출력은 [true 슬롯, false 슬롯] 형태로 P4 에서 정의된다.
   *
   * passthrough 노드는 입력 엣지의 source spec 을 따라가므로 ctx 가 필요하다.
   */
  outputSlots(node: N, ctx?: PortTypeContext): readonly OutputSlotSpec[];
  /**
   * 입력 PortType이 비결정적(passthrough 노드 + 입력 미연결 등)일 때 어떤 source든
   * 받아주겠다는 신호. ObserveNode가 입력 엣지가 없을 때 true를 반환해
   * 첫 연결을 자유롭게 허용한다. 일단 연결되면 false로 떨어져 inputAccepts 가
   * 잠긴 PortType을 반환한다. 미정의면 false 취급.
   */
  acceptsAnyInput?(node: N, ctx?: PortTypeContext): boolean;
  /**
   * 이 노드를 source로 두는 엣지가 raw passthrough인지.
   * true면 ValueNode 타깃의 normalize/shape/denormalize 파이프라인이 우회되고
   * 타깃의 단위 클램프도 건너뛴다 (예: 함수 결과 1760이 cm[0..250]에 짓이겨지지 않게).
   */
  outputsRaw: boolean;
  /** lag=1 feedback 엣지의 target이 될 수 있는지. */
  canBeFeedbackTarget: boolean;
  /**
   * 이 노드 출력의 시간 분포 본질 — 시각화 측에서 두 emit 사이를 lerp할지
   * 결정한다. 미정의면 'continuous' 취급(기존 노드의 안전한 기본).
   *
   * - 'continuous': 매끄러운 변화 — 시각화가 wallTime 비율로 lerp 가능.
   * - 'discrete': 이산 이벤트(step·pulse·schedule 등). 보간하면 sharp 전환이
   *   부드러워져 의도가 왜곡되므로 즉시 전환이어야 한다.
   *
   * 모델·실행 계층은 이 플래그를 read-only로 노출만 한다. 보간 정책은 시각 계층 책임.
   *
   * **ctx 옵션**: passthrough 노드(Observe·Condition 등) 가 자기 입력 source 의
   * outputInterpolation 을 mirror 하기 위해 model·registry 가 필요하다. 정적 호출
   * (paradigm 단독 판정) 은 ctx 없이도 답할 수 있도록 optional. inputAccepts·
   * outputSlots·acceptsAnyInput 와 같은 시그니처 패턴.
   */
  outputInterpolation?(node: N, ctx?: PortTypeContext): OutputInterpolation;
  /**
   * lag=0 전파. incoming을 보고 next[node.id]·validOutputs를 갱신.
   * incoming이 비어 있고 디스크립터가 외부 입력이 없는 종류면 기존 값을 유지하는 것이 일반적.
   *
   * **Passthrough echo 시맨틱 (Observe·Condition 등)**:
   *   본체가 입력을 그대로 통과시키는 디스크립터는 `ctx.next[node.id]` 에 *source
   *   ExecValue 의 본질을 그대로 흘려보낸다* — FunctionHandle / WrappedValue (alue
   *   자리에 핸들 포함 가능) / Value 모두 동일 인스턴스를 echo 하거나, 자기 책임의
   *   부가 작업(예: Condition 의 cond 메타 부착) 만 envelope 으로 덧대고 alue·핸들은
   *   보존. *환원은 값을 봐야 하는 자리에서만* — observeBuffer 누적, 조건 비교, 시각
   *   normalize 등. 이렇게 두면 sin 같은 continuous source 의 시간 의존 closure 가
   *   passthrough 체인 끝까지 살아 다운스트림 시각(sparkline dense peek, cable medium)
   *   이 source 본질에 일관된다.
   *
   *   환원 표준 패턴: `unwrap(resolveScalar(ev, ctx.simulationTimeMs))`. resolveScalar
   *   가 wrapped 내부 핸들까지 단일 자리에서 환원한다. 디스크립터가 직접 핸들 케이스를
   *   분기 처리하지 않아도 된다.
   */
  propagate(node: N, ctx: PropagateContext): void;
}
