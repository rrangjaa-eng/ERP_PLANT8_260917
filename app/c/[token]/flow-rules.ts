// 04.3-03 Task 2a ③ · 2b ② · 04.3-15 — 외부 수령자 흐름의 순수 판정. 브라우저 API를
// 부르지 않는다(단위 테스트가 node 환경에서 그대로 부른다). 기록 단계는 E′2(pick) ·
// E4(form) · 결과(result) — 명단 · 확인 단계는 없다(5909578685).

export type HistoryStep = "pick" | "form" | "result";
export type HistoryRender = "E2′" | "E4" | "result";

const RENDER_OF: Record<HistoryStep, HistoryRender> = { pick: "E2′", form: "E4", result: "result" };

// 고아 기록 항목: 화면이 E′2가 아닌 기록 항목 위에 있는데 메모리에 그 단계가 없으면(앞으로 가기 ·
// 새로 고침 · bfcache 복원) E′2를 그리고 history.back()으로 E′2 항목에 돌아간다(replaceState로 바꾸면
// E′2 항목이 둘이 된다).
export function resolveHistoryEntry(input: {
  stateStep: HistoryStep | null;
  memoryStep: HistoryStep | null;
}): { render: HistoryRender; back: boolean } {
  if (input.stateStep === null || input.stateStep === "pick") return { render: "E2′", back: false };
  if (input.stateStep === input.memoryStep) return { render: RENDER_OF[input.stateStep], back: false };
  return { render: "E2′", back: true };
}

// 확정 판정 — 멱등 키를 끝낸다. throttled는 넣지 않는다(결과 불명 쪽 — 같은 키로 다시 보낸다, E26).
const DEFINITE_KINDS = new Set([
  "saved",
  "invalid",
  "rrnRecheck",
  "closed",
  "notFound",
  "notYetOpen",
  "prizeGone",
  "termsChanged",
]);

type ActionResultLike = { data?: { kind?: string; [field: string]: unknown } | null; validationErrors?: unknown; serverError?: unknown } | undefined;

// 확정 판정(DEFINITE_KINDS · 입력 거부)만 멱등 키를 끝낸다. throttled · serverError(잠금 · 풀 시간
// 초과 포함) · 연결 끊김 · 모르는 응답은 결과 불명 — 같은 키로 다시 보낸다.
export function isDefiniteResult(result: ActionResultLike): boolean {
  if (!result) return false;
  if (result.validationErrors) return true;
  const kind = result.data?.kind;
  return typeof kind === "string" && DEFINITE_KINDS.has(kind);
}

// 04.3-16 — E′2로 돌아갈 때 남길 값. 경품 빠짐 · 「다른 경품 고르기」(표시를 남긴 history.back())는 같은 사람의 값이라
// 주소만 버리고(전달 방식이 바뀌었을 수 있다) 나머지 · 서명은 남긴다. 표시 없는 뒤로(브라우저 뒤로 · 폰 뒤로 몸짓)는 전부 버린다.
export function draftAfterPrizeGone<T extends { address: string }>(draft: T): T {
  return { ...draft, address: "" };
}

export function draftAfterBack<T extends { address: string }>(input: { draft: T; empty: T; keep: boolean }): T {
  return input.keep ? draftAfterPrizeGone(input.draft) : input.empty;
}

// 04.3-06 — 되물음(rrnRecheck)을 받은 요청이 보낸 주민등록번호(armedRrn)와 지금
// 두 칸 값이 같을 때만 「그대로 제출」 표시를 싣는다. 직전 결과를 보지 않으므로
// 사이에 결과 불명이 끼어도 같은 값이면 같은 본문이다(같은 키 재전송).
export function nextRrnRecheckConfirmed(input: { armedRrn: string | null; rrn: string }): boolean {
  return input.armedRrn !== null && input.armedRrn === input.rrn;
}

export type SubmitField = "name" | "rrn" | "address" | "phone" | "consent" | "signature";

// 액션 입력 스키마의 칸 이름 → domain invalid 칸 이름. E4 시각 순서다.
const SCHEMA_FIELD_ORDER: readonly [string, SubmitField][] = [
  ["name", "name"],
  ["rrnFront6", "rrn"],
  ["rrnBack7", "rrn"],
  ["address", "address"],
  ["phone", "phone"],
  ["consent", "consent"],
  ["signaturePngBase64", "signature"],
];

// next-safe-action validationErrors(zod 거절)를 domain invalid와 같은 갈래로 바꾼다.
// 수령자가 고칠 칸이 없는 거절(경품 id · 멱등 키 · 안내 판처럼 페이지가 만든 값만)과 해석할 수 없는
// 값은 null(결과 불명 줄 — 값을 잃지 않는 쪽, 갈래 화면은 04.3-16).
export function submitOutcomeFromValidationErrors(
  validationErrors: unknown,
): { kind: "invalid"; fields: SubmitField[] } | null {
  if (typeof validationErrors !== "object" || validationErrors === null) return null;
  const errors = validationErrors as Record<string, { _errors?: unknown } | undefined>;
  const fields: SubmitField[] = [];
  for (const [schemaKey, field] of SCHEMA_FIELD_ORDER) {
    const list = errors[schemaKey]?._errors;
    if (Array.isArray(list) && list.length > 0 && !fields.includes(field)) fields.push(field);
  }
  return fields.length > 0 ? { kind: "invalid", fields } : null;
}

// E4 제출 막힘 이유 — 빈 칸만 나열하고 마지막 항목의 받침에 맞춰 을/를을 붙인다.
export function submitBlockedReason(missing: readonly string[]): string | undefined {
  if (missing.length === 0) return undefined;
  if (missing.length === 1 && missing[0] === "서명") return "서명을 해 주세요";
  const last = missing[missing.length - 1] ?? "";
  const code = last.charCodeAt(last.length - 1) - 0xac00;
  const particle = code >= 0 && code <= 11171 && code % 28 !== 0 ? "을" : "를";
  return `${missing.join(" · ")}${particle} 채우면 제출할 수 있습니다`;
}

// 제출 멱등 키 — crypto.randomUUID가 없는 브라우저(iOS Safari 15.4 미만 · 옛 Android WebView)는 getRandomValues로
// 만든 UUID v4로 대신한다. 없으면 제출이 보내기 전에 던진다(PR #88 /review F9).
export function randomIdemKey(
  source: { getRandomValues: Crypto["getRandomValues"]; randomUUID?: () => string } = crypto,
): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
