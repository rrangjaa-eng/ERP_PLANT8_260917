// 04-04 Task 2 ③ — 요청 본문 크기 한도의 순수 판정 로직. `lib/actions/client.ts`의
// authedActionClient 미들웨어가 이 함수 하나만 부른다("정확히 한 자리").
// 이 파일 자체는 "server-only"/next 전용 API를 import하지 않는다 — action
// 계층("use server" 파일)은 vitest에서 직접 import할 수 없어(server-only
// 가드가 RSC 번들러 밖에서 즉시 throw한다) 판정 로직을 이렇게 분리해야
// 통합 테스트가 실제로 돌아간다.
export const MAX_ACTION_PAYLOAD_BYTES = 262_144; // 256KB

export type PayloadSizeCheck = { ok: true } | { ok: false; reason: string; bytes: number };

export function checkPayloadSize(payload: unknown, maxBytes: number = MAX_ACTION_PAYLOAD_BYTES): PayloadSizeCheck {
  const bytes = new TextEncoder().encode(JSON.stringify(payload ?? null)).length;
  if (bytes <= maxBytes) return { ok: true };
  const toKb = (n: number) => Math.ceil(n / 1024);
  return {
    ok: false,
    bytes,
    reason: `요청이 너무 큽니다 · ${toKb(bytes)}KB > ${toKb(maxBytes)}KB 한도 · 나눠서 저장해 주세요`,
  };
}
