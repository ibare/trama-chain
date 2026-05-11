// 짧고 사람이 읽을 수 있는 ID. 충돌 가능성은 v1 단일 사용자 환경에서 무시 가능.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    out += ALPHABET[idx];
  }
  return out;
}

export function makeModelId(): string {
  return `mdl-${randomSuffix(6)}`;
}

export function makeNodeId(): string {
  return `n-${randomSuffix(6)}`;
}

export function makeEdgeId(): string {
  return `e-${randomSuffix(6)}`;
}
