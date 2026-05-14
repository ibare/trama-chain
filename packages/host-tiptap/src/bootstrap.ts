/**
 * trama 호스트 통합용 1회 셋업 훅.
 *
 * 현재는 no-op. 향후 unit catalog/skin registry 등 호스트 실행 시점에
 * 정적 등록할 게 생기면 여기에 모은다. FACET·aperi21의 bootstrapFacet /
 * bootstrapAperi21와 동일한 자리 — 호스트 진입점에서 1회 호출 컨벤션이 정해져
 * 있으므로 미래 확장을 위해 지금부터 export.
 */
let bootstrapped = false;

export function bootstrapTrama(): void {
  if (bootstrapped) return;
  bootstrapped = true;
}
