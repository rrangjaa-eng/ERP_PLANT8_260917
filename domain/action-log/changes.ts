import { isDeepStrictEqual } from "node:util";

// 07-04(R5): 행동 로그 `detail.changes = {칸: [이전, 이후]}`를 만드는 도우미.
// 바뀐 칸만, 전부 싣는다(자르기는 읽는 쪽 몫 — 07-25 detail-lines). 민감 칸은 원값이 반환값에 들어가지 않는다.
export type SensitiveMode = "last4" | "changed";

const CHANGED_LABEL = "바뀜";

export function maskLast4(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return CHANGED_LABEL;
  return `····${digits.slice(-4)}`;
}

function maskValue(value: unknown, mode: SensitiveMode): string {
  if (mode === "last4" && typeof value === "string") return maskLast4(value);
  return CHANGED_LABEL;
}

// JSON 동치 비교 — 키 순서가 달라도 같은 객체이고, undefined는 null로 본다.
function sameValue(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
}

export function buildChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  sensitive?: Partial<Record<string, SensitiveMode>>,
): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    const prev = before[key] ?? null;
    const next = after[key] ?? null;
    if (sameValue(prev, next)) continue;
    const mode = sensitive?.[key];
    changes[key] = mode ? [prev === null ? null : maskValue(prev, mode), next === null ? null : maskValue(next, mode)] : [prev, next];
  }
  return changes;
}
