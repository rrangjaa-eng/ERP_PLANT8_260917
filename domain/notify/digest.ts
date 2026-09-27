// D-706 묶음 메일 모양(UI-SPEC 카피 계약) — 일반 텍스트, 인사·서명 없음.
// messages는 최신 먼저로 받고 순서를 바꾸지 않는다(04.2-10이 created_at DESC로 넘긴다).
// kstDate는 발송일이다. 본문 목록은 DIGEST_MAX_LISTED건까지 — 여러 날 쌓인 pending을
// 한 통에 모아도 메일 크기가 묶인다(Codex 3차).
export const DIGEST_MAX_LISTED = 20;

export function composeDigest(input: { kstDate: string; messages: readonly string[]; serviceUrl: string }): {
  subject: string;
  text: string;
} {
  const total = input.messages.length;
  // 항목 안 줄바꿈은 공백으로 — 본문 줄 위조 방지.
  const listed = input.messages
    .slice(0, DIGEST_MAX_LISTED)
    .map((message) => `- ${message.replace(/\r\n|\r|\n/g, " ")}`);
  const rest = total - listed.length;
  const lines = [
    `${input.kstDate} 알림 ${total}건`,
    "",
    ...listed,
    ...(rest > 0 ? [`외 ${rest}건은 알림함에서 확인`] : []),
    "",
    `알림함: ${input.serviceUrl}/notifications`,
  ];
  return { subject: `PLANT8 알림 ${total}건`, text: lines.join("\n") };
}
