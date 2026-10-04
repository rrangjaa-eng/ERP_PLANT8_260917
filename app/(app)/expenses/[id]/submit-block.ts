// 05-05(D2 Round 3 · UI-SPEC S6 「올리는 중」): 제출 1차를 막는 이유 한 곳. 올리는 행이 있는 동안 서버 첫 이유가 없거나
// ⑧(대상 evidence)이면 클라이언트 이유가 대신 선다 — 파일 완료 전에는 서버상 증빙이 0개라 ⑧이 틀린 안내가 되기 때문이다.
// 서버 ①~⑦ · ⑨는 기다려도 풀리지 않는 막힘이라 그대로 선다.

export const UPLOADING_REASON = "증빙 올리는 중 · 잠시 뒤 제출";

export type ServerBlock = { reason: string; target: string | null };
export type SubmitBlock = { reason: string; tone: "block" | "info"; target: string | null };

export function submitBlockReason(input: { server: ServerBlock | null; uploadingCount: number }): SubmitBlock | null {
  const { server, uploadingCount } = input;
  if (uploadingCount > 0 && (server === null || server.target === "evidence")) {
    return { reason: UPLOADING_REASON, tone: "info", target: null };
  }
  return server ? { reason: server.reason, tone: "block", target: server.target } : null;
}
