// 04-47(DR-16) — 합계 행 오른쪽 한 줄 조립. 순수 함수, React 없음.
// 항목을 danger → warning → muted 순서로 잇는다(같은 톤 안에서는 들어온 순서). 붙여넣기 묶음은 danger 뒤·붙여넣기 밖
// muted 앞에 한 덩어리로 서고, 머리 `붙여넣기 N줄` → warning 조각 → muted 조각 → `N쪽까지` 순서다. 조각이 하나도 없는
// 붙여넣기는 머리도 없다(그냥 붙여넣기는 조용하다). 저장 성공은 혼자 선다(나머지를 지운다).

export type FooterNoticeTone = "danger" | "warning" | "muted";

/**
 * `paste` — 붙여넣기 묶음의 머리(`붙여넣기 N줄`) · 조각 · 끝(`N쪽까지`). 없으면 붙여넣기 밖 항목.
 * `replacesIssueCount` — 이 항목이 이미 그 표의 오류·충돌 칸 수를 말한다(서버 거부 요약) — 표가 세는 `오류 N칸`을 더하지 않는다.
 */
export type FooterNoticeItem = {
  tone: FooterNoticeTone;
  text: string;
  paste?: "head" | "piece" | "reach";
  replacesIssueCount?: true;
};

export type FooterNoticePiece = { tone: FooterNoticeTone | "success"; text: string };

export function composeFooterNotice(
  items: readonly FooterNoticeItem[],
  opts: { successText?: string | null } = {},
): FooterNoticePiece[] {
  if (opts.successText) return [{ tone: "success", text: opts.successText }];
  const pick = (predicate: (item: FooterNoticeItem) => boolean) =>
    items.filter(predicate).map((item): FooterNoticePiece => ({ tone: item.tone, text: item.text }));
  const pasteBody = [
    ...pick((item) => item.paste === "piece" && item.tone !== "muted"),
    ...pick((item) => item.paste === "piece" && item.tone === "muted"),
    ...pick((item) => item.paste === "reach"),
  ];
  return [
    ...pick((item) => item.paste === undefined && item.tone === "danger"),
    ...pick((item) => item.paste === undefined && item.tone === "warning"),
    ...(pasteBody.length > 0 ? [...pick((item) => item.paste === "head"), ...pasteBody] : []),
    ...pick((item) => item.paste === undefined && item.tone === "muted"),
  ];
}
